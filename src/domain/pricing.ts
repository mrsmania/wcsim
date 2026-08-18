// ---------------------------------------------------------------------------
// Budget draft pricing. A player's transfer value is a fixed function of their
// rating, deliberately CONVEX (the curve steepens at the top) so a fixed budget
// forces real trade-offs: you can't afford eleven stars, and a lone superstar has
// a diminishing rating-per-dollar. The budget itself lives in config.ts.
//
// On top of the curve sits ONE discount: a player whose sticker is already in your
// album is cheaper (STICKER_DISCOUNT), so the collection pays back into the game.
// It applies in both modes - the album is global, shared by Quick Run, Career Mode
// and guests alike, so there is a single price rule rather than a mode-dependent one.
// ---------------------------------------------------------------------------

import type { Player } from '../data/types';
import { STICKER_DISCOUNT } from '../config';

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

/**
 * What a specific player costs, given the stickers already collected: the curve price,
 * less STICKER_DISCOUNT when this player's sticker is in the album. Rounded, and never
 * below 1 - the same floor the curve has, so a discount can make a cheap player free-ish
 * but never free.
 *
 * Keyed on **player id**, never personId: a sticker is per version of a person, so owning
 * Buffon 90 discounts that card and not Buffon 88.
 *
 * `owned` may be null/undefined (the album is off, or the caller has no set), in which
 * case this is exactly `priceOf(player.elo)`.
 */
export function priceFor(player: Player, owned?: Set<string> | null): number {
  const base = priceOf(player.elo);
  if (!owned?.has(player.id)) return base;
  return Math.max(1, Math.round(base * (1 - STICKER_DISCOUNT)));
}

/** A price function bound to one collection, for the places that price many players
 *  (the market list, the line-up column, the auto-fill spender). */
export type Pricer = (player: Player) => number;

/** Build a `Pricer` for a given collection. With no set it is the plain curve. */
export function pricerFor(owned?: Set<string> | null): Pricer {
  return (player) => priceFor(player, owned);
}
