import type { Player, Squad } from '../data/types';
import { SQUADS } from '../data/squads';
import type { GroupTeam } from './tournament';
import {
  USER_ID,
  userGroupTeam,
  createGroup,
  playWholeGroup,
  userAdvanced,
  bracketSeedFromGroup,
  pickOpponents,
  GROUP_OPPONENTS,
} from './tournament';
import type { BracketState } from './bracket';
import { buildBracket, playRound, recordRound } from './bracket';
import { KO_ROUNDS, LOST_IN, type Finish } from './knockout';

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
function simulateFinish(
  players: Player[],
  chemistryBonus: number,
  atkDefDelta: number,
  pool: readonly Squad[],
): Finish {
  const user = userGroupTeam(players, chemistryBonus, atkDefDelta);
  const group = playWholeGroup(createGroup(user, pickOpponents(GROUP_OPPONENTS, pool)));
  if (!userAdvanced(group)) return 'group';

  const { user: u, coQualifier, excludeIds } = bracketSeedFromGroup(group);
  let bracket = buildBracket(u, coQualifier, excludeIds, pool);
  // Play round by round to a resolution. The guard is a safety net on a loop whose bound is
  // structural: a bracket of KO_ROUNDS rounds resolves in at most that many iterations, so
  // anything past it means `playRound` stopped advancing. It read 8 against a comment saying
  // 4 - correct but arbitrary, and it would not have moved if the bracket grew.
  let guard = 0;
  while (bracket.outcome === 'alive' && guard++ < KO_ROUNDS.length) {
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
/** What to simulate against, beyond the XI and the number of runs. */
export interface TitleOddsOptions {
  /** The XI's chemistry bonus, which reaches attack and defence alike. */
  chemistryBonus?: number;
  /** The user's own rating delta (the difficulty setting plus the Ascension handicap). */
  atkDefDelta?: number;
  /** The squad pool to draw opponents from. */
  pool?: readonly Squad[];
}

export function simulateTitleOdds(
  players: Player[],
  sims: number,
  opts: TitleOddsOptions = {},
): TitleOdds {
  const { chemistryBonus = 0, atkDefDelta = 0, pool = SQUADS } = opts;
  const counts: Record<Finish, number> = {
    group: 0,
    r16: 0,
    qf: 0,
    sf: 0,
    final: 0,
    champion: 0,
  };
  for (let i = 0; i < sims; i++)
    counts[simulateFinish(players, chemistryBonus, atkDefDelta, pool)]++;

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

/* ---------------------------------------------------------------------------
 * The POSITION-AWARE pass: odds for the run as it actually stands.
 *
 * `simulateTitleOdds` above answers "how strong is this build" by replaying a fresh random
 * tournament from a group, which is the right question for the build page and the wrong one
 * at a boost stop. Roadmap item 05 measured how wrong: a card aimed at the next opponent
 * reads +0.4 there against +10.7 on the tie it exists for, and a card that lasts one round
 * is priced as five. Both faults are the same fault, and it is not a UI fault: the odds have
 * to start from THIS bracket, THIS next opponent and the rounds that are actually left.
 *
 * Two things make that honest. The bracket is closed - every one of the sixteen teams is
 * already in it - so this needs no squad pool and cannot draw an opponent the tree does not
 * show. And the user's side is asked for PER ROUND, so a card with a window
 * (`appliesFrom` / `expiresAfter`) lasts exactly as long as it says: that is the whole
 * reason the caller hands over a function rather than one team.
 * ------------------------------------------------------------------------- */

/** What the run is worth from here. Fractions of 1, like `TitleOdds`. */
export interface RunOdds {
  sims: number;
  /** Chance of winning the tie the run is about to play. */
  tie: number;
  /** Chance of going on to lift the cup. */
  cup: number;
}

export interface RunOddsInput {
  /** The bracket as it stands, with the user's next tie in `rounds[current]`. */
  bracket: BracketState;
  /** The user's side as it would be in that round. Called once per round, never per
   *  simulation, so an expensive XI derivation is paid four times rather than 24,000. */
  teamAt: (round: number) => GroupTeam;
  sims: number;
}

/**
 * Monte-Carlo the rest of a Cup Run from the bracket it is standing in, and report the
 * chance of winning the next tie and of lifting the cup.
 *
 * The two figures deliberately disagree, and that disagreement is the point: a card worth
 * +27 on this tie and nothing over the run is a card whose text says exactly that, and until
 * this existed the screen could not.
 */
export function simulateRunOdds({ bracket, teamAt, sims }: RunOddsInput): RunOdds {
  if (bracket.outcome !== 'alive') {
    return { sims: 0, tie: 0, cup: bracket.outcome === 'champion' ? 1 : 0 };
  }
  // The team a round is played with does not vary between simulations, so derive each
  // one once. `xiOf` replays the whole effect ledger and `chemistryOf` scores eleven
  // players, and both would otherwise run inside the hot loop.
  const teams: GroupTeam[] = [];
  for (let r = bracket.current; r < KO_ROUNDS.length; r++) teams[r] = teamAt(r);

  let tieWins = 0;
  let cups = 0;
  for (let i = 0; i < sims; i++) {
    let b = bracket;
    let firstRound = true;
    let wonTie = false;
    // Structural bound, like `simulateFinish`: a bracket resolves in at most one pass per
    // round, so overrunning means `recordRound` stopped advancing.
    let guard = 0;
    while (b.outcome === 'alive' && guard++ <= KO_ROUNDS.length) {
      const withUser: BracketState = {
        ...b,
        teams: { ...b.teams, [USER_ID]: teams[b.current] },
      };
      b = recordRound(withUser, playRound(withUser));
      if (firstRound) {
        // `recordRound` sets 'out' the moment the user loses, so surviving the first
        // round it plays IS winning the tie in front of them.
        wonTie = b.outcome !== 'out';
        firstRound = false;
      }
    }
    if (wonTie) tieWins++;
    if (b.outcome === 'champion') cups++;
  }
  return { sims, tie: tieWins / sims, cup: cups / sims };
}
