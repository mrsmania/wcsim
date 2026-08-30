// Every instruction the referee takes, and what it does with it.
//
// Wave 3 of docs/pvp-plan.md. One pure-ish function over a `RoomStore` and a clock, so
// `npm run checks` drives whole rooms - a draft, an expiry, a tie - through these exact
// handlers with no Postgres and no socket. What is NOT here: the HTTP server (`main.ts`),
// the database (`pgStore.ts`) and the broadcast (`broadcast.ts`). Those three are the
// deployment; this is the behaviour.
//
// TWO RULES RUN THROUGH ALL OF IT.
//
// 1. THE CALLER IS THE TOKEN, NEVER THE BODY. Nothing here reads a user id out of a
//    request. `verifyToken` produces one or the request is refused, which is the whole
//    reason `pvpAuth` exists: in self-hosted Supabase the anon key is itself a valid
//    signature, so "the signature checked out" is not an answer to "who is this".
// 2. A COMMAND IS A TRANSITION, NOT AN EDIT. Every handler loads the room, calls one pure
//    function from `domain/pvpRoom.ts` and saves the result, all inside `store.mutate`'s
//    row lock. No handler reaches into a room and changes a field; if a rule is missing,
//    it belongs in the state machine, where it can be checked without a server.
//
// THE PICK REQUEST CARRIES A PLAYER ID, NOT A PLAYER. The plan says the client "posts an
// XI over the wire", and the referee never has to trust one: an id is looked up in the
// bundled dataset, so a submitted rating cannot decide a price and a submitted `positions`
// cannot decide eligibility. That is `validateXi`'s rule applied one step earlier, at the
// edge, where it costs nothing.

import { datasetPlayer } from '../../src/data/squads';
import type { Filled } from '../../src/domain/draft';
import type { FormationName, Style } from '../../src/domain/formations';
import { getFormation } from '../../src/domain/formations';
import { WORLD_CUP_YEARS } from '../../src/data/squads';
import { nameKeyOf } from '../../src/domain/displayName';
import { localVersion } from '../../src/domain/pvpVersion';
import {
  DEFAULT_DRAFT_SECONDS,
  DRAFT_SECONDS,
  PICK_SECONDS,
  ROOM_SIZES,
  XI_SLOTS,
  joinRoom,
  leaveRoom,
  reduceSize,
  remainingBudget,
  rerollDeal,
  rerollsLeft,
  setBots,
  setDone,
  setLineup,
  setXi,
  startRoom,
  submitPick,
  tickRoom,
  type DraftSeconds,
  type PickSeconds,
  type PvpRoom,
  type RoomSize,
} from '../../src/domain/pvpRoom';
import { bearerOf, verifyToken } from './jwt';
import { recoverIfNeeded } from './outage';
import type { CreateInput, RoomStore } from './store';
import { roomView } from './view';

export interface ApiRequest {
  method: string;
  path: string;
  body: Record<string, unknown>;
  /** The raw `Authorization` header. */
  authorization?: string | null;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /** Room codes whose state changed and should be published (P33). The handler decides,
   *  because the handler is the only thing that knows whether anything happened - "the
   *  referee must remember to publish after every write" is the cost Broadcast charges,
   *  and returning it rather than doing it is what keeps this file testable. */
  publish?: string;
}

export interface ApiDeps {
  store: RoomStore;
  now: () => number;
  jwtSecret: string;
  jwtAudience?: string;
  sweepMs: number;
  /** Six characters. Injected so a check can make them predictable. */
  newCode: () => string;
  /** A practice opponent's id. Injected for the same reason `newCode` is, and it is a UUID
   *  because `pvp_bots.bot_id` is one - a bot is addressed exactly like a member everywhere
   *  above the database, so its id has to be the same shape as a member's. */
  newBotId: () => string;
}

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const fail = (status: number, error: string, detail?: string): ApiResponse => ({
  status,
  body: detail ? { error, detail } : { error },
});

