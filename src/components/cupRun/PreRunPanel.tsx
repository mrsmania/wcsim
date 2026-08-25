import { Link } from 'react-router-dom';
import type { Player } from '../../data/types';
import { CARD, PRIMARY_BTN } from '../matchUi';
import RunXiPanel from './RunXiPanel';

/** What `/cup-run` shows when there is no run: the drafted XI with a kickoff button, or
 *  a pointer back to the build if there is no XI either (hygiene H85).
 *
 *  Both are FALLBACKS rather than the norm. A kickoff goes straight into the group draw,
 *  so this is what you get by arriving without one - a reload, a Back navigation, a
 *  bookmark, a tab tap - and it keeps the button so none of those is a dead end. */
export default function PreRunPanel({
  xi,
  odds,
  str,
  onPlay,
  buildTo,
}: {
  /** The drafted XI, or null when the build is not finished. */
  xi: Player[] | null;
  /** The title-odds readout and the rating strip, both for the XI as it stands. */
  odds: number;
  str: { attack: number; defense: number; overall: number };
  /** Commit the run at the chosen Ascension and reveal the group, in one step. */
  onPlay: () => void;
  buildTo: string;
}) {
  if (!xi) {
    return (
      <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center shadow-hard">
        <p className="mb-4 text-[13.5px] text-muted">
          Draft your XI first, then bring it here for a Cup Run.
        </p>
        <Link to={buildTo} className={PRIMARY_BTN}>
          Draft your XI
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <RunXiPanel xi={xi} score={0} activeBoons={[]} boostedIds={new Set()} odds={odds} str={str} />
      <section className="flex min-w-0 flex-col gap-4">
        <div className={`${CARD} p-5`}>
          <div className="mt-4 text-center">
            <p className="mb-4 text-[13.5px] text-muted">
              Pick a team boost between rounds; every run earns XP and Prestige. Finish top two in
              the group to reach the knockouts.
            </p>
            <button onClick={onPlay} className={PRIMARY_BTN}>
              Play group stage
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
