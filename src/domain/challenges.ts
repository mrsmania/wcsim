import type { Player, Position } from '../data/types';
import { categoryOf, primaryPosition } from '../data/types';
import { ALL_PLAYERS, SQUAD_BY_ID, SQUADS } from '../data/squads';
import { CONFEDERATION } from '../data/confederations';
import { FEATURES } from '../config';
import type { RoundRecord, RunOutcome, RunState } from './run';
import type { CareerState } from './career';
import { MAX_ASCENSION } from './ascension';
import { MAX_BONUS } from './chemistry';
import { boonById, type Rarity } from './boons';
import { HIGH_ASCENSION, PERKS } from './career';
import { collectiblePlayers, tierOf, type AlbumState } from './album';
import type { KoDecided } from './knockout';

// ---------------------------------------------------------------------------
// Challenges - permanent honours over a finished Cup Run. Pure predicates: no
// React, no storage reads, so the whole catalogue is exercised by the checks
// harness. Plan: docs/challenges-spec.html.
//
// Three traps, each already a real bug in this codebase, and each handled here:
//   1. Ratings are judged on the DATASET player. `run.xi` carries boost deltas
//      baked in (Golden Generation is +2 to the XI), so a rating predicate over
//      it would drift with the boosts taken - exactly the bug the sticker album
//      hit. `base()` resolves each player back to his dataset row.
//   2. The final XI is not the XI you built. Roster boosts swap players in
//      mid-run; `run.boostedIds` separates them, and the identity family judges
//      `own` (the XI minus those) so a Wildcard cannot break a themed run.
//   3. Shootout goals are not goals. `pens` is separate from the scoreline, so
//      clean-sheet predicates read the scoreline only - otherwise The Wall is
//      unwinnable the moment a tie goes to penalties.
// ---------------------------------------------------------------------------

export type ChallengeFamily =
  | 'silverware' | 'ascension' | 'identity' | 'rating' | 'defence'
  | 'attack' | 'drama' | 'boosts' | 'album' | 'market' | 'shape' | 'career';

export type ChallengeTier = 'bronze' | 'silver' | 'gold';

/** Prestige paid for completing one, by tier. Paid into the same wallet the perk shop
 *  spends from, so the numbers only mean anything against what that shop costs: every
 *  perk tier plus every locked boost is 2525 Prestige, and a run itself pays a median
 *  of 9. Sized 2026-08-19 by simulating 16 careers of 150 real Cup Runs (roadmap 01).
 *  At 2/5/12 the whole catalogue is worth 779, about a THIRD of the shop, and
 *  challenges come to roughly a sixth of the Prestige a long career earns: a genuine
 *  second faucet, with runs clearly the first. For scale, the original 10/30/75 guess
 *  was worth 4705, nearly twice the shop and 56% of all income, which is what kept the
 *  awards switched off; 3/8/20 was worth 1266, half the shop, and was the simulation's
 *  own suggestion before this was set deliberately lower.
 *  Note the awards buy but do not gate: challenge Prestige grants no XP, so the level
 *  requirements on the dearest perk tiers can still only be met by playing. */
export const AWARD: Record<ChallengeTier, number> = { bronze: 2, silver: 5, gold: 12 };

export const FAMILY_NAME: Record<ChallengeFamily, string> = {
  silverware: 'Silverware & progression',
  ascension: 'Ascension',
  identity: 'Squad identity',
  rating: 'Rating & value',
  defence: 'Defence',
  attack: 'Attack',
  drama: 'Knockout drama',
  boosts: 'Boosts & perks',
  album: 'Album & collectibles',
  market: 'Market & budget',
  shape: 'Shape & positions',
  career: 'Career & streaks',
};

/** Display order of the families (the catalogue screen renders them in this order). */
export const FAMILIES: ChallengeFamily[] = [
  'silverware', 'ascension', 'identity', 'rating', 'defence',
  'attack', 'drama', 'boosts', 'album', 'shape', 'market', 'career',
];

/** Everything a predicate may look at. Passed in, never read from storage here. */
export interface ChallengeCtx {
  /** The finished run. */
  run: RunState;
  /** The DATASET player behind one carried by the run (trap 1). */
  base: (p: Player) => Player;
  /** The career AFTER this run's XP/Prestige/stats were applied, so lifetime
   *  conditions ("win 10 cups") count the run that just finished. */
  career: CareerState;
  /** The album as it stands (this run's haul is banked separately, so "add three
   *  new stickers" counts what the final XI is about to add). */
  album: AlbumState;
  /** Lifetime trades completed (album telemetry). */
  trades: number;
}

export interface Challenge {
  id: string;
  name: string;
  /** Player-facing and imperative: "Win with an XI averaging under 80". */
  description: string;
  family: ChallengeFamily;
  tier: ChallengeTier;
  /** True while the run does not yet record what this needs (build method,
   *  formation, career streak counters). Never evaluated, shown as "not tracked
   *  yet" in the catalogue, and the reason says what is missing. */
  blocked?: string;
  check: (v: RunView) => boolean;
}

/** One kickoff slot with the player who filled it, resolved to his DATASET row. The
 *  slot's role is the shape's, never `primaryPosition` of the run's copy: placing a
 *  player promotes the slot role onto him, which is exactly what "out of position"
 *  needs to compare against. */
export interface PlacedSlot {
  role: Position;
  player: Player;
}

/** A budget build's figures, at the discounted prices actually charged. */
export interface BuySummary {
  budget: number;
  spent: number;
  dearest: number;
  discounted: number;
}

/** One match of the run from the user's perspective. `ko` false = a group match. */
export interface RunMatch {
  us: number;
  them: number;
  ko: boolean;
  decided?: KoDecided;
  won: boolean;
}

/** The context plus everything derived from it once, so the predicates stay one
 *  line each and nothing is recomputed 130 times. */
export interface RunView extends ChallengeCtx {
  outcome: RunOutcome;
  wonCup: boolean;
  /** The final XI, resolved back to dataset ratings. */
  xi: Player[];
  /** The final XI minus the players a roster boost handed over (trap 2). */
  own: Player[];
  /** Knockout rounds played, oldest first (Round of 16 = stage 0). */
  ko: RoundRecord[];
  group?: RoundRecord;
  /** Every match played: the three group games, then the knockout ties. */
  matches: RunMatch[];
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  /** Mean dataset rating of the final XI. */
  avg: number;
  /** Rarities of the boosts taken, in order. */
  rarities: Rarity[];
  /** The kickoff XI by slot (empty for a run saved before shapes were recorded, which
   *  is why every shape predicate reads false rather than throwing). */
  placed: PlacedSlot[];
  /** Set for a budget build that recorded its prices; undefined for a rolled XI. */
  buy?: BuySummary;
  /** True for a rolled XI (and false when the build was not recorded at all). */
  rolled: boolean;
  /** Squad re-rolls used in a rolled build; undefined when not recorded. */
  rerollsUsed?: number;
  /** Collectible swaps used; undefined when not recorded. */
  swapsUsed?: number;
}

