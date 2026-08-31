// ---------------------------------------------------------------------------
// A PvP room, as a state machine the referee drives.
//
// Wave 1 of docs/pvp-plan.md. Pure and framework-free: the referee bundles this, and so
// will the screens, exactly as `domain/run.ts` serves both sides of a Cup Run.
//
// THE ONE THING THAT SHAPES EVERYTHING HERE: THERE ARE NO TIMERS (plan P32).
//
// The obvious way to run a twenty-second pick clock is a `setTimeout` per player. It is
// also wrong, for reasons that only show up in production: in-memory timers die with the
// process, they cannot be shared by two referee instances during a rolling restart, and a
// room's whole state then lives somewhere a restart cannot recover. So a deadline here is
// DATA - `openedAt` on a window, plus the room's own clock length - and it is evaluated
// in exactly two places: when a pick arrives, and by a sweeper calling `tickRoom(room,
// now)` every second or two. That is correct across a restart by construction, because
// there is no state to lose.
//
// `now` is threaded through every function as an argument rather than read from the
// clock. It keeps the module pure and the checks deterministic (the same reason
// `applyRunResult` takes its timestamp), and it is what lets a check assert "this pick
// arrived 300ms late" without waiting 300ms.
//
// THE SECOND THING: A ROOM CANNOT STALL. Every phase has a deadline, not just the pick
// (P12, P30). A player who closes their laptop mid-draft has their XI completed; a player
// who never watches their match does not hold up the round. The failure this design is
// built against is one absent person freezing seven others, and the way it is avoided is
// that nothing ever waits for a human to report back.
// ---------------------------------------------------------------------------

import type { Player } from '../data/types';
import {
  FORMATIONS_DATA,
  getFormation,
  type FormationName,
  type Formation,
  type Style,
} from './formations';
import type { Filled } from './draft';
import { rollAny } from './draft';
import { HALF_TIME_MS, PEN_MS, STEP_MS, maxMinute, type MatchSpeed } from './clock';
import { resolveKoTie, type KoTieResult } from './knockout';
import { botName, botXi } from './pvpBot';
import { pick, shuffled } from './random';
import {
  autoPick,
  pvpPriceOf,
  pvpTeam,
  roomSquads,
  validateXi,
  type RoomRules,
} from './pvp';

// --- Constants -------------------------------------------------------------

/** The two clock lengths a host may choose (plan P20). Two values and not a slider, so a
 *  lobby listing can say fast or considered and a ladder can compare like with like. */
export const PICK_SECONDS = [20, 30] as const;
export type PickSeconds = (typeof PICK_SECONDS)[number];

/**
 * The money a budget room may be opened with.
 *
 * FIVE NAMED RUNGS RATHER THAN A SLIDER, for the reason `PICK_SECONDS` has two: a lobby row
 * has to be able to say what kind of game this is, and a ladder has to compare like with
 * like. They live here rather than in the create form for the reason the clock lengths came
 * here in wave 9 - a list typed out beside the referee's own rule agrees with nothing and
 * disagrees with nothing either, which is how the pick clock went unbuilt for three waves.
 *
 * Measured 2026-08-30 over all fifteen tournaments, as the rating of the best XI the money
 * can actually buy: $100 reads 82.5, $125 85.4, $150 87.6, $175 89.9, $200 92.2. Re-derive
 * rather than trusting those: the dataset moves.
 */
export const ROOM_BUDGETS = [100, 125, 150, 175, 200] as const;
export type RoomBudget = (typeof ROOM_BUDGETS)[number];

/** What a room is opened with when the host says nothing. One step up from the $110 this
 *  replaced rather than the middle of the row: the price curve is convex, so a default at
 *  $150 would make what used to be the deliberate rich choice the ordinary game. */
export const DEFAULT_ROOM_BUDGET: RoomBudget = 125;

/**
 * The range the referee will ACCEPT, which is wider than the rungs on purpose.
 *
 * A room stored before a rung moved is still a legal room, and the referee is not the place
 * to relitigate the create form's taste: it judges whether a figure is playable, and the
 * form decides which of them are offered. Kept here so the two cannot drift - the form
 * builds its options from `ROOM_BUDGETS` and the referee checks against these, and a rung
 * added outside the range would be refused as `bad-room` with nothing to say why.
 */
export const BUDGET_MIN = 70;
export const BUDGET_MAX = 200;

/**
 * How long a WHOLE BUDGET DRAFT gets, when the host has a say (P52).
 *
 * A budget room does not run a pick clock at all. Buying an XI is not eleven independent
 * decisions the way a roll draft is - the money is one pool, so the eleventh pick is what
 * decides whether the first was affordable, and a per-pick clock makes that unplayable:
 * you cannot go back and sell the winger you overpaid for, because there is no back. So
 * the room gets ONE clock for the lot, everybody drafts inside it at their own pace, and
 * a player may move and un-buy freely until they say they are done.
 *
 * Three lengths and not a slider, for the reason `PICK_SECONDS` has two: a lobby row has
 * to be able to say what kind of evening this is, and a ladder has to compare like with
 * like. Roughly the old eleven-window budget (11 x 20s = 3m40) at the bottom, and room to
 * actually shop at the top.
 */
export const DRAFT_SECONDS = [180, 300, 480] as const;
export type DraftSeconds = (typeof DRAFT_SECONDS)[number];

/** What a room gets when the host says nothing. */
export const DEFAULT_DRAFT_SECONDS: DraftSeconds = 300;

/** How long after a window closes a pick is still taken. It exists for network latency
 *  and nothing else, which is why it is small: the CLIENT is expected to lock its own
 *  controls about a round trip early (plan section 5), so a pick arriving after this had
 *  no chance of being in time. */
export const PICK_GRACE_MS = 750;

/** Playback speed inside a room is FIXED (plan P30). In the single-player game speed is a
 *  personal setting spanning five to one, which is one of the two reasons "everybody
 *  watches the same match" was not true: the other is that added time is rolled in each
 *  browser. Both are decided here, by the server, and sent with the result. */
export const PVP_SPEED: MatchSpeed = 'normal';

/** A pause after the final whistle before the round moves on, so a result is not snatched
 *  away the instant it lands. */
const RESULT_HOLD_MS = 4000;

/** The formation an unready player is given at kickoff (plan P48: Ready is a signal, not a
 *  lock, so a host can start on somebody who chose nothing and they must still get a
 *  legal, ordinary shape). */
const DEFAULT_FORMATION: FormationName = '4-3-3';
const DEFAULT_STYLE: Style = 'bal';

/** Re-rolls a roll room allows, when the host says nothing (plan section 3). */
const DEFAULT_REROLLS = 3;

/**
 * P31's lifecycle numbers, and the reason they exist at all.
 *
 * CLOSING A TAB FIRES NO RELIABLE EVENT, so leaving has to be OBSERVED rather than
 * announced: every client pings while it holds a room and `RoomMember.lastSeen` is what
 * that ping writes. Without this a public room whose host closed their laptop sits in the
 * lobby at 3 of 8 for ever, and a lobby full of dead rooms is indistinguishable from a
 * lobby nobody uses - which is the failure the public half of this feature dies of.
 *
 * All three are evaluated by the same stateless sweeper that runs the pick clock (P32), so
 * there is still nothing held in memory anywhere.
 */

/**
 * How long a LOBBY seat survives silence. Five minutes, and it was ninety seconds until
 * 2026-08-27, when the first person to test a room of four on a phone was thrown out of the
 * room he had opened himself.
 *
 * THE MISTAKE WAS CONFLATING "THIS TAB IS GONE" WITH "THIS PERSON IS NOT LOOKING", and it
 * lands hardest exactly where it does most damage. A phone locks its screen after thirty
 * seconds or a minute, and a locked phone runs no JavaScript at all, so the ping stops -
 * while the LOBBY is the one phase whose entire activity is waiting for other people to
 * arrive. So the rule was at its most aggressive in the situation it was least entitled to
 * judge, and being the host was no protection: the host is promoted away, not spared.
 *
 * Five minutes is longer than any screen lock plus a glance away, and still three times
 * faster than `LOBBY_IDLE_MS`, which is the rule that actually keeps the public list clean:
 * a lobby where nothing HAPPENS closes at fifteen minutes whoever is still watching it. The
 * cost of the change is one stale seat held for a few minutes longer on a public row, which
 * is a nuisance; the cost of ninety seconds was a host losing his own room, which is not.
 *
 * The other half of the fix is in the client and matters more: it pings the moment the tab
 * becomes visible again, so waking a phone inside this window never reaches it at all.
 */
