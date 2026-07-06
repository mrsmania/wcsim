import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { STYLE_LABEL, type Formation, type Style } from '../domain/formations';
import { teamRating, type Filled } from '../domain/draft';
import { teamChemistry } from '../domain/chemistry';
import { FEATURES } from '../config';
import type { PlayMode } from '../state/gameReducer';
import { SECONDARY_BTN } from './matchUi';

interface Props {
    formation: Formation;
    filled: Filled;
    style: Style;
    /** The chosen play mode; the single CTA (label + copy) follows it. */
    mode: PlayMode;
    /** Enter the chosen mode. App wires this to start the World Cup or the Cup Run. */
    onStart: () => void;
    onReset: () => void;
}

export default function CompletePanel({
    formation,
    filled,
    style,
    mode,
    onStart,
    onReset,
}: Props) {
    const cup = mode === 'cup';
    const [confirmReset, setConfirmReset] = useState(false);
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
                    {cup
                        ? 'Take this XI into a Cup Run: play the tournament, then pick a boon between rounds to evolve your team and push your title odds.'
                        : "You'll be drawn into a group of four. Play all three matchdays, finish in the top two, and reach the knockouts."}
                </p>
                <div className="flex flex-col gap-2.5">
                    <button
                        onClick={onStart}
                        className="flex w-full items-center justify-center gap-2 rounded-[5px] border border-pitch-dark bg-pitch px-4 py-3 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-pitch-dark active:scale-[0.99]"
                    >
                        {cup ? 'Enter the Cup Run' : 'Start the World Cup'}
                        <ArrowRight size={16} strokeWidth={2.5} />
                    </button>

                    {confirmReset ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted">Discard your XI?</span>
                            <button
                                onClick={onReset}
                                className="rounded-[5px] border border-loss bg-loss px-3 py-2 font-display text-[12px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:opacity-90"
                            >
                                Yes, reset
                            </button>
                            <button
                                onClick={() => setConfirmReset(false)}
                                className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmReset(true)}
                            className={`flex w-full items-center justify-center px-4 py-3 text-[13px] ${SECONDARY_BTN}`}
                        >
                            Start over
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
