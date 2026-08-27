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
import { getFormation, type FormationName, type Formation, type Style } from './formations';
import type { Filled } from './draft';
import { rollAny } from './draft';
import { HALF_TIME_MS, PEN_MS, STEP_MS, maxMinute, type MatchSpeed } from './clock';
import { resolveKoTie, type KoTieResult } from './knockout';
import { shuffled } from './random';
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
export const SEEN_GONE_MS = 90_000;
/** A lobby nobody has touched for a quarter of an hour is not going to fill. */
export const LOBBY_IDLE_MS = 15 * 60_000;
/** And any room at all, in any phase, is over after half an hour of nothing. */
export const ROOM_IDLE_MS = 30 * 60_000;
/** The draft's hard bound: eleven windows plus a minute. The per-window auto-pick already
 *  guarantees a draft finishes, so this is a backstop for the case where it somehow does
 *  not - a room stuck in the one phase built to be unstallable is the worst outcome
 *  available, so it is worth having a second answer. */
export const DRAFT_SLACK_MS = 60_000;
/** Slots in an XI. Every formation has eleven; the pick clock's bound is counted in them. */
const XI_SLOTS = 11;

/** Room sizes (plan P7). A host may reduce before the start, never increase. */
export const ROOM_SIZES = [2, 4, 8] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];

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
  /** When this player was last known to be here (P31). Written by the client's ping, read
   *  by the sweeper: a member unseen for `SEEN_GONE_MS` is dropped from a LOBBY, which is
   *  the only phase where dropping somebody is the right answer - past the start their XI
   *  plays on without them, because the alternative is one absent person voiding a
   *  tournament seven other people are in. */
  lastSeen: number;
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
  size: RoomSize;
  rules: RoomRules;
  pickSeconds: PickSeconds;
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
  hostBudget: number;
  /** Both optional and both defaulted to the values plan section 3 gives, so a caller that
   *  does not care about presentation does not have to say so. */
  showRatings?: boolean;
  rerolls?: number;
  /** When the room was opened. P31 counts from it, and `now` is an argument here for the
   *  same reason it is everywhere else in this module. */
  now: number;
}): PvpRoom {
  return {
    id: input.id,
    code: input.code,
    visibility: input.visibility,
    hostId: input.hostId,
    size: input.size,
    rules: input.rules,
    pickSeconds: input.pickSeconds,
    showRatings: input.showRatings ?? true,
    rerolls: input.rerolls ?? DEFAULT_REROLLS,
    status: 'lobby',
    members: [newMember(input.hostId, 0, input.hostName, input.hostBudget, input.now)],
    xi: {},
    picks: {},
    deals: {},
    windows: {},
    ties: [],
    round: 0,
    touchedAt: input.now,
  };
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

export type JoinOutcome = 'ok' | 'full' | 'started' | 'already-in';

export function joinRoom(
  room: PvpRoom,
  member: { userId: string; name: string; budget: number },
  now: number,
): { room: PvpRoom; outcome: JoinOutcome } {
  if (room.status !== 'lobby') return { room, outcome: 'started' };
  if (memberOf(room, member.userId)) return { room, outcome: 'already-in' };
  if (room.members.length >= room.size) return { room, outcome: 'full' };
  const next = clone(room);
  // The next FREE seat, not the member count. A lobby can now lose somebody to P31's
  // liveness sweep, which leaves a gap, and `pvp_members` has a unique index on (room,
  // seat) - so counting would hand the newcomer a number somebody else still holds. Seats
  // are labels that decide nothing (the draw is random, P47), so a gap costs nothing.
  const seat = next.members.reduce((max, m) => Math.max(max, m.seat + 1), 0);
  next.members.push(newMember(member.userId, seat, member.name, member.budget, now));
  return { room: next, outcome: 'ok' };
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
  for (const m of next.members) {
    next.xi[m.userId] = {};
    next.picks[m.userId] = {};
    if (next.rules.method === 'roll') next.deals[m.userId] = [];
    openWindow(next, m, now);
  }
  return next;
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
  if (now > deadlineOf(room, w) + PICK_GRACE_MS) return { room, outcome: 'late' };

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
  if (now > deadlineOf(room, w) + PICK_GRACE_MS) return room;
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
  const here = room.members.filter((m) => now - m.lastSeen <= SEEN_GONE_MS);
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
  // Nobody is left. Nothing to promote and nothing to wait for.
  if (!room.members.some((m) => keep.has(m.userId))) return closeRoom(room);
  const next = clone(room);
  next.members = next.members.filter((m) => keep.has(m.userId));
  if (!next.members.some((m) => m.userId === next.hostId)) {
    // The lowest remaining seat, which is the earliest of the people still here.
    next.hostId = next.members.reduce((a, b) => (a.seat <= b.seat ? a : b)).userId;
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
 * One sweep. Call it when a pick arrives and every second or two otherwise; it is the
 * only thing that moves a room forward, and it holds no state of its own.
 *
 * Returns the same object when nothing was due, so a caller can skip a write on identity
 * rather than by diffing - the pattern `prepareGroupStage` uses for a resumed run.
 */
export function tickRoom(room: PvpRoom, now: number): PvpRoom {
  if (room.status === 'ended') return room;
  // P31: half an hour of nothing at all closes a room whatever phase it is in. First,
  // because a room this stale has nothing worth advancing.
  if (now - room.touchedAt > ROOM_IDLE_MS) return closeRoom(room);
  if (room.status === 'lobby') return tickLobby(room, now);
  let next = room;
  const edit = () => (next === room ? (next = clone(room)) : next);

  if (next.status === 'drafting') {
    // The hard bound (P31). Eleven windows plus slack, and every remaining slot is filled
    // at once rather than one per sweep: past this point the room is not drafting any
    // more, it is stuck, and the answer to stuck is to finish it.
    if (now - (room.startedAt ?? room.touchedAt) > XI_SLOTS * room.pickSeconds * 1000 + DRAFT_SLACK_MS) {
      const w = edit();
      for (const m of w.members) forceCompleteOne(w, m, now);
      drawRound(w, now);
      return w;
    }

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

    // Everyone finished: draw the bracket (P47). Deliberately AFTER the whole room is
    // done, even though a single tie could be played sooner, because that is what makes
    // the draft blind and the draw unarrangeable.
    const r = next === room ? room : next;
    if (r.members.every((m) => xiComplete(r, m))) {
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
