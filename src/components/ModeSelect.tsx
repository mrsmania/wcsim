import type { ReactNode } from 'react';
import { ArrowRight, Check, Trophy, Zap } from 'lucide-react';

/** The landing launcher (route `/`): pick a path before building. Quick Run and
 *  Career Mode both lead to the same 3-column build page (roll a squad or buy within
 *  a budget); the choice only decides what "Start Run" does at the end and whether
 *  the run feeds a persistent career. Shown only when `FEATURES.careerMode` is on
 *  (with it off, `/` is the build page directly, exactly like the plain game). */
interface Props {
    onQuick: () => void;
    onCareer: () => void;
    /** A World Cup in progress -> its route (resume), else null. */
    worldCupRoute: string | null;
    onResumeWorldCup: () => void;
    /** A Cup Run in progress -> offer to resume it. */
    cupRunInProgress: boolean;
    onResumeCupRun: () => void;
    /** Career headline stats for the Career card (omitted -> chips hidden). */
    careerLevel?: number;
    careerPrestige?: number;
}

function Feat({ children, dim }: { children: ReactNode; dim?: boolean }) {
    return (
        <li className="flex gap-2 text-[13px]">
            <Check size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-pitch" />
            <span className={dim ? 'text-muted' : undefined}>{children}</span>
        </li>
    );
}

const RESUME_BTN =
    'inline-flex items-center gap-1.5 rounded-[5px] border border-pitch bg-panel px-3 py-1.5 font-display text-[12px] font-extrabold uppercase tracking-[0.04em] text-pitch transition hover:bg-pitch hover:text-white';

export default function ModeSelect({
    onQuick,
    onCareer,
    worldCupRoute,
    onResumeWorldCup,
    cupRunInProgress,
    onResumeCupRun,
    careerLevel,
    careerPrestige,
}: Props) {
    const canResume = !!worldCupRoute || cupRunInProgress;

    return (
        <>
            <div className="mb-5 mt-7 flex items-center gap-4">
                <div>
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                        Start here
                    </div>
                    <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                        Choose how you play
                    </h2>
                </div>
                <div className="relative h-0 flex-1 border-t-2 border-line">
                    <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                </div>
            </div>

            {canResume && (
                <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-md border border-line bg-chalk px-4 py-3">
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
                        In progress
                    </span>
                    {worldCupRoute && (
                        <button type="button" onClick={onResumeWorldCup} className={RESUME_BTN}>
                            Resume the World Cup
                            <ArrowRight size={14} strokeWidth={2.5} />
                        </button>
                    )}
                    {cupRunInProgress && (
                        <button type="button" onClick={onResumeCupRun} className={RESUME_BTN}>
                            Resume the Cup Run
                            <ArrowRight size={14} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
                {/* Quick Run */}
                <button
                    type="button"
                    onClick={onQuick}
                    className="group flex flex-col rounded-md border border-line bg-panel p-6 text-left shadow-hard transition hover:-translate-x-0.5 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2"
                >
                    <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-lg bg-chalk text-pitch-dark">
                        <Zap size={24} strokeWidth={2} />
                    </span>
                    <h3 className="font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
                        Quick Run
                    </h3>
                    <p className="mt-2 text-[13.5px] text-muted">
                        Just build a team and go. Play the group stage and knockouts, chase the
                        trophy - nothing to save, nothing to grind.
                    </p>
                    <ul className="mt-4 flex flex-col gap-2">
                        <Feat>
                            Build by <b>rolling squads</b> or <b>buying within a budget</b>
                        </Feat>
                        <Feat>Full group stage and knockout bracket</Feat>
                        <Feat dim>No career, no unlocks - a clean slate every time</Feat>
                    </ul>
                    <span className="mt-auto flex items-center justify-between pt-6">
                        <span className="rounded bg-chalk px-2 py-1 font-mono text-[11px] text-muted">
                            /quick-run
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-pitch transition group-hover:text-pitch-dark">
                            Play a Quick Run
                            <ArrowRight size={16} strokeWidth={2.5} />
                        </span>
                    </span>
                </button>

                {/* Career Mode */}
                <button
                    type="button"
                    onClick={onCareer}
                    style={{ boxShadow: '6px 6px 0 var(--color-amber)' }}
                    className="group flex flex-col rounded-md border border-amber/40 bg-panel p-6 text-left transition hover:-translate-x-0.5 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                >
                    <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-lg bg-pitch-dark text-amber">
                        <Trophy size={24} strokeWidth={2} />
                    </span>
                    <h3 className="font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
                        Career Mode
                    </h3>
                    {careerLevel != null && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            <span className="rounded-full bg-chalk px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                                Level {careerLevel}
                            </span>
                            <span className="rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#9a6512]">
                                {careerPrestige} Prestige
                            </span>
                        </div>
                    )}
                    <p className="mt-2 text-[13.5px] text-muted">
                        Your manager career. Take runs, pick boosts between rounds, and spend what
                        you earn on perks, more boosts, and harder Ascension tiers.
                    </p>
                    <ul className="mt-4 flex flex-col gap-2">
                        <Feat>
                            Same build: <b>roll</b> or <b>buy within a (growing) budget</b>
                        </Feat>
                        <Feat>Boosts between rounds, Ascension tiers for bigger rewards</Feat>
                        <Feat>
                            XP, Prestige and unlocks that <b>carry over</b> between runs
                        </Feat>
                    </ul>
                    <span className="mt-auto flex items-center justify-between pt-6">
                        <span className="rounded bg-chalk px-2 py-1 font-mono text-[11px] text-muted">
                            /career-mode
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-[#9a6512]">
                            Enter Career Mode
                            <ArrowRight size={16} strokeWidth={2.5} />
                        </span>
                    </span>
                </button>
            </div>
        </>
    );
}
