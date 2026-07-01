import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fixturesForMatchday,
    GROUP_MATCHDAYS,
    isGroupFinished,
    simulateMatchday,
    standings,
    teamById,
    userAdvanced,
    type GroupState,
    type MatchdayResult,
} from '../domain/tournament';
import type { MatchSpeed } from '../domain/clock';
import { ArrowRight, Play } from 'lucide-react';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import GroupDrawReveal from './GroupDrawReveal';
import StandingsTable from './StandingsTable';
import MatchdayCard from './MatchdayCard';
import TournamentSummary from './TournamentSummary';
import { useMatchClock, FT_HOLD_MS } from '../hooks/useMatchClock';
import { useFollowBottom } from '../hooks/useFollowBottom';
import { liveMatchView, resultTag } from './matchView';
import {
    Banner,
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

/** Delay (ms) between an idle beat and auto-playing the next matchday/round. */
const AUTO_PLAY_DELAY_MS = 700;

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

    // Opening group draw, shown as a modal only for a freshly drawn group (no
    // matchday played yet), so navigating Back to the group does not replay it.
    const [revealing, setRevealing] = useState(() => group.matchday === 1);

    // The matchday currently being revealed by the clock (null when idle).
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
            setPlayingGroup({ matchday: md, results: simulateMatchday(group, md) });
        },
        [group],
    );

    // Group matchday clock: run to 90' (with stoppage + a half-time hold), then
    // record results and advance the matchday.
    const { liveMinute, clockLabel } = useMatchClock({
        active: isPlaying,
        speed,
        maxMinute: 90,
        endLabel: 'FT',
        endHoldMs: FT_HOLD_MS,
        onEnd: () => {
            if (playingGroup) onRecordMatchday(playingGroup.results);
            setPlayingGroup(null);
        },
    });

    // Auto mode: play the next matchday whenever idle.
    useEffect(() => {
        if (!auto || revealing || isPlaying || groupFinished) return;
        const t = window.setTimeout(() => play(group.matchday), AUTO_PLAY_DELAY_MS);
        return () => window.clearTimeout(t);
    }, [auto, revealing, isPlaying, groupFinished, group.matchday, play]);

    // The next matchday to play (null once the group is done).
    const nextMatchday = groupFinished ? null : group.matchday;
    const nextAnchorKey =
        nextMatchday !== null && !auto && !isPlaying ? `md-${nextMatchday}` : null;

    const table = standings(group);
    const userPosition = table.findIndex((s) => s.team.isUser) + 1;

    const playNext = () => {
        if (nextMatchday !== null) play(nextMatchday);
    };

    const nextGameButton = (
        <div className="mt-[22px] flex justify-center">
            <button onClick={playNext} className={PRIMARY_BTN}>
                <Play size={13} fill="currentColor" strokeWidth={0} />
                Next game
                <ArrowRight size={15} strokeWidth={2.5} />
            </button>
        </div>
    );

    const controls = !groupFinished ? (
        <PlaybackControls auto={auto} speed={speed} onSetAuto={onSetAuto} onSetSpeed={onSetSpeed} />
    ) : undefined;

    return (
        <div ref={rootRef} className="mx-auto max-w-[780px]">
            {revealing && (
                <GroupDrawReveal
                    userTeam={userTeam}
                    opponents={opponents}
                    onContinue={() => setRevealing(false)}
                />
            )}
            <StageHeader
                eyebrow="Group stage"
                title="Group of 4 · top 2 advance"
                controls={controls}
                headingRef={stageTopRef}
            />

            <StandingsTable group={group} groupFinished={groupFinished} advanced={advanced} />

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

                const view = liveMatchView({
                    playing: isPlayingMd && !!playingResult,
                    userSide,
                    liveMinute,
                    liveMax: 90,
                    clockLabel,
                    playingEvents: playingResult?.events,
                    finished: userFx.result
                        ? {
                              userGoals: userIsHome
                                  ? userFx.result.homeGoals
                                  : userFx.result.awayGoals,
                              oppGoals: userIsHome
                                  ? userFx.result.awayGoals
                                  : userFx.result.homeGoals,
                              status: 'Full time',
                              statusDim: true,
                              events: userFx.result.events,
                          }
                        : undefined,
                });

                // Matchday label tag (from Your XI's perspective).
                let tag: React.ReactNode = null;
                if (isPlayingMd) {
                    tag = <ResultTag kind="next" label="Live now" />;
                } else if (view.score && userFx.result) {
                    const rt = resultTag(view.score);
                    tag = <ResultTag kind={rt.kind} label={rt.label} />;
                } else if (md === group.matchday && !groupFinished) {
                    tag = <ResultTag kind="next" label="Up next" />;
                }

                return (
                    <div key={`md-${md}`}>
                        <MatchdayCard
                            label={`Matchday ${md}`}
                            tag={tag}
                            userRating={userTeam.strength.overall}
                            oppName={opp.name}
                            oppCode={opp.code}
                            oppYear={opp.year}
                            oppRating={opp.strength.overall}
                            view={view}
                            userSide={userSide}
                            playing={isPlayingMd}
                            clockLabel={clockLabel}
                        />
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

            {/* Single auto-scroll tail: the page follows this down as content grows
                (live feeds, new match cards, the next-game button, the qualify CTA). */}
            <div ref={tailRef} aria-hidden className="h-0" />
        </div>
    );
}
