import { useCallback, useEffect, useRef, useState } from 'react';
import { SQUADS } from '../data/squads';
import { simulateMatch, type MatchEvent } from '../domain/match';
import {
    GROUP_MATCHDAYS,
    fixturesForMatchday,
    isGroupFinished,
    standings,
    teamById,
    userAdvanced,
    type GroupState,
    type MatchdayResult,
} from '../domain/tournament';
import { buildMatchSteps, HALF_TIME_MS, STEP_MS, type MatchSpeed } from '../domain/clock';
import { ArrowRight, ChevronDown, ChevronRight, Play } from 'lucide-react';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import Flag from './Flag';
import FixtureRow from './FixtureRow';
import GoalList from './GoalList';
import TournamentSummary from './TournamentSummary';
import { useFollowBottom } from '../hooks/useFollowBottom';
import {
    Banner,
    FixtureHead,
    LiveLine,
    ordinal,
    PlaybackControls,
    PRIMARY_BTN,
    ResultTag,
    StageHeader,
} from './matchUi';

interface Props {
    group: GroupState;
    formation: Formation;
    filled: Filled;
    speed: MatchSpeed;
    auto: boolean;
    onSetAuto: (a: boolean) => void;
    onSetSpeed: (s: MatchSpeed) => void;
    onRecordMatchday: (results: MatchdayResult[]) => void;
    /** Build the bracket and move to the knockout screen (qualified only). */
    onEnterKnockout: () => void;
    onReset: () => void;
}

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];

/** The group-stage screen: the opening draw, the standings + all results, and the
 *  three matchdays played one at a time with live goal feeds. Once the user has
 *  played all three games it shows either a "qualified -> enter the knockouts"
 *  call to action or the group-stage elimination banner + summary. */
