import { SQUADS } from '../data/squads';
import { REFERENCE_RATING } from './match';
import { squadGroupTeam, squadOverall, type GroupTeam } from './tournament';

/** Knockout rounds the user must win, in order, to be crowned champion. */
export const KO_ROUNDS = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'] as const;

/** How a tie was settled. */
export type KoDecided = 'reg' | 'aet' | 'pens';

/** How steeply the draw favours stronger squads (per rating point above the
 *  reference). Higher means top teams turn up more often deeper in the bracket. */
const DRAW_WEIGHT_SLOPE = 0.12;

/** `squadOverall` for the whole pool, computed once (it is deterministic per
 *  squad and `drawOpponent` runs up to 14 times per bracket). */
const OVERALL_BY_ID: Map<string, number> = new Map(
  SQUADS.map((s) => [s.id, squadOverall(s)]),
);

const overallOf = (id: string): number => OVERALL_BY_ID.get(id) ?? REFERENCE_RATING;

/** Draw the next opponent, avoiding any already faced and weighting stronger
 *  squads higher so better teams turn up more often deeper in the bracket. */
export function drawOpponent(faced: Set<string>): GroupTeam {
  const pool = SQUADS.filter((s) => !faced.has(s.id));
  const src = pool.length ? pool : SQUADS;
  const weights = src.map((s) => Math.exp((overallOf(s.id) - REFERENCE_RATING) * DRAW_WEIGHT_SLOPE));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < src.length; i++) {
    r -= weights[i];
    if (r <= 0) return squadGroupTeam(src[i]);
  }
  return squadGroupTeam(src[src.length - 1]);
}
