import type { Player } from '../data/types';
import type { RunOutcome, RunState } from './run';
import { boonById, BOON_UNLOCK_COST } from './boons';
import { ascensionAt, MAX_ASCENSION } from './ascension';
import { FEATURES } from '../config';
import { completedIn, prestigeFor } from './challenges';
import type { AlbumState } from './album';

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
  // --- Counters the challenge catalogue reads (docs/challenges-spec.html, slice A).
  // Updated in applyRunResult BEFORE the challenges are judged, so a run completes the
  // challenge it just satisfied rather than the next one. They live on `stats` because
  // that is a merged jsonb column on the server, so none of this needed a migration.
  /** Consecutive runs ending as champion; any other outcome resets it to 0. */
  cupStreak: number;
  /** Consecutive runs reaching the final or better. */
  finalStreak: number;
  /** Consecutive runs reaching the semi-final or better. */
  semiStreak: number;
  /** The outcome of the run just banked. */
  lastOutcome: RunOutcome | null;
  /** The outcome of the run before that one. Its own field because challenges are
   *  judged AFTER the run lands, so "lose a final, then win the cup" cannot read the
   *  previous run out of `lastOutcome` any more - by then it is this run's. */
  prevOutcome: RunOutcome | null;
  /** A final has been lost at least once in this career. */
  everLostFinal: boolean;
  /** Cups won per Ascension tier, indexed by tier (may be shorter than the ladder). */
  cupsByAscension: number[];
  /** Finished runs played at Ascension II or higher. */
  runsAtHighAscension: number;
  /** Lifetime Prestige spent, in the perk shop and on boon unlocks. */
  prestigeSpent: number;
  /** Distinct formations a cup has been won with (needs RunState.shape, slice B). */
  cupFormations: string[];
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
  /** The Ascension tier last chosen for a run, remembered as the next run's default
   *  (clamped to what is currently selectable). Undefined until the first run. */
  lastAscension?: number;
  /** Ids of the challenges completed, permanently (domain/challenges.ts). Each was paid
   *  its Prestige once, into the same wallet the perk shop spends from. */
  completedChallenges: string[];
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
  completedChallenges: [],
  stats: {
    runs: 0,
    cups: 0,
    bestScore: 0,
    bestFinish: null,
    bestCupAscension: 0,
    cupStreak: 0,
    finalStreak: 0,
    semiStreak: 0,
    lastOutcome: null,
    prevOutcome: null,
    everLostFinal: false,
    cupsByAscension: [],
    runsAtHighAscension: 0,
    prestigeSpent: 0,
    cupFormations: [],
  },
};

/** Flat XP per level. Tuned so the level gates on perks/Ascension actually bite:
 *  XP is round(score x mult) and Prestige is that / 5, so XP = 5 x Prestige earned;
 *  at 200/level, reaching level L needs ~ (L-1) x 40 Prestige EARNED, which tracks
 *  the perk/budget Prestige costs closely (so level is a real second gate, not a
 *  formality that is always satisfied first). */
const XP_PER_LEVEL = 200;
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
/** Whether an outcome reached `least` or better (null = the run never finished). */
const reached = (o: RunOutcome | null, least: RunOutcome): boolean =>
  !!o && FINISH_ORDER.indexOf(o) >= FINISH_ORDER.indexOf(least);

/** `counts` with one more at index `i`, growing it as needed. Defensive about the
 *  stored value: `stats` is a merged blob, so an old or hand-edited save can hand back
 *  something that is not an array. */
function bumpAt(counts: number[], i: number): number[] {
  const next = Array.isArray(counts) ? [...counts] : [];
  while (next.length <= i) next.push(0);
  next[i] += 1;
  return next;
}
/** `list` with `value` appended if it is not already there (same defensiveness). */
const withValue = (list: string[], value: string): string[] => {
  const next = Array.isArray(list) ? list : [];
  return next.includes(value) ? next : [...next, value];
};

