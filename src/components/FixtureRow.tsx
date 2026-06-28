import { ChevronDown, ChevronRight } from 'lucide-react';
import Flag from './Flag';

/** Minimal team shape a fixture row needs. */
export interface FixtureTeam {
  name: string;
  code: string;
  year?: number;
  isUser?: boolean;
}

interface Props {
  home: FixtureTeam;
  away: FixtureTeam;
  /** Score shown between the teams; omitted renders a "v". */
  score?: { home: number; away: number };
  /** Small status under the score (a minute, 'FT', 'pens', …). */
  status?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Render the away side as a scrambling mystery: this flag code + "…". */
  scrambleCode?: string;
  /** Render the away side as an undrawn opponent ("?"). */
  awayUnknown?: boolean;
  /** Overall ratings; shown as a pill when hovering that team (desktop). */
  homeElo?: number;
  awayElo?: number;
}

/** A small dark pill revealed on hover of a team (desktop only — no touch hover). */
function EloPill({ elo, group }: { elo: number; group: 'home' | 'away' }) {
  return (
    <span
      className={`hidden shrink-0 rounded bg-stone-800 px-1 font-mono text-[10px] font-bold leading-tight text-white ${
        group === 'home' ? 'group-hover/home:inline-block' : 'group-hover/away:inline-block'
      }`}
    >
      {elo}
    </span>
  );
}

/** A compact one-line match row: home — score — away, optionally expandable. */
export default function FixtureRow({
  home,
  away,
  score,
  status,
  expandable,
  expanded,
  onToggle,
  scrambleCode,
  awayUnknown,
  homeElo,
  awayElo,
}: Props) {
  const tint = home.isUser || away.isUser ? 'bg-red-50' : '';
  const scoreText = score ? `${score.home}–${score.away}` : 'v';

  const awayContent = awayUnknown ? (
    <>
      <span className="flex h-4 w-6 shrink-0 items-center justify-center rounded-[3px] bg-stone-200 text-[10px] font-black text-stone-400">
        ?
      </span>
      <span className="truncate text-stone-400">?</span>
    </>
  ) : scrambleCode !== undefined ? (
    <>
      <Flag code={scrambleCode} className="h-4 w-6 shrink-0" />
      <span className="truncate">…</span>
    </>
  ) : (
    <>
      <Flag code={away.code} isUser={away.isUser} className="h-4 w-6 shrink-0" />
      <span className="truncate">{away.name}</span>
      {away.year && <span className="shrink-0 text-[11px] font-normal text-stone-400">{away.year}</span>}
    </>
  );

  const showAwayElo = awayElo != null && !awayUnknown && scrambleCode === undefined;

  const inner = (
    <>
      <span className={`group/home flex flex-1 items-center justify-end gap-2 truncate ${home.isUser ? 'font-black' : 'font-medium'}`}>
        {homeElo != null && <EloPill elo={homeElo} group="home" />}
        <span className="truncate">{home.name}</span>
        {home.year && <span className="shrink-0 text-[11px] font-normal text-stone-400">{home.year}</span>}
        <Flag code={home.code} isUser={home.isUser} className="h-4 w-6 shrink-0" />
      </span>
      <span className="flex w-12 shrink-0 flex-col items-center leading-none sm:w-14">
        <span className="font-mono font-bold">{scoreText}</span>
        {status && <span className="mt-0.5 text-[9px] font-bold uppercase text-red-600">{status}</span>}
      </span>
      <span className={`group/away flex flex-1 items-center gap-2 truncate ${away.isUser ? 'font-black' : 'font-medium'}`}>
        {awayContent}
        {showAwayElo && <EloPill elo={awayElo} group="away" />}
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
