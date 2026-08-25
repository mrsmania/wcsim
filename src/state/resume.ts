// What the front page can offer to carry on with, and the words it says. Two pure
// derivations that were inline `useMemo` bodies in the composition root (hygiene H83).
//
// The copy lives here with the rule that produces it on purpose: "Finish your XI" and
// "Your XI is ready" are the two halves of one decision about a half-built team, and
// splitting the sentence from the test is how they drift apart.

import type { Formation } from '../domain/formations';
import { filledCount, type Filled } from '../domain/draft';
import { KO_ROUNDS } from '../domain/knockout';
import type { RunState } from '../domain/run';

/** A Cup Run still in flight, described in one line for the Continue button. Null when
 *  there is nothing to resume - including a run that has ENDED, which is a finished
 *  story rather than a thing to carry on with. */
export function cupRunResume(run: RunState | null | undefined): { summary: string } | null {
    if (!run || run.phase === 'ended') return null;
    const round = run.phase === 'group' ? 'Group stage' : (KO_ROUNDS[run.koRound] ?? 'Knockouts');
    const opp = run.nextOpponent ? ` · vs ${run.nextOpponent.name} ${run.nextOpponent.year}` : '';
    return { summary: round + opp };
}

/** An XI left mid-build, so coming back to the site is never a dead end.
 *
 *  Offered only when there is nothing further along (`hasRun`): a Cup Run in flight
 *  already covers the same intent, and implies a finished XI anyway. A board with
 *  nothing picked is not a resume either - that is just the build page. */
export function buildResume(
    formation: Formation | null,
    filled: Filled,
    hasRun: boolean,
): { to: string; label: string; sub: string } | null {
    if (!formation || hasRun) return null;
    const picked = filledCount(formation, filled);
    if (picked === 0) return null;
    const to = '/play';
    return picked === formation.slots.length
        ? { to, label: 'Your XI is ready', sub: formation.name }
        : {
              to,
              label: 'Finish your XI',
              sub: `${formation.name} · ${picked} of ${formation.slots.length} picked`,
          };
}
