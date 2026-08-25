import type { Player } from '../data/types';
import { runTotals, type RunOutcome, type RunState, type RunTally } from './run';
import { boonById, BOON_UNLOCK_COST } from './boons';
import { ascensionAt, MAX_ASCENSION } from './ascension';
import { completedIn, prestigeFor } from './challenges';
import type { AlbumState } from './album';
import { BUDGET_BY_TIER } from '../config';

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
  /** Starter boosts owed to the NEXT run by a Youth Development taken in an earlier one.
   *  On `stats` rather than on `CareerState` for the reason the block below records: a
   *  merged jsonb column survives a signed-in save, a new top-level key does not.
   *  Optional, so a career saved before this loads with nothing owed. */
  bonusStartBoosts?: number;
  // --- The run archive and the player records (roadmap item 06, option D).
  //
  // Both live on `stats` ON PURPOSE, and it is the whole reason they needed no SQL:
  // `save_career` persists `stats` as one merged jsonb column and ignores top-level keys
  // it does not know, so a new field HERE survives a signed-in save while a new field on
  // `CareerState` would be silently dropped. Same trick the challenge counters used.
  // Both are optional, so a save written before this loads and starts recording from the
  // next run.
  /** Finished runs, NEWEST FIRST, capped at `HISTORY_LIMIT`. The only part of the
   *  cabinet that is recorded rather than derived, because nothing else can answer
   *  "when". It therefore only ever covers runs from this change onward. */
  history?: RunHistoryEntry[];
  /** Lifetime appearances and goals per PLAYER ID, capped at `PLAYER_RECORD_LIMIT`.
   *  Every player a career has ever fielded is kept, not just the ones on show. */
  players?: Record<string, PlayerRecord>;
}

/** One finished run, for the archive. Deliberately small: at `HISTORY_LIMIT` rows this
 *  rides every career write, so it holds the facts a history list shows and nothing
 *  else (notably not the XI, which would triple the size for something the player
 *  records below already answer better). */
export interface RunHistoryEntry {
  /** Epoch ms, passed in by the caller so the domain stays pure. Absent when the
   *  caller had no clock to hand (the checks harness), and shown as "-". */
  at?: number;
  /** Nullable for the same reason `bestFinish` and `lastOutcome` are: a run can in
   *  principle be banked without one, and inventing 'group' there would put a finish in
   *  the archive that never happened. */
  outcome: RunOutcome | null;
  ascension: number;
  score: number;
  /** XP and Prestige the run itself paid, before challenge awards. */
  xp: number;
  prestige: number;
  /** Knockout ties won, and the run's goals for and against. */
  roundsWon: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The formation it kicked off in, when the run recorded a shape. */
  formation?: string;
  /** How many challenges this run completed. */
  challenges?: number;
}

/** A player's lifetime record with this career. */
export interface PlayerRecord {
  /** Matches in the XI. */
  apps: number;
  /** Goals in normal or extra time; never shootout kicks (see `RunTally`). */
  goals: number;
  /** Runs this player was picked for. */
  runs: number;
}

/** How many finished runs the archive keeps. A hundred rows is a long history to read
 *  and about 13 KB on the wire; older runs fall off the end rather than being summarised,
 *  which is honest but does mean the lifetime counters above and the archive can disagree
 *  once a career passes it. The cabinet says so rather than implying the list is all of
 *  them. */
export const HISTORY_LIMIT = 100;
/** How many players keep a record. Well past the "at least 50" the cabinet shows, and
 *  past what any normal career fields (11 a run, mostly repeats); a career that somehow
 *  exceeds it drops its least-used players first, and the cabinet prints the count so the
 *  cap is never invisible. */
export const PLAYER_RECORD_LIMIT = 600;

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

/** A career as it arrives from OUTSIDE - a localStorage blob or an account row - with
 *  every field optional and of unknown type. Both loaders reduce to this. */