/** The view, with the two per-player figures the room can only work out for itself. */
function viewOf(
  room: PvpRoom,
  viewerId: string | null,
  now: number,
  /** The display name of the person a duel is addressed to. Looked up by the handler when
   *  it has one to hand; the screens fall back to "somebody" rather than to a blank, so an
   *  answer without it is a plainer sentence and never a broken one. */
  invitedName?: string | null,
) {
  return roomView(
    room,
    viewerId,
    now,
    (u) => remainingBudget(room, u),
    (u) => rerollsLeft(room, u),
    invitedName,
  );
}

// --- Validating what a host asked for --------------------------------------

const isYear = (y: unknown): y is number => typeof y === 'number' && WORLD_CUP_YEARS.includes(y);

/** A host's room settings, checked against what plan section 3 allows. Refusing here rather
 *  than clamping is deliberate: a room that quietly played by different rules than the ones
 *  its host chose is worse than a refused form. */
function readCreate(
  body: Record<string, unknown>,
  code: string,
  hostId: string,
  /** Resolved by the caller, because it needs a query: the account a duel is addressed to.
   *  Null for a live room and for a duel opened to whoever has the link. */
  invitedId: string | null,
): CreateInput | string {
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  // A DUEL IS TWO PEOPLE, PRIVATE, AND HAS NO CLOCK. Those are not settings the host is
  // offered and then quietly overridden - the create form does not show them - but they are
  // forced here as well, because this is the edge and the edge is what has to be true.
  const pace = body.pace === 'async' ? 'async' : 'live';
  const size = pace === 'async' ? 2 : Number(body.size);
  if (!(ROOM_SIZES as readonly number[]).includes(size)) return 'size must be 2, 4 or 8';
  const method = body.method === 'roll' ? 'roll' : body.method === 'budget' ? 'budget' : null;
  if (!method) return 'method must be roll or budget';
  // A duel keeps a pick_seconds column because the table has one and it is `not null`; it
  // decides nothing there, since no window ever expires (`tickDuel`).
  const pickSeconds = pace === 'async' ? PICK_SECONDS[0] : Number(body.pickSeconds);
  if (!(PICK_SECONDS as readonly number[]).includes(pickSeconds)) {
    return 'pickSeconds must be 20 or 30';
  }
  // The whole-draft clock (P52). A ROLL room stores the default and never reads it, the
  // same way a budget room stores a pick clock it never reads: both columns are `not
  // null`, and a room can never change method, so neither value can come to mean anything.
  const draftSeconds =
    body.draftSeconds === undefined ? DEFAULT_DRAFT_SECONDS : Number(body.draftSeconds);
  if (!(DRAFT_SECONDS as readonly number[]).includes(draftSeconds)) {
    return 'draftSeconds must be 180, 300 or 480';
  }
  // There is ONE kind of budget: a figure the host picks, the same for everybody in the
  // room (P2, settled by deletion 2026-08-27). A room priced off each player's own career
  // was the alternative, and it contradicted P34 - the referee may not read a `career` row,
  // and snapshotting the figure still means reading it. It was also decided before a ball
  // was kicked: $160 beats $70 85.7% of the time.
  const budget = method === 'budget' ? Number(body.budget) : 0;
  if (method === 'budget' && !(Number.isInteger(budget) && budget >= 70 && budget <= 200)) {
    return 'budget must be $70 to $200';
  }
  const rerolls = body.rerolls === undefined ? 3 : Number(body.rerolls);
  if (!(Number.isInteger(rerolls) && rerolls >= 0 && rerolls <= 6)) return 'rerolls must be 0 to 6';
  const years = Array.isArray(body.years) ? body.years.filter(isYear) : [];
  if (Array.isArray(body.years) && years.length !== body.years.length) {
    return 'years must be World Cups this build knows';
  }
  // P5: the switch exists in roll rooms only, because a budget room shows a price computed
  // straight from the rating it would be hiding.
  const showRatings = method === 'budget' ? true : body.showRatings !== false;
  return {
    code,
    hostId,
    // A duel is never listed: it is a challenge to one person, and the public list is for
    // rooms anybody may walk into.
    visibility: pace === 'async' ? 'private' : visibility,
    size,
    method,
    budget,
    years,
    showRatings,
    rerolls,
    pickSeconds: pickSeconds as PickSeconds,
    draftSeconds: draftSeconds as DraftSeconds,
    pace,
    invitedId,
  };
}

