import type { Player } from '../data/types';
import { albumStats, collectiblesByTier, type AlbumState, type AlbumStatsView } from './album';
import { ASCENSIONS, maxSelectableAscension } from './ascension';
import { PERK_TIERS_TOTAL, badgeRows, badgesEarned, perkTiersOwned, type BadgeRow } from './badges';
import {
  HISTORY_LIMIT,
  PLAYER_RECORD_LIMIT,
  levelProgress,
  type CareerState,
  type PlayerRecord,
  type RunHistoryEntry,
} from './career';
import type { RunOutcome } from './run';
import { challengeProgress, type ChallengeProgress } from './challenges';
import { FORMATIONS_DATA } from './formations';
import type { StickerTier } from '../config';

// ---------------------------------------------------------------------------
// The trophy cabinet's view model (roadmap item 06, option B).
//
// Derived, never recorded: every field below is read off a CareerState or AlbumState
// that already exists, so the cabinet needed no new state, no migration, and behaves
// identically for a guest and an account. The comp's source map
// (docs/redesign-2026/turf-flat/trophy-cabinet.html) lists the field behind each block.
//
// Pure and framework-free, so `CabinetScreen` only lays it out and `npm run checks` can
// assert the arithmetic (the shelf really has one trophy per cup, the ladder really
// covers the whole ladder, and so on).
//
// The one thing NOT derivable is a dated per-run history, which is why the screen shows
// that block as an empty state: nothing client-side keeps per-run rows, and the server
// columns that look like they should have been taking their defaults since migration
// 0006. See roadmap items 06 (option D) and 21.
// ---------------------------------------------------------------------------

/** One cup on the shelf. There is no date and no opponent to show: `cupsByAscension`
 *  records how many cups were won at each tier and nothing else. */
export interface ShelfCup {
  tier: number;
  label: string;
  /** 1-based, within this tier, so three Base cups read "1 of 3". */
  nth: number;
  ofTier: number;
}

/** One rung of the Ascension ladder, with both of its gates resolved. */
export interface LadderRung {
  tier: number;
  label: string;
  cups: number;
  rewardMult: number;
  levelReq: number;
  /** Within the career's earned ceiling (a cup at T unlocks T+1). */
  unlocked: boolean;
  /** Unlocked AND the level requirement is met, i.e. playable this run. The two come
   *  apart often (win at III and IV unlocks, but IV wants level 20), and the cabinet
   *  is the only place they are shown side by side. */
  selectable: boolean;
}

export interface CabinetRecords {
  bestFinish: RunOutcome | null;
  bestScore: number;
  /** Live counters: any lesser finish resets them, so these are "right now". */
  cupStreak: number;
  finalStreak: number;
  semiStreak: number;
  /** The best run of cups this career ever had - NOT a stored field. `cupStreak` is a
   *  live counter that resets, so the record is read off the honours instead: holding
   *  Three-Peat is itself proof a three-cup streak happened. Cheaper than a new
   *  counter, and it works retroactively on a career that predates the cabinet. */
  bestCupStreak: number;
  /** How many finals were lost, as the largest figure the career can PROVE. See
   *  `finalsLostOf`: it used to be a yes/no, which is not an answer to "how many". */
  finalsLost: number;
  runsAtHighAscension: number;
  prestigeSpent: number;
  perkTiersOwned: number;
  perkTiersTotal: number;
}

