import type { UserMatch } from '../../domain/run';
import { liveMatchView, resultTag } from '../matchView';
import { ResultTag } from '../matchUi';
import MatchdayCard from '../MatchdayCard';

/** A settled group match rendered as a finished card (used before the standings). */
export default function GroupResultCard({ m, i, userRating }: { m: UserMatch; i: number; userRating: number }) {
  const ug = m.result.homeGoals;
  const og = m.result.awayGoals;
  return (
    <MatchdayCard
      label={`Matchday ${i + 1}`}
      tag={<ResultTag {...resultTag({ user: ug, opp: og })} />}
      userRating={userRating}
      oppName={m.opp.name}
      oppCode={m.opp.code}
      oppYear={m.opp.year}
      oppRating={m.opp.strength.overall}
      view={liveMatchView({
        playing: false,
        userSide: 'home',
        liveMinute: 90,
        liveMax: 90,
        clockLabel: '',
        finished: { userGoals: ug, oppGoals: og, status: 'Full time', statusDim: true, events: m.result.events },
      })}
      userSide="home"
      playing={false}
      clockLabel=""
    />
  );
}
