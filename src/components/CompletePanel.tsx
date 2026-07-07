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
    /** Play a standard World Cup with this XI. */
    onStart: () => void;
    /** Take this XI on a Cup Run (career mode); omitted when off. */
    onCupRun?: () => void;
    onReset: () => void;
}

const CTA = `flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] ${PRIMARY_BTN_BASE}`;

export default function CompletePanel({
    formation,
    filled,
    style,
    onStart,
    onCupRun,
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
                    {onCupRun
                        ? 'Your XI is set. Play a standard World Cup, or take it on a Cup Run (a knockout run where you pick a team boost between rounds).'
                        : "You'll be drawn into a group of four. Play all three matchdays, finish in the top two, and reach the knockouts."}
                </p>
                <div className="flex flex-col gap-2.5">
                    <button onClick={onStart} className={CTA}>
                        Start the World Cup
                        <ArrowRight size={16} strokeWidth={2.5} />
                    </button>

                    {onCupRun && (
                        <button onClick={onCupRun} className={CTA}>
                            Enter the Cup Run
                            <ArrowRight size={16} strokeWidth={2.5} />
                        </button>
                    )}

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