export default function TournamentScreen({
    group,
    formation,
    filled,
    speed,
    auto,
    onSetAuto,
    onSetSpeed,
    onRecordMatchday,
    onEnterKnockout,
    onReset,
}: Props) {
    const opponents = group.teams.filter((t) => !t.isUser);
    const userTeam = group.teams.find((t) => t.isUser)!;
    const groupFinished = isGroupFinished(group);
    const advanced = groupFinished && userAdvanced(group);
    const eliminated = groupFinished && !advanced;

    // --- opening group draw: flags scramble, then settle on the real opponents ---
    const [revealing, setRevealing] = useState(true);
    const [settled, setSettled] = useState(false);
    const [revealCodes, setRevealCodes] = useState<string[]>(() =>
        opponents.map(() => randomCode()),
    );
    useEffect(() => {
        let elapsed = 0;
        const step = 90;
        const id = window.setInterval(() => {
            elapsed += step;
            if (elapsed >= 1300) {
                window.clearInterval(id);
                setRevealCodes(opponents.map((o) => o.code));
                setSettled(true);
            } else {
                setRevealCodes(opponents.map(() => randomCode()));
            }
        }, step);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Collapsible "all results" overview attached to the group table.
    const [showResults, setShowResults] = useState(false);

    // --- live-clock display + playback (one matchday at a time) ---
    const [liveMinute, setLiveMinute] = useState(0);
    const [clockLabel, setClockLabel] = useState('');
    const [playingGroup, setPlayingGroup] = useState<{
        matchday: number;
        results: MatchdayResult[];
    } | null>(null);
    const isPlaying = !!playingGroup;

    // Auto-scroll: a tail marker the page follows down as content is appended.
    const { tailRef, rootRef } = useFollowBottom();
    // Group header; scrolled near the top when the run ends in group elimination.
    const stageTopRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!eliminated) return;
        const id = requestAnimationFrame(() => {
            const el = stageTopRef.current;
            if (!el) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const top = el.getBoundingClientRect().top + window.scrollY - 16; // shy of the top
            window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
        });
        return () => cancelAnimationFrame(id);
    }, [eliminated]);

    const play = useCallback(
        (md: number) => {
            const results: MatchdayResult[] = fixturesForMatchday(group, md).map((f) => {
                const h = teamById(group, f.homeId);
                const a = teamById(group, f.awayId);
                return {
                    homeId: f.homeId,
                    awayId: f.awayId,
                    result: simulateMatch(
                        { strength: h.strength, scorers: h.scorers },
                        { strength: a.strength, scorers: a.scorers },
                    ),
                };
            });
            setPlayingGroup({ matchday: md, results });
        },
        [group],
    );

    // Keep latest callback/speed without restarting the clock timer each render.
    const recordRef = useRef(onRecordMatchday);
    const speedRef = useRef(speed);
    useEffect(() => {
        recordRef.current = onRecordMatchday;
        speedRef.current = speed;
    });

    // Group matchday clock: run to 90' (with stoppage + a half-time hold), then
    // record results and advance the matchday.
    useEffect(() => {
        if (!playingGroup) return;
        const current = playingGroup;
        const steps = buildMatchSteps(90, HALF_TIME_MS[speedRef.current]);
        let idx = 0;
        let timer: number | undefined;
        const tick = () => {
            const step = steps[idx];
            setLiveMinute(step.reveal);
            setClockLabel(step.label);
            const delay = STEP_MS[speedRef.current] + (step.hold ?? 0);
            if (idx >= steps.length - 1) {
                timer = window.setTimeout(() => {
                    setClockLabel('FT');
                    timer = window.setTimeout(() => {
                        recordRef.current(current.results);
                        setPlayingGroup(null);
                    }, 700);
                }, delay);
                return;
            }
            idx += 1;
            timer = window.setTimeout(tick, delay);
        };
        setLiveMinute(0);
        setClockLabel('');
        tick();
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [playingGroup]);

    // Auto mode: play the next matchday whenever idle.
    useEffect(() => {
        if (!auto || revealing || isPlaying || groupFinished) return;
        const t = window.setTimeout(() => play(group.matchday), 700);
        return () => window.clearTimeout(t);
    }, [auto, revealing, isPlaying, groupFinished, group.matchday, play]);

    // The next matchday to play (null once the group is done).
    const nextMatchday = groupFinished ? null : group.matchday;
    const nextAnchorKey =
        nextMatchday !== null && !auto && !isPlaying ? `md-${nextMatchday}` : null;

    // --- opening group draw view (full takeover, shown once) ---
    if (revealing) {
        return (
            <div className="mx-auto max-w-[780px]">
                <StageHeader eyebrow="Group draw" title="Your group" />
                <div className="rounded-md border border-line bg-panel p-6 shadow-hard">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div
                            title={`Rating ${userTeam.strength.overall}`}
                            className="flex flex-col items-center gap-2 rounded-[5px] border border-pitch/40 bg-pitch/[0.06] px-3 py-5 text-center"
                        >
                            <Flag isUser code="" className="h-6 w-9" />
                            <span className="text-sm font-bold text-ink">Your XI</span>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-loss">
                                You
                            </span>
                        </div>
                        {opponents.map((o, i) => (
                            <div
                                key={o.id}
                                title={settled ? `Rating ${o.strength.overall}` : undefined}
                                className={`flex flex-col items-center gap-2 rounded-[5px] border border-line bg-ground px-3 py-5 text-center ${
                                    settled ? 'animate-settle' : ''
                                }`}
                            >
                                <Flag code={revealCodes[i] ?? ''} className="h-6 w-9" />
                                <span className="text-sm font-semibold leading-tight text-ink">
                                    {settled ? o.name : '…'}
                                </span>
                                {settled && o.year && (
                                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber">
                                        WC {o.year}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-[22px] flex justify-center">
                    {settled ? (
                        <button onClick={() => setRevealing(false)} className={PRIMARY_BTN}>
                            Continue to group stage
                            <ArrowRight size={16} strokeWidth={2.5} />
                        </button>
                    ) : (
                        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                            Drawing opponents…
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const table = standings(group);
    const userPosition = table.findIndex((s) => s.team.isUser) + 1;

    const playNext = () => {
        if (nextMatchday !== null) play(nextMatchday);
    };

    const nextGameButton = (
        <>
            <div className="mt-[22px] flex justify-center">
                <button onClick={playNext} className={PRIMARY_BTN}>
                    <Play size={13} fill="currentColor" strokeWidth={0} />
                    Next game
                    <ArrowRight size={15} strokeWidth={2.5} />
                </button>
            </div>
            {/* Tail so the page follows to the next-game button when it appears. */}
            <div ref={tailRef} aria-hidden className="h-0" />
        </>
    );

    const controls = !groupFinished ? (
        <PlaybackControls auto={auto} speed={speed} onSetAuto={onSetAuto} onSetSpeed={onSetSpeed} />
    ) : undefined;

    const stGrid =
        'grid grid-cols-[28px_minmax(0,1fr)_26px_26px_32px_38px] sm:grid-cols-[34px_minmax(0,1fr)_30px_30px_30px_34px_38px] items-center gap-1 px-4 py-[11px]';
    const stNum = 'text-center font-mono text-[13px] text-muted';

    return (
        <div ref={rootRef} className="mx-auto max-w-[780px]">
            <StageHeader
                eyebrow="Group stage"
                title="Group of 4 · top 2 advance"
                controls={controls}
                headingRef={stageTopRef}
            />

            {/* Standings */}
            <div className="mt-1.5 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
                <div className={`${stGrid} border-b-2 border-ink bg-chalk`}>
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        #
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Team
                    </span>
                    <span className="hidden text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted sm:block">
                        P
                    </span>
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        W
                    </span>
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        D
                    </span>
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        GD
                    </span>
                    <span className="text-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Pts
                    </span>
                </div>
                {table.map((s, i) => {
                    const adv = i < 2;
                    return (
                        <div
                            key={s.team.id}
                            className={`${stGrid} border-b border-line last:border-b-0 ${
                                s.team.isUser ? 'bg-pitch/[0.06]' : ''
                            }`}
                        >
                            <span className="flex justify-center">
                                {adv ? (
                                    <span className="grid h-[22px] w-[22px] place-items-center rounded-[4px] bg-pitch font-mono text-xs font-semibold text-white">
                                        {i + 1}
                                    </span>
                                ) : (
                                    <span className="font-mono text-[13px] font-semibold text-muted">
                                        {i + 1}
                                    </span>
                                )}
                            </span>
                            <span
                                title={`Rating ${s.team.strength.overall}`}
                                className="flex min-w-0 items-center gap-[9px]"
                            >
                                <Flag
                                    code={s.team.code}
                                    isUser={s.team.isUser}
                                    className="h-[15px] w-[22px]"
                                />
                                <span
                                    className={`truncate text-sm ${
                                        s.team.isUser ? 'font-bold' : 'font-semibold'
                                    }`}
                                >
                                    {s.team.name}
                                </span>
                                {s.team.year && (
                                    <span className="shrink-0 font-mono text-[11px] font-medium text-muted">
                                        {s.team.year}
                                    </span>
                                )}
                                {s.team.isUser && (
                                    <span className="shrink-0 rounded-[3px] bg-loss px-[5px] py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.06em] leading-none text-white">
                                        You
                                    </span>
                                )}
                            </span>
                            <span className={`hidden sm:block ${stNum}`}>{s.played}</span>
                            <span className={stNum}>{s.won}</span>
                            <span className={stNum}>{s.drawn}</span>
                            <span className={stNum}>{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
                            <span className="text-center font-mono text-sm font-bold text-ink">
                                {s.points}
                            </span>
                        </div>
                    );
                })}

                {groupFinished && (
                    <div className="border-t border-line bg-chalk px-4 py-[10px] text-center font-mono text-[11px] tracking-[0.04em] text-muted">
                        Finished {ordinal(userPosition)} of {table.length} ·{' '}
                        {advanced ? 'through to the knockouts' : 'eliminated'}
                    </div>
                )}

                {/* All group results (every fixture, including Your XI), collapsible */}
                <button
                    onClick={() => setShowResults((v) => !v)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-chalk px-4 py-[10px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-pitch"
                >
                    All results
                    {showResults ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {showResults && (
                    <div className="border-t border-line px-2 py-2">
                        {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => (
                            <div key={md} className="mb-2 last:mb-0">
                                <div className="mb-0.5 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                                    Matchday {md}
                                </div>
                                {fixturesForMatchday(group, md).map((f) => {
                                    const h = teamById(group, f.homeId);
                                    const a = teamById(group, f.awayId);
                                    return (
                                        <FixtureRow
                                            key={`${f.homeId}-${f.awayId}`}
                                            home={h}
                                            away={a}
                                            homeElo={h.strength.overall}
                                            awayElo={a.strength.overall}
                                            score={
                                                f.result
                                                    ? {
                                                          home: f.result.homeGoals,
                                                          away: f.result.awayGoals,
                                                      }
                                                    : undefined
                                            }
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Group matchdays */}
            {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => {
                const fx = fixturesForMatchday(group, md);
                const userFx = fx.find(
                    (f) => teamById(group, f.homeId).isUser || teamById(group, f.awayId).isUser,
                )!;
                const userIsHome = teamById(group, userFx.homeId).isUser;
                const userSide = userIsHome ? 'home' : 'away';
                const opp = teamById(group, userIsHome ? userFx.awayId : userFx.homeId);
                const isPlayingMd = playingGroup?.matchday === md;

                const playingResult = isPlayingMd
                    ? (playingGroup!.results.find(
                          (r) => r.homeId === userFx.homeId && r.awayId === userFx.awayId,
                      )?.result ?? null)
                    : null;

                let score: { user: number; opp: number } | undefined;
                let status: string | undefined;
                let statusDim = false;
                let feedEvents: MatchEvent[] | null = null;
                if (isPlayingMd && playingResult) {
                    const shown = playingResult.events.filter((e) => e.minute <= liveMinute);
                    const userGoals = shown.filter((e) => e.side === userSide).length;
                    score = { user: userGoals, opp: shown.length - userGoals };
                    status = clockLabel || undefined;
                    feedEvents = shown;
                } else if (userFx.result) {
                    const userGoals = userIsHome
                        ? userFx.result.homeGoals
                        : userFx.result.awayGoals;
                    const oppGoals = userIsHome
                        ? userFx.result.awayGoals
                        : userFx.result.homeGoals;
                    score = { user: userGoals, opp: oppGoals };
                    status = 'Full time';
                    statusDim = true;
                    feedEvents = userFx.result.events;
                }

                // Matchday label tag (from Your XI's perspective).
                let tag: React.ReactNode = null;
                if (isPlayingMd) {
                    tag = <ResultTag kind="next" label="Live now" />;
                } else if (score && userFx.result) {
                    tag =
                        score.user > score.opp ? (
                            <ResultTag kind="w" label="Won" />
                        ) : score.user < score.opp ? (
                            <ResultTag kind="l" label="Lost" />
                        ) : (
                            <ResultTag kind="d" label="Draw" />
                        );
                } else if (md === group.matchday && !groupFinished) {
                    tag = <ResultTag kind="next" label="Up next" />;
                }

                const live = isPlayingMd && liveMinute < 90;
                const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;

                return (
                    <div key={`md-${md}`} className="mt-[26px]">
                        <div className="mb-[9px] flex items-center gap-2.5">
                            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                Matchday {md}
                            </span>
                            {tag}
                        </div>
                        <div
                            className={`overflow-hidden rounded-md border border-line bg-panel shadow-hard ${
                                isPlayingMd ? 'border-t-[3px] border-t-pitch' : ''
                            }`}
                        >
                            <FixtureHead
                                oppName={opp.name}
                                oppCode={opp.code}
                                oppYear={opp.year}
                                score={score}
                                status={status}
                                statusDim={statusDim}
                                userElo={userTeam.strength.overall}
                                oppElo={opp.strength.overall}
                            />
                            {feedEvents && (
                                <div className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3">
                                    <GoalList
                                        events={feedEvents}
                                        userSide={userSide}
                                        oppCode={opp.code}
                                        live={live}
                                    />
                                    {live && <LiveLine label={liveLabel} />}
                                    {isPlayingMd && <div ref={tailRef} aria-hidden className="h-0" />}
                                </div>
                            )}
                        </div>
                        {`md-${md}` === nextAnchorKey && nextGameButton}
                    </div>
                );
            })}

            {/* Qualified: call to action to enter the knockout bracket. */}
            {advanced && (
                <div className="mt-[30px] rounded-md border border-line bg-panel p-7 text-center shadow-hard">
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                        Through to the knockouts
                    </div>
                    <h3 className="mt-1.5 font-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">
                        You qualified.
                    </h3>
                    <p className="mx-auto mb-5 mt-2.5 max-w-[420px] text-sm text-muted">
                        Finished {ordinal(userPosition)} in the group. Sixteen teams enter the
                        bracket - win four to lift the cup.
                    </p>
                    <button onClick={onEnterKnockout} className={PRIMARY_BTN}>
                        Enter the knockouts
                        <ArrowRight size={16} strokeWidth={2.5} />
                    </button>
                </div>
            )}

            {/* Eliminated in the group: banner + end-of-run summary. */}
            {eliminated && (
                <>
                    <Banner
                        champion={false}
                        eyebrow={`Group stage · finished ${ordinal(userPosition)}`}
                        heading="Eliminated."
                        body="Knocked out in the group stage. So close - draft a new XI and run it back."
                        onReset={onReset}
                    />
                    <TournamentSummary formation={formation} filled={filled} group={group} />
                </>
            )}

            {/* Tail the page follows toward the qualify CTA / between auto matches. */}
            {!isPlaying && !nextAnchorKey && advanced && (
                <div ref={tailRef} aria-hidden className="h-0" />
            )}
        </div>
    );
}
