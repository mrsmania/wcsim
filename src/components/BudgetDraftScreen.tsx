import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import type { Player, Position } from '../data/types';
import { SQUADS, SQUAD_BY_ID } from '../data/squads';
import type { Formation } from '../domain/formations';
import { isComplete, type Filled } from '../domain/draft';
import { priceOf, BUDGET } from '../domain/pricing';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import Pitch from './Pitch';
import BoxScore from './BoxScore';
import XiTable from './XiTable';

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

/** Players eligible for each position, highest-rated first. */
const BY_POSITION: Partial<Record<Position, Player[]>> = (() => {
  const m: Partial<Record<Position, Player[]>> = {};
  for (const p of ALL_PLAYERS) for (const pos of p.positions) (m[pos] ??= []).push(p);
  for (const pos of Object.keys(m) as Position[]) m[pos]!.sort((a, b) => b.elo - a.elo);
  return m;
})();

/** Budget draft / Transfer Market: hand-pick an XI from all squads within a fixed
 *  budget (each player priced by rating). Built on the same 3-column layout as the
 *  roll draft - the tactics-board `Pitch` drives position selection, the market on
 *  the left is the player source, and the ratings/chemistry + line-up sit on the
 *  right - so it plays the same as a rolled draft. Confirm hands the XI to
 *  `onConfirm`, which loads it into the game (AUTOFILL). */
export default function BudgetDraftScreen({
  formation,
  onConfirm,
}: {
  formation: Formation | null;
  onConfirm: (filled: Filled, usedPersonIds: string[]) => void;
}) {
  const [filled, setFilled] = useState<Filled>({});
  // The empty slot being shopped for (drives which position the market shows), and
  // the market player currently held (its eligible slots pulse on the pitch).
  const [targetSlotId, setTargetSlotId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const slots = formation?.slots ?? [];
  const placed = slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
  const used = new Set(placed.map((p) => p.personId));
  const spent = placed.reduce((t, p) => t + priceOf(p.elo), 0);
  const remaining = BUDGET - spent;
  const complete = !!formation && isComplete(formation, filled);
  const emptySlots = slots.filter((s) => !filled[s.id]);
  const targetSlot =
    slots.find((s) => s.id === targetSlotId && !filled[s.id]) ?? emptySlots[0] ?? null;
  const selectedPlayer = selectedPlayerId
    ? ALL_PLAYERS.find((p) => p.id === selectedPlayerId) ?? null
    : null;

  // Market: every player eligible for the targeted position, highest-rated first,
  // filtered by the search box. Unaffordable / already-used players stay visible but
  // are not selectable (the "rating sort, show all" choice).
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

  // Hold / release a market player (only affordable, unused rows are selectable).
  const toggleHold = (p: Player) => {
    setSelectedPlayerId((id) => (id === p.id ? null : p.id));
  };

  // Place the held player into an eligible empty slot (buy). Fired by the pitch.
  const placeInSlot = (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    const p = selectedPlayer;
    if (!slot || filled[slot.id] || !p) return;
    if (!p.positions.includes(slot.position) || priceOf(p.elo) > remaining || used.has(p.personId))
      return;
    setFilled((f) => ({ ...f, [slot.id]: p }));
    setSelectedPlayerId(null);
    const next = slots.find((s) => s.id !== slot.id && !filled[s.id]);
    setTargetSlotId(next ? next.id : null);
  };

  // Tap an empty slot with no eligible held player: shop that position instead.
  const shopSlot = (slotId: string) => {
    setTargetSlotId(slotId);
    setSelectedPlayerId(null);
  };

  const removeSlot = (slotId: string) => {
    setFilled((f) => {
      const n = { ...f };
      delete n[slotId];
      return n;
    });
    setTargetSlotId(slotId);
    setSelectedPlayerId(null);
  };

  const clearAll = () => {
    setFilled({});
    setTargetSlotId(null);
    setSelectedPlayerId(null);
  };

  // Fill every empty slot and spend most of the budget, differently on each click.
  // Empty slots are filled in a random order; each gets a random pick from the best
  // few players it can still afford (reserving $1 for every slot after it, so it is
  // always a valid completion). Then a random upgrade pass spends whatever is left.
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

    setFilled(next);
    setSelectedPlayerId(null);
    setTargetSlotId(null);
  };

  return (
    <div>
      <Link
        to="/"
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch"
      >
        <ArrowLeft size={13} strokeWidth={2.5} className="transition group-hover:-translate-x-0.5" />
        Back to setup
      </Link>

      <div className="mb-5 mt-1 flex flex-wrap items-end justify-between gap-3">
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

      <div className="grid items-start gap-[22px] [grid-template-areas:'sum'_'board'_'stack'] [grid-template-columns:1fr] min-[760px]:[grid-template-areas:'sum_stack'_'board_board'] min-[760px]:[grid-template-columns:1fr_1fr] min-[1080px]:[grid-template-areas:'sum_board_stack'] min-[1080px]:[grid-template-columns:320px_minmax(0,1fr)_320px]">
        {/* Col 1: the transfer market (the player source, like the drawn squad) */}
        <aside className="overflow-hidden rounded-md border border-line bg-panel shadow-hard [grid-area:sum]">
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
                  onClick={clearAll}
                  className="rounded-[5px] border border-line bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-muted transition hover:border-loss hover:text-loss"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {targetSlot ? (
            <>
              <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
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
                    className="w-32 rounded-[5px] border border-line bg-white py-1.5 pl-7 pr-2 text-[13px] outline-none transition placeholder:text-muted/70 focus:border-pitch"
                  />
                </div>
              </div>
              {selectedPlayer && (
                <p className="px-4 pb-1.5 font-mono text-[10px] text-amber">
                  Tap a highlighted slot to place {selectedPlayer.name.split(' ').slice(-1)[0]}.
                </p>
              )}
              <ul className="max-h-[46vh] overflow-y-auto px-2 pb-2">
                {results.map((p) => {
                  const sq = SQUAD_BY_ID[p.squadId];
                  const price = priceOf(p.elo);
                  const isUsed = used.has(p.personId);
                  const affordable = price <= remaining;
                  const selectable = !isUsed && affordable;
                  const held = p.id === selectedPlayerId;
                  const tier = FEATURES.stickerAlbum ? tierOf(p) : null;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => selectable && toggleHold(p)}
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
            </>
          ) : (
            <div className="p-6 text-center">
              <p className="mb-3 font-display text-base font-extrabold">
                XI complete - ${spent} spent.
              </p>
              <button
                onClick={() => onConfirm(filled, [...used])}
                className="rounded-md bg-pitch px-4 py-2.5 font-display text-[13px] font-extrabold uppercase tracking-[0.02em] text-white transition hover:bg-pitch-dark"
              >
                Confirm XI &rarr;
              </button>
            </div>
          )}
        </aside>

        {/* Col 2: the pitch. Tap a player (left) then a highlighted slot to buy, or
            tap an empty slot to shop that position. */}
        <section className="[grid-area:board]">
          <Pitch
            formation={formation}
            filled={filled}
            selectedPlayer={selectedPlayer}
            onPlace={placeInSlot}
            onRemove={removeSlot}
            onSelectSlot={shopSlot}
            targetSlotId={targetSlot?.id}
          />
        </section>

        {/* Col 3: ratings + chemistry + line-up, identical to the roll draft. */}
        <section className="flex flex-col gap-[18px] [grid-area:stack]">
          <BoxScore formation={formation} filled={filled} showChemistry />
          <XiTable formation={formation} filled={filled} />
        </section>
      </div>
    </div>
  );
}