export interface PartialCareer {
  xp?: unknown;
  prestige?: unknown;
  perkLevels?: unknown;
  unlockedBoons?: unknown;
  ascension?: unknown;
  lastAscension?: unknown;
  completedChallenges?: unknown;
  stats?: Partial<CareerStats> | null;
}

/** Build a `CareerState` from untrusted partial data: the ONE place that knows the
 *  career's field list (hygiene H89).
 *
 *  It existed twice - once in `careerStorage` for a stored blob and once in
 *  `remoteStore` for an account row - as two lists that had to be extended together
 *  for every new career field, with nothing to say so. What is left at each call site
 *  is the thing that genuinely differs: the guest side's v1-to-v2 perk migration, and
 *  the account side's snake_case-to-camelCase conversion.
 *
 *  `level` is DERIVED, never read: it is a function of XP, so a stored one could
 *  disagree with the XP beside it. `stats` merges over the initial counters, which is
 *  what lets a new counter appear without a migration on either side. And
 *  `completedChallenges` tolerates being absent entirely, because a server that has
 *  not had migration 0011 applied has no such column - challenge progress then simply
 *  does not persist for that account, and nothing else is affected. */
export function hydrateCareer(p: PartialCareer): CareerState {
  const xp = typeof p.xp === 'number' ? p.xp : 0;
  const perkLevels: Record<string, number> = {};
  if (p.perkLevels && typeof p.perkLevels === 'object') {
    for (const [k, v] of Object.entries(p.perkLevels)) {
      if (typeof v === 'number' && v > 0) perkLevels[k] = v;
    }
  }
  return {
    version: 2,
    xp,
    level: levelForXp(xp),
    prestige: typeof p.prestige === 'number' ? p.prestige : 0,
    perkLevels,
    unlockedBoons: Array.isArray(p.unlockedBoons)
      ? p.unlockedBoons.filter((id): id is string => typeof id === 'string')
      : [],
    ascension: typeof p.ascension === 'number' ? p.ascension : 0,
    lastAscension: typeof p.lastAscension === 'number' ? p.lastAscension : undefined,
    completedChallenges: Array.isArray(p.completedChallenges)
      ? p.completedChallenges.filter((id): id is string => typeof id === 'string')
      : [],
    stats: { ...INITIAL_CAREER.stats, ...(p.stats ?? {}) },
  };
}

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

/** The run's tally merged into the career's player records: appearances and goals add
 *  up, and every player who appeared at all gains one run. Same defensiveness as the
 *  helpers above, since `stats` is a merged blob an old save can hand back anything.
 *
 *  When the merge would exceed `PLAYER_RECORD_LIMIT`, the least-used records are
 *  dropped - but never one this run touched, or a career at the cap would stop
 *  recording the players it is actually using. */
function mergePlayerRecords(
  held: Record<string, PlayerRecord> | undefined,
  tally: RunTally | undefined,
): Record<string, PlayerRecord> | undefined {
  const base: Record<string, PlayerRecord> =
    held && typeof held === 'object' && !Array.isArray(held) ? held : {};
  if (!tally) return held;
  const touched = new Set([...Object.keys(tally.apps ?? {}), ...Object.keys(tally.goals ?? {})]);
  if (!touched.size) return held;
  const next: Record<string, PlayerRecord> = { ...base };
  for (const id of touched) {
    const prev = next[id] ?? { apps: 0, goals: 0, runs: 0 };
    next[id] = {
      apps: prev.apps + (tally.apps?.[id] ?? 0),
      goals: prev.goals + (tally.goals?.[id] ?? 0),
      // A player with goals but no appearances cannot happen (goals are only counted
      // for the XI that played), but the run still counts once either way.
      runs: prev.runs + 1,
    };
  }
  const ids = Object.keys(next);
  if (ids.length <= PLAYER_RECORD_LIMIT) return next;
  const keep = ids
    .sort((a, b) => {
      const ta = touched.has(a) ? 1 : 0;
      const tb = touched.has(b) ? 1 : 0;
      if (ta !== tb) return tb - ta; // this run's players are never dropped
      return next[b].apps - next[a].apps || next[b].goals - next[a].goals;
    })
    .slice(0, PLAYER_RECORD_LIMIT);
  return Object.fromEntries(keep.map((id) => [id, next[id]]));
}

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

