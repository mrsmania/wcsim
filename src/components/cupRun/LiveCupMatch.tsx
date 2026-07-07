import type { MatchEvent, ShootoutResult } from '../../domain/match';
import type { KoDecided } from '../../domain/knockout';
import type { MatchSpeed } from '../../domain/clock';
import type { GroupTeam } from '../../domain/tournament';
import { useMatchClock, FT_HOLD_MS, KO_END_HOLD_MS } from '../../hooks/useMatchClock';
import { koEndLabel, liveMatchView } from '../matchView';
import { maxMinute, ResultTag } from '../matchUi';
import MatchdayCard from '../MatchdayCard';

/** One match revealed minute by minute with the shared clock + goal feed (the same
 *  playback the main game uses). The user is always the home side. Keyed by the
 *  caller so each match remounts and restarts its own clock. Fires `onEnd` once the
 *  reveal (and any shootout) finishes. */
export default function LiveCupMatch({
  label,
  opp,
  userRating,
  events,
  decided,
  pens,
  speed,
  onEnd,
}: {
  label: string;
  opp: GroupTeam;
  userRating: number;
  events: MatchEvent[];
  decided: KoDecided;
  pens?: ShootoutResult;
  speed: MatchSpeed;
  onEnd: () => void;
}) {
  const liveMax = maxMinute(decided);
  const { liveMinute, clockLabel, penShown } = useMatchClock({
    active: true,
    speed,
    maxMinute: liveMax,
    endLabel: koEndLabel(decided),
    penKicks: decided === 'pens' ? pens?.kicks : undefined,
    endHoldMs: decided === 'reg' ? FT_HOLD_MS : KO_END_HOLD_MS,
    onEnd,
  });
  const view = liveMatchView({
    playing: true,
    userSide: 'home',
    liveMinute,
    liveMax,
    clockLabel,
    playingEvents: events,
  });
  const penKicks = decided === 'pens' ? pens?.kicks : undefined;
  const showShootout = !!penKicks && liveMinute >= liveMax;
  return (
    <MatchdayCard
      label={label}
      tag={<ResultTag kind="next" label="Live now" />}
      userRating={userRating}
      oppName={opp.name}
      oppCode={opp.code}
      oppYear={opp.year}
      oppRating={opp.strength.overall}
      view={view}
      userSide="home"
      playing
      clockLabel={clockLabel}
      penKicks={penKicks}
      penShown={penShown}
      showShootout={showShootout}
    />
  );
}
