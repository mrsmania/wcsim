import { PRIMARY_BTN, SECONDARY_BTN } from '../matchUi';
import type { Reward } from './types';

/** The ended-state action panel: the final score + run reward readout, and the
 *  draft-new / replay / career actions. */
export default function RunEndPanel({
  score,
  reward,
  onReDraft,
  onReplay,
  onCareer,
}: {
  score: number;
  reward: Reward | null;
  onReDraft: () => void;
  onReplay: () => void;
  onCareer: () => void;
}) {
  return (
    <div className="text-center">
      <div className="font-display text-2xl font-black">Final score {score}</div>
      {reward && (
        <div className="mt-1.5 font-mono text-[12px] text-muted">
          +{reward.xpGained} XP &middot;{' '}
          <span className="text-amber">+{reward.prestigeGained} Prestige</span>
          {reward.ascensionMult > 1 && (
            <span className="ml-2 text-[#9a6512]">Ascension x{reward.ascensionMult}</span>
          )}
          {reward.leveledUp && <span className="ml-2 font-bold text-pitch">Level up!</span>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        <button onClick={onReDraft} className={PRIMARY_BTN}>
          Draft a new XI
        </button>
        <button
          onClick={onReplay}
          className={`px-4 py-3 ${SECONDARY_BTN}`}
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
