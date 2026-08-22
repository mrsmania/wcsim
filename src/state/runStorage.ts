import type { RunState } from '../domain/run';
// Type-only (erased at build) so this storage module keeps no runtime dependency on
// the component layer; `Reveal` is a plain-data view-model over domain types.
import type { Reveal } from '../components/cupRun/types';

/** localStorage key for an in-progress Cup Run. Separate from the game, album, and
 *  career keys, so it survives a game reset and can be cleared on its own when a run
 *  is abandoned or a new one begins. */
const KEY = 'wcsim_run_v1';
/** The live match-reveal in flight, persisted alongside the run so leaving mid-match
 *  (or a refresh) resumes exactly where it was instead of replaying the round. */
const REVEAL_KEY = 'wcsim_run_reveal_v1';

/** Load an in-progress Cup Run, or null if absent / unreadable. The stored RunState
 *  is a plain data object (players, ids, history), so a JSON round-trip restores it.
 *  A quick shape check guards against a stale/corrupt value. */
export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.phase !== 'string' || !Array.isArray(parsed.xi)) return null;
    const run = parsed as RunState;
    // Default fields added after a save may predate them (older in-progress runs).
    if (!Array.isArray(run.unlockedBoons)) run.unlockedBoons = [];
    if (!run.perkLevels || typeof run.perkLevels !== 'object') run.perkLevels = {};
    if (typeof run.ascension !== 'number') run.ascension = 0;
    return run;
  } catch {
    return null;
  }
}

/** Persist the in-progress Cup Run. */
export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* storage unavailable (private mode / quota); the run just won't persist */
  }
}

/** Drop the persisted Cup Run (a new run, an abandon, or back to the hub). Also drops
 *  any in-flight reveal, so a stale reveal can never outlive its run. */
export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(REVEAL_KEY);
  } catch {
    /* ignore */
  }
}

/** Load the in-flight match reveal, or null. Plain-data round-trip, like the run. */
export function loadReveal(): Reveal | null {
  try {
    const raw = localStorage.getItem(REVEAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Reveal;
  } catch {
    return null;
  }
}

export function saveReveal(reveal: Reveal): void {
  try {
    localStorage.setItem(REVEAL_KEY, JSON.stringify(reveal));
  } catch {
    /* storage unavailable; the reveal just won't survive a refresh */
  }
}

export function clearReveal(): void {
  try {
    localStorage.removeItem(REVEAL_KEY);
  } catch {
    /* ignore */
  }
}
