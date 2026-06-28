import type { Player, Position, Squad } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
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

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

/** Nation code -> confederation, for the "Same continent" category. */
export const CONFEDERATION: Record<string, Confederation> = {
  // UEFA
  FRA: 'UEFA', ITA: 'UEFA', NED: 'UEFA', GER: 'UEFA', ESP: 'UEFA', ENG: 'UEFA',
  POR: 'UEFA', BEL: 'UEFA', CRO: 'UEFA', SRB: 'UEFA', SUI: 'UEFA', DEN: 'UEFA',
  POL: 'UEFA', WAL: 'UEFA', SVN: 'UEFA', SVK: 'UEFA', GRE: 'UEFA', RUS: 'UEFA',
  BIH: 'UEFA', ISL: 'UEFA', SWE: 'UEFA', SCG: 'UEFA', CZE: 'UEFA', UKR: 'UEFA',
  // CONMEBOL
  BRA: 'CONMEBOL', ARG: 'CONMEBOL', URU: 'CONMEBOL', COL: 'CONMEBOL',
  ECU: 'CONMEBOL', CHI: 'CONMEBOL', PER: 'CONMEBOL', PAR: 'CONMEBOL',
  // CONCACAF
  MEX: 'CONCACAF', USA: 'CONCACAF', CRC: 'CONCACAF', CAN: 'CONCACAF',
  HON: 'CONCACAF', PAN: 'CONCACAF', TRI: 'CONCACAF',
  // CAF
  SEN: 'CAF', CMR: 'CAF', MAR: 'CAF', TUN: 'CAF', GHA: 'CAF', NGA: 'CAF',
  CIV: 'CAF', EGY: 'CAF', ALG: 'CAF', RSA: 'CAF', ANG: 'CAF', TOG: 'CAF',
  // AFC (Australia has competed in the AFC since 2006)
  KSA: 'AFC', IRN: 'AFC', JPN: 'AFC', KOR: 'AFC', QAT: 'AFC', AUS: 'AFC', PRK: 'AFC',
  // OFC
  NZL: 'OFC',
};

export type ChemDimension = 'squad' | 'nation' | 'tournament' | 'continent' | 'era' | 'fit';

/** Display name per category — reused verbatim in the rules tooltip and breakdown. */
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
  /** Players standing in their natural (primary) position. */
  fitCount: number;
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

let warnedMissing = false;

/** Score the cohesion of a (possibly partial) set of placed players. Pure. */
export function computeChemistry(placements: Placement[]): ChemistryReport {
  const placed = placements.length;
  if (placed === 0) {
    return { placed: 0, bonus: 0, rawTotal: 0, capped: false, fitCount: 0, categories: [] };
  }

  const squads: Squad[] = placements.map((pl) => SQUAD_BY_ID[pl.player.squadId]);
  const cats: ChemistryCategory[] = [];

  // Same squad — real teammates (same nation & year). Largest such group.
  const sc = topCluster(squads, (s) => s.id);
  const squadPts = sc.size >= 11 ? 4 : sc.size >= 7 ? 3 : sc.size >= 4 ? 2 : sc.size >= 2 ? 1 : 0;
  if (squadPts > 0) {
    const sq = squads.find((s) => s.id === sc.key)!;
    cats.push({ key: 'squad', name: CHEM_NAME.squad, detail: `${sq.nation} ${sq.year} ×${sc.size}`, points: squadPts });
  }

  // Same nation (across years).
  const nc = topCluster(squads, (s) => s.code);
  const nationPts = nc.size >= 8 ? 3 : nc.size >= 5 ? 2 : nc.size >= 3 ? 1 : 0;
  if (nationPts > 0) {
    const sq = squads.find((s) => s.code === nc.key)!;
    cats.push({ key: 'nation', name: CHEM_NAME.nation, detail: `${sq.nation} ×${nc.size}`, points: nationPts });
  }

  // Same tournament (across nations).
  const yc = topCluster(squads, (s) => String(s.year));
  const tournPts = yc.size >= 8 ? 3 : yc.size >= 5 ? 2 : yc.size >= 3 ? 1 : 0;
  if (tournPts > 0) {
    cats.push({ key: 'tournament', name: CHEM_NAME.tournament, detail: `Class of ${yc.key} ×${yc.size}`, points: tournPts });
  }

  // Same continent — largest confederation group.
  const confs = squads.map((s) => CONFEDERATION[s.code]).filter((c): c is Confederation => !!c);
  const cc = topCluster(confs, (c) => c);
  const contPts = cc.size >= 9 ? 2 : cc.size >= 6 ? 1 : 0;
  if (contPts > 0) {
    cats.push({ key: 'continent', name: CHEM_NAME.continent, detail: `${cc.key} ×${cc.size}`, points: contPts });
  }
  if (!warnedMissing) {
    const missing = squads.find((s) => !CONFEDERATION[s.code]);
    if (missing) {
      warnedMissing = true;
      console.warn(`[chemistry] no confederation mapped for nation code "${missing.code}"`);
    }
  }

  // Same era — tight tournament-year span.
  const years = squads.map((s) => s.year);
  const span = Math.max(...years) - Math.min(...years);
  if (placed >= 2 && span <= 4) {
    cats.push({ key: 'era', name: CHEM_NAME.era, detail: span === 0 ? 'same year' : `within ${span} yrs`, points: 1 });
  }

  // In position — natural (primary) role only.
  const fitCount = placements.filter((pl) => pl.player.positions[0] === pl.slotPosition).length;
  if (fitCount >= 10) {
    cats.push({ key: 'fit', name: CHEM_NAME.fit, detail: `${fitCount}/${placed}`, points: 1 });
  }

  cats.sort((a, b) => b.points - a.points);
  const rawTotal = cats.reduce((sum, c) => sum + c.points, 0);
  const bonus = Math.min(MAX_BONUS, rawTotal);
  return { placed, bonus, rawTotal, capped: rawTotal > MAX_BONUS, fitCount, categories: cats };
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
