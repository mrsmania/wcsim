import { ASCENSIONS, ascensionAt } from '../domain/ascension';
import { CHIP_ON, CHIP_OFF, MONO_CAP } from './matchUi';

interface Props {
    /** The tier in force for the next run (already clamped by `selectedAscension`). */
    tier: number;
    /** The highest tier currently selectable: unlocked by a cup at the tier below AND
     *  past its level gate. Everything above it renders locked, with the reason in the
     *  title, rather than disappearing - the ladder is the point. */
    max: number;
    onSelect: (tier: number) => void;
}

/** The run's difficulty ladder, as a row of six chips plus the sentence saying what the
 *  chosen one does.
 *
 *  **It belongs at the LAST step before kickoff, and this is the second time it has
 *  moved.** It was on a pre-run screen, then that screen went and it moved to the setup
 *  panel beside formation and style (roadmap item 28), on the reasoning that both are
 *  decisions about the run being built. That reasoning was wrong in one way that matters:
 *  formation and style SHAPE the XI, so they have to be chosen first, while the tier is a
 *  judgement about the XI you ended up with - a squad that came out strong wants a harder
 *  ladder and a bigger multiplier, one that came out thin does not. Asking before the
 *  first player is drafted is asking too early. So it now renders where the finished XI is
 *  on screen: `CompletePanel` (the normal door into a run) and the Cup Run pre-run card
 *  (the fallback door into the same group stage).
 *
 *  Nothing here writes a run. Picking only remembers the tier on the career, which is
 *  where `beginRun` reads its default from - and it must remember it WITHOUT spending a
 *  Youth Development grant, which is why `rememberAscension` exists apart from
 *  `startRunCareer` (see its docstring). */
export default function AscensionPicker({ tier, max, onSelect }: Props) {
    const chosen = ascensionAt(tier);
    return (
        <div>
            <p className={`mb-2 ${MONO_CAP}`}>Ascension</p>
            <div className="grid grid-cols-6 gap-[5px]">
                {ASCENSIONS.map((a) => {
                    const active = a.tier === tier;
                    const locked = a.tier > max;
                    return (
                        <button
                            key={a.tier}
                            disabled={locked}
                            onClick={() => onSelect(a.tier)}
                            aria-pressed={active}
                            title={
                                locked
                                    ? `Win a cup at the tier below and reach level ${a.levelReq}`
                                    : a.label
                            }
                            className={[
                                'rounded-[4px] border py-2.5 text-center font-mono text-[11.5px] font-semibold transition',
                                active ? CHIP_ON : locked ? 'border-line bg-panel text-line' : CHIP_OFF,
                            ].join(' ')}
                        >
                            {a.label.replace('Ascension ', '')}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2.5 text-[12px] leading-snug text-muted">
                {tier === 0
                    ? 'Standard difficulty. Rewards at face value.'
                    : `${chosen.userDelta} to your own attack and defence, a stronger knockout field, and rewards x${chosen.rewardMult}.`}
            </p>
        </div>
    );
}
