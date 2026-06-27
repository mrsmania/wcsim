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
      {away.year && <span className="hidden text-[11px] font-normal text-stone-400 sm:inline">{away.year}</span>}
    </>
  );

  const inner = (
    <>
      <span className={`flex flex-1 items-center justify-end gap-2 truncate ${home.isUser ? 'font-black' : 'font-medium'}`}>
        <span className="truncate">{home.name}</span>
        {home.year && <span className="hidden text-[11px] font-normal text-stone-400 sm:inline">{home.year}</span>}
        <Flag code={home.code} isUser={home.isUser} className="h-4 w-6 shrink-0" />
      </span>
      <span className="flex w-12 shrink-0 flex-col items-center leading-none sm:w-14">
        <span className="font-mono font-bold">{scoreText}</span>
        {status && <span className="mt-0.5 text-[9px] font-bold uppercase text-red-600">{status}</span>}
      </span>
      <span className={`flex flex-1 items-center gap-2 truncate ${away.isUser ? 'font-black' : 'font-medium'}`}>
        {awayContent}
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