export const SEEN_GONE_MS = 5 * 60_000;
/** A lobby nobody has touched for a quarter of an hour is not going to fill. */
export const LOBBY_IDLE_MS = 15 * 60_000;
/** And any room at all, in any phase, is over after half an hour of nothing. */
export const ROOM_IDLE_MS = 30 * 60_000;
/** The draft's hard bound: eleven windows plus a minute. The per-window auto-pick already
 *  guarantees a draft finishes, so this is a backstop for the case where it somehow does
 *  not - a room stuck in the one phase built to be unstallable is the worst outcome
 *  available, so it is worth having a second answer. */
export const DRAFT_SLACK_MS = 60_000;
/** Slots in an XI. Every formation has eleven; the pick clock's bound is counted in them,
 *  and the referee refuses a submitted board with more keys than this before it looks at
 *  any of them. */
export const XI_SLOTS = 11;

/** Room sizes (plan P7). A host may reduce before the start, never increase. */
export const ROOM_SIZES = [2, 4, 8] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];

/**
 * Whether everybody is here at once, or nobody has to be (P51, roadmap item 46).
 *
 * `live` is every rule above this line: a pick clock, a liveness ping, a lobby that closes
 * when it stops filling, and a draft that finishes because nothing ever waits for a human.
 * `async` is a DUEL - one person challenges another, each builds an XI whenever they get to
 * it, and the match plays itself the moment the second XI lands.
 *
 * IT IS ONE FIELD RATHER THAN A SECOND STATE MACHINE, and that is the whole reason this
 * feature is small: the draft, the deal, the validation, the tie and the record are the
 * same in both, and everything that differs is a DEADLINE. So a duel keeps the pick windows
 * (they still count the picks and trigger the deals) and simply never expires one, and the
 * three lifecycle rules that close an idle room are read past. What is left over - the
 * clock on screen, the lobby, the host's Start - is presentation, and the screens branch
 * on this the same way.
 */
export type RoomPace = 'live' | 'async';

/**
 * How long a duel survives with nothing happening in it.
 *
 * A WEEK, because the entire point is that nobody has to be looking: `ROOM_IDLE_MS` is half
 * an hour and would close a duel while both players were asleep. It still exists, and it
 * still has to: a challenge nobody accepts and a draft nobody finishes are the two ways a
 * duel becomes a row that will never resolve, and without a bound the list they sit on
 * fills with them for ever. Every write stamps `touchedAt`, so a duel somebody is playing
 * over three evenings never reaches it.
 */
export const DUEL_IDLE_MS = 7 * 24 * 60 * 60_000;

// --- Shape -----------------------------------------------------------------

export type RoomStatus = 'lobby' | 'drafting' | 'round' | 'ended';

export interface RoomMember {
  userId: string;
  /** Join order. A LABEL that decides nothing: the bracket is drawn at random after the
   *  draft (P47), which is what stops two people sharing a private code from agreeing who
   *  joins first and so arranging the tree between them. */
  seat: number;
  name: string;
  ready: boolean;
  formationName: FormationName;
  style: Style;
  /** Snapshotted at the start (P2), never read live from a career: otherwise the referee
   *  needs privileges on every player's career row, and a Transfer Budget perk bought
   *  mid-draft would change the budget an XI is validated against. */
  budget: number;
  /** How many re-rolls this player has spent, against the room's allowance. A counter
   *  rather than a derivation off `deals.length`: a deal that finds no squad pushes
   *  nothing, so the two would drift apart exactly when a room is under stress. */
  rerollsUsed: number;
  /** The round they went out in, absent while still in. */
  outIn?: number;
  /**
   * "I am through" (P52), in a whole-draft room only.
   *
   * A BUDGET DRAFT CANNOT END WHEN THE ELEVENTH SLOT FILLS, which is what a per-pick room
   * does and is exactly what makes moving and un-buying possible here: if the last player
   * to complete their XI ended the room by completing it, the two things this mode is for
   * would be unusable for the one person who most wants them. So finishing is DECLARED,
   * and the room draws when everybody has declared or the clock runs out. Reversible while
   * the draft is still open, because a misclick must not cost the game.
   *
   * Optional so a room stored before P52 reads back unchanged, and meaningless in a roll
   * room, where completing the XI is finishing by construction.
   */
  done?: boolean;
  /** When this player was last known to be here (P31). Written by the client's ping, read
   *  by the sweeper: a member unseen for `SEEN_GONE_MS` is dropped from a LOBBY, which is
   *  the only phase where dropping somebody is the right answer - past the start their XI
   *  plays on without them, because the alternative is one absent person voiding a
   *  tournament seven other people are in. */
  lastSeen: number;
  /**
   * A practice opponent the host added rather than a person (`domain/pvpBot.ts`).
   *
   * It is a member in every way the room cares about - a seat, a name, a shape, an XI - and
   * differs in exactly three: it never has a pick window (its team is built the moment the
   * room starts), the liveness sweep cannot drop it (there is nobody to hear from), and it
   * cannot hold a room open (a lobby whose last HUMAN leaves closes). Optional rather than
   * a boolean on every member so a room stored before bots existed reads back unchanged.
   */
  bot?: boolean;
}

/** The four facts about a pick that are not "who is in which slot", recorded because the
 *  room's own rules need three of them and `pvp_picks` stores all four (migration 0016).
 *
 *  It is kept BESIDE `xi` rather than folded into it, because a slot map is what P42 asks
 *  for - moving two multi-position players changes both numbers the sim reads without
 *  changing who is in the team - and a map of players cannot also carry when each arrived.
 *  Wave 1 recorded none of it, which was invisible until something had to persist a room:
 *  `pvp_picks.ordinal` is the idempotency key (P36) and `automatic` is one of the three
 *  facts a ladder needs to discount a farmed win, and neither can be reconstructed after
 *  the fact. */
export interface PickRecord {
  ordinal: number;
  openedAt: number;
  landedAt: number;
  /** True when the clock made this pick rather than the player. */
  automatic: boolean;
}

/** One player's open pick window. The deadline is `openedAt + pickSeconds * 1000`; it is
 *  not stored, because storing a derived value is how two truths appear. */
export interface PickWindow {
  /** Which pick this is, 1-based. The client sends the ordinal it believes it is making
   *  so a retry on a flaky link is idempotent rather than two spent windows (P36). */
  ordinal: number;
  openedAt: number;
}

export interface PvpTie {
  round: number;
  /** Game index within the round, so a bracket keeps its shape. */
  game: number;
  homeId: string;
  awayId: string;
  result?: KoTieResult;
  /** Added time for each half, decided HERE and sent with the result (P30), so two people
   *  watching the same match see the same match. */
  stoppage?: [number, number];
  /** When this result starts revealing, and for how long. The round advances when the
   *  last of them closes, whoever is or is not watching. */
  revealFrom?: number;
  revealMs?: number;
  winnerId?: string;
}

export interface PvpRoom {
  id: string;
  code: string;
  visibility: 'public' | 'private';
  hostId: string;
  /** Live, or a duel played in both players' own time. See `RoomPace`. Absent from a room
   *  stored before duels existed, which `roomFromRows` reads as `live`. */
  pace: RoomPace;
  size: RoomSize;
  rules: RoomRules;
  /** The per-pick clock. A ROLL ROOM'S ONLY (P52): a budget room runs `draftSeconds` over
   *  the whole draft instead, and this is left at its stored value there because the
   *  column is `not null` and because a room can never change method. */
  pickSeconds: PickSeconds;
  /** The whole-draft clock, a BUDGET ROOM'S ONLY (P52). Absent from a room stored before
   *  it existed, which reads as the default - the same shape `pace` takes. */
  draftSeconds?: DraftSeconds;
  /** Whether ratings are shown, and how many re-rolls a roll room allows (plan section 3).
   *  Deliberately NOT part of `RoomRules`: that type is what the rules read, and a
   *  presentation switch must not be reachable from the code that decides whether an XI is
   *  legal. They sit here, on the room, because the room is what has to be stored. */
  showRatings: boolean;
  rerolls: number;
  status: RoomStatus;
  members: RoomMember[];
  /** Each player's XI as a slot map (P42), which is what lets a move be expressed. */
  xi: Record<string, Filled>;
  /** userId -> slotId -> how that slot came to be filled. See `PickRecord`. */
  picks: Record<string, Record<string, PickRecord>>;
  /** Squads dealt to each roll-room player, oldest first. One at a time (P13): the whole
   *  sequence up front would let a player read every future squad off their own row. */
  deals: Record<string, string[]>;
  windows: Record<string, PickWindow | undefined>;
  ties: PvpTie[];
  round: number;
  championId?: string;
  startedAt?: number;
  /** When anything last happened here (P31). Every write stamps it; an idle sweep does
   *  not, which is what makes "nobody has touched this" a fact rather than a guess. */
  touchedAt: number;
}

