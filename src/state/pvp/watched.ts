import { store } from '../store';
import { WATCHED_LIMIT } from './watchedStorage';

// ---------------------------------------------------------------------------
// The duels whose result has already been watched.
//
// WHY IT EXISTS. A duel's match is played by the server, at the moment the second XI
// lands, with nobody necessarily looking - which is the whole mode. So when a player
// finally opens it, the thing to do is play the match rather than print the score, and
// that needs a fact nothing else in the system holds: has this person sat through it yet.
// It is also what the chrome's strip reads to decide whether there is a result waiting,
// which is the other half of "tell me when the game has taken place".
//
// IT FOLLOWS THE ACCOUNT, and it used to follow the BROWSER. The first version kept the
// codes in localStorage and said in this header that whether you had watched a reveal was
// not worth syncing - it earns nothing and changes no result. That reasoning was wrong
// about what the list is FOR: it is not a record of what you have seen, it is what decides
// whether the app has anything waiting for you, so a copy that does not travel means every
// duel you have already watched announces itself again on the next device or the next
// sign-in, and the one signal this mode has stops meaning anything. Reported from the game
// in exactly those words: matches already watched came back as unwatched after a re-login.
//
// So it goes through the store seam like every other persisted thing: a guest's list stays
// in `watchedStorage`'s own key, and an account's rides in the settings row's jsonb (see
// `settingsStorage.toStored`), which is why this needed no migration. Being per ACCOUNT
// rather than per browser also stops two accounts sharing one device sharing a list, which
// the old key did.
//
// A ROOM CODE IS THE KEY because a duel is one match: there is no round to disambiguate,
// and a room's code is unique for as long as the room exists.
// ---------------------------------------------------------------------------

const subs = new Set<(watched: ReadonlySet<string>) => void>();

/** The set is rebuilt only when the stored list changes identity - so a component may
 *  compare identities and a render that reads it does not allocate. Both stores patch the
 *  snapshot with the very array handed to `saveWatchedDuels`, so identity is enough. */
let source: readonly string[] | null = null;
let snapshot: ReadonlySet<string> = new Set();

export function watchedDuels(): ReadonlySet<string> {
    const held = store.peek().watchedDuels;
    if (held !== source) {
        source = held;
        snapshot = new Set(held);
    }
    return snapshot;
}

/** Remember that this room's result has been seen. Idempotent: opening the same finished
 *  duel twice must not push everything else out of the list, or cost a write. */
export function markDuelWatched(code: string): void {
    const held = store.peek().watchedDuels;
    if (held.includes(code)) return;
    // The save patches the snapshot before it awaits anything, so `watchedDuels()` below
    // already reads the new list. A signed-in write that then fails raises the unreachable
    // screen, exactly as every other write does.
    void store.saveWatchedDuels([code, ...held].slice(0, WATCHED_LIMIT));
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
