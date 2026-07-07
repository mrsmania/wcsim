import type { Player, Position, Squad } from '../data/types';
import { primaryPosition } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { CONFEDERATION, type Confederation } from '../data/confederations';
import type { Formation } from './formations';
import type { Filled } from './draft';

// ---------------------------------------------------------------------------
// Team chemistry. A transparent, additive score of how cohesive the user's XI
// is: each category contributes a small integer, they sum, and the total is
// capped at MAX_BONUS and added to the XI's overall rating.
//
// Opponents are real, intact national squads (innate chemistry); this rewards
// building a connected draft (one nation, one era, players in their natural
// role) to help a patchwork XI close the gap. See docs/chemistry-design.md.
//
// Category names here are the SAME strings shown in the UI rules and breakdown,
// and the per-category points add up to the bonus (until the cap), so the final
// value is fully reconstructable from what is displayed.
// ---------------------------------------------------------------------------

export type ChemDimension = 'squad' | 'nation' | 'tournament' | 'continent' | 'era' | 'fit';

/** Display name per category - reused verbatim in the rules tooltip and breakdown. */
export const CHEM_NAME: Record<ChemDimension, string> = {
  squad: 'Same squad',
  nation: 'Same nation',
  tournament: 'Same tournament',
  continent: 'Same continent',
  era: 'Same era',
  fit: 'In position',
};

/** The cap on the total chemistry bonus added to overall. */
export const MAX_BONUS = 6;

// Tuning thresholds for each category. Cluster sizes map to points; the
// "Same era" window and "In position" count have their own thresholds.
/** Same-squad cluster sizes -> points (e.g. 11+ real teammates score 4). */
const SQUAD_TIERS: [size: number, points: number][] = [[11, 4], [7, 3], [4, 2], [2, 1]];
/** Same-nation cluster sizes -> points. */
const NATION_TIERS: [size: number, points: number][] = [[8, 3], [5, 2], [3, 1]];
/** Same-tournament cluster sizes -> points. */
const TOURNAMENT_TIERS: [size: number, points: number][] = [[8, 3], [5, 2], [3, 1]];
/** Same-continent (confederation) cluster sizes -> points. */
const CONTINENT_TIERS: [size: number, points: number][] = [[9, 2], [6, 1]];
/** "Same era": max span (in tournament years) between the earliest and latest squad. */
const ERA_SPAN_YEARS = 4;
/** Points awarded when a squad set falls within ERA_SPAN_YEARS. */
const ERA_POINTS = 1;
/** Minimum players standing in their natural role to earn the "In position" point. */
const FIT_MIN = 10;
/** Points awarded when at least FIT_MIN players are in their natural role. */
const FIT_POINTS = 1;

/** Points for a cluster of the given size, from a size -> points tier table
 *  (largest qualifying tier wins; 0 if below every threshold). */
function tierPoints(size: number, tiers: [size: number, points: number][]): number {
  for (const [min, pts] of tiers) {
    if (size >= min) return pts;
  }
  return 0;
}

export interface Placement {
  player: Player;
  /** The role of the slot the player was placed in. */
  slotPosition: Position;
}

export interface ChemistryCategory {
  key: ChemDimension;
  /** Same as CHEM_NAME[key]. */
  name: string;
  /** What earned it, e.g. "Brazil 2002 ×11", "Brazil ×6", "UEFA ×7", "10/11". */
  detail: string;
  /** Integer points contributed (on the final bonus scale). */
  points: number;
}

export interface ChemistryReport {
  placed: number;
  /** Bonus added to overall = min(MAX_BONUS, rawTotal). */
  bonus: number;
  /** Sum of category points before the cap. */
  rawTotal: number;
  /** True when rawTotal exceeded MAX_BONUS. */
  capped: boolean;
  /** Earned categories (points > 0), largest first. */
  categories: ChemistryCategory[];
}