/** What happened to a submitted pick. `late` and `illegal` are distinct because they mean
 *  different things to a player: one is "the clock beat you", the other is "that was not
 *  a legal move", and a client that cannot tell them apart cannot say either. */
export type PickOutcome = 'ok' | 'late' | 'illegal' | 'no-window' | 'replay';

// --- Helpers ---------------------------------------------------------------

const memberOf = (room: PvpRoom, userId: string): RoomMember | undefined =>
  room.members.find((m) => m.userId === userId);

/** The people in the room, as opposed to the seats the host filled. Every lifecycle rule
 *  reads this rather than `members`: a bot cannot leave, cannot be swept out and cannot
 *  hold a room open, so counting it as present would keep an abandoned lobby alive for
 *  ever - which is the exact failure P31 exists to prevent. */
export const humansIn = (room: PvpRoom): RoomMember[] => room.members.filter((m) => !m.bot);

/** The practice opponents, newest seat last. */
export const botsIn = (room: PvpRoom): RoomMember[] => room.members.filter((m) => m.bot);

/** The formation a member is drafting into. Falls back to the default rather than
 *  throwing: an unready player at kickoff has chosen nothing (P48). */
export function formationOf(member: RoomMember): Formation {
  const f = getFormation(member.formationName, member.style);
  return f ?? getFormation(DEFAULT_FORMATION, DEFAULT_STYLE)!;
}

/** Money a member has left, given what they have already bought. Prices each placed
 *  player through `pvpPriceOf`, which reads the DATASET rating and never the album
 *  discount - the two rules a room's money has (P3, and "nothing trusts the submitted
 *  object"). */
export function remainingBudget(room: PvpRoom, userId: string): number {
  const m = memberOf(room, userId);
  if (!m || room.rules.method !== 'budget') return 0;
  const filled = room.xi[userId] ?? {};
  const spent = Object.values(filled).reduce((t, p) => t + (p ? pvpPriceOf(p) : 0), 0);
  return m.budget - spent;
}

/** Slots still empty for one member. */
function openSlotCount(room: PvpRoom, m: RoomMember): number {
  const filled = room.xi[m.userId] ?? {};
  return formationOf(m).slots.filter((s) => !filled[s.id]).length;
}

/** True when this member's XI is complete. */
export function xiComplete(room: PvpRoom, m: RoomMember): boolean {
  return openSlotCount(room, m) === 0;
}

/** The deadline of an open window. */
export function deadlineOf(room: PvpRoom, w: PickWindow): number {
  return w.openedAt + room.pickSeconds * 1000;
}

/**
 * Does this room run ONE clock over the whole draft rather than eleven windows? (P52)
 *
 * It is the METHOD that decides, not a setting: a roll draft is eleven separate decisions
 * about eleven dealt squads, so a window per pick is what it is; a budget draft is one
 * decision about one pool of money, and a clock that will not let you go back and sell the
 * winger you overpaid for is not a clock, it is a trap. Read through a function rather than
 * off the field because three files ask it and a fourth will.
 */
export const wholeDraft = (room: { rules: RoomRules }): boolean => room.rules.method === 'budget';

/** How long this room's whole draft gets. Defaulted here rather than at every reader, so a
 *  room stored before P52 answers the same as one opened today. */
export const draftSecondsOf = (room: PvpRoom): DraftSeconds =>
  room.draftSeconds ?? DEFAULT_DRAFT_SECONDS;

/**
 * When a whole-draft room stops taking XIs, or null when nothing is counting.
 *
 * Null in two ordinary cases and they are different: a room that is not drafting has no
 * deadline yet, and a DUEL has none at all - the whole point of that pace being that
 * nobody is waiting (P51). Null rather than a very large number, so a screen that forgot
 * to ask draws no clock rather than a wrong one, which is the rule the pick window already
 * follows.
 */
export function draftDeadlineOf(room: PvpRoom): number | null {
  if (!wholeDraft(room) || room.status !== 'drafting' || room.pace === 'async') return null;
  if (room.startedAt === undefined) return null;
  return room.startedAt + draftSecondsOf(room) * 1000;
}

/**
 * Has this member finished drafting?
 *
 * THEY SAY SO whenever the room has no clock that could say it for them - a whole-draft
 * room (P52, where a full XI is still one you may take apart) and EVERY DUEL, whatever it
 * plays. A duel's whole shape is that nobody is waiting, so the moment the eleventh pick
 * landing kicked the match off, a player who wanted a last look at their own team would
 * find it already played. Sending is a deliberate act there, which is what makes the wait
 * that follows it a decision rather than a surprise.
 *
 * A per-pick live room is the one place filling the eleventh slot is saying so: the clock
 * is the deliberate act, and there is nothing left to change after it.
 *
 * A practice opponent is always finished: its team is built the moment the room starts.
 */
export function draftDone(room: PvpRoom, m: RoomMember): boolean {
  if (m.bot) return true;
  return declaresDone(room) ? m.done === true && xiComplete(room, m) : xiComplete(room, m);
}

/** Whether this room's players END their own draft rather than having it ended for them. */
export const declaresDone = (room: Pick<PvpRoom, 'rules' | 'pace'>): boolean =>
  wholeDraft(room) || room.pace === 'async';

/** Deal the next squad to a roll-room player, avoiding the one they hold. Uses the shared
 *  `rollAny`, so a room's deals obey exactly the rules a solo roll draft does - including
 *  the fallback when no squad can fill an open slot, which the plan wrongly called a
 *  guarantee. */
function dealNext(room: PvpRoom, m: RoomMember): void {
  if (room.rules.method !== 'roll') return;
  const filled = room.xi[m.userId] ?? {};
  const open = new Set(
    formationOf(m)
      .slots.filter((s) => !filled[s.id])
      .map((s) => s.position),
  );
  const used = new Set(Object.values(filled).map((p) => p!.personId));
  const held = room.deals[m.userId]?.[room.deals[m.userId]!.length - 1] ?? null;
  const squad = rollAny(roomSquads(room.rules), open, used, held);
  if (squad) (room.deals[m.userId] ??= []).push(squad.id);
}

/** Open a member's next pick window, or leave them with none when their XI is done. */
function openWindow(room: PvpRoom, m: RoomMember, now: number): void {
  if (xiComplete(room, m)) {
    room.windows[m.userId] = undefined;
    return;
  }
  const prev = room.windows[m.userId];
  room.windows[m.userId] = { ordinal: (prev?.ordinal ?? 0) + 1, openedAt: now };
  dealNext(room, m);
}

// --- Lobby -----------------------------------------------------------------

export function createRoom(input: {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  visibility: 'public' | 'private';
  size: RoomSize;
  rules: RoomRules;
  pickSeconds: PickSeconds;
  /** The whole-draft clock (P52). Only a budget room reads it; defaulted so every existing
   *  caller reads unchanged. */
  draftSeconds?: DraftSeconds;
  hostBudget: number;
  /** Live by default: a duel is the exception and says so, and every existing caller reads
   *  unchanged. */
  pace?: RoomPace;
  /** Both optional and both defaulted to the values plan section 3 gives, so a caller that
   *  does not care about presentation does not have to say so. */
  showRatings?: boolean;
  rerolls?: number;
  /** When the room was opened. P31 counts from it, and `now` is an argument here for the
   *  same reason it is everywhere else in this module. */
  now: number;
}): PvpRoom {
  const pace = input.pace ?? 'live';
  const host = newMember(input.hostId, 0, input.hostName, input.hostBudget, input.now);
  const room: PvpRoom = {
    id: input.id,
    code: input.code,
    visibility: input.visibility,
    hostId: input.hostId,
    pace,
    size: input.size,
    rules: input.rules,
    pickSeconds: input.pickSeconds,
    draftSeconds: input.draftSeconds ?? DEFAULT_DRAFT_SECONDS,
    showRatings: input.showRatings ?? true,
    rerolls: input.rerolls ?? DEFAULT_REROLLS,
    status: 'lobby',
    members: [host],
    xi: {},
    picks: {},
    deals: {},
    windows: {},
    ties: [],
    round: 0,
    touchedAt: input.now,
  };
  // A DUEL HAS NO LOBBY AND NEVER HAD ANYTHING TO WAIT FOR, so it opens straight into the
  // draft with its challenger already picking. Waiting for somebody to accept before you
  // may touch your own team is a wait that buys nothing: the two drafts are independent,
  // the match is played by the server when the second XI lands, and the first thing anybody
  // wants to do after opening a challenge is build the team they are challenging with.
  //
  // The second seat stays open THROUGH the draft, which is the one rule this needs: see
  // `joinRoom`.
  if (pace === 'async') {
    room.status = 'drafting';
    room.startedAt = input.now;
    beginDraftFor(room, host, input.now);
  }
  return room;
}

