import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PenKick } from '../domain/match';
import type { MatchView } from './matchView';
import GoalList from './GoalList';
import { CARD, CardDisclosure, FixtureHead, LiveLine, ShootoutFeed } from './matchUi';

interface Props {
  /** Round/matchday label ("Matchday 2", "Semi-final"). */
  label: string;
  /** Tag beside the label (result/live/up-next), or null for none. */
  tag: ReactNode;
  /** The user's XI overall rating (shown as a chip in the header). Omitted in a
   *  hidden-ratings versus room (P5), where the chips are the numbers. */
  userRating?: number;
  /** Opponent identity for the fixture header. */
  oppName: string;
  oppCode: string;
  oppYear?: number;
  oppRating?: number;
  /** The derived score/status/feed view-model for this card. */
  view: MatchView;
  /** Which event side is the user's XI (home in the knockout, either in a group). */
  /** True while this card is the one being revealed (adds the pitch top border). */
  playing: boolean;
  /** Live clock label used to build the foot-of-feed live line. */
  clockLabel: string;
  /** Penalty shootout to show under the feed (knockout ties only). */
  penKicks?: PenKick[];
  /** How many kicks to reveal (all when settled; the running count while live). */
  penShown?: number;
  /** Whether the shootout sheet should be visible yet (gated on reaching full time). */
  showShootout?: boolean;
  /** Collapse the goal feed behind a toggle, so the card is just its result. Set on
   *  a settled group card: three of them stack up on one screen and the scoreline is
   *  the part still worth reading, while the feed is what you have already watched. */
  collapsible?: boolean;
}

/** One match card: the fixture header plus the live/settled goal feed (and, in the
 *  knockout, the penalty shootout). Shared by the group and knockout screens; the
 *  auto-scroll tail lives at each screen's scroll root, not inside this card.
 *  With `collapsible` the feed starts folded away behind a "Goals" strip, leaving
 *  the result. */
export default function MatchdayCard({
  label,
  tag,
  userRating,
  oppName,
  oppCode,
  oppYear,
  oppRating,
  view,
  playing,
  clockLabel,
  penKicks,
  penShown,
  showShootout,
  collapsible,
}: Props) {
  const [feedOpen, setFeedOpen] = useState(false);
  const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;
  const events = view.feedEvents;
  const hasFeed = events !== null;
  // Keep the newest line in view inside the card's OWN scroller. The feed is capped at
  // 230px, and once it overflows the page-level follow (`useFollowBottom`) has nothing
  // left to do: the document stops growing, so every line after that lands below this
  // box's fold. Worst in a penalty shootout, which is taller than the cap on its own -
  // the feed simply stopped moving once the third kick pushed the scrollbar in.
  //
  // Two things this must not do. It cannot key off `view.live`, which is false from full
  // time and so would miss the entire shootout (the kicks arrive after the clock stops);
  // it keys off `playing`, i.e. "this card is the one being revealed", which is true
  // throughout and false on a settled card, where the feed should start at the top. And
  // it scrolls instantly rather than smoothly: a smooth scroll reports intermediate
  // positions far from the bottom, which the handler below would read as the user having
  // scrolled away, and the follow would switch itself off mid-shootout.
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedStuck = useRef(true);
  useEffect(() => {
    const el = feedRef.current;
    if (!el || !playing || !feedStuck.current) return;
    el.scrollTop = el.scrollHeight;
  }, [playing, events?.length, penShown, showShootout]);
  // A goalless match has nothing to put behind a toggle, so it collapses to the
  // header outright rather than offering a "Goals" strip that opens on "No goals".
  const toggleable = !!collapsible && hasFeed && events.length > 0;
  const showFeed = hasFeed && (!collapsible || (toggleable && feedOpen));

  return (
    <div className="mt-[26px]">
      <div className="mb-[9px] flex items-center gap-2.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        {tag}
      </div>
      <div
        className={`overflow-hidden ${CARD} ${
 playing ? 'border-t-[3px] border-t-pitch' : ''
 }`}
      >
        <FixtureHead
          oppName={oppName}
          oppCode={oppCode}
          oppYear={oppYear}
          score={view.score}
          status={view.status}
          statusDim={view.statusDim}
          userRating={userRating}
          oppRating={oppRating}
        />
        {toggleable && (
          <CardDisclosure label="Goals" open={feedOpen} onToggle={() => setFeedOpen((v) => !v)} />
        )}
        {showFeed && (
          <div
            ref={feedRef}
            onScroll={(e) => {
              // Scrolling up inside the feed pauses the follow (you are reading back);
              // returning to the bottom resumes it.
              const el = e.currentTarget;
              feedStuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3"
          >
            <GoalList
              events={events ?? []}
              oppCode={oppCode}
              live={view.live}
            />
            {showShootout && penKicks && (
              <ShootoutFeed kicks={penKicks} shown={penShown ?? 0} />
            )}
            {view.live && <LiveLine label={liveLabel} />}
          </div>
        )}
      </div>
    </div>
  );
}