// --- The router ------------------------------------------------------------

const ROOM_PATH = /^\/referee\/v1\/rooms\/([A-Za-z0-9]{4,12})(?:\/([a-z]+))?$/;

/** How many public rooms a listing returns. A lobby is a thing you scan, not a thing you
 *  page through: past a screenful the answer is "make one" rather than "keep scrolling". */
const LOBBY_LIMIT = 30;

/** How many duels a list returns. More than a lobby's, because these are YOURS: a lobby is
 *  a thing you scan and this is a thing you keep, and a duel a week old still resolves. */
const DUEL_LIMIT = 50;

export async function handle(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  const now = deps.now();
  const path = req.path.replace(/\/+$/, '') || '/';

  // Unauthenticated, both of them, and deliberately: the version handshake is what a client
  // asks BEFORE it has anything to authenticate with a working room, and a health check the
  // gateway has to make without a session.
  if (req.method === 'GET' && (path === '/referee/version' || path === '/referee/v1/version')) {
    return ok(localVersion());
  }
  if (req.method === 'GET' && path === '/referee/v1/health') {
    return ok({ ok: true, at: now });
  }

  const verdict = verifyToken(
    bearerOf(req.authorization),
    deps.jwtSecret,
    now,
    deps.jwtAudience,
  );
  if (!verdict.ok || !verdict.userId) {
    // The faults are returned because they are how a deployment is debugged: "the anon key
    // was used" and "the session expired" look identical from the outside and need
    // different fixes. They say nothing a caller did not already send.
    return fail(401, 'unauthorized', [verdict.tokenFault, ...verdict.faults].filter(Boolean).join(','));
  }
  const userId = verdict.userId;

  if (req.method === 'POST' && path === '/referee/v1/rooms') return create(req, deps, userId, now);

  // The lobby list (P18). It needs a session like everything else - a room is account-only
  // - but it deliberately does NOT need a seat: that is the whole point of a public room,
  // and it is the one read in this file that answers about rooms the caller is not in.
  if (req.method === 'GET' && path === '/referee/v1/lobby') {
    return ok({ rooms: await deps.store.publicLobbies(LOBBY_LIMIT) });
  }

  // Your duels (P51): the ones you are in, and the ones somebody has challenged you to.
  // It is the only way an unanswered challenge is ever seen - there is no mail and no push
  // notification in this game - so it is the feature's front door rather than a listing
  // beside it.
  if (req.method === 'GET' && path === '/referee/v1/duels') {
    return ok({ duels: await deps.store.myDuels(userId, DUEL_LIMIT) });
  }

  const m = ROOM_PATH.exec(path);
  if (!m) return fail(404, 'no-such-route');
  const code = m[1]!.toUpperCase();
  const action = m[2] ?? '';

  if (req.method === 'GET' && !action) {
    const room = await deps.store.read(code);
    if (!room) return fail(404, 'no-such-room');
    if (!visibleTo(room, userId)) return fail(404, 'no-such-room');
    // The name of whoever the challenge is addressed to, while it is outstanding: it is
    // the sentence the screen is made of ("waiting for Mario"), and the referee is the one
    // thing that may read a display name.
    const invitedName =
      room.invitedId && !room.members.some((m) => m.userId === room.invitedId)
        ? await deps.store.displayName(room.invitedId)
        : null;
    return ok(viewOf(room, userId, now, invitedName));
  }
  if (req.method !== 'POST') return fail(405, 'no-such-route');

  switch (action) {
    case 'join':
      return join(deps, userId, code, now);
    case 'lineup':
      return lineup(req, deps, userId, code, now);
    case 'size':
      return size(req, deps, userId, code, now);
    case 'bots':
      return bots(req, deps, userId, code, now);
    case 'start':
      return command(deps, userId, code, now, (room) => startRoom(room, userId, now));
    case 'leave':
      // A lobby seat given up for real (P39). It is a no-op once the room has started,
      // where an XI is in a bracket other people are playing - so the command always
      // answers with the room rather than refusing, and the screen says which it was.
      return command(deps, userId, code, now, (room) => leaveRoom(room, userId, now));
    case 'pick':
      return pick(req, deps, userId, code, now);
    // The whole board at once (P52), which is how a budget room drafts: buying, moving and
    // un-buying are all "here is my XI now", so they are one instruction rather than three.
    case 'xi':
      return setBoard(req, deps, userId, code, now);
    // "I am through". A whole-draft room cannot read a full XI as a finished one, or the
    // move and the un-buy it exists to allow would be unusable by whoever fills their last
    // slot last. See `RoomMember.done`.
    case 'done':
      return command(deps, userId, code, now, (room) =>
        setDone(room, userId, req.body.done !== false, now),
      );
    case 'reroll':
      return command(deps, userId, code, now, (room) => rerollDeal(room, userId, now));
    case 'seen':
      await deps.store.seen(code, userId, now);
      return ok({ ok: true });
    default:
      return fail(404, 'no-such-route');
  }
}

