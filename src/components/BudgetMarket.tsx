import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Player, Position } from '../data/types';
import { lastName } from '../data/format';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { priceOf, BUDGET } from '../domain/pricing';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import StartOverButton from './StartOverButton';

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
/** How many of the best affordable options each random pick draws from. */
const PICK_POOL = 15;

/** Players eligible for each position, highest-rated first. */
const BY_POSITION: Partial<Record<Position, Player[]>> = (() => {
  const m: Partial<Record<Position, Player[]>> = {};
  for (const p of ALL_PLAYERS) for (const pos of p.positions) (m[pos] ??= []).push(p);
  for (const pos of Object.keys(m) as Position[]) m[pos]!.sort((a, b) => b.elo - a.elo);
  return m;
})();

interface Props {
  formation: Formation;
  filled: Filled;
  /** The empty slot currently being shopped for (drives the market's position). */
  targetSlotId: string | null;
  /** The market player currently held (its eligible slots pulse on the pitch). */
  heldId: string | null;
  /** Hold / release a market player. */
  onHold: (player: Player) => void;
  /** Fill every empty slot within budget (randomized). App dispatches AUTOFILL. */
  onAutoFill: (filled: Filled, usedPersonIds: string[]) => void;
  /** Empty the XI but stay in the budget build. */
  onClear: () => void;
  /** Drop the XI and return to setup. */
  onStartOver: () => void;
}

/** The transfer-market panel: the left column of the budget build (the player
 *  "source", mirroring the drawn-squad panel of the roll draft). The pitch + the
 *  ratings/line-up columns are shared with the roll draft and owned by App; placing
 *  and removing happen on the pitch, so this panel only shops + holds players. */
