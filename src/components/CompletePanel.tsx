import { ArrowRight } from 'lucide-react';
import { STYLE_LABEL, type Formation, type Style } from '../domain/formations';
import { teamRating, type Filled } from '../domain/draft';
import { teamChemistry } from '../domain/chemistry';
import { FEATURES } from '../config';
import { PRIMARY_BTN_BASE, SECONDARY_BTN } from './matchUi';
import ConfirmAction from './ConfirmAction';

interface Props {
    formation: Formation;
    filled: Filled;
    style: Style;
    /** Which path this build is on (chosen up front on the launcher). Decides the
     *  single "Start Run" destination and the surrounding copy. */
    mode: 'quick' | 'career';
    /** Start the run: a standard World Cup (quick) or the Cup Run screen (career). */
    onStartRun: () => void;
    onReset: () => void;
}

const CTA = `flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] ${PRIMARY_BTN_BASE}`;

export default function CompletePanel({
    formation,
    filled,
    style,
    mode,
    onStartRun,
    onReset,
}: Props) {
    const base = teamRating(formation, filled);
    const chem = FEATURES.chemistry ? teamChemistry(formation, filled) : null;
    const total = formation.slots.length;

    return (
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            <div className="border-b border-line p-[18px]">
                <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-pitch">
                    Complete
                </div>
                <div className="mt-1.5 font-display text-[26px] font-black leading-[1.05] tracking-[-0.02em]">
                    {total} of {total}
                    <br />
                    drafted
                </div>
                <div className="mt-2.5 font-mono text-[12.5px] leading-[1.6] text-muted">
                    Formation <b className="text-ink">{formation.name}</b>
                    <br />
                    Style <b className="text-ink">{STYLE_LABEL[style]}</b>
                    <br />
                    Avg rating <b className="text-ink">{base}</b>
                    {chem && chem.bonus > 0 && (
                        <>
                            <br />
                            Chemistry{' '}
                            <span className="font-bold text-amber">
                                +{chem.bonus} &rarr; {base + chem.bonus}
                            </span>
                        </>
                    )}
                </div>
            </div>

            <div className="p-[18px]">
                <p className="mb-4 text-[13px] text-muted">
                    {mode === 'career'
                        ? 'Your XI is set. Take it on a Cup Run: pick a team boost between rounds and climb the Ascension tiers, earning XP and Prestige for your career.'
                        : "Your XI is set. You'll be drawn into a group of four - finish in the top two, reach the knockouts, and win the cup."}
                </p>
                <div className="flex flex-col gap-2.5">
                    <button onClick={onStartRun} className={CTA}>
                        Start Run
                        <ArrowRight size={16} strokeWidth={2.5} />
                    </button>

                    <ConfirmAction
                        prompt="Discard your XI?"
                        confirmLabel="Yes, reset"
                        onConfirm={onReset}
                        triggerLabel="Start over"
                        triggerClassName={`flex w-full items-center justify-center px-4 py-3 text-[13px] ${SECONDARY_BTN}`}
                        rowClassName="flex items-center gap-2"
                    />
                </div>
            </div>
        </div>
    );
}
