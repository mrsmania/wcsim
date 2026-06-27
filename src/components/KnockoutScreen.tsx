import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SQUADS } from '../data/squads';
import {
  KO_ROUNDS,
  drawOpponent,
  playKnockout,
  type KnockoutState,
  type KoDecided,
  type KoResult,
} from '../domain/knockout';
import type { MatchResult } from '../domain/match';
import type { GroupTeam } from '../domain/tournament';
import { FastForward, Pause, Play, Trophy } from 'lucide-react';
import Flag from './Flag';
import GoalList from './GoalList';

interface Props {
  knockout: KnockoutState;
  onAdvance: (p: {
    result: MatchResult;
    decided: KoDecided;
    pens?: { user: number; opp: number };
    userWon: boolean;
    nextOpponent: GroupTeam | null;
  }) => void;
  onReset: () => void;
}

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];
const maxMinute = (decided: KoDecided) => (decided === 'reg' ? 90 : 120);

function TeamChip({ team, scrambleCode }: { team: GroupTeam | null; scrambleCode?: string }) {
  if (!team) {
    return (
      <div className="flex w-24 flex-col items-center gap-1 opacity-50">
        <div className="flex h-12 w-[4.5rem] items-center justify-center rounded bg-stone-200 text-lg font-black text-stone-400">
          ?
        </div>
        <span className="text-xs font-semibold text-stone-400">TBD</span>
      </div>
    );
  }
  if (team.isUser) {
    return (
      <div className="flex w-24 flex-col items-center gap-1">
        <Flag code="" isUser className="h-12 w-[4.5rem]" />
        <span className="text-sm font-black">Your XI</span>
      </div>
    );
  }
  const scrambling = !!scrambleCode;
  return (
    <div className={`flex w-24 flex-col items-center gap-1 ${scrambling ? '' : 'animate-settle'}`}>
      <Flag code={scrambling ? scrambleCode! : team.code} className="h-12 w-[4.5rem]" />
      <span className="text-center text-sm font-bold leading-tight">{scrambling ? '…' : team.name}</span>
      {!scrambling && team.year && <span className="text-xs font-semibold text-red-600">WC {team.year}</span>}
    </div>
  );
}

function Score({ home, away, status, sub }: { home: number; away: number; status?: string; sub?: string }) {
  return (
    <div className="flex w-20 flex-col items-center leading-none">
      <span className="font-mono text-2xl font-black">
        {home}–{away}
      </span>
      {status && <span className="mt-1 text-[11px] font-bold uppercase text-red-600">{status}</span>}
      {sub && <span className="mt-0.5 text-[10px] font-semibold text-stone-500">{sub}</span>}
    </div>
  );
}

