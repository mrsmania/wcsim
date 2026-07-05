// ---------------------------------------------------------------------------
// Budget draft pricing. A player's transfer value is a fixed function of their
// rating, deliberately CONVEX (the curve steepens at the top) so a fixed budget
// forces real trade-offs: you can't afford eleven stars, and a lone superstar has
// a diminishing rating-per-dollar. The budget itself lives in config.ts.
// ---------------------------------------------------------------------------

import { BUDGET_DRAFT } from '../config';

/** Fixed budget for a full XI, in "$". Tune it in config.ts (BUDGET_DRAFT). */
export const BUDGET = BUDGET_DRAFT;

/** Tuning constants for the price curve `round((elo - BASE)^2 / DIVISOR)`, min 1. */
const BASE = 58;
const DIVISOR = 64;

/**
 * Price of a player by rating (elo). Convex: ~78 -> 6, ~82 -> 9, 90 -> 16, 96 -> 23,
 * 99 -> 26. So an all-82 XI (~99) just fits the 100 budget, an all-84 XI (~121)
 * busts it, and one 99 (26) leaves ~74 for the other ten. Tune BASE/DIVISOR to shift
 * how tight the budget is. Never below 1.
 */
export function priceOf(elo: number): number {
  return Math.max(1, Math.round((elo - BASE) ** 2 / DIVISOR));
}
