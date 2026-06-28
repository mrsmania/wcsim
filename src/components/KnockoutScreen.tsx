import { useCallback, useEffect, useRef, useState } from 'react';
import { SQUADS } from '../data/squads';
import {
  KO_ROUNDS,
  drawOpponent,
  playKnockout,
  type KnockoutState,
  type KoDecided,
  type KoResult,
} from '../domain/knockout';
import type { MatchResult, PenKick } from '../domain/match';
import type { GroupState, GroupTeam } from '../domain/tournament';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { buildMatchSteps, HALF_TIME_MS, PEN_MS, STEP_MS, type MatchSpeed } from '../domain/clock';
import { Check, FastForward, Pause, Play, Trophy, X } from 'lucide-react';
import FixtureRow from './FixtureRow';
import GoalList from './GoalList';
import SpeedControl from './SpeedControl';
import TournamentSummary from './TournamentSummary';

interface Props {
  knockout: KnockoutState;
  formation: Formation;
  filled: Filled;
  group: GroupState | null;
  speed: MatchSpeed;
  onSetSpeed: (s: MatchSpeed) => void;
  onAdvance: (p: {
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

/** Penalty shootout feed: each side's kicks as scored/missed pips, revealed
 *  one at a time, with the current taker called out below. */
function ShootoutFeed({
  oppName,
  kicks,
  shown,
}: {
  oppName: string;
  kicks: PenKick[];
  shown: number;
}) {
  const revealed = kicks.slice(0, shown);
  const homeKicks = revealed.filter((k) => k.side === 'home');
  const awayKicks = revealed.filter((k) => k.side === 'away');
  const last = revealed[revealed.length - 1];

  const Row = ({ label, isUser, list }: { label: string; isUser?: boolean; list: PenKick[] }) => (
    <div className="flex items-center gap-2">
      <span className={`w-20 shrink-0 truncate text-xs ${isUser ? 'font-black' : 'font-semibold'}`}>{label}</span>
      <div className="flex flex-1 flex-wrap gap-1">
        {list.map((k, i) => (
          <span
            key={i}
            className={`flex h-4 w-4 items-center justify-center rounded-full ${k.scored ? 'bg-emerald-500' : 'bg-red-500'}`}
            title={`${k.taker} — ${k.scored ? 'scored' : 'missed'}`}
          >
            {k.scored ? (
              <Check size={11} strokeWidth={3.5} className="text-white" />
            ) : (
              <X size={11} strokeWidth={3.5} className="text-white" />
            )}
          </span>
        ))}
      </div>
      <span className="w-5 shrink-0 text-right font-mono text-sm font-black">
        {list.filter((k) => k.scored).length}
      </span>
    </div>
  );

  return (
    <div className="mt-2 border-t border-stone-200 pt-2">
      <div className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">
        Penalty shootout
      </div>
      <div className="flex flex-col gap-1.5">
        <Row label="Your XI" isUser list={homeKicks} />
        <Row label={oppName} list={awayKicks} />
      </div>
      {last && (
        <div className="mt-1.5 text-center text-xs text-stone-600">
          <span className="font-semibold">{last.taker}</span> {last.scored ? 'scored' : 'missed'}
        </div>
      )}
    </div>
  );
}

export default function KnockoutScreen({
  knockout,
  formation,
  filled,
  group,
  speed,
  onSetSpeed,
  onAdvance,
  onReset,
}: Props) {
  const { user, current, outcome, rounds } = knockout;
  const activeOpp = rounds[current]?.opponent ?? null;

  const [revealedRound, setRevealedRound] = useState(-1);
  const [revealCode, setRevealCode] = useState(randomCode);
  const [playing, setPlaying] = useState<KoResult | null>(null);
  const [liveMinute, setLiveMinute] = useState(0);
  const [clockLabel, setClockLabel] = useState('');
  const [penShown, setPenShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [openRounds, setOpenRounds] = useState<Set<number>>(() => new Set());

  const revealed = revealedRound === current;

  const toggleRound = (i: number) =>
    setOpenRounds((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  // Draw scramble for each new round's opponent, then settle.
  useEffect(() => {
    if (outcome !== 'alive' || !activeOpp || revealedRound === current) return;
    let elapsed = 0;
    const step = 90;
    const id = window.setInterval(() => {
      elapsed += step;
      if (elapsed >= 1200) {
        window.clearInterval(id);
        setRevealCode(activeOpp.code);
        setRevealedRound(current);
      } else {
        setRevealCode(randomCode());
      }
    }, step);
    return () => window.clearInterval(id);
  }, [current, outcome, revealedRound, activeOpp]);

  const playRound = useCallback(() => {
    if (!activeOpp) return;
    setPlaying(playKnockout(user, activeOpp));
  }, [user, activeOpp]);

  // Keep latest callback/flags without restarting timers on every render.
  const advanceRef = useRef(onAdvance);
  const facedRef = useRef(knockout.faced);
  const currentRef = useRef(current);
  const autoRef = useRef(auto);
  const speedRef = useRef(speed);
  useEffect(() => {
    advanceRef.current = onAdvance;
    facedRef.current = knockout.faced;
    currentRef.current = current;
    autoRef.current = auto;
    speedRef.current = speed;
  });

  // Run the live clock (stoppage time + half-time), then (if drawn level) the
  // shootout, then record + advance.
  useEffect(() => {
    if (!playing) return;
    const res = playing;
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
  }, [playing]);

  // Auto mode: play each round once its opponent is revealed.
  useEffect(() => {
    if (!auto || outcome !== 'alive' || playing || !revealed) return;
    const t = window.setTimeout(() => playRound(), 600);
    return () => window.clearTimeout(t);
  }, [auto, outcome, playing, revealed, playRound]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3 border-b-2 border-stone-900 pb-2">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">KNOCKOUTS</div>
          <h2 className="text-2xl font-black leading-tight">Win 4 to lift the trophy</h2>
        </div>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-600">Lose all progress?</span>
            <button
              onClick={onReset}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-red-500"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="rounded border border-stone-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:border-stone-900"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="rounded border border-stone-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:border-stone-900 hover:bg-stone-900 hover:text-white"
          >
            Start over
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {rounds.map((_round, i) => {
          const name = KO_ROUNDS[i];
          const r = rounds[i];
          const opp = r?.opponent ?? null;
          const isActive = i === current && outcome === 'alive';
          const isPlaying = isActive && !!playing;
          const played = !!r?.result;
          const expanded = openRounds.has(i);

          // Score + status shown in the row.
          let score: { home: number; away: number } | undefined;
          let status: string | undefined;
          if (isPlaying) {
            const res = playing!;
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

          // Live / recorded match feed (goals, then shootout if any).
          const showFeed = isPlaying || (played && expanded);
          const feedEvents = isPlaying
            ? playing!.result.events.filter((e) => e.minute <= liveMinute)
            : played
              ? r!.result!.events
              : [];
          const penKicks = isPlaying ? playing!.pens?.kicks : r?.pens?.kicks;
          const penShownCount = isPlaying ? penShown : penKicks?.length ?? 0;
          const showShootout =
            !!penKicks && (isPlaying ? liveMinute >= maxMinute(playing!.decided) : true);
          const liveMax = isPlaying ? maxMinute(playing!.decided) : 90;

          // Status label next to the round name.
          const tag = played ? (
            <span className={r!.userWon ? 'text-emerald-600' : 'text-red-600'}>
              · {r!.userWon ? 'won' : 'lost'}
            </span>
          ) : isActive && revealed && !isPlaying ? (
            <span className="text-red-600">· up next</span>
          ) : null;

          return (
            <div key={name}>
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                <span>{name.toUpperCase()}</span>
                {tag}
              </div>
              <div
                className={`rounded-lg border p-1 ${
                  isActive
                    ? 'border-stone-900 bg-white'
                    : played
                      ? 'border-stone-200 bg-white'
                      : 'border-dashed border-stone-300 bg-white/40'
                }`}
              >
                <FixtureRow
                  home={user}
                  away={opp ?? { name: '?', code: '' }}
                  homeElo={user.strength.overall}
                  awayElo={opp?.strength.overall}
                  score={score}
                  status={status}
                  expandable={played && !isPlaying}
                  expanded={expanded}
                  onToggle={() => toggleRound(i)}
                  scrambleCode={isActive && !revealed && !isPlaying ? revealCode : undefined}
                  awayUnknown={!opp}
                />

                {showFeed && (
                  <div className="mt-1 rounded bg-stone-50 p-2">
                    {isPlaying && (
                      <div className="mb-2 h-1 w-full overflow-hidden rounded bg-stone-200">
                        <div
                          className="h-full bg-red-600"
                          style={{ width: `${(Math.min(liveMinute, liveMax) / liveMax) * 100}%` }}
                        />
                      </div>
                    )}
                    <GoalList
                      events={feedEvents}
                      home={user}
                      away={opp ?? { code: '' }}
                      live={isPlaying && liveMinute < liveMax}
                    />
                    {showShootout && penKicks && (
                      <ShootoutFeed oppName={opp?.name ?? 'Opponent'} kicks={penKicks} shown={penShownCount} />
                    )}
                  </div>
                )}

                {isActive && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    {!isPlaying &&
                      (revealed ? (
                        <div className="flex items-center justify-center gap-3">
                          {!auto && (
                            <button
                              onClick={playRound}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
                            >
                              <Play size={16} fill="currentColor" strokeWidth={0} />
                              Play {name}
                            </button>
                          )}
                          <button
                            onClick={() => setAuto((v) => !v)}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-black uppercase tracking-wide transition ${
                              auto
                                ? 'border-red-600 bg-red-600 text-white hover:bg-red-500'
                                : 'border-stone-400 hover:border-stone-900 hover:bg-stone-900 hover:text-white'
                            }`}
                          >
                            {auto ? (
                              <>
                                <Pause size={15} fill="currentColor" strokeWidth={0} />
                                Stop auto
                              </>
                            ) : (
                              <>
                                <FastForward size={15} fill="currentColor" strokeWidth={0} />
                                Automatic
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-stone-500">Drawing your opponent…</span>
                      ))}
                    <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {outcome === 'champion' && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-6 text-center">
          <Trophy size={48} className="mx-auto text-amber-500" strokeWidth={1.5} />
          <p className="mt-2 text-2xl font-black text-amber-700">World Cup Champions!</p>
          <p className="mt-1 text-sm font-semibold text-stone-600">
            Your random XI won all four knockout rounds. Legendary.
          </p>
          <button
            onClick={onReset}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-stone-900 px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-stone-700"
          >
            Draft a new XI
          </button>
        </div>
      )}

      {outcome === 'out' && (
        <div className="rounded-xl border border-dashed border-stone-400 bg-white/60 p-5 text-center">
          <p className="text-xl font-black text-stone-700">Knocked out in the {KO_ROUNDS[current]}.</p>
          <p className="mt-1 text-sm text-stone-500">So close. Draft a new XI and run it back.</p>
          <button
            onClick={onReset}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-red-500"
          >
            Draft a new XI
          </button>
        </div>
      )}

      {outcome !== 'alive' && (
        <TournamentSummary formation={formation} filled={filled} group={group} knockout={knockout} />
      )}
    </div>
  );
}
