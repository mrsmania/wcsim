import type { MatchEvent } from '../domain/match';

/** Chronological list of goal events for a match, or an empty-state line. The
 *  user's XI is always shown as the home side, so goals on `userSide` are tagged
 *  "You" (pitch green) and the rest carry the opponent's short code. */
export default function GoalList({
  events,
  userSide,
  oppCode,
  live,
}: {
  events: MatchEvent[];
  /** Which event side belongs to the user's XI. */
  userSide: 'home' | 'away';
  /** Opponent's short/flag code, shown on opponent goals. */
  oppCode: string;
  /** True while the match is still being played (pre full-time). */
  live?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="py-1 text-center text-xs text-muted">{live ? 'No goals yet…' : 'No goals'}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((e, i) => {
        const isUser = e.side === userSide;
        return (
          <li key={i} className="flex animate-goal-pop items-center gap-[11px] text-[13.5px]">
            <span className="w-[30px] shrink-0 font-mono text-xs text-muted">{e.minute}'</span>
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-chalk">
              {/* CSS football: a tiny checkered disc (matches the turf-flat comp). */}
              <span
                className="h-[9px] w-[9px] rounded-full"
                style={{
                  background:
                    'repeating-conic-gradient(var(--color-ink) 0 25%, #fff 0 50%)',
                  backgroundSize: '5px 5px',
                  boxShadow: 'inset 0 0 0 1px var(--color-ink)',
                }}
              />
            </span>
            <span className="font-semibold text-ink">{e.scorer}</span>
            <span
              className={`ml-0.5 font-mono text-[10px] ${isUser ? 'text-pitch' : 'text-muted'}`}
            >
              {isUser ? 'You' : oppCode}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