export interface CabinetView {
  /** One entry per cup won, ascending by tier. */
  shelf: ShelfCup[];
  ladder: LadderRung[];
  headline: {
    cups: number;
    level: number;
    xpInto: number;
    xpNeeded: number;
    prestige: number;
    prestigeSpent: number;
    runs: number;
    runsAtHighAscension: number;
    /** The tier of the best cup, or null when there is no cup yet. */
    bestCupAscension: number | null;
  };
  records: CabinetRecords;
  /** Every formation, flagged with whether a cup has been won with it. */
  formations: { name: string; won: boolean }[];
  honours: ChallengeProgress;
  badges: BadgeRow[];
  badgesEarned: number;
  album: AlbumStatsView;
  /** The collectibles of one tier, for the "the five Monumentals" strip. */
  monumentals: { player: Player; owned: boolean }[];
  /** True once there is nothing left to earn anywhere, for the complete state. */
  complete: boolean;
  /** The run archive, newest first. Empty on a career that predates the recording. */
  history: RunHistoryEntry[];
  /** How many runs the archive holds, and the cap it holds them to - so a list that has
   *  started dropping its oldest rows can say so rather than implying it is all of them. */
  historyHeld: number;
  historyLimit: number;
  /** Most-used, top-scoring and most-decorated players, `LEADERBOARD_ROWS` each. */
  topUsed: PlayerRow[];
  topScorers: PlayerRow[];
  topTitles: PlayerRow[];
  /** How many of the career's cups the titles board can account for. Lower than
   *  `headline.cups` on a career that won cups before line-ups were recorded, which is
   *  the one thing that board cannot derive and so the only way it can be honest about
   *  what it is missing. */
  cupsRecorded: number;
  /** How many players have a record at all, and the cap. The leaderboards show ten of
   *  these, and the gap between ten and this is the reason to print it. */
  playersTracked: number;
  playersLimit: number;
  /** Totals over every record held: matches fielded and goals scored. */
  playerTotals: { apps: number; goals: number };
}

/** One player's lifetime record, resolved against the dataset for display. */
export interface PlayerRow {
  player: Player;
  record: PlayerRecord;
}

/** How many rows the two leaderboards show. Everything is recorded (up to
 *  `PLAYER_RECORD_LIMIT`); this is only how much of it is on screen. */
export const LEADERBOARD_ROWS = 10;

/** The tier whose full list the cabinet shows (the shortest, so it fits one row). */
const STRIP_TIER: StickerTier = 'monumental';


/** Finals lost, as the strongest figure the career can prove. `CareerStats.finalsLost`
 *  is exact for every run played since it existed, and three sources say something about
 *  the ones before it: the counter itself, the run archive (which records each finished
 *  run's outcome), and `everLostFinal`, which is proof of one. All three are lower bounds
 *  on the same lifetime number, so the largest of them is the honest answer - and on a
 *  career that has only played since the counter, it IS the counter. Same reasoning as
 *  `bestCupStreakOf` below: read the proof rather than adding a counter that starts at
 *  zero and quietly under-reports for ever. */
export function finalsLostOf(career: CareerState): number {
  const archived = (career.stats.history ?? []).filter((h) => h.outcome === 'final').length;
  return Math.max(career.stats.finalsLost ?? 0, archived, career.stats.everLostFinal ? 1 : 0);
}

/** The best cup streak this career ever managed. See `CabinetRecords.bestCupStreak`. */
export function bestCupStreakOf(career: CareerState): number {
  const done = new Set(career.completedChallenges);
  const fromHonours = done.has('three-peat') ? 3 : done.has('back-to-back') ? 2 : 0;
  const fromCups = career.stats.cups > 0 ? 1 : 0;
  return Math.max(career.stats.cupStreak, fromHonours, fromCups);
}

