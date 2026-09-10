// Whether there is a Cup Run to go back to, and nothing more. One pure predicate that
// was an inline ternary in the composition root before hygiene H83.
//
// IT USED TO BE TWO DERIVATIONS, AND BOTH WROTE COPY (2026-09-10). The front page led
// with a Continue action - a live run, else a half-built XI - so `cupRunResume` returned
// the round and the next opponent as a sentence and `buildResume` returned "Finish your
// XI - 4-3-3 - 7 of 11 picked". The cover offers one action now, "Build your XI now",
// whatever is in progress, so both sentences and the half-built test went with it: the
// only thing left asking the question is where the Play tab lands, which needs a yes or
// no. Keep it that way - a string here is a front-page feature, not a state helper.

import type { RunState } from '../domain/run';

/** A Cup Run still in flight, so the Play tab lands on it rather than on the build page.
 *  False for an ENDED run, which is a finished story rather than a thing to carry on
 *  with. */
export function hasLiveRun(run: RunState | null | undefined): boolean {
    return !!run && run.phase !== 'ended';
}