export const PERKS: readonly Perk[] = [
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
    // Raises the transfer-market budget. The tier -> dollars mapping lives in
    // config.ts BUDGET_BY_TIER (base $70 at tier 0); `budgetOf` below does the lookup.
    id: 'transfer-budget',
    name: 'Transfer Budget',
    tiers: [
      { level: 1, description: '$80 transfer budget.', cost: 20, levelReq: 2 },
      { level: 2, description: '$90 transfer budget.', cost: 40, levelReq: 3 },
      { level: 3, description: '$100 transfer budget.', cost: 80, levelReq: 5 },
      { level: 4, description: '$110 transfer budget.', cost: 120, levelReq: 8 },
      { level: 5, description: '$120 transfer budget.', cost: 160, levelReq: 12 },
      { level: 6, description: '$130 transfer budget.', cost: 220, levelReq: 18 },
      { level: 7, description: '$140 transfer budget.', cost: 300, levelReq: 24 },
      { level: 8, description: '$150 transfer budget.', cost: 400, levelReq: 32 },
      // Tier 9 is the endgame rung: its level requirement sits above every other gate in
      // the game (the Ascension ladder tops out at 30), so it is the last thing a career
      // can still be working towards once everything else is bought. Priced on the
      // ladder's own curve - the gaps run 20/40/40/40/60/80/100, so the next is ~130.
      { level: 9, description: '$160 transfer budget.', cost: 520, levelReq: 40 },
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
      { level: 1, description: 'A 4th squad re-roll when you roll your XI.', cost: 30, levelReq: 1 },
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

const perkById = (id: string): Perk | undefined => PERKS.find((p) => p.id === id);

/** The owned tier of a perk (0 = not owned). */
/** The career's all-time top scorer by goals, or undefined on a career that has never
 *  scored. Ties break on the id so the answer is stable rather than dependent on key
 *  order. Read by the Old Guard boost, which is snapshotted onto a run at kickoff. */
export function careerTopScorerId(career: CareerState): string | undefined {
  const players = career.stats.players ?? {};
  let best: string | undefined;
  for (const [id, rec] of Object.entries(players)) {
    const bg = best ? (players[best]?.goals ?? 0) : 0;
    if (rec.goals > bg || (rec.goals === bg && best !== undefined && id < best)) best = id;
  }
  return best && (players[best]?.goals ?? 0) > 0 ? best : undefined;
}

export const perkLevelOf = (career: CareerState, id: string): number => career.perkLevels[id] ?? 0;

/** Extra squad re-rolls from the Extra Re-roll perk: the owned tier is the count, so
 *  the roll draft starts at `INITIAL_REROLLS` plus this. Clamped to the tiers that
 *  exist, so an old save claiming a higher level cannot hand out more. */
export function extraRerollsOf(career: CareerState): number {
  const tiers = perkById('extra-reroll')?.tiers.length ?? 0;
  return Math.min(perkLevelOf(career, 'extra-reroll'), tiers);
}

/** The transfer market's budget for this career: the base one, raised by the owned
 *  `transfer-budget` tier. Exact twin of `extraRerollsOf` above, and it sat in `App`
 *  instead - which is why `npm run checks` could assert that the dollar ladder rises and
 *  the shop copy is honest, but not the lookup that actually hands the market its money
 *  (hygiene H146). It was also called twice for the same career in one render, under a
 *  comment promising the two could not drift.
 *
 *  The clamp is load-bearing: a saved career from a later build (or a hand-edited one)
 *  could claim a tier past the end of the ladder, and indexing off the end would hand the
 *  market `undefined` dollars. */
export function budgetOf(career: CareerState): number {
  const tier = Math.min(perkLevelOf(career, 'transfer-budget'), BUDGET_BY_TIER.length - 1);
  return BUDGET_BY_TIER[Math.max(0, tier)];
}

/** Remember the Ascension tier the next run will start at, and NOTHING else.
 *
 *  Separate from `startRunCareer` on purpose, because the two happen at different moments
 *  and only one of them may spend a grant. The tier is PICKED - and re-picked, freely,
 *  before kickoff; a Youth Development grant may only be DEALT once, at kickoff, to a run
 *  that exists. Wiring the picker to `startRunCareer` therefore binned the grant silently:
 *  that function clears `bonusStartBoosts` and hands back what was owed, and a picker has
 *  no run to hand it to, so it dropped the return value on the floor. Returned by identity
 *  when the tier has not moved, so the caller can skip the save. */
export function rememberAscension(career: CareerState, tier: number): CareerState {
  if (career.lastAscension === tier) return career;
  return { ...career, lastAscension: tier };
}

/** Start a run: remember the Ascension tier, and SPEND any Youth Development grant a
 *  previous run banked. Returns the career to save and how many bonus boosts are owed.
 *
 *  The "spent exactly once" invariant used to be enforced by the shape of an `if` inside
 *  CupRunScreen, where the harness could not see it (hygiene H146). Three things it keeps:
 *  `owed` is read BEFORE the counter is cleared; the write is skipped entirely when
 *  neither the tier nor the grant changed (so an unchanged career is returned by
 *  identity, and the caller can skip the save); and clearing the counter happens in the
 *  same update that records the tier, so there is no window in which a grant could be
 *  dealt twice. */
export function startRunCareer(
  career: CareerState,
  tier: number,
): { career: CareerState; owed: number } {
  const owed = career.stats.bonusStartBoosts ?? 0;
  if (career.lastAscension === tier && owed === 0) return { career, owed };
  return {
    career: {
      ...career,
      lastAscension: tier,
      ...(owed > 0 ? { stats: { ...career.stats, bonusStartBoosts: 0 } } : {}),
    },
    owed,
  };
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

export function applyRunResult(
  career: CareerState,
  run: RunState,
  ch?: ChallengeInput,
  /** Epoch ms for the archive row. Passed in rather than read from a clock so this stays
   *  pure and the checks harness stays deterministic; omitted, the row carries no date. */
  at?: number,
): RunReward {
  // Ascension scales the run's reward; a cup win raises the unlocked ceiling + best.
  const mult = ascensionAt(run.ascension).rewardMult;
  // The four cards whose cost lands on the CAREER rather than inside the sim, resolved
  // together because they compose and the order matters.
  //
  // Mortgage the Future: the run took +4 to the XI against its own payout, so unless it
  // lifted the cup it pays NOTHING - not even the floor of 1 Prestige every other run
  // gets. That floor is what makes the card bite; leave it out on purpose. All or Nothing
  // is the same shape with a narrower failure condition (only a lost FINAL) and a tripled
  // reward. A run carrying both pays nothing if either says so, which is the strict
  // reading of two bets that both have to come in.
  const paidOut = run.outcome === 'champion';
  const paysNothing =
    (run.mortgaged === true && !paidOut) || (run.allOrNothing === true && run.outcome === 'final');
  const payoutMult = run.allOrNothing === true && paidOut ? 3 : 1;
  const earned = run.score * mult * payoutMult;
  // Sponsorship multiplies the XP and leaves the wallet alone; Youth Development empties
  // the wallet and leaves the XP alone. Deliberately opposite halves of the same payout.
  const xpGained = paysNothing ? 0 : Math.round(earned * (run.xpMult ?? 1));
  const prestigeGained =
    paysNothing || run.youth === true ? 0 : Math.max(1, Math.round(earned / 5));
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
      // Youth Development: the boost this run bought for the next one. Banked here and
      // spent by the next `beginRun`, which is what lets it outlive the run that took it.
      bonusStartBoosts: (career.stats.bonusStartBoosts ?? 0) + (run.youth === true ? 1 : 0),
      cupFormations:
        wonCup && run.shape
          ? withValue(career.stats.cupFormations, run.shape.formation)
          : career.stats.cupFormations,
      players: mergePlayerRecords(career.stats.players, run.tally),
      // The archive row is appended below, once the challenge count is known.
      history: career.stats.history,
    },
  };
  // Challenges are judged against the career AFTER this run's XP/Prestige/stats land,
  // so "win 10 cups" counts the cup just won, and paid on top of it.
  const challengesCompleted = ch
    ? completedIn({ run, career: banked, base: ch.base, album: ch.album, trades: ch.trades })
    : [];
  const challengePrestige = prestigeFor(challengesCompleted);
  // The archive row, newest first and trimmed to the cap. Written after the challenges
  // are judged so it can carry how many this run completed.
  const totals = runTotals(run);
  const entry: RunHistoryEntry = {
    ...(at === undefined ? {} : { at }),
    outcome,
    ascension: run.ascension,
    score: run.score,
    xp: xpGained,
    prestige: prestigeGained,
    roundsWon: totals.roundsWon,
    goalsFor: totals.goalsFor,
    goalsAgainst: totals.goalsAgainst,
    ...(run.shape ? { formation: run.shape.formation } : {}),
    ...(challengesCompleted.length ? { challenges: challengesCompleted.length } : {}),
  };
  const held = Array.isArray(banked.stats.history) ? banked.stats.history : [];
  return {
    career: {
      ...banked,
      prestige: banked.prestige + challengePrestige,
      completedChallenges: [...banked.completedChallenges, ...challengesCompleted],
      stats: { ...banked.stats, history: [entry, ...held].slice(0, HISTORY_LIMIT) },
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
/** Why a perk tier can or cannot be bought right now - the rule `buyPerkTier` enforces,
 *  exposed so the shop button and the refusal read from the same place. The component
 *  re-derived all of this, which meant the sentence the PLAYER sees was a second
 *  implementation of the rule (hygiene H65).
 *
 *  `reason` is ordered exactly as the button's label is, and that order matters: a tier you
 *  cannot afford AND are under-levelled for must say "reach level N", not "need N Prestige",
 *  or the shop sends the player off to earn Prestige they already have. */
export function perkPurchaseState(
  career: CareerState,
  perkId: string,
): {
  owned: number;
  next: PerkTier | null;
  affordable: boolean;
  levelOk: boolean;
  canBuy: boolean;
  reason: 'maxed' | 'level' | 'prestige' | 'upgrade' | 'unlock';
} {
  const owned = perkLevelOf(career, perkId);
  const next = nextPerkTier(career, perkId);
  const affordable = !!next && career.prestige >= next.cost;
  const levelOk = !!next && career.level >= next.levelReq;
  const canBuy = !!next && affordable && levelOk;
  const reason = !next
    ? 'maxed'
    : !levelOk
      ? 'level'
      : !affordable
        ? 'prestige'
        : owned > 0
          ? 'upgrade'
          : 'unlock';
  return { owned, next, affordable, levelOk, canBuy, reason };
}

/** The same for a boost unlock, which `unlockBoon` enforces. A starter or an
 *  already-unlocked card is `inPool`, and only price stands between the rest and the
 *  offer pool - there is no level gate on the boost library. */
export function boonUnlockState(
  career: CareerState,
  boonId: string,
): { cost: number; inPool: boolean; starter: boolean; affordable: boolean; canBuy: boolean } {
  const boon = boonById(boonId);
  const starter = !!boon?.starter;
  const inPool = !boon || starter || career.unlockedBoons.includes(boonId);
  const cost = boon ? BOON_UNLOCK_COST[boon.rarity] : 0;
  const affordable = career.prestige >= cost;
  return { cost, inPool, starter, affordable, canBuy: !inPool && affordable };
}

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
