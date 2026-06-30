import { useCallback, useEffect, useRef, useState } from 'react';
import { SQUADS } from '../data/squads';
import { simulateMatch, type MatchEvent, type MatchResult, type PenKick } from '../domain/match';
import {
    GROUP_MATCHDAYS,
    fixturesForMatchday,
    isGroupFinished,
    standings,
    teamById,
    userAdvanced,
    type GroupState,
    type GroupTeam,
    type MatchdayResult,
} from '../domain/tournament';
import {
    KO_ROUNDS,
    drawOpponent,
    playKnockout,
    type KnockoutState,
    type KoDecided,
    type KoResult,
} from '../domain/knockout';
import { buildMatchSteps, HALF_TIME_MS, PEN_MS, STEP_MS, type MatchSpeed } from '../domain/clock';
import { ArrowRight, Check, ChevronDown, ChevronRight, Play, X } from 'lucide-react';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import Flag from './Flag';
import FixtureRow from './FixtureRow';
import GoalList from './GoalList';
import TournamentSummary from './TournamentSummary';
import { useFollowBottom } from '../hooks/useFollowBottom';

interface Props {
    group: GroupState;
    /** Set once the user advances out of the group; null during the group stage. */
    knockout: KnockoutState | null;
    formation: Formation;
    filled: Filled;
    speed: MatchSpeed;
    auto: boolean;
    onSetAuto: (a: boolean) => void;
    onSetSpeed: (s: MatchSpeed) => void;
    onRecordMatchday: (results: MatchdayResult[]) => void;
    onAdvanceKo: (p: {
        result: MatchResult;
        decided: KoDecided;
        pens?: { user: number; opp: number; kicks: PenKick[] };
        userWon: boolean;
        nextOpponent: GroupTeam | null;
    }) => void;
    onReset: () => void;
}

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];
const maxMinute = (decided: KoDecided) => (decided === 'reg' ? 90 : 120);
const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** Shared rectangular primary action button (the turf-flat `.btn.primary`). */
const PRIMARY_BTN =
    'inline-flex items-center justify-center gap-2 rounded-[5px] border border-pitch-dark bg-pitch px-5 py-3 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-pitch-dark active:scale-[0.99]';

