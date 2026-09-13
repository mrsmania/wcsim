import type { Rarity } from '../../domain/boons';
import type { RunOutcome } from '../../domain/run';
import { TIER_META } from '../stickerTheme';

/**
 * The boon rarity ramp: THREE CATEGORIES, SO THREE HUES.
 *
 * It used to be the sticker tier ramp outright (gold, amber, green), and that is a ladder
 * of preciousness rather than a set of labels - which is exactly how it reads on an album
 * page and exactly why it failed here. A boost card marks its rarity with a 3px strip and
 * one 9px word, and the top two rungs of that ladder are both warm oranges: #c99a3a gold
 * beside #e4922b amber, a hue apart by about eight degrees. Reported from the game as
 * rare and legendary being "veeery close", and they were.
 *
 * So rare is BLUE, which is the one direction that is far from both the green and the gold
 * and is what a rarity ramp conventionally does anyway. The value is picked at the common
 * green's own lightness (0.235 against 0.212) rather than at the amber's, because these
 * three are peers: a strip that is lighter than its neighbours reads as more important
 * before anybody has learned what the colour means, which is the ladder problem again.
 *
 * Legendary and common still take the sticker accents by reference, so the gold cannot
 * drift from the trophy and the album, and only the middle rung is the ramp's own value.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: TIER_META.monumental.accent,
  rare: '#3b82f6',
  common: TIER_META.legendary.accent,
};

/**
 * The rarity word as TEXT, which is a different value from the rarity as a SURFACE.
 *
 * `RARITY_COLOR` above is right for the strip across the top of a card, which is a
 * surface. Printed as a 9px bold LABEL on the panel every one of the three missed AA:
 * gold 2.57, the old amber 2.49, the blue 3.68 and the common green 4.00 light / 4.17
 * dark, against the 4.5 a label that size needs (the relaxed 3:1 is for 18.66px bold and
 * larger). This is the same split `--color-amber-ink` and `--color-pitch-ink` already
 * exist for, so it is spent as CLASSES rather than hexes: an `-ink` token flips between
 * the themes and a hex in a JS map cannot.
 *
 * The three inks separate as far as the three surfaces do, which took the new token to
 * get: `gold-ink` and `amber-ink` are #7d5f10 and #8a5a0f on paper - the same dark olive
 * twice - so a ramp whose STRIPS had been pulled apart would still have printed two of its
 * three words in one colour.
 */
export const RARITY_INK: Record<Rarity, string> = {
  legendary: 'text-gold-ink',
  rare: 'text-rare-ink',
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
