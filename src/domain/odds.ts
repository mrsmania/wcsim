import type { Player } from '../data/types';
import {
  userGroupTeam,
  createGroup,
  simulateMatchday,
  recordMatchday,
  userAdvanced,
  bracketSeedFromGroup,
  pickOpponents,
  GROUP_MATCHDAYS,
} from './tournament';
import { buildBracket, playRound, recordRound } from './bracket';
import { LOST_IN, type Finish } from './knockout';

export type { Finish };

export interface TitleOdds {
  /** Number of tournaments simulated. */
  sims: number;
  /** Fraction (0-1) of runs that ended as champion. */
  champion: number;
  /** Fraction that reached the final (runner-up or champion). */
  finalist: number;
  /** Fraction that advanced out of the group. */
  advanced: number;
  /** Fraction ending at each stage; sums to 1. */
  distribution: Record<Finish, number>;
}

/** Simulate one full tournament (group + knockout) for `players` and report how
 *  far the user got. Mirrors the real game's flow: a random group, top-2 advance,
 *  then an elo-weighted 16-team bracket. */
function simulateFinish(players: Player[], chemistryBonus: number, atkDefDelta: number): Finish {
  const user = userGroupTeam(players, chemistryBonus, atkDefDelta);
  let group = createGroup(user, pickOpponents(3));
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    group = recordMatchday(group, simulateMatchday(group, md));
  }
  if (!userAdvanced(group)) return 'group';

  const { user: u, coQualifier, excludeIds } = bracketSeedFromGroup(group);
  let bracket = buildBracket(u, coQualifier, excludeIds);
  // Play round by round to a resolution (guard is a safety net; a 4-round bracket
  // always resolves in <= 4 iterations).
  let guard = 0;
  while (bracket.outcome === 'alive' && guard++ < 8) {
    bracket = recordRound(bracket, playRound(bracket));
  }
  if (bracket.outcome === 'champion') return 'champion';
  // Knocked out: `current` stays at the round the user lost in.
  return LOST_IN[bracket.current] ?? 'final';
}

/**
 * Monte-Carlo a squad's tournament odds: run the whole event `sims` times and
 * report how often the XI reaches each stage (and, headline, wins the cup). This
 * measures the STRENGTH OF THE BUILD rather than any single run's dice roll, so a
 * better squad scores higher with little variance. Pure except for the sim's own
 * `Math.random`; higher `sims` = steadier numbers. Cheap, but for a live UI readout
 * prefer a web worker (a few thousand sims is a brief burst of work).
 */
export function simulateTitleOdds(
  players: Player[],
  sims = 1500,
  chemistryBonus = 0,
  atkDefDelta = 0,
): TitleOdds {
  const counts: Record<Finish, number> = {
    group: 0,
    r16: 0,
    qf: 0,
    sf: 0,
    final: 0,
    champion: 0,
  };
  for (let i = 0; i < sims; i++) counts[simulateFinish(players, chemistryBonus, atkDefDelta)]++;

  const f = (n: number) => n / sims;
  const distribution: Record<Finish, number> = {
    group: f(counts.group),
    r16: f(counts.r16),
    qf: f(counts.qf),
    sf: f(counts.sf),
    final: f(counts.final),
    champion: f(counts.champion),
  };
  return {
    sims,
    champion: distribution.champion,
    finalist: distribution.final + distribution.champion,
    advanced: 1 - distribution.group,
    distribution,
  };
}
