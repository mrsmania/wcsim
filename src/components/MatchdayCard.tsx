import type { ReactNode } from 'react';
import type { PenKick } from '../domain/match';
import type { MatchView } from './matchView';
import GoalList from './GoalList';
import { FixtureHead, LiveLine, ShootoutFeed } from './matchUi';

interface Props {
  /** Round/matchday label ("Matchday 2", "Semi-final"). */
  label: string;
  /** Tag beside the label (result/live/up-next), or null for none. */
  tag: ReactNode;
  /** The user's XI overall rating (shown as a chip in the header). */
  userRating: number;
  /** Opponent identity for the fixture header. */
  oppName: string;
  oppCode: string;
  oppYear?: number;
  oppRating: number;
  /** The derived score/status/feed view-model for this card. */
  view: MatchView;
  /** Which event side is the user's XI (home in the knockout, either in a group). */
  userSide: 'home' | 'away';
  /** True while this card is the one being revealed (adds the pitch top border). */
  playing: boolean;
  /** Force the pitch top border regardless of play state (the knockout final). */
  highlight?: boolean;
  /** Live clock label used to build the foot-of-feed live line. */
  clockLabel: string;
  /** Penalty shootout to show under the feed (knockout ties only). */
  penKicks?: PenKick[];
  /** How many kicks to reveal (all when settled; the running count while live). */
  penShown?: number;
  /** Whether the shootout sheet should be visible yet (gated on reaching full time). */
  showShootout?: boolean;
}

/** One match card: the fixture header plus the live/settled goal feed (and, in the
 *  knockout, the penalty shootout). Shared by the group and knockout screens; the
 *  auto-scroll tail lives at each screen's scroll root, not inside this card. */
export default function MatchdayCard({
  label,
  tag,
  userRating,
  oppName,
  oppCode,
  oppYear,
  oppRating,
  view,
  userSide,
  playing,
  highlight,
  clockLabel,
  penKicks,
  penShown,
  showShootout,
}: Props) {
  const liveLabel = clockLabel === 'HT' ? 'Half time' : `Live · ${clockLabel}`;
  const showFeed = view.feedEvents !== null;

  return (
    <div className="mt-[26px]">
      <div className="mb-[9px] flex items-center gap-2.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        {tag}
      </div>
      <div
        className={`overflow-hidden rounded-md border border-line bg-panel shadow-hard ${
          playing || highlight ? 'border-t-[3px] border-t-pitch' : ''
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
        {showFeed && (
          <div className="max-h-[230px] overflow-y-auto border-t border-line px-[18px] py-3">
            <GoalList
              events={view.feedEvents ?? []}
              userSide={userSide}
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
