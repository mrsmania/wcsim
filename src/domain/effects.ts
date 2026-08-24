import type { Player } from '../data/types';
import { ELO_MAX, ELO_MIN } from '../data/types';

/**
 * The effect ledger: what has been done to a Cup Run's XI, kept as a list rather than
 * baked into the players.
 *
 * Before this, a boost was applied by REWRITING the player objects (`Boon.apply` was
 * `(xi) => Player[]`, and `RunState.xi` was documented as "with any boon rating deltas
 * baked in"). Nothing recorded what had been applied or by how much, so nothing could
 * expire, nothing could be listed with its magnitude, and the run's ratings drifted from
 * the dataset - which is the whole reason `basePlayer` exists for the challenge catalogue
 * to work around.
 *
 * So a run now holds `roster` (who is in the XI, at DATASET ratings) and `effects` (what
 * has been done to them), and `xi` is derived from the two.
 *
 * **The inverse-transform trap.** The tempting alternative - subtract a boost back off when
 * it expires - is unsound, because `bump` clamps: a +2 on a 98 is really a +1, and taking 2
 * away afterwards is wrong by one. Replaying the whole ledger from the base roster has no
 * such problem, which is why that is what `xiOf` does.
 */

/** Who a rating effect hits. Concrete ids, RESOLVED WHEN THE EFFECT IS GRANTED - never a
 *  predicate re-evaluated later (see `xiOf`), and never a closure, since this is persisted
 *  to storage as JSON. */
export interface EffectTarget {
  ids: string[];
}

export interface RunEffect {
  /** Unique per application, so two Golden Generations are two separate effects. */
  id: string;
  /** What granted it: a boost id, a shop item id, an event option id. For display. */
  source: string;
  /** Human-readable label for the XI panel ("Golden Generation"). */
  label: string;
  target: EffectTarget;
  delta: number;
  /** The `koRound` this was granted on (the group grants at -1). */
  appliedAt: number;
  /** First `koRound` on which it applies. Absent = from the moment it was granted.
   *  Set by an effect that lands LATER than the card that caused it - a boost that
   *  borrows now and pays next round. */
  appliesFrom?: number;
  /** Last `koRound` on which it still applies. Absent = lasts the rest of the run, which
   *  is what most boosts do. Second Wind and Sold Out Stadium are the two that set it -
   *  the pair of fields is what makes "+6 now, -6 next round" expressible at all, and
   *  what the ledger exists for over the rewrite it replaced. */
  expiresAfter?: number;
}

/** Clamp a rating change into the dataset's range. The single copy of that rule; boons.ts
 *  imports it rather than keeping its own. */
export const bump = (p: Player, d: number): Player => ({
  ...p,
  elo: Math.max(ELO_MIN, Math.min(ELO_MAX, p.elo + d)),
});

/** Whether an effect is live on the given round. A window, open at both ends by
 *  default: most effects start when granted and never end. */
const effectActive = (e: RunEffect, atRound: number): boolean =>
  (e.appliesFrom === undefined || atRound >= e.appliesFrom) &&
  (e.expiresAfter === undefined || atRound <= e.expiresAfter);

/**
 * The XI as it is actually played: the base roster with every active effect applied.
 *
 * **Folded in order, clamping at EVERY step.** That is deliberate and reproduces the old
 * behaviour exactly, where each boost's own `bump` clamped as it was applied. Summing the
 * deltas and clamping once would give a different answer: a base 98 with +2 then -3 is 96
 * the old way (clamp to 99, then subtract 3) and 97 if summed first. Do not "simplify" this
 * to a sum.
 */
export function xiOf(roster: Player[], effects: RunEffect[], atRound: number): Player[] {
  let out = roster;
  for (const e of effects) {
    if (!effectActive(e, atRound)) continue;
    const ids = new Set(e.target.ids);
    out = out.map((p) => (ids.has(p.id) ? bump(p, e.delta) : p));
  }
  return out;
}
