// The in-memory snapshot both `Store` implementations hold, and the two operations
// they both do to it. It was written out twice, the patch half character-identical
// (hygiene H89).
//
// Why a cache exists at all: `store.load()` runs once before the first render, and
// everything afterwards reads through `peek()` synchronously - so hooks and the reducer
// can seed without a loading state, and the two places that re-read on navigation do
// not have to await anything. The accepted cost is written down in CLAUDE.md: a second
// browser tab no longer sees the first tab's writes.

import type { AccountSnapshot } from './types';

export interface SnapshotCache {
    /** The snapshot, or a thrown error if `load()` has not run. Never null-returning:
     *  a caller reading before boot is a wiring mistake, not a state to handle. */
    peek: () => AccountSnapshot;
    /** Overwrite the whole snapshot, at the end of `load()`. */
    set: (snapshot: AccountSnapshot) => void;
    /** Replace the cache with a patched COPY. Never mutated in place, so a holder of an
     *  earlier snapshot keeps the values it was given - `main.tsx` hands the boot
     *  snapshot to `App`, which seeds the reducer and several hooks from it. */
    patch: (next: Partial<AccountSnapshot>) => void;
}

export function createSnapshotCache(): SnapshotCache {
    let cache: AccountSnapshot | null = null;
    const peek = (): AccountSnapshot => {
        if (!cache) {
            throw new Error('store.peek() before store.load(): load once at boot (see main.tsx)');
        }
        return cache;
    };
    return {
        peek,
        set: (snapshot) => {
            cache = snapshot;
        },
        patch: (next) => {
            cache = { ...peek(), ...next };
        },
    };
}
