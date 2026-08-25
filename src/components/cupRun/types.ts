import type { Rarity } from '../../domain/boons';
import type { RunOutcome, KoMatch } from '../../domain/run';
import { TIER_META } from '../stickerTheme';

// The boon rarity ramp reuses the sticker tier accents (single source of the hexes;
// the amber/pitch values also match --color-amber / --color-pitch from index.css).
export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: TIER_META.monumental.accent,
  rare: TIER_META.iconic.accent,
  common: TIER_META.legendary.accent,
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

/** The win result headline for a finished knockout tie. */
export function koWinHeading(m: KoMatch): string {
  if (m.decided === 'pens') return 'Won on penalties';
  if (m.decided === 'aet') return `Won ${m.userGoals}-${m.oppGoals} (a.e.t.)`;
  return `Won ${m.userGoals}-${m.oppGoals}`;
}
