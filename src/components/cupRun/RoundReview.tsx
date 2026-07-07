import { KO_ROUNDS } from '../../domain/knockout';
import { boonById } from '../../domain/boons';
import type { RoundRecord } from '../../domain/run';
import { ordinal, StageCrumb } from '../matchUi';
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
      <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
        <div className="mb-3 text-[14px] font-semibold">
          Group stage, finished {ordinal(record.groupPos ?? 0)} of {record.groupSize} ·{' '}
          <span className={record.won ? 'text-pitch' : 'text-loss'}>
            {record.won ? 'through to the knockouts' : 'eliminated'}
          </span>
        </div>
        {record.groupResults && (
          <div className="flex flex-col gap-1.5">
            {record.groupResults.map((r, i) => {
              const res = r.us > r.them ? 'text-pitch' : r.us < r.them ? 'text-loss' : 'text-muted';
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
        roundName={KO_ROUNDS[record.stage as number]}
        oppName={record.oppName ?? ''}
        oppCode={record.oppCode ?? ''}
        oppYear={record.oppYear}
        oppRating={record.oppRating}
        userRating={record.userRating ?? 0}
        userGoals={record.userGoals ?? 0}
        oppGoals={record.oppGoals ?? 0}
        decided={record.decided ?? 'reg'}
        events={record.events ?? []}
        pens={record.pens}
        userWon={record.won}
      />
      <div className="mt-4 rounded-md border border-line bg-panel p-4 shadow-hard">
        {boost ? boostLine : <div className="text-[12.5px] text-muted">No boost this round.</div>}
        {backBtn}
      </div>
    </div>
  );
}
