// ---------------------------------------------------------------------------
// Ascension - the Cup Run difficulty ladder. Higher tiers hand the user a bigger
// handicap in their own matches and steepen the knockout draw toward stronger
// squads, in exchange for a larger XP/Prestige reward. Tiers are earned (win a cup
// at the tier below unlocks the next) and gated by career level. Pure data +
// helpers; no React or state. Both run.ts (applies the levers) and career.ts (the
// reward multiplier + unlock bookkeeping) read from here.
// ---------------------------------------------------------------------------

export interface Ascension {
  tier: number;
  label: string;
  /** Added to the user's attack + defense in their OWN matches (negative = harder).
   *  Reuses the same lever as the difficulty setting (see domain/difficulty.ts). */
  userDelta: number;
  /** Steepens the knockout opponent draw toward stronger squads (added to the base
   *  DRAW_WEIGHT_SLOPE in drawOpponent), so the field toughens as the tier rises. */
  drawSlopeBonus: number;
  /** Multiplies the run's XP + Prestige reward. */
  rewardMult: number;
  /** Career level required to select this tier. */
  levelReq: number;
}

/** First-pass ladder (tunable with scripts/checks.ts + domain/odds.ts). Base is
 *  always available; each step raises the handicap, the reward, and the level gate. */
export const ASCENSIONS: Ascension[] = [
  { tier: 0, label: 'Base', userDelta: 0, drawSlopeBonus: 0.0, rewardMult: 1.0, levelReq: 1 },
  { tier: 1, label: 'Ascension I', userDelta: -2, drawSlopeBonus: 0.02, rewardMult: 1.25, levelReq: 3 },
  { tier: 2, label: 'Ascension II', userDelta: -4, drawSlopeBonus: 0.04, rewardMult: 1.5, levelReq: 6 },
  { tier: 3, label: 'Ascension III', userDelta: -6, drawSlopeBonus: 0.06, rewardMult: 1.8, levelReq: 10 },
  { tier: 4, label: 'Ascension IV', userDelta: -8, drawSlopeBonus: 0.08, rewardMult: 2.2, levelReq: 15 },
  { tier: 5, label: 'Ascension V', userDelta: -10, drawSlopeBonus: 0.1, rewardMult: 2.7, levelReq: 20 },
];

export const MAX_ASCENSION = ASCENSIONS.length - 1;

/** A tier's data, clamped to the valid range (defensive against a stale save). */
export const ascensionAt = (tier: number): Ascension =>
  ASCENSIONS[Math.max(0, Math.min(tier, MAX_ASCENSION))];

/**
 * The highest tier the player may select this run: within their unlocked ceiling
 * (`unlocked` = the career's skill ceiling, raised by winning a cup at the tier
 * below) AND at/above each tier's level requirement. Always >= 0 (Base is free).
 */
export function maxSelectableAscension(unlocked: number, level: number): number {
  let max = 0;
  for (const a of ASCENSIONS) {
    if (a.tier <= unlocked && level >= a.levelReq) max = a.tier;
  }
  return max;
}
