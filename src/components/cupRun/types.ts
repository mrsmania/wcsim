import type { Rarity } from '../../domain/boons';
import type { RunOutcome } from '../../domain/run';
import { TIER_META } from '../stickerTheme';

// The boon rarity ramp reuses the sticker tier accents (single source of the hexes;
// the amber/pitch values also match --color-amber / --color-pitch from index.css).
export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: TIER_META.monumental.accent,
  rare: TIER_META.iconic.accent,
  common: TIER_META.legendary.accent,
};

/**
 * The rarity word as TEXT, which is a different value from the rarity as a SURFACE.
 *
 * `RARITY_COLOR` above is the sticker tier ramp and it is right for the strip across the
 * top of a card, which is a surface. Printed as a 9px bold LABEL on the panel it missed AA
 * in both themes and badly in one: gold 2.57 and amber 2.49 against the light panel, and
 * the common green 4.00 light / 4.17 dark, against the 4.5 a label that size needs (the
 * relaxed 3:1 is for 18.66px bold and larger). This is the same split `--color-amber-ink`
 * and `--color-pitch-ink` already exist for, so it is spent as CLASSES rather than hexes:
 * an `-ink` token flips between the themes and a hex in a JS map cannot.
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