/** The same rule migration 0016's `pvp_rooms_visible` policy states, restated for the
 *  referee's own reads: a public lobby is open to anybody signed in, everything else is
 *  members only. A room you may not see answers 404 rather than 403, so a private code
 *  cannot be confirmed by probing. */
function visibleTo(room: PvpRoom, userId: string): boolean {
  if (room.visibility === 'public' && room.status === 'lobby') return true;
  // A CHALLENGE IS VISIBLE TO THE PERSON IT NAMES, before they have accepted anything.
  // Without this the one screen the whole feature depends on - "somebody has challenged
  // you, here is what they are playing" - would answer "no such room" to its own
  // recipient, and a duel could only ever be accepted blind.
  if (room.invitedId === userId) return true;
  return room.members.some((x) => x.userId === userId);
}

// --- Handlers --------------------------------------------------------------

async function create(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  now: number,
): Promise<ApiResponse> {
  const name = await deps.store.displayName(userId);
  if (!name) return fail(409, 'no-display-name');
  const duel = req.body.pace === 'async';
  // P39 IS ABOUT LIVE ROOMS ONLY (P51). It exists because a live room needs you present, so
  // holding two holds one of them up; a duel needs nobody present, so several at once is
  // the feature. `activeRoomOf` already answers about live rooms alone, and a duel does not
  // ask it at all - being in one must not stop you opening a room either.
  if (!duel) {
    const held = await deps.store.activeRoomOf(userId);
    if (held) return fail(409, 'already-in-a-room', held);
  }

  // WHO IT IS ADDRESSED TO, resolved on the normalised key (P22) - which is what uniqueness
  // is on, so one name is one account. A challenge to a name nobody has is refused rather
  // than opened to anybody: "I challenged Mario" and "I opened a room" are different
  // intentions and only one of them was expressed.
  let invitedId: string | null = null;
  const opponent = typeof req.body.opponent === 'string' ? req.body.opponent.trim() : '';
  if (duel && opponent) {
    const found = await deps.store.findByName(nameKeyOf(opponent));
    if (!found) return fail(404, 'no-such-player', opponent);
    if (found === userId) return fail(422, 'bad-room', 'you cannot challenge yourself');
    invitedId = found;
  }

  // Retry on a code collision rather than reading first: the unique index is the arbiter,
  // and a read-then-write here is the same race the display name has.
  for (let attempt = 0; attempt < 5; attempt++) {
    const input = readCreate(req.body, deps.newCode(), userId, invitedId);
    if (typeof input === 'string') return fail(422, 'bad-room', input);
    try {
      const room = await deps.store.create(input, now);
      const invitedName = invitedId ? await deps.store.displayName(invitedId) : null;
      return {
        status: 201,
        body: viewOf(room, userId, now, invitedName),
        publish: room.code,
      };
    } catch (err) {
      if (!isDuplicate(err)) throw err;
    }
  }
  return fail(503, 'no-code-available');
}