/** One seated player, before anything has happened to them. */
function newMember(
  userId: string,
  seat: number,
  name: string,
  budget: number,
  now: number,
): RoomMember {
  return {
    userId,
    seat,
    name,
    ready: false,
    formationName: DEFAULT_FORMATION,
    style: DEFAULT_STYLE,
    budget,
    rerollsUsed: 0,
    lastSeen: now,
  };
}

/** The next seat nobody holds. Seats decide nothing (the draw is random, P47), so the gap a
 *  departure leaves is never re-used - `pvp_members` has a unique index on (room, seat) and
 *  renumbering would collide with the row still holding the old one. */
const nextSeat = (room: PvpRoom): number =>
  room.members.reduce((max, m) => Math.max(max, m.seat + 1), 0);

export type JoinOutcome = 'ok' | 'full' | 'started' | 'already-in';

export function joinRoom(
  room: PvpRoom,
  member: { userId: string; name: string; budget: number },
  now: number,
): { room: PvpRoom; outcome: JoinOutcome } {
  if (memberOf(room, member.userId)) return { room, outcome: 'already-in' };
  // A DUEL'S SEAT STAYS OPEN THROUGH THE DRAFT, and that is the whole of what "build your
  // XI before anybody has accepted" costs the state machine. A live room is shut the moment
  // it starts because everybody in it is drafting against the same clock and a latecomer
  // would be picking against a window that has been running for a minute; a duel has no
  // clock at all, so somebody arriving on the link on Tuesday starts a draft of their own,
  // exactly as the challenger did on Monday. There is nothing to be late for.
  if (room.status === 'drafting' && room.pace === 'async' && room.members.length < room.size) {
    const next = clone(room);
    const m = newMember(member.userId, nextSeat(next), member.name, member.budget, now);
    next.members.push(m);
    beginDraftFor(next, m, now);
    return { room: next, outcome: 'ok' };
  }
  if (room.status !== 'lobby') return { room, outcome: 'started' };
  const bots = botsIn(room);
  if (room.members.length >= room.size && !bots.length) return { room, outcome: 'full' };
  const next = clone(room);
  // A BOT NEVER KEEPS A HUMAN OUT. A host who filled the last two chairs with practice
  // opponents so the room could start has not closed it: a person arriving takes the
  // newest bot's seat, which is what makes filling up a decision the host can make early
  // and change their mind about by doing nothing.
  if (next.members.length >= next.size) {
    const giveUp = botsIn(next)[botsIn(next).length - 1]!;
    next.members = next.members.filter((m) => m.userId !== giveUp.userId);
  }
  // The next FREE seat, not the member count. A lobby can now lose somebody to P31's
  // liveness sweep, which leaves a gap, and `pvp_members` has a unique index on (room,
  // seat) - so counting would hand the newcomer a number somebody else still holds.
  next.members.push(newMember(member.userId, nextSeat(next), member.name, member.budget, now));
  return { room: next, outcome: 'ok' };
}

/**
 * Set how many practice opponents sit in this room (`domain/pvpBot.ts`).
 *
 * ONE COMMAND FOR BOTH DIRECTIONS, taking a TARGET rather than "add one": the host is
 * choosing how full the room is, the chips on the screen show a count, and a target is
 * idempotent - a tap that arrives twice on a flaky link fills the room once, where "add
 * one" twice fills it twice. Same reasoning as the pick ordinal (P36).
 *
 * It is refused rather than clamped when it would not fit, because a lobby that quietly
 * seated fewer opponents than the host asked for is a lobby whose Start button is still
 * greyed out for no stated reason. The one thing it will not do is push a PERSON out: the
 * cap is the seats nobody is sitting in.
 */
export function setBots(
  room: PvpRoom,
  hostId: string,
  count: number,
  now: number,
  newId: () => string,
): PvpRoom {
  if (room.status !== 'lobby' || hostId !== room.hostId) return room;
  // Not in a duel. A duel is a challenge to a PERSON, and the answer to "nobody accepted"
  // there is to challenge somebody else, not to play the seat filler - which would also
  // resolve the duel against a robot and put it on the challenger's record.
  if (room.pace === 'async') return room;
  if (!Number.isInteger(count) || count < 0) return room;
  const humans = humansIn(room).length;
  if (count > room.size - humans) return room;
  const bots = botsIn(room);
  if (count === bots.length) return room;
  const next = clone(room);
  if (count < bots.length) {
    // Newest first, so a host stepping the count down loses the chair they added last.
    const drop = new Set(bots.slice(count).map((m) => m.userId));
    next.members = next.members.filter((m) => !drop.has(m.userId));
  } else {
    for (let i = bots.length; i < count; i++) {
      const seat = nextSeat(next);
      const budget = next.rules.method === 'budget' ? next.rules.budget : 0;
      const m = newMember(newId(), seat, botName(next.members.map((x) => x.name)), budget, now);
      // Ready, always: there is nobody to press it, and an unready seat would leave the
      // host's Start button reading as though somebody were still choosing. `lastSeen` is
      // 0 for the reason `rows.ts` gives - it answers a question about a tab, and there is
      // no tab, so the liveness sweep skips bots rather than reading a made-up time.
      next.members.push({ ...m, bot: true, ready: true, lastSeen: 0, ...botShape() });
    }
  }
  next.touchedAt = now;
  return next;
}

/** A bot's formation and style: a real one, drawn at random. Fixing it at 4-3-3 would make
 *  every practice opponent the same team before a player has been bought, and the shape is
 *  the one decision a room makes before the clock starts (P19). */
function botShape(): { formationName: FormationName; style: Style } {
  const name = pick(FORMATIONS_DATA.names) ?? DEFAULT_FORMATION;
  const styles = FORMATIONS_DATA.stylesByName[name] ?? [DEFAULT_STYLE];
  return { formationName: name, style: pick(styles) ?? DEFAULT_STYLE };
}

/** Choose a shape and say you are ready (P48). Both in one call because they are one
 *  gesture in the lobby, and a shape may still be changed until the start. */
export function setLineup(
  room: PvpRoom,
  userId: string,
  formationName: FormationName,
  style: Style,
  ready: boolean,
): PvpRoom {
  if (room.status !== 'lobby') return room;
  const next = clone(room);
  const m = memberOf(next, userId);
  if (!m) return room;
  if (getFormation(formationName, style)) {
    m.formationName = formationName;
    m.style = style;
  }
  m.ready = ready;
  return next;
}

/** Shrink a room that will not fill (P7). Never grows, and never below what is seated. */
export function reduceSize(room: PvpRoom, hostId: string, size: RoomSize): PvpRoom {
  if (room.status !== 'lobby' || hostId !== room.hostId) return room;
  if (size >= room.size || size < room.members.length) return room;
  const next = clone(room);
  next.size = size;
  return next;
}

/**
 * Start the draft. Requires a full room, and the host may start whether or not everyone
 * pressed Ready (P48) - a signal, not a lock, so nobody can hold a room by wandering off.
 */
export function startRoom(room: PvpRoom, hostId: string, now: number): PvpRoom {
  if (room.status !== 'lobby' || hostId !== room.hostId) return room;
  if (room.members.length !== room.size) return room;
  const next = clone(room);
  next.status = 'drafting';
  next.startedAt = now;
  for (const m of next.members) beginDraftFor(next, m, now);
  return next;
}

