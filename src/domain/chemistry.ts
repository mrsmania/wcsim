import type { Player, Position, Squad } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import type { Formation } from './formations';
import type { Filled } from './draft';

// ---------------------------------------------------------------------------
// Team chemistry. A pure scoring of how cohesive the user's drafted XI is, mapped
// to a small bounded bonus (0..MAX_BONUS) added to the XI's overall rating.
//
// Rationale: AI opponents are real, intact national-team squads (innate chemistry).
// The user's XI is a patchwork pulled from many nations/eras, so this rewards
// building a connected team (one nation, one era, players in their natural role)
// to help close that gap. See docs/chemistry-design.md.
//
// Gated by FEATURES.chemistry at the call sites; this module itself is always
// importable/testable.
// ---------------------------------------------------------------------------

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

/** Nation code -> confederation, for the "same continent" link. */
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

export interface Placement {
  player: Player;
  /** The role of the slot the player was placed in. */
  slotPosition: Position;
}

export interface ChemistryLink {
  dimension: ChemDimension;
  label: string;
  points: number;
}

export interface ChemistryReport {
  /** Players placed so far (0..11). */
  placed: number;
  /** Sum of all link points before mapping. */
  raw: number;
  /** Bonus added to overall, 0..MAX_BONUS. */
  bonus: number;
  /** Players standing in their natural (primary) position. */
  fitCount: number;
  /** Non-zero contributions, largest first (for display). */
  links: ChemistryLink[];
}

// --- tunable constants -----------------------------------------------------

/** Points for a cluster of `k` players from the same exact squad (real teammates). */
export const SQUAD_PTS: Record<number, number> = {
  2: 5, 3: 10, 4: 15, 5: 20, 6: 25, 7: 30, 8: 34, 9: 38, 10: 44, 11: 50,
};
export const MAX_BONUS = 6;
/** Raw points needed per +1 of bonus (higher = harder to earn chemistry). */
export const RAW_PER_BONUS = 6.5;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Count occurrences of each key among items (only keys with >= 1 appear). */
function tally<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

let warnedMissing = false;

/** Score the cohesion of a (possibly partial) set of placed players. Pure. */
export function computeChemistry(placements: Placement[]): ChemistryReport {
  const placed = placements.length;
  const links: ChemistryLink[] = [];
  if (placed === 0) return { placed: 0, raw: 0, bonus: 0, fitCount: 0, links };

  const squads: Squad[] = placements.map((pl) => SQUAD_BY_ID[pl.player.squadId]);

  // Same exact squad (real teammates) — sum across clusters of size >= 2.
  let squadPts = 0;
  for (const [sid, k] of tally(placements, (pl) => pl.player.squadId)) {
    if (k < 2) continue;
    const pts = SQUAD_PTS[Math.min(k, 11)] ?? 0;
    squadPts += pts;
    const sq = SQUAD_BY_ID[sid];
    links.push({ dimension: 'squad', label: `${sq.nation} ${sq.year} ×${k}`, points: pts });
  }

  // Same nation (across years).
  let nationPts = 0;
  for (const [code, k] of tally(squads, (s) => s.code)) {
    if (k < 2) continue;
    const pts = (k - 1) * 2;
    nationPts += pts;
    const nation = squads.find((s) => s.code === code)?.nation ?? code;
    links.push({ dimension: 'nation', label: `${nation} ×${k}`, points: pts });
  }

  // Same tournament (across nations).
  let yearPts = 0;
  for (const [yr, k] of tally(squads, (s) => String(s.year))) {
    if (k < 2) continue;
    const pts = (k - 1) * 1.5;
    yearPts += pts;
    links.push({ dimension: 'tournament', label: `Class of ${yr} ×${k}`, points: pts });
  }

  // Same continent — largest single-confederation group.
  const confs = squads
    .map((s) => CONFEDERATION[s.code])
    .filter((c): c is Confederation => !!c);
  let bestConf: Confederation | undefined;
  let g = 0;
  for (const [c, k] of tally(confs, (x) => x)) {
    if (k > g) { g = k; bestConf = c as Confederation; }
  }
  const contPts = g >= 9 ? 5 : g >= 6 ? 3 : g >= 4 ? 1 : 0;
  if (contPts > 0 && bestConf) {
    links.push({ dimension: 'continent', label: `${bestConf} ×${g}`, points: contPts });
  }
  if (!warnedMissing) {
    const missing = squads.find((s) => !CONFEDERATION[s.code]);
    if (missing) {
      warnedMissing = true;
      console.warn(`[chemistry] no confederation mapped for nation code "${missing.code}"`);
    }
  }

  // Same era — tightness of the tournament-year span.
  let eraPts = 0;
  const years = squads.map((s) => s.year);
  if (years.length >= 2) {
    const span = Math.max(...years) - Math.min(...years);
    eraPts = span <= 4 ? 5 : span <= 8 ? 3 : span <= 12 ? 1 : 0;
    if (eraPts > 0) {
      links.push({
        dimension: 'era',
        label: span === 0 ? 'Same tournament year' : `Within ${span} yrs`,
        points: eraPts,
      });
    }
  }

  // Positional fit — natural (primary) position only; secondary eligible = 0.
  const fitCount = placements.filter((pl) => pl.player.positions[0] === pl.slotPosition).length;
  const fitPts = fitCount >= 11 ? 8 : fitCount >= 9 ? 5 : fitCount >= 7 ? 2 : 0;
  if (fitPts > 0) {
    links.push({ dimension: 'fit', label: `${fitCount}/${placed} in position`, points: fitPts });
  }

  const raw = squadPts + nationPts + yearPts + contPts + eraPts + fitPts;
  const bonus = clamp(Math.round(raw / RAW_PER_BONUS), 0, MAX_BONUS);
  links.sort((a, b) => b.points - a.points);
  return { placed, raw: Math.round(raw), bonus, fitCount, links };
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
