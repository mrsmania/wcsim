import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchSpeed } from '../domain/clock';
import {
    BRACKET_ROUNDS,
    bracketChampionId,
    currentGame,
    opponentOf,
    playRound,
    userGameInRound,
    type BracketGame,
    type BracketState,
} from '../domain/bracket';
import { USER_ID, type GroupState } from '../domain/tournament';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { ArrowRight, Play } from 'lucide-react';
import Bracket from './Bracket';
import Confetti from './Confetti';
import MatchdayCard from './MatchdayCard';
import TournamentSummary from './TournamentSummary';
import { useMatchClock, KO_END_HOLD_MS } from '../hooks/useMatchClock';
import { useFollowBottom } from '../hooks/useFollowBottom';
import { liveMatchView } from './matchView';
import {
    Banner,
    maxMinute,
    PlaybackControls,
    PRIMARY_BTN,
    ResultTag,
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

/** Delay (ms) between an idle beat and auto-playing the next round. */
const AUTO_PLAY_DELAY_MS = 700;

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

    // The round currently being revealed: its round index + the freshly simulated
    // games (games[0] is the user's, driving the clock).
    const [playing, setPlaying] = useState<{ round: number; games: BracketGame[] } | null>(null);
    const isPlaying = !!playing;

    // Follow the live feed down while a round plays; once the run ends we take over
    // the scroll ourselves (below), so the follow must stop rather than trail the
    // tail all the way down to the tournament summary.
    const { tailRef, rootRef } = useFollowBottom({ active: !over });
    const bannerRef = useRef<HTMLDivElement | null>(null);
    const lastMatchRef = useRef<HTMLDivElement | null>(null);

    // When the run ends, put the last played match at the top of the viewport with
    // the champion / knocked-out banner beneath it (not scrolled to the very bottom).
    useEffect(() => {
        if (!over) return;
        const id = requestAnimationFrame(() => {
            const el = lastMatchRef.current ?? bannerRef.current;
            if (!el) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        });
        return () => cancelAnimationFrame(id);
    }, [over]);

    const startPlay = useCallback(() => {
        if (b.outcome !== 'alive') return;
        setPlaying({ round: b.current, games: playRound(b) });
    }, [b]);

    // Match clock: animate the user's game to its end, run the shootout if it went
    // to penalties, then record the whole round's results.
    const playRes = playing ? playing.games[0].result : undefined;
    const { liveMinute, clockLabel, penShown } = useMatchClock({
        active: isPlaying,
        speed,
        maxMinute: playRes ? maxMinute(playRes.decided) : 90,
        endLabel: playRes
            ? playRes.decided === 'reg'
                ? 'FT'
                : playRes.decided === 'aet'
                  ? 'a.e.t.'
                  : 'pens'
            : 'FT',
        penKicks: playRes?.decided === 'pens' ? playRes.pens?.kicks : undefined,
        endHoldMs: KO_END_HOLD_MS,
        onEnd: () => {
            if (playing) onRecordRound(playing.games);
            setPlaying(null);
        },
    });

    // Auto mode: play each round as it becomes current.
    useEffect(() => {
        if (!auto || playing) return;
        if (!currentGame(b)) return;
        const t = window.setTimeout(
            () => setPlaying({ round: b.current, games: playRound(b) }),
            AUTO_PLAY_DELAY_MS,
        );
        return () => window.clearTimeout(t);
    }, [auto, playing, b]);

    const showNextButton = !auto && !isPlaying && !!cur;

    const nextGameButton = (
        <div className="mt-[22px] flex justify-center">
            <button onClick={startPlay} className={PRIMARY_BTN}>
                <Play size={13} fill="currentColor" strokeWidth={0} />
                Next game
                <ArrowRight size={15} strokeWidth={2.5} />
            </button>
        </div>
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
                    const g = userGameInRound(b, r);
                    if (!g) return null;
                    const opp = opponentOf(b, g);
                    if (!opp) return null;
                    const isPlayingRound = playing?.round === r;
                    const roundRes = isPlayingRound ? playing!.games[0].result! : undefined;
                    const decided = roundRes?.decided ?? g.result?.decided;
                    const isFinal = r === BRACKET_ROUNDS.length - 1;
                    const liveMax = decided ? maxMinute(decided) : 90;

                    let finishedStatus = 'Full time';
                    let finishedDim = true;
                    if (g.result?.decided === 'aet') {
                        finishedStatus = 'a.e.t.';
                        finishedDim = false;
                    } else if (g.result?.decided === 'pens') {
                        finishedStatus = 'Penalties';
                        finishedDim = false;
                    }

                    const view = liveMatchView({
                        playing: isPlayingRound && !!roundRes,
                        userSide: 'home',
                        liveMinute,
                        liveMax,
                        clockLabel,
                        playingEvents: roundRes?.events,
                        finished: g.result
                            ? {
                                  userGoals: g.result.homeGoals,
                                  oppGoals: g.result.awayGoals,
                                  status: finishedStatus,
                                  statusDim: finishedDim,
                                  events: g.result.events,
                              }
                            : undefined,
                    });

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

                    const penKicks = isPlayingRound ? roundRes?.pens?.kicks : g.result?.pens?.kicks;
                    const penShownCount = isPlayingRound ? penShown : (penKicks?.length ?? 0);
                    const showShootout =
                        !!penKicks && (isPlayingRound ? liveMinute >= liveMax : true);
                    const upNext = !isPlayingRound && !g.result;

                    const isLastRun = r === lastRunRound;
                    return (
                        <div
                            key={`ko-${r}`}
                            ref={isLastRun ? lastMatchRef : undefined}
                            className={isLastRun ? 'scroll-mt-4' : undefined}
                        >
                            <MatchdayCard
                                label={BRACKET_ROUNDS[r]}
                                tag={tag}
                                userRating={b.teams[USER_ID].strength.overall}
                                oppName={opp.name}
                                oppCode={opp.code}
                                oppYear={opp.year}
                                oppRating={opp.strength.overall}
                                view={view}
                                userSide="home"
                                playing={isPlayingRound}
                                highlight={isFinal}
                                clockLabel={clockLabel}
                                penKicks={penKicks}
                                penShown={penShownCount}
                                showShootout={showShootout}
                            />
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

                {/* Single auto-scroll tail: the page follows this down as content grows
                    (live feeds, new round cards, the next-game button, the banners). */}
                <div ref={tailRef} aria-hidden className="h-0" />
            </div>
        </div>
    );
}
