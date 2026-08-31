// Characterization checks for wave 3 of docs/pvp-plan.md: the referee as a deployable
// thing, the display-name rule, and the version handshake.
//
// THE WHOLE REFEREE IS DRIVEN HERE, with no Postgres and no socket. `api.handle` and
// `sweepOnce` take a `RoomStore`, so the store below is a `Map` - and it keeps rooms AS
// ROWS, converting through `referee/src/rows.ts` on every load and save. That is deliberate
// and it is the highest-value decision in this file: the row mapping is then exercised by
// every check here rather than by one dedicated round trip, so a column the writer forgets
// shows up as a room that comes back wrong somewhere unrelated, which is exactly where a
// silent bug should surface.
//
// The two done-whens the plan states for this wave are both here, offline: two players see
// each other in a room, and a 45-second outage gives every open window back the time it had
// left rather than auto-picking for everybody. What cannot be checked here is the half that
// is a deployment - Realtime, the gateway route, the role's password - and the roadmap item
// for the apply says so rather than this file pretending otherwise.

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { KNOWN_CODES, refereeMessage } from '../../src/components/versus/refereeMessage';
import { RefereeError } from '../../src/state/pvp/referee';
import { check } from './harness';
import { SQUADS, datasetPlayer } from '../../src/data/squads';
import { getFormation } from '../../src/domain/formations';
import {
  NAME_MAX,
  codeOf,
  nameKeyOf,
  normalizeName,
  validateName,
} from '../../src/domain/displayName';
import {
  PVP_PROTOCOL,
  datasetHash,
  hashOfSquads,
  localVersion,
  versionMismatch,
} from '../../src/domain/pvpVersion';
import { autoPick, pvpPriceOf, validateXi } from '../../src/domain/pvp';
import { leaveKind } from '../../src/domain/pvpView';
import type { Filled } from '../../src/domain/draft';
import {
  DEFAULT_DRAFT_SECONDS,
  DUEL_IDLE_MS,
  ROOM_IDLE_MS,
  XI_SLOTS,
  createRoom,
  deadlineOf,
  formationOf,
  recoverFromOutage,
  roomClosed,
  tickRoom,
  type PickSeconds,
  type PvpRoom,
  type RoomSize,
} from '../../src/domain/pvpRoom';
import { handle, type ApiDeps, type ApiResponse } from '../../referee/src/api';
import { readEnv } from '../../referee/src/env';
import { recoverIfNeeded, wasOutage } from '../../referee/src/outage';
import { atOf, msOf, roomFromRows, rowsFromRoom, type RoomRows } from '../../referee/src/rows';
import { recoverAtBoot, sweepOnce } from '../../referee/src/sweeper';
import type {
  CreateInput,
  DuelListRow,
  LobbyRow,
  Mutation,
  MutateContext,
  RoomStore,
} from '../../referee/src/store';
import type { RoomView } from '../../referee/src/view';

const SECRET = 'a-test-jwt-secret-that-is-long-enough';
const T0 = 1_700_000_000_000;
const SWEEP_MS = 1000;

// --- A store that is a Map of ROWS -----------------------------------------

class MemStore implements RoomStore {
  rows = new Map<string, RoomRows>();
  swept = new Map<string, number | null>();
  names: Record<string, string | null> = {};
  private nextId = 1;

  async create(input: CreateInput, now: number): Promise<PvpRoom> {
    if (this.rows.has(input.code)) throw Object.assign(new Error('duplicate'), { code: '23505' });
    const room = createRoom({
      id: String(this.nextId++),
      code: input.code,
      hostId: input.hostId,
      hostName: this.names[input.hostId] ?? '',
      visibility: input.visibility,
      size: input.size as RoomSize,
      rules: { method: input.method, budget: input.budget, years: input.years },
      pickSeconds: input.pickSeconds as PickSeconds,
      hostBudget: input.method === 'budget' ? input.budget : 0,
      showRatings: input.showRatings,
      rerolls: input.rerolls,
      pace: input.pace,
      now,
    });
    this.put(room, now);
    return room;
  }

  private put(room: PvpRoom, sweptAt: number | null): void {
    const rows = rowsFromRoom(room, { sweptAt, displayNames: this.names });
    // `touched_at` IS THE WRITE'S OWN TIME, exactly as `pgStore`'s `save` sets it: the
    // column answers "when did anything last happen here", which is a fact about the save
    // rather than a field the state machine carries. Mirroring it matters most for a duel,
    // whose one deadline is a week of nothing - without this a duel played over three
    // evenings would close itself on the third.
    if (sweptAt !== null) rows.room.touched_at = atOf(sweptAt);
    this.rows.set(room.code, rows);
    this.swept.set(room.code, sweptAt);
  }

  async read(code: string): Promise<PvpRoom | null> {
    const rows = this.rows.get(code);
    return rows ? roomFromRows(rows) : null;
  }

  async mutate<T>(
    code: string,
    now: number,
    fn: (room: PvpRoom, ctx: MutateContext) => Mutation<T>,
  ): Promise<Mutation<T> | null> {
    const rows = this.rows.get(code);
    if (!rows) return null;
    const out = fn(roomFromRows(rows), { sweptAt: this.swept.get(code) ?? null });
    // Exactly what pgStore does: an unchanged room still stamps its heartbeat, because
    // that stamp is what P45's recovery reads.
    if (out.unchanged) this.swept.set(code, now);
    else this.put(out.room, now);
    return out;
  }

  async liveCodes(): Promise<string[]> {
    // Lobbies included, exactly as `pgStore` does: P31's liveness is this same sweeper.
    return [...this.rows.values()]
      .filter((r) => r.room.status !== 'ended')
      .map((r) => r.room.code);
  }

  async publicLobbies(limit: number): Promise<LobbyRow[]> {
    return [...this.rows.values()]
      .filter((r) => r.room.visibility === 'public' && r.room.status === 'lobby')
      .map((r) => ({
        code: r.room.code,
        size: r.room.size,
        // People, and the practice opponents counted apart - exactly the two `pgStore`'s
        // query counts, and for the reason `LobbyRoom.seated` gives: a bot yields its chair.
        seated: r.members.length,
        bots: r.bots.length,
        method: r.room.method,
        budget: r.room.budget,
        pickSeconds: r.room.pick_seconds,
        rerolls: r.room.rerolls,
        showRatings: r.room.show_ratings,
        hostName: this.names[r.room.host_id] ?? '',
        openedAt: msOf(r.room.touched_at),
      }))
      .slice(0, limit);
  }

  async activeRoomOf(userId: string): Promise<string | null> {
    for (const rows of this.rows.values()) {
      if (rows.room.status === 'ended') continue;
      // Live rooms only, exactly as `pgStore` filters (P51): a duel needs nobody present,
      // so holding several is the feature rather than what P39 exists to stop.
      if ((rows.room.pace ?? 'live') !== 'live') continue;
      if (rows.members.some((m) => m.user_id === userId)) return rows.room.code;
    }
    return null;
  }

  async myDuels(userId: string, limit: number): Promise<DuelListRow[]> {
    const mine = [...this.rows.values()].filter(
      (r) => r.room.pace === 'async' && r.members.some((m) => m.user_id === userId),
    );
    return mine
      .sort((a, b) => msOf(b.room.touched_at) - msOf(a.room.touched_at))
      .slice(0, limit)
      .map((r) => {
        const match = r.matches[0];
        const otherSeat = r.members.find((m) => m.user_id !== userId);
        const opponent = otherSeat ? (this.names[otherSeat.user_id] ?? '') : '';
        const count = (id: string | undefined) =>
          id === undefined
            ? r.picks.filter((p) => p.user_id !== userId).length
            : r.picks.filter((p) => p.user_id === id).length;
        return {
          code: r.room.code,
          opponentName: opponent,
          yours: r.room.host_id === userId,
          status: r.room.status,
          seated: r.members.length,
          method: r.room.method,
          budget: r.room.budget,
          yourPicks: count(userId),
          theirPicks: count(undefined),
          yourDone: r.members.some((m) => m.user_id === userId && m.done),
          theirDone:
            r.members.some((m) => m.user_id !== userId) &&
            r.members.every((m) => m.user_id === userId || m.done),
          yourGoals: match
            ? match.home_id === userId
              ? match.home_goals
              : match.away_goals
            : null,
          theirGoals: match
            ? match.home_id === userId
              ? match.away_goals
              : match.home_goals
            : null,
          won: match ? match.winner_id === userId : null,
          openedAt: msOf(r.room.touched_at),
          touchedAt: msOf(r.room.touched_at),
        };
      });
  }

  async displayName(userId: string): Promise<string | null> {
    return this.names[userId] ?? null;
  }

  async seen(): Promise<void> {}
}

// --- Tokens ----------------------------------------------------------------

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

