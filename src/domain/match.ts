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

const BASE_GOALS = 1.3;
const PER_RATING_POINT = 0.08;

/** Expected goals for a side, driven by its overall rating vs the opponent's.
 *  A clear rating edge produces a clear scoreline edge (less coin-flippy). */
function expectedGoals(myOverall: number, oppOverall: number): number {
  return Math.max(0.15, Math.min(4.5, BASE_GOALS + (myOverall - oppOverall) * PER_RATING_POINT));
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
  const homeGoals = poisson(expectedGoals(home.strength.overall, away.strength.overall));
  const awayGoals = poisson(expectedGoals(away.strength.overall, home.strength.overall));

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

const ET_MINUTES = 30;

/** Simulate a 30-minute extra-time period (a third of a match's scoring rate).
 *  Goal minutes fall in 91..120 so events read after the regulation feed. */
export function simulateExtraTime(home: Side, away: Side): MatchResult {
  const scale = ET_MINUTES / 90;
  const homeGoals = poisson(expectedGoals(home.strength.overall, away.strength.overall) * scale);
  const awayGoals = poisson(expectedGoals(away.strength.overall, home.strength.overall) * scale);

  const events: MatchEvent[] = [];
  const addGoals = (n: number, side: 'home' | 'away', scorers: string[]) => {
    for (let i = 0; i < n; i++) {
      events.push({ minute: 91 + Math.floor(Math.random() * ET_MINUTES), side, scorer: pick(scorers) ?? 'Unknown' });
    }
  };
  addGoals(homeGoals, 'home', home.scorers);
  addGoals(awayGoals, 'away', away.scorers);
  events.sort((a, b) => a.minute - b.minute || (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1));

  return { homeGoals, awayGoals, events };
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

/** Per-kick conversion probability, nudged by the taker's quality. */
function penProb(elo: number): number {
  return Math.max(0.55, Math.min(0.92, 0.74 + (elo - 78) * 0.006));
}

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
    while (h === a && guard++ < 20) {
      kick('home');
      kick('away');
    }
    if (h === a) {
      h++;
      kicks.push({ side: 'home', taker: home.penTakers[0]?.name ?? 'Unknown', scored: true });
    }
  }

  return { kicks, home: h, away: a, homeWon: h > a };
}
