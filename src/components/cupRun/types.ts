import type { Rarity } from '../../domain/boons';
import type { RunOutcome } from '../../domain/run';
import { TIER_META } from '../stickerTheme';

/**
 * The boon rarity ramp: the app's own green -> amber -> gold, which is a LADDER, and a
 * ladder is the right shape for rarity. The trouble was never the choice of colours, it
 * was that two rungs of it are eight degrees of hue apart: #e4922b amber beside #c99a3a
 * gold, and as text an even closer pair (see `RARITY_INK`). Reported from the game as
 * rare and legendary being "veeery close", and they were.
 *
 * A BLUE WAS TRIED FOR RARE AND REVERTED THE SAME DAY. Three well-separated hues is what
 * a rarity ramp conventionally does and it solves the reading outright - and it is not
 * this app, which is green paper, pitch green, amber and trophy gold and has no cool
 * accent anywhere in it. A ramp that reads perfectly and belongs to a different product
 * is not an improvement. The colours stay; what carries the distinction is `RARITY_STEP`
 * below, which is not a colour at all.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: TIER_META.monumental.accent,
  rare: TIER_META.iconic.accent,
  common: TIER_META.legendary.accent,
};

/**
 * RARITY AS A COUNT, which is the half that does the work.
 *
 * `TierPips` in `challengeUi` already decided this for the honours ledger, in as many
 * words: a tier "is a scale rather than a category", so it is drawn as filled slots and
 * `TIER_COLOR` was deleted. The trophy cabinet reached the same place independently -
 * rank is one hue deepening plus a numeral, not six colours. Rarity is the same kind of
 * fact, so it is counted: one pip, two, three. A count cannot be close to another count,
 * which is what makes this hold at 9px, on a phone, in either theme, and for a player who
 * cannot tell the amber from the gold at all.
 */
export const RARITY_STEP: Record<Rarity, number> = { common: 1, rare: 2, legendary: 3 };

/**
 * How the boost library lists thirty-two cards: RAREST FIRST, then alphabetically.
 *
 * It was in catalogue order, which is the order the cards were WRITTEN in - six on new
 * levers here, three payout cards there - and that is a fact about the file's history and
 * about nothing a player can see. So the shelf had no order at all: neither "what is this
 * worth" nor "where is the one I am looking for" could be answered by scanning it.
 *
 * Rarest first, because that is what the album already does (`STICKER_TIER_ORDER` runs
 * Monumental down) and a shelf of collectible things reading best-first is the one
 * convention this app has for the question. The name breaks every tie, so the position of
 * a card never depends on anything but the card - adding one to the catalogue cannot
 * shuffle the others, which is exactly what catalogue order did.
 *
 * Plain `localeCompare` on the whole name, so "The Armband" files under T. Skipping a
 * leading "The" is a nicety that makes the rule harder to state than to follow.
 */
export function byRarityThenName(
  a: { rarity: Rarity; name: string },
  b: { rarity: Rarity; name: string },
): number {
  return RARITY_STEP[b.rarity] - RARITY_STEP[a.rarity] || a.name.localeCompare(b.name);
}

/**
 * The 3px bar across the top of a boost card, as a `background-image` rather than a
 * border, so the top rung can be the album's GOLD FOIL - a border takes a colour and this
 * takes a gradient. The flat two go through the same mechanism (a gradient of one colour
 * twice) rather than one card being painted a different way from its neighbours.
 *
 * The foil is what separates the two warm rungs as a SURFACE, and it is the album's own
 * value rather than a new one: a Monumental sticker wears it, so the metallic sweep
 * already means "the top tier of something" everywhere else in the game. Beside it the
 * amber reads as flat orange, which is the whole point.
 */
export const RARITY_STRIP: Record<Rarity, string> = {
  legendary: TIER_META.monumental.strip,
  rare: `linear-gradient(${RARITY_COLOR.rare},${RARITY_COLOR.rare})`,
  common: `linear-gradient(${RARITY_COLOR.common},${RARITY_COLOR.common})`,
};

/**
 * The rarity word as TEXT, which is a different value from the rarity as a SURFACE.
 *
 * `RARITY_COLOR` above is right for the strip across the top of a card, which is a
 * surface. Printed as a 9px bold LABEL on the panel all three missed AA: gold 2.57, amber
 * 2.49 and the common green 4.00 light / 4.17 dark, against the 4.5 a label that size
 * needs (the relaxed 3:1 is for 18.66px bold and larger). This is the same split
 * `--color-amber-ink` and `--color-pitch-ink` already exist for, so it is spent as
 * CLASSES rather than hexes: an `-ink` token flips between the themes and a hex in a JS
 * map cannot.
 *
 * KNOWN AND ACCEPTED: two of these three are the same colour to the eye. On paper
 * `gold-ink` is #7d5f10 and `amber-ink` #8a5a0f, five degrees of hue apart, and on
 * graphite they converge with their surfaces and stay close. There is no fixing it from
 * here - AA at 9px forces both warm values down into the same dark olive, and the way out
 * is a third hue, which is the blue this app turned down. So the word is not asked to
 * carry the distinction: `RARITY_STEP` counts it and the foil marks the top rung, and
 * these values are left doing what they are good at, which is not being a contrast
 * failure.
 */
export const RARITY_INK: Record<Rarity, string> = {
  legendary: 'text-gold-ink',
  rare: 'text-amber-ink',
  common: 'text-pitch-ink',
};

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  group: 'the group stage',
  r16: 'the Round of 16',
  qf: 'the Quarter-finals',
  sf: 'the Semi-finals',
  final: 'the Final',
  champion: 'World Cup Champions',
};

export const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);

export interface Reward {
  xpGained: number;
  prestigeGained: number;
  leveledUp: boolean;
  /** The Ascension reward multiplier the run was scored at (1 = Base). */
  ascensionMult: number;
  /** Challenges this run completed (ids), and the Prestige they paid on top. */
  challenges: string[];
  challengePrestige: number;
}

/** Re-exported so the components that render a reveal keep importing it from here. It is
 *  DEFINED in `domain/run.ts`: it is a view-model over domain types and the persistence
 *  seam reads it, so the presentation layer is the wrong place to own it (hygiene H55). */
export type { Reveal } from '../../domain/run';

/** Re-exported from `matchView`, which now holds it next to `koResultLabel` - the two
 *  encode the same "how to word a win" fact (hygiene H68). */
export { koWinHeading } from '../matchView';