/** Largest group sharing a key, plus that key. */
function topCluster<T>(items: T[], key: (t: T) => string): { key: string; size: number } {
  const counts = new Map<string, number>();
  let bestKey = '';
  let best = 0;
  for (const it of items) {
    const k = key(it);
    const c = (counts.get(k) ?? 0) + 1;
    counts.set(k, c);
    if (c > best) { best = c; bestKey = k; }
  }
  return { key: bestKey, size: best };
}

/** Score the cohesion of a (possibly partial) set of placed players. Pure. */
export function computeChemistry(placements: Placement[]): ChemistryReport {
  const placed = placements.length;
  if (placed === 0) {
    return { placed: 0, bonus: 0, rawTotal: 0, capped: false, categories: [] };
  }

  const squads: Squad[] = placements
    .map((pl) => SQUAD_BY_ID[pl.player.squadId])
    .filter((s): s is Squad => !!s);
  const cats: ChemistryCategory[] = [];

  // Same squad - real teammates (same nation & year). Largest such group.
  const sc = topCluster(squads, (s) => s.id);
  const squadPts = tierPoints(sc.size, SQUAD_TIERS);
  if (squadPts > 0) {
    const sq = squads.find((s) => s.id === sc.key)!;
    cats.push({ key: 'squad', name: CHEM_NAME.squad, detail: `${sq.nation} ${sq.year} ×${sc.size}`, points: squadPts });
  }

  // Same nation (across years).
  const nc = topCluster(squads, (s) => s.code);
  const nationPts = tierPoints(nc.size, NATION_TIERS);
  if (nationPts > 0) {
    const sq = squads.find((s) => s.code === nc.key)!;
    cats.push({ key: 'nation', name: CHEM_NAME.nation, detail: `${sq.nation} ×${nc.size}`, points: nationPts });
  }

  // Same tournament (across nations).
  const yc = topCluster(squads, (s) => String(s.year));
  const tournPts = tierPoints(yc.size, TOURNAMENT_TIERS);
  if (tournPts > 0) {
    cats.push({ key: 'tournament', name: CHEM_NAME.tournament, detail: `Class of ${yc.key} ×${yc.size}`, points: tournPts });
  }

  // Same continent - largest confederation group.
  const confs = squads.map((s) => CONFEDERATION[s.code]).filter((c): c is Confederation => !!c);
  const cc = topCluster(confs, (c) => c);
  const contPts = tierPoints(cc.size, CONTINENT_TIERS);
  if (contPts > 0) {
    cats.push({ key: 'continent', name: CHEM_NAME.continent, detail: `${cc.key} ×${cc.size}`, points: contPts });
  }

  // Same era - tight tournament-year span.
  const years = squads.map((s) => s.year);
  const span = Math.max(...years) - Math.min(...years);
  if (placed >= 2 && span <= ERA_SPAN_YEARS) {
    cats.push({ key: 'era', name: CHEM_NAME.era, detail: span === 0 ? 'same year' : `within ${span} yrs`, points: ERA_POINTS });
  }

  // In position - natural (primary) role only.
  const fitCount = placements.filter((pl) => primaryPosition(pl.player) === pl.slotPosition).length;
  if (fitCount >= FIT_MIN) {
    cats.push({ key: 'fit', name: CHEM_NAME.fit, detail: `${fitCount}/${placed}`, points: FIT_POINTS });
  }

  cats.sort((a, b) => b.points - a.points);
  const rawTotal = cats.reduce((sum, c) => sum + c.points, 0);
  const bonus = Math.min(MAX_BONUS, rawTotal);
  return { placed, bonus, rawTotal, capped: rawTotal > MAX_BONUS, categories: cats };
}

/** Convenience: build placements from a formation + filled map, then score. */
export function teamChemistry(formation: Formation, filled: Filled): ChemistryReport {
  const placements: Placement[] = [];
  for (const slot of formation.slots) {
    const player = filled[slot.id];
    if (player) placements.push({ player, slotPosition: slot.position });
  }
  return computeChemistry(placements);
}
