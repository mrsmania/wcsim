import { SQUADS } from '../data/squads';
import { penaltyShootout, simulateExtraTime, simulateMatch, type MatchResult, type Side } from './match';
import { squadGroupTeam, type GroupTeam } from './tournament';

/** Knockout rounds the user must win, in order, to be crowned champion. */
export const KO_ROUNDS = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'] as const;
export type KoRoundName = (typeof KO_ROUNDS)[number];

/** How a tie was settled. */
export type KoDecided = 'reg' | 'aet' | 'pens';

/** One round on the user's knockout path. */
export interface KoTie {
  /** The drawn opponent for this round. */
  opponent: GroupTeam;
  /** Combined regulation + extra-time result, once the round has been played. */
  result?: MatchResult;
  decided?: KoDecided;
  /** Shootout tally (user vs opponent), present only when decided by penalties. */
  pens?: { user: number; opp: number };
  userWon?: boolean;
}

export interface KnockoutState {
  /** The user's drafted XI as a match team (carried over from the group stage). */
  user: GroupTeam;
  /** Squad ids never to be drawn again (group opponents + already-faced KO teams). */
  faced: string[];
  /** One entry per reached round; `rounds[current]` is in progress. */
  rounds: KoTie[];
  /** Index into KO_ROUNDS of the round in progress. */
  current: number;
  outcome: 'alive' | 'champion' | 'out';
}

/** Draw a random squad as the next opponent, avoiding any already faced. */
export function drawOpponent(faced: Set<string>): GroupTeam {
  const pool = SQUADS.filter((s) => !faced.has(s.id));
  const src = pool.length ? pool : SQUADS;
  return squadGroupTeam(src[Math.floor(Math.random() * src.length)]);
}

/** Start the knockout run: the user enters the Round of 16 against a fresh draw. */
export function createKnockout(user: GroupTeam, excludeIds: string[]): KnockoutState {
  const faced = new Set(excludeIds);
  const opponent = drawOpponent(faced);
  faced.add(opponent.id);
  return { user, faced: [...faced], rounds: [{ opponent }], current: 0, outcome: 'alive' };
}

/** Outcome of a single knockout match: regulation, then extra time, then a
 *  shootout if still level, so there is always a winner. The user is treated
 *  as the home side. */
export interface KoResult {
  result: MatchResult;
  decided: KoDecided;
  pens?: { user: number; opp: number };
  userWon: boolean;
}

const sideOf = (t: GroupTeam): Side => ({ strength: t.strength, scorers: t.scorers });

export function playKnockout(user: GroupTeam, opponent: GroupTeam): KoResult {
  const u = sideOf(user);
  const o = sideOf(opponent);

  const reg = simulateMatch(u, o);
  if (reg.homeGoals !== reg.awayGoals) {
    return { result: reg, decided: 'reg', userWon: reg.homeGoals > reg.awayGoals };
  }

  const et = simulateExtraTime(u, o);
  const combined: MatchResult = {
    homeGoals: reg.homeGoals + et.homeGoals,
    awayGoals: reg.awayGoals + et.awayGoals,
    events: [...reg.events, ...et.events],
  };
  if (combined.homeGoals !== combined.awayGoals) {
    return { result: combined, decided: 'aet', userWon: combined.homeGoals > combined.awayGoals };
  }

  const sh = penaltyShootout(u, o);
  return { result: combined, decided: 'pens', pens: { user: sh.home, opp: sh.away }, userWon: sh.homeWon };
}
