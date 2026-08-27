import { KO_ROUNDS } from '../../domain/knockout';
import { boonById } from '../../domain/boons';
import type { RoundRecord } from '../../domain/run';
import { CARD, GROUP_OUTCOME, ordinal, StageCrumb } from '../matchUi';
import Flag from '../Flag';
import FinishedKoCard from './FinishedKoCard';
import { RARITY_COLOR } from './types';

/** The read-only review shown in the content area when a past round is opened from
 *  the ladder: the round's result (+ boost taken), or the group's finishing summary. */
export default function RoundReview({ record, onBack }: { record: RoundRecord; onBack: () => void }) {
  const backBtn = (
    <StageCrumb dir="back" label="Back to the current round" onClick={onBack} className="mt-4" />
  );

  const boost = record.boostId ? boonById(record.boostId) : undefined;
  const boostLine = boost && (
    <div className="mt-3 flex items-start gap-2 text-[12.5px]">
      <span
        className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
        style={{ background: RARITY_COLOR[boost.rarity] }}
      />
      <span className="text-muted">
        Boost taken: <b className="text-ink">{boost.name}</b> &middot; {boost.description}
      </span>
    </div>
  );

  if (record.stage === 'group') {
    return (
      <div className={`${CARD} p-5`}>
        <div className="mb-3 text-[14px] font-semibold">
          Group stage, finished {ordinal(record.groupPos)} of {record.groupSize} ·{' '}
          <span className={record.won ? 'text-pitch-ink' : 'text-loss'}>
            {record.won ? GROUP_OUTCOME.advanced : GROUP_OUTCOME.out}
          </span>
        </div>
        {record.groupResults && (
          <div className="flex flex-col gap-1.5">
            {record.groupResults.map((r, i) => {
              const res = r.us > r.them ? 'text-pitch-ink' : r.us < r.them ? 'text-loss' : 'text-muted';
              return (
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <span className="w-[74px] shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    Matchday {i + 1}
                  </span>
                  <span className="font-semibold">Your XI</span>
                  <span className={`font-mono font-bold ${res}`}>
                    {r.us}-{r.them}
                  </span>
                  <Flag code={r.code} className="h-3 w-[18px]" />
                  <span className="min-w-0 truncate">{r.name}</span>
                </div>
              );
            })}
          </div>
        )}
        {boostLine}
        {backBtn}
      </div>
    );
  }

  return (
    <div>
      <FinishedKoCard
        roundName={KO_ROUNDS[record.stage]}
        oppName={record.oppName}
        oppCode={record.oppCode}
        oppYear={record.oppYear}
        oppRating={record.oppRating}
        userRating={record.userRating}
        userGoals={record.userGoals}
        oppGoals={record.oppGoals}
        decided={record.decided}
        events={record.events}
        pens={record.pens}
        userWon={record.won}
      />
      <div className={`mt-4 ${CARD} p-4`}>
        {boost ? boostLine : <div className="text-[12.5px] text-muted">No boost this round.</div>}
        {backBtn}
      </div>
    </div>
  );
}
