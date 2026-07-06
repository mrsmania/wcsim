import type { RunState } from '../domain/run';

/** localStorage key for an in-progress Cup Run. Separate from the game, album, and
 *  career keys, so it survives a game reset and can be cleared on its own when a run
 *  is abandoned or a new one begins. */
const KEY = 'wcsim_run_v1';

/** Load an in-progress Cup Run, or null if absent / unreadable. The stored RunState
 *  is a plain data object (players, ids, log), so a JSON round-trip restores it. A
 *  quick shape check guards against a stale/corrupt value. */
export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.phase !== 'string' || !Array.isArray(parsed.xi)) return null;
    return parsed as RunState;
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

/** Drop the persisted Cup Run (a new run, an abandon, or back to the hub). */
export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