/**
 * Put ONE member into a draft that is already running.
 *
 * IT IS A PER-MEMBER STEP AND NOT A LOOP INSIDE `startRoom`, because a duel seats its two
 * players at different times and may be days apart about it: the challenger begins drafting
 * the moment they open the challenge, and the opponent begins when they arrive (`joinRoom`).
 * A live room still calls it for everybody at once, which is the same thing done together.
 *
 * `room` is mutated, so every caller hands it a clone it already owns.
 */
function beginDraftFor(room: PvpRoom, m: RoomMember, now: number): void {
  room.xi[m.userId] = {};
  room.picks[m.userId] = {};
  // No deals for a bot even in a roll room: it rolls its whole team in one step below
  // rather than being dealt a squad per window, so there is nothing to record - and
  // `pvp_deals` has the same foreign key `pvp_members` has, so an empty list here would
  // be a field that cannot survive a reload.
  if (room.rules.method === 'roll' && !m.bot) room.deals[m.userId] = [];
  // Nobody has declared themselves through yet, whatever the lobby's Ready said: that
  // signal was about starting, and this one is about finishing (P52).
  delete m.done;
  // A BOT'S TEAM IS BUILT HERE, ONCE, and it never gets a window. Nobody is watching it
  // think, so a seat-filler drafting against the clock would be theatre - and the room
  // then finishes its draft when the PEOPLE do, which is the only thing anybody is
  // waiting for. Its XI is judged by nothing afterwards: `submitPick` is the only caller
  // of `validateXi`, and a bot never submits one.
  if (m.bot) room.xi[m.userId] = botXi(room.rules, formationOf(m));
  // A WHOLE-DRAFT ROOM OPENS NO WINDOWS AT ALL (P52). The window is what a per-pick room
  // counts picks and deals squads with; here there is one clock over the lot and the
  // board is submitted as a map, so a window would be a second, disagreeing account of
  // the same draft. `draftDeadlineOf` is the whole of the timing.
  else if (!wholeDraft(room)) openWindow(room, m, now);
}

// --- The draft -------------------------------------------------------------

export interface PickRequest {
  ordinal: number;
  slotId: string;
  player: Player;
}

/**
 * Take one pick.
 *
 * Four rules, and each was a decision rather than a detail:
 *
 * - A pick after the deadline plus the grace is **late** and changes nothing. The window
 *   is left alone; the sweeper fills it. The player is told which, because "the clock
 *   beat you" and "that was not legal" are different sentences.
 * - A pick that is not legal is **treated as no pick** (P43): the window keeps running and
 *   the player may try again inside it. Not a forfeit, ever.
 * - Re-sending the ordinal already taken is a **replay**, answered with the state that
 *   exists rather than an error (P36), so a retry on a flaky link cannot spend two
 *   windows.
 * - Legality is judged against the DATASET player, never the object posted, which is what
 *   `validateXi` does and why this hands it a one-slot map rather than trusting `player`.
 */
export function submitPick(
  room: PvpRoom,
  userId: string,
  req: PickRequest,
  now: number,
): { room: PvpRoom; outcome: PickOutcome } {
  if (room.status !== 'drafting') return { room, outcome: 'no-window' };
  const m = memberOf(room, userId);
  const w = room.windows[userId];
  if (!m || !w) return { room, outcome: 'no-window' };
  if (req.ordinal < w.ordinal) return { room, outcome: 'replay' };
  if (req.ordinal !== w.ordinal) return { room, outcome: 'no-window' };
  // A DUEL'S WINDOW NEVER CLOSES. The window is kept in both paces because it is what
  // counts the picks and triggers the deal - the deadline is the only part of it that is
  // about a clock, and in a duel there is no clock to beat. Nothing else in this function
  // changes: the same XI is legal in both.
  if (room.pace === 'live' && now > deadlineOf(room, w) + PICK_GRACE_MS) {
    return { room, outcome: 'late' };
  }

  const filled = room.xi[userId] ?? {};
  const f = formationOf(m);
  const slot = f.slots.find((s) => s.id === req.slotId);
  if (!slot || filled[req.slotId]) return { room, outcome: 'illegal' };

  // Judge the one slot in the context of the whole XI so far: `validateXi` reports an
  // empty-slot fault for every unfilled slot, which is expected mid-draft, so the test is
  // that this pick adds no OTHER fault.
  const candidate: Filled = { ...filled, [req.slotId]: req.player };
  const v = validateXi(f, candidate, room.rules, room.deals[userId]);
  const realFaults = v.faults.filter((x) => x !== 'empty-slot');
  if (realFaults.length) return { room, outcome: 'illegal' };
  if (room.rules.method === 'budget' && v.cost > m.budget) return { room, outcome: 'illegal' };

  const next = clone(room);
  next.xi[userId] = candidate;
  recordPick(next, userId, req.slotId, w, now, false);
  openWindow(next, memberOf(next, userId)!, now);
  return { room: next, outcome: 'ok' };
}

/** What happened to a submitted XI. `closed` covers every reason the room is not taking
 *  one - not drafting, not a whole-draft room, already declared done, or past the clock -
 *  because to the player they are the same sentence and the screen says which from the
 *  room it is handed back. */
export type XiOutcome = 'ok' | 'illegal' | 'closed';

/**
 * Take a whole XI (P52), which is how a budget room drafts.
 *
 * THE BOARD IS SUBMITTED AS A MAP, NOT AS A PICK. That one decision is what makes buying,
 * moving and un-buying the same instruction rather than three, and it is only available
 * here because `xi` was always a slot map (P42) and `validateXi` always judged a whole
 * team. A move is an XI with two slots swapped; a removal is an XI with a slot missing;
 * a purchase is an XI with one more. The referee needs no new rule for any of them.
 *
 * It also makes a retry idempotent BY CONSTRUCTION, where the per-pick protocol needs an
 * ordinal to get there (P36): sending the same map twice is the same map.
 *
 * Two things are worth knowing about what it does NOT do. It does not touch the clock -
 * there is one deadline for the room and nothing a player does moves it, which is what
 * stops un-buying being a way to stall. And it does not end the draft by completing the
 * XI: finishing is declared (`setDone`), for the reason `RoomMember.done` gives.
 */
export function setXi(
  room: PvpRoom,
  userId: string,
  /** slotId -> the DATASET player. The caller resolves ids; nothing here trusts an object
   *  that arrived over the wire, which is the rule the whole module keeps. */
  filled: Filled,
  now: number,
): { room: PvpRoom; outcome: XiOutcome } {
  if (room.status !== 'drafting' || !wholeDraft(room)) return { room, outcome: 'closed' };
  const m = memberOf(room, userId);
  if (!m || m.bot) return { room, outcome: 'closed' };
  // Declared through. Un-declare first (`setDone(false)`) - which is a deliberate second
  // tap, because the room may already be drawing.
  if (m.done) return { room, outcome: 'closed' };
  const deadline = draftDeadlineOf(room);
  if (deadline !== null && now > deadline + PICK_GRACE_MS) return { room, outcome: 'closed' };

  const f = formationOf(m);
  // Rebuilt from the FORMATION'S slots, so a map carrying keys this shape has no slot for
  // cannot be stored: `validateXi` walks the formation and would ignore them, and an
  // ignored key is one that comes back to the client as an XI it did not send.
  const next: Filled = {};
  for (const slot of f.slots) {
    const p = filled[slot.id];
    if (p) next[slot.id] = p;
  }
  const v = validateXi(f, next, room.rules, room.deals[userId]);
  if (v.faults.some((x) => x !== 'empty-slot')) return { room, outcome: 'illegal' };
  if (room.rules.method === 'budget' && v.cost > m.budget) return { room, outcome: 'illegal' };

  const out = clone(room);
  // The PREVIOUS map, read before it is overwritten: `reconcilePicks` needs to know which
  // slots actually changed, and asking the new map that question compares it with itself.
  const before = out.xi[userId] ?? {};
  out.xi[userId] = next;
  reconcilePicks(out, userId, before, next, now, false);
  return { room: out, outcome: 'ok' };
}

/**
 * Bring the pick log into line with a submitted map.
 *
 * A slot whose player has not changed KEEPS ITS RECORD, which is the point: `landedAt` is
 * when that player actually arrived and `automatic` is one of the three facts a ladder
 * needs to tell a real win from a farmed one (`pvp_matches.loser_auto_picks`), so
 * restamping every slot on every keystroke would erase both. A slot that changed gets the
 * next ordinal this member has used, so the log still reads as the order things happened
 * in; a slot that emptied loses its record, which `pgStore` already deletes for.
 */
