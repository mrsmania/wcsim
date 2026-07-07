import type { Rarity } from '../../domain/boons';
import type { RunOutcome, RunState, UserMatch, KoMatch } from '../../domain/run';
import type { GroupState, GroupTeam } from '../../domain/tournament';
import { TIER_META } from '../StickerCard';

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
}

/** The live-reveal state: which match(es) are being played out before the run
 *  commits to `next`. Transient (not persisted) - a refresh mid-reveal drops back
 *  to the pre-play run, which just replays. The group carries its final table +
 *  a `done` flag so the standings show after the three matches, before committing. */
export type Reveal =
  | { kind: 'group'; next: RunState; matches: UserMatch[]; group: GroupState; index: number; done: boolean }
  | { kind: 'ko'; next: RunState; match: KoMatch; opp: GroupTeam; roundName: string };

/** The win result headline for a finished knockout tie. */
export function koWinHeading(m: KoMatch): string {
  if (m.decided === 'pens') return 'Won on penalties';
  if (m.decided === 'aet') return `Won ${m.userGoals}-${m.oppGoals} (a.e.t.)`;
  return `Won ${m.userGoals}-${m.oppGoals}`;
}
