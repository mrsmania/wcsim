import type { RunOutcome, RunState } from './run';

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
}

export interface CareerState {
  version: number;
  xp: number;
  level: number;
  prestige: number;
  /** Purchased perk ids. */
  unlocked: string[];
  stats: CareerStats;
}

export const INITIAL_CAREER: CareerState = {
  version: 1,
  xp: 0,
  level: 1,
  prestige: 0,
  unlocked: [],
  stats: { runs: 0, cups: 0, bestScore: 0, bestFinish: null },
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

/** Perks bought with Prestige; each changes how the next run starts. */
export interface Perk {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export const PERKS: Perk[] = [
  {
    id: 'scout',
    name: 'Scout Network',
    description: 'Start every run with one random boon already applied.',
    cost: 25,
  },
  {
    id: 'deep-squad',
    name: 'Deep Squad',
    description: '+1 to your entire XI at the start of each run.',
    cost: 45,
  },
  {
    id: 'extra-boon',
    name: 'Extra Boon',
    description: 'Boon offers show 4 choices instead of 3.',
    cost: 75,
  },
];

export const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

/** Reward for a finished run applied to the career. Returns the updated career plus
 *  what was gained (for a one-shot "run rewards" readout). */
export interface RunReward {
  career: CareerState;
  xpGained: number;
  prestigeGained: number;
  leveledUp: boolean;
}
export function applyRunResult(career: CareerState, run: RunState): RunReward {
  const xpGained = run.score;
  const prestigeGained = Math.max(1, Math.round(run.score / 5));
  const xp = career.xp + xpGained;
  const level = levelForXp(xp);
  const outcome = run.outcome;
  return {
    career: {
      ...career,
      xp,
      level,
      prestige: career.prestige + prestigeGained,
      stats: {
        runs: career.stats.runs + 1,
        cups: career.stats.cups + (outcome === 'champion' ? 1 : 0),
        bestScore: Math.max(career.stats.bestScore, run.score),
        bestFinish: betterFinish(career.stats.bestFinish, outcome),
      },
    },
    xpGained,
    prestigeGained,
    leveledUp: level > career.level,
  };
}

/** Buy a perk if affordable and not already owned; otherwise returns the career unchanged. */
export function buyPerk(career: CareerState, perkId: string): CareerState {
  const perk = perkById(perkId);
  if (!perk || career.unlocked.includes(perkId) || career.prestige < perk.cost) return career;
  return { ...career, prestige: career.prestige - perk.cost, unlocked: [...career.unlocked, perkId] };
}