/** The Ascension tier at which a run counts as "high" for the career counters, i.e.
 *  Ascension II. Named so the challenge copy and the counter cannot drift apart. */
export const HIGH_ASCENSION = 2;

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
      // The free boosts draw from the COMMON pool only (run.ts): handing out a
      // legendary before kick-off made the perk better than any single boost choice.
      { level: 1, description: 'Start each run with 1 common team boost applied.', cost: 25, levelReq: 1 },
      { level: 2, description: 'Start each run with 2 common team boosts applied.', cost: 70, levelReq: 5 },
    ],
  },
  {
    id: 'deep-squad',
    name: 'Deep Squad',
    tiers: [
      // Tier 3 (+3 to the whole XI, permanently) was stronger than any legendary boost
      // and never went away, so the ladder stops at +2 and tier 2 costs more.
      { level: 1, description: '+1 to your entire XI at run start.', cost: 45, levelReq: 1 },
      { level: 2, description: '+2 to your entire XI at run start.', cost: 120, levelReq: 4 },
    ],
  },
  {
    id: 'extra-boon',
    name: 'Extra Choice',
    tiers: [
      // Worth more as the boost pool grows, so it costs more than it used to.
      { level: 1, description: '4 team boosts offered each round.', cost: 90, levelReq: 3 },
      { level: 2, description: '5 team boosts offered each round.', cost: 150, levelReq: 7 },
    ],
  },
  {
    // Raises the Career-Mode transfer-draft budget (Quick Run stays at BUDGET_DRAFT).
    // The tier -> dollars mapping lives in config.ts BUDGET_BY_TIER (base $70 at tier 0).
    id: 'transfer-budget',
    name: 'Transfer Budget',
    tiers: [
      { level: 1, description: '$80 transfer budget (Career Mode).', cost: 20, levelReq: 2 },
      { level: 2, description: '$90 transfer budget.', cost: 40, levelReq: 3 },
      { level: 3, description: '$100 transfer budget.', cost: 80, levelReq: 5 },
      { level: 4, description: '$110 transfer budget.', cost: 120, levelReq: 8 },
      { level: 5, description: '$120 transfer budget.', cost: 160, levelReq: 12 },
      { level: 6, description: '$130 transfer budget.', cost: 220, levelReq: 18 },
      { level: 7, description: '$140 transfer budget.', cost: 300, levelReq: 24 },
      { level: 8, description: '$150 transfer budget.', cost: 400, levelReq: 32 },
    ],
  },
  {
    // Two more squad re-rolls in the ROLL draft. Priced near Physio Table, a little
    // under it at tier 1: it is the same kind of agency (reject what you were dealt)
    // but it only touches the build, and only one of the two build methods, since the
    // transfer market has nothing to re-roll. The descriptions say so, because the
    // shop is open before a build method is picked and cannot hide the perk.
    id: 'extra-reroll',
    name: 'Extra Re-roll',
    tiers: [
      { level: 1, description: 'A 4th squad re-roll when you roll your XI (Career Mode).', cost: 30, levelReq: 1 },
      { level: 2, description: 'A 5th squad re-roll when you roll your XI.', cost: 75, levelReq: 4 },
    ],
  },
  {
    // Re-roll a boost offer you do not like. Cheap agency rather than raw power, and
    // the one perk that gets better the wider the pool is.
    id: 'physio',
    name: 'Physio Table',
    tiers: [
      { level: 1, description: 'Re-roll a team boost offer once per run.', cost: 35, levelReq: 2 },
      { level: 2, description: 'Re-roll a team boost offer twice per run.', cost: 85, levelReq: 6 },
    ],
  },
];

export const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

/** The owned tier of a perk (0 = not owned). */
export const perkLevelOf = (career: CareerState, id: string): number => career.perkLevels[id] ?? 0;

