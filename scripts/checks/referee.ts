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
import { validateXi } from '../../src/domain/pvp';
import {
  createRoom,
  deadlineOf,
  formationOf,
  recoverFromOutage,
  tickRoom,
  type PickSeconds,
  type PvpRoom,
  type RoomSize,
} from '../../src/domain/pvpRoom';
import { handle, type ApiDeps, type ApiResponse } from '../../referee/src/api';
import { readEnv } from '../../referee/src/env';
import { recoverIfNeeded, wasOutage } from '../../referee/src/outage';
import { roomFromRows, rowsFromRoom, type RoomRows } from '../../referee/src/rows';
import { recoverAtBoot, sweepOnce } from '../../referee/src/sweeper';
import type { CreateInput, Mutation, MutateContext, RoomStore } from '../../referee/src/store';
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
    });
    this.put(room, now);
    return room;
  }

  private put(room: PvpRoom, sweptAt: number | null): void {
    this.rows.set(
      room.code,
      rowsFromRoom(room, { sweptAt, displayNames: this.names }),
    );
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
    return [...this.rows.values()]
      .filter((r) => r.room.status === 'drafting' || r.room.status === 'round')
      .map((r) => r.room.code);
  }

  async activeRoomOf(userId: string): Promise<string | null> {
    for (const rows of this.rows.values()) {
      if (rows.room.status === 'ended') continue;
      if (rows.members.some((m) => m.user_id === userId)) return rows.room.code;
    }
    return null;
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
async function seatedRoom(clock: { now: number }): Promise<{ store: MemStore; deps: ApiDeps; code: string }> {
  const store = new MemStore();
  store.names = { u1: 'Ada', u2: 'Bruno' };
  const deps = depsFor(store, clock);
  const made = await post(deps, '/referee/v1/rooms', session('u1'), {
    visibility: 'private',
    size: 2,
    method: 'budget',
    budget: 110,
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
    const { deps, code, store } = await seatedRoom(clock);
    await post(deps, `/referee/v1/rooms/${code}/start`, session('u1'));
    const room = (await store.read(code))!;
    const me = room.members.find((m) => m.userId === 'u1')!;
    const slot = formationOf(me).slots[0]!;
    const legal = SQUADS.flatMap((s) => s.players).find(
      (p) => p.positions.includes(slot.position) && p.elo < 70,
    )!;

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
    const other = SQUADS.flatMap((s) => s.players).find(
      (p) =>
        p.positions.includes(formationOf(me).slots[1]!.position) &&
        p.elo < 70 &&
        p.personId !== legal.personId,
    )!;
    const late = await post(deps, `/referee/v1/rooms/${code}/pick`, session('u1'), {
      ordinal: 2,
      slotId: formationOf(me).slots[1]!.id,
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
    const { deps, code, store } = await seatedRoom(clock);
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
    const { deps, code, store } = await seatedRoom(clock);
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
    const { deps, code, store } = await seatedRoom(clock);
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