/** A unique-violation, whatever the driver wrapped it in. */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

async function join(
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const name = await deps.store.displayName(userId);
  if (!name) return fail(409, 'no-display-name');
  const held = await deps.store.activeRoomOf(userId);
  if (held && held !== code) return fail(409, 'already-in-a-room', held);

  const out = await deps.store.mutate(code, now, (room) => {
    const budget = room.rules.method === 'budget' ? room.rules.budget : 0;
    const r = joinRoom(room, { userId, name, budget }, now);
    return { room: r.room, result: r.outcome, unchanged: r.outcome !== 'ok' };
  });
  if (!out) return fail(404, 'no-such-room');
  if (out.result === 'full') return fail(409, 'room-full');
  if (out.result === 'started') return fail(409, 'room-started');
  // A challenge addressed to somebody else. Its own refusal rather than "full", because
  // the two mean completely different things to whoever is reading: one room filled up,
  // the other was never yours to walk into.
  if (out.result === 'not-invited') return fail(403, 'not-invited');
  return { status: 200, body: viewOf(out.room, userId, now), publish: code };
}

async function lineup(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const formationName = String(req.body.formationName ?? '') as FormationName;
  const style = String(req.body.style ?? '') as Style;
  if (!getFormation(formationName, style)) return fail(422, 'bad-formation');
  const ready = req.body.ready !== false;
  return command(deps, userId, code, now, (room) => setLineup(room, userId, formationName, style, ready));
}

async function size(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const want = Number(req.body.size);
  if (!(ROOM_SIZES as readonly number[]).includes(want)) return fail(422, 'bad-size');
  return command(deps, userId, code, now, (room) => reduceSize(room, userId, want as RoomSize));
}

/**
 * How many practice opponents sit in this room.
 *
 * A TARGET, not "add one", so a tap that arrives twice fills the room once - the same
 * idempotence the pick ordinal has (P36) and for the same reason: this is a mobile link.
 * The upper bound is checked here against what the ROUTE can be asked for and again inside
 * `setBots` against the room's free seats, because only the room knows how many people are
 * already sitting in it.
 */
async function bots(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const count = Number(req.body.count);
  const most = ROOM_SIZES[ROOM_SIZES.length - 1]!;
  if (!(Number.isInteger(count) && count >= 0 && count <= most)) return fail(422, 'bad-bots');
  return command(deps, userId, code, now, (room) =>
    setBots(room, userId, count, now, deps.newBotId),
  );
}

/**
 * A whole board (P52).
 *
 * NOTHING TRUSTS THE SUBMITTED PLAYER, exactly as a pick does not: what arrives is a map
 * of slot to player ID, and every id is resolved in the referee's own dataset before the
 * rules see it - a submitted rating would otherwise decide a price and submitted positions
 * would decide eligibility, both from a browser. An id the dataset does not hold refuses
 * the whole board rather than being dropped, because dropping it would answer a player's
 * "here is my XI" with a different XI and call it success.
 */
