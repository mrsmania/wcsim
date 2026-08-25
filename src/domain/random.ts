// Shared randomness helpers. Uses Math.random intentionally, matching the sim.

/** One random element of a NON-EMPTY array.
 *
 *  CLAUDE.md listed this module as "shuffled + pick" long before `pick` existed: the idiom
 *  was open-coded at 13 sites across 8 files, 9 of them in `domain/`. This is exactly value
 *  preserving against that inline form - one `Math.random()` per call, same distribution.
 *
 *  The return type is `T`, not `T | undefined`, deliberately: it mirrors the indexing it
 *  replaces. `noUncheckedIndexedAccess` is off, so `arr[i]` already types as `T`, and
 *  widening here would force a non-null assertion at all 13 call sites - trading one
 *  duplicated expression for thirteen `!`s. On an empty array it returns undefined at
 *  runtime, exactly as the inline form did; every caller already guards or knows its pool
 *  is non-empty. If D3 (`noUncheckedIndexedAccess`) is ever adopted, this signature is one
 *  of the places to revisit. */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A shuffled copy of `arr` (Fisher-Yates; the input is left untouched). */
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
