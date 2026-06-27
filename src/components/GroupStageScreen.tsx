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
  type Fixture,
  type GroupState,
  type MatchdayResult,
} from '../domain/tournament';
import { ArrowRight, ChevronDown, ChevronRight, FastForward, Pause, Play } from 'lucide-react';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import Flag from './Flag';
import GoalList from './GoalList';
import TournamentSummary from './TournamentSummary';

interface Props {
  group: GroupState;
  formation: Formation;
  filled: Filled;
  onRecordMatchday: (results: MatchdayResult[]) => void;
  onReset: () => void;
  onEnterKnockout: () => void;
}

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];

// --- compact fixture row -------------------------------------------------

function FixtureRow({
  group,
  f,
  score,
  status,
  expandable,
  expanded,
  onToggle,
}: {
  group: GroupState;
  f: Fixture;
  /** Live/override score shown instead of the recorded result. */
  score?: { home: number; away: number };
  /** Small status under the score, e.g. a minute or 'FT'. */
  status?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const home = teamById(group, f.homeId);
  const away = teamById(group, f.awayId);
  const tint = home.isUser || away.isUser ? 'bg-red-50' : '';
  const scoreText = score
    ? `${score.home}–${score.away}`
    : f.result
      ? `${f.result.homeGoals}–${f.result.awayGoals}`
      : 'v';
  const inner = (
    <>
      <span className={`flex flex-1 items-center justify-end gap-2 truncate ${home.isUser ? 'font-black' : 'font-medium'}`}>
        <span className="truncate">{home.name}</span>
        {home.year && <span className="hidden text-[11px] font-normal text-stone-400 sm:inline">{home.year}</span>}
        <Flag code={home.code} isUser={home.isUser} className="h-4 w-6 shrink-0" />
      </span>
      <span className="flex w-12 shrink-0 flex-col items-center leading-none sm:w-14">
        <span className="font-mono font-bold">{scoreText}</span>
        {status && <span className="mt-0.5 text-[9px] font-bold text-red-600">{status}</span>}
      </span>
      <span className={`flex flex-1 items-center gap-2 truncate ${away.isUser ? 'font-black' : 'font-medium'}`}>
        <Flag code={away.code} isUser={away.isUser} className="h-4 w-6 shrink-0" />
        <span className="truncate">{away.name}</span>
        {away.year && <span className="hidden text-[11px] font-normal text-stone-400 sm:inline">{away.year}</span>}
      </span>
      <span className="flex w-4 items-center justify-center text-stone-400">
        {expandable ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
      </span>
    </>
  );
  const cls = `flex items-center gap-2 rounded px-2 py-1.5 text-sm ${tint}`;
  return expandable && onToggle ? (
    <button onClick={onToggle} className={`${cls} w-full text-left`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// --- screen --------------------------------------------------------------

export default function GroupStageScreen({
  group,
  formation,
  filled,
  onRecordMatchday,
  onReset,
  onEnterKnockout,
}: Props) {
  const opponents = group.teams.filter((t) => !t.isUser);
  const finished = isGroupFinished(group);

  // Opponent draw intro: flags scramble, then settle on the real opponents.
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

  const [playing, setPlaying] = useState<{ matchday: number; results: MatchdayResult[] } | null>(null);
  const [openMatchdays, setOpenMatchdays] = useState<Set<number>>(() => new Set());
  const [auto, setAuto] = useState(false);
  const [liveMinute, setLiveMinute] = useState(0);

  const toggleOpen = (md: number) =>
    setOpenMatchdays((prev) => {
      const next = new Set(prev);
      if (next.has(md)) next.delete(md);
      else next.add(md);
      return next;
    });
  const [confirmReset, setConfirmReset] = useState(false);

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
      setOpenMatchdays((prev) => new Set(prev).add(md));
      setPlaying({ matchday: md, results });
    },
    [group],
  );

  // Keep latest callback/flag without restarting the clock on every render.
  const recordRef = useRef(onRecordMatchday);
  const autoRef = useRef(auto);
  useEffect(() => {
    recordRef.current = onRecordMatchday;
    autoRef.current = auto;
  });

  // Run the live clock for the playing matchday, then record results + advance.
  useEffect(() => {
    if (!playing) return;
    const current = playing;
    setLiveMinute(0);
    let m = 0;
    let done: number | undefined;
    const id = window.setInterval(
      () => {
        m += 1;
        setLiveMinute(m);
        if (m >= 90) {
          window.clearInterval(id);
          done = window.setTimeout(() => {
            recordRef.current(current.results);
            setPlaying(null);
          }, 700);
        }
      },
      autoRef.current ? 22 : 50,
    );
    return () => {
      window.clearInterval(id);
      if (done) window.clearTimeout(done);
    };
  }, [playing]);

  // Auto mode: play the next matchday whenever idle.
  useEffect(() => {
    if (!auto || revealing || playing || finished) return;
    const t = window.setTimeout(() => play(group.matchday), 700);
    return () => window.clearTimeout(t);
  }, [auto, revealing, playing, finished, group.matchday, play]);

  // --- opponent draw view ---
  if (revealing) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-12">
        <div className="text-center">
          <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">GROUP DRAW</div>
          <h2 className="text-2xl font-black">Your group</h2>
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center sm:gap-8">
          <div className="flex w-24 flex-col items-center gap-2">
            <Flag code="" isUser className="h-12 w-[4.5rem]" />
            <span className="text-center text-sm font-black">Your XI</span>
          </div>
          {opponents.map((o, i) => (
            <div
              key={o.id}
              className={`flex w-24 flex-col items-center gap-1 ${settled ? 'animate-settle' : ''}`}
            >
              <Flag code={revealCodes[i] ?? ''} className="h-12 w-[4.5rem]" />
              <span className="text-center text-sm font-bold leading-tight">{settled ? o.name : '…'}</span>
              {settled && o.year && <span className="text-xs font-semibold text-red-600">WC {o.year}</span>}
            </div>
          ))}
        </div>
        {settled ? (
          <button
            onClick={() => setRevealing(false)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
          >
            Continue to group stage
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        ) : (
          <p className="text-sm font-semibold text-stone-500">Drawing opponents…</p>
        )}
      </div>
    );
  }

  const table = standings(group);
  const advanced = finished && userAdvanced(group);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3 border-b-2 border-stone-900 pb-2">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">GROUP STAGE</div>
          <h2 className="text-2xl font-black leading-tight">Group of 4 · top 2 advance</h2>
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

      {/* Standings */}
      <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
        <div className="grid grid-cols-[20px_minmax(0,1fr)_34px_38px] sm:grid-cols-[24px_minmax(0,1fr)_28px_28px_28px_28px_36px_36px] items-center gap-1 border-b border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-stone-500">
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
            className={`grid grid-cols-[20px_minmax(0,1fr)_34px_38px] sm:grid-cols-[24px_minmax(0,1fr)_28px_28px_28px_28px_36px_36px] items-center gap-1 border-b border-stone-100 px-3 py-2 text-sm last:border-b-0 ${
              i < 2 ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'
            } ${s.team.isUser ? 'bg-red-50' : ''}`}
          >
            <span className="font-mono text-stone-500">{i + 1}</span>
            <span className="flex items-center gap-2 truncate">
              <Flag code={s.team.code} isUser={s.team.isUser} className="h-4 w-6" />
              <span className={`truncate ${s.team.isUser ? 'font-black' : 'font-semibold'}`}>{s.team.name}</span>
              {s.team.year && <span className="shrink-0 text-[11px] text-stone-400">{s.team.year}</span>}
            </span>
            <span className="hidden text-center font-mono sm:block">{s.played}</span>
            <span className="hidden text-center font-mono sm:block">{s.won}</span>
            <span className="hidden text-center font-mono sm:block">{s.drawn}</span>
            <span className="hidden text-center font-mono sm:block">{s.lost}</span>
            <span className="text-center font-mono">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
            <span className="text-center font-mono font-black">{s.points}</span>
          </div>
        ))}
      </div>

      {/* Fixtures (accordion) */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: GROUP_MATCHDAYS }, (_, idx) => idx + 1).map((md) => {
          const fx = fixturesForMatchday(group, md);
          const userFx = fx.find((f) => teamById(group, f.homeId).isUser || teamById(group, f.awayId).isUser)!;
          const otherFx = fx.find((f) => f !== userFx)!;
          const isPlaying = playing?.matchday === md;
          const open = openMatchdays.has(md);
          const userHome = teamById(group, userFx.homeId);
          const userAway = teamById(group, userFx.awayId);

          // Live result (during play) or recorded result for each fixture.
          const live = isPlaying ? playing! : null;
          const userResult =
            live?.results.find((r) => r.homeId === userFx.homeId && r.awayId === userFx.awayId)?.result ??
            userFx.result;
          const otherResult =
            live?.results.find((r) => r.homeId === otherFx.homeId && r.awayId === otherFx.awayId)?.result ??
            otherFx.result;

          // Goal feed + live score shown directly on / under the Your XI row.
          let feedEvents: MatchEvent[] | null = null;
          let userScore: { home: number; away: number } | undefined;
          let userStatus: string | undefined;
          if (isPlaying && userResult) {
            const shown = userResult.events.filter((e) => e.minute <= liveMinute);
            feedEvents = shown;
            userScore = {
              home: shown.filter((e) => e.side === 'home').length,
              away: shown.filter((e) => e.side === 'away').length,
            };
            userStatus = liveMinute >= 90 ? 'FT' : `${liveMinute}'`;
          } else if (open && userFx.result) {
            feedEvents = userFx.result.events;
          }

          const otherScore =
            isPlaying && otherResult ? { home: otherResult.homeGoals, away: otherResult.awayGoals } : undefined;

          return (
            <div key={md}>
              <div className="mb-1 text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                MATCHDAY {md}
                {md === group.matchday && !finished && !isPlaying && (
                  <span className="ml-2 text-red-600">· up next</span>
                )}
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-1">
                <FixtureRow
                  group={group}
                  f={userFx}
                  score={userScore}
                  status={userStatus}
                  expandable={!!userFx.result && !isPlaying}
                  expanded={open}
                  onToggle={() => toggleOpen(md)}
                />
                {feedEvents && (
                  <div className="mt-1 rounded bg-stone-50 p-2">
                    {isPlaying && (
                      <div className="mb-2 h-1 w-full overflow-hidden rounded bg-stone-200">
                        <div className="h-full bg-red-600" style={{ width: `${(liveMinute / 90) * 100}%` }} />
                      </div>
                    )}
                    <GoalList
                      events={feedEvents}
                      home={userHome}
                      away={userAway}
                      live={isPlaying && liveMinute < 90}
                    />
                  </div>
                )}
                <FixtureRow group={group} f={otherFx} score={otherScore} status={isPlaying ? 'FT' : undefined} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls / result */}
      {finished ? (
        <>
          <div className="rounded-xl border border-dashed border-stone-400 bg-white/60 p-5 text-center">
            <p className={`text-xl font-black ${advanced ? 'text-emerald-600' : 'text-stone-700'}`}>
              {advanced ? 'You advanced to the knockouts! 🎉' : 'Eliminated in the group stage.'}
            </p>
            {advanced ? (
              <button
                onClick={onEnterKnockout}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
              >
                Enter the knockouts
                <ArrowRight size={18} strokeWidth={2.5} />
              </button>
            ) : (
              <p className="mt-1 text-sm text-stone-500">
                Better luck next time — draft a new XI to try again.
              </p>
            )}
          </div>
          {!advanced && <TournamentSummary formation={formation} filled={filled} />}
        </>
      ) : (
        <div className="flex items-center justify-center gap-3">
          {!playing && !auto && (
            <button
              onClick={() => play(group.matchday)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
            >
              <Play size={16} fill="currentColor" strokeWidth={0} />
              Play Matchday {group.matchday}
            </button>
          )}
          {playing && <span className="text-sm font-semibold text-stone-500">Match in progress…</span>}
          <button
            onClick={() => setAuto((a) => !a)}
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
      )}
    </div>
  );
}