function reconcilePicks(
  room: PvpRoom,
  userId: string,
  /** The map as it was before this submission. */
  was: Filled,
  /** The map as it is now. */
  filled: Filled,
  now: number,
  automatic: boolean,
): void {
  const had = room.picks[userId] ?? {};
  let ordinal = Object.values(had).reduce((max, r) => Math.max(max, r.ordinal), 0);
  const after: Record<string, PickRecord> = {};
  for (const [slotId, player] of Object.entries(filled)) {
    if (!player) continue;
    const kept = had[slotId];
    if (kept && was[slotId]?.id === player.id) {
      after[slotId] = kept;
      continue;
    }
    ordinal += 1;
    after[slotId] = {
      ordinal,
      openedAt: room.startedAt ?? now,
      landedAt: now,
      automatic,
    };
  }
  room.picks[userId] = after;
}

/**
 * Declare yourself through, or take it back (P52).
 *
 * "GO AHEAD WHEN ALL PLAYERS ARE THROUGH" is the rule this exists for, and it needs a
 * signal because a whole-draft room cannot read completion as finishing - see
 * `RoomMember.done`. Refused on an incomplete XI, so "everybody is done" can never mean
 * "everybody gave up", and reversible while the draft is still open, because the cost of a
 * misclick otherwise is the match.
 */
export function setDone(room: PvpRoom, userId: string, done: boolean, now: number): PvpRoom {
  if (room.status !== 'drafting' || !declaresDone(room)) return room;
  const m = memberOf(room, userId);
  if (!m || m.bot || m.done === done) return room;
  if (done && !xiComplete(room, m)) return room;
  const deadline = draftDeadlineOf(room);
  if (deadline !== null && now > deadline + PICK_GRACE_MS) return room;
  const next = clone(room);
  const mm = memberOf(next, userId)!;
  if (done) mm.done = true;
  else delete mm.done;
  return next;
}

/** Note how a slot came to be filled. One place, so a pick made by the clock and a pick
 *  made by a player are recorded identically apart from the flag that says which. */
function recordPick(
  room: PvpRoom,
  userId: string,
  slotId: string,
  window: PickWindow,
  now: number,
  automatic: boolean,
): void {
  (room.picks[userId] ??= {})[slotId] = {
    ordinal: window.ordinal,
    openedAt: window.openedAt,
    landedAt: now,
    automatic,
  };
}

/** Re-roll a roll room's dealt squad. Two rules, and the second one was missing until the
 *  referee had to store the number:
 *
 *  - It does NOT restart the clock (plan section 4), or re-rolling is a way to stall for
 *    ever, which is the exact thing the clock exists to prevent.
 *  - It is CAPPED at the room's allowance (plan section 3, 0 to 6). The host chooses that
 *    number and wave 1 never read it, so it was a lobby control that did nothing - and at
 *    zero it promised a room where re-rolling was off and delivered one where it was free. */
export function rerollDeal(room: PvpRoom, userId: string, now: number): PvpRoom {
  if (room.status !== 'drafting' || room.rules.method !== 'roll') return room;
  const m = memberOf(room, userId);
  const w = room.windows[userId];
  if (!m || !w) return room;
  if (m.rerollsUsed >= room.rerolls) return room;
  if (room.pace === 'live' && now > deadlineOf(room, w) + PICK_GRACE_MS) return room;
  const next = clone(room);
  const mm = memberOf(next, userId)!;
  mm.rerollsUsed += 1;
  dealNext(next, mm);
  return next;
}

/** Re-rolls this player has left. */
export function rerollsLeft(room: PvpRoom, userId: string): number {
  const m = memberOf(room, userId);
  return m ? Math.max(0, room.rerolls - m.rerollsUsed) : 0;
}

// --- The sweeper -----------------------------------------------------------

/** How long a tie's result takes to reveal, computed from the room's fixed speed and the
 *  match that actually happened - not a worst case. The server knows the added time and
 *  the number of penalties, so it can say exactly, which is what makes the round's own
 *  deadline honest rather than generous. */
export function revealMsFor(tie: PvpTie): number {
  if (!tie.result) return 0;
  const minutes = maxMinute(tie.result.decided);
  const added = (tie.stoppage?.[0] ?? 0) + (tie.stoppage?.[1] ?? 0);
  const kicks = tie.result.pens?.kicks.length ?? 0;
  return (
    (minutes + added) * STEP_MS[PVP_SPEED] +
    HALF_TIME_MS[PVP_SPEED] +
    kicks * PEN_MS[PVP_SPEED] +
    RESULT_HOLD_MS
  );
}

/** Added time for one half. Rolled by the referee (P30) so every viewer sees the same
 *  match; the single-player clock rolls its own, which is why two people watching the
 *  same stored result currently see different lengths. */
function rollStoppage(): [number, number] {
  const table = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7];
  const draw = () => table[Math.floor(Math.random() * table.length)]!;
  return [draw(), draw()];
}

/** The players still in, in seat order. */
function survivors(room: PvpRoom): RoomMember[] {
  return room.members.filter((m) => m.outIn === undefined);
}

/** Draw the whole first round at random (P47), after every draft is finished. Random and
 *  not by seat, so a pairing cannot be arranged by agreeing who joins first. */
function drawRound(room: PvpRoom, now: number): void {
  const alive = shuffled(survivors(room));
  room.round += 1;
  for (let i = 0; i + 1 < alive.length; i += 2) {
    room.ties.push({
      round: room.round,
      game: i / 2,
      homeId: alive[i]!.userId,
      awayId: alive[i + 1]!.userId,
    });
  }
  playRound(room, now);
}

/** Simulate every tie of the current round and stamp when each starts revealing. */
function playRound(room: PvpRoom, now: number): void {
  for (const tie of room.ties.filter((t) => t.round === room.round && !t.result)) {
    const home = memberOf(room, tie.homeId)!;
    const away = memberOf(room, tie.awayId)!;
    const sideOf = (m: RoomMember) =>
      pvpTeam({
        id: m.userId,
        name: m.name,
        code: m.name.slice(0, 3).toUpperCase(),
        players: formationOf(m)
          .slots.map((s) => room.xi[m.userId]?.[s.id])
          .filter((p): p is Player => !!p),
      });
    tie.result = resolveKoTie(sideOf(home), sideOf(away));
    tie.stoppage = rollStoppage();
    tie.winnerId = tie.result.homeWon ? home.userId : away.userId;
    tie.revealFrom = now;
    tie.revealMs = revealMsFor(tie);
    const loser = tie.result.homeWon ? away : home;
    loser.outIn = room.round;
  }
  room.status = 'round';
}

/**
 * Fill exactly ONE empty slot for this member, and guarantee that it happens.
 *
 * One slot per expired window rather than the whole XI, so a player who steps away for a
 * minute comes back to a draft where they left it rather than a finished team.
 *
 * The guarantee is the part that needed care, and mutation testing is what found it
 * missing. In a roll room the auto-pick draws from the LAST squad dealt, and that squad
 * routinely has nobody for the slots still open: 345 of the (squad, position) pairs in
 * the dataset are empty, because most 1970s squads list no wide midfielder at all. When
 * that happens the pick fills nothing, the window reopens, and the next sweep faces the
 * same squad for ever - the room stalls, in the one phase built to be unstallable.
 *
 * So a failed draw DEALS AGAIN, which is what a player in that position would do. The
 * last resort takes anyone the room allows and RECORDS that squad as dealt, and the
 * recording is the point rather than bookkeeping: "was he dealt this player" is one of
 * the rules `validateXi` enforces, so filling from a squad the referee never handed over
 * would produce an XI the referee itself then refuses. A room is never stuck, and never
 * holds an XI its own validator would reject.
 */
