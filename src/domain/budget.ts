// ---------------------------------------------------------------------------
// Budget draft auto-fill. The randomized "Auto-fill & spend" helper for the
// transfer market: fill every empty slot within the remaining budget, differently
// each time (shuffled order, a random pick from the best few affordable options
// per slot with a reserve, then a random upgrade pass to spend the leftover).
// Pure gameplay logic, kept out of the component (BudgetMarket only calls this and
// hands the result up to App). Uses Math.random via `shuffled`, matching the sim.
// ---------------------------------------------------------------------------

import type { Player, Position } from '../data/types';
import { ALL_PLAYERS } from '../data/squads';
import type { Slot } from './formations';
import type { Filled } from './draft';
import { priceOf } from './pricing';
import { shuffled } from './random';

/** Cheapest possible price for any player, reserved per still-empty slot so a random
 *  auto-fill never strands a slot it can no longer afford. */
const MIN_PRICE = 1;
/** How many of the best affordable options each random pick draws from. */
const PICK_POOL = 15;
/** Upper bound on the upgrade-pass loop so it can never spin forever. */
const UPGRADE_GUARD = 300;

/** Players eligible for each position, highest-rated first, from a given pool. */
export function playersByPosition(players: Player[]): Partial<Record<Position, Player[]>> {
  const m: Partial<Record<Position, Player[]>> = {};
  for (const p of players) for (const pos of p.positions) (m[pos] ??= []).push(p);
  for (const pos of Object.keys(m) as Position[]) m[pos]!.sort((a, b) => b.elo - a.elo);
  return m;
}

/**
 * Fill every empty slot in `filled` within `remaining` dollars, at random.
 * `filled` is left untouched; the returned `filled` is a fresh map with the picks
 * added. Never exceeds `remaining`, never reuses a personId already placed (or one
 * picked during the fill), and fills every empty slot when the budget allows.
 *
 * Two passes: a shuffled forward pass takes a random best-affordable pick per slot
 * (reserving MIN_PRICE for each slot still to come, so no slot is stranded), then a
 * bounded upgrade pass spends the leftover on random affordable improvements.
 */
export function autoFillBudget(
  slots: Slot[],
  filled: Filled,
  remaining: number,
  pool: Player[] = ALL_PLAYERS,
): { filled: Filled; usedPersonIds: string[] } {
  const BY_POSITION = playersByPosition(pool);
  const next: Filled = { ...filled };
  const usedIds = new Set<string>();
  for (const s of slots) {
    const p = next[s.id];
    if (p) usedIds.add(p.personId);
  }
  let left = remaining;
  const autoIds: string[] = [];

  const order = shuffled(slots.filter((s) => !next[s.id]));
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

  for (let guard = 0; guard < UPGRADE_GUARD && left > 0; guard++) {
    let upgraded = false;
    for (const slotId of shuffled(autoIds)) {
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

  return { filled: next, usedPersonIds: [...usedIds] };
}
