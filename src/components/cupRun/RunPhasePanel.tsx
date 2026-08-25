import { KO_ROUNDS } from '../../domain/knockout';
import type { KoMatch, RunState } from '../../domain/run';
import type { GroupTeam } from '../../domain/tournament';
import type { Boon } from '../../domain/boons';
import { Banner, CARD, PRIMARY_BTN } from '../matchUi';
import Flag from '../Flag';
import FinishedKoCard from './FinishedKoCard';
import BoostOffer from './BoostOffer';
import CaptainPicker from './CaptainPicker';
import RunEndPanel from './RunEndPanel';
import { OUTCOME_LABEL, koWinHeading, type Reward } from './types';

/** What a run shows when nothing is revealing: the tie just played, where the run stands,
 *  and whatever it is waiting for you to do (hygiene H85).
 *
 *  The phase tests went from five to ten as cards and questions were added, and two of
 *  them were the SAME condition rendered one after the other - the finished tie and its
 *  banner both keyed on "in the boost phase with a tie kept on screen". They are one
 *  block now, which is also what makes the pair impossible to separate by accident. */
export default function RunPhasePanel({
  run,
  lastKoMatch,
  endedKoRecord,
  userRating,
  reward,
  banking,
  boostRef,
  onPlayGroup,
  onPlayKo,
  onPickBoost,
  onAnswerChoice,
  onReroll,
  onReDraft,
  onReplay,
  onCareer,
}: {
  run: RunState;
  /** The knockout tie just played, kept on screen through the following boost pick. */
  lastKoMatch: { match: KoMatch; opp: GroupTeam; roundName: string } | null;
  /** The final tie of an ENDED run, rebuilt from history - `lastKoMatch` is cleared when
   *  a run ends. Null for a group-stage exit, which has no knockout tie. */
  endedKoRecord: Extract<RunState['history'][number], { stage: number }> | null;
  userRating: number;
  reward: Reward | null;
  banking: boolean;
  /** The boost card, scrolled into view when a run enters the boost phase. */
  boostRef: React.MutableRefObject<HTMLDivElement | null>;
  onPlayGroup: () => void;
  onPlayKo: () => void;
  onPickBoost: (b: Boon) => void;
  onAnswerChoice: (playerId: string) => void;
  onReroll: (next: RunState) => void;
  onReDraft: () => void;
  onReplay: () => void;
  onCareer: () => void;
}) {
  // One condition, not two: the finished tie and the banner that reads its result are the
  // same moment, and were tested separately for no reason.
  const kept = run.phase === 'boon' ? lastKoMatch : null;
  return (
    <>
      {kept && (
        <>
          <FinishedKoCard
            roundName={kept.roundName}
            oppName={kept.opp.name}
            oppCode={kept.opp.code}
            oppYear={kept.opp.year}
            oppRating={kept.opp.strength.overall}
            userRating={userRating}
            userGoals={kept.match.userGoals}
            oppGoals={kept.match.oppGoals}
            decided={kept.match.decided}
            events={kept.match.events}
            pens={kept.match.pens}
            userWon={kept.match.userWon}
          />
          <Banner
            champion
            eyebrow={kept.roundName}
            heading={koWinHeading(kept.match)}
            body={`Through to the ${KO_ROUNDS[run.koRound]}. Pick a boost below.`}
          />
        </>
      )}
      {run.phase === 'ended' && endedKoRecord && (
        <FinishedKoCard
          roundName={KO_ROUNDS[endedKoRecord.stage]}
          oppName={endedKoRecord.oppName}
          oppCode={endedKoRecord.oppCode}
          oppYear={endedKoRecord.oppYear}
          oppRating={endedKoRecord.oppRating}
          userRating={endedKoRecord.userRating}
          userGoals={endedKoRecord.userGoals}
          oppGoals={endedKoRecord.oppGoals}
          decided={endedKoRecord.decided ?? 'reg'}
          events={endedKoRecord.events}
          pens={endedKoRecord.pens}
          userWon={endedKoRecord.won}
        />
      )}
      {run.phase === 'ended' && run.outcome && (
        <Banner
          champion={run.outcome === 'champion'}
          eyebrow={
            run.outcome === 'champion'
              ? 'Full time · the Final'
              : `Knocked out · ${OUTCOME_LABEL[run.outcome]}`
          }
          heading={run.outcome === 'champion' ? 'World Cup Champions' : 'Knocked out'}
          body={
            run.outcome === 'champion'
              ? 'Your XI ran the tournament and lifted the cup.'
              : undefined
          }
        />
      )}
      <div ref={run.phase === 'boon' ? boostRef : undefined} className={`${CARD} p-5`}>
        {run.phase === 'group' && (
          <div className="text-center">
            <p className="mb-4 text-[13.5px] text-muted">
              Play the group stage. Finish in the top two to reach the knockouts.
            </p>
            <button onClick={onPlayGroup} className={PRIMARY_BTN}>
              Play group stage
            </button>
          </div>
        )}

        {/* A card that asked a question replaces the offer until it is answered (roadmap
            item 30). The run stays in the `boon` phase and holds the parked card, so a
            reload lands back here rather than losing it. */}
        {run.phase === 'boon' &&
          (run.pendingChoice ? (
            <CaptainPicker
              boonId={run.pendingChoice.boonId}
              xi={run.xi}
              onChoose={onAnswerChoice}
            />
          ) : (
            run.offer && (
              <BoostOffer
                offer={run.offer}
                nextOpponent={run.nextOpponent}
                roundName={KO_ROUNDS[run.koRound]}
                onPick={onPickBoost}
                rerollsLeft={run.rerollsLeft ?? 0}
                onReroll={() => onReroll(run)}
              />
            )
          ))}

        {run.phase === 'match' && run.nextOpponent && (
          <div className="text-center">
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {KO_ROUNDS[run.koRound]}
            </p>
            <p className="mb-4 inline-flex items-center gap-2 text-[15px] font-semibold">
              You <Flag code={run.nextOpponent.code} className="h-3.5 w-5" /> vs{' '}
              {run.nextOpponent.name}
            </p>
            <div>
              <button onClick={onPlayKo} className={PRIMARY_BTN}>
                Play {KO_ROUNDS[run.koRound]}
              </button>
            </div>
          </div>
        )}

        {run.phase === 'ended' && run.outcome && (
          <RunEndPanel
            score={run.score}
            reward={reward}
            banking={banking}
            onReDraft={onReDraft}
            onReplay={onReplay}
            onCareer={onCareer}
          />
        )}
      </div>
    </>
  );
}
