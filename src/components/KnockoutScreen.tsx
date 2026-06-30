import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMatchSteps, HALF_TIME_MS, PEN_MS, STEP_MS, type MatchSpeed } from '../domain/clock';
import { BRACKET_ROUNDS, currentGame, type BracketGame, type BracketState } from '../domain/bracket';
import { USER_ID, type GroupState } from '../domain/tournament';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { ArrowRight, Play } from 'lucide-react';
import GoalList from './GoalList';
import Bracket from './Bracket';
import TournamentSummary from './TournamentSummary';
import { useFollowBottom } from '../hooks/useFollowBottom';
import {
    Banner,
    FixtureHead,
    LiveLine,
    maxMinute,
    PlaybackControls,
    PRIMARY_BTN,
    ResultTag,
    ShootoutFeed,
    StageHeader,
} from './matchUi';

interface Props {
    bracket: BracketState;
    group: GroupState;
    formation: Formation;
    filled: Filled;
    speed: MatchSpeed;
    auto: boolean;
    onSetAuto: (a: boolean) => void;
    onSetSpeed: (s: MatchSpeed) => void;
    /** Reveal/advance the user's current game once it finishes animating. */
    onAdvance: () => void;
    onReset: () => void;
}

/** The knockout page: the 16-team bracket tree, then the user's run played one
 *  round at a time with live goal feeds (revealing the pre-simulated results),
 *  ending in a champion / knocked-out banner and the tournament summary. */
