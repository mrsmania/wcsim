import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMatchSteps, HALF_TIME_MS, PEN_MS, STEP_MS, type MatchSpeed } from '../domain/clock';
import type { MatchEvent } from '../domain/match';
import {
    BRACKET_ROUNDS,
    bracketChampionId,
    currentGame,
    playRound,
    type BracketGame,
    type BracketState,
} from '../domain/bracket';
import { USER_ID, type GroupState } from '../domain/tournament';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { ArrowRight, Play } from 'lucide-react';
import GoalList from './GoalList';
import Bracket from './Bracket';
import Confetti from './Confetti';
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
    /** Store the played round's results (all its games) once the user's match ends. */
    onRecordRound: (games: BracketGame[]) => void;
    onReset: () => void;
}

/** The knockout page: the 16-team bracket tree, then the user's run played one
 *  round at a time with live goal feeds. Each round is only simulated when the
 *  user plays it (like the group stage), so later rounds stay "?" until reached. */
export default function KnockoutScreen({
    bracket,
    group,
    formation,
    filled,
    speed,
    auto,
    onSetAuto,
    onSetSpeed,
    onRecordRound,
    onReset,
}: Props) {
    const b = bracket;
    const champion = b.outcome === 'champion';
    const over = b.outcome !== 'alive';
    const lastRunRound = champion ? BRACKET_ROUNDS.length - 1 : b.current;
    const cur = currentGame(b);

    const [liveMinute, setLiveMinute] = useState(0);
    const [clockLabel, setClockLabel] = useState('');
    const [penShown, setPenShown] = useState(0);
    // The round currently being revealed: its round index + the freshly simulated
    // games (games[0] is the user's, driving the clock).
    const [playing, setPlaying] = useState<{ round: number; games: BracketGame[] } | null>(null);
    const isPlaying = !!playing;

    const { tailRef, rootRef } = useFollowBottom();
    const bannerRef = useRef<HTMLDivElement | null>(null);

    const onRecordRef = useRef(onRecordRound);
    const speedRef = useRef(speed);
    useEffect(() => {
        onRecordRef.current = onRecordRound;
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

    const startPlay = useCallback(() => {
        if (b.outcome !== 'alive') return;
        setPlaying({ round: b.current, games: playRound(b) });
    }, [b]);

    // Match clock: animate the user's game to its end, run the shootout if it went
    // to penalties, then record the whole round's results.
    useEffect(() => {
        if (!playing) return;
        const games = playing.games;
        const res = games[0].result!;
        const max = maxMinute(res.decided);
        const kicks = res.pens?.kicks ?? [];
        const penMs = PEN_MS[speedRef.current];
        const steps = buildMatchSteps(max, HALF_TIME_MS[speedRef.current]);
        const endLabel = res.decided === 'reg' ? 'FT' : res.decided === 'aet' ? 'a.e.t.' : 'pens';
        let idx = 0;
        let timer: number | undefined;

        const advance = () => {
            onRecordRef.current(games);
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
            if (res.decided === 'pens' && kicks.length) timer = window.setTimeout(runShootout, 700);
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
        if (!currentGame(b)) return;
        const t = window.setTimeout(() => setPlaying({ round: b.current, games: playRound(b) }), 700);
        return () => window.clearTimeout(t);
    }, [auto, playing, b]);

    const showNextButton = !auto && !isPlaying && !!cur;

    const nextGameButton = (
        <>
            <div className="mt-[22px] flex justify-center">
                <button onClick={startPlay} className={PRIMARY_BTN}>
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
            {champion && <Confetti />}
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
                {Array.from({ length: lastRunRound + 1 }, (_, r) => r).map((r) => {
                    const g = b.rounds[r]?.[0];
                    if (!g) return null;
                    const opp = b.teams[g.homeId === USER_ID ? g.awayId : g.homeId];
                    const isPlayingRound = playing?.round === r;
                    const playRes = isPlayingRound ? playing!.games[0].result! : undefined;
                    const decided = playRes?.decided ?? g.result?.decided;
                    const isFinal = r === BRACKET_ROUNDS.length - 1;
                    const liveMax = decided ? maxMinute(decided) : 90;

                    let score: { user: number; opp: number } | undefined;
                    let status: string | undefined;
                    let statusDim = false;
                    let feedEvents: MatchEvent[] = [];
                    if (isPlayingRound && playRes) {
                        const shown = playRes.events.filter((e) => e.minute <= liveMinute);
                        const userGoals = shown.filter((e) => e.side === 'home').length;
                        score = { user: userGoals, opp: shown.length - userGoals };
                        status = clockLabel || undefined;
                        feedEvents = shown;
                    } else if (g.result) {
                        score = { user: g.result.homeGoals, opp: g.result.awayGoals };
                        if (g.result.decided === 'aet') status = 'a.e.t.';
                        else if (g.result.decided === 'pens') status = 'Penalties';
                        else {
                            status = 'Full time';
                            statusDim = true;
                        }
                        feedEvents = g.result.events;
                    }

                    const won = g.result?.winnerId === USER_ID;
                    let tag: React.ReactNode = null;
                    if (isPlayingRound) tag = <ResultTag kind="next" label="Live now" />;
                    else if (g.result)
                        tag = won ? (
                            <ResultTag
                                kind="w"
                                label={
                                    g.result.decided === 'pens'
                                        ? 'Won on penalties'
                                        : g.result.decided === 'aet'
                                          ? 'Won a.e.t.'
                                          : 'Won'
                                }
                            />
                        ) : (
                            <ResultTag
                                kind="l"
                                label={g.result.decided === 'pens' ? 'Lost on penalties' : 'Lost'}
                            />
                        );
                    else tag = <ResultTag kind="next" label="Up next" />;

                    const showFeed = isPlayingRound || !!g.result;
                    const penKicks = isPlayingRound ? playRes?.pens?.kicks : g.result?.pens?.kicks;
                    const penShownCount = isPlayingRound ? penShown : (penKicks?.length ?? 0);
                    const showShootout =
                        !!penKicks && (isPlayingRound ? liveMinute >= liveMax : true);
                    const live = isPlayingRound && liveMinute < liveMax;
                    const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;
                    const upNext = !isPlayingRound && !g.result;

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
                                    userElo={b.teams[USER_ID].strength.overall}
                                    oppElo={opp.strength.overall}
                                />
                                {showFeed && (
                                    <div className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3">
                                        <GoalList
                                            events={feedEvents}
                                            userSide="home"
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
                    {b.outcome === 'out' &&
                        (() => {
                            const champ = b.teams[bracketChampionId(b) ?? ''];
                            return (
                                <Banner
                                    champion={false}
                                    eyebrow={`Knocked out · ${BRACKET_ROUNDS[b.current]}`}
                                    heading="Knocked out."
                                    body={`Beaten in the ${BRACKET_ROUNDS[b.current]}.${
                                        champ ? ` ${champ.name} went on to lift the cup.` : ''
                                    } Draft a new XI and run it back.`}
                                    onReset={onReset}
                                />
                            );
                        })()}
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
