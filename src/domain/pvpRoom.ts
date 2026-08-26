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
  /** The round they went out in, absent while still in. */
  outIn?: number;
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
  status: RoomStatus;
  members: RoomMember[];
  /** Each player's XI as a slot map (P42), which is what lets a move be expressed. */
  xi: Record<string, Filled>;
  /** Squads dealt to each roll-room player, oldest first. One at a time (P13): the whole
   *  sequence up front would let a player read every future squad off their own row. */
  deals: Record<string, string[]>;
  windows: Record<string, PickWindow | undefined>;
  ties: PvpTie[];
  round: number;
  championId?: string;
  startedAt?: number;
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
}): PvpRoom {
  return {
    id: input.id,
    code: input.code,
    visibility: input.visibility,
    hostId: input.hostId,
    size: input.size,
    rules: input.rules,
    pickSeconds: input.pickSeconds,
    status: 'lobby',
    members: [
      {
        userId: input.hostId,
        seat: 0,
        name: input.hostName,
        ready: false,
        formationName: DEFAULT_FORMATION,
        style: DEFAULT_STYLE,
        budget: input.hostBudget,
      },
    ],
    xi: {},
    deals: {},
    windows: {},
    ties: [],
    round: 0,
  };
}

export type JoinOutcome = 'ok' | 'full' | 'started' | 'already-in';

export function joinRoom(
  room: PvpRoom,
  member: { userId: string; name: string; budget: number },
): { room: PvpRoom; outcome: JoinOutcome } {
  if (room.status !== 'lobby') return { room, outcome: 'started' };
  if (memberOf(room, member.userId)) return { room, outcome: 'already-in' };
  if (room.members.length >= room.size) return { room, outcome: 'full' };
  const next = clone(room);
  next.members.push({
    userId: member.userId,
    seat: next.members.length,
    name: member.name,
    ready: false,
    formationName: DEFAULT_FORMATION,
    style: DEFAULT_STYLE,
    budget: member.budget,
  });
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
  openWindow(next, memberOf(next, userId)!, now);
  return { room: next, outcome: 'ok' };
}

/** Re-roll a roll room's dealt squad. It does NOT restart the clock (plan section 4):
 *  otherwise re-rolling is a way to stall for ever, which is the exact thing the clock
 *  exists to prevent. */
export function rerollDeal(room: PvpRoom, userId: string, now: number): PvpRoom {
  if (room.status !== 'drafting' || room.rules.method !== 'roll') return room;
  const m = memberOf(room, userId);
  const w = room.windows[userId];
  if (!m || !w) return room;
  if (now > deadlineOf(room, w) + PICK_GRACE_MS) return room;
  const next = clone(room);
  dealNext(next, memberOf(next, userId)!);
  return next;
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
function forceFillOne(room: PvpRoom, m: RoomMember): void {
  const f = formationOf(m);
  const fill = (dealt: string[] | undefined, rules: RoomRules): boolean => {
    const made = autoPick(f, room.xi[m.userId] ?? {}, rules, {
      remaining: remainingBudget(room, m.userId),
      dealt,
    });
    if (!made) return false;
    (room.xi[m.userId] ??= {})[made.slotId] = made.player;
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
 * One sweep. Call it when a pick arrives and every second or two otherwise; it is the
 * only thing that moves a room forward, and it holds no state of its own.
 *
 * Returns the same object when nothing was due, so a caller can skip a write on identity
 * rather than by diffing - the pattern `prepareGroupStage` uses for a resumed run.
 */
export function tickRoom(room: PvpRoom, now: number): PvpRoom {
  if (room.status === 'lobby' || room.status === 'ended') return room;
  let next = room;
  const edit = () => (next === room ? (next = clone(room)) : next);

  if (next.status === 'drafting') {
    // Expired windows: fill one slot each, then open the next window. One slot per sweep
    // rather than the whole XI, so a player who comes back finds the draft where they
    // left it rather than finished.
    for (const m of room.members) {
      const w = room.windows[m.userId];
      if (!w || now <= deadlineOf(room, w) + PICK_GRACE_MS) continue;
      const r = edit();
      const mm = memberOf(r, m.userId)!;
      forceFillOne(r, mm);
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
    deals: Object.fromEntries(Object.entries(room.deals).map(([k, v]) => [k, [...v]])),
    windows: Object.fromEntries(
      Object.entries(room.windows).map(([k, v]) => [k, v ? { ...v } : undefined]),
    ),
    ties: room.ties.map((t) => ({ ...t })),
  };
}
