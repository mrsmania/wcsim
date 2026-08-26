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
import type { FormationName, Style } from '../../src/domain/formations';
import { getFormation } from '../../src/domain/formations';
import { WORLD_CUP_YEARS } from '../../src/data/squads';
import { localVersion } from '../../src/domain/pvpVersion';
import {
  PICK_SECONDS,
  ROOM_SIZES,
  joinRoom,
  reduceSize,
  remainingBudget,
  rerollDeal,
  rerollsLeft,
  setLineup,
  startRoom,
  submitPick,
  tickRoom,
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
}

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const fail = (status: number, error: string, detail?: string): ApiResponse => ({
  status,
  body: detail ? { error, detail } : { error },
});

/** The view, with the two per-player figures the room can only work out for itself. */
function viewOf(room: PvpRoom, viewerId: string | null, now: number) {
  return roomView(
    room,
    viewerId,
    now,
    (u) => remainingBudget(room, u),
    (u) => rerollsLeft(room, u),
  );
}

// --- Validating what a host asked for --------------------------------------

const isYear = (y: unknown): y is number => typeof y === 'number' && WORLD_CUP_YEARS.includes(y);

/** A host's room settings, checked against what plan section 3 allows. Refusing here rather
 *  than clamping is deliberate: a room that quietly played by different rules than the ones
 *  its host chose is worse than a refused form. */
function readCreate(body: Record<string, unknown>, code: string, hostId: string): CreateInput | string {
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  const size = Number(body.size);
  if (!(ROOM_SIZES as readonly number[]).includes(size)) return 'size must be 2, 4 or 8';
  const method = body.method === 'roll' ? 'roll' : body.method === 'budget' ? 'budget' : null;
  if (!method) return 'method must be roll or budget';
  const pickSeconds = Number(body.pickSeconds);
  if (!(PICK_SECONDS as readonly number[]).includes(pickSeconds)) {
    return 'pickSeconds must be 20 or 30';
  }
  const budgetSource = body.budgetSource === 'career' ? 'career' : 'fixed';
  // P2 offers a career budget and P34 forbids the referee any privilege on `career`, so it
  // has no way to read the figure it would snapshot. Refused rather than silently treated
  // as fixed: see the plan's open point. Fixed rooms are unaffected.
  if (budgetSource === 'career') return 'career budgets are not available yet';
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
    visibility,
    size,
    method,
    budgetSource,
    budget,
    years,
    showRatings,
    rerolls,
    pickSeconds: pickSeconds as PickSeconds,
  };
}

// --- The router ------------------------------------------------------------

const ROOM_PATH = /^\/referee\/v1\/rooms\/([A-Za-z0-9]{4,12})(?:\/([a-z]+))?$/;

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

  const m = ROOM_PATH.exec(path);
  if (!m) return fail(404, 'no-such-route');
  const code = m[1]!.toUpperCase();
  const action = m[2] ?? '';

  if (req.method === 'GET' && !action) {
    const room = await deps.store.read(code);
    if (!room) return fail(404, 'no-such-room');
    if (!visibleTo(room, userId)) return fail(404, 'no-such-room');
    return ok(viewOf(room, userId, now));
  }
  if (req.method !== 'POST') return fail(405, 'no-such-route');

  switch (action) {
    case 'join':
      return join(deps, userId, code, now);
    case 'lineup':
      return lineup(req, deps, userId, code, now);
    case 'size':
      return size(req, deps, userId, code, now);
    case 'start':
      return command(deps, userId, code, now, (room) => startRoom(room, userId, now));
    case 'pick':
      return pick(req, deps, userId, code, now);
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
  const held = await deps.store.activeRoomOf(userId);
  if (held) return fail(409, 'already-in-a-room', held);

  // Retry on a code collision rather than reading first: the unique index is the arbiter,
  // and a read-then-write here is the same race the display name has.
  for (let attempt = 0; attempt < 5; attempt++) {
    const input = readCreate(req.body, deps.newCode(), userId);
    if (typeof input === 'string') return fail(422, 'bad-room', input);
    try {
      const room = await deps.store.create(input, now);
      return { status: 201, body: viewOf(room, userId, now), publish: room.code };
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
    const r = joinRoom(room, { userId, name, budget });
    return { room: r.room, result: r.outcome, unchanged: r.outcome !== 'ok' };
  });
  if (!out) return fail(404, 'no-such-room');
  if (out.result === 'full') return fail(409, 'room-full');
  if (out.result === 'started') return fail(409, 'room-started');
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