/** A scored/missed pip (green check / red cross) for one penalty. */
function PenPip({ scored }: { scored: boolean }) {
    return (
        <span
            className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full ${
                scored ? 'bg-pitch' : 'bg-loss'
            }`}
        >
            {scored ? (
                <Check size={10} strokeWidth={3.5} className="text-white" />
            ) : (
                <X size={10} strokeWidth={3.5} className="text-white" />
            )}
        </span>
    );
}

/** Penalty shootout sheet (the turf-flat `.shoot`): every taker listed one by one,
 *  Your XI on the left versus the opponent on the right. Kicks alternate home/away
 *  per round, so pairing them by index gives a head-to-head row per round. */
function ShootoutFeed({ kicks, shown }: { kicks: PenKick[]; shown: number }) {
    const revealed = kicks.slice(0, shown);
    const homeKicks = revealed.filter((k) => k.side === 'home');
    const awayKicks = revealed.filter((k) => k.side === 'away');
    const homeScore = homeKicks.filter((k) => k.scored).length;
    const awayScore = awayKicks.filter((k) => k.scored).length;
    const rounds = Math.max(homeKicks.length, awayKicks.length);

    return (
        <div className="mt-3 border-t border-line pt-3.5">
            <div className="mb-3 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Penalty shootout &middot;{' '}
                <b className="text-ink">
                    {homeScore}–{awayScore}
                </b>
            </div>
            <ul className="flex flex-col gap-2">
                {Array.from({ length: rounds }, (_, i) => {
                    const h = homeKicks[i];
                    const a = awayKicks[i];
                    return (
                        <li
                            key={i}
                            className="grid grid-cols-[1fr_22px_1fr] items-center gap-2.5 text-[13px]"
                        >
                            <span className="flex min-w-0 items-center justify-end gap-2 font-semibold">
                                {h ? (
                                    <>
                                        <span className="truncate text-ink">{h.taker}</span>
                                        <PenPip scored={h.scored} />
                                    </>
                                ) : null}
                            </span>
                            <span className="text-center font-mono text-[10px] text-muted">
                                {i + 1}
                            </span>
                            <span className="flex min-w-0 items-center justify-start gap-2 font-semibold">
                                {a ? (
                                    <>
                                        <PenPip scored={a.scored} />
                                        <span className="truncate text-ink">{a.taker}</span>
                                    </>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** A labelled segmented control (the turf-flat `.ctl`): a mono caption followed by
 *  inline option buttons, the active one filled ink. Stacks full-width on mobile. */
function SegControl<T extends string>({
    label,
    value,
    options,
    onSelect,
    ariaLabel,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onSelect: (v: T) => void;
    ariaLabel: string;
}) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className="flex items-center overflow-hidden rounded-[5px] border border-line bg-panel max-sm:w-full"
        >
            <span className="shrink-0 pl-[11px] pr-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                {label}
            </span>
            <div className="flex max-sm:flex-1">
                {options.map((o) => (
                    <button
                        key={o.value}
                        onClick={() => onSelect(o.value)}
                        aria-pressed={o.value === value}
                        className={`whitespace-nowrap border-l border-line px-[11px] py-[9px] text-xs font-semibold transition max-sm:flex-1 ${
                            o.value === value
                                ? 'bg-ink text-ground'
                                : 'bg-panel text-muted hover:text-ink'
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** The two playback selectors (mode + speed), shown in the active stage header. */
function PlaybackControls({
    auto,
    speed,
    onSetAuto,
    onSetSpeed,
}: {
    auto: boolean;
    speed: MatchSpeed;
    onSetAuto: (a: boolean) => void;
    onSetSpeed: (s: MatchSpeed) => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
            <SegControl
                ariaLabel="Playback mode"
                label="Mode"
                value={auto ? 'auto' : 'manual'}
                onSelect={(v) => onSetAuto(v === 'auto')}
                options={[
                    { value: 'manual', label: 'Game by game' },
                    { value: 'auto', label: 'Automatic' },
                ]}
            />
            <SegControl
                ariaLabel="Match speed"
                label="Speed"
                value={speed}
                onSelect={onSetSpeed}
                options={[
                    { value: 'slow', label: 'Slow' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'fast', label: 'Fast' },
                ]}
            />
        </div>
    );
}

/** A stage header (eyebrow + display heading), optionally carrying the controls. */
function StageHeader({
    eyebrow,
    title,
    controls,
    headingRef,
}: {
    eyebrow: string;
    title: string;
    controls?: React.ReactNode;
    headingRef?: React.Ref<HTMLDivElement>;
}) {
    return (
        <div
            ref={headingRef}
            className="mb-[18px] mt-[30px] flex flex-wrap items-end justify-between gap-4"
        >
            <div>
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                    {eyebrow}
                </div>
                <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
                    {title}
                </h2>
            </div>
            {controls}
        </div>
    );
}

/** Win / loss / draw or "live"/"up next" tag shown beside a matchday/round label. */
function ResultTag({ kind, label }: { kind: 'w' | 'l' | 'd' | 'next'; label: string }) {
    if (kind === 'next') {
        return (
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-amber">
                {label}
            </span>
        );
    }
    const tone =
        kind === 'w'
            ? 'bg-pitch/[0.13] text-pitch'
            : kind === 'l'
              ? 'bg-loss/[0.13] text-loss'
              : 'bg-chalk text-muted';
    return (
        <span
            className={`rounded-[3px] px-2 py-[3px] font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] ${tone}`}
        >
            {label}
        </span>
    );
}

/** The big fixture header for one game card (the turf-flat `.fx-top`): Your XI on
 *  the home/left side, a dark score pill in the middle, the opponent on the right.
 *  The user is always rendered as home, with the score from their perspective. */
function FixtureHead({
    oppName,
    oppCode,
    oppYear,
    score,
    status,
    statusDim,
    scrambleCode,
}: {
    oppName?: string;
    oppCode?: string;
    oppYear?: number;
    /** User-perspective score; omitted renders the pending "v" pill. */
    score?: { user: number; opp: number };
    status?: string;
    statusDim?: boolean;
    /** Render the away side as a scrambling mystery: this flag code + "…". */
    scrambleCode?: string;
}) {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-[18px] py-[14px] max-sm:gap-1.5 max-sm:px-3 max-sm:text-[13px] sm:text-[14.5px]">
            <div className="flex min-w-0 items-center justify-end gap-[9px] font-semibold text-ink max-sm:gap-1.5">
                <span className="truncate">Your XI</span>
                <Flag isUser code="" className="h-[15px] w-[22px]" />
            </div>
            <div className="flex flex-col items-center gap-[3px] max-sm:min-w-[58px] sm:min-w-[74px]">
                {score ? (
                    <span className="rounded-[4px] bg-ink px-3.5 py-[3px] font-mono text-xl font-bold tracking-[0.02em] text-ground">
                        {score.user}–{score.opp}
                    </span>
                ) : (
                    <span className="rounded-[4px] border border-line px-3.5 py-[3px] font-mono text-xl font-bold tracking-[0.02em] text-muted">
                        v
                    </span>
                )}
                {status && (
                    <span
                        className={`font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] ${
                            statusDim ? 'text-muted' : 'text-amber'
                        }`}
                    >
                        {status}
                    </span>
                )}
            </div>
            <div className="flex min-w-0 items-center gap-[9px] font-semibold text-ink max-sm:gap-1.5">
                {scrambleCode !== undefined ? (
                    <>
                        <Flag code={scrambleCode} className="h-[15px] w-[22px]" />
                        <span className="truncate">…</span>
                    </>
                ) : (
                    <>
                        <Flag code={oppCode ?? ''} className="h-[15px] w-[22px]" />
                        <span className="truncate">{oppName}</span>
                        {oppYear && (
                            <span className="shrink-0 font-mono text-[11px] font-medium text-muted">
                                {oppYear}
                            </span>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/** The amber "live" line shown at the foot of a feed while a match plays. */
function LiveLine({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-[7px] pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber">
            <span className="h-[7px] w-[7px] rounded-full bg-amber" />
            {label}
        </div>
    );
}

/** A full-bleed end-of-run banner: deep-green for champions, flat white otherwise. */
function Banner({
    champion,
    eyebrow,
    heading,
    body,
    onReset,
}: {
    champion: boolean;
    eyebrow: string;
    heading: string;
    body: string;
    onReset: () => void;
}) {
    const arc = champion ? 'border-white/15' : 'border-line';
    return (
        <div
            className={`relative mt-[30px] overflow-hidden rounded-lg border p-8 text-center ${
                champion ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-panel'
            }`}
        >
            <span
                className={`pointer-events-none absolute -bottom-[60px] -left-[60px] h-40 w-40 rounded-full border-2 ${arc}`}
            />
            <span
                className={`pointer-events-none absolute -right-[60px] -top-[60px] h-40 w-40 rounded-full border-2 ${arc}`}
            />
            <div
                className={`relative font-mono text-[11px] font-semibold uppercase tracking-[0.24em] ${
                    champion ? 'text-amber' : 'text-loss'
                }`}
            >
                {eyebrow}
            </div>
            <h3 className="relative mt-2 font-display text-[40px] font-black leading-none tracking-[-0.02em] max-sm:text-3xl">
                {heading}
            </h3>
            <p
                className={`relative mx-auto mb-[18px] mt-3 max-w-[420px] text-sm ${
                    champion ? 'text-white/80' : 'text-muted'
                }`}
            >
                {body}
            </p>
            <button onClick={onReset} className={`relative ${PRIMARY_BTN}`}>
                Draft a new XI <ArrowRight size={16} strokeWidth={2.5} />
            </button>
        </div>
    );
}

/** The whole tournament on one screen: a group-stage section (standings + the
 *  three matchdays) followed, once the user advances, by the knockout rounds. Each
 *  game shows a fixture card with its goal feed. In game-by-game mode a "Next game"
 *  button sits under the up-next game. */
export default function TournamentScreen({
    group,
    knockout,
    formation,
    filled,
    speed,
    auto,
    onSetAuto,
    onSetSpeed,
    onRecordMatchday,
    onAdvanceKo,
    onReset,
}: Props) {
    const opponents = group.teams.filter((t) => !t.isUser);
    const groupFinished = isGroupFinished(group);
    const advanced = groupFinished && userAdvanced(group);

    // Knockout-derived locals (safe when there is no knockout yet).
    const koCurrent = knockout?.current ?? -1;
    const koOutcome = knockout?.outcome ?? 'alive';
    const activeOpp = knockout?.rounds[koCurrent]?.opponent ?? null;
    const koAlive = !!knockout && koOutcome === 'alive';

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

    // --- shared live-clock display ---
    const [liveMinute, setLiveMinute] = useState(0);
    const [clockLabel, setClockLabel] = useState('');
    const [penShown, setPenShown] = useState(0);

    // --- playback (only one of these is ever active at a time) ---
    const [playingGroup, setPlayingGroup] = useState<{
        matchday: number;
        results: MatchdayResult[];
    } | null>(null);
    const [playingKo, setPlayingKo] = useState<KoResult | null>(null);
    const isPlaying = !!playingGroup || !!playingKo;

    // Auto-scroll: a single tail marker (rendered below at the bottom of the active
    // region) that the page follows down as content is appended. rootRef wraps the
    // growing content so the hook can observe it for growth.
    const { tailRef, rootRef } = useFollowBottom();
    // Heading of the stage the run ended in; scrolled near the top when it's over.
    const stageTopRef = useRef<HTMLDivElement | null>(null);

    // When the run ends (knocked out or champions), scroll so the current stage's
    // heading sits just below the top of the screen, so the final result reads
    // downward from there (instead of following content to the bottom).
    useEffect(() => {
        const over =
            (groupFinished && !advanced) || koOutcome === 'champion' || koOutcome === 'out';
        if (!over) return;
        const id = requestAnimationFrame(() => {
            const el = stageTopRef.current;
            if (!el) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const top = el.getBoundingClientRect().top + window.scrollY - 16; // shy of the top
            window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
        });
        return () => cancelAnimationFrame(id);
    }, [groupFinished, advanced, koOutcome]);

    // --- per-round knockout opponent draw ---
    const [revealedRound, setRevealedRound] = useState(-1);
    const [revealCode, setRevealCode] = useState(randomCode);
    const koRevealed = revealedRound === koCurrent;

    useEffect(() => {
        if (!koAlive || !activeOpp || revealedRound === koCurrent) return;
        let elapsed = 0;
        const step = 90;
        const id = window.setInterval(() => {
            elapsed += step;
            if (elapsed >= 1200) {
                window.clearInterval(id);
                setRevealCode(activeOpp.code);
                setRevealedRound(koCurrent);
            } else {
                setRevealCode(randomCode());
            }
        }, step);
        return () => window.clearInterval(id);
    }, [koAlive, koCurrent, revealedRound, activeOpp]);

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

    const playRound = useCallback(() => {
        if (!knockout || !activeOpp) return;
        setPlayingKo(playKnockout(knockout.user, activeOpp));
    }, [knockout, activeOpp]);

    // Keep latest callbacks/flags without restarting timers on every render.
    const recordRef = useRef(onRecordMatchday);
    const advanceRef = useRef(onAdvanceKo);
    const facedRef = useRef<string[]>(knockout?.faced ?? []);
    const currentRef = useRef(koCurrent);
    const speedRef = useRef(speed);
    useEffect(() => {
        recordRef.current = onRecordMatchday;
        advanceRef.current = onAdvanceKo;
        facedRef.current = knockout?.faced ?? [];
        currentRef.current = koCurrent;
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

    // Knockout clock: run to 90/120', then (if level) the shootout, then record
    // the result and advance to the next round (or end the run).
    useEffect(() => {
        if (!playingKo) return;
        const res = playingKo;
        const max = maxMinute(res.decided);
        const kicks = res.pens?.kicks ?? [];
        const penMs = PEN_MS[speedRef.current];
        const steps = buildMatchSteps(max, HALF_TIME_MS[speedRef.current]);
        const endLabel = res.decided === 'reg' ? 'FT' : res.decided === 'aet' ? 'a.e.t.' : 'pens';
        let idx = 0;
        let timer: number | undefined;

        const advance = () => {
            const willAdvance = res.userWon && currentRef.current < KO_ROUNDS.length - 1;
            const nextOpponent = willAdvance ? drawOpponent(new Set(facedRef.current)) : null;
            advanceRef.current({
                result: res.result,
                decided: res.decided,
                pens: res.pens,
                userWon: res.userWon,
                nextOpponent,
            });
            setPlayingKo(null);
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
            if (res.decided === 'pens' && kicks.length) {
                timer = window.setTimeout(runShootout, 700);
            } else {
                timer = window.setTimeout(advance, 1200);
            }
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
    }, [playingKo]);

    // Auto mode, group: play the next matchday whenever idle.
    useEffect(() => {
        if (!auto || revealing || isPlaying || groupFinished) return;
        const t = window.setTimeout(() => play(group.matchday), 700);
        return () => window.clearTimeout(t);
    }, [auto, revealing, isPlaying, groupFinished, group.matchday, play]);

    // Auto mode, knockout: play each round once its opponent is revealed.
    useEffect(() => {
        if (!auto || !koAlive || isPlaying || !koRevealed) return;
        const t = window.setTimeout(() => playRound(), 600);
        return () => window.clearTimeout(t);
    }, [auto, koAlive, isPlaying, koRevealed, playRound]);

    // The next game to play (null while a knockout draw is mid-scramble, or once
    // the run is over).
    const nextGame: { kind: 'md'; md: number } | { kind: 'ko' } | null = !groupFinished
        ? { kind: 'md', md: group.matchday }
        : koAlive && koRevealed
          ? { kind: 'ko' }
          : null;

    // In game-by-game mode, the "Next game" button sits directly under the card of
    // the game it will play (the up-next matchday, or the active knockout round).
    let nextAnchorKey: string | null = null;
    if (nextGame && !auto && !isPlaying) {
        nextAnchorKey = nextGame.kind === 'md' ? `md-${nextGame.md}` : `ko-${koCurrent}`;
    }

    // --- opening group draw view (full takeover, shown once) ---
    if (revealing) {
        return (
            <div className="mx-auto max-w-[780px]">
                <StageHeader eyebrow="Group draw" title="Your group" />
                <div className="rounded-md border border-line bg-panel p-6 shadow-hard">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="flex flex-col items-center gap-2 rounded-[5px] border border-pitch/40 bg-pitch/[0.06] px-3 py-5 text-center">
                            <Flag isUser code="" className="h-6 w-9" />
                            <span className="text-sm font-bold text-ink">Your XI</span>
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-loss">
                                You
                            </span>
                        </div>
                        {opponents.map((o, i) => (
                            <div
                                key={o.id}
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
    const inKnockout = !!knockout;
    // Index of the last knockout round that has a result (where the run ended).
    const lastPlayedKoRound = knockout
        ? knockout.rounds.reduce((acc, r, i) => (r?.result ? i : acc), -1)
        : -1;
    const tournamentOver =
        (groupFinished && !advanced) || koOutcome === 'champion' || koOutcome === 'out';

    const playNext = () => {
        if (!nextGame) return;
        if (nextGame.kind === 'md') play(nextGame.md);
        else playRound();
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
            {/* Tail so the page follows to the next-game button when it appears. It can
          be mid-document in the group phase, so the tail lives here rather than at
          the document end. */}
            <div ref={tailRef} aria-hidden className="h-0" />
        </>
    );

    const controls = !tournamentOver ? (
        <PlaybackControls
            auto={auto}
            speed={speed}
            onSetAuto={onSetAuto}
            onSetSpeed={onSetSpeed}
        />
    ) : undefined;

    const stGrid =
        'grid grid-cols-[28px_minmax(0,1fr)_26px_26px_32px_38px] sm:grid-cols-[34px_minmax(0,1fr)_30px_30px_30px_34px_38px] items-center gap-1 px-4 py-[11px]';
    const stNum = 'text-center font-mono text-[13px] text-muted';

    return (
        <div ref={rootRef} className="mx-auto max-w-[780px]">
            {/* ===== GROUP STAGE ===== */}
            <StageHeader
                eyebrow="Group stage"
                title="Group of 4 · top 2 advance"
                controls={!inKnockout ? controls : undefined}
                headingRef={!inKnockout ? stageTopRef : undefined}
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
                            <span className="flex min-w-0 items-center gap-[9px]">
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
                                    {/* Tail the page follows while this matchday is playing. */}
                                    {isPlayingMd && <div ref={tailRef} aria-hidden className="h-0" />}
                                </div>
                            )}
                        </div>
                        {`md-${md}` === nextAnchorKey && nextGameButton}
                    </div>
                );
            })}

            {/* ===== KNOCKOUTS ===== */}
            {inKnockout && (
                <>
                    <div className="relative mt-9 border-t-2 border-line">
                        <span className="absolute -top-[11px] left-1/2 -translate-x-1/2 bg-ground px-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                            Knockouts
                        </span>
                    </div>
                    <StageHeader
                        eyebrow="Knockouts"
                        title="Win 4 to lift the trophy"
                        controls={controls}
                    />
                </>
            )}

            {knockout &&
                knockout.rounds.map((_round, i) => {
                    const name = KO_ROUNDS[i];
                    const r = knockout.rounds[i];
                    const opp = r?.opponent ?? null;
                    const isActive = i === koCurrent && koOutcome === 'alive';
                    const isPlayingRound = isActive && !!playingKo;
                    const played = !!r?.result;
                    const isFinal = i === KO_ROUNDS.length - 1;
                    const liveMax = isPlayingRound ? maxMinute(playingKo!.decided) : 90;

                    let score: { user: number; opp: number } | undefined;
                    let status: string | undefined;
                    let statusDim = false;
                    if (isPlayingRound) {
                        const shown = playingKo!.result.events.filter((e) => e.minute <= liveMinute);
                        const userGoals = shown.filter((e) => e.side === 'home').length;
                        score = { user: userGoals, opp: shown.length - userGoals };
                        status = clockLabel || undefined;
                    } else if (played) {
                        score = { user: r!.result!.homeGoals, opp: r!.result!.awayGoals };
                        if (r!.decided === 'aet') status = 'a.e.t.';
                        else if (r!.decided === 'pens') status = 'Penalties';
                        else {
                            status = 'Full time';
                            statusDim = true;
                        }
                    }

                    const showFeed = isPlayingRound || played;
                    const feedEvents = isPlayingRound
                        ? playingKo!.result.events.filter((e) => e.minute <= liveMinute)
                        : played
                          ? r!.result!.events
                          : [];
                    const penKicks = isPlayingRound ? playingKo!.pens?.kicks : r?.pens?.kicks;
                    const penShownCount = isPlayingRound ? penShown : (penKicks?.length ?? 0);
                    const showShootout =
                        !!penKicks &&
                        (isPlayingRound ? liveMinute >= maxMinute(playingKo!.decided) : true);
                    const scrambling = isActive && !koRevealed && !isPlayingRound;

                    let tag: React.ReactNode = null;
                    if (isPlayingRound) {
                        tag = <ResultTag kind="next" label="Live now" />;
                    } else if (played) {
                        const dec = r!.decided;
                        tag = r!.userWon ? (
                            <ResultTag
                                kind="w"
                                label={
                                    dec === 'pens'
                                        ? 'Won on penalties'
                                        : dec === 'aet'
                                          ? 'Won a.e.t.'
                                          : 'Won'
                                }
                            />
                        ) : (
                            <ResultTag
                                kind="l"
                                label={dec === 'pens' ? 'Lost on penalties' : 'Lost'}
                            />
                        );
                    } else if (isActive && koRevealed) {
                        tag = <ResultTag kind="next" label="Up next" />;
                    }

                    const live = isPlayingRound && liveMinute < liveMax;
                    const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;

                    return (
                        <div key={`ko-${i}`} className="mt-[26px]">
                            <div
                                ref={i === lastPlayedKoRound ? stageTopRef : undefined}
                                className="mb-[9px] flex items-center gap-2.5"
                            >
                                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                    {name}
                                </span>
                                {tag}
                            </div>
                            <div
                                className={`overflow-hidden rounded-md border border-line bg-panel shadow-hard ${
                                    isPlayingRound || isFinal ? 'border-t-[3px] border-t-pitch' : ''
                                }`}
                            >
                                <FixtureHead
                                    oppName={opp?.name}
                                    oppCode={opp?.code}
                                    oppYear={opp?.year}
                                    score={score}
                                    status={status}
                                    statusDim={statusDim}
                                    scrambleCode={scrambling ? revealCode : undefined}
                                />
                                {showFeed && (
                                    <div className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3">
                                        <GoalList
                                            events={feedEvents}
                                            userSide="home"
                                            oppCode={opp?.code ?? ''}
                                            live={live}
                                        />
                                        {showShootout && penKicks && (
                                            <ShootoutFeed kicks={penKicks} shown={penShownCount} />
                                        )}
                                        {live && <LiveLine label={liveLabel} />}
                                        {/* Tail the page follows while this round is playing. */}
                                        {isPlayingRound && (
                                            <div ref={tailRef} aria-hidden className="h-0" />
                                        )}
                                    </div>
                                )}
                            </div>
                            {`ko-${i}` === nextAnchorKey && nextGameButton}
                        </div>
                    );
                })}

            {/* Outcome banners + end-of-run summary */}
            {groupFinished && !advanced && (
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

            {koOutcome === 'champion' && (
                <Banner
                    champion
                    eyebrow="Full time · the Final"
                    heading="World Champions."
                    body="Your randomly drafted XI lifted the cup. All four knockout rounds won, the trophy is yours."
                    onReset={onReset}
                />
            )}

            {koOutcome === 'out' && (
                <Banner
                    champion={false}
                    eyebrow={`Knocked out · ${KO_ROUNDS[koCurrent]}`}
                    heading="Knocked out."
                    body={`Beaten in the ${KO_ROUNDS[koCurrent]}. So close - draft a new XI and run it back.`}
                    onReset={onReset}
                />
            )}

            {knockout && koOutcome !== 'alive' && (
                <TournamentSummary
                    formation={formation}
                    filled={filled}
                    group={group}
                    knockout={knockout}
                />
            )}

            {/* Tail for content at the document bottom when no match is playing AND
          there is no next-game button to follow instead (automatic mode between
          matches, or the end-of-run banners). When a next-game button is shown
          the tail lives next to it (see nextGameButton). */}
            {!isPlaying && !nextAnchorKey && !tournamentOver && (knockout || groupFinished) && (
                <div ref={tailRef} aria-hidden className="h-0" />
            )}
        </div>
    );
}