async function setBoard(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const sent = req.body.xi;
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return fail(422, 'bad-xi');
  const entries = Object.entries(sent as Record<string, unknown>);
  if (entries.length > XI_SLOTS) return fail(422, 'bad-xi', 'more than eleven slots');
  const filled: Filled = {};
  for (const [slotId, id] of entries) {
    if (id === null || id === undefined) continue;
    const player = datasetPlayer(String(id));
    if (!player) return fail(422, 'unknown-player', 'the referee does not have this player');
    filled[slotId] = player;
  }

  const out = await deps.store.mutate(code, now, (room, ctx) => {
    const base = recoverIfNeeded(room, ctx.sweptAt, now, deps.sweepMs);
    const r = setXi(base, userId, filled, now);
    // Swept in the same transaction, exactly as a pick is: the submission that makes the
    // last player's board legal must not wait a sweep to draw the round.
    const ticked = tickRoom(r.room, now);
    return { room: ticked, result: r.outcome, unchanged: r.outcome !== 'ok' && ticked === base };
  });
  if (!out) return fail(404, 'no-such-room');
  const view = viewOf(out.room, userId, now);
  switch (out.result) {
    case 'ok':
      return { status: 200, body: { outcome: 'ok', room: view }, publish: code };
    case 'closed':
      return { status: 409, body: { error: 'draft-closed', outcome: 'closed', room: view } };
    default:
      return { status: 422, body: { error: 'illegal', outcome: 'illegal', room: view } };
  }
}

async function pick(
  req: ApiRequest,
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
): Promise<ApiResponse> {
  const ordinal = Number(req.body.ordinal);
  const slotId = String(req.body.slotId ?? '');
  const player = datasetPlayer(String(req.body.playerId ?? ''));
  if (!Number.isInteger(ordinal) || ordinal < 1) return fail(422, 'bad-ordinal');
  // An id the referee's dataset does not hold. Almost always a version drift (P35) rather
  // than an attack, and the detail says so, because "illegal pick" would send whoever is
  // debugging it to look at the formation.
  if (!player) return fail(422, 'unknown-player', 'the referee does not have this player');

  const out = await deps.store.mutate(code, now, (room, ctx) => {
    // A pick is the other place a deadline is evaluated (P32), so it recovers first: a pick
    // arriving in the first moments after a restart must be judged against the window the
    // player can actually see, not against one that expired while the process was down.
    const base = recoverIfNeeded(room, ctx.sweptAt, now, deps.sweepMs);
    const r = submitPick(base, userId, { ordinal, slotId, player }, now);
    // Sweep in the same transaction, so the pick that completes an XI draws the bracket
    // now rather than up to a sweep later. `tickRoom` returns its argument when nothing is
    // due, so this costs nothing the rest of the time.
    const ticked = tickRoom(r.room, now);
    return { room: ticked, result: r.outcome, unchanged: r.outcome !== 'ok' && ticked === base };
  });
  if (!out) return fail(404, 'no-such-room');
  const view = viewOf(out.room, userId, now);
  switch (out.result) {
    case 'ok':
    case 'replay':
      return { status: 200, body: { outcome: out.result, room: view }, publish: code };
    case 'late':
      return { status: 409, body: { error: 'late', outcome: 'late', room: view } };
    case 'no-window':
      return { status: 409, body: { error: 'no-window', outcome: 'no-window', room: view } };
    default:
      return { status: 422, body: { error: 'illegal', outcome: 'illegal', room: view } };
  }
}

/** The shape every simple command shares: mutate, and answer with the room the caller may
 *  see. A transition that refuses returns its argument unchanged, which is why none of them
 *  needs an error path - the room comes back saying what happened. */
async function command(
  deps: ApiDeps,
  userId: string,
  code: string,
  now: number,
  fn: (room: PvpRoom) => PvpRoom,
): Promise<ApiResponse> {
  const out = await deps.store.mutate(code, now, (room) => {
    const next = fn(room);
    return { room: next, result: next !== room, unchanged: next === room };
  });
  if (!out) return fail(404, 'no-such-room');
  const body = viewOf(out.room, userId, now);
  return out.result ? { status: 200, body, publish: code } : { status: 200, body };
}
