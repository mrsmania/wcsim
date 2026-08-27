import { useRef } from 'react';
import type { MatchEvent } from '../domain/match';
import { USER_SIDE } from './matchView';

/** Chronological list of goal events for a match, or an empty-state line. The
 *  user's XI is always the home side (see `USER_SIDE`), so goals on that side are
 *  tagged "You" (pitch green) and the rest carry the opponent's short code.
 *
 *  `userCode` is the exception, and it exists for one screen: a versus room where a
 *  knocked-out player watches two OTHER people play (P24). Neither side is theirs, so the
 *  home side is named rather than called "You", and it loses the green with it. */
export default function GoalList({
  events,
  oppCode,
  userCode,
  live,
}: {
  events: MatchEvent[];
  /** Which event side belongs to the user's XI. */
  /** Opponent's short/flag code, shown on opponent goals. */
  oppCode: string;
  /** A label for the HOME side when it is not the viewer's own XI. */
  userCode?: string;
  /** True while the match is still being played (pre full-time). */
  live?: boolean;
}) {
  // Only goals that arrive AFTER this feed's first render are new, and only those get
  // the pop. Everything already there on the first render is history: a settled card,
  // a round review, a reload mid-tournament, or the finished card that replaces the
  // live one at the whistle. Without this baseline every row re-animates whenever a
  // feed mounts, which is what made a finished result appear to jump. It has to be a
  // ref rather than state, because the decision is needed in the same render that
  // adds the row.
  const staticUntil = useRef(events.length);
  // A shorter list means this feed is showing a different match (a card reused for
  // the next one), so re-baseline instead of animating the whole new list.
  if (events.length < staticUntil.current) staticUntil.current = events.length;

  if (events.length === 0) {
    return (
      <p className="py-1 text-center text-xs text-muted">{live ? 'No goals yet…' : 'No goals'}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((e, i) => {
        const isUser = e.side === USER_SIDE && userCode === undefined;
        return (
          <li
            key={i}
            className={`flex items-center gap-[11px] text-[13.5px] ${
              i >= staticUntil.current ? 'animate-goal-pop' : ''
            }`}
          >
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
              className={`ml-0.5 font-mono text-[10px] ${isUser ? 'text-pitch-ink' : 'text-muted'}`}
            >
              {isUser ? 'You' : e.side === USER_SIDE ? userCode : oppCode}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
