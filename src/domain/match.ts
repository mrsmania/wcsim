import type { Player } from '../data/types';
import { categoryOf, primaryPosition, ATTACK_CATS, DEF_CATS } from '../data/types';

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

/** A participant in a single match. */
export interface Side {
  strength: Strength;
  /** Candidate scorer names, already weighted (forwards appear more often). */
  scorers: string[];
}

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

/** Strength of a set of players, split into attack (MID/FWD) and defense (GK/DEF). */
export function xiStrength(players: Player[]): Strength {
  const all = players.map((p) => p.elo);
  const attack = players.filter((p) => ATTACK_CATS.includes(categoryOf(primaryPosition(p)))).map((p) => p.elo);
  const defense = players.filter((p) => DEF_CATS.includes(categoryOf(primaryPosition(p)))).map((p) => p.elo);
  return {
    attack: Math.round(attack.length ? avg(attack) : avg(all)),
    defense: Math.round(defense.length ? avg(defense) : avg(all)),
    overall: Math.round(avg(all)),
  };
}

/** Weighted scorer pool: forwards likeliest, midfielders less, defenders rare, GK never. */
export function scorerPool(players: Player[]): string[] {
  const names: string[] = [];
  for (const p of players) {
    const cat = categoryOf(primaryPosition(p));
    const weight = cat === 'FWD' ? 4 : cat === 'MID' ? 2 : cat === 'DEF' ? 1 : 0;
    for (let i = 0; i < weight; i++) names.push(p.name);
  }
  return names.length ? names : players.map((p) => p.name);
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

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

/** Chronological event order: earliest minute first; on the same minute, home
 *  before away (a stable, deterministic tiebreak for the goal feed). */
function eventOrder(a: MatchEvent, b: MatchEvent): number {
  return a.minute - b.minute || (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1);
}

const REG_MINUTES = 90;
const ET_MINUTES = 30;

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
  const addGoals = (n: number, side: 'home' | 'away', scorers: string[]) => {
    for (let i = 0; i < n; i++) {
      events.push({ minute: minuteBase + Math.floor(Math.random() * minuteSpan), side, scorer: pick(scorers) ?? 'Unknown' });
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
    const hRem = Math.max(0, 5 - kicks.filter((k) => k.side === 'home').length);
    const aRem = Math.max(0, 5 - kicks.filter((k) => k.side === 'away').length);
    return h > a + aRem || a > h + hRem;
  };

  let decidedEarly = false;
  for (let round = 0; round < 5 && !decidedEarly; round++) {
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
