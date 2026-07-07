// ---------------------------------------------------------------------------
// Budget draft pricing. A player's transfer value is a fixed function of their
// rating, deliberately CONVEX (the curve steepens at the top) so a fixed budget
// forces real trade-offs: you can't afford eleven stars, and a lone superstar has
// a diminishing rating-per-dollar. The budget itself lives in config.ts.
// ---------------------------------------------------------------------------

/** Tuning constants for the price curve `round((elo - BASE)^2 / DIVISOR)`, min 1. */
const BASE = 58;
const DIVISOR = 64;

/**
 * Price of a player by rating (elo). Convex: ~78 -> 6, ~82 -> 9, 90 -> 16, 96 -> 23,
 * 99 -> 26, so a handful of stars eats most of the budget (BUDGET_DRAFT in config.ts)
 * and forces trade-offs. Tune BASE/DIVISOR to shift how tight it is. Never below 1.
 */
export function priceOf(elo: number): number {
  return Math.max(1, Math.round((elo - BASE) ** 2 / DIVISOR));
}