export default function KnockoutScreen({ knockout, onAdvance, onReset }: Props) {
  const { user, current, outcome, rounds } = knockout;
  const activeOpp = rounds[current]?.opponent ?? null;

  const [revealedRound, setRevealedRound] = useState(-1);
  const [revealCode, setRevealCode] = useState(randomCode);
  const [playing, setPlaying] = useState<KoResult | null>(null);
  const [liveMinute, setLiveMinute] = useState(0);
  const [auto, setAuto] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const revealed = revealedRound === current;

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

  // Keep latest callback/flags without restarting the clock on every render.
  const advanceRef = useRef(onAdvance);
  const facedRef = useRef(knockout.faced);
  const currentRef = useRef(current);
  const autoRef = useRef(auto);
  useEffect(() => {
    advanceRef.current = onAdvance;
    facedRef.current = knockout.faced;
    currentRef.current = current;
    autoRef.current = auto;
  });

  // Run the live clock for the playing match, then record + advance.
  useEffect(() => {
    if (!playing) return;
    const res = playing;
    const max = maxMinute(res.decided);
    setLiveMinute(0);
    let m = 0;
    let done: number | undefined;
    const id = window.setInterval(
      () => {
        m += 1;
        setLiveMinute(m);
        if (m >= max) {
          window.clearInterval(id);
          done = window.setTimeout(() => {
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
          }, 1200);
        }
      },
      autoRef.current ? 20 : 45,
    );
    return () => {
      window.clearInterval(id);
      if (done) window.clearTimeout(done);
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
        {KO_ROUNDS.map((name, i) => {
          const r = rounds[i];
          const opp = r?.opponent ?? null;
          const isActive = i === current && outcome === 'alive';
          const isPlaying = isActive && !!playing;
          const played = !!r?.result;

          // Centre score / status block.
          let center: ReactNode;
          if (isPlaying) {
            const res = playing!;
            const max = maxMinute(res.decided);
            const shown = res.result.events.filter((e) => e.minute <= liveMinute);
            const h = shown.filter((e) => e.side === 'home').length;
            const a = shown.filter((e) => e.side === 'away').length;
            const atEnd = liveMinute >= max;
            const status = !atEnd
              ? `${liveMinute}'`
              : res.decided === 'reg'
                ? 'FT'
                : res.decided === 'aet'
                  ? 'a.e.t.'
                  : 'pens';
            const sub = atEnd && res.decided === 'pens' && res.pens ? `${res.pens.user}–${res.pens.opp} pens` : undefined;
            center = <Score home={h} away={a} status={status} sub={sub} />;
          } else if (played) {
            const res = r!.result!;
            const tag = r!.decided === 'aet' ? 'a.e.t.' : r!.decided === 'pens' ? 'pens' : undefined;
            const sub = r!.decided === 'pens' && r!.pens ? `${r!.pens.user}–${r!.pens.opp} pens` : tag;
            center = <Score home={res.homeGoals} away={res.awayGoals} sub={sub} />;
          } else {
            center = <span className="w-20 text-center text-sm font-bold uppercase text-stone-400">vs</span>;
          }

          // Right-hand status badge.
          let badge: ReactNode = null;
          if (played) {
            badge = (
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                  r!.userWon ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {r!.userWon ? 'Won' : 'Lost'}
              </span>
            );
          } else if (isActive && !isPlaying && revealed) {
            badge = <span className="text-[11px] font-bold uppercase text-red-600">Up next</span>;
          }

          const scrambleCode = isActive && !revealed && !isPlaying ? revealCode : undefined;

          return (
            <div
              key={name}
              className={`rounded-lg border p-4 transition ${
                isActive
                  ? 'border-stone-900 bg-white shadow-sm'
                  : played
                    ? 'border-stone-200 bg-white'
                    : 'border-dashed border-stone-300 bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                  {name.toUpperCase()}
                </span>
                {badge}
              </div>

              <div className="mt-3 flex items-center justify-center gap-4">
                <TeamChip team={user} />
                {center}
                <TeamChip team={opp} scrambleCode={scrambleCode} />
              </div>

              {isPlaying && (
                <div className="mt-3 rounded bg-stone-50 p-2">
                  <div className="mb-2 h-1 w-full overflow-hidden rounded bg-stone-200">
                    <div
                      className="h-full bg-red-600 transition-[width] duration-100"
                      style={{ width: `${(Math.min(liveMinute, maxMinute(playing!.decided)) / maxMinute(playing!.decided)) * 100}%` }}
                    />
                  </div>
                  <GoalList
                    events={playing!.result.events.filter((e) => e.minute <= liveMinute)}
                    home={user}
                    away={activeOpp ?? { code: '' }}
                    live={liveMinute < maxMinute(playing!.decided)}
                  />
                </div>
              )}

              {isActive && !isPlaying && (
                <div className="mt-3 flex items-center justify-center gap-3">
                  {revealed ? (
                    <>
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
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-stone-500">Drawing your opponent…</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {outcome === 'champion' && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-6 text-center">
          <Trophy size={48} className="mx-auto text-amber-500" strokeWidth={1.5} />
          <p className="mt-2 text-2xl font-black text-amber-700">World Cup Champions! 🏆</p>
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
    </div>
  );
}
