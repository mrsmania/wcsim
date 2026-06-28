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
      <p className="mt-2 text-center text-xs text-stone-400">{live ? 'No goals yet…' : 'No goals'}</p>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {events.map((e, i) => (
        <li key={i} className="flex animate-goal-pop items-center gap-2 text-xs">
          <span className="w-7 text-right font-mono text-stone-500">{e.minute}'</span>
          <span className="text-sm">⚽</span>
          <span className="font-semibold">{e.scorer}</span>
          <span className="text-stone-400">({e.side === 'home' ? home.code : away.code})</span>
        </li>
      ))}
    </ul>
  );
}
