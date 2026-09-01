import { readJson, writeJson } from '../storage/kv';

// ---------------------------------------------------------------------------
// The duels whose result has already been watched: the LOCAL half of it.
//
// This module is the guest/local storage for that list and nothing else - the key, the
// revive and the cap. The list itself is read and written through the store seam
// (`state/pvp/watched.ts`), which is what makes it follow an ACCOUNT rather than a
// browser; a signed-in player's copy lives in their settings row on the server and never
// touches this key at all.
//
// It is split from `watched.ts` so that `localStore` can import the storage without
// importing the store facade back - `state/store/index.ts` builds a local store at module
// scope, so that cycle would run half-initialised.
// ---------------------------------------------------------------------------

/** Owned here and exported, the rule every storage key in this app follows - so anything
 *  that has to name it does so by import rather than by a re-typed string.
 *
 *  IT IS DELIBERATELY NOT IN `GUEST_KEYS`, and `npm run checks` pins that: those are the
 *  progress a guest carries into a new account, and a guest has no duels to have watched
 *  (a room is account-only, P17). An account's copy is not stored here in any case. */
export const VERSUS_WATCHED_KEY = 'wcsim_versus_watched_v1';

/** How many codes to remember. Enough that a player never sees the same match twice in a
 *  normal run of play, small enough that the value stays a line of JSON - which matters
 *  more now that an account's copy rides along in the settings blob. Oldest are dropped: a
 *  duel from two hundred matches ago is not one anybody is about to open. */
export const WATCHED_LIMIT = 200;

/** Codes out of whatever was stored, tolerant of every shape that is not a list of
 *  strings. Shared by both halves: the account's copy is jsonb this same client wrote, so
 *  it needs the same tolerance as localStorage does. */
export const reviveWatched = (parsed: unknown): string[] =>
    Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string').slice(0, WATCHED_LIMIT)
        : [];

/** The guest's list. */
export function loadWatchedDuels(): string[] {
    return readJson(VERSUS_WATCHED_KEY, reviveWatched, []);
}

/** Write the guest's list. */
export function saveWatchedDuels(codes: readonly string[]): void {
    writeJson(VERSUS_WATCHED_KEY, codes);
}
