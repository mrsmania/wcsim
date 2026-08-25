import { useMemo, useState } from 'react';
import {
  AWARD,
  AWARDS_ON,
  CHALLENGES,
  FAMILIES,
  FAMILY_NAME,
  challengeProgress,
  type Challenge,
  type ChallengeFamily,
} from '../domain/challenges';
import { ChallengeLedgerRow, FAMILY_COLOR, TierPips } from './challengeUi';

type Filter = 'all' | 'open' | 'done';

/** State of one entry, which is also what the filters pick between.
 *
 *  There is no 'blocked' state here any more (hygiene D6). `Challenge.blocked` stays in the
 *  DOMAIN model on purpose - it costs nothing and the next batch of entries will want it -
 *  but no catalogue entry has set it since the plumbing wave judged all 130, so every
 *  consumer branch was unreachable: a filter variant, a self-hiding chip, a self-hiding
 *  legend row and the lock rendering in ChallengeLedgerRow. Re-add the UI with the entries
 *  that need it, in a file whose whole premise is that 130 entries cannot each be painted. */
const stateOf = (c: Challenge, done: Set<string>): Filter => (done.has(c.id) ? 'done' : 'open');

/** The whole catalogue: a completion counter in the album's shape, filters, and every
 *  challenge grouped by family. Read-only - a challenge is completed by playing. */
export default function ChallengesScreen({
  completed,
}: {
  /** Ids the career has completed. */
  completed: string[];
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const done = useMemo(() => new Set(completed), [completed]);
  const progress = useMemo(() => challengeProgress(completed), [completed]);
  const pct = Math.round((progress.completed / progress.total) * 100);

  const shown = useMemo(
    () => CHALLENGES.filter((c) => filter === 'all' || stateOf(c, done) === filter),
    [filter, done],
  );
  const byFamily = useMemo(() => {
    const groups = new Map<ChallengeFamily, Challenge[]>();
    for (const c of shown) groups.set(c.family, [...(groups.get(c.family) ?? []), c]);
    return groups;
  }, [shown]);

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: progress.total },
    { key: 'open', label: 'Available', n: progress.available },
    { key: 'done', label: 'Completed', n: progress.completed },
  ];

  // No header of its own: the only route that reaches this screen is `/records`, which
  // puts one StageHeader above its sub-tabs. It used to render its own when mounted on the
  // `/challenges` alias - but that arm was unreachable, so `heading` was only ever passed
  // false and the alias is now gone.
  return (
    <>
      {/* Completion counter, deliberately the album's shape: same page, same reading. */}
      <section
        className={`grid grid-cols-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard ${
          AWARDS_ON ? 'sm:grid-cols-[minmax(0,1fr)_210px]' : ''
        }`}
      >
        <div className="p-[22px]">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
            Completed
          </div>
          <div className="mb-3 mt-1.5 font-display font-black leading-none tracking-[-0.02em]">
            <span className="text-[44px]">{progress.completed}</span>
            <span className="text-[18px] font-extrabold text-muted"> / {progress.total} honours</span>
          </div>
          <div className="h-[9px] overflow-hidden rounded-[20px] border border-line bg-chalk">
            <div
              className="h-full bg-gradient-to-r from-pitch to-pitch-dark"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Tier reads as difficulty here too, so the legend carries the same pips the
              rows do rather than the three swatches it used to - the page is down to
              one hue per family and a tick, and this was the last of the old colour. */}
          <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
            {(['bronze', 'silver', 'gold'] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted">
                <TierPips tier={t} />
                <span className="capitalize">{t}</span>
                <b className="font-bold text-ink">
                  {progress.byTier[t].completed}/{progress.byTier[t].total}
                </b>
              </span>
            ))}
          </div>
        </div>
        {AWARDS_ON && (
          <div className="flex flex-col justify-center border-line bg-chalk p-[22px] max-sm:border-t sm:border-l">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Prestige earned
            </div>
            <div className="mt-1 font-mono text-[38px] font-bold leading-none">
              {progress.prestige}
            </div>
            <div className="mt-1.5 text-[11.5px] leading-snug text-muted">
              Bronze {AWARD.bronze}, silver {AWARD.silver}, gold {AWARD.gold}. Paid into the same
              wallet the perk shop spends from.
            </div>
          </div>
        )}
      </section>

      <p className="mt-3.5 text-[13px] text-muted">
        Every challenge is permanent: completable once, and it stays on the list until you get
        it. Nothing expires, so nothing is missed by not playing. They are judged when a Cup Run
        ends.
      </p>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t-2 border-ink pt-4">
        <span className="mr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Show
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3.5 py-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.05em] transition ${
              filter === f.key
                ? 'border-ink bg-ink text-ground'
                : 'border-line bg-panel text-ink hover:border-pitch hover:text-pitch'
            }`}
          >
            {f.label}
            <span className="ml-1.5 font-mono text-[10px] font-bold opacity-60">{f.n}</span>
          </button>
        ))}
      </div>

      {/* The catalogue, by family */}
      {FAMILIES.map((family) => {
        const list = byFamily.get(family);
        if (!list?.length) return null;
        // `challengeProgress` already counted these in one pass, which is why `byFamily`
        // exists (hygiene H44). Recomputing them here was two filters over the 130-entry
        // catalogue per family, so 24 scans a render. Same numbers either way - both read
        // CHALLENGES, so the header counts the catalogue rather than the filtered view,
        // which is what makes "3 / 16" still say 16 under the Completed filter.
        const { total, completed: got } = progress.byFamily[family];
        return (
          <section key={family} className="mt-[22px]">
            {/* The family accent is spent here and nowhere else: twelve rules on the
                page instead of a 3px edge on all 130 entries. */}
            <div
              className="flex flex-wrap items-center gap-2.5 border-b-2 pb-1.5"
              style={{ borderBottomColor: FAMILY_COLOR[family] }}
            >
              <h3 className="font-display text-[15px] font-extrabold tracking-[-0.01em]">
                {FAMILY_NAME[family]}
              </h3>
              <span className="ml-auto font-mono text-[11.5px] font-semibold text-muted">
                {got} / {total}
              </span>
            </div>
            {/* Two entries to a row, so a 16-entry family is 8 rows deep. Grid rather
                than columns because a grid row levels both cells' heights, which keeps
                the two hairlines in line when one description wraps and the other
                does not. */}
            <div className="grid grid-cols-1 gap-x-[30px] min-[700px]:grid-cols-2">
              {list.map((c) => (
                <ChallengeLedgerRow key={c.id} challenge={c} done={done.has(c.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