function forceFillOne(room: PvpRoom, m: RoomMember, window: PickWindow, now: number): void {
  const f = formationOf(m);
  const fill = (dealt: string[] | undefined, rules: RoomRules): boolean => {
    const made = autoPick(f, room.xi[m.userId] ?? {}, rules, {
      remaining: remainingBudget(room, m.userId),
      dealt,
    });
    if (!made) return false;
    (room.xi[m.userId] ??= {})[made.slotId] = made.player;
    // Marked automatic, and that flag leaves the room: `pvp_matches.loser_auto_picks` is
    // one of the three facts a ladder needs to tell a real win from a farmed one, and two
    // accounts run by one person letting a side idle is the cheapest way to farm.
    recordPick(room, m.userId, made.slotId, window, now, true);
    // Record the squad as dealt. In the ordinary path it already is and this is a no-op;
    // in the fallback below it is the whole point, because "was he dealt this player" is
    // one of the rules `validateXi` enforces, so filling from a squad the referee never
    // handed over would build an XI the referee itself then refuses.
    if (room.rules.method === 'roll' && !room.deals[m.userId]?.includes(made.player.squadId)) {
      (room.deals[m.userId] ??= []).push(made.player.squadId);
    }
    return true;
  };
  if (fill(room.deals[m.userId], room.rules)) return;
  if (room.rules.method !== 'roll') return;
  // The dealt squad had nobody for any slot still open. Take anyone the room allows,
  // which is the same thing as the referee dealing a squad that CAN fill and picking from
  // it - and record it, per the note above.
  //
  // WITH TODAY'S DATASET THIS LINE NEVER RUNS, and that is measured rather than hoped:
  // every window reopens with a fresh deal, `rollAny` prefers a squad that can fill an
  // open slot, and `npm run checks` asserts that in every cup a host can select there is
  // at least one squad for every position of every formation. So a reopened window always
  // converges. It is kept because that last property is a fact about the DATA, not the
  // code: one more tournament with no wide midfielder in any of its squads would make a
  // single-cup roll room unfillable, and the failure mode without this line is a room
  // stuck for ever in the phase built to be unstallable. That check going red is the
  // signal that this stopped being dormant.
  fill(undefined, { ...room.rules, method: 'budget', budget: Number.MAX_SAFE_INTEGER });
}

/**
 * A lobby's own sweep (P31).
 *
 * Three rules, in the order that makes each one cheap. A lobby nobody has touched for
 * `LOBBY_IDLE_MS` is not going to fill, so it closes. Anybody unseen for `SEEN_GONE_MS` is
 * gone and is dropped - and only HERE, in the lobby: past the start a player's XI plays on
 * without them, because the alternative is one absent person voiding a tournament seven
 * other people are in. And if the person who went was the HOST, the next seat is promoted
 * rather than the room dying with them.
 *
 * Dropping leaves a GAP in the seat numbers, deliberately. A seat is a label that decides
 * nothing (the draw is random, P47), and re-numbering would have every remaining member
 * change seat - which collides with `pvp_members`' unique index the moment the writer
 * updates one row before deleting another.
 */
function tickLobby(room: PvpRoom, now: number): PvpRoom {
  if (now - room.touchedAt > LOBBY_IDLE_MS) return closeRoom(room);
  // A BOT IS NEVER SWEPT OUT: there is nobody to hear from, so its `lastSeen` is whenever
  // the host added it and would expire five minutes later, taking the room's seats with it.
  // What it does not do is keep the room alive - `withoutMembers` closes a lobby with no
  // people left in it, however many chairs are still filled.
  const here = room.members.filter((m) => m.bot || now - m.lastSeen <= SEEN_GONE_MS);
  if (here.length === room.members.length) return room;
  return withoutMembers(room, new Set(here.map((m) => m.userId)), now);
}

/**
 * A lobby with some of its members gone: the one place seats are given up.
 *
 * Both callers reach it - the liveness sweep, which decides somebody LEFT WITHOUT SAYING
 * SO, and `leaveRoom`, which is somebody saying so - and they must agree on what happens
 * next, because a lobby that promotes a host one way and closes the other is two rules
 * wearing one name.
 */
function withoutMembers(room: PvpRoom, keep: Set<string>, now: number): PvpRoom {
  // NOBODY IS LEFT, and "nobody" counts people rather than seats: a room whose last human
  // walked out is over, whether or not the host had filled the other chairs with practice
  // opponents. Bots cannot leave, so without this a lobby of one host and three bots would
  // outlive its host by the fifteen minutes `LOBBY_IDLE_MS` allows - and be listed as
  // joinable for all of them.
  const staying = room.members.filter((m) => keep.has(m.userId));
  if (!staying.some((m) => !m.bot)) return closeRoom(room);
  const next = clone(room);
  next.members = next.members.filter((m) => keep.has(m.userId));
  if (!next.members.some((m) => m.userId === next.hostId)) {
    // The lowest remaining seat AMONG THE PEOPLE. A bot cannot press Start, so promoting
    // one would leave a room nobody could begin.
    next.hostId = humansIn(next).reduce((a, b) => (a.seat <= b.seat ? a : b)).userId;
  }
  next.touchedAt = now;
  return next;
}

/**
 * Give up your seat, deliberately.
 *
 * IT ONLY WORKS IN A LOBBY, and that is the same rule the liveness sweep keeps rather than
 * a limitation: past the start your XI is in a bracket other people are playing, so there
 * is nothing to remove you from without voiding their tournament (P15, P24). Leaving a
 * running room is therefore a navigation and nothing more, and the screen says so - "your
 * team plays on without you".
 *
 * IN A LOBBY IT HAS TO BE REAL, though, and this was a reported bug: leaving used to be
 * purely local, so the seat stayed taken, and `activeRoomOf` then refused the player their
 * next room (P39's one-room-at-a-time) until the liveness sweep noticed ninety seconds
 * later. "I left and it says I am still in a room" is exactly right, and the answer is that
 * leaving has to tell the referee.
 */
export function leaveRoom(room: PvpRoom, userId: string, now: number): PvpRoom {
  // A CHALLENGE NOBODY HAS TAKEN UP IS CALLED OFF BY LEAVING IT, which is why withdrawing
  // needs no command of its own. A duel opens straight into its challenger's draft, so it
  // is never in a lobby and the rule below would make it unleavable - and a challenge you
  // have thought better of would then sit on the link for a week. Once the second player is
  // in, their draft is real work: leaving is looking away, exactly as it is in a live room
  // that has started.
  if (room.pace === 'async' && room.status === 'drafting' && room.members.length < room.size) {
    return room.members.some((m) => m.userId === userId) ? closeRoom(room) : room;
  }
  if (room.status !== 'lobby') return room;
  if (!room.members.some((m) => m.userId === userId)) return room;
  return withoutMembers(
    room,
    new Set(room.members.filter((m) => m.userId !== userId).map((m) => m.userId)),
    now,
  );
}

/**
 * A room that is over without having been won.
 *
 * It is `ended` with NO champion, and that pair is the whole encoding: the status column
 * takes four values and adding a fifth would need a migration, while "ended and nobody
 * won" is a state a normally-finished room can never be in (`playRound` eliminates exactly
 * one player per tie, so exactly one survives). `roomClosed` is that reading, exported so
 * the screens can say "this room closed" rather than "the result".
 */
function closeRoom(room: PvpRoom): PvpRoom {
  const next = clone(room);
  next.status = 'ended';
  delete next.championId;
  return next;
}

/** Did this room close rather than crown somebody? See `closeRoom`.
 *
 *  It takes the two fields rather than a `PvpRoom` so the SCREENS can ask it of a
 *  `RoomView` too, where `championId` is null rather than absent. One reading of the rule,
 *  asked by both sides, is the whole point of it being a function. */
export const roomClosed = (room: {
  status: RoomStatus | string;
  championId?: string | null;
}): boolean => room.status === 'ended' && !room.championId;

/**
 * The draft's hard bound: the clock it is actually running, plus slack.
 *
 * A per-pick room's clock is eleven windows; a whole-draft room's is one (P52). Both get
 * the same minute on top, and it is a BACKSTOP rather than the rule - each method's own
 * deadline above already guarantees the draft ends - so what matters is only that it is
 * never SHORTER than the clock it is backing, or it would be the rule by accident.
 */
function draftBoundMs(room: PvpRoom): number {
  const clock = wholeDraft(room)
    ? draftSecondsOf(room) * 1000
    : XI_SLOTS * room.pickSeconds * 1000;
  return clock + DRAFT_SLACK_MS;
}

/** Fill every slot this member has left, for the draft's hard bound. */
function forceCompleteOne(room: PvpRoom, m: RoomMember, now: number): void {
  const slots = formationOf(m).slots.length;
  for (let i = 0; i < slots && !xiComplete(room, m); i++) {
    const w = room.windows[m.userId] ?? { ordinal: i + 1, openedAt: now };
    forceFillOne(room, m, w, now);
  }
  delete room.windows[m.userId];
}