/** The dataset row behind a player id. Shapes store ids, and a roster boost can take
 *  the player himself out of the XI, so the id is resolved against the dataset rather
 *  than against `run.xi` (which is also where trap 1 wants the ratings to come from). */
const DATASET_BY_ID = new Map(ALL_PLAYERS.map((p) => [p.id, p]));

const squadOf = (p: Player) => SQUAD_BY_ID[p.squadId];
const nationOf = (p: Player) => squadOf(p)?.nation ?? p.squadId;
const yearOf = (p: Player) => squadOf(p)?.year ?? 0;
/** The squad's nation code, as the dataset writes it (upper case: 'BRA', 'URS'). */
const codeOf = (p: Player) => squadOf(p)?.code ?? '';
const confedOf = (p: Player) => CONFEDERATION[codeOf(p)];

/** Decades present in the dataset, derived so a new tournament widens "Every Era"
 *  by itself. */
const ALL_DECADES = [...new Set(SQUADS.map((s) => Math.floor(s.year / 10) * 10))];

/** Distinct values of `f` over `ps`. */
const distinct = <T>(ps: Player[], f: (p: Player) => T) => new Set(ps.map(f));
/** How many share the most common value of `f` (0 for an empty XI). */
function topCount<T>(ps: Player[], f: (p: Player) => T): number {
  const counts = new Map<T, number>();
  for (const p of ps) counts.set(f(p), (counts.get(f(p)) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}
/** All of `ps` satisfy `f`, and there is at least one (never vacuously true). */
const allOf = (ps: Player[], f: (p: Player) => boolean) => ps.length > 0 && ps.every(f);

/** The user's goals in a finished knockout tie, by scorer. */
function scorersOf(r: RoundRecord): string[] {
  return (r.events ?? []).filter((e) => e.side === 'home').map((e) => e.scorer);
}
/** Minutes the user scored in, in a finished knockout tie. */
function minutesOf(r: RoundRecord): number[] {
  return (r.events ?? []).filter((e) => e.side === 'home').map((e) => e.minute);
}

export function viewOf(ctx: ChallengeCtx): RunView {
  const { run } = ctx;
  const xi = run.xi.map(ctx.base);
  // The kickoff shape, if the run recorded one. A slot whose id is not in the dataset
  // is dropped rather than faked, so a corrupt save reads as "not satisfied".
  const placed: PlacedSlot[] = (run.shape?.slots ?? []).flatMap((s) => {
    const player = DATASET_BY_ID.get(s.playerId);
    return player ? [{ role: s.role, player }] : [];
  });
  const build = run.build;
  const buy: BuySummary | undefined =
    build?.method === 'budget' && build.budget != null && build.spent != null
      ? {
          budget: build.budget,
          spent: build.spent,
          dearest: build.dearest ?? 0,
          discounted: build.discounted ?? 0,
        }
      : undefined;
  const boosted = new Set(run.boostedIds);
  const own = run.xi.filter((p) => !boosted.has(p.id)).map(ctx.base);
  const ko = run.history.filter((r) => typeof r.stage === 'number');
  const group = run.history.find((r) => r.stage === 'group');
  const matches: RunMatch[] = [
    ...(group?.groupResults ?? []).map((g) => ({
      us: g.us, them: g.them, ko: false, won: g.us > g.them,
    })),
    ...ko.map((r) => ({
      us: r.userGoals ?? 0, them: r.oppGoals ?? 0, ko: true, decided: r.decided, won: !!r.won,
    })),
  ];
  const sum = (f: (m: RunMatch) => number) => matches.reduce((n, m) => n + f(m), 0);
  return {
    ...ctx,
    outcome: run.outcome ?? 'group',
    wonCup: run.outcome === 'champion',
    xi,
    own,
    ko,
    group,
    matches,
    goalsFor: sum((m) => m.us),
    goalsAgainst: sum((m) => m.them),
    cleanSheets: matches.filter((m) => m.them === 0).length,
    avg: xi.length ? xi.reduce((n, p) => n + p.elo, 0) / xi.length : 0,
    rarities: run.activeBoons.map((id) => boonById(id)?.rarity).filter((r): r is Rarity => !!r),
    placed,
    buy,
    rolled: build?.method === 'roll',
    rerollsUsed: build?.rerollsUsed,
    swapsUsed: build?.swapsUsed,
  };
}

// ---------------------------------------------------------------------------
// The catalogue. Ids are stable and permanent: a completed challenge is stored by
// id, so renaming one is free but changing an id orphans it. Descriptions are
// imperative and concrete ("Win with an XI averaging under 80"), never a formula.
// "Win" means lift the cup unless the text says otherwise.
// ---------------------------------------------------------------------------

// Nothing is blocked any more: the plumbing wave (section 8 of the plan) recorded the
// kickoff shape, the build and the chemistry on the run, and the streak counters on the
// career, so all 130 are judged. `Challenge.blocked` stays in the model on purpose - it
// costs nothing and the next batch of entries will want it.

/** Collectible swaps a run starts with. Mirrors INITIAL_SWAPS in state/gameReducer,
 *  which the domain deliberately does not import (the layering runs the other way);
 *  `npm run checks` asserts the two stay in step. */
const ALL_SWAPS = 2;

/** Every Ascension tier, for "win at each of them". */
const ASCENSION_TIERS = Array.from({ length: MAX_ASCENSION + 1 }, (_, tier) => tier);

/** Cups won at a tier (0 when the counter is shorter than the ladder, or absent from a
 *  hand-edited save - `stats` is a merged blob, so it is worth not trusting). */
const cupsAt = (v: RunView, tier: number) => (v.career.stats.cupsByAscension ?? [])[tier] ?? 0;

/** Slots the kickoff XI filled outside the player's natural role. */
const outOfPosition = (v: RunView) =>
  v.placed.filter((s) => primaryPosition(s.player) !== s.role).length;

/** The highest dataset rating in the kickoff XI (0 when there is no shape). */
const topRating = (v: RunView) => v.placed.reduce((n, s) => Math.max(n, s.player.elo), 0);

/** Perk tracks at their maximum tier for this run. */
const allPerksMaxed = (run: RunState) =>
  PERKS.every((perk) => (run.perkLevels[perk.id] ?? 0) >= perk.tiers.length);

/** The tie the given boost was taken after, then the next one: "take X, then win". */
function tieAfterBoost(v: RunView, boonId: string): RoundRecord | undefined {
  const at = v.run.history.findIndex((r) => r.boostId === boonId);
  return at >= 0 ? v.run.history[at + 1] : undefined;
}

export const CHALLENGES: Challenge[] = [
  // --- A. Silverware & progression ---------------------------------------
  { id: 'first-blood', name: 'First Blood', description: 'Win your first cup.',
    // Deliberately NOT `stats.cups === 1`. That counter has been running since career
    // mode shipped, long before this catalogue existed, so on any career that had
    // already won a cup it was permanently past 1 and this could never complete - the
    // one entry in the catalogue a player could be locked out of by having played
    // earlier. A completion is one-shot and permanent anyway, so plain `wonCup` says
    // the same thing without reading a counter: the first cup you win while it is on
    // the list takes it, and it never fires again.
    family: 'silverware', tier: 'bronze', check: (v) => v.wonCup },
  { id: 'back-to-back', name: 'Back to Back', description: 'Win cups in two consecutive runs.',
    family: 'silverware', tier: 'silver', check: (v) => v.career.stats.cupStreak >= 2 },
  { id: 'three-peat', name: 'Three-Peat', description: 'Win cups in three consecutive runs.',
    family: 'silverware', tier: 'gold', check: (v) => v.career.stats.cupStreak >= 3 },
  { id: 'serial-winner', name: 'Serial Winner', description: 'Win 10 cups in total.',
    family: 'silverware', tier: 'silver', check: (v) => v.career.stats.cups >= 10 },
  { id: 'dynasty', name: 'Dynasty', description: 'Win 25 cups in total.',
    family: 'silverware', tier: 'gold', check: (v) => v.career.stats.cups >= 25 },
  { id: 'finalist', name: 'Finalist', description: 'Reach a final.',
    family: 'silverware', tier: 'bronze', check: (v) => v.outcome === 'final' || v.wonCup },
  { id: 'nearly-man', name: 'Nearly Man', description: 'Lose a final, then win the cup in your next run.',
    // `prevOutcome` is the run before this one: the streaks are updated before the
    // catalogue is judged, so `lastOutcome` is already this run's 'champion'.
    family: 'silverware', tier: 'silver',
    check: (v) => v.wonCup && v.career.stats.prevOutcome === 'final' },
  { id: 'perfect-run', name: 'Perfect Run', description: 'Win the cup without losing a single match, group included.',
    family: 'silverware', tier: 'gold',
    // A group draw is not a defeat; a knockout tie is never drawn, so it must be won.
    check: (v) => v.wonCup && v.matches.every((m) => (m.ko ? m.won : m.us >= m.them)) },
  { id: 'maximum-points', name: 'Maximum Points', description: 'Win all three group matches.',
    family: 'silverware', tier: 'bronze',
    check: (v) => v.matches.filter((m) => !m.ko).length === 3 && v.matches.every((m) => m.ko || m.won) },
  { id: 'group-winner', name: 'Group Winner', description: 'Finish first in your group.',
    family: 'silverware', tier: 'bronze', check: (v) => v.group?.groupPos === 1 },
  { id: 'escape-artist', name: 'Escape Artist', description: 'Qualify second, then win the cup.',
    family: 'silverware', tier: 'silver', check: (v) => v.wonCup && v.group?.groupPos === 2 },
  { id: 'ninety-minutes', name: 'Ninety Minutes', description: 'Win every knockout tie in normal time.',
    family: 'silverware', tier: 'silver',
    check: (v) => v.wonCup && v.ko.every((r) => r.decided === 'reg') },

  // --- B. Ascension -------------------------------------------------------
  { id: 'step-up', name: 'Step Up', description: 'Win at Ascension I.',
    family: 'ascension', tier: 'bronze', check: (v) => v.wonCup && v.run.ascension >= 1 },
  { id: 'higher-ground', name: 'Higher Ground', description: 'Win at Ascension II.',
    family: 'ascension', tier: 'silver', check: (v) => v.wonCup && v.run.ascension >= 2 },
  { id: 'giant-slayer', name: 'Giant Slayer', description: 'Win at Ascension III.',
    family: 'ascension', tier: 'gold', check: (v) => v.wonCup && v.run.ascension >= 3 },
  { id: 'the-summit', name: 'The Summit', description: 'Win at the highest Ascension tier.',
    family: 'ascension', tier: 'gold', check: (v) => v.wonCup && v.run.ascension >= MAX_ASCENSION },
  { id: 'ladder-climb', name: 'Ladder Climb', description: 'Win at least once at every Ascension tier.',
    family: 'ascension', tier: 'gold',
    check: (v) => ASCENSION_TIERS.every((tier) => cupsAt(v, tier) > 0) },
  { id: 'hard-habit', name: 'Hard Habit', description: 'Finish 10 runs at Ascension II or higher.',
    family: 'ascension', tier: 'silver', check: (v) => v.career.stats.runsAtHighAscension >= 10 },
  { id: 'no-safety-net', name: 'No Safety Net', description: 'Win at Ascension III or higher without taking a legendary boost.',
    family: 'ascension', tier: 'gold',
    check: (v) => v.wonCup && v.run.ascension >= 3 && !v.rarities.includes('legendary') },
  { id: 'straight-up', name: 'Straight Up', description: 'Unlock a new Ascension tier without ever losing a final.',
    family: 'ascension', tier: 'silver',
    // A cup unlocks the tier above it exactly when it is the FIRST cup at its own tier:
    // the ceiling only ever rises by one, so reaching tier T at all means T-1 was
    // already won. At the top of the ladder there is nothing left to unlock.
    check: (v) =>
      v.wonCup &&
      !v.career.stats.everLostFinal &&
      v.run.ascension < MAX_ASCENSION &&
      cupsAt(v, v.run.ascension) === 1 },

  // --- C. Squad identity --------------------------------------------------
  // Judged on `own` - the XI MINUS anyone a roster boost handed over - and on no count
  // beyond it. A themed run is a thing you build at the draft, and Poach or Wildcard
  // Legend deal a player you did not choose; requiring all eleven would let a boost you
  // could not refuse quietly break the theme (trap 2). "11 different nations" is the
  // exception, because there the count IS the challenge.
  { id: 'united-nations', name: 'United Nations', description: 'Win with 5 or more different nations in the XI.',
    family: 'identity', tier: 'bronze', check: (v) => v.wonCup && distinct(v.own, nationOf).size >= 5 },
  { id: 'cosmopolitan', name: 'Cosmopolitan', description: 'Win with 8 or more different nations.',
    family: 'identity', tier: 'silver', check: (v) => v.wonCup && distinct(v.own, nationOf).size >= 8 },
  { id: 'babel', name: 'Babel', description: 'Win with 11 different nations.',
    family: 'identity', tier: 'gold', check: (v) => v.wonCup && distinct(v.own, nationOf).size >= 11 },
  { id: 'one-flag', name: 'One Flag', description: 'Win with every player you picked from a single nation.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && distinct(v.own, nationOf).size === 1 },
  { id: 'club-class', name: 'Club Class', description: 'Win with every player you picked from a single squad (one nation, one tournament).',
    family: 'identity', tier: 'gold',
    check: (v) => v.wonCup && distinct(v.own, (p) => p.squadId).size === 1 },
  { id: 'time-capsule', name: 'Time Capsule', description: 'Win with every player you picked from a single World Cup year.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && distinct(v.own, yearOf).size === 1 },
  { id: 'two-cups', name: 'Two Cups', description: 'Win with players from exactly two tournaments.',
    family: 'identity', tier: 'silver', check: (v) => v.wonCup && distinct(v.own, yearOf).size === 2 },
  { id: 'golden-generation', name: 'Golden Generation', description: 'Win with 7 or more players from one nation.',
    family: 'identity', tier: 'bronze', check: (v) => v.wonCup && topCount(v.own, nationOf) >= 7 },
  { id: 'continental', name: 'Continental', description: 'Win with all 11 from one confederation.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && distinct(v.own, confedOf).size === 1 && !!confedOf(v.own[0]) },
  { id: 'old-world', name: 'Old World', description: 'Win with an all-UEFA XI.',
    family: 'identity', tier: 'bronze',
    check: (v) => v.wonCup && allOf(v.own, (p) => confedOf(p) === 'UEFA') },
  { id: 'samba', name: 'Samba', description: 'Win with an all-Brazilian XI.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && allOf(v.own, (p) => codeOf(p) === 'BRA') },
  { id: 'iron-curtain', name: 'Iron Curtain', description: 'Win with a Soviet, Czechoslovak or Yugoslav player in the XI.',
    family: 'identity', tier: 'bronze',
    check: (v) => v.wonCup && v.own.some((p) => ['URS', 'TCH', 'YUG'].includes(codeOf(p))) },
  { id: 'the-nineties', name: 'The Nineties', description: 'Win with every player from 1990, 1994 or 1998.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && allOf(v.own, (p) => [1990, 1994, 1998].includes(yearOf(p))) },
  { id: 'millennials', name: 'Millennials', description: 'Win with every player from 2002, 2006 or 2010.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && allOf(v.own, (p) => [2002, 2006, 2010].includes(yearOf(p))) },
  { id: 'modern-era', name: 'Modern Era', description: 'Win with every player from 2014, 2018 or 2022.',
    family: 'identity', tier: 'silver',
    check: (v) => v.wonCup && allOf(v.own, (p) => [2014, 2018, 2022].includes(yearOf(p))) },
  { id: 'every-era', name: 'Every Era', description: 'Win with at least one player from each decade in the pool.',
    family: 'identity', tier: 'gold',
    check: (v) => v.wonCup && ALL_DECADES.every((d) => v.own.some((p) => Math.floor(yearOf(p) / 10) * 10 === d)) },

  // --- D. Rating & value (dataset ratings, never the boosted copies) -------
  { id: 'rag-tag', name: 'Rag Tag', description: 'Win with an XI averaging under 80.',
    family: 'rating', tier: 'silver', check: (v) => v.wonCup && v.avg < 80 },
  { id: 'underdogs', name: 'Underdogs', description: 'Win with an XI averaging under 75.',
    family: 'rating', tier: 'gold', check: (v) => v.wonCup && v.avg < 75 },
  { id: 'minnows', name: 'Minnows', description: 'Win with an XI averaging under 70.',
    family: 'rating', tier: 'gold', check: (v) => v.wonCup && v.avg < 70 },
  { id: 'no-superstars', name: 'No Superstars', description: 'Win with nobody rated 90 or above.',
    family: 'rating', tier: 'silver', check: (v) => v.wonCup && allOf(v.xi, (p) => p.elo < 90) },
  { id: 'one-man-team', name: 'One-Man Team', description: 'Win with exactly one player rated 90 or above, and nobody else above 82.',
    family: 'rating', tier: 'gold',
    check: (v) => v.wonCup && v.xi.filter((p) => p.elo >= 90).length === 1
      && v.xi.filter((p) => p.elo < 90).every((p) => p.elo <= 82) },
  { id: 'balanced-books', name: 'Balanced Books', description: 'Win with nobody below 75 and nobody above 88.',
    family: 'rating', tier: 'silver',
    check: (v) => v.wonCup && allOf(v.xi, (p) => p.elo >= 75 && p.elo <= 88) },
  { id: 'beat-the-odds', name: 'Beat the Odds', description: 'Win a knockout tie against a team rated 10 or more higher.',
    family: 'rating', tier: 'bronze',
    check: (v) => v.ko.some((r) => r.won && (r.oppRating ?? 0) - (r.userRating ?? 0) >= 10) },
  { id: 'david', name: 'David', description: 'Win a knockout tie against a team rated 15 or more higher.',
    family: 'rating', tier: 'silver',
    check: (v) => v.ko.some((r) => r.won && (r.oppRating ?? 0) - (r.userRating ?? 0) >= 15) },
  { id: 'always-the-underdog', name: 'Always the Underdog', description: 'Win the cup with every knockout opponent rated higher than you.',
    family: 'rating', tier: 'gold',
    check: (v) => v.wonCup && v.ko.every((r) => (r.oppRating ?? 0) > (r.userRating ?? 0)) },
  { id: 'journeymen', name: 'Journeymen', description: 'Win with nobody rated above 85.',
    family: 'rating', tier: 'silver', check: (v) => v.wonCup && allOf(v.xi, (p) => p.elo <= 85) },
  { id: 'galacticos', name: 'Galacticos', description: 'Win with an XI averaging 90 or more.',
    family: 'rating', tier: 'silver', check: (v) => v.wonCup && v.avg >= 90 },
  { id: 'chemistry-set', name: 'Chemistry Set', description: 'Win with the maximum chemistry bonus.',
    family: 'rating', tier: 'gold',
    check: (v) => v.wonCup && (v.run.chemistry ?? 0) >= MAX_BONUS },

  // --- E. Defence (the scoreline only: a shootout is not goals conceded) ---
  { id: 'the-wall', name: 'The Wall', description: 'Win every knockout tie without conceding. A shootout does not count against it.',
    family: 'defence', tier: 'gold',
    check: (v) => v.wonCup && v.ko.every((r) => (r.oppGoals ?? 0) === 0) },
  { id: 'clean-group', name: 'Clean Group', description: 'Concede nothing in the group stage.',
    family: 'defence', tier: 'silver',
    check: (v) => v.matches.filter((m) => !m.ko).length === 3 && v.matches.every((m) => m.ko || m.them === 0) },
  { id: 'fortress', name: 'Fortress', description: 'Win the cup conceding 2 goals or fewer all run.',
    family: 'defence', tier: 'gold', check: (v) => v.wonCup && v.goalsAgainst <= 2 },
  { id: 'shut-out', name: 'Shut Out', description: 'Keep 4 clean sheets in one run.',
    family: 'defence', tier: 'bronze', check: (v) => v.cleanSheets >= 4 },
  { id: 'understudy', name: 'Understudy', description: 'Win with a goalkeeper rated under 75.',
    family: 'defence', tier: 'silver',
    check: (v) => v.wonCup && v.xi.some((p) => primaryPosition(p) === 'GK' && p.elo < 75) },
  { id: 'smash-and-grab', name: 'Smash and Grab', description: 'Win a knockout tie 1-0.',
    family: 'defence', tier: 'bronze',
    check: (v) => v.matches.some((m) => m.ko && m.won && m.us === 1 && m.them === 0) },
  { id: 'nervy', name: 'Nervy', description: 'Win three knockout ties by exactly one goal.',
    family: 'defence', tier: 'silver',
    check: (v) => v.matches.filter((m) => m.ko && m.won && m.us - m.them === 1).length >= 3 },
  { id: 'stalemate', name: 'Stalemate', description: 'Win a tie that finished goalless after extra time.',
    family: 'defence', tier: 'silver',
    check: (v) => v.matches.some((m) => m.ko && m.won && m.us === 0 && m.them === 0) },
  { id: 'final-lockdown', name: 'Final Lockdown', description: 'Win the final without conceding.',
    family: 'defence', tier: 'silver',
    check: (v) => v.wonCup && (v.ko.at(-1)?.oppGoals ?? 1) === 0 },
  { id: 'rearguard', name: 'Rearguard', description: 'Win the cup never conceding more than one in a match.',
    family: 'defence', tier: 'silver',
    check: (v) => v.wonCup && v.matches.every((m) => m.them <= 1) },

  // --- F. Attack (scorers are recorded for knockout ties only) -------------
  { id: 'route-one', name: 'Route One', description: 'Score 4 or more in a single knockout tie.',
    family: 'attack', tier: 'bronze', check: (v) => v.matches.some((m) => m.ko && m.us >= 4) },
  { id: 'goal-rush', name: 'Goal Rush', description: 'Score 5 or more in a single match.',
    family: 'attack', tier: 'silver', check: (v) => v.matches.some((m) => m.us >= 5) },
  { id: 'demolition', name: 'Demolition', description: 'Win a knockout tie by 4 goals or more.',
    family: 'attack', tier: 'silver',
    check: (v) => v.matches.some((m) => m.ko && m.us - m.them >= 4) },
  { id: 'sharp-shooters', name: 'Sharp Shooters', description: 'Score 15 or more goals across one run.',
    family: 'attack', tier: 'silver', check: (v) => v.goalsFor >= 15 },
  { id: 'never-blank', name: 'Never Blank', description: 'Score in every match of a winning run.',
    family: 'attack', tier: 'silver',
    check: (v) => v.wonCup && v.matches.every((m) => m.us >= 1) },
  { id: 'hat-trick-hero', name: 'Hat-Trick Hero', description: 'One player scores 3 or more in a knockout tie.',
    family: 'attack', tier: 'silver',
    check: (v) => v.ko.some((r) => topCountOf(scorersOf(r)) >= 3) },
  { id: 'talisman', name: 'Talisman', description: 'One player scores in four different knockout ties.',
    family: 'attack', tier: 'gold',
    check: (v) => {
      const ties = new Map<string, number>();
      for (const r of v.ko) for (const s of new Set(scorersOf(r))) ties.set(s, (ties.get(s) ?? 0) + 1);
      return [...ties.values()].some((n) => n >= 4);
    } },
  { id: 'spread-the-load', name: 'Spread the Load', description: 'Six different scorers across your knockout ties.',
    family: 'attack', tier: 'silver',
    check: (v) => new Set(v.ko.flatMap(scorersOf)).size >= 6 },
  { id: 'early-bird', name: 'Early Bird', description: 'Score inside the first five minutes of a knockout tie.',
    family: 'attack', tier: 'bronze',
    check: (v) => v.ko.some((r) => minutesOf(r).some((m) => m <= 5)) },
  { id: 'late-show', name: 'Late Show', description: 'Win a knockout tie with a goal in the 89th minute or later.',
    family: 'attack', tier: 'silver',
    check: (v) => v.ko.some((r) => r.won && minutesOf(r).some((m) => m >= 89)) },
  { id: 'both-halves', name: 'Both Halves', description: 'Score in both halves of the final.',
    family: 'attack', tier: 'bronze',
    check: (v) => {
      const final = v.ko.at(-1);
      if (!final || v.ko.length < 4) return false;
      const mins = minutesOf(final);
      return mins.some((m) => m <= 45) && mins.some((m) => m > 45);
    } },
  { id: 'cup-final-rout', name: 'Cup Final Rout', description: 'Win the final by 3 goals or more.',
    family: 'attack', tier: 'silver',
    check: (v) => v.wonCup && (v.ko.at(-1)?.userGoals ?? 0) - (v.ko.at(-1)?.oppGoals ?? 0) >= 3 },

  // --- G. Knockout drama ---------------------------------------------------
  { id: 'cold-blooded', name: 'Cold Blooded', description: 'Win a shootout, then go on to lift the cup.',
    family: 'drama', tier: 'silver',
    check: (v) => v.wonCup && v.ko.some((r) => r.won && r.decided === 'pens') },
  { id: 'ice-veins', name: 'Ice Veins', description: 'Win two shootouts in one run.',
    family: 'drama', tier: 'gold',
    check: (v) => v.ko.filter((r) => r.won && r.decided === 'pens').length >= 2 },
  { id: 'extra-effort', name: 'Extra Effort', description: 'Win a tie in extra time.',
    family: 'drama', tier: 'bronze',
    check: (v) => v.ko.some((r) => r.won && r.decided === 'aet') },
  { id: 'the-hard-way', name: 'The Hard Way', description: 'Win ties in normal time, extra time and on penalties in one run.',
    family: 'drama', tier: 'gold',
    check: (v) => (['reg', 'aet', 'pens'] as KoDecided[])
      .every((d) => v.ko.some((r) => r.won && r.decided === d)) },
  { id: 'comeback-kings', name: 'Comeback Kings', description: 'Qualify with a negative goal difference, then win the cup.',
    family: 'drama', tier: 'gold',
    check: (v) => v.wonCup && v.matches.filter((m) => !m.ko).reduce((n, m) => n + m.us - m.them, 0) < 0 },
  { id: 'backs-to-the-wall', name: 'Backs to the Wall', description: 'Lose your opening group match, then win the cup.',
    family: 'drama', tier: 'silver',
    check: (v) => { const first = v.matches.find((m) => !m.ko); return v.wonCup && !!first && first.us < first.them; } },
  { id: 'rocky-start', name: 'Rocky Start', description: 'Lose two group matches and still qualify.',
    family: 'drama', tier: 'silver',
    check: (v) => !!v.group?.won && v.matches.filter((m) => !m.ko && m.us < m.them).length >= 2 },
  { id: 'perfect-pens', name: 'Perfect Pens', description: 'Win a shootout without missing a kick.',
    family: 'drama', tier: 'silver',
    check: (v) => v.ko.some((r) => r.won && r.decided === 'pens'
      && !!r.pens && r.pens.kicks.filter((k) => k.side === 'home').every((k) => k.scored)) },
  { id: 'sudden-death', name: 'Sudden Death', description: 'Win a shootout that ran past five kicks each.',
    family: 'drama', tier: 'silver',
    check: (v) => v.ko.some((r) => r.won && r.decided === 'pens'
      && !!r.pens && r.pens.kicks.filter((k) => k.side === 'home').length > 5) },
  { id: 'final-drama', name: 'Final Drama', description: 'Win the final in extra time or on penalties.',
    family: 'drama', tier: 'silver',
    check: (v) => v.wonCup && v.ko.at(-1)?.decided !== 'reg' },

  // --- H. Boosts & perks ---------------------------------------------------
  { id: 'purist', name: 'Purist', description: 'Win without a single roster boost (nobody handed to you).',
    family: 'boosts', tier: 'silver', check: (v) => v.wonCup && v.run.boostedIds.length === 0 },
  { id: 'common-touch', name: 'Common Touch', description: 'Win taking only common boosts.',
    family: 'boosts', tier: 'gold',
    check: (v) => v.wonCup && v.rarities.length > 0 && v.rarities.every((r) => r === 'common') },
  { id: 'legendary-lean', name: 'Legendary Lean', description: 'Win having taken three or more legendary boosts.',
    family: 'boosts', tier: 'silver',
    check: (v) => v.wonCup && v.rarities.filter((r) => r === 'legendary').length >= 3 },
  { id: 'full-spectrum', name: 'Full Spectrum', description: 'Take a common, a rare and a legendary boost in one run.',
    family: 'boosts', tier: 'bronze',
    check: (v) => (['common', 'rare', 'legendary'] as Rarity[]).every((r) => v.rarities.includes(r)) },
  { id: 'no-second-chances', name: 'No Second Chances', description: 'Win without using a boost re-roll, with the Physio Table owned.',
    family: 'boosts', tier: 'silver',
    check: (v) => { const t = v.run.perkLevels['physio'] ?? 0; return v.wonCup && t > 0 && (v.run.rerollsLeft ?? 0) >= t; } },
  { id: 'perkless', name: 'Perkless', description: 'Win a run owning no perks at all.',
    family: 'boosts', tier: 'gold',
    check: (v) => v.wonCup && Object.values(v.run.perkLevels).every((t) => !t) },
  { id: 'full-kit', name: 'Full Kit', description: 'Win with every perk owned at its maximum tier.',
    family: 'boosts', tier: 'silver', check: (v) => v.wonCup && allPerksMaxed(v.run) },
  { id: 'poacher', name: 'Poacher', description: 'Poach the next opponent, then beat them.',
    family: 'boosts', tier: 'bronze', check: (v) => !!tieAfterBoost(v, 'poach')?.won },
  { id: 'wildcard-winner', name: 'Wildcard Winner', description: 'Win with a Wildcard Legend in the XI.',
    family: 'boosts', tier: 'bronze',
    check: (v) => v.wonCup && v.run.activeBoons.includes('wildcard') },
  { id: 'glass-cannon-gambit', name: 'Glass Cannon Gambit', description: 'Win having taken Glass Cannon.',
    family: 'boosts', tier: 'silver',
    check: (v) => v.wonCup && v.run.activeBoons.includes('glass-cannon') },
  { id: 'catenaccio-cup', name: 'Catenaccio Cup', description: 'Win having taken Catenaccio, conceding 3 goals or fewer.',
    family: 'boosts', tier: 'gold',
    check: (v) => v.wonCup && v.run.activeBoons.includes('catenaccio') && v.goalsAgainst <= 3 },
  { id: 'boost-collector', name: 'Boost Collector', description: 'Take 5 or more boosts in a single run.',
    family: 'boosts', tier: 'bronze', check: (v) => v.run.activeBoons.length >= 5 },

  // --- I. Album & collectibles ---------------------------------------------
  { id: 'collector', name: 'Collector', description: 'Win with 3 or more collectibles in the XI.',
    family: 'album', tier: 'bronze',
    check: (v) => v.wonCup && v.xi.filter((p) => tierOf(p)).length >= 3 },
  { id: 'hall-of-fame', name: 'Hall of Fame', description: 'Win with 5 or more collectibles in the XI.',
    family: 'album', tier: 'silver',
    check: (v) => v.wonCup && v.xi.filter((p) => tierOf(p)).length >= 5 },
  { id: 'monumental', name: 'Monumental', description: 'Win with a Monumental player in the XI.',
    family: 'album', tier: 'silver',
    check: (v) => v.wonCup && v.xi.some((p) => tierOf(p) === 'monumental') },
  { id: 'new-blood', name: 'New Blood', description: 'Add three stickers you did not own to the album from one run.',
    family: 'album', tier: 'silver',
    check: (v) => v.own.filter((p) => tierOf(p) && !v.album.collected.includes(p.id)).length >= 3 },
  { id: 'legendary-set', name: 'Legendary Set', description: 'Collect every Legendary sticker.',
    family: 'album', tier: 'gold', check: (v) => hasWholeTier(v, 'legendary') },
  { id: 'iconic-set', name: 'Iconic Set', description: 'Collect every Iconic sticker.',
    family: 'album', tier: 'gold', check: (v) => hasWholeTier(v, 'iconic') },
  { id: 'full-album', name: 'Full Album', description: 'Collect every sticker.',
    family: 'album', tier: 'gold',
    check: (v) => COLLECTIBLE_IDS.every((id) => v.album.collected.includes(id)) },
  { id: 'trader', name: 'Trader', description: 'Complete five trades.',
    family: 'album', tier: 'bronze', check: (v) => v.trades >= 5 },
  { id: 'self-made', name: 'Self-Made', description: 'Win with no collectibles in the XI at all.',
    family: 'album', tier: 'silver',
    check: (v) => v.wonCup && v.xi.length > 0 && !v.xi.some((p) => tierOf(p)) },
  { id: 'bargain-bin', name: 'Bargain Bin', description: 'Buy five discounted (already-owned) players in one build.',
    // No cup required: the challenge is the shopping trip, not the run.
    family: 'album', tier: 'bronze', check: (v) => (v.buy?.discounted ?? 0) >= 5 },

  // --- J. Market & budget --------------------------------------------------
  // Prices are the DISCOUNTED ones actually charged, recorded at kickoff: the album
  // grows, so asking the pricer again at run end would answer a different question.
  { id: 'thrifty', name: 'Thrifty', description: 'Win with $20 or more of the budget unspent.',
    family: 'market', tier: 'silver',
    check: (v) => v.wonCup && !!v.buy && v.buy.budget - v.buy.spent >= 20 },
  { id: 'every-cent', name: 'Every Cent', description: 'Win having spent the budget to the last dollar.',
    family: 'market', tier: 'bronze',
    check: (v) => v.wonCup && !!v.buy && v.buy.spent === v.buy.budget },
  { id: 'bargain-hunter', name: 'Bargain Hunter', description: 'Win with no player costing more than $12.',
    family: 'market', tier: 'silver',
    check: (v) => v.wonCup && !!v.buy && v.buy.dearest > 0 && v.buy.dearest <= 12 },
  { id: 'marquee-signing', name: 'Marquee Signing', description: 'Win having spent $25 or more on one player.',
    family: 'market', tier: 'bronze', check: (v) => v.wonCup && (v.buy?.dearest ?? 0) >= 25 },
  { id: 'market-master', name: 'Market Master', description: 'Win a bought XI at Ascension II or higher.',
    family: 'market', tier: 'gold',
    check: (v) => v.wonCup && !!v.buy && v.run.ascension >= HIGH_ASCENSION },
  { id: 'roll-with-it', name: 'Roll With It', description: 'Win with a rolled XI rather than a bought one.',
    family: 'market', tier: 'bronze', check: (v) => v.wonCup && v.rolled },
  { id: 'first-draw', name: 'First Draw', description: 'Win a rolled run without using a squad re-roll.',
    family: 'market', tier: 'gold', check: (v) => v.wonCup && v.rolled && v.rerollsUsed === 0 },
  { id: 'swap-meet', name: 'Swap Meet', description: 'Use both collectible swaps and win the cup.',
    family: 'market', tier: 'silver', check: (v) => v.wonCup && (v.swapsUsed ?? 0) >= ALL_SWAPS },

  // --- K. Shape & positions ------------------------------------------------
  // All of these read the KICKOFF shape (`v.placed`), not the final XI: a roster boost
  // rearranges nothing, it just hands over a player, and placing a player promotes the
  // slot's role onto him, so the natural position only survives on the dataset row.
  { id: 'back-five', name: 'Back Five', description: 'Win with a five-defender formation.',
    family: 'shape', tier: 'bronze',
    check: (v) => v.wonCup && v.placed.filter((s) => categoryOf(s.role) === 'DEF').length >= 5 },
  { id: 'all-out-attack', name: 'All Out Attack', description: 'Win playing the offensive style.',
    family: 'shape', tier: 'bronze', check: (v) => v.wonCup && v.run.shape?.style === 'off' },
  { id: 'park-the-bus', name: 'Park the Bus', description: 'Win playing the defensive style.',
    family: 'shape', tier: 'bronze', check: (v) => v.wonCup && v.run.shape?.style === 'def' },
  { id: 'shape-shifter', name: 'Shape Shifter', description: 'Win cups with three different formations.',
    family: 'shape', tier: 'silver',
    check: (v) => (v.career.stats.cupFormations ?? []).length >= 3 },
  { id: 'out-of-position', name: 'Out of Position', description: 'Win with 3 or more players outside their natural position.',
    family: 'shape', tier: 'silver', check: (v) => v.wonCup && outOfPosition(v) >= 3 },
  { id: 'textbook', name: 'Textbook', description: 'Win with every player in his natural position.',
    family: 'shape', tier: 'silver',
    check: (v) => v.wonCup && v.placed.length > 0 && outOfPosition(v) === 0 },
  { id: 'keepers-union', name: "Keeper's Union", description: 'Win with the goalkeeper rated higher than every outfielder.',
    family: 'shape', tier: 'silver',
    check: (v) => {
      const gk = v.placed.find((s) => s.role === 'GK');
      return (
        v.wonCup && !!gk && v.placed.every((s) => s.role === 'GK' || gk.player.elo > s.player.elo)
      );
    } },
  { id: 'midfield-general', name: 'Midfield General', description: 'Win with your highest-rated player in midfield.',
    family: 'shape', tier: 'bronze',
    // A tie for top rating counts if ANY of the joint-best sits in a midfield slot.
    check: (v) =>
      v.wonCup &&
      v.placed.some((s) => s.player.elo === topRating(v) && categoryOf(s.role) === 'MID') },

  // --- L. Career & streaks -------------------------------------------------
  { id: 'persistent', name: 'Persistent', description: 'Finish 25 runs.',
    family: 'career', tier: 'bronze', check: (v) => v.career.stats.runs >= 25 },
  { id: 'centurion', name: 'Centurion', description: 'Finish 100 runs.',
    family: 'career', tier: 'gold', check: (v) => v.career.stats.runs >= 100 },
  { id: 'level-ten', name: 'Level Ten', description: 'Reach level 10.',
    family: 'career', tier: 'bronze', check: (v) => v.career.level >= 10 },
  { id: 'veteran', name: 'Veteran', description: 'Reach level 25.',
    family: 'career', tier: 'silver', check: (v) => v.career.level >= 25 },
  { id: 'war-chest', name: 'War Chest', description: 'Hold 200 Prestige at once.',
    family: 'career', tier: 'bronze', check: (v) => v.career.prestige >= 200 },
  { id: 'spendthrift', name: 'Spendthrift', description: 'Spend 500 Prestige in total.',
    family: 'career', tier: 'silver', check: (v) => v.career.stats.prestigeSpent >= 500 },
  // Redefined when the counters landed: "win three runs in a row" was Three-Peat under
  // another name. The id is kept, so nothing already earned is orphaned.
  { id: 'on-a-roll', name: 'On a Roll', description: 'Reach a final in three consecutive runs.',
    family: 'career', tier: 'gold', check: (v) => v.career.stats.finalStreak >= 3 },
  { id: 'consistency', name: 'Consistency', description: 'Reach the semi-final or better in five consecutive runs.',
    family: 'career', tier: 'silver', check: (v) => v.career.stats.semiStreak >= 5 },
  { id: 'challenge-hunter', name: 'Challenge Hunter', description: 'Complete 10 challenges.',
    family: 'career', tier: 'bronze', check: (v) => v.career.completedChallenges.length >= 10 },
  { id: 'honour-roll', name: 'Honour Roll', description: 'Complete 25 challenges.',
    family: 'career', tier: 'silver', check: (v) => v.career.completedChallenges.length >= 25 },
  { id: 'honours-master', name: 'Honours Master', description: 'Complete 50 challenges.',
    family: 'career', tier: 'gold', check: (v) => v.career.completedChallenges.length >= 50 },
  { id: 'every-family', name: 'Every Family', description: 'Complete at least one challenge from every family.',
    family: 'career', tier: 'gold',
    check: (v) => {
      const done = new Set(v.career.completedChallenges);
      return FAMILIES.every((f) => CHALLENGES.some((c) => c.family === f && done.has(c.id)));
    } },
];

export const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));
export const challengeById = (id: string): Challenge | undefined => CHALLENGE_BY_ID.get(id);

/** Every collectible player id in the dataset, for the album-completion challenges. */
const COLLECTIBLE_IDS = collectiblePlayers(SQUADS.flatMap((s) => s.players)).map((p) => p.id);
const hasWholeTier = (v: RunView, tier: 'legendary' | 'iconic') =>
  collectiblePlayers(SQUADS.flatMap((s) => s.players))
    .filter((p) => tierOf(p) === tier)
    .every((p) => v.album.collected.includes(p.id));

/** How many times the most frequent entry appears (0 for an empty list). */
const topCountOf = (xs: string[]): number => {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return Math.max(0, ...counts.values());
};

/** The ids newly satisfied by a finished run: the catalogue, minus what the career
 *  already holds, minus everything still blocked.
 *
 *  Run to a fixed point (a handful of passes at most), because a few challenges count
 *  completions themselves ("complete 10 challenges", "one from every family"): the run
 *  that takes you past 10 should tick Challenge Hunter in the same breath rather than
 *  making you play one more. */
export function completedIn(ctx: ChallengeCtx): string[] {
  if (!FEATURES.challenges) return [];
  const view = viewOf(ctx);
  const done = new Set(ctx.career.completedChallenges);
  const gained: string[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const before = gained.length;
    // Each pass sees what the earlier ones completed AND the Prestige they paid, so a
    // wallet threshold ("hold 200 Prestige") can be crossed by the awards of the same run.
    // With awards off nothing is paid, so nothing is added here either.
    const career: CareerState = {
      ...view.career,
      completedChallenges: [...done],
      prestige: view.career.prestige + (FEATURES.challengeAwards ? prestigeFor(gained) : 0),
    };
    for (const c of CHALLENGES) {
      if (c.blocked || done.has(c.id)) continue;
      const v: RunView = { ...view, career };
      let ok = false;
      try {
        ok = c.check(v);
      } catch {
        ok = false; // a predicate must never take the run down with it
      }
      if (ok) {
        done.add(c.id);
        gained.push(c.id);
      }
    }
    if (gained.length === before) break;
  }
  return gained;
}

/** Total Prestige for a set of completed ids (unknown ids are worth nothing). */
export const prestigeFor = (ids: string[]): number =>
  ids.reduce((n, id) => { const c = challengeById(id); return n + (c ? AWARD[c.tier] : 0); }, 0);

/** Whether a challenge pays, and therefore whether any award is shown. One switch for
 *  both, so Prestige never arrives from a source the player cannot see. */
export const AWARDS_ON = FEATURES.challengeAwards;

/** Catalogue progress, for the counter on the catalogue screen and the hub card. */
export interface ChallengeProgress {
  total: number;
  completed: number;
  /** Completable today: neither done nor waiting on tracking that does not exist. */
  available: number;
  blocked: number;
  byTier: Record<ChallengeTier, { total: number; completed: number }>;
  /** Per-family totals, in the same shape as `byTier`. Here rather than in the screens
   *  because both the catalogue and the cabinet want it and it is one walk either way. */
  byFamily: Record<ChallengeFamily, { total: number; completed: number }>;
  prestige: number;
}
export function challengeProgress(completed: string[]): ChallengeProgress {
  const done = new Set(completed);
  const byTier: ChallengeProgress['byTier'] = {
    bronze: { total: 0, completed: 0 },
    silver: { total: 0, completed: 0 },
    gold: { total: 0, completed: 0 },
  };
  const byFamily = Object.fromEntries(
    FAMILIES.map((f) => [f, { total: 0, completed: 0 }]),
  ) as ChallengeProgress['byFamily'];
  let blocked = 0;
  for (const c of CHALLENGES) {
    byTier[c.tier].total++;
    byFamily[c.family].total++;
    if (done.has(c.id)) {
      byTier[c.tier].completed++;
      byFamily[c.family].completed++;
    }
    if (c.blocked) blocked++;
  }
  const completedCount = CHALLENGES.filter((c) => done.has(c.id)).length;
  return {
    total: CHALLENGES.length,
    completed: completedCount,
    available: CHALLENGES.length - completedCount - blocked,
    blocked,
    byTier,
    byFamily,
    prestige: prestigeFor(CHALLENGES.filter((c) => done.has(c.id)).map((c) => c.id)),
  };
}
