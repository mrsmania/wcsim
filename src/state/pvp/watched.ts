import { readJson, writeJson } from '../storage/kv';

// ---------------------------------------------------------------------------
// The duels whose result this browser has already watched.
//
// WHY IT EXISTS. A duel's match is played by the server, at the moment the second XI
// lands, with nobody necessarily looking - which is the whole mode. So when a player
// finally opens it, the thing to do is play the match rather than print the score, and
// that needs a fact nothing else in the system holds: has THIS person, on THIS device,
// sat through it yet. It is also what the chrome's strip reads to decide whether there is
// a result waiting, which is the other half of "tell me when the game has taken place".
//
// IT IS DELIBERATELY LOCAL AND DELIBERATELY NOT SYNCED. Whether you watched a reveal is
// not progress: it earns nothing, it changes no result, and a server column for it would
// be a write on every match anybody looks at. The cost of it being local is that a second
// device replays the match once, which is the right way round - it is the match, and
// watching it again costs nothing but the ninety seconds you chose to spend.
//
// A ROOM CODE IS THE KEY because a duel is one match: there is no round to disambiguate,
// and a room's code is unique for as long as the room exists.
// ---------------------------------------------------------------------------

/** Owned here and exported, the rule every storage key in this app follows - so anything
 *  that has to name it does so by import rather than by a re-typed string.
 *
 *  IT IS DELIBERATELY NOT IN `GUEST_KEYS`, and `npm run checks` pins that: those are the
 *  progress a guest carries into a new account, and a guest has no duels to have watched
 *  (a room is account-only, P17). Nothing here is progress in any case - see the header. */
export const VERSUS_WATCHED_KEY = 'wcsim_versus_watched_v1';

/** How many codes to remember. Enough that a player never sees the same match twice in a
 *  normal run of play, small enough that the value stays a line of JSON. Oldest are
 *  dropped: a duel from two hundred matches ago is not one anybody is about to open. */
const LIMIT = 200;

const revive = (parsed: unknown): string[] =>
    Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];

let codes: string[] | null = null;

const load = (): string[] => (codes ??= readJson(VERSUS_WATCHED_KEY, revive, []));

const subs = new Set<(watched: ReadonlySet<string>) => void>();
let snapshot: ReadonlySet<string> | null = null;

/** The set, rebuilt only when it changes - so a component may compare identities and a
 *  render that reads it does not allocate. */
export function watchedDuels(): ReadonlySet<string> {
    return (snapshot ??= new Set(load()));
}

/** Remember that this room's result has been seen. Idempotent: opening the same finished
 *  duel twice must not push everything else out of the list. */
export function markDuelWatched(code: string): void {
    const held = load();
    if (held.includes(code)) return;
    codes = [code, ...held].slice(0, LIMIT);
    snapshot = null;
    writeJson(VERSUS_WATCHED_KEY, codes);
    const now = watchedDuels();
    for (const s of subs) s(now);
}

/** Subscribe to it. Used by the chrome, which has to stop offering a result the moment it
 *  has been watched in the room screen below. */
export function onWatchedChange(fn: (watched: ReadonlySet<string>) => void): () => void {
    subs.add(fn);
    return () => {
        subs.delete(fn);
    };
}
