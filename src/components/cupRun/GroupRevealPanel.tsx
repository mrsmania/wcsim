import type { MatchSpeed } from '../../domain/clock';
import { KO_ROUNDS } from '../../domain/knockout';
import { groupAsOf, GROUP_MATCHDAYS, splitGroup } from '../../domain/tournament';
import type { GroupRecord, RunState } from '../../domain/run';
import type { Boon } from '../../domain/boons';
import { Banner, CARD, ordinal, PRIMARY_BTN } from '../matchUi';
import StandingsTable from '../StandingsTable';
import GroupDrawReveal from '../GroupDrawReveal';
import LiveCupMatch from './LiveCupMatch';
import GroupResultCard from './GroupResultCard';
import BoostOffer from './BoostOffer';
import type { Reveal } from './types';

/** The group stage as it reveals: the draw, then the table filling in behind it, then the
 *  three matchdays one at a time, then the outcome and the first boost (hygiene H85).
 *
 *  The "all three played" block was an inline IIFE - the only one left in the run screen -
 *  because it needed two locals. It is this component's tail now. */
export default function GroupRevealPanel({
  reveal,
  drawOpen,
  onDismissDraw,
  userRating,
  speed,
  onMatchEnd,
  onPickBoost,
  onReroll,
  onContinue,
}: {
  /** The group reveal in flight. Narrowed by the caller, so the draw, the table and the
   *  matchdays can all read it without re-testing `kind`. */
  reveal: Extract<Reveal, { kind: 'group' }>;
  /** The draw overlay: nothing behind it renders until it is dismissed, because the table
   *  names the four teams and would show them through the backdrop while the flags were
   *  still scrambling in front. */
  drawOpen: boolean;
  onDismissDraw: () => void;
  userRating: number;
  speed: MatchSpeed;
  onMatchEnd: () => void;
  /** The first boost, picked right here rather than on a screen of its own. */
  onPickBoost: (b: Boon) => void;
  /** Physio Table: re-roll the offer this reveal is carrying. */
  onReroll: (next: RunState) => void;
  /** Commit the group with no boost to pick, i.e. a group-stage exit. */
  onContinue: () => void;
}) {
  // Null only for a group with no user side or no opponents, which cannot be reached
  // from `prepareGroupStage`; the guard is the same one the caller used to carry.
  const draw = splitGroup(reveal.group);
  // Matchdays fully revealed so far: while matchday N is playing, N-1 are complete, and
  // once the reveal is done all three are. This is what the table is projected to.
  const revealed = reveal.done ? GROUP_MATCHDAYS : reveal.index;
  const advanced = reveal.next.phase !== 'ended';
  const record = reveal.next.history.find((h): h is GroupRecord => h.stage === 'group');

  return (
    <>
      {drawOpen && draw && (
        <GroupDrawReveal
          userTeam={draw.user}
          opponents={draw.opponents}
          onContinue={onDismissDraw}
        />
      )}
      {/* The table as it stands: projected to the matchdays revealed so far, so it fills
          in as the group plays out. */}
      {!drawOpen && (
        <div className="mb-4">
          <StandingsTable
            group={groupAsOf(reveal.group, revealed)}
            groupFinished={reveal.done}
            advanced={reveal.done && advanced}
          />
        </div>
      )}
      {!drawOpen &&
        reveal.matches.map((m, i) => {
          if (i > reveal.index) return null;
          if (i === reveal.index && !reveal.done)
            return (
              <LiveCupMatch
                key={i}
                label={`Matchday ${i + 1}`}
                opp={m.opp}
                userRating={userRating}
                events={m.result.events}
                decided="reg"
                speed={speed}
                onEnd={onMatchEnd}
              />
            );
          // The other group fixture used to sit under each card; the table's own "All
          // results" already lists every one of the six, so it was the same scoreline
          // printed twice.
          return <GroupResultCard key={i} m={m} i={i} userRating={userRating} />;
        })}
      {reveal.done && (
        <>
          <div className="mt-6">
            <Banner
              champion={advanced}
              eyebrow={
                record
                  ? `Group stage · finished ${ordinal(record.groupPos)} of ${record.groupSize}`
                  : 'Group stage'
              }
              heading={advanced ? 'Through to the knockouts' : 'Knocked out'}
              body={advanced ? 'Pick your first boost, then into the Round of 16.' : undefined}
            />
          </div>
          {/* No final table here: the live one above IS the final table once the third
              matchday is in, and printing it again put the same eight rows on screen
              twice. */}
          {advanced && reveal.next.offer ? (
            <div className={`mt-4 ${CARD} p-5`}>
              <BoostOffer
                offer={reveal.next.offer}
                nextOpponent={reveal.next.nextOpponent}
                roundName={KO_ROUNDS[0]}
                onPick={onPickBoost}
                rerollsLeft={reveal.next.rerollsLeft ?? 0}
                onReroll={() => onReroll(reveal.next)}
              />
            </div>
          ) : (
            <div className="mt-4 flex justify-center">
              <button onClick={onContinue} className={PRIMARY_BTN}>
                Continue
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