export function cabinetView(
  career: CareerState,
  album: AlbumState,
  allPlayers: Player[],
): CabinetView {
  const cupsByTier = ASCENSIONS.map((a) => (career.stats.cupsByAscension ?? [])[a.tier] ?? 0);
  const shelf: ShelfCup[] = ASCENSIONS.flatMap((a) =>
    Array.from({ length: cupsByTier[a.tier] }, (_, i) => ({
      tier: a.tier,
      label: a.label,
      nth: i + 1,
      ofTier: cupsByTier[a.tier],
    })),
  );
  const selectable = maxSelectableAscension(career.ascension, career.level);
  const ladder: LadderRung[] = ASCENSIONS.map((a) => ({
    tier: a.tier,
    label: a.label,
    cups: cupsByTier[a.tier],
    rewardMult: a.rewardMult,
    levelReq: a.levelReq,
    unlocked: a.tier <= career.ascension,
    selectable: a.tier <= selectable,
  }));

  const xp = levelProgress(career.xp);
  const wonFormations = new Set(career.stats.cupFormations ?? []);
  const honours = challengeProgress(career.completedChallenges);
  const stats = albumStats(album, allPlayers);
  const badges = badgeRows({ career, album: stats });
  const collected = new Set(album.collected);
  const monumentals = collectiblesByTier(allPlayers)[STRIP_TIER].map((player) => ({
    player,
    owned: collected.has(player.id),
  }));

  // The player records, resolved against the dataset. An id the dataset no longer has
  // (a squad edited out from under an old save) keeps its record but cannot be shown,
  // so it is dropped from the leaderboards and still counted in the totals.
  const records = career.stats.players ?? {};
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const rows: PlayerRow[] = [];
  let appsTotal = 0;
  let goalsTotal = 0;
  for (const [id, record] of Object.entries(records)) {
    appsTotal += record.apps;
    goalsTotal += record.goals;
    const player = byId.get(id);
    if (player) rows.push({ player, record });
  }
  // Ties broken the same way in both, so the order is stable rather than whatever
  // Object.entries happened to give: the other metric, then the better rating, then
  // the name.
  const topUsed = [...rows]
    .sort(
      (a, b) =>
        b.record.apps - a.record.apps ||
        b.record.goals - a.record.goals ||
        b.player.elo - a.player.elo ||
        a.player.name.localeCompare(b.player.name),
    )
    .slice(0, LEADERBOARD_ROWS);
  const topScorers = [...rows]
    .filter((r) => r.record.goals > 0)
    .sort(
      (a, b) =>
        b.record.goals - a.record.goals ||
        b.record.apps - a.record.apps ||
        b.player.elo - a.player.elo ||
        a.player.name.localeCompare(b.player.name),
    )
    .slice(0, LEADERBOARD_ROWS);
  // Titles first, then the other two boards as tie-breaks: with a handful of cups most
  // holders are level on one, and "who played the most of them" is the honest next
  // question. Every read of `cups` defaults, because it is absent on a record written
  // before titles were counted and an undefined in a comparator sorts nothing at all.
  const topTitles = [...rows]
    .filter((r) => (r.record.cups ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.record.cups ?? 0) - (a.record.cups ?? 0) ||
        b.record.apps - a.record.apps ||
        b.record.goals - a.record.goals ||
        b.player.elo - a.player.elo ||
        a.player.name.localeCompare(b.player.name),
    )
    .slice(0, LEADERBOARD_ROWS);
  const history = Array.isArray(career.stats.history) ? career.stats.history : [];

  return {
    shelf,
    ladder,
    headline: {
      cups: career.stats.cups,
      level: career.level,
      xpInto: xp.into,
      xpNeeded: xp.needed,
      prestige: career.prestige,
      prestigeSpent: career.stats.prestigeSpent,
      runs: career.stats.runs,
      runsAtHighAscension: career.stats.runsAtHighAscension,
      // `bestCupAscension` is 0 both for "only Base" and for "no cups at all", so
      // the cup count is what separates them.
      bestCupAscension: career.stats.cups > 0 ? career.stats.bestCupAscension : null,
    },
    records: {
      bestFinish: career.stats.bestFinish,
      bestScore: career.stats.bestScore,
      cupStreak: career.stats.cupStreak,
      finalStreak: career.stats.finalStreak,
      semiStreak: career.stats.semiStreak,
      bestCupStreak: bestCupStreakOf(career),
      finalsLost: finalsLostOf(career),
      runsAtHighAscension: career.stats.runsAtHighAscension,
      prestigeSpent: career.stats.prestigeSpent,
      perkTiersOwned: perkTiersOwned(career),
      perkTiersTotal: PERK_TIERS_TOTAL,
    },
    formations: FORMATIONS_DATA.names.map((name) => ({ name, won: wonFormations.has(name) })),
    honours,
    badges,
    badgesEarned: badgesEarned(badges),
    album: stats,
    monumentals,
    complete:
      honours.completed === honours.total &&
      stats.total > 0 &&
      stats.collected === stats.total &&
      badgesEarned(badges) === badges.length,
    history,
    historyHeld: history.length,
    historyLimit: HISTORY_LIMIT,
    topUsed,
    topScorers,
    topTitles,
    cupsRecorded: career.stats.cupsRecorded ?? 0,
    playersTracked: Object.keys(records).length,
    playersLimit: PLAYER_RECORD_LIMIT,
    playerTotals: { apps: appsTotal, goals: goalsTotal },
  };
}
