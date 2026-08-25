import type { Player, Position } from '../data/types';
import { isAttacker, isDefender, primaryPosition } from '../data/types';
import { pick } from './random';

export interface Strength {
  attack: number;
  defense: number;
  overall: number;
}

export interface MatchEvent {
  minute: number;
  side: 'home' | 'away';
  scorer: string;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
}

/** One candidate scorer and how likely he is relative to his team-mates. */
export interface ScorerWeight {
  name: string;
  weight: number;
}

/** A candidate scorer pool. A bare string is a LEGACY entry, weight 1: the pool used to
 *  be a `string[]` with a player's name repeated once per point of weight, so reading
 *  each entry as 1 reproduces the old distribution exactly. That matters because a
 *  `GroupTeam` is persisted (the game state, the active run, and a run's drawn
 *  `nextOpponent`), so a match in flight when this shipped keeps its old pool. */
export type ScorerPool = readonly (ScorerWeight | string)[];

/** A participant in a single match. */
export interface Side {
  strength: Strength;
  /** Candidate scorers with their relative weights (see `scorerPool`). */
  scorers: ScorerPool;
}

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

/** The two group averages the sim reads, UNROUNDED and with no empty-line fallback.
 *
 *  This is `xiStrength`'s core, exported because the boon-power table needs to measure
 *  movement in fractions of a point: rounding each side before subtracting turns a +0.4
 *  into 0 or 1 depending on where the two happened to sit. It had a local copy in the
 *  checks harness, which meant a change to the GROUPING here would leave the table
 *  measuring the old one while still passing (hygiene H97).
 *
 *  An empty line reads 0, as it does in `lineAverages` and for the same reason - a
 *  fallback to the overall would be a claim about a line that has nobody in it. The
 *  callers that need the fallback (a match cannot be simulated against nothing) apply it
 *  themselves, which is `xiStrength` below. */
export function groupAverages(players: Player[]): { attack: number; defense: number } {
  return {
    attack: avg(players.filter(isAttacker).map((p) => p.elo)),
    defense: avg(players.filter(isDefender).map((p) => p.elo)),
  };
}

/** Strength of a set of players, split into attack (MID/FWD) and defense (GK/DEF). */
export function xiStrength(players: Player[]): Strength {
  const all = players.map((p) => p.elo);
  const { attack, defense } = groupAverages(players);
  const overall = avg(all);
  return {
    // An empty line falls back to the overall here: a match has to be simulated against
    // something, and `groupAverages` deliberately does not make that choice.
    attack: Math.round(attack || overall),
    defense: Math.round(defense || overall),
    overall: Math.round(overall),
  };
}

/**
 * The build page's rating cells, which are `xiStrength`'s numbers measured on a PARTIAL
 * XI. The split is deliberately the SAME - attack is MID+FWD, defence is GK+DEF - so the
 * figure you build against is the figure the simulator reads (audit decision D7, answered
 * 2026-08-25). It used to be forwards only under the same "Att" label, which meant one XI
 * read Att 88 on the build page and Att 81 the moment its run started, with nothing having
 * changed; the run screen's panel has always shown these groups, which is also why it has
 * no Mid cell to match - the midfielders are inside Att.
 *
 * The one difference left, and the reason this is not just a call to `xiStrength`: a line
 * with nobody in it reads 0 here, which the screen renders as a dash. `xiStrength` falls
 * back to the overall, because a match cannot be simulated against nothing - and on a
 * half-built XI that fallback would be a lie (three centre-backs and no attackers is not
 * an attack of 78).
 *
 * Keys off `positions[0]`, which `placedPlayers` promotes to the slot the player fills, so
 * these are the lines as they are PLAYED.
 */
export function lineAverages(players: Player[]): Strength {
  const mean = (xs: Player[]) => (xs.length ? Math.round(avg(xs.map((p) => p.elo))) : 0);
  return {
    overall: mean(players),
    attack: mean(players.filter(isAttacker)),
    defense: mean(players.filter(isDefender)),
  };
}

/**
 * How likely each POSITION is to score, relative to the others. Replaces the old
 * four-band weighting by category (FWD 4 / MID 2 / DEF 1 / GK 0), which had two
 * consequences nobody wanted once goals became visible on the cabinet's top-scorer
 * board: an attacking midfielder scored at exactly a holding midfielder's rate, and an
 * AM at half a striker's, because the band was flat inside a category.
 *
 * Read against a full-back at 1.0: a striker is ~4.4x, a winger 3.6x, an AM 3x, a
 * central midfielder 2x, a holding midfielder 1.2x, a centre-back 0.8x. A keeper never
 * scores from open play (he still takes his turn in a shootout, which is a separate
 * pool). The ordering is asserted in `npm run checks` so it cannot drift quietly.
 *
 * NOTE this keys off `positions[0]`, which `placedPlayers` promotes to the slot the
 * player was placed in - so it is where he is PLAYED, not what the dataset calls him.
 * Playing a winger at striker really does make him score more.
 */
