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
import { ArrowRight, Check, ChevronDown, ChevronRight, Play, Trophy, X } from 'lucide-react';
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

/** A scored/missed pip (green check / red cross) for one penalty. */
function PenPip({ scored }: { scored: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
        scored ? 'bg-win' : 'bg-loss'
      }`}
    >
      {scored ? (
        <Check size={11} strokeWidth={3.5} className="text-white" />
      ) : (
        <X size={11} strokeWidth={3.5} className="text-white" />
      )}
    </span>
  );
}

/** Penalty shootout sheet: every taker listed one by one, Your XI on the left
 *  versus the opponent on the right, each with their name and result, so the
 *  whole shootout stays readable in the accordion. Kicks alternate home/away
 *  per round, so pairing them by index gives a head-to-head row per round. */
function ShootoutFeed({ oppName, kicks, shown }: { oppName: string; kicks: PenKick[]; shown: number }) {
  const revealed = kicks.slice(0, shown);
  const homeKicks = revealed.filter((k) => k.side === 'home');
  const awayKicks = revealed.filter((k) => k.side === 'away');
  const homeScore = homeKicks.filter((k) => k.scored).length;
  const awayScore = awayKicks.filter((k) => k.scored).length;
  const rounds = Math.max(homeKicks.length, awayKicks.length);

  return (
    <div className="mt-2 border-t border-line pt-3">
      <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
        Penalty shootout
      </div>
      <div className="mb-2.5 flex items-center justify-center gap-3 text-sm">
        <span className="flex-1 truncate text-right font-black text-ink">Your XI</span>
        <span className="shrink-0 rounded-lg bg-pitch/5 px-2.5 py-1 font-mono font-black text-ink">
          {homeScore}–{awayScore}
        </span>
        <span className="flex-1 truncate font-semibold text-ink">{oppName}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {Array.from({ length: rounds }, (_, i) => {
          const h = homeKicks[i];
          const a = awayKicks[i];
          return (
            <li key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 text-[13px]">
              <span className="flex min-w-0 items-center justify-end gap-2">
                {h ? (
                  <>
                    <span className="truncate font-bold text-ink">{h.taker}</span>
                    <PenPip scored={h.scored} />
                  </>
                ) : null}
              </span>
              <span className="w-6 text-center font-mono text-[10px] text-muted">{i + 1}</span>
              <span className="flex min-w-0 items-center justify-start gap-2">
                {a ? (
                  <>
                    <PenPip scored={a.scored} />
                    <span className="truncate font-bold text-ink">{a.taker}</span>
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

/** A compact label + chevron button that opens a small single-choice menu.
 *  Used in the header for the playback mode and speed selectors. */
function MenuSelect<T extends string>({
  value,
  options,
  onSelect,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 py-2 text-xs font-bold text-ink shadow-soft transition hover:border-pitch/40"
      >
        {current}
        <ChevronDown size={14} strokeWidth={2.5} className="text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-2xl border border-line bg-panel shadow-soft">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setOpen(false);
                  onSelect(o.value);
                }}
                className={`flex w-full items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 text-left text-sm font-bold transition last:border-b-0 hover:bg-pitch/[0.06] ${
                  o.value === value ? 'text-ink' : 'text-muted'
                }`}
              >
                {o.label}
                {o.value === value && <Check size={14} strokeWidth={3} className="text-pitch" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The whole tournament on one screen: the header carries the playback mode and
 *  speed selectors, and the group matchdays + knockout rounds render below as one
 *  uniform, single-open accordion of game sections. In game-by-game mode a "Next
 *  game" button appears under the most recently finished game. */
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
  const [revealCodes, setRevealCodes] = useState<string[]>(() => opponents.map(() => randomCode()));
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

  // --- single-open accordion across every game section ---
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey((k) => (k === key ? null : key));
  // Collapsible "all results" overview attached to the group table.
  const [showResults, setShowResults] = useState(false);

  // Single scroll authority: a lone tail marker, rendered at the bottom of the
  // currently-active region, that the page keeps pinned just above the viewport
  // bottom as content grows (goals, penalty lines, new rounds, end banners).
  // rootRef wraps the growing content so the hook can detect that growth.
  const { tailRef, rootRef } = useFollowBottom();

  // --- shared live-clock display ---
  const [liveMinute, setLiveMinute] = useState(0);
  const [clockLabel, setClockLabel] = useState('');
  const [penShown, setPenShown] = useState(0);

  // --- playback (only one of these is ever active at a time) ---
  const [playingGroup, setPlayingGroup] = useState<{ matchday: number; results: MatchdayResult[] } | null>(null);
  const [playingKo, setPlayingKo] = useState<KoResult | null>(null);
  const isPlaying = !!playingGroup || !!playingKo;

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
      setOpenKey(`md-${md}`);
      setPlayingGroup({ matchday: md, results });
    },
    [group],
  );

  const playRound = useCallback(() => {
    if (!knockout || !activeOpp) return;
    setOpenKey(`ko-${knockout.current}`);
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

  // Following the growing feed/rounds/banners is handled entirely by
  // useFollowBottom watching the single tail marker rendered below; there are no
  // per-trigger scroll effects here anymore (they used to compete and jump).

  // --- opening group draw view (full takeover, shown once) ---
  if (revealing) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-12">
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.2em] text-muted">GROUP DRAW</div>
          <h2 className="text-2xl font-black text-ink">Your group</h2>
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center sm:gap-8">
          <div className="flex w-24 flex-col items-center gap-2">
            <Flag code="" isUser className="h-12 w-[4.5rem]" />
            <span className="text-center text-sm font-black">Your XI</span>
          </div>
          <div className="flex items-start justify-center gap-2 sm:contents">
            {opponents.map((o, i) => (
              <div
                key={o.id}
                className={`flex w-24 flex-col items-center gap-1 ${settled ? 'animate-settle' : ''}`}
              >
                <Flag code={revealCodes[i] ?? ''} className="h-12 w-[4.5rem]" />
                <span className="text-center text-sm font-bold leading-tight text-ink">{settled ? o.name : '…'}</span>
                {settled && o.year && <span className="text-xs font-bold text-amber">WC {o.year}</span>}
              </div>
            ))}
          </div>
        </div>
        {settled ? (
          <button
            onClick={() => setRevealing(false)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-pitch px-6 py-3 text-base font-black uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark active:scale-[0.99]"
          >
            Continue to group stage
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        ) : (
          <p className="text-sm font-semibold text-muted">Drawing opponents…</p>
        )}
      </div>
    );
  }

  const table = standings(group);
  const inKnockout = !!knockout;
  const tournamentOver = (groupFinished && !advanced) || koOutcome === 'champion' || koOutcome === 'out';

  const playNext = () => {
    if (!nextGame) return;
    if (nextGame.kind === 'md') play(nextGame.md);
    else playRound();
  };

  const nextGameButton = (
    <div className="mt-2 flex justify-center">
      <button
        onClick={playNext}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-pitch px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark active:scale-[0.99]"
      >
        <Play size={15} fill="currentColor" strokeWidth={0} />
        Next game
        <ArrowRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  );

  return (
    <div ref={rootRef} className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Header: title + playback selectors */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-pitch">
            {inKnockout ? 'KNOCKOUTS' : 'GROUP STAGE'}
          </div>
          <h2 className="mt-0.5 text-2xl font-black leading-tight text-ink">
            {inKnockout ? 'Win 4 to lift the trophy' : 'Group of 4 · top 2 advance'}
          </h2>
        </div>
        {!tournamentOver && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MenuSelect
              ariaLabel="Playback mode"
              value={auto ? 'auto' : 'manual'}
              onSelect={(v) => onSetAuto(v === 'auto')}
              options={[
                { value: 'manual', label: 'Game by game' },
                { value: 'auto', label: 'Automatic' },
              ]}
            />
            <MenuSelect
              ariaLabel="Match speed"
              value={speed}
              onSelect={onSetSpeed}
              options={[
                { value: 'slow', label: 'Slow' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
              ]}
            />
          </div>
        )}
      </div>

      {/* Standings */}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-soft">
        <div className="grid grid-cols-[20px_minmax(0,1fr)_34px_38px] sm:grid-cols-[24px_minmax(0,1fr)_28px_28px_28px_28px_36px_36px] items-center gap-1 border-b border-line bg-pitch/[0.06] px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <span>#</span>
          <span>Team</span>
          <span className="hidden text-center sm:block">P</span>
          <span className="hidden text-center sm:block">W</span>
          <span className="hidden text-center sm:block">D</span>
          <span className="hidden text-center sm:block">L</span>
          <span className="text-center">GD</span>
          <span className="text-center">Pts</span>
        </div>
        {table.map((s, i) => (
          <div
            key={s.team.id}
            className={`grid grid-cols-[20px_minmax(0,1fr)_34px_38px] sm:grid-cols-[24px_minmax(0,1fr)_28px_28px_28px_28px_36px_36px] items-center gap-1 border-b border-line px-3 py-2.5 text-sm text-ink last:border-b-0 ${
              i < 2 ? 'border-l-4 border-l-pitch' : 'border-l-4 border-l-transparent'
            } ${s.team.isUser ? 'bg-pitch/[0.06]' : ''}`}
          >
            {i < 2 ? (
              <span className="grid h-[22px] w-[22px] place-items-center rounded-lg bg-pitch font-mono text-xs font-bold text-white">
                {i + 1}
              </span>
            ) : (
              <span className="font-mono text-muted">{i + 1}</span>
            )}
            <span className="group/team flex items-center gap-2 truncate">
              <Flag code={s.team.code} isUser={s.team.isUser} className="h-4 w-6 shrink-0" />
              <span className={`truncate ${s.team.isUser ? 'font-black' : 'font-semibold'}`}>{s.team.name}</span>
              {s.team.year && <span className="shrink-0 text-[11px] text-muted">{s.team.year}</span>}
              {s.team.isUser && (
                <span className="shrink-0 rounded-full bg-pitch px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.04em] leading-none text-white">
                  You
                </span>
              )}
              <span className="hidden shrink-0 rounded-full bg-pitch px-1.5 font-mono text-[10px] font-bold leading-tight text-white group-hover/team:inline-block">
                {s.team.strength.overall}
              </span>
            </span>
            <span className="hidden text-center font-mono text-muted sm:block">{s.played}</span>
            <span className="hidden text-center font-mono text-muted sm:block">{s.won}</span>
            <span className="hidden text-center font-mono text-muted sm:block">{s.drawn}</span>
            <span className="hidden text-center font-mono text-muted sm:block">{s.lost}</span>
            <span className="text-center font-mono text-muted">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center font-mono font-black">{s.points}</span>
          </div>
        ))}

        {/* All group results (every fixture, including Your XI), collapsible */}
        <button
          onClick={() => setShowResults((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-pitch/[0.06] px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted transition hover:bg-pitch/10"
        >
          All results
          {showResults ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showResults && (
          <div className="border-t border-line px-2 py-2">
            {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => (
              <div key={md} className="mb-2 last:mb-0">
                <div className="mb-0.5 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
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
                      score={f.result ? { home: f.result.homeGoals, away: f.result.awayGoals } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game sections: group matchdays, then knockout rounds, one uniform list */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => {
          const fx = fixturesForMatchday(group, md);
          const userFx = fx.find((f) => teamById(group, f.homeId).isUser || teamById(group, f.awayId).isUser)!;
          const isPlayingMd = playingGroup?.matchday === md;
          const open = openKey === `md-${md}`;
          const userHome = teamById(group, userFx.homeId);
          const userAway = teamById(group, userFx.awayId);

          const live = isPlayingMd ? playingGroup! : null;
          const userResult =
            live?.results.find((r) => r.homeId === userFx.homeId && r.awayId === userFx.awayId)?.result ??
            userFx.result;

          let feedEvents: MatchEvent[] | null = null;
          let userScore: { home: number; away: number } | undefined;
          let userStatus: string | undefined;
          if (isPlayingMd && userResult) {
            const shown = userResult.events.filter((e) => e.minute <= liveMinute);
            feedEvents = shown;
            userScore = {
              home: shown.filter((e) => e.side === 'home').length,
              away: shown.filter((e) => e.side === 'away').length,
            };
            userStatus = clockLabel;
          } else if (open && userFx.result) {
            feedEvents = userFx.result.events;
          }

          // Win/loss/draw tag (from Your XI's perspective), same as the knockouts.
          const userIsHome = userHome.isUser;
          const mdGf = userFx.result ? (userIsHome ? userFx.result.homeGoals : userFx.result.awayGoals) : 0;
          const mdGa = userFx.result ? (userIsHome ? userFx.result.awayGoals : userFx.result.homeGoals) : 0;
          const mdTag =
            userFx.result && !isPlayingMd ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] ${
                  mdGf > mdGa
                    ? 'bg-win/15 text-win'
                    : mdGf < mdGa
                      ? 'bg-loss/15 text-loss'
                      : 'bg-line text-muted'
                }`}
              >
                {mdGf > mdGa ? 'Won' : mdGf < mdGa ? 'Lost' : 'Draw'}
              </span>
            ) : md === group.matchday && !groupFinished && !isPlayingMd ? (
              <span className="text-amber">· up next</span>
            ) : null;

          return (
            <div key={`md-${md}`}>
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
                <span>MATCHDAY {md}</span>
                {mdTag}
              </div>
              <div className="rounded-2xl border border-line bg-panel p-1.5 shadow-soft">
                <FixtureRow
                  home={userHome}
                  away={userAway}
                  homeElo={userHome.strength.overall}
                  awayElo={userAway.strength.overall}
                  score={
                    userScore ??
                    (userFx.result ? { home: userFx.result.homeGoals, away: userFx.result.awayGoals } : undefined)
                  }
                  status={userStatus}
                  expandable={!!userFx.result && !isPlayingMd}
                  expanded={open}
                  onToggle={() => toggle(`md-${md}`)}
                />
                {feedEvents && (
                  <div className="mt-1.5 rounded-xl border-t border-line bg-pitch/5 p-3">
                    {isPlayingMd && (
                      <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full bg-pitch" style={{ width: `${(liveMinute / 90) * 100}%` }} />
                      </div>
                    )}
                    <GoalList
                      events={feedEvents}
                      home={userHome}
                      away={userAway}
                      live={isPlayingMd && liveMinute < 90}
                    />
                    {/* Tail marker: the page follows this as goals appear. Only the
                        active matchday renders it, so exactly one tail exists. */}
                    {isPlayingMd && <div ref={tailRef} aria-hidden className="h-0" />}
                  </div>
                )}
              </div>
              {`md-${md}` === nextAnchorKey && nextGameButton}
            </div>
          );
        })}

        {knockout &&
          knockout.rounds.map((_round, i) => {
            const name = KO_ROUNDS[i];
            const r = knockout.rounds[i];
            const opp = r?.opponent ?? null;
            const isActive = i === koCurrent && koOutcome === 'alive';
            const isPlayingRound = isActive && !!playingKo;
            const played = !!r?.result;
            const open = openKey === `ko-${i}`;

            let score: { home: number; away: number } | undefined;
            let status: string | undefined;
            if (isPlayingRound) {
              const res = playingKo!;
              const shown = res.result.events.filter((e) => e.minute <= liveMinute);
              score = {
                home: shown.filter((e) => e.side === 'home').length,
                away: shown.filter((e) => e.side === 'away').length,
              };
              status = clockLabel;
            } else if (played) {
              score = { home: r!.result!.homeGoals, away: r!.result!.awayGoals };
              status = r!.decided === 'aet' ? 'a.e.t.' : r!.decided === 'pens' ? 'pens' : undefined;
            }

            const showFeed = isPlayingRound || (played && open);
            const feedEvents = isPlayingRound
              ? playingKo!.result.events.filter((e) => e.minute <= liveMinute)
              : played
                ? r!.result!.events
                : [];
            const penKicks = isPlayingRound ? playingKo!.pens?.kicks : r?.pens?.kicks;
            const penShownCount = isPlayingRound ? penShown : penKicks?.length ?? 0;
            const showShootout =
              !!penKicks && (isPlayingRound ? liveMinute >= maxMinute(playingKo!.decided) : true);
            const liveMax = isPlayingRound ? maxMinute(playingKo!.decided) : 90;

            const tag = played ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.04em] ${
                  r!.userWon ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
                }`}
              >
                {r!.userWon ? 'Won' : 'Lost'}
              </span>
            ) : isActive && koRevealed && !isPlayingRound ? (
              <span className="text-amber">· up next</span>
            ) : null;

            return (
              <div key={`ko-${i}`}>
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
                  <span>{name.toUpperCase()}</span>
                  {tag}
                </div>
                <div className="rounded-2xl border border-line bg-panel p-1.5 shadow-soft">
                  <FixtureRow
                    home={knockout.user}
                    away={opp ?? { name: '?', code: '' }}
                    homeElo={knockout.user.strength.overall}
                    awayElo={opp?.strength.overall}
                    score={score}
                    status={status}
                    expandable={played && !isPlayingRound}
                    expanded={open}
                    onToggle={() => toggle(`ko-${i}`)}
                    scrambleCode={isActive && !koRevealed && !isPlayingRound ? revealCode : undefined}
                    awayUnknown={!opp}
                  />
                  {showFeed && (
                    <div className="mt-1.5 rounded-xl border-t border-line bg-pitch/5 p-3">
                      {isPlayingRound && (
                        <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full bg-pitch"
                            style={{ width: `${(Math.min(liveMinute, liveMax) / liveMax) * 100}%` }}
                          />
                        </div>
                      )}
                      <GoalList
                        events={feedEvents}
                        home={knockout.user}
                        away={opp ?? { code: '' }}
                        live={isPlayingRound && liveMinute < liveMax}
                      />
                      {showShootout && penKicks && (
                        <ShootoutFeed oppName={opp?.name ?? 'Opponent'} kicks={penKicks} shown={penShownCount} />
                      )}
                      {/* Tail marker: follows goals and each new penalty line. Only
                          the active round renders it, so exactly one tail exists. */}
                      {isPlayingRound && <div ref={tailRef} aria-hidden className="h-0" />}
                    </div>
                  )}
                </div>
                {`ko-${i}` === nextAnchorKey && nextGameButton}
              </div>
            );
          })}
      </div>

      {/* Outcome banners + end-of-run summary */}
      {groupFinished && !advanced && (
        <>
          <div className="rounded-2xl border border-dashed border-line bg-panel p-5 text-center shadow-soft">
            <p className="text-xl font-black text-loss">Eliminated in the group stage.</p>
            <p className="mt-1 text-sm text-muted">So close. Draft a new XI and run it back.</p>
            <button
              onClick={onReset}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-pitch px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark"
            >
              Draft a new XI
            </button>
          </div>
          <TournamentSummary formation={formation} filled={filled} />
        </>
      )}

      {koOutcome === 'champion' && (
        <div className="rounded-2xl border-2 border-amber bg-amber/10 p-6 text-center shadow-soft">
          <Trophy size={48} className="mx-auto text-amber" strokeWidth={1.5} />
          <p className="mt-2 text-2xl font-black text-amber">World Cup Champions!</p>
          <p className="mt-1 text-sm font-semibold text-muted">
            Your random XI won all four knockout rounds. Legendary.
          </p>
          <button
            onClick={onReset}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-pitch px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark"
          >
            Draft a new XI
          </button>
        </div>
      )}

      {koOutcome === 'out' && (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-5 text-center shadow-soft">
          <p className="text-xl font-black text-loss">Knocked out in the {KO_ROUNDS[koCurrent]}.</p>
          <p className="mt-1 text-sm text-muted">So close. Draft a new XI and run it back.</p>
          <button
            onClick={onReset}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-pitch px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark"
          >
            Draft a new XI
          </button>
        </div>
      )}

      {knockout && koOutcome !== 'alive' && (
        <TournamentSummary formation={formation} filled={filled} group={group} knockout={knockout} />
      )}

      {/* Bottom spacer so the document-end case still keeps a margin: scrollTo
          clamps to max scroll, so without this the very last content would sit
          flush against the viewport bottom. */}
      <div aria-hidden className="h-6" />

      {/* Tail marker for everything that grows at the document bottom (a newly
          appended knockout round, the end-of-run banners). While a match is
          playing, the tail lives inside that match's feed box instead, so only
          one tail is ever mounted. */}
      {!isPlaying && <div ref={tailRef} aria-hidden className="h-0" />}
    </div>
  );
}
