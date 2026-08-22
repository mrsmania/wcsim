/**
 * Form: the Cup Run's in-run currency.
 *
 * Earned from results as the run is played, spent at shop nodes between rounds, and
 * **discarded with the run**. That last part is the whole distinction from Prestige, which
 * is the career-level currency that survives a run and buys perk tiers and boost unlocks.
 * Form never leaves the run it was earned in, so it can be handed out generously without
 * touching the career economy at all.
 *
 * It also gives a reason to care about the margin rather than only the result: a 3-0 pays
 * better than a 1-0, where nothing in the run distinguished them before.
 *
 * Deliberately NOT multiplied by Ascension. The tier already multiplies the XP and Prestige
 * a run pays out at its END, which is the right place for a difficulty reward. Scaling an
 * in-run currency by it would hand a harder run more spending power while it is still being
 * played, which makes the hard tier easier mid-flight - backwards.
 */

/** A win, a draw, a defeat. */
export const FORM_WIN = 3;
export const FORM_DRAW = 1;
export const FORM_LOSS = 0;
/** One extra per goal of winning margin beyond the first, capped so a rout against a weak
 *  draw cannot fund a whole shop by itself. */
export const FORM_MARGIN_CAP = 2;

/** Form earned for one result, from the user's point of view. */
export function formFor(us: number, them: number): number {
  if (us < them) return FORM_LOSS;
  if (us === them) return FORM_DRAW;
  return FORM_WIN + Math.min(FORM_MARGIN_CAP, us - them - 1);
}

/** Form earned across several results. */
export const formForAll = (results: { us: number; them: number }[]): number =>
  results.reduce((sum, r) => sum + formFor(r.us, r.them), 0);
