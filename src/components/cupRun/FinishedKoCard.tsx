import type { MatchEvent, ShootoutResult } from '../../domain/match';
import type { KoDecided } from '../../domain/knockout';
import { koFinishedStatus, koResultLabel, liveMatchView } from '../matchView';
import { maxMinute, ResultTag } from '../matchUi';
import MatchdayCard from '../MatchdayCard';

/** A finished knockout tie rendered as a settled card (goal feed + shootout). Built
 *  from primitives so it serves both the just-played tie (kept above the boost pick)
 *  and a past-round review opened from the ladder. */
export default function FinishedKoCard({
  roundName,
  oppName,
  oppCode,
  oppYear,
  oppRating,
  userRating,
  userGoals,
  oppGoals,
  decided,
  events,
  pens,
  userWon,
}: {
  roundName: string;
  oppName: string;
  oppCode: string;
  oppYear?: number;
  oppRating?: number;
  userRating: number;
  userGoals: number;
  oppGoals: number;
  decided: KoDecided;
  events: MatchEvent[];
  pens?: ShootoutResult;
  userWon: boolean;
}) {
  const liveMax = maxMinute(decided);
  const { status, statusDim } = koFinishedStatus(decided);
  const penKicks = decided === 'pens' ? pens?.kicks : undefined;
  return (
    <MatchdayCard
      label={roundName}
      tag={<ResultTag kind={userWon ? 'w' : 'l'} label={koResultLabel(userWon, decided)} />}
      userRating={userRating}
      oppName={oppName}
      oppCode={oppCode}
      oppYear={oppYear}
      oppRating={oppRating ?? 0}
      view={liveMatchView({
        playing: false,
        userSide: 'home',
        liveMinute: liveMax,
        liveMax,
        clockLabel: '',
        finished: { userGoals, oppGoals, status, statusDim, events },
      })}
      userSide="home"
      playing={false}
      clockLabel=""
      penKicks={penKicks}
      penShown={penKicks?.length ?? 0}
      showShootout={!!penKicks}
    />
  );
}
