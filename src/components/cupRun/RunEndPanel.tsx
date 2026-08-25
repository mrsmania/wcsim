import { CARD, PRIMARY_BTN, SECONDARY_BTN } from '../matchUi';
import { AWARDS_ON, challengeById } from '../../domain/challenges';
import ChallengeRow from '../challengeUi';
import type { Reward } from './types';

/** The ended-state action panel: the final score + run reward readout, and the
 *  draft-new / replay / career actions. */
export default function RunEndPanel({
  score,
  reward,
  onReDraft,
  onReplay,
  onCareer,
  banking = false,
}: {
  score: number;
  reward: Reward | null;
  onReDraft: () => void;
  onReplay: () => void;
  onCareer: () => void;
  /** This run's stickers are still being saved: hold the next run until the haul has
   *  been shown, rather than letting it pop up inside the following run. */
  banking?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="font-display text-2xl font-black">Final score {score}</div>
      {reward && (
        <div className="mt-1.5 font-mono text-[12px] text-muted">
          +{reward.xpGained} XP &middot;{' '}
          <span className="text-amber">+{reward.prestigeGained} Prestige</span>
          {reward.ascensionMult > 1 && (
            <span className="ml-2 text-amber-ink">Ascension x{reward.ascensionMult}</span>
          )}
          {reward.leveledUp && <span className="ml-2 font-bold text-pitch">Level up!</span>}
        </div>
      )}
      {!!reward?.challenges.length && (
        <div className={`mx-auto mt-4 max-w-[420px] ${CARD} p-3 text-left`}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
              Challenges completed
            </span>
            {AWARDS_ON && (
              <span className="font-mono text-[13px] font-bold text-amber">
                +{reward.challengePrestige} Prestige
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1.5">
            {reward.challenges.map((id) => {
              const c = challengeById(id);
              return c ? (
                <li key={id}>
                  <ChallengeRow challenge={c} />
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        <button
          onClick={onReDraft}
          disabled={banking}
          className={`${PRIMARY_BTN} disabled:opacity-60`}
        >
          {banking ? 'Saving stickers...' : 'Draft a new XI'}
        </button>
        <button
          onClick={onReplay}
          disabled={banking}
          className={`px-4 py-3 ${SECONDARY_BTN} disabled:opacity-60`}
        >
          Replay same XI
        </button>
        <button
          onClick={onCareer}
          className={`px-4 py-3 ${SECONDARY_BTN}`}
        >
          Career
        </button>
      </div>
    </div>
  );
}