export default function BudgetMarket({
  formation,
  filled,
  targetSlotId,
  heldId,
  onHold,
  onAutoFill,
  onClear,
  onStartOver,
}: Props) {
  const [query, setQuery] = useState('');

  const slots = formation.slots;
  const placed = slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
  const used = new Set(placed.map((p) => p.personId));
  const spent = placed.reduce((t, p) => t + priceOf(p.elo), 0);
  const remaining = BUDGET - spent;
  const emptySlots = slots.filter((s) => !filled[s.id]);
  const targetSlot =
    slots.find((s) => s.id === targetSlotId && !filled[s.id]) ?? emptySlots[0] ?? null;
  const heldPlayer = heldId ? ALL_PLAYERS.find((p) => p.id === heldId) ?? null : null;

  const results = useMemo(() => {
    if (!targetSlot) return [];
    const q = norm(query.trim());
    const list = (BY_POSITION[targetSlot.position] ?? []).filter((p) => {
      if (!q) return true;
      const sq = SQUAD_BY_ID[p.squadId];
      const hay = `${norm(p.name)} ${norm(sq?.nation ?? '')} ${(sq?.code ?? '').toLowerCase()} ${sq?.year ?? ''}`;
      return hay.includes(q);
    });
    return list.slice(0, MAX_RESULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSlot?.position, query]);

  // Fill every empty slot and spend most of the budget, differently each time (see
  // the randomized fill: shuffled order, random best-affordable pick per slot with a
  // reserve, then a random upgrade pass). Hands the result to App to commit.
  const autoFill = () => {
    const next: Filled = { ...filled };
    const usedIds = new Set(placed.map((p) => p.personId));
    let left = remaining;
    const autoIds: string[] = [];

    const order = shuffle(slots.filter((s) => !next[s.id]));
    order.forEach((s, i) => {
      const reserve = (order.length - 1 - i) * MIN_PRICE;
      const cap = left - reserve;
      const pool = (BY_POSITION[s.position] ?? []).filter(
        (p) => !usedIds.has(p.personId) && priceOf(p.elo) <= cap,
      );
      if (pool.length === 0) return;
      const topK = pool.slice(0, Math.min(PICK_POOL, pool.length));
      const pick = topK[Math.floor(Math.random() * topK.length)];
      next[s.id] = pick;
      usedIds.add(pick.personId);
      left -= priceOf(pick.elo);
      autoIds.push(s.id);
    });

    for (let guard = 0; guard < 300 && left > 0; guard++) {
      let upgraded = false;
      for (const slotId of shuffle(autoIds)) {
        const cur = next[slotId]!;
        const slot = slots.find((s) => s.id === slotId)!;
        const curPrice = priceOf(cur.elo);
        const options = (BY_POSITION[slot.position] ?? []).filter(
          (p) =>
            p.elo > cur.elo && !usedIds.has(p.personId) && priceOf(p.elo) - curPrice <= left,
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

    onAutoFill(next, [...usedIds]);
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
      {/* Budget bar */}
      <div className="border-b border-line p-4">
        <div className="flex items-baseline justify-between font-mono text-[12px]">
          <span>
            Spent <b className="text-ink">${spent}</b> / ${BUDGET}
          </span>
          <span className={remaining < 0 ? 'font-bold text-loss' : 'text-muted'}>
            ${remaining} left &middot; {placed.length}/{slots.length}
          </span>
        </div>
        <div className="mt-2 h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
          <div
            className={`h-full ${remaining < 0 ? 'bg-loss' : 'bg-pitch'}`}
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
              onClick={onClear}
              className="rounded-[5px] border border-line bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-muted transition hover:border-loss hover:text-loss"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {targetSlot ? (
        <div className="p-3">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Buying: <b className="text-ink">{targetSlot.label}</b> ({targetSlot.position})
            </span>
            <div className="relative">
              <Search
                size={13}
                strokeWidth={2.5}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-28 rounded-[5px] border border-line bg-white py-1.5 pl-7 pr-2 text-[13px] outline-none transition placeholder:text-muted/70 focus:border-pitch"
              />
            </div>
          </div>
          <p className="mb-1.5 min-h-[14px] px-1 font-mono text-[10px] text-amber">
            {heldPlayer ? `Tap a highlighted slot to place ${lastName(heldPlayer.name)}.` : ''}
          </p>
          <ul className="max-h-[52vh] overflow-y-auto">
            {results.map((p) => {
              const sq = SQUAD_BY_ID[p.squadId];
              const price = priceOf(p.elo);
              const isUsed = used.has(p.personId);
              const affordable = price <= remaining;
              const selectable = !isUsed && affordable;
              const held = p.id === heldId;
              const tier = FEATURES.stickerAlbum ? tierOf(p) : null;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => selectable && onHold(p)}
                    disabled={!selectable}
                    className={[
                      'flex w-full items-center gap-2 rounded-[5px] px-2 py-2 text-left transition',
                      held
                        ? 'bg-pitch/10 ring-1 ring-pitch'
                        : selectable
                          ? 'hover:bg-pitch/5'
                          : 'cursor-not-allowed opacity-45',
                    ].join(' ')}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{p.name}</span>
                      {tier && <CollectibleStar tier={tier} />}
                    </span>
                    {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
                    <span className="w-7 text-right font-mono text-[10px] text-muted tabular-nums">
                      {sq?.year}
                    </span>
                    <span className="w-6 text-right font-mono text-[13px] font-bold tabular-nums">
                      {p.elo}
                    </span>
                    <span
                      className={`w-7 text-right font-mono text-[12px] font-semibold tabular-nums ${affordable ? 'text-ink' : 'text-loss'}`}
                    >
                      ${price}
                    </span>
                  </button>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="px-2 py-6 text-center font-mono text-[12px] text-muted">
                No {targetSlot.position} matches that search.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="p-6 text-center font-mono text-[12px] text-muted">XI complete.</div>
      )}

      <div className="border-t border-line px-4 pb-4 pt-1">
        <StartOverButton onReset={onStartOver} />
      </div>
    </div>
  );
}
