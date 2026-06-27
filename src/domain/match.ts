import type { Player } from '../data/types';
import { categoryOf } from '../data/types';

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
  const attack = players.filter((p) => ['MID', 'FWD'].includes(categoryOf(p.positions[0]))).map((p) => p.elo);
  const defense = players.filter((p) => ['GK', 'DEF'].includes(categoryOf(p.positions[0]))).map((p) => p.elo);
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
    const cat = categoryOf(p.positions[0]);
    const weight = cat === 'FWD' ? 4 : cat === 'MID' ? 2 : cat === 'DEF' ? 1 : 0;
    for (let i = 0; i < weight; i++) names.push(p.name);
  }
  return names.length ? names : players.map((p) => p.name);
}

const BASE_GOALS = 1.35;
const PER_RATING_POINT = 0.06;

function expectedGoals(attack: number, defense: number): number {
  return Math.max(0.15, Math.min(4.5, BASE_GOALS + (attack - defense) * PER_RATING_POINT));
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

/** Simulate a 90-minute match. Goals are Poisson-distributed from each side's
 *  attack vs the other's defense; goal minutes and scorers are random. */
export function simulateMatch(home: Side, away: Side): MatchResult {
  const homeGoals = poisson(expectedGoals(home.strength.attack, away.strength.defense));
  const awayGoals = poisson(expectedGoals(away.strength.attack, home.strength.defense));

  const events: MatchEvent[] = [];
  const addGoals = (n: number, side: 'home' | 'away', scorers: string[]) => {
    for (let i = 0; i < n; i++) {
      events.push({ minute: 1 + Math.floor(Math.random() * 90), side, scorer: pick(scorers) ?? 'Unknown' });
    }
  };
  addGoals(homeGoals, 'home', home.scorers);
  addGoals(awayGoals, 'away', away.scorers);
  events.sort((a, b) => a.minute - b.minute || (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1));

  return { homeGoals, awayGoals, events };
}