/** Extra squad re-rolls from the Extra Re-roll perk: the owned tier is the count, so
 *  the roll draft starts at `INITIAL_REROLLS` plus this. Clamped to the tiers that
 *  exist, so an old save claiming a higher level cannot hand out more. Career Mode
 *  only, like the transfer-budget perk - a Quick Run keeps the base three. */
export function extraRerollsOf(career: CareerState): number {
  const tiers = perkById('extra-reroll')?.tiers.length ?? 0;
  return Math.min(perkLevelOf(career, 'extra-reroll'), tiers);
}

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
  /** Challenges this run completed (ids, in catalogue order), and what they paid.
   *  Empty unless the caller passed the challenge context. */
  challengesCompleted: string[];
  challengePrestige: number;
}

/** What the challenge predicates need beyond the run and the career. Optional, so a
 *  caller with no album to hand (the checks harness, an older call site) still gets the
 *  XP/Prestige reward and simply completes nothing. */
export interface ChallengeInput {
  /** The DATASET player behind one the run carries (boost deltas are baked into
   *  `run.xi`, and a rating challenge must not drift with the boosts taken). */
  base: (p: Player) => Player;
  album: AlbumState;
  /** Lifetime trades completed (album telemetry). */
  trades: number;
}

export function applyRunResult(career: CareerState, run: RunState, ch?: ChallengeInput): RunReward {
  // Ascension scales the run's reward; a cup win raises the unlocked ceiling + best.
  const mult = ascensionAt(run.ascension).rewardMult;
  const xpGained = Math.round(run.score * mult);
  const prestigeGained = Math.max(1, Math.round((run.score * mult) / 5));
  const xp = career.xp + xpGained;
  const level = levelForXp(xp);
  const outcome = run.outcome;
  const wonCup = outcome === 'champion';
  const banked: CareerState = {
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
      // The streaks count THIS run too, so three cups in a row completes Three-Peat on
      // the third rather than the fourth. Any lesser finish resets the streak it breaks.
      cupStreak: wonCup ? career.stats.cupStreak + 1 : 0,
      finalStreak: reached(outcome, 'final') ? career.stats.finalStreak + 1 : 0,
      semiStreak: reached(outcome, 'sf') ? career.stats.semiStreak + 1 : 0,
      lastOutcome: outcome,
      prevOutcome: career.stats.lastOutcome,
      everLostFinal: career.stats.everLostFinal || outcome === 'final',
      cupsByAscension: wonCup
        ? bumpAt(career.stats.cupsByAscension, run.ascension)
        : career.stats.cupsByAscension,
      runsAtHighAscension:
        career.stats.runsAtHighAscension + (run.ascension >= HIGH_ASCENSION ? 1 : 0),
      // Spending is the only thing here the run does not decide; buyPerkTier and
      // unlockBoon keep it, so it just rides along.
      prestigeSpent: career.stats.prestigeSpent,
      cupFormations:
        wonCup && run.shape
          ? withValue(career.stats.cupFormations, run.shape.formation)
          : career.stats.cupFormations,
    },
  };
  // Challenges are judged against the career AFTER this run's XP/Prestige/stats land,
  // so "win 10 cups" counts the cup just won, and paid on top of it.
  const challengesCompleted = ch
    ? completedIn({ run, career: banked, base: ch.base, album: ch.album, trades: ch.trades })
    : [];
  // FEATURES.challengeAwards off: challenges still complete and are still recorded,
  // they simply pay nothing (and nothing is shown paying).
  const challengePrestige = FEATURES.challengeAwards ? prestigeFor(challengesCompleted) : 0;
  return {
    career: {
      ...banked,
      prestige: banked.prestige + challengePrestige,
      completedChallenges: [...banked.completedChallenges, ...challengesCompleted],
    },
    xpGained,
    prestigeGained,
    leveledUp: level > career.level,
    challengesCompleted,
    challengePrestige,
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
    stats: { ...career.stats, prestigeSpent: career.stats.prestigeSpent + tier.cost },
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
    stats: { ...career.stats, prestigeSpent: career.stats.prestigeSpent + cost },
  };
}
