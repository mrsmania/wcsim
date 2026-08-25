import { useEffect, useRef, useState } from 'react';
import type { RunState } from '../domain/run';
import { store } from '../state/store';
import type { Reveal } from '../components/cupRun/types';

// The run in flight and the match reveal playing over it, with the two writes that keep
// them. Extracted from `CupRunScreen`, which was the only component that imported the
// store (hygiene H81) - it no longer imports it at all.
//
// **This one is NOT lifted to App, unlike the career**, and the reason is recorded rather
// than left to be rediscovered: the account path depends on the run being written back by
// a CHILD's effect. `remoteStore.finishRun` clears `active_run` server-side and then
// re-saves whatever run the cache holds, and that has to be the run carrying
// `stickersApplied` - which the run screen sets in the same effect that reports the run's
// end, relying on a child's effect running before its parent's. Moving this state up
// inverts exactly that ordering, and the failure would be a run banked twice on a reload.
// The one `store.peek()` left in App reads the run for the front page's Continue line,
// and that is the price.

export interface CupRun {
    /** The run in flight, or null when there is none. */
    run: RunState | null;
    setRun: (run: RunState | null) => void;
    /** The live match reveal. Transient: for an account it is never persisted at all, so
     *  nothing that a reload must not re-roll may live here alone - the run carries the
     *  decisions (`group`, `groupExit`, `koPending`). */
    reveal: Reveal | null;
    setReveal: (reveal: Reveal | null) => void;
}

/** Seeded from `store.peek()` at mount rather than from a snapshot handed down, and that
 *  is deliberate: the run screen unmounts whenever another tab is open, so a boot snapshot
 *  would re-seed it with whatever the run was when the page loaded. `peek()` is
 *  synchronous and always current (main.tsx loads once before the first render). */
export function useCupRun(): CupRun {
    const [run, setRun] = useState<RunState | null>(() => store.peek().run);
    const [reveal, setReveal] = useState<Reveal | null>(() => store.peek().reveal);

    // Both seeds came FROM storage, so the first pass of each effect below would write
    // back exactly what was just read. Skipped: for a guest that is a wasted round trip
    // through JSON, and for an account it is a real request on every mount.
    const runWritten = useRef(false);
    const revealWritten = useRef(false);

    // Persist the in-progress run (or clear it once there is none), so a refresh mid-run
    // resumes exactly where it left off. Clearing it drops the reveal too, which is what
    // stops a stale reveal outliving its run.
    useEffect(() => {
        if (!runWritten.current) {
            runWritten.current = true;
            return;
        }
        void store.saveRun(run);
    }, [run]);

    // Persist the in-flight reveal alongside the run, so leaving mid-match resumes the
    // current round instead of replaying it. Cleared when the reveal ends.
    useEffect(() => {
        if (!revealWritten.current) {
            revealWritten.current = true;
            return;
        }
        void store.saveReveal(reveal);
    }, [reveal]);

    return { run, setRun, reveal, setReveal };
}