function token(claims: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(claims);
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const session = (sub: string): string =>
  token({ role: 'authenticated', sub, exp: Math.floor(T0 / 1000) + 3600 });

/** A session that outlives a DUEL, which is played over days: the ordinary fixture token
 *  expires in an hour, which is right for a room and would have every move of a duel
 *  refused as `expired`. A real player signs in again; the duel does not care, which is the
 *  point of the mode. */
const longSession = (sub: string): string =>
  token({ role: 'authenticated', sub, exp: Math.floor(T0 / 1000) + 400 * 24 * 3600 });

/** The trap P34 exists for: in self-hosted Supabase this is a VALID signature from the same
 *  secret, and it ships in the browser bundle by design. */
const ANON_KEY = token({ role: 'anon', exp: Math.floor(T0 / 1000) + 3600 });

// --- Driving the api --------------------------------------------------------

function depsFor(store: MemStore, clock: { now: number }): ApiDeps {
  let n = 0;
  return {
    store,
    now: () => clock.now,
    jwtSecret: SECRET,
    sweepMs: SWEEP_MS,
    newCode: () => `RM${String(++n).padStart(4, '0')}`,
    // Predictable, and a real uuid: `pvp_bots.bot_id` is one, and a bot is addressed
    // exactly like a member everywhere above the database.
    newBotId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
}

async function post(
  deps: ApiDeps,
  path: string,
  who: string | null,
  body: Record<string, unknown> = {},
): Promise<ApiResponse> {
  return handle(
    { method: 'POST', path, body, authorization: who ? `Bearer ${who}` : null },
    deps,
  );
}

async function get(deps: ApiDeps, path: string, who: string | null): Promise<ApiResponse> {
  return handle({ method: 'GET', path, body: {}, authorization: who ? `Bearer ${who}` : null }, deps);
}

/** A two-player budget room with both seats taken and both shapes chosen. */
/**
 * A whole legal board for one member, which is how a budget room drafts (P52).
 *
 * Built by the same `autoPick` the referee's own deadline uses, so what it produces is
 * legal by the same rule that judges it - and the money is re-counted each time round,
 * because in a budget room the eleventh pick is what decides whether the first was
 * affordable, which is the whole reason this mode has one clock rather than eleven.
 */
function fullBoard(room: PvpRoom, who: string): Record<string, string> {
  const m = room.members.find((x) => x.userId === who)!;
  const f = formationOf(m);
  let filled: Filled = { ...(room.xi[who] ?? {}) };
  for (let i = 0; i < XI_SLOTS; i++) {
    const spent = Object.values(filled).reduce((t, p) => t + (p ? pvpPriceOf(p) : 0), 0);
    const made = autoPick(f, filled, room.rules, { remaining: m.budget - spent });
    if (!made) break;
    filled = { ...filled, [made.slotId]: made.player };
  }
  return Object.fromEntries(
    Object.entries(filled)
      .filter(([, p]) => !!p)
      .map(([slot, p]) => [slot, p!.id]),
  );
}

/**
 * Two people in a room, ready to start.
 *
 * THE METHOD IS AN ARGUMENT because the two now draft completely differently (P52): a roll
 * room runs eleven pick windows, and a budget room runs one clock over the whole draft and
 * takes the board as a map. Everything about the pick clock below is therefore a ROLL
 * room's, and it says so rather than being a budget room that happens to still have
 * windows - which is what it was, and what would have gone silently wrong.
 */
async function seatedRoom(
  clock: { now: number },
  method: 'roll' | 'budget' = 'budget',
): Promise<{ store: MemStore; deps: ApiDeps; code: string }> {
  const store = new MemStore();
  store.names = { u1: 'Ada', u2: 'Bruno' };
  const deps = depsFor(store, clock);
  const made = await post(deps, '/referee/v1/rooms', session('u1'), {
    visibility: 'private',
    size: 2,
    method,
    budget: method === 'budget' ? 110 : 0,
    pickSeconds: 20,
    years: [],
  });
  const code = (made.body as RoomView).code;
  await post(deps, `/referee/v1/rooms/${code}/join`, session('u2'));
  await post(deps, `/referee/v1/rooms/${code}/lineup`, session('u1'), {
    formationName: '4-3-3',
    style: 'bal',
    ready: true,
  });
  await post(deps, `/referee/v1/rooms/${code}/lineup`, session('u2'), {
    formationName: '4-4-2',
    style: 'bal',
    ready: true,
  });
  return { store, deps, code };
}

// ---------------------------------------------------------------------------

export async function refereeChecks(): Promise<void> {
  // --- Display names (P22) -------------------------------------------------

  // A zero-width space in the fourth, a soft hyphen in the fifth. No real spaces:
  // collapsing whitespace makes `Mar io` one word with one space, and that is a different
  // name rather than the same one written oddly.
  const folded = ['Mario', 'mario', '  MARIO  ', 'Mar\u200bio', 'Mari\u00ado'];
  check(
    'names: case, whitespace and invisibles all fold to one key',
    () => new Set(folded.map(nameKeyOf)).size === 1,
    () => folded.map((n) => `${JSON.stringify(n)} -> ${nameKeyOf(n)}`).join(' | '),
  );
  // The vacuity guard the check above needs: five strings that are already identical would
  // pass it trivially, and a folding rule that did nothing would too.
  check(
    'names: those five raw strings really are five different strings',
    () => new Set(folded).size === folded.length,
  );

  // The one the folding CANNOT do, and the reason there is a codepoint set at all.
  const greek = 'Mariο'; // a Greek omicron where the o should be
  check(
    'names: a Greek-omicron lookalike is refused outright, not merely keyed differently',
    () => !validateName(greek).ok && validateName(greek).faults.includes('bad-character'),
    () => JSON.stringify(validateName(greek)),
  );
  check(
    'names: the ordinary spelling of the same name passes',
    () => validateName('Mario').ok && validateName('Mario').key === 'mario',
  );
  check(
    'names: an accented Latin name passes, because refusing it would be absurd',
    () => validateName('Müller').ok && validateName('Ibrahimović').ok,
    () => JSON.stringify([validateName('Müller'), validateName('Ibrahimović')]),
  );
  check('names: too short is refused', () => validateName('ab').faults.includes('too-short'));
  check(
    'names: length is counted in codepoints of the NORMALISED name',
    () =>
      validateName('é'.repeat(NAME_MAX)).ok && validateName('é'.repeat(NAME_MAX + 1)).faults.includes('too-long'),
  );
  check(
    'names: normalising is idempotent, so the client and the referee cannot disagree',
    () => {
      const once = normalizeName('  Mar​io  van  Basten ');
      return normalizeName(once) === once && once === 'Mario van Basten';
    },
    () => JSON.stringify(normalizeName('  Mar​io  van  Basten ')),
  );
  check(
    'names: NFC folds a decomposed accent onto the composed one',
    () => nameKeyOf('Müller') === nameKeyOf('Müller'),
  );
  check(
    'names: a bracket code is three upper-case characters',
    () => codeOf('ada lovelace') === 'ADA' && codeOf('Bruno') === 'BRU',
  );

  // --- The version handshake (P35) -----------------------------------------

  check('version: the dataset hash is stable across calls', () => datasetHash() === datasetHash());
  check(
    'version: reordering the dataset does not change the hash',
    () => hashOfSquads([...SQUADS].reverse()) === datasetHash(),
  );
  check(
    'version: changing one rating DOES change it',
    () => {
      const bent = SQUADS.map((s, i) =>
        i === 0 ? { ...s, players: s.players.map((p, j) => (j === 0 ? { ...p, elo: p.elo + 1 } : p)) } : s,
      );
      return hashOfSquads(bent) !== datasetHash();
    },
  );
  check(
    'version: a mismatch on either half is named, and an exact match passes',
    () =>
      versionMismatch(localVersion()) === null &&
      versionMismatch({ protocol: PVP_PROTOCOL + 1, dataset: datasetHash() }) === 'protocol' &&
      versionMismatch({ protocol: PVP_PROTOCOL, dataset: 'deadbeef' }) === 'dataset',
  );

  // --- Configuration --------------------------------------------------------

  check(
    'env: every missing variable is named at once, not one per restart',
    () => {
      try {
        readEnv({});
        return false;
      } catch (err) {
        const msg = (err as Error).message;
        return msg.includes('REFEREE_DATABASE_URL') && msg.includes('SUPABASE_JWT_SECRET');
      }
    },
  );
  check(
    'env: Realtime is optional, but half-configured Realtime is refused',
    () => {
      const base = { REFEREE_DATABASE_URL: 'postgres://x', SUPABASE_JWT_SECRET: 's' };
      const okNoRealtime = readEnv(base).realtimeUrl === undefined;
      let refused = false;
      try {
        readEnv({ ...base, REALTIME_URL: 'https://x' });
      } catch {
        refused = true;
      }
      return okNoRealtime && refused;
    },
  );

  // --- Who the referee acts for (P34), at the HTTP edge ---------------------

  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada' };
    const deps = depsFor(store, clock);
    const noToken = await post(deps, '/referee/v1/rooms', null, {});
    const anon = await post(deps, '/referee/v1/rooms', ANON_KEY, {});
    const forged = await post(
      deps,
      '/referee/v1/rooms',
      token({ role: 'authenticated', sub: 'u1', exp: Math.floor(T0 / 1000) + 60 }, 'the-wrong-secret'),
      {},
    );
    const expired = await post(
      deps,
      '/referee/v1/rooms',
      token({ role: 'authenticated', sub: 'u1', exp: Math.floor(T0 / 1000) - 1 }),
      {},
    );
    const real = await post(deps, '/referee/v1/rooms', session('u1'), {
      visibility: 'private',
      size: 2,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
    });
    check('referee: no token is refused', () => noToken.status === 401);
    check(
      'referee: the ANON KEY is refused, though its signature is valid',
      () => anon.status === 401 && String((anon.body as { detail: string }).detail).includes('not-authenticated'),
      () => JSON.stringify(anon.body),
    );
    check('referee: a token signed with another secret is refused', () => forged.status === 401);
    check('referee: an expired session is refused', () => expired.status === 401);
    // The vacuity guard for all four: a refusal that refused everything would pass them.
    check('referee: a real session is accepted', () => real.status === 201, () => JSON.stringify(real.body));
  }

  {
    const clock = { now: T0 };
    const deps = depsFor(new MemStore(), clock);
    const v = await get(deps, '/referee/version', null);
    check(
      'referee: GET /referee/version answers the local version, unauthenticated',
      () => v.status === 200 && JSON.stringify(v.body) === JSON.stringify(localVersion()),
      () => JSON.stringify(v.body),
    );
  }

  // --- Two browsers see each other (this wave's done-when) ------------------

  {
    const clock = { now: T0 };
    const { deps, code } = await seatedRoom(clock);
    const asAda = (await get(deps, `/referee/v1/rooms/${code}`, session('u1'))).body as RoomView;
    const asBruno = (await get(deps, `/referee/v1/rooms/${code}`, session('u2'))).body as RoomView;
    check(
      'room: both players see both seats, by name',
      () =>
        asAda.members.length === 2 &&
        asBruno.members.length === 2 &&
        asAda.members.map((m) => m.name).join() === 'Ada,Bruno' &&
        asBruno.members.map((m) => m.name).join() === 'Ada,Bruno',
      () => JSON.stringify([asAda.members, asBruno.members]),
    );
    check('room: readiness is visible to the other player (P48)', () =>
      asAda.members.every((m) => m.ready),
    );
    check(
      'room: a lobby hides the other player\'s formation (P19), and shows your own',
      () =>
        asAda.members.find((m) => m.userId === 'u1')?.formationName === '4-3-3' &&
        asAda.members.find((m) => m.userId === 'u2')?.formationName === null,
      () => JSON.stringify(asAda.members),
    );
    const stranger = await get(deps, `/referee/v1/rooms/${code}`, session('u3'));
    check(
      'room: a private room answers 404 to somebody who is not in it',
      () => stranger.status === 404,
      () => `${stranger.status} ${JSON.stringify(stranger.body)}`,
    );
  }

  // --- THE PUBLIC LOBBY LIST (P18), wave 8 ----------------------------------
  // The whole point of a public room is that somebody who was never sent a code can find
  // it, so this is the one read in the referee that answers about a room the caller is not
  // in - and it must not become a way to enumerate PRIVATE rooms, which is the same rule
  // the 404 above exists for.
  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno', u3: 'Chidi' };
    const deps = depsFor(store, clock);
    const open = async (
      who: string,
      visibility: 'public' | 'private',
      over: Record<string, unknown> = {},
    ): Promise<string> => {
      const made = await post(deps, '/referee/v1/rooms', session(who), {
        visibility,
        size: 4,
        method: 'budget',
        budget: 110,
        pickSeconds: 20,
        years: [],
        ...over,
      });
      return (made.body as RoomView).code;
    };
    const pub = await open('u1', 'public');
    const priv = await open('u2', 'private');
    const list = await get(deps, '/referee/v1/lobby', session('u3'));
    const rooms = (list.body as { rooms: { code: string; seated: number; hostName: string }[] }).rooms;
    check(
      'referee: the lobby lists a PUBLIC room to somebody who was never sent a code, and lists no private one',
      () =>
        list.status === 200 &&
        // Vacuity: there really are two rooms open, and only one of them is listed.
        !!pub &&
        !!priv &&
        rooms.length === 1 &&
        rooms[0]!.code === pub &&
        rooms[0]!.seated === 1 &&
        rooms[0]!.hostName === 'Ada',
      () => `${list.status}: ${JSON.stringify(rooms)}`,
    );
    const anon = await get(deps, '/referee/v1/lobby', null);
    check(
      'referee: the lobby still needs a session - a room is account-only, listed or not',
      () => anon.status === 401,
      () => String(anon.status),
    );
    // A room that has STARTED leaves the list: it is not something anybody can join.
    await post(deps, `/referee/v1/rooms/${pub}/join`, session('u3'));
    const started = await get(deps, '/referee/v1/lobby', session('u2'));
    check(
      'referee: a public room stays listed while it is a lobby, and its seat count is live',
      () =>
        (started.body as { rooms: { seated: number }[] }).rooms.length === 1 &&
        (started.body as { rooms: { seated: number }[] }).rooms[0]!.seated === 2,
      () => JSON.stringify(started.body),
    );
  }

  // --- THE REPORTED BUG: leaving a room, then opening another ---------------
  // "When I leave my own room I'm still in the room when trying to create a new one."
  // Leaving was a navigation and nothing else, so the seat stayed taken and P39's
  // one-room-at-a-time refused the next room with `already-in-a-room` until the liveness
  // sweep noticed ninety seconds later.
  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno' };
    const deps = depsFor(store, clock);
    const make = (): Promise<ApiResponse> =>
      post(deps, '/referee/v1/rooms', session('u1'), {
        visibility: 'private',
        size: 2,
        method: 'budget',
        budget: 110,
        pickSeconds: 20,
        years: [],
      });
    const first = await make();
    const code = (first.body as RoomView).code;
    // Without leaving, a second room is refused - and the refusal names the room holding
    // the seat, which is what lets the screen offer a way back to it.
    const refused = await make();
    await post(deps, `/referee/v1/rooms/${code}/leave`, session('u1'));
    const after = await make();
    check(
      'referee: leaving a room frees the seat AT ONCE, where before it took the ninety-second liveness sweep',
      () =>
        // Vacuity: the second attempt really is refused while the seat is held, and the
        // refusal carries the code of the room holding it.
        refused.status === 409 &&
        (refused.body as { error?: string }).error === 'already-in-a-room' &&
        (refused.body as { detail?: string }).detail === code &&
        // And the same call goes through once the seat is given up.
        after.status === 201 &&
        (after.body as RoomView).code !== code,
      () => `${refused.status}/${JSON.stringify(refused.body)} then ${after.status}`,
    );
    // The room the host left had nobody else in it, so it closed rather than sitting in a
    // lobby list for ever.
    const left = await store.read(code);
    check(
      'referee: the room the last person left is closed, not left open with nobody in it',
      () => left?.status === 'ended' && !left.championId,
      () => `${left?.status} / ${left?.championId ?? 'no champion'}`,
    );
  }

  // --- One room at a time (P39), and a name before a room -------------------

  {
    const clock = { now: T0 };
    const { deps } = await seatedRoom(clock);
    const again = await post(deps, '/referee/v1/rooms', session('u1'), {
      visibility: 'private',
      size: 2,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
    });
    check(
      'room: a second room while you hold a seat is refused (P39)',
      () => again.status === 409 && (again.body as { error: string }).error === 'already-in-a-room',
      () => JSON.stringify(again.body),
    );
  }
  {
    const clock = { now: T0 };
    const store = new MemStore();
    const deps = depsFor(store, clock);
    const made = await post(deps, '/referee/v1/rooms', session('nameless'), {
      visibility: 'private',
      size: 2,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
    });
    check(
      'room: an account with no display name cannot open a room a stranger would read',
      () => made.status === 409 && (made.body as { error: string }).error === 'no-display-name',
      () => JSON.stringify(made.body),
    );
  }

  // --- A host's settings are checked, not clamped ---------------------------

  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada' };
    const deps = depsFor(store, clock);
    const bad = [
      { size: 3, method: 'budget', budget: 110, pickSeconds: 20 },
      { size: 2, method: 'budget', budget: 110, pickSeconds: 25 },
      { size: 2, method: 'budget', budget: 5000, pickSeconds: 20 },
      { size: 2, method: 'budget', budget: 110, pickSeconds: 20, rerolls: 9 },
      { size: 2, method: 'budget', budget: 110, pickSeconds: 20, years: [1911] },
      { size: 2, method: 'budget', budget: 60, pickSeconds: 20 },
    ];
    const answers: ApiResponse[] = [];
    for (const body of bad) answers.push(await post(deps, '/referee/v1/rooms', session('u1'), body));
    check(
      'room: every setting outside what plan section 3 allows is refused rather than clamped',
      () => answers.every((a) => a.status === 422 || a.status === 409),
      () => answers.map((a) => `${a.status} ${JSON.stringify(a.body)}`).join(' | '),
    );
  }

  // --- A pick, and what the referee will not take -------------------------

  {
    const clock = { now: T0 };
    const { deps, code, store } = await seatedRoom(clock, 'roll');
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    const room = (await store.read(code))!;
    const me = room.members.find((m) => m.userId === 'u1')!;
    // FROM THE SQUAD THE REFEREE DEALT (P13). A roll room refuses a player it never handed
    // over, so taking one off the whole dataset - which is what this did while it was a
    // budget room - would be refused as illegal and the check would pass for the wrong
    // reason on the way to failing for the right one.
    const dealtSquad = room.deals.u1!.slice(-1)[0]!;
    const dealtPlayers = SQUADS.find((sq) => sq.id === dealtSquad)!.players;
    const slot = formationOf(me).slots.find((sl) =>
      dealtPlayers.some((p) => p.positions.includes(sl.position)),
    )!;
    const legal = dealtPlayers.find((p) => p.positions.includes(slot.position))!;

    const unknown = await post(deps, `/referee/v1/rooms/${code}/pick`, session('u1'), {
      ordinal: 1,
      slotId: slot.id,
      playerId: 'no-such-player-9999',
    });
    check(
      'pick: a player the referee does not have is refused, and says so',
      () => unknown.status === 422 && (unknown.body as { error: string }).error === 'unknown-player',
      () => JSON.stringify(unknown.body),
    );

    const good = await post(deps, `/referee/v1/rooms/${code}/pick`, session('u1'), {
      ordinal: 1,
      slotId: slot.id,
      playerId: legal.id,
    });
    check(
      'pick: a legal pick lands and opens the next window',
      () => good.status === 200 && (good.body as { room: RoomView }).room.you?.window?.ordinal === 2,
      () => JSON.stringify(good.body),
    );
    const replay = await post(deps, `/referee/v1/rooms/${code}/pick`, session('u1'), {
      ordinal: 1,
      slotId: slot.id,
      playerId: legal.id,
    });
    check(
      'pick: re-sending the same ordinal is a replay, not a second spent window (P36)',
      () => replay.status === 200 && (replay.body as { outcome: string }).outcome === 'replay',
      () => JSON.stringify(replay.body),
    );

    // The clock beats a pick, through the HTTP edge rather than the state machine - the
    // layer that has to get `now` from one place. Swept along the way at the real interval,
    // because a twenty-five-second jump with no sweep in it is an OUTAGE to this referee and
    // it would rightly hand the time back rather than call the pick late.
    for (let i = 0; i < 20; i++) {
      clock.now += SWEEP_MS;
      await sweepOnce(store, clock.now, SWEEP_MS);
    }
    clock.now += 900; // past the deadline and the grace, before the next sweep
    // The second slot, and a second player from whatever squad is dealt NOW - the first
    // pick opened a new window, which deals again.
    const after = (await store.read(code))!;
    const nowDealt = SQUADS.find((sq) => sq.id === after.deals.u1!.slice(-1)[0]!)!.players;
    const slot2 = formationOf(me).slots.find(
      (sl) => sl.id !== slot.id && nowDealt.some((p) => p.positions.includes(sl.position)),
    )!;
    const other = nowDealt.find(
      (p) => p.positions.includes(slot2.position) && p.personId !== legal.personId,
    )!;
    const late = await post(deps, `/referee/v1/rooms/${code}/pick`, session('u1'), {
      ordinal: 2,
      slotId: slot2.id,
      playerId: other.id,
    });
    check(
      'pick: a pick after the deadline is refused as late, not as illegal',
      () => late.status === 409 && (late.body as { outcome: string }).outcome === 'late',
      () => JSON.stringify(late.body),
    );
  }

  // --- The clock, and the one bug that stops it ----------------------------

  // An ORDINARY sweep must not hand time back. Applying P45 on every sweep freezes the
  // elapsed time at its previous value, so no window ever expires and the room built to be
  // unstallable stalls - see referee/src/outage.ts.
  {
    const clock = { now: T0 };
    const { deps, code, store } = await seatedRoom(clock, 'roll');
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    for (let i = 0; i < 30; i++) {
      clock.now += SWEEP_MS;
      await sweepOnce(store, clock.now, SWEEP_MS);
    }
    const after = (await store.read(code))!;
    const filled = Object.values(after.xi.u1 ?? {}).filter(Boolean).length;
    check(
      'clock: ordinary sweeps let a window expire - 30 seconds of a 20-second clock fills a slot',
      () => filled >= 1,
      () => `filled ${filled} after 30 sweeps`,
    );
    // The vacuity guard, and the mutation this check exists to catch: recover on every
    // sweep and the same thirty seconds fill nothing at all.
    let bent = (await store.read(code))!;
    bent = { ...bent, xi: { ...bent.xi, u1: {} }, picks: { ...bent.picks, u1: {} } };
    let sweptAt = clock.now;
    for (let i = 0; i < 30; i++) {
      clock.now += SWEEP_MS;
      bent = tickRoom(recoverFromOutage(bent, sweptAt, clock.now), clock.now);
      sweptAt = clock.now;
    }
    check(
      'clock: recovering on EVERY sweep would stop it dead, which is why it is conditional',
      () => Object.values(bent.xi.u1 ?? {}).filter(Boolean).length === 0,
      () => `unconditional recovery filled ${Object.values(bent.xi.u1 ?? {}).filter(Boolean).length}`,
    );
  }

  check(
    'outage: a gap of one sweep is not an outage; a gap of forty-five seconds is',
    () =>
      !wasOutage(T0, T0 + SWEEP_MS, SWEEP_MS) &&
      !wasOutage(null, T0 + 60_000, SWEEP_MS) &&
      wasOutage(T0, T0 + 45_000, SWEEP_MS),
  );
  check(
    'outage: one slow pass is not an outage either - the floor is what stops a sluggish ' +
      'sweeper handing time back for ever',
    () => !wasOutage(T0, T0 + 5_000, SWEEP_MS) && wasOutage(T0, T0 + 11_000, SWEEP_MS),
  );

  // The plan's own done-when for this wave: kill the referee for 45 seconds and every open
  // window comes back with roughly the time it had left, having auto-picked for nobody.
  {
    const clock = { now: T0 };
    const { deps, code, store } = await seatedRoom(clock, 'roll');
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    // Five seconds into everybody's first window, the process dies.
    clock.now += 5_000;
    await sweepOnce(store, clock.now, SWEEP_MS);
    const diedAt = clock.now;
    clock.now += 45_000;

    const recovered = await recoverAtBoot(store, clock.now);
    const back = (await store.read(code))!;
    const left = back.members.map((m) => deadlineOf(back, back.windows[m.userId]!) - clock.now);
    check(
      'outage: after 45 seconds down, every window has about the 15 seconds it had left',
      () =>
        recovered.includes(code) &&
        left.length === 2 &&
        left.every((ms) => Math.abs(ms - 15_000) < 50),
      () => `remaining: ${left.join(', ')}`,
    );
    // The half that is easy to miss: recovery must not simply restore the deadlines, or the
    // first sweep after it auto-picks for everybody. Nobody has picked, so nothing is filled.
    const swept = await sweepOnce(store, clock.now, SWEEP_MS);
    const afterSweep = (await store.read(code))!;
    const anyFilled = afterSweep.members.some(
      (m) => Object.values(afterSweep.xi[m.userId] ?? {}).filter(Boolean).length > 0,
    );
    check(
      'outage: the first sweep after recovery auto-picks for nobody',
      () => !anyFilled && swept.advanced.length === 0,
      () => `filled: ${anyFilled}, advanced: ${swept.advanced.join(',')}`,
    );
    // And the clamp: a window that had ALREADY run out before the crash comes back expired
    // rather than resurrected as thinking time.
    const old: PvpRoom = {
      ...back,
      windows: { ...back.windows, u1: { ordinal: 1, openedAt: diedAt - 40_000 } },
    };
    const stale = recoverFromOutage(old, diedAt, clock.now);
    const staleLeft = deadlineOf(stale, stale.windows.u1!) - clock.now;
    check(
      'outage: a window that had already expired is not resurrected as thinking time',
      () => staleLeft <= 0,
      () => `remaining: ${staleLeft}`,
    );
  }

  // --- A room nobody plays still ends, through the referee ------------------

  {
    const clock = { now: T0 };
    const { deps, code, store } = await seatedRoom(clock);
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    // At the real sweep interval, because that is the thing being claimed: a room left
    // entirely alone reaches a champion under the sweeper it actually ships with. Eleven
    // twenty-second windows each plus a tie to reveal is about four minutes of room time.
    let guard = 0;
    let room = (await store.read(code))!;
    while (room.status !== 'ended' && guard++ < 400) {
      clock.now += SWEEP_MS;
      await sweepOnce(store, clock.now, SWEEP_MS);
      room = (await store.read(code))!;
    }
    check(
      'room: two players who do nothing at all still reach a champion (P12: no forfeits)',
      () => room.status === 'ended' && !!room.championId,
      () => `status ${room.status} after ${guard} sweeps`,
    );
    check(
      'room: and both XIs the clock built are legal at the room\'s own rules',
      () =>
        room.members.every((m) => {
          const v = validateXi(formationOf(m), room.xi[m.userId] ?? {}, room.rules);
          return v.ok && v.cost <= m.budget;
        }),
      () =>
        room.members
          .map((m) => `${m.userId}: ${validateXi(formationOf(m), room.xi[m.userId] ?? {}, room.rules).faults.join('/')}`)
          .join(' | '),
    );
    check(
      'room: every slot the clock filled is recorded as automatic, which is what a ladder reads',
      () =>
        room.members.every((m) => {
          const recs = Object.values(room.picks[m.userId] ?? {});
          return recs.length === 11 && recs.every((r) => r.automatic);
        }),
      () => room.members.map((m) => `${m.userId}: ${Object.values(room.picks[m.userId] ?? {}).length}`).join(' | '),
    );
    check(
      'room: pick ordinals are unique per player, which is what makes a retry idempotent',
      () =>
        room.members.every((m) => {
          const ords = Object.values(room.picks[m.userId] ?? {}).map((r) => r.ordinal);
          return new Set(ords).size === ords.length;
        }),
    );
    const loserView = (await get(deps, `/referee/v1/rooms/${code}`, session('u2'))).body as RoomView;
    check(
      'room: the other XI is open once the tie has been played (P38), and was not before',
      () =>
        Object.keys(loserView.revealed).length === 1 &&
        Object.keys(loserView.revealed).includes('u1') &&
        Object.keys(loserView.revealed.u1 ?? {}).length === 11,
      () => JSON.stringify(Object.keys(loserView.revealed)),
    );
  }

  // --- The row mapping, explicitly -----------------------------------------

  {
    const clock = { now: T0 };
    // A ROLL room, so the trip carries the things only a per-pick draft has - an open
    // window and a list of dealt squads. A budget room's own new columns get their own
    // round trip in the P52 block below, because the two drafts no longer store the same
    // things and one fixture cannot cover both.
    const { deps, code, store } = await seatedRoom(clock, 'roll');
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    for (let i = 0; i < 22; i++) {
      clock.now += SWEEP_MS;
      await sweepOnce(store, clock.now, SWEEP_MS);
    }
    const room = (await store.read(code))!;
    const round = roomFromRows(
      rowsFromRoom(room, { sweptAt: clock.now, displayNames: store.names }),
    );
    check(
      'rows: a room survives the round trip through the tables unchanged',
      () => JSON.stringify(round) === JSON.stringify(room),
      () => {
        const a = JSON.stringify(room);
        const b = JSON.stringify(round);
        const i = [...a].findIndex((c, k) => c !== b[k]);
        return `first difference at ${i}: ${a.slice(Math.max(0, i - 60), i + 60)} != ${b.slice(Math.max(0, i - 60), i + 60)}`;
      },
    );
    // The vacuity guard: a round trip that dropped everything would also compare equal if
    // the room were empty, so the room being compared has to have something in it.
    check(
      'rows: and that room actually had a draft in it',
      () =>
        room.status === 'drafting' &&
        room.members.length === 2 &&
        Object.values(room.picks.u1 ?? {}).length >= 1,
      () => `status ${room.status}, picks ${Object.values(room.picks.u1 ?? {}).length}`,
    );
  }

  // --- Practice opponents, through the real handlers ------------------------
  //
  // The point of driving this here rather than only in `pvpRoom` is the ROWS: a bot is the
  // one member that is not a `pvp_members` row, so every command in this block writes it
  // through `botWrites` and reads it back through `roomFromRows`. A field the writer forgets
  // shows up as a room that comes back wrong, which is the whole reason this store keeps
  // rooms as rows.

  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno' };
    const deps = depsFor(store, clock);
    const made = await post(deps, '/referee/v1/rooms', session('u1'), {
      visibility: 'public',
      size: 4,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
      years: [],
    });
    const code = (made.body as RoomView).code;
    const refusedToGuest = await post(deps, `/referee/v1/rooms/${code}/join`, session('u2'));
    const notHost = await post(deps, `/referee/v1/rooms/${code}/bots`, session('u2'), { count: 2 });
    const bad = await post(deps, `/referee/v1/rooms/${code}/bots`, session('u1'), { count: 'two' });
    const filled = await post(deps, `/referee/v1/rooms/${code}/bots`, session('u1'), { count: 2 });
    const view = filled.body as RoomView;
    check(
      'bots: the host fills the empty chairs, they are marked as such, and a guest cannot ask',
      () =>
        // Vacuity: two people really did take seats first.
        refusedToGuest.status === 200 &&
        bad.status === 422 &&
        view.members.length === 4 &&
        view.members.filter((m) => m.bot).length === 2 &&
        // The seat is marked on the wire, or no screen can say which of eight names is a
        // person - and the two the referee seated are not the two who signed in.
        view.members.filter((m) => !m.bot).every((m) => ['u1', 'u2'].includes(m.userId)) &&
        // Not the guest's to ask for: the referee answers with the room, unchanged, the
        // same way it answers a resize it will not make.
        (notHost.body as RoomView).members.length === 2,
      () => `${view.members.length} seated, ${view.members.filter((m) => m.bot).length} bots`,
    );

    // The lobby row a stranger reads: people and chairs counted apart, because a bot gives
    // its seat up to anybody who turns up.
    const lobby = (await get(deps, '/referee/v1/lobby', session('u2'))).body as {
      rooms: { code: string; seated: number; bots?: number; size: number }[];
    };
    const row = lobby.rooms.find((r) => r.code === code);
    check(
      'bots: a public room lists its PEOPLE as seated and says how many chairs are practice',
      () => !!row && row.seated === 2 && row.bots === 2 && row.size === 4,
      () => JSON.stringify(row),
    );

    // A third person arrives at a room with no empty chairs left.
    store.names.u3 = 'Cleo';
    const late = await post(deps, `/referee/v1/rooms/${code}/join`, session('u3'));
    const after = late.body as RoomView;
    check(
      'bots: somebody arriving at a full room takes a bot’s chair rather than being refused',
      () =>
        late.status === 200 &&
        after.members.length === 4 &&
        after.members.filter((m) => m.bot).length === 1 &&
        after.members.some((m) => m.userId === 'u3'),
      () => `${late.status}: ${after.members.map((m) => (m.bot ? 'bot' : m.userId)).join(',')}`,
    );

    // And the room plays out, with one seat that never picks anything.
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    // The round trip, on a room whose members are not all `pvp_members` rows. The existing
    // one below uses two people, so it says nothing about the table a bot lives in.
    {
      const mid = (await store.read(code))!;
      const back = roomFromRows(rowsFromRoom(mid, { sweptAt: clock.now, displayNames: store.names }));
      check(
        'bots: a room with practice opponents in it survives the round trip through the tables',
        () => JSON.stringify(back) === JSON.stringify(mid),
        () => {
          const a = JSON.stringify(mid);
          const b = JSON.stringify(back);
          const i = [...a].findIndex((c, k) => c !== b[k]);
          return `first difference at ${i}: ${a.slice(Math.max(0, i - 80), i + 80)} != ${b.slice(Math.max(0, i - 80), i + 80)}`;
        },
      );
      check(
        'bots: and that room really had a bot with a built XI in it',
        () =>
          mid.status === 'drafting' &&
          mid.members.some((m) => m.bot) &&
          Object.keys(mid.xi[mid.members.find((m) => m.bot)!.userId] ?? {}).length === 11,
        () => `${mid.status}, ${mid.members.filter((m) => m.bot).length} bots`,
      );
    }
    let guard = 0;
    let room = (await store.read(code))!;
    while (room.status !== 'ended' && guard++ < 600) {
      clock.now += SWEEP_MS;
      await sweepOnce(store, clock.now, SWEEP_MS);
      room = (await store.read(code))!;
    }
    const bot = room.members.find((m) => m.bot);
    check(
      'bots: a room with a practice opponent in it plays through the referee to a champion',
      () =>
        room.status === 'ended' &&
        !!room.championId &&
        !!bot &&
        // Its XI survived the round trip through `pvp_bots` rather than `pvp_picks`, and it
        // is legal at the room's own rules - which is what a submitted one would be judged
        // by, even though nothing ever submits it.
        validateXi(formationOf(bot), room.xi[bot.userId] ?? {}, room.rules).ok &&
        // It was built at the kick-off and never drafted: no window, and no pick records.
        room.windows[bot.userId] === undefined &&
        Object.keys(room.picks[bot.userId] ?? {}).length === 0,
      () => `${room.status}, bot ${bot?.name ?? 'none'} after ${guard} sweeps`,
    );
  }

  // --- A DUEL, played end to end through the referee (P51) ------------------
  //
  // The claim to earn is the one the mode is FOR: nobody has to be present at the same
  // time. So this plays a whole duel with the clock advancing days between moves, and
  // asserts that not one of the four rules that keep a live room moving fires - because
  // every one of them would end the duel prematurely, and three of them would do it
  // silently.
  //
  // AND THE TWO THINGS THAT CHANGED ON 2026-08-31: a duel opens straight into its
  // challenger's draft, so there is no lobby and no acceptance step to sit through, and
  // the invitation is a LINK rather than a name - whoever opens it takes the seat, mid
  // draft, exactly as a private room has always worked.

  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno' };
    const deps = depsFor(store, clock);

    const sent = await post(deps, '/referee/v1/rooms', longSession('u1'), {
      pace: 'async',
      method: 'budget',
      budget: 110,
      years: [],
    });
    const code = (sent.body as RoomView).code;
    const second = await post(deps, '/referee/v1/rooms', longSession('u1'), {
      pace: 'async',
      method: 'budget',
      budget: 110,
    });
    const opened = (await store.read(code))!;
    check(
      "duel: it opens straight into the challenger's draft, private, and does not use up your one room",
      () =>
        sent.status === 201 &&
        (sent.body as RoomView).pace === 'async' &&
        (sent.body as RoomView).visibility === 'private' &&
        // THE FEATURE: no lobby and no acceptance step. The challenger is drafting from the
        // moment they open it, with the second seat still empty - which is what "set my
        // team up right away" means in the state machine.
        (sent.body as RoomView).status === 'drafting' &&
        opened.status === 'drafting' &&
        opened.members.length === 1 &&
        !!opened.startedAt &&
        // P39 counts live rooms only: a duel needs nobody present, so several is the point.
        second.status === 201,
      () => `${sent.status} / ${opened.status} / ${opened.members.length} / ${second.status}`,
    );

    // THE CHALLENGER SENDS AN XI INTO AN EMPTY ROOM, and nothing happens - which is the one
    // way this could have gone wrong. A duel's draft ends when everybody has declared, and
    // with one member "everybody" is one person: without the seat count, sending would draw
    // the challenger against themselves.
    const draftFor = async (who: string): Promise<void> => {
      // An hour between the two, which is the point of the mode: nothing counts it.
      clock.now += 60 * 60_000;
      const room = (await store.read(code))!;
      await post(deps, `/referee/v1/rooms/${code}/xi`, longSession(who), {
        xi: fullBoard(room, who),
      });
      clock.now += 60 * 60_000;
      await post(deps, `/referee/v1/rooms/${code}/done`, longSession(who), { done: true });
    };
    await draftFor('u1');
    await sweepOnce(store, clock.now, SWEEP_MS);
    const alone = (await store.read(code))!;
    const aloneList = await get(deps, '/referee/v1/duels', longSession('u1'));
    const aloneRow = (aloneList.body as { duels: DuelListRow[] }).duels.find(
      (d) => d.code === code,
    )!;
    check(
      'duel: a sent XI with nobody opposite plays no match, and the list says it is waiting',
      () =>
        alone.status === 'drafting' &&
        Object.keys(alone.picks.u1 ?? {}).length === 11 &&
        alone.members[0]!.done === true &&
        alone.ties.length === 0 &&
        // The row carries the seat count and the two declarations, which is what lets the
        // list tell "nobody has taken it up" from "they are still building".
        !!aloneRow &&
        aloneRow.seated === 1 &&
        aloneRow.yourDone === true &&
        aloneRow.theirDone === false &&
        aloneRow.opponentName === '',
      () => `${alone.status}, ${alone.ties.length} ties, ${JSON.stringify(aloneRow)}`,
    );

    // A DAY LATER somebody follows the link. The invitation is the link and nothing else -
    // there is no name on the room - so whoever opens it takes the seat and starts a draft
    // of their own, days after the challenger started theirs.
    store.names.u3 = 'Cleo';
    clock.now += 24 * 60 * 60_000;
    const stranger = await get(deps, `/referee/v1/rooms/${code}`, longSession('u3'));
    const accepted = await post(deps, `/referee/v1/rooms/${code}/join`, longSession('u2'));
    const late = await post(deps, `/referee/v1/rooms/${code}/join`, longSession('u3'));
    const started = (await store.read(code))!;
    check(
      'duel: the link seats whoever opens it, mid-draft, and the second seat is then shut',
      () =>
        // Invisible until you are in it, exactly as a private room is.
        stranger.status === 404 &&
        accepted.status === 200 &&
        started.status === 'drafting' &&
        started.members.length === 2 &&
        // Their own draft begins on arrival: an XI to fill, and the challenger's untouched.
        Object.keys(started.xi.u2 ?? {}).length === 0 &&
        !started.members[1]!.done &&
        // A BUDGET duel is the two clocks OFF at once (P51 and P52): the room runs one
        // clock over the whole draft rather than eleven windows, and a duel runs none of
        // it. So there is no window and the whole-draft remainder is null, which is what
        // stops a screen drawing a bar against a deadline nothing enforces.
        !started.windows.u2 &&
        (accepted.body as RoomView).you?.window == null &&
        (accepted.body as RoomView).draft?.remainingMs === null &&
        // And the third person is too late: two seats, both taken.
        late.status === 409,
      () => `${accepted.status}, ${started.status}, ${late.status}`,
    );

    // A WEEK OF SWEEPS at the live pace's intervals: not one window expires, nobody is
    // dropped for silence, and the room is not closed. Every one of those would have
    // finished this draft without the second player.
    for (let day = 0; day < 6; day++) {
      clock.now += 24 * 60 * 60_000;
      await sweepOnce(store, clock.now, SWEEP_MS);
    }
    const untouched = (await store.read(code))!;
    check(
      'duel: six days of sweeps auto-pick nothing, drop nobody and close nothing',
      () =>
        untouched.status === 'drafting' &&
        untouched.members.length === 2 &&
        // Vacuity, and it is the whole point: the SAME six days would have finished a live
        // room's draft against the absent player and then closed the room.
        Object.keys(untouched.picks.u2 ?? {}).length === 0 &&
        Object.keys(untouched.xi.u2 ?? {}).length === 0 &&
        // And nothing has declared itself finished on their behalf, which is the only
        // thing that could end a duel's draft.
        !untouched.members[1]!.done,
      () => `${untouched.status}, ${Object.keys(untouched.picks.u2 ?? {}).length} picks`,
    );

    // The second XI lands three days later, and the match plays itself.
    clock.now += 3 * 24 * 60 * 60_000;
    await draftFor('u2');
    await sweepOnce(store, clock.now, SWEEP_MS);
    const played = (await store.read(code))!;
    check(
      'duel: the second XI sets the match going, days after the first',
      () => played.ties.length === 1 && !!played.ties[0]!.result && !!played.ties[0]!.winnerId,
      () => `${played.status}, ${played.ties.length} ties`,
    );

    // The result settles on its own, so whoever was not watching still gets it.
    clock.now += 10 * 60_000;
    await sweepOnce(store, clock.now, SWEEP_MS);
    const done = (await store.read(code))!;
    const list = await get(deps, '/referee/v1/duels', longSession('u2'));
    const rows = (list.body as { duels: DuelListRow[] }).duels;
    const row = rows.find((d) => d.code === code)!;
    check(
      'duel: it finishes without being watched, and the list says how it went from each side',
      () =>
        done.status === 'ended' &&
        !!done.championId &&
        !!row &&
        row.status === 'ended' &&
        // Bruno did not send it, and the row is written from HIS side.
        !row.yours &&
        row.opponentName === 'Ada' &&
        row.seated === 2 &&
        row.yourPicks === 11 &&
        row.theirPicks === 11 &&
        row.won === (done.championId === 'u2') &&
        // His list is this duel alone. The second one Ada opened is hers and nobody has
        // taken it up, so it reaches no list but her own - which is the whole of what a
        // link-only invitation means.
        rows.length === 1,
      () => `${done.status}, ${rows.length} rows, ${JSON.stringify(row)}`,
    );
  }

  {
    // --- The whole board, through the referee (P52) -------------------------
    //
    // A BUDGET ROOM DRAFTS AS A MAP, so this is the route that had to exist before moving
    // and un-buying could: the referee took picks and nothing else, which is exactly what
    // P42 said was in the way. Everything it must still refuse it refuses here.
    const clock = { now: T0 };
    const { deps, code, store } = await seatedRoom(clock, 'budget');
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    const started = (await store.read(code))!;

    const invented = await post(deps, `/referee/v1/rooms/${code}/xi`, session('u1'), {
      xi: { [formationOf(started.members[0]!).slots[0]!.id]: 'no-such-player-9999' },
    });
    const board = fullBoard(started, 'u1');
    const good = await post(deps, `/referee/v1/rooms/${code}/xi`, session('u1'), { xi: board });
    // The same board again: idempotent BY CONSTRUCTION here, where a pick needs an ordinal
    // to get there (P36). The same map twice is the same map.
    const again = await post(deps, `/referee/v1/rooms/${code}/xi`, session('u1'), { xi: board });
    const held = (await store.read(code))!;
    check(
      'board: the referee takes a whole XI, refuses an invented player, and repeats are free',
      () =>
        invented.status === 422 &&
        (invented.body as { error: string }).error === 'unknown-player' &&
        good.status === 200 &&
        (good.body as { outcome: string }).outcome === 'ok' &&
        again.status === 200 &&
        Object.keys(held.xi.u1 ?? {}).length === 11 &&
        // The invented board changed nothing, which is the point of refusing it whole
        // rather than dropping the bad key: dropping it answers "here is my XI" with a
        // different XI and calls that success.
        Object.keys(held.xi.u1 ?? {}).every((slot) => board[slot] === held.xi.u1![slot]!.id),
      () => `${invented.status} / ${good.status} / ${again.status}`,
    );

    // Declaring, and what it closes.
    const early = await post(deps, `/referee/v1/rooms/${code}/done`, session('u2'), { done: true });
    const mine = await post(deps, `/referee/v1/rooms/${code}/done`, session('u1'), { done: true });
    const locked = await post(deps, `/referee/v1/rooms/${code}/xi`, session('u1'), { xi: {} });
    check(
      'board: declaring needs a full XI, and closes the board until it is taken back',
      () =>
        // u2 has bought nobody, so there is nothing to declare.
        early.status === 200 &&
        !(early.body as RoomView).members.find((m) => m.userId === 'u2')?.done &&
        mine.status === 200 &&
        !!(mine.body as RoomView).members.find((m) => m.userId === 'u1')?.done &&
        locked.status === 409 &&
        (locked.body as { error: string }).error === 'draft-closed',
      () => `${early.status} / ${mine.status} / ${locked.status}`,
    );

    // And the round trip through the tables, for a budget room's own columns: the
    // whole-draft clock and the declaration, neither of which a roll room has.
    const trip = roomFromRows(
      rowsFromRoom((await store.read(code))!, { sweptAt: clock.now, displayNames: store.names }),
    );
    const source = (await store.read(code))!;
    check(
      'rows: a budget room survives the round trip, clock and declaration included',
      () =>
        JSON.stringify(trip) === JSON.stringify(source) &&
        // Vacuity: the room being compared actually holds both of the new things.
        trip.draftSeconds === DEFAULT_DRAFT_SECONDS &&
        trip.members.find((m) => m.userId === 'u1')?.done === true &&
        Object.keys(trip.xi.u1 ?? {}).length === 11,
      () => `draftSeconds ${trip.draftSeconds}, done ${trip.members.find((m) => m.userId === 'u1')?.done}`,
    );
  }

  {
    // THE OTHER HALF OF P39, and it is the half a guard in `create` carries rather than the
    // store: holding a LIVE room must not stop you SENDING a challenge. A duel needs nobody
    // present, so it is not a room you are tied up in and it does not ask the question at
    // all. The second live room being refused is the vacuity guard - it is what proves the
    // lookup can see the live room the third call is being made while holding.
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno' };
    const deps = depsFor(store, clock);
    const live = { method: 'budget', budget: 110, size: 2, pickSeconds: 20, years: [] };
    const first = await post(deps, '/referee/v1/rooms', longSession('u1'), live);
    const second = await post(deps, '/referee/v1/rooms', longSession('u1'), live);
    const challenge = await post(deps, '/referee/v1/rooms', longSession('u1'), {
      pace: 'async',
      method: 'budget',
      budget: 110,
    });
    check(
      'duel: a live room refuses a second one and does not refuse a challenge',
      () => first.status === 201 && second.status === 409 && challenge.status === 201,
      () => `${first.status} / ${second.status} / ${challenge.status}`,
    );
  }

  {
    // Withdrawing, and the week. Both are the ways a duel ends without a match, and both
    // are silent - so they are worth asserting rather than assuming.
    //
    // WITHDRAWING IS LEAVING, which is why it needs no command of its own. It is also the
    // one leave that acts on a room which is not in a lobby: a duel opens straight into its
    // challenger's draft, so without this branch a challenge you had thought better of
    // would be unleavable and would sit on its link for a week.
    //
    // AND IT NO LONGER WAITS FOR THE SEAT TO BE EMPTY (2026-08-31). It used to close only
    // an UNANSWERED challenge, so the moment somebody took the chair neither player could
    // get out of the game until it played or the week ran out. The creator closes it
    // whenever they like now; the second player hands the seat back instead, which is a
    // different answer on purpose - see `leaveDuel`.
    const clock = { now: T0 };
    const store = new MemStore();
    // Three people: the challenger, whoever takes the seat, and whoever takes it after they
    // hand it back.
    store.names = { u1: 'Ada', u2: 'Bruno', u3: 'Cleo' };
    const deps = depsFor(store, clock);
    const open = async (): Promise<string> =>
      (
        (
          await post(deps, '/referee/v1/rooms', longSession('u1'), {
            pace: 'async',
            method: 'budget',
            budget: 110,
          })
        ).body as RoomView
      ).code;

    const withdrawn = await open();
    await post(deps, `/referee/v1/rooms/${withdrawn}/leave`, longSession('u1'));
    const after = (await store.read(withdrawn))!;

    // AND ONCE SOMEBODY HAS TAKEN IT UP, both sides still have a way out - two different
    // ones. The creator closes the game; the person who followed the link gives the chair
    // back and the challenge is waiting again, which is what stops somebody who opened a
    // link by accident deleting a challenge that was not theirs.
    const taken = await open();
    await post(deps, `/referee/v1/rooms/${taken}/join`, longSession('u2'));
    await post(deps, `/referee/v1/rooms/${taken}/leave`, longSession('u1'));
    const calledOff = (await store.read(taken))!;

    const handedBack = await open();
    await post(deps, `/referee/v1/rooms/${handedBack}/join`, longSession('u2'));
    // WHAT THE SCREEN WOULD SAY, off the same payloads, because a button promising to call
    // a duel off that the referee then ignores is worse than no button - it looks like it
    // worked, which is exactly the shape of the bug this replaced. `leaveKind` is that rule
    // read from the client's end, so it is asserted against the real answers rather than
    // against a fixture.
    const asHost = leaveKind((await get(deps, `/referee/v1/rooms/${handedBack}`, longSession('u1'))).body as RoomView);
    const asGuest = leaveKind((await get(deps, `/referee/v1/rooms/${handedBack}`, longSession('u2'))).body as RoomView);
    await post(deps, `/referee/v1/rooms/${handedBack}/leave`, longSession('u2'));
    const reopened = (await store.read(handedBack))!;
    // And it is a challenge again, which is the whole point of the seat rather than the
    // room going: somebody else can take it.
    const retaken = await post(deps, `/referee/v1/rooms/${handedBack}/join`, longSession('u3'));

    const ignored = await open();
    clock.now += DUEL_IDLE_MS + 60_000;
    await sweepOnce(store, clock.now, SWEEP_MS);
    const stale = (await store.read(ignored))!;

    check(
      'duel: the creator calls a taken one off, the other player hands the seat back, and a week closes it',
      () =>
        // An unanswered one, called off by the person who opened it.
        after.status === 'ended' &&
        roomClosed(after) &&
        // A TAKEN one, called off by the same person. This is the line that used to read
        // the other way round.
        calledOff.status === 'ended' &&
        roomClosed(calledOff) &&
        // The second player leaving instead: the room lives, one seat, and the challenger
        // is still in it.
        reopened.status === 'drafting' &&
        reopened.members.length === 1 &&
        reopened.members[0]!.userId === 'u1' &&
        retaken.status === 200 &&
        // The two screens offer the two different things, which is what the referee then
        // does. Both halves matter: swap them and each player gets the other's button.
        asHost === 'calloff' &&
        asGuest === 'giveup' &&
        stale.status === 'ended' &&
        roomClosed(stale) &&
        // Vacuity: a duel a day old is untouched by the same sweep.
        DUEL_IDLE_MS > ROOM_IDLE_MS,
      () =>
        `withdrawn ${after.status}, called off ${calledOff.status}, ` +
        `host reads ${asHost}, guest reads ${asGuest}, ` +
        `reopened ${reopened.status}/${reopened.members.length}, retaken ${retaken.status}`,
    );
  }

  // --- The re-roll allowance the host sets ---------------------------------

  {
    const clock = { now: T0 };
    const store = new MemStore();
    store.names = { u1: 'Ada', u2: 'Bruno' };
    const deps = depsFor(store, clock);
    const made = await post(deps, '/referee/v1/rooms', session('u1'), {
      visibility: 'private',
      size: 2,
      method: 'roll',
      pickSeconds: 20,
      rerolls: 1,
    });
    const code = (made.body as RoomView).code;
    await post(deps, `/referee/v1/rooms/${code}/join`, session('u2'));
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    const before = (await store.read(code))!.deals.u1!.length;
    await post(deps, `/referee/v1/rooms/${code}/reroll`, session('u1'));
    const once = (await store.read(code))!.deals.u1!.length;
    await post(deps, `/referee/v1/rooms/${code}/reroll`, session('u1'));
    const twice = (await store.read(code))!.deals.u1!.length;
    check(
      'roll: a re-roll deals another squad, and the host\'s allowance is actually spent',
      () => once === before + 1 && twice === once,
      () => `dealt ${before} -> ${once} -> ${twice} with an allowance of 1`,
    );
    const view = (await get(deps, `/referee/v1/rooms/${code}`, session('u1'))).body as RoomView;
    check(
      'roll: a player sees their own deals and none of anybody else\'s',
      () => (view.you?.dealt.length ?? 0) > 0 && Object.keys(view.revealed).length === 0,
      () => JSON.stringify(view.you),
    );
  }

  // --- The one thing a check can say about the view -------------------------

  check(
    'view: the formation lookup the referee gates a lineup on refuses an invented style',
    () =>
      !!getFormation('4-3-3', 'bal') && getFormation('4-3-3', 'sideways' as never) === null,
  );
  check(
    'view: the dataset lookup the referee validates with is the one that returns undefined',
    () => datasetPlayer('no-such-player') === undefined && !!datasetPlayer(SQUADS[0]!.players[0]!.id),
  );
  check(
    'outage: recoverIfNeeded returns its argument when there was no outage, so a sweep can skip the write',
    () => {
      const clock = T0;
      const room = createRoom({
        id: '1',
        code: 'AAAAAA',
        hostId: 'u1',
        hostName: 'Ada',
        visibility: 'private',
        size: 2,
        rules: { method: 'budget', budget: 110, years: [] },
        pickSeconds: 20,
        now: clock,
        hostBudget: 110,
      });
      return recoverIfNeeded(room, clock, clock + SWEEP_MS, SWEEP_MS) === room;
    },
  );

  // --- THE CLIENT KNOCKS ON THE DOOR THE DEPLOYMENT OPENED --------------------
  // The first thing wrong with wave 5 in production, and nothing else could have caught
  // it: the deployed referee answered perfectly, the browser asked the wrong path, every
  // call came back 404, and the client read that as "the referee is not answering" and
  // said Versus was updating.
  //
  // `VITE_REFEREE_URL` points at the ROUTE (`https://HOST/referee`), not at the host, so a
  // path in the client is `/version` and `/v1/...`. Repeating the prefix asks the gateway
  // for `/referee/referee/...`, which matches nothing.
  //
  // Two halves, and both are needed. The first reads the client; the second reads the
  // DEPLOYMENT NOTE that sets the variable, so changing the deployment shape without
  // changing the client fails here rather than in a browser.
  {
    const client = readFileSync('src/state/pvp/referee.ts', 'utf8');
    // Every path this file builds, as the argument to `call` or appended to the base.
    const paths = [
      ...client.matchAll(/call(?:<[^>]*>)?\(\s*'(?:GET|POST)',\s*[`']([^`']+)/g),
      ...client.matchAll(/\$\{REFEREE\.url\}([^`]*)/g),
    ]
      .map((m) => m[1]!)
      // `${REFEREE.url}${path}` inside `call` is the generic concatenation rather than a
      // path of its own; every real path is a literal.
      .filter((x) => !x.startsWith('${'));
    const doubled = paths.filter((x) => x.startsWith('/referee'));
    check(
      `referee: none of the client's ${paths.length} paths repeats the /referee prefix the URL already carries`,
      () =>
        // Vacuity: it really is reading the paths. There are nine calls plus the
        // handshake, so anything under eight means the matcher has stopped matching.
        paths.length >= 8 &&
        paths.every((x) => x.startsWith('/')) &&
        doubled.length === 0,
      () =>
        doubled.length
          ? `doubled: ${doubled.join(', ')}`
          : `the scan found ${paths.length} paths, so it is not reading them`,
    );

    // --- EVERY REFUSAL THE REFEREE CAN SEND HAS A SENTENCE ----------------------
    // The referee names its refusals and, for the ones a deployment gets wrong, sends a
    // fault with them - which its own header says is how a deployment is debugged. A
    // client that collapses all of them into "the referee would not open a room just now"
    // throws that away, and that is exactly what wave 5 shipped: one sentence covering a
    // wrong JWT secret, a name the referee cannot read, a full room and a database error.
    //
    // So the mapping is held against the SOURCE of the refusals rather than against a list
    // somebody remembered to update.
    {
      const api = readFileSync('referee/src/api.ts', 'utf8');
      const sent = [
        ...new Set([
          ...[...api.matchAll(/fail\(\s*\d+,\s*'([a-z-]+)'/g)].map((m) => m[1]!),
          ...[...api.matchAll(/error:\s*'([a-z-]+)'/g)].map((m) => m[1]!),
        ]),
      ];
      const missing = sent.filter((c) => !KNOWN_CODES.includes(c));
      check(
        `referee: all ${sent.length} refusals the referee can send have a sentence in the client`,
        () =>
          // Vacuity: the scan really is reading the refusals. There are a dozen in the
          // router alone, so anything under eight means it has stopped matching.
          sent.length >= 8 && missing.length === 0,
        () =>
          missing.length
            ? `no sentence for: ${missing.join(', ')}`
            : `the scan found only ${sent.length} refusals, so it is not reading them`,
      );
      // And the token faults, which are the half that tells an owner their secret is
      // wrong. They come from two unions rather than from `fail` calls.
      const faults = [
        ...[...readFileSync('referee/src/jwt.ts', 'utf8').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!),
        ...[...readFileSync('src/domain/pvpAuth.ts', 'utf8').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!),
      ];
      const unionFaults = ['missing', 'malformed', 'wrong-algorithm', 'bad-signature', 'not-authenticated', 'no-subject', 'expired', 'wrong-audience'];
      const unnamed = unionFaults.filter((f) => !faults.includes(f));
      const unmapped = unionFaults.filter((f) => !refereeMessage(new RefereeError(401, 'unauthorized', f), 'x').raw?.includes(f));
      check(
        'referee: every token fault is still one of the two unions, and each gets its own sentence',
        () =>
          unnamed.length === 0 &&
          unmapped.length === 0 &&
          // The two halves say different things: a bad signature is the owner's to fix,
          // an expired session is the player's.
          refereeMessage(new RefereeError(401, 'unauthorized', 'bad-signature'), 'x').deployment &&
          !refereeMessage(new RefereeError(401, 'unauthorized', 'expired'), 'x').deployment,
        () => `not in a union: ${unnamed.join(', ')}; not carried: ${unmapped.join(', ')}`,
      );

      // ONE REFUSAL HAS AN ANSWER, and it has to reach the screen. "You are already in a
      // room" with no route to that room is a dead end, which is how the reported leave bug
      // felt: the referee sends the code as its detail, so the sentence names it and
      // `room` carries it out for a button.
      const held = refereeMessage(new RefereeError(409, 'already-in-a-room', 'ab12cd'), 'x');
      const other = refereeMessage(new RefereeError(409, 'room-full'), 'x');
      check(
        'referee: the already-in-a-room refusal names the room and hands it to the screen',
        () =>
          held.room === 'AB12CD' &&
          held.text.includes('AB12CD') &&
          // Vacuity: no other refusal invents one, and the same code with no detail does
          // not either - it falls back to the plain sentence rather than to "room null".
          other.room === null &&
          refereeMessage(new RefereeError(409, 'already-in-a-room'), 'x').room === null &&
          !refereeMessage(new RefereeError(409, 'already-in-a-room'), 'x').text.includes(
            'null',
          ),
        () => `${held.room} / ${held.text}`,
      );
    }

    // --- EVERY COLUMN THE ROW MAPPER READS IS NAMED IN THE `select` THAT FILLS IT -------
    // The bug this exists for reached production and broke the whole feature. `rows.ts`
    // reads `touched_at` on the room and `last_seen` on the member; `pgStore.ts` did not
    // name either in its two `select`s. `pg` hands over `undefined` for a column it was
    // not asked for, so both times came back unreadable, and the two halves of that failed
    // in opposite directions: on the READ, nothing threw and the whole of P31's lifecycle
    // quietly stopped working (an unreadable time is never older than ninety seconds); on
    // the WRITE, the conversion threw from inside the save, so the sweeper rolled back
    // every room it touched, once a second, for ever.
    //
    // THE ROUND-TRIP CHECK CANNOT SEE THIS, and that is why it needs its own check rather
    // than a better fixture. The offline store keeps rooms as rows built by `rowsFromRoom`,
    // which by construction fills every field of every interface - so the mapping was
    // exercised thousands of times here and the only untested thing in the whole path was
    // the list of column names in the query. That list is text, so this reads it as text.
    {
      const rows = readFileSync('referee/src/rows.ts', 'utf8');
      const store = readFileSync('referee/src/pgStore.ts', 'utf8');

      const fieldsOf = (name: string): string[] => {
        const at = rows.indexOf(`export interface ${name} {`);
        if (at < 0) return [];
        const body = rows.slice(at, rows.indexOf('\n}', at));
        return [...new Set([...body.matchAll(/^\s{2}([a-z_]+)\??:/gm)].map((m) => m[1]!))];
      };

      // The `select` that fills each interface, found by the table it reads from. The room's
      // is picked out by its own `where`, since `publicLobbies` also reads `pvp_rooms`.
      const columnsOf = (marker: string): string => {
        const at = store.indexOf(marker);
        if (at < 0) return '';
        return store.slice(store.lastIndexOf('select', at), at);
      };

      const QUERIES: { row: string; marker: string }[] = [
        // The room's own select, told apart from `publicLobbies`' and `myDuels`' by its
        // `where`. It reads through an alias now (it joins `profiles` for the name on an
        // outstanding challenge), which the column matcher below already allows for.
        { row: 'RoomRow', marker: 'where r.code = $1' },
        { row: 'MemberRow', marker: 'from pvp_members m' },
        { row: 'DealRow', marker: 'from pvp_deals' },
        { row: 'PickRow', marker: 'from pvp_picks' },
        { row: 'MatchRow', marker: 'from pvp_matches' },
      ];

      // A column name as a whole word, with or without a table alias in front of it. The
      // allowed characters before it deliberately exclude `_`, so `room_id` in the query
      // does not answer for a field called `id`.
      const names = (column: string, list: string): boolean =>
        new RegExp(`(^|[\\s,.(])${column}(?![A-Za-z0-9_])`).test(list);

      const scanned = QUERIES.map((q) => {
        const fields = fieldsOf(q.row);
        const list = columnsOf(q.marker);
        return { ...q, fields, list, missing: fields.filter((f) => !names(f, list)) };
      });
      const missing = scanned.flatMap((x) => x.missing.map((f) => `${x.row}.${f}`));
      const total = scanned.reduce((n, x) => n + x.fields.length, 0);

      check(
        `referee: all ${total} columns the row mapper reads are named in the select that fills it`,
        () =>
          // Vacuity, three ways, because every part of this can silently stop reading.
          // It found all five interfaces; each has a plausible number of fields; and a
          // column that is NOT there really is reported, which is the whole mechanism.
          scanned.every((x) => x.fields.length >= 3 && x.list.length > 20) &&
          total >= 45 &&
          scanned.every((x) => !names('no_such_column', x.list)) &&
          missing.length === 0,
        () =>
          missing.length
            ? `not selected: ${missing.join(', ')}`
            : `the scan read ${total} fields across ${scanned.length} queries, so it is not reading them`,
      );
    }

    // --- A MEMBER WHO LEAVES TAKES THEIR ROWS WITH THEM ---------------------------------
    // Same shape of problem as the check above, and the same reason it has to read the text:
    // the offline store keeps rooms as rows built from the room itself, so a member who is
    // gone has no rows to leave behind there and no fixture can catch this. On a real
    // Postgres they persist - and `roomFromRows` keys a pick on its USER rather than on a
    // seat, so they are read straight back in and handed to whoever takes the chair next.
    // Reachable since a duel's second player could give the seat back (2026-08-31); before
    // that the only way to lose a member was the lobby, where these three tables are empty.
    {
      const store = readFileSync('referee/src/pgStore.ts', 'utf8');
      // A plain substring rather than a pattern: the statement is written out in full in
      // `pgStore`, and a regex here would need escaping for `$1` and the bracket, which is
      // exactly the kind of detail that makes a text check quietly stop matching.
      const sweeps = (table: string): boolean =>
        store.includes(`delete from ${table} where room_id = $1 and not (user_id = any`);
      const TABLES = ['pvp_members', 'pvp_picks', 'pvp_deals', 'pvp_lineups'];
      check(
        'referee: every table keyed on a member is swept of rows for somebody no longer in the room',
        () =>
          TABLES.every(sweeps) &&
          // Vacuity, both ways: the scan can fail to find one, and it is not matching every
          // `delete` in the file - the per-slot pick sweep beside these is keyed on the slot
          // and must not answer for any of them.
          !sweeps('pvp_no_such_table') &&
          store.includes('not (slot_id = any($3))'),
        () => `${TABLES.filter((t) => !sweeps(t)).join(', ') || 'all four swept'}`,
      );
    }

    // And the belt to that braces: a time the query did not fetch must FAIL rather than
    // become `NaN`. An unreadable time is silently never older than anything, so carrying
    // one turns every lifecycle rule off without a word; throwing at the load puts the
    // failure where the column name still is.
    {
      const threw = (fn: () => unknown): boolean => {
        try {
          fn();
          return false;
        } catch {
          return true;
        }
      };
      const missing = undefined as unknown as Date;
      check(
        'referee: a timestamp the query did not fetch is a failure, not NaN',
        () =>
          threw(() => msOf(missing)) &&
          threw(() => msOf('not a date')) &&
          threw(() => atOf(Number.NaN)) &&
          // Vacuity: the real values still convert, so this is not simply throwing always.
          msOf(new Date(1700)) === 1700 &&
          atOf(1700) === new Date(1700).toISOString(),
      );
    }

    // --- THE DEPLOY SCRIPT FINDS DOCKER BEFORE IT USES IT --------------------------
    // Synology keeps docker off a login shell's PATH and usually needs root for it, so the
    // script probes four spellings and remembers the one that works. `--verify` did not
    // probe, so its two database calls were written as a bare `docker compose` - and under
    // `set -euo pipefail` a failing command substitution aborts the script mid-stage: the
    // step-4 heading printed and then nothing at all, no warning and no footer. A stage
    // that reaches the NAS's docker has to detect it first, and none may hardcode it.
    {
      const sh = readFileSync('scripts/deploy-referee.sh', 'utf8');
      // Each `stage_*` function, from its own header to the next one.
      const bounds = [...sh.matchAll(/^stage_[a-z_]+\(\) \{$/gm)].map((m) => m.index!);
      const stages = bounds.map((at, i) => ({
        name: /^stage_[a-z_]+/.exec(sh.slice(at))![0],
        body: sh.slice(at, bounds[i + 1] ?? sh.length),
      }));
      const uses = stages.filter((x) => /\$DOCKER|\$COMPOSE/.test(x.body));
      const blind = uses.filter((x) => !x.body.includes('detect_docker')).map((x) => x.name);
      // A remote invocation of docker by name rather than through the probed variable.
      const hardcoded = [...sh.matchAll(/on "(?:sudo )?(?:\/[\w/]+\/)?docker[\s-]/g)].length;
      check(
        `referee: all ${uses.length} deploy stages that use the NAS's docker detect it first`,
        () =>
          // Vacuity: it found the stages and the ones that use docker. There are five
          // stages and four of them talk to docker, so anything less means the split or
          // the test has stopped working.
          stages.length >= 5 &&
          uses.length >= 3 &&
          blind.length === 0 &&
          hardcoded === 0,
        () =>
          blind.length
            ? `does not call detect_docker: ${blind.join(', ')}`
            : hardcoded
              ? `${hardcoded} remote call(s) name docker directly instead of using $DOCKER/$COMPOSE`
              : `the scan found ${stages.length} stages and ${uses.length} using docker, so it is not reading them`,
      );
    }

    const setup = readFileSync('docs/nas-setup.md', 'utf8');
    check(
      'referee: the deployment still points VITE_REFEREE_URL at the route, not at the host',
      () => /`VITE_REFEREE_URL`[^\n]*`https:\/\/HOST\/referee`/.test(setup),
      () =>
        'docs/nas-setup.md no longer sets VITE_REFEREE_URL to https://HOST/referee - if the ' +
        'deployment now points at the host, every path in src/state/pvp/referee.ts needs the ' +
        'prefix back',
    );
  }
}
