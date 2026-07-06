import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { Player, Position } from '../data/types';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import type { Formation } from '../domain/formations';
import { isComplete, teamRating, type Filled } from '../domain/draft';
import { priceOf, BUDGET } from '../domain/pricing';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';

const ALL_PLAYERS: Player[] = SQUADS.flatMap((s) => s.players);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX_RESULTS = 60;

/** A shuffled copy (Fisher-Yates). Uses Math.random intentionally, like the sim. */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Cheapest possible price for any player, reserved per still-empty slot so a random
 *  auto-fill never strands a slot it can no longer afford. */
const MIN_PRICE = 1;
/** How many of the best affordable options each random pick draws from. Small enough
 *  to keep picks strong (the budget gets spent), large enough that no two auto-fills
 *  look alike. */
const PICK_POOL = 15;

/** Players eligible for each position, highest-rated first (for the auto-fill helper). */
const BY_POSITION: Partial<Record<Position, Player[]>> = (() => {
  const m: Partial<Record<Position, Player[]>> = {};
  for (const p of ALL_PLAYERS) for (const pos of p.positions) (m[pos] ??= []).push(p);
  for (const pos of Object.keys(m) as Position[]) m[pos]!.sort((a, b) => b.elo - a.elo);
  return m;
})();

/** Budget draft / Transfer Market: hand-pick an XI from all squads within a fixed
 *  budget (each player priced by rating). Builds a `filled` for the given formation
 *  and hands it to `onConfirm`, which loads it into the game (AUTOFILL) so it plays
 *  like a rolled XI. Self-contained local state. */
