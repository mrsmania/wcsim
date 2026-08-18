import { useMemo, useState } from 'react';
import {
  AWARD,
  CHALLENGES,
  FAMILIES,
  FAMILY_NAME,
  challengeProgress,
  type Challenge,
  type ChallengeFamily,
} from '../domain/challenges';
import { ChallengeCard, FAMILY_COLOR, TIER_COLOR } from './challengeUi';
import { StageCrumb, StageHeader } from './matchUi';

type Filter = 'all' | 'open' | 'done' | 'blocked';

/** State of one entry, which is also what the filters pick between. */
const stateOf = (c: Challenge, done: Set<string>): Filter =>
  done.has(c.id) ? 'done' : c.blocked ? 'blocked' : 'open';

/** The whole catalogue: a completion counter in the album's shape, filters, and every
 *  challenge grouped by family. Read-only - a challenge is completed by playing. */
export default function ChallengesScreen({
  completed,
  onClose,
}: {
  /** Ids the career has completed. */
  completed: string[];
  onClose: () => void;
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
    { key: 'blocked', label: 'Not tracked yet', n: progress.blocked },
  ];

  return (
    <>
      <StageHeader
        eyebrow="Your honours"
        title="Challenges"
        crumb={<StageCrumb dir="back" label="Back" onClick={onClose} />}
      />

      {/* Completion counter, deliberately the album's shape: same page, same reading. */}
      <section className="grid grid-cols-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard sm:grid-cols-[minmax(0,1fr)_210px]">
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
          <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
            {(['bronze', 'silver', 'gold'] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: TIER_COLOR[t] }}
                  aria-hidden="true"
                />
                <span className="capitalize">{t}</span>
                <b className="font-bold text-ink">
                  {progress.byTier[t].completed}/{progress.byTier[t].total}
                </b>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-loss" aria-hidden="true" />
              Not tracked yet <b className="font-bold text-ink">{progress.blocked}</b>
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-center border-line bg-chalk p-[22px] max-sm:border-t sm:border-l">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Prestige earned
          </div>
          <div className="mt-1 font-mono text-[38px] font-bold leading-none">{progress.prestige}</div>
          <div className="mt-1.5 text-[11.5px] leading-snug text-muted">
            Bronze {AWARD.bronze}, silver {AWARD.silver}, gold {AWARD.gold}. Paid into the same
            wallet the perk shop spends from.
          </div>
        </div>
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
        const total = CHALLENGES.filter((c) => c.family === family).length;
        const got = CHALLENGES.filter((c) => c.family === family && done.has(c.id)).length;
        return (
          <section key={family} className="mt-8">
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5 border-b-2 border-ink pb-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: FAMILY_COLOR[family] }}
                aria-hidden="true"
              />
              <h3 className="font-display text-[19px] font-extrabold tracking-[-0.01em]">
                {FAMILY_NAME[family]}
              </h3>
              <span className="font-mono text-[12px] font-bold text-muted">
                {got} / {total}
              </span>
            </div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {list.map((c) => (
                <ChallengeCard key={c.id} challenge={c} done={done.has(c.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