export const POSITION_WEIGHT: Record<Position, number> = {
  GK: 0,
  CB: 0.8,
  LB: 1,
  RB: 1,
  DM: 1.2,
  CM: 2,
  LM: 2.2,
  RM: 2.2,
  AM: 3,
  LW: 3.6,
  RW: 3.6,
  ST: 4.4,
};

/** Where the rating tilt is neutral, and how steep it is. Deliberately mild: at 0.02
 *  per point a 99 is 1.48x a 75 and 2.1x a 60, so the shape of the XI still decides
 *  most of who scores while a genuine star stands out from the squad player beside him.
 *  Before this, rating was ignored entirely - a 99 striker and an 80 striker in the same
 *  XI were exactly as likely, while `penTakersFrom` already sorted penalties by rating.
 *
 *  It is bounded, not neutralised: no rating gap the dataset allows can turn a defender
 *  into an attacker (the worst possible attacker still outweighs the best possible
 *  defender, asserted in the checks). ADJACENT lines are deliberately crossable though -
 *  a 99 full-back edges a 60 central midfielder, which is the tilt earning its keep. */
const RATING_PIVOT = 75;
const RATING_PER_POINT = 0.02;

/** A player's scoring weight: his position, tilted by his rating. */
export function scorerWeight(player: Player): number {
  const base = POSITION_WEIGHT[primaryPosition(player)] ?? 0;
  if (base === 0) return 0;
  // Floored well above zero so no rating the dataset allows (ELO_MIN is 60, giving
  // 0.7) can make a player unable to score, or invert the position ordering.
  const tilt = Math.max(0.2, 1 + (player.elo - RATING_PIVOT) * RATING_PER_POINT);
  return base * tilt;
}

/** Weighted scorer pool: forwards likeliest, midfielders less, defenders rare, GK never
 *  - and within a line, the better player more often. An XI of nothing but keepers (no
 *  weight at all) falls back to everyone equally likely rather than nobody scoring. */
export function scorerPool(players: Player[]): ScorerWeight[] {
  const pool = players.map((p) => ({ name: p.name, weight: scorerWeight(p) }));
  return pool.some((s) => s.weight > 0) ? pool : players.map((p) => ({ name: p.name, weight: 1 }));
}

/** One scorer drawn from a pool, proportional to weight. Tolerates the legacy
 *  `string[]` shape (see `ScorerPool`) and a pool whose weights are all zero. */
export function pickScorer(pool: ScorerPool): string | undefined {
  if (!pool.length) return undefined;
  const weightOf = (s: ScorerWeight | string) => (typeof s === 'string' ? 1 : s.weight);
  const nameOf = (s: ScorerWeight | string) => (typeof s === 'string' ? s : s.name);
  let total = 0;
  for (const s of pool) total += Math.max(0, weightOf(s));
  if (total <= 0) return nameOf(pick(pool));
  let roll = Math.random() * total;
  for (const s of pool) {
    roll -= Math.max(0, weightOf(s));
    if (roll < 0) return nameOf(s);
  }
  // Only reachable on a floating-point edge; the last eligible entry is the answer.
  return nameOf(pool[pool.length - 1]);
}

const BASE_GOALS = 1.3;
const PER_RATING_POINT = 0.08;

/** Reference rating: the point where a side has neither an attacking nor a
 *  defending edge. Shared with the opponent-draw weighting and the penalty
 *  conversion curve so the whole sim is calibrated to one baseline. */
export const REFERENCE_RATING = 78;

/** Expected goals for a side, driven by its own attack vs the opponent's defense
 *  (not team overall). A clear edge produces a clear scoreline edge (less
 *  coin-flippy). */
function expectedGoals(myAttack: number, oppDefense: number): number {
  return Math.max(0.15, Math.min(4.5, BASE_GOALS + (myAttack - oppDefense) * PER_RATING_POINT));
}

/** Knuth's Poisson sampler. */
function poisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Chronological event order: earliest minute first; on the same minute, home
 *  before away (a stable, deterministic tiebreak for the goal feed). */
function eventOrder(a: MatchEvent, b: MatchEvent): number {
  return a.minute - b.minute || (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1);
}

/** Full time, and one period of extra time, in minutes. */
export const REG_MINUTES = 90;
export const ET_MINUTES = 30;
/** Kicks each side takes before a shootout goes to sudden death. Named because the rule
 *  appeared three times in one function - the two "can they still catch up" remainders and
 *  the loop bound - and they have to be the same five. */
const SHOOTOUT_ROUNDS = 5;

/** Simulate one scoring period. `lambdaScale` scales the regulation goal rate
 *  (1 for a full match, 30/90 for extra time); goal minutes fall in
 *  `minuteBase .. minuteBase + minuteSpan - 1`. */