export default function BudgetDraftScreen({
  formation,
  onConfirm,
}: {
  formation: Formation | null;
  onConfirm: (filled: Filled, usedPersonIds: string[]) => void;
}) {
  const [filled, setFilled] = useState<Filled>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const slots = formation?.slots ?? [];
  const placed = slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
  const used = new Set(placed.map((p) => p.personId));
  const spent = placed.reduce((t, p) => t + priceOf(p.elo), 0);
  const remaining = BUDGET - spent;
  const complete = !!formation && isComplete(formation, filled);
  const avg = formation ? teamRating(formation, filled) : 0;
  const emptySlots = slots.filter((s) => !filled[s.id]);
  const targetSlot = slots.find((s) => s.id === selectedSlotId && !filled[s.id]) ?? emptySlots[0] ?? null;

  const results = useMemo(() => {
    if (!targetSlot) return [];
    const q = norm(query.trim());
    const usedIds = new Set(
      slots.map((s) => filled[s.id]).filter((p): p is Player => !!p).map((p) => p.personId),
    );
    const list: Player[] = [];
    for (const p of ALL_PLAYERS) {
      if (!p.positions.includes(targetSlot.position) || usedIds.has(p.personId)) continue;
      if (q) {
        const sq = SQUAD_BY_ID[p.squadId];
        const hay = `${norm(p.name)} ${norm(sq?.nation ?? '')} ${(sq?.code ?? '').toLowerCase()} ${sq?.year ?? ''}`;
        if (!hay.includes(q)) continue;
      }
      list.push(p);
    }
    list.sort((a, b) => b.elo - a.elo);
    return list.slice(0, MAX_RESULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSlot?.id, query, filled]);

  if (!formation) {
    return (
      <div className="mx-auto mt-16 max-w-[900px] text-center text-muted">
        Pick a formation first.{' '}
        <Link to="/" className="text-pitch underline">
          Back to setup
        </Link>
      </div>
    );
  }

  const buy = (p: Player) => {
    if (!targetSlot || priceOf(p.elo) > remaining) return;
    setFilled((f) => ({ ...f, [targetSlot.id]: p }));
    setSelectedSlotId(null); // advance to the next empty slot
  };
  const remove = (slotId: string) => {
    setFilled((f) => {
      const n = { ...f };
      delete n[slotId];
      return n;
    });
    setSelectedSlotId(slotId);
  };

  const clearAll = () => {
    setFilled({});
    setSelectedSlotId(null);
  };

  // Fill every empty slot and spend most of the budget, differently on each click.
  // Empty slots are filled in a random order; each gets a random pick from the best
  // few players it can still afford (reserving $1 for every slot after it, so it is
  // always a valid completion). Then a random upgrade pass spends whatever is left.
  // Never touches slots you filled by hand.
  const autoFill = () => {
    const next: Filled = { ...filled };
    const usedIds = new Set(placed.map((p) => p.personId));
    let left = remaining;
    const autoIds: string[] = [];

    // Random fill: shuffle the empty slots, reserve the bare minimum for the rest.
    const order = shuffle(slots.filter((s) => !next[s.id]));
    order.forEach((s, i) => {
      const reserve = (order.length - 1 - i) * MIN_PRICE;
      const cap = left - reserve;
      const pool = (BY_POSITION[s.position] ?? []).filter(
        (p) => !usedIds.has(p.personId) && priceOf(p.elo) <= cap,
      );
      if (pool.length === 0) return; // nothing affordable; leave open (shouldn't happen)
      // pool is sorted by elo desc; draw from the best few affordable for a strong,
      // budget-spending pick that still varies run to run.
      const topK = pool.slice(0, Math.min(PICK_POOL, pool.length));
      const pick = topK[Math.floor(Math.random() * topK.length)];
      next[s.id] = pick;
      usedIds.add(pick.personId);
      left -= priceOf(pick.elo);
      autoIds.push(s.id);
    });

    // Spend the rest on random affordable upgrades to the auto-filled slots, so the
    // leftover budget gets used without funnelling every run to the same picks.
    for (let guard = 0; guard < 300 && left > 0; guard++) {
      let upgraded = false;
      for (const slotId of shuffle(autoIds)) {
        const cur = next[slotId]!;
        const slot = slots.find((s) => s.id === slotId)!;
        const curPrice = priceOf(cur.elo);
        const options = (BY_POSITION[slot.position] ?? []).filter(
          (p) =>
            p.elo > cur.elo &&
            !usedIds.has(p.personId) &&
            priceOf(p.elo) - curPrice <= left,
        );
        if (options.length === 0) continue;
        const topK = options.slice(0, Math.min(PICK_POOL, options.length));
        const up = topK[Math.floor(Math.random() * topK.length)];
        usedIds.delete(cur.personId);
        usedIds.add(up.personId);
        next[slotId] = up;
        left -= priceOf(up.elo) - curPrice;
        upgraded = true;
        break;
      }
      if (!upgraded) break;
    }

    setFilled(next);
    setSelectedSlotId(null);
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        to="/"
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch"
      >
        <ArrowLeft size={13} strokeWidth={2.5} className="transition group-hover:-translate-x-0.5" />
        Back to setup
      </Link>

      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
            Transfer market &middot; {formation.name}
          </div>
          <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
            Buy your XI
          </h2>
        </div>
        <button
          onClick={() => onConfirm(filled, [...used])}
          disabled={!complete}
          className="rounded-md bg-pitch px-5 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-white transition hover:bg-pitch-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm XI &rarr;
        </button>
      </div>

      {/* Budget bar */}
      <div className="mb-4 rounded-md border border-line bg-panel p-4 shadow-hard">
        <div className="flex items-baseline justify-between font-mono text-[12px]">
          <span>
            Spent <b className="text-ink">${spent}</b> / ${BUDGET}
          </span>
          <span className={remaining < 0 ? 'font-bold text-loss' : 'text-muted'}>
            ${remaining} left &middot; {placed.length}/{slots.length} &middot; avg{' '}
            <b className="text-ink">{avg || '-'}</b>
          </span>
        </div>
        <div className="mt-2 h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
          <div
            className="h-full bg-pitch"
            style={{ width: `${Math.min(100, (spent / BUDGET) * 100)}%` }}
          />
        </div>
        <div className="mt-3 flex gap-2">
          {emptySlots.length > 0 && (
            <button
              onClick={autoFill}
              className="rounded-[5px] border border-line bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink transition hover:border-pitch hover:text-pitch"
            >
              Auto-fill &amp; spend
            </button>
          )}
          {placed.length > 0 && (
            <button
              onClick={clearAll}
              className="rounded-[5px] border border-line bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-muted transition hover:border-loss hover:text-loss"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* XI slots */}
        <section className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
          <div className="border-b-2 border-ink px-4 py-3 font-display text-base font-extrabold uppercase tracking-[-0.01em]">
            Your XI
          </div>
          <ul>
            {slots.map((s) => {
              const p = filled[s.id];
              const isTarget = targetSlot?.id === s.id;
              const sq = p ? SQUAD_BY_ID[p.squadId] : null;
              const tier = p && FEATURES.stickerAlbum ? tierOf(p) : null;
              return (
                <li key={s.id} className="border-b border-line last:border-b-0">
                  {p ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="w-8 shrink-0 font-mono text-[10px] font-semibold uppercase text-pitch">
                        {s.label}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{p.name}</span>
                        {tier && <CollectibleStar tier={tier} />}
                      </span>
                      {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
                      <span className="w-6 text-right font-mono text-[13px] font-bold">{p.elo}</span>
                      <span className="w-7 text-right font-mono text-[11px] text-muted">
                        ${priceOf(p.elo)}
                      </span>
                      <button
                        onClick={() => remove(s.id)}
                        aria-label={`Remove ${p.name}`}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted transition hover:bg-loss/10 hover:text-loss"
                      >
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedSlotId(s.id)}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2 text-left transition',
                        isTarget ? 'bg-pitch/10' : 'hover:bg-pitch/5',
                      ].join(' ')}
                    >
                      <span className="w-8 shrink-0 font-mono text-[10px] font-semibold uppercase text-pitch">
                        {s.label}
                      </span>
                      <span className="text-[12.5px] italic text-muted">
                        {isTarget ? 'Buying...' : 'Empty - tap to fill'}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Market */}
        <section className="rounded-md border border-line bg-panel p-4 shadow-hard">
          {targetSlot ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Buying: <b className="text-ink">{targetSlot.label}</b> ({targetSlot.position})
                </span>
                <div className="relative w-44">
                  <Search
                    size={14}
                    strokeWidth={2.5}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full rounded-[5px] border border-line bg-white py-1.5 pl-8 pr-2 text-[13px] outline-none transition placeholder:text-muted/70 focus:border-pitch"
                  />
                </div>
              </div>
              <ul className="max-h-[52vh] overflow-y-auto">
                {results.map((p) => {
                  const sq = SQUAD_BY_ID[p.squadId];
                  const price = priceOf(p.elo);
                  const affordable = price <= remaining;
                  const tier = FEATURES.stickerAlbum ? tierOf(p) : null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2.5 border-b border-line px-1 py-2 last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-semibold">{p.name}</span>
                        {tier && <CollectibleStar tier={tier} />}
                      </span>
                      {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
                      <span className="w-8 text-right font-mono text-[11px] text-muted tabular-nums">
                        {sq?.year}
                      </span>
                      <span className="w-6 text-right font-mono text-[14px] font-bold tabular-nums">
                        {p.elo}
                      </span>
                      <span
                        className={`w-8 text-right font-mono text-[12px] font-semibold tabular-nums ${affordable ? 'text-ink' : 'text-loss'}`}
                      >
                        ${price}
                      </span>
                      <button
                        onClick={() => buy(p)}
                        disabled={!affordable}
                        className={[
                          'w-14 shrink-0 rounded-[5px] px-2 py-1.5 font-mono text-[11px] font-bold uppercase transition',
                          affordable
                            ? 'bg-pitch text-white hover:bg-pitch-dark'
                            : 'cursor-not-allowed border border-line bg-white text-muted/50',
                        ].join(' ')}
                      >
                        {affordable ? 'Add' : '$'}
                      </button>
                    </li>
                  );
                })}
                {results.length === 0 && (
                  <li className="px-1 py-6 text-center font-mono text-[12px] text-muted">
                    No affordable {targetSlot.position} matches that search.
                  </li>
                )}
              </ul>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="mb-3 font-display text-lg font-extrabold">XI complete - ${spent} spent.</p>
              <button
                onClick={() => onConfirm(filled, [...used])}
                className="rounded-md bg-pitch px-5 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-white transition hover:bg-pitch-dark"
              >
                Confirm XI &rarr;
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
