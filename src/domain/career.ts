import type { RunOutcome, RunState } from './run';
import { boonById, BOON_UNLOCK_COST } from './boons';
import { ascensionAt, MAX_ASCENSION } from './ascension';

// ---------------------------------------------------------------------------
// Manager Career - the persistent meta-layer over Cup Runs. Pure model: XP/level,
// Prestige currency, unlockable perks, and a trophy record. The run feeds this at
// its end; the perks feed back into the next run.
// ---------------------------------------------------------------------------

export interface CareerStats {
  runs: number;
  cups: number;
  bestScore: number;
  bestFinish: RunOutcome | null;
  /** Highest Ascension tier a cup has been won at (0 = only Base, shown when cups > 0). */
  bestCupAscension: number;
}

export interface CareerState {
  version: number;
  xp: number;
  level: number;
  prestige: number;
  /** Perk id -> owned tier (1-based). Absent / 0 = not owned. (v1 stored a boolean
   *  `unlocked: string[]`; the storage migration maps each owned perk to tier 1.) */
  perkLevels: Record<string, number>;
  /** Boon ids unlocked into the offer pool with Prestige (beyond the starter set). */
  unlockedBoons: string[];
  /** Highest Ascension tier UNLOCKED (0 = Base; raised to T+1 on a cup won at tier T).
   *  The tier PLAYED is chosen per run and lives on RunState. */
  ascension: number;
  stats: CareerStats;
}

export const INITIAL_CAREER: CareerState = {
  version: 2,
  xp: 0,
  level: 1,
  prestige: 0,
  perkLevels: {},
  unlockedBoons: [],
  ascension: 0,
  stats: { runs: 0, cups: 0, bestScore: 0, bestFinish: null, bestCupAscension: 0 },
};

/** Flat 100 XP per level - simple and readable. */
const XP_PER_LEVEL = 100;
export const levelForXp = (xp: number): number => 1 + Math.floor(xp / XP_PER_LEVEL);
/** XP accrued within the current level, and the amount needed for the next. */
export const levelProgress = (xp: number): { into: number; needed: number } => ({
  into: xp % XP_PER_LEVEL,
  needed: XP_PER_LEVEL,
});

/** Finish ordering, worst to best, for tracking a career-best. */
const FINISH_ORDER: RunOutcome[] = ['group', 'r16', 'qf', 'sf', 'final', 'champion'];
export const FINISH_LABEL: Record<RunOutcome, string> = {
  group: 'Group stage',
  r16: 'Round of 16',
  qf: 'Quarter-final',
  sf: 'Semi-final',
  final: 'Runner-up',
  champion: 'Champion',
};
function betterFinish(a: RunOutcome | null, b: RunOutcome | null): RunOutcome | null {
  if (!a) return b;
  if (!b) return a;
  return FINISH_ORDER.indexOf(b) > FINISH_ORDER.indexOf(a) ? b : a;
}

/** One purchasable step of a perk track. `cost` is Prestige for THIS tier; `levelReq`
 *  is the career level needed to buy it (this is where Level earns its keep). */
export interface PerkTier {
  level: number; // 1-based tier index
  description: string;
  cost: number;
  levelReq: number;
}

/** A perk track: several tiers bought in order, each stronger than the last. */
export interface Perk {
  id: string;
  name: string;
  tiers: PerkTier[];
}

export const PERKS: Perk[] = [
  {
    id: 'scout',
    name: 'Scout Network',
    tiers: [
      { level: 1, description: 'Start each run with 1 team boost applied.', cost: 25, levelReq: 1 },
      { level: 2, description: 'Start each run with 2 team boosts applied.', cost: 70, levelReq: 5 },
    ],
  },
  {
    id: 'deep-squad',
    name: 'Deep Squad',
    tiers: [
      { level: 1, description: '+1 to your entire XI at run start.', cost: 45, levelReq: 1 },
      { level: 2, description: '+2 to your entire XI at run start.', cost: 95, levelReq: 4 },
      { level: 3, description: '+3 to your entire XI at run start.', cost: 170, levelReq: 8 },
    ],
  },
  {
    id: 'extra-boon',
    name: 'Extra Choice',
    tiers: [
      { level: 1, description: '4 team boosts offered each round.', cost: 75, levelReq: 3 },
      { level: 2, description: '5 team boosts offered each round.', cost: 150, levelReq: 7 },
    ],
  },
];

export const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

/** The owned tier of a perk (0 = not owned). */
export const perkLevelOf = (career: CareerState, id: string): number => career.perkLevels[id] ?? 0;

/** The next unbought tier of a perk, or null if it is maxed / unknown. */
export function nextPerkTier(career: CareerState, id: string): PerkTier | null {
  const perk = perkById(id);
  if (!perk) return null;
  return perk.tiers[perkLevelOf(career, id)] ?? null; // owned N -> tiers[N] is tier N+1
}

/** Reward for a finished run applied to the career. Returns the updated career plus
 *  what was gained (for a one-shot "run rewards" readout). */
export interface RunReward {
  career: CareerState;
  xpGained: number;
  prestigeGained: number;
  leveledUp: boolean;
}
export function applyRunResult(career: CareerState, run: RunState): RunReward {
  // Ascension scales the run's reward; a cup win raises the unlocked ceiling + best.
  const mult = ascensionAt(run.ascension).rewardMult;
  const xpGained = Math.round(run.score * mult);
  const prestigeGained = Math.max(1, Math.round((run.score * mult) / 5));
  const xp = career.xp + xpGained;
  const level = levelForXp(xp);
  const outcome = run.outcome;
  const wonCup = outcome === 'champion';
  return {
    career: {
      ...career,
      xp,
      level,
      prestige: career.prestige + prestigeGained,
      ascension: wonCup
        ? Math.min(MAX_ASCENSION, Math.max(career.ascension, run.ascension + 1))
        : career.ascension,
      stats: {
        runs: career.stats.runs + 1,
        cups: career.stats.cups + (wonCup ? 1 : 0),
        bestScore: Math.max(career.stats.bestScore, run.score),
        bestFinish: betterFinish(career.stats.bestFinish, outcome),
        bestCupAscension: wonCup
          ? Math.max(career.stats.bestCupAscension, run.ascension)
          : career.stats.bestCupAscension,
      },
    },
    xpGained,
    prestigeGained,
    leveledUp: level > career.level,
  };
}

/** Buy the next tier of a perk track. Refuses when maxed, under the tier's level
 *  requirement, or unaffordable (returns the career unchanged). */
export function buyPerkTier(career: CareerState, perkId: string): CareerState {
  const tier = nextPerkTier(career, perkId);
  if (!tier || career.level < tier.levelReq || career.prestige < tier.cost) return career;
  return {
    ...career,
    prestige: career.prestige - tier.cost,
    perkLevels: { ...career.perkLevels, [perkId]: tier.level },
  };
}

/** Unlock a locked (non-starter) boon into the offer pool with Prestige. Refuses
 *  starters, already-owned boons, and unaffordable buys (returns the career unchanged). */
export function unlockBoon(career: CareerState, boonId: string): CareerState {
  const boon = boonById(boonId);
  if (!boon || boon.starter || career.unlockedBoons.includes(boonId)) return career;
  const cost = BOON_UNLOCK_COST[boon.rarity];
  if (career.prestige < cost) return career;
  return {
    ...career,
    prestige: career.prestige - cost,
    unlockedBoons: [...career.unlockedBoons, boonId],
  };
}
