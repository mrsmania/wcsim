import type { MatchEvent } from '../domain/match';

/** Minimal team shape needed to label which side a goal belongs to. */
interface FeedTeam {
  code: string;
}

/** Chronological list of goal events for a match, or an empty-state line. */
export default function GoalList({
  events,
  home,
  away,
  live,
}: {
  events: MatchEvent[];
  home: FeedTeam;
  away: FeedTeam;
  /** True while the match is still being played (pre full-time). */
  live?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="mt-2 text-center text-xs text-muted">{live ? 'No goals yet…' : 'No goals'}</p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {events.map((e, i) => (
        <li key={i} className="flex animate-goal-pop items-center gap-2.5 text-[13px]">
          <span className="w-8 font-mono text-muted">{e.minute}'</span>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pitch/10 text-[11px]">⚽</span>
          <span className="font-bold text-ink">{e.scorer}</span>
          <span className="text-muted">({e.side === 'home' ? home.code : away.code})</span>
        </li>
      ))}
    </ul>
  );
}
