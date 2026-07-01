import Flag from './Flag';
import { RatingChip } from './matchUi';

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
  /** Overall ratings; shown as a small chip next to each team (desktop). */
  homeElo?: number;
  awayElo?: number;
}

/** A compact one-line match row: home — score — away. */
export default function FixtureRow({ home, away, score, homeElo, awayElo }: Props) {
  const tint = home.isUser || away.isUser ? 'bg-pitch/[0.06]' : '';
  const scoreText = score ? `${score.home}–${score.away}` : 'v';
  const yr = 'shrink-0 font-mono text-[11px] font-medium text-muted';

  return (
    <div className={`flex items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm ${tint}`}>
      <span className={`flex flex-1 items-center justify-end gap-2 truncate ${home.isUser ? 'font-black' : 'font-medium'}`}>
        {homeElo != null && <RatingChip value={homeElo} />}
        <span className="truncate">{home.name}</span>
        {home.year && <span className={yr}>{home.year}</span>}
        <Flag code={home.code} isUser={home.isUser} className="h-4 w-6 shrink-0" />
      </span>
      <span className="flex w-14 shrink-0 flex-col items-center leading-none sm:w-16">
        <span className="rounded-[5px] bg-chalk px-2.5 py-1 font-mono font-bold text-ink">{scoreText}</span>
      </span>
      <span className={`flex flex-1 items-center gap-2 truncate ${away.isUser ? 'font-black' : 'font-medium'}`}>
        <Flag code={away.code} isUser={away.isUser} className="h-4 w-6 shrink-0" />
        <span className="truncate">{away.name}</span>
        {away.year && <span className={yr}>{away.year}</span>}
        {awayElo != null && <RatingChip value={awayElo} />}
      </span>
      {/* Empty trailing column, preserving the row's grid width and score centring. */}
      <span className="flex w-4 items-center justify-center text-muted" />
    </div>
  );
}