export default function KnockoutScreen({
    bracket,
    group,
    formation,
    filled,
    speed,
    auto,
    onSetAuto,
    onSetSpeed,
    onAdvance,
    onReset,
}: Props) {
    const b = bracket;
    const champion = b.outcome === 'champion';
    const over = b.outcome !== 'alive';
    const maxRound = champion ? BRACKET_ROUNDS.length - 1 : b.played;
    const cur = currentGame(b);

    const [liveMinute, setLiveMinute] = useState(0);
    const [clockLabel, setClockLabel] = useState('');
    const [penShown, setPenShown] = useState(0);
    const [playing, setPlaying] = useState<BracketGame | null>(null);
    const isPlaying = !!playing;

    const { tailRef, rootRef } = useFollowBottom();
    const bannerRef = useRef<HTMLDivElement | null>(null);

    const onAdvanceRef = useRef(onAdvance);
    const speedRef = useRef(speed);
    useEffect(() => {
        onAdvanceRef.current = onAdvance;
        speedRef.current = speed;
    });

    // When the run ends, bring the champion / knocked-out banner into view.
    useEffect(() => {
        if (!over) return;
        const id = requestAnimationFrame(() => {
            const el = bannerRef.current;
            if (!el) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        });
        return () => cancelAnimationFrame(id);
    }, [over]);

    const playCurrent = useCallback(() => {
        if (cur) setPlaying(cur);
    }, [cur]);

    // Match clock: animate the (pre-computed) current game to its end, run the
    // shootout if it went to penalties, then advance the bracket.
    useEffect(() => {
        if (!playing) return;
        const g = playing;
        const max = maxMinute(g.decided);
        const kicks = g.pens?.kicks ?? [];
        const penMs = PEN_MS[speedRef.current];
        const steps = buildMatchSteps(max, HALF_TIME_MS[speedRef.current]);
        const endLabel = g.decided === 'reg' ? 'FT' : g.decided === 'aet' ? 'a.e.t.' : 'pens';
        let idx = 0;
        let timer: number | undefined;

        const advance = () => {
            onAdvanceRef.current();
            setPlaying(null);
        };
        const runShootout = () => {
            let k = 0;
            const penId = window.setInterval(() => {
                k += 1;
                setPenShown(k);
                if (k >= kicks.length) {
                    window.clearInterval(penId);
                    timer = window.setTimeout(advance, 1500);
                }
            }, penMs);
            timer = penId;
        };
        const finishClock = () => {
            setClockLabel(endLabel);
            if (g.decided === 'pens' && kicks.length) timer = window.setTimeout(runShootout, 700);
            else timer = window.setTimeout(advance, 1200);
        };
        const tick = () => {
            const step = steps[idx];
            setLiveMinute(step.reveal);
            setClockLabel(step.label);
            const delay = STEP_MS[speedRef.current] + (step.hold ?? 0);
            if (idx >= steps.length - 1) {
                timer = window.setTimeout(finishClock, delay);
                return;
            }
            idx += 1;
            timer = window.setTimeout(tick, delay);
        };

        setLiveMinute(0);
        setClockLabel('');
        setPenShown(0);
        tick();
        return () => {
            if (timer) {
                window.clearTimeout(timer);
                window.clearInterval(timer);
            }
        };
    }, [playing]);

    // Auto mode: play each round as it becomes current.
    useEffect(() => {
        if (!auto || playing) return;
        const c = currentGame(b);
        if (!c) return;
        const t = window.setTimeout(() => setPlaying(c), 700);
        return () => window.clearTimeout(t);
    }, [auto, playing, b]);

    const showNextButton = !auto && !isPlaying && !!cur;

    const nextGameButton = (
        <>
            <div className="mt-[22px] flex justify-center">
                <button onClick={playCurrent} className={PRIMARY_BTN}>
                    <Play size={13} fill="currentColor" strokeWidth={0} />
                    Next game
                    <ArrowRight size={15} strokeWidth={2.5} />
                </button>
            </div>
            <div ref={tailRef} aria-hidden className="h-0" />
        </>
    );

    return (
        <div ref={rootRef}>
            <StageHeader
                eyebrow="Knockouts"
                title="Win 4 to lift the trophy"
                controls={
                    !over ? (
                        <PlaybackControls
                            auto={auto}
                            speed={speed}
                            onSetAuto={onSetAuto}
                            onSetSpeed={onSetSpeed}
                        />
                    ) : undefined
                }
            />

            <Bracket bracket={b} />

            {/* Your run */}
            <div className="relative mx-auto mt-9 max-w-[780px] border-t-2 border-line">
                <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 bg-ground px-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                    Your run
                </span>
            </div>

            <div className="mx-auto max-w-[780px]">
                {Array.from({ length: maxRound + 1 }, (_, r) => r).map((r) => {
                    const g = b.rounds[r][0];
                    const userIsHome = g.homeId === USER_ID;
                    const userSide = userIsHome ? 'home' : 'away';
                    const opp = b.teams[userIsHome ? g.awayId : g.homeId];
                    const isPlayingRound = playing?.round === r;
                    const revealed =
                        !isPlayingRound &&
                        (r < b.played || champion || (b.outcome === 'out' && r === b.played));
                    const upNext = !isPlayingRound && !revealed; // current, not yet played
                    const isFinal = r === BRACKET_ROUNDS.length - 1;
                    const liveMax = maxMinute(g.decided);

                    let score: { user: number; opp: number } | undefined;
                    let status: string | undefined;
                    let statusDim = false;
                    if (isPlayingRound) {
                        const shown = g.events.filter((e) => e.minute <= liveMinute);
                        const userGoals = shown.filter((e) => e.side === userSide).length;
                        score = { user: userGoals, opp: shown.length - userGoals };
                        status = clockLabel || undefined;
                    } else if (revealed) {
                        score = {
                            user: userIsHome ? g.homeGoals : g.awayGoals,
                            opp: userIsHome ? g.awayGoals : g.homeGoals,
                        };
                        if (g.decided === 'aet') status = 'a.e.t.';
                        else if (g.decided === 'pens') status = 'Penalties';
                        else {
                            status = 'Full time';
                            statusDim = true;
                        }
                    }

                    const won = g.winnerId === USER_ID;
                    let tag: React.ReactNode = null;
                    if (isPlayingRound) tag = <ResultTag kind="next" label="Live now" />;
                    else if (revealed)
                        tag = won ? (
                            <ResultTag
                                kind="w"
                                label={
                                    g.decided === 'pens'
                                        ? 'Won on penalties'
                                        : g.decided === 'aet'
                                          ? 'Won a.e.t.'
                                          : 'Won'
                                }
                            />
                        ) : (
                            <ResultTag
                                kind="l"
                                label={g.decided === 'pens' ? 'Lost on penalties' : 'Lost'}
                            />
                        );
                    else if (upNext && cur) tag = <ResultTag kind="next" label="Up next" />;

                    const showFeed = isPlayingRound || revealed;
                    const feedEvents = isPlayingRound
                        ? g.events.filter((e) => e.minute <= liveMinute)
                        : revealed
                          ? g.events
                          : [];
                    const penKicks = g.pens?.kicks;
                    const penShownCount = isPlayingRound ? penShown : (penKicks?.length ?? 0);
                    const showShootout =
                        !!penKicks && (isPlayingRound ? liveMinute >= liveMax : revealed);
                    const live = isPlayingRound && liveMinute < liveMax;
                    const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;

                    return (
                        <div key={`ko-${r}`} className="mt-[26px]">
                            <div className="mb-[9px] flex items-center gap-2.5">
                                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                    {BRACKET_ROUNDS[r]}
                                </span>
                                {tag}
                            </div>
                            <div
                                className={`overflow-hidden rounded-md border border-line bg-panel shadow-hard ${
                                    isPlayingRound || isFinal ? 'border-t-[3px] border-t-pitch' : ''
                                }`}
                            >
                                <FixtureHead
                                    oppName={opp.name}
                                    oppCode={opp.code}
                                    oppYear={opp.year}
                                    score={score}
                                    status={status}
                                    statusDim={statusDim}
                                />
                                {showFeed && (
                                    <div className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3">
                                        <GoalList
                                            events={feedEvents}
                                            userSide={userSide}
                                            oppCode={opp.code}
                                            live={live}
                                        />
                                        {showShootout && penKicks && (
                                            <ShootoutFeed kicks={penKicks} shown={penShownCount} />
                                        )}
                                        {live && <LiveLine label={liveLabel} />}
                                        {isPlayingRound && <div ref={tailRef} aria-hidden className="h-0" />}
                                    </div>
                                )}
                            </div>
                            {upNext && showNextButton && nextGameButton}
                        </div>
                    );
                })}

                <div ref={bannerRef}>
                    {champion && (
                        <Banner
                            champion
                            eyebrow="Full time · the Final"
                            heading="World Champions."
                            body="Your randomly drafted XI ran the bracket. Four knockout wins, the trophy is yours."
                            onReset={onReset}
                        />
                    )}
                    {b.outcome === 'out' && (
                        <Banner
                            champion={false}
                            eyebrow={`Knocked out · ${BRACKET_ROUNDS[b.played]}`}
                            heading="Knocked out."
                            body={`Beaten in the ${BRACKET_ROUNDS[b.played]}. So close - draft a new XI and run it back.`}
                            onReset={onReset}
                        />
                    )}
                </div>

                {over && (
                    <TournamentSummary
                        formation={formation}
                        filled={filled}
                        group={group}
                        bracket={b}
                    />
                )}

                {/* Tail so the page follows down between auto rounds. */}
                {!isPlaying && !showNextButton && !over && (
                    <div ref={tailRef} aria-hidden className="h-0" />
                )}
            </div>
        </div>
    );
}
