// The `localStorage` plumbing, once. Nineteen `try { localStorage... } catch {}` blocks
// were spread across six storage modules, eleven of them the byte-identical
// write-and-swallow shape (hygiene H87). None of that repetition is logic: the logic is
// each module's own revive function, which is why `readJson` takes one rather than
// trying to be generic about shapes.
//
// Everything here swallows. Storage can be unavailable (private mode, a quota, a browser
// set to block site data) and the game is fully playable without it - progress simply
// does not persist. A throw from any of these would take a screen down for a feature
// that is optional by design.

/** Read and revive one key, or fall back.
 *
 *  The revive runs INSIDE the same try as the read and the parse, deliberately: a
 *  malformed value can fail at any of the three steps and every call site wants the
 *  same answer when it does. The fallback is the caller's, so each site keeps exactly
 *  the empty value it always returned (an empty album, `INITIAL_CAREER`, `null`). */
export function readJson<T>(key: string, revive: (parsed: unknown) => T, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return revive(JSON.parse(raw));
    } catch {
        return fallback;
    }
}

/** Write one key as JSON. A failure is silent - see the note at the top. */
export function writeJson(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable (private mode / quota): this slice just won't persist */
    }
}

/** Remove keys, all or nothing about nothing: a failure on one leaves the rest alone,
 *  which is the same thing the hand-written loops did. */
export function removeKeys(...keys: string[]): void {
    try {
        for (const k of keys) localStorage.removeItem(k);
    } catch {
        /* storage unavailable; nothing to clear */
    }
}

/** Whether any of these keys holds anything. The last of the nineteen swallowed reads,
 *  and the only one that does not parse: it answers "is there guest progress here". */
export function hasAnyKey(keys: readonly string[]): boolean {
    try {
        return keys.some((k) => localStorage.getItem(k) !== null);
    } catch {
        return false;
    }
}