function simulatePeriod(
  home: Side,
  away: Side,
  opts: { minuteBase: number; minuteSpan: number; lambdaScale: number },
): MatchResult {
  const { minuteBase, minuteSpan, lambdaScale } = opts;
  const homeGoals = poisson(expectedGoals(home.strength.attack, away.strength.defense) * lambdaScale);
  const awayGoals = poisson(expectedGoals(away.strength.attack, home.strength.defense) * lambdaScale);

  const events: MatchEvent[] = [];
  const addGoals = (n: number, side: 'home' | 'away', scorers: ScorerPool) => {
    for (let i = 0; i < n; i++) {
      events.push({
        minute: minuteBase + Math.floor(Math.random() * minuteSpan),
        side,
        scorer: pickScorer(scorers) ?? 'Unknown',
      });
    }
  };
  addGoals(homeGoals, 'home', home.scorers);
  addGoals(awayGoals, 'away', away.scorers);
  events.sort(eventOrder);

  return { homeGoals, awayGoals, events };
}

/** Simulate a 90-minute match. Goals are Poisson-distributed from each side's
 *  attack vs the other's defense; goal minutes and scorers are random. */
export function simulateMatch(home: Side, away: Side): MatchResult {
  return simulatePeriod(home, away, { minuteBase: 1, minuteSpan: REG_MINUTES, lambdaScale: 1 });
}

/** Simulate a 30-minute extra-time period (a third of a match's scoring rate).
 *  Goal minutes fall in 91..120 so events read after the regulation feed. */
export function simulateExtraTime(home: Side, away: Side): MatchResult {
  return simulatePeriod(home, away, {
    minuteBase: REG_MINUTES + 1,
    minuteSpan: ET_MINUTES,
    lambdaScale: ET_MINUTES / REG_MINUTES,
  });
}

/** A single penalty kick in a shootout. */
export interface PenKick {
  side: 'home' | 'away';
  taker: string;
  scored: boolean;
}

export interface ShootoutResult {
  kicks: PenKick[];
  home: number;
  away: number;
  homeWon: boolean;
}

/** A shootout participant: penalty takers, best first. */
export interface ShootoutTeam {
  penTakers: { name: string; elo: number }[];
}

// Penalty conversion curve: a baseline rate at the reference rating, tilted by
// the taker's quality and clamped to a sane range.
const PEN_BASE = 0.74; // conversion at REFERENCE_RATING
const PEN_SLOPE = 0.006; // conversion gained per rating point above reference
const PEN_MIN = 0.55; // floor on conversion probability
const PEN_MAX = 0.92; // ceiling on conversion probability

/** Per-kick conversion probability, nudged by the taker's quality. */
function penProb(elo: number): number {
  return Math.max(PEN_MIN, Math.min(PEN_MAX, PEN_BASE + (elo - REFERENCE_RATING) * PEN_SLOPE));
}

/** Safety bound on sudden-death rounds. With per-kick conversion strictly below
 *  1 the shootout resolves almost surely long before this; it only guards
 *  against a pathological infinite loop. */
const MAX_SUDDEN_DEATH_ROUNDS = 20;

/** A penalty shootout taken one kick at a time, best takers first (reused in
 *  order for sudden death). Standard best-of-five with early clinching, then
 *  sudden death. Always returns a winner, and records every kick for replay. */
export function simulateShootout(home: ShootoutTeam, away: ShootoutTeam): ShootoutResult {
  const kicks: PenKick[] = [];
  let h = 0;
  let a = 0;

  const kick = (side: 'home' | 'away') => {
    const takers = side === 'home' ? home.penTakers : away.penTakers;
    const taken = kicks.filter((k) => k.side === side).length;
    const taker = takers.length ? takers[taken % takers.length] : { name: 'Unknown', elo: 75 };
    const scored = Math.random() < penProb(taker.elo);
    if (scored) side === 'home' ? h++ : a++;
    kicks.push({ side, taker: taker.name, scored });
  };

  // Decided once the trailing side can no longer catch up within the first five.
  const settled = () => {
    const hRem = Math.max(0, SHOOTOUT_ROUNDS - kicks.filter((k) => k.side === 'home').length);
    const aRem = Math.max(0, SHOOTOUT_ROUNDS - kicks.filter((k) => k.side === 'away').length);
    return h > a + aRem || a > h + hRem;
  };

  let decidedEarly = false;
  for (let round = 0; round < SHOOTOUT_ROUNDS && !decidedEarly; round++) {
    kick('home');
    if (settled()) { decidedEarly = true; break; }
    kick('away');
    if (settled()) decidedEarly = true;
  }

  if (!decidedEarly) {
    let guard = 0;
    while (h === a && guard++ < MAX_SUDDEN_DEATH_ROUNDS) {
      kick('home');
      kick('away');
    }
    // Effectively unreachable safety net: if sudden death somehow never
    // separated the sides, break the tie with a fair coin flip (a scored kick
    // for the winner) rather than always favouring home, so `kicks` still
    // reconstructs the reported score.
    if (h === a) {
      const winner: 'home' | 'away' = Math.random() < 0.5 ? 'home' : 'away';
      const takers = winner === 'home' ? home.penTakers : away.penTakers;
      if (winner === 'home') h++;
      else a++;
      kicks.push({ side: winner, taker: takers[0]?.name ?? 'Unknown', scored: true });
    }
  }

  return { kicks, home: h, away: a, homeWon: h > a };
}
