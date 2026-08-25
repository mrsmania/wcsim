import { isRoundRecord, type Reveal, type RunState } from '../domain/run';
import { readJson, removeKeys, writeJson } from './storage/kv';

/** localStorage key for an in-progress Cup Run. Separate from the game, album, and
 *  career keys, so it survives a game reset and can be cleared on its own when a run
 *  is abandoned or a new one begins. */
export const RUN_KEY = 'wcsim_run_v1';
/** The live match-reveal in flight, persisted alongside the run so leaving mid-match
 *  (or a refresh) resumes exactly where it was instead of replaying the round. */
export const REVEAL_KEY = 'wcsim_run_reveal_v1';

/** Load an in-progress Cup Run, or null if absent / unreadable. The stored RunState
 *  is a plain data object (players, ids, history), so a JSON round-trip restores it.
 *  A quick shape check guards against a stale/corrupt value. */
export function loadRun(): RunState | null {
  return readJson<RunState | null>(
    RUN_KEY,
    (raw) => {
      const parsed = raw as Partial<RunState> | null;
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.phase !== 'string' || !Array.isArray(parsed.xi)) return null;
      // A fresh object with the defaults resolved, rather than mutating what JSON.parse
      // returned and casting it (hygiene H73). Building it explicitly is what lets the cast
      // go: every field below is either checked or defaulted here.
      return {
        ...(parsed as RunState),
        // Fields added after a save may predate it (older in-progress runs).
        unlockedBoons: Array.isArray(parsed.unlockedBoons) ? parsed.unlockedBoons : [],
        perkLevels:
          parsed.perkLevels && typeof parsed.perkLevels === 'object' ? parsed.perkLevels : {},
        ascension: typeof parsed.ascension === 'number' ? parsed.ascension : 0,
        // The effect ledger (roadmap item 04) split the XI into a base roster plus a list of
        // what has been done to it. A run saved before that has only the baked-in XI, so its
        // boosts cannot be itemised retroactively - taking the XI as the roster and starting
        // the ledger empty lets it finish correctly, which is all that is wanted here.
        roster: Array.isArray(parsed.roster) ? parsed.roster : parsed.xi,
        effects: Array.isArray(parsed.effects) ? parsed.effects : [],
        // `RoundRecord` is a discriminated union now, so consumers read its fields without a
        // fallback - which means a malformed or truncated entry must not reach them. Each is
        // gated by `isRoundRecord` and a failing one is DROPPED: that loses one round's
        // review rather than breaking the run (hygiene H70).
        history: Array.isArray(parsed.history) ? parsed.history.filter(isRoundRecord) : [],
      };
    },
    null,
  );
}

/** Persist the in-progress Cup Run. */
export function saveRun(run: RunState): void {
  writeJson(RUN_KEY, run);
}

/** Drop the persisted Cup Run (a new run, an abandon, or back to the hub). Also drops
 *  any in-flight reveal, so a stale reveal can never outlive its run. */
export function clearRun(): void {
  removeKeys(RUN_KEY, REVEAL_KEY);
}

/** Load the in-flight match reveal, or null. Plain-data round-trip, like the run.
 *
 *  `Reveal` is a discriminated union on `kind`, and which branch renders is decided by it -
 *  so this was the one loader in `state/` that validated nothing while handing a naked cast
 *  straight to a renderer (hygiene H73). Every sibling checks something. The guard below is
 *  the same kind as the run's: the discriminant plus the fields the chosen branch indexes,
 *  not a full schema. */
export function loadReveal(): Reveal | null {
  return readJson<Reveal | null>(REVEAL_KEY, (raw) => (isReveal(raw) ? raw : null), null);
}

/** Shape guard for a stored reveal. A reveal is transient playback state, so rejecting a
 *  malformed one costs nothing more than replaying the current round. */
function isReveal(v: unknown): v is Reveal {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<Reveal>;
  if (!r.next || typeof r.next !== 'object') return false;
  if (r.kind === 'group') {
    const g = r as Extract<Reveal, { kind: 'group' }>;
    return (
      Array.isArray(g.matches) &&
      !!g.group &&
      Array.isArray(g.group.teams) &&
      typeof g.index === 'number' &&
      typeof g.done === 'boolean'
    );
  }
  if (r.kind === 'ko') {
    const k = r as Extract<Reveal, { kind: 'ko' }>;
    return !!k.match && typeof k.match === 'object' && !!k.opp && typeof k.roundName === 'string';
  }
  return false;
}

export function saveReveal(reveal: Reveal): void {
  writeJson(REVEAL_KEY, reveal);
}

export function clearReveal(): void {
  removeKeys(REVEAL_KEY);
}