/**
 * A duel's own sweep, which is mostly a list of things it does NOT do.
 *
 * No expiry on a pick window, no seat dropped for silence, no lobby closed for not filling
 * and no hard bound on the draft: every one of those exists because a live room cannot
 * wait for a human (P12, P31), and waiting for a human is the entire feature here. What is
 * left is the two transitions that are about the FOOTBALL rather than about anybody being
 * present - both XIs are in, so play the match; the reveal has run, so settle it - and one
 * deadline, a week of nothing, which is what stops an unanswered challenge sitting on
 * somebody's list for ever.
 *
 * NOTE WHAT THE FIRST ONE MEANS IN A DUEL: whoever finishes second sets the match going,
 * and the other player was not there for it. That is why the result is stamped and settles
 * on its own (`revealFrom` plus `revealMs`) rather than waiting to be watched - a duel is
 * read afterwards as often as it is watched, and both have to work.
 */
function tickDuel(room: PvpRoom, now: number): PvpRoom {
  if (now - room.touchedAt > DUEL_IDLE_MS) return closeRoom(room);
  if (room.status === 'lobby') return room;
  if (room.status === 'drafting') {
    // NOBODY HAS TAKEN THE CHALLENGE UP YET, so there is no match to play however finished
    // the challenger is. A duel drafts from the moment it is opened, which means a room of
    // one is its ordinary early state rather than an impossible one - and without this a
    // challenger who sent their XI would be drawn against themselves.
    if (room.members.length < room.size) return room;
    // Both players have SAID they are through, which in a duel is the only thing that can
    // end a draft: there is no clock, so without the declaration an XI could never be
    // revised and the eleventh pick would kick the match off under its owner.
    if (!room.members.every((m) => draftDone(room, m))) return room;
    const next = clone(room);
    drawRound(next, now);
    return next;
  }
  const live = room.ties.filter((t) => t.round === room.round);
  if (!live.every((t) => now >= (t.revealFrom ?? 0) + (t.revealMs ?? 0))) return room;
  const next = clone(room);
  const alive = survivors(next);
  // A duel is two people, so this is always the end. The general branch is kept rather
  // than assumed: nothing here needs a duel to be a room of two, and one day a slow
  // tournament is the same machine with a bigger draw.
  if (alive.length <= 1) {
    next.status = 'ended';
    next.championId = alive[0]?.userId;
    return next;
  }
  drawRound(next, now);
  return next;
}

/**
 * One sweep. Call it when a pick arrives and every second or two otherwise; it is the
 * only thing that moves a room forward, and it holds no state of its own.
 *
 * Returns the same object when nothing was due, so a caller can skip a write on identity
 * rather than by diffing - the pattern `prepareGroupStage` uses for a resumed run.
 */
export function tickRoom(room: PvpRoom, now: number): PvpRoom {
  if (room.status === 'ended') return room;
  // A DUEL IS THE OTHER PACE, and the sweeper's job there is almost nothing: it never
  // expires a window, never drops a seat for silence and never closes a lobby that has not
  // filled, because a duel is two people who are deliberately not here. What it still does
  // is the two things that MOVE a room - the draw when both XIs are in, and the round when
  // its reveal has run - plus the one deadline a duel does have, which is a week of nothing
  // at all. Everything below this line is the live pace's.
  if (room.pace === 'async') return tickDuel(room, now);
  // P31: half an hour of nothing at all closes a room whatever phase it is in. First,
  // because a room this stale has nothing worth advancing.
  if (now - room.touchedAt > ROOM_IDLE_MS) return closeRoom(room);
  if (room.status === 'lobby') return tickLobby(room, now);
  let next = room;
  const edit = () => (next === room ? (next = clone(room)) : next);

  if (next.status === 'drafting') {
    // The hard bound (P31). Every remaining slot is filled at once rather than one per
    // sweep: past this point the room is not drafting any more, it is stuck, and the
    // answer to stuck is to finish it.
    if (now - (room.startedAt ?? room.touchedAt) > draftBoundMs(room)) {
      const w = edit();
      for (const m of w.members) forceCompleteOne(w, m, now);
      drawRound(w, now);
      return w;
    }

    // A WHOLE-DRAFT ROOM'S ONE CLOCK (P52). At zero every unfinished XI is completed for
    // its player - which is what the user asked for and what every other deadline in this
    // module does - and the room draws. There is nothing to do between now and then: a
    // budget draft has no windows to expire, so this branch is the whole of its timing.
    if (wholeDraft(room)) {
      const deadline = draftDeadlineOf(room);
      if (deadline !== null && now > deadline + PICK_GRACE_MS) {
        const w = edit();
        for (const m of w.members) forceCompleteOne(w, m, now);
        drawRound(w, now);
        return w;
      }
    } else {
      // Expired windows: fill one slot each, then open the next window. One slot per sweep
      // rather than the whole XI, so a player who comes back finds the draft where they
      // left it rather than finished.
      for (const m of room.members) {
        const w = room.windows[m.userId];
        if (!w || now <= deadlineOf(room, w) + PICK_GRACE_MS) continue;
        const r = edit();
        const mm = memberOf(r, m.userId)!;
        forceFillOne(r, mm, w, now);
        openWindow(r, mm, now);
      }
    }

    // Everyone finished: draw the bracket (P47). Deliberately AFTER the whole room is
    // done, even though a single tie could be played sooner, because that is what makes
    // the draft blind and the draw unarrangeable. What "finished" MEANS differs by method
    // and that is P52's whole point - see `draftDone`.
    const r = next === room ? room : next;
    if (r.members.every((m) => draftDone(r, m))) {
      const w = edit();
      drawRound(w, now);
      return w;
    }
    return next;
  }

  // A round is revealing. It advances when the last reveal window closes, whoever is
  // watching - the rule that stops one closed laptop freezing the room.
  const live = room.ties.filter((t) => t.round === room.round);
  const done = live.every((t) => now >= (t.revealFrom ?? 0) + (t.revealMs ?? 0));
  if (!done) return next;
  const w = edit();
  const alive = survivors(w);
  if (alive.length <= 1) {
    w.status = 'ended';
    w.championId = alive[0]?.userId;
    return w;
  }
  drawRound(w, now);
  return w;
}

/**
 * Give back the time an outage ate (plan P45).
 *
 * The referee writes a heartbeat; on start it reads the last one and shifts every open
 * window so that each player has exactly the time they had left when it died. Not a flat
 * shift by the outage length: what is owed is the REMAINDER, so a window that was five
 * seconds old when the process died reopens five seconds old, whether it was gone for
 * forty seconds or four.
 *
 * Without this, a thirty-second container restart means every open window is already past
 * its deadline the instant the process returns, so the very first sweep auto-picks for
 * every player in every drafting room at once - while those players were staring at a
 * frozen screen whose submissions were failing.
 *
 * Note what a naive recovery gets wrong, because it is the trap this is written against:
 * restoring the deadlines from the database is enough to have "not lost anybody's clock"
 * and still lose everybody's draft. The data survives; the fairness does not.
 *
 * The elapsed time is clamped into one window, so a crash-looping referee can never hand
 * out more than a full clock, and a heartbeat from the future cannot hand out a negative
 * one.
 */
export function recoverFromOutage(room: PvpRoom, lastSeenAt: number, now: number): PvpRoom {
  if (room.status !== 'drafting' || now <= lastSeenAt) return room;
  const next = clone(room);
  const window = next.pickSeconds * 1000;
  for (const userId of Object.keys(next.windows)) {
    const w = next.windows[userId];
    if (!w) continue;
    const elapsed = Math.min(Math.max(lastSeenAt - w.openedAt, 0), window);
    w.openedAt = now - elapsed;
  }
  return next;
}

/** A structural copy. The room is a plain tree of data, so this is enough, and it keeps
 *  every function above a pure transformation rather than a mutation of the caller's
 *  object - the same contract `domain/run.ts` keeps. */
function clone(room: PvpRoom): PvpRoom {
  return {
    ...room,
    members: room.members.map((m) => ({ ...m })),
    xi: Object.fromEntries(Object.entries(room.xi).map(([k, v]) => [k, { ...v }])),
    picks: Object.fromEntries(
      Object.entries(room.picks).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).map(([s, r]) => [s, { ...r }])),
      ]),
    ),
    deals: Object.fromEntries(Object.entries(room.deals).map(([k, v]) => [k, [...v]])),
    windows: Object.fromEntries(
      Object.entries(room.windows).map(([k, v]) => [k, v ? { ...v } : undefined]),
    ),
    ties: room.ties.map((t) => ({ ...t })),
  };
}
