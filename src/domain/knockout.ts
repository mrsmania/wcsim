import { SQUADS } from '../data/squads';
import type { Squad } from '../data/types';
import {
  REFERENCE_RATING,
  simulateExtraTime,
  simulateMatch,
  simulateShootout,
  type MatchEvent,
  type ShootoutResult,
} from './match';
import { squadGroupTeam, squadOverall, type GroupTeam } from './tournament';

/** Knockout rounds the user must win, in order, to be crowned champion. */
export const KO_ROUNDS = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'] as const;

/** Every way a tie can be settled, and the union DERIVED from it - not written twice.
 *  `domain/challenges.ts` used to restate the three members inside a predicate with a cast
 *  to make it compile, so adding a fourth would have left that predicate silently checking
 *  three (hygiene H151). The strings are persisted, so their spelling is fixed. */
export const KO_DECIDED = ['reg', 'aet', 'pens'] as const;
export type KoDecided = (typeof KO_DECIDED)[number];

/** How far a tournament run ended: eliminated in the group, knocked out in a
 *  given knockout round, or crowned champion. */
export type Finish = 'group' | 'r16' | 'qf' | 'sf' | 'final' | 'champion';

/** The Finish for losing in knockout round i (0 = Round of 16 ... 3 = the final). */
export const LOST_IN: readonly Finish[] = ['r16', 'qf', 'sf', 'final'];

/** A knockout tie resolved to a definite winner. */
export interface KoTieResult {
  homeGoals: number;
  awayGoals: number;
  decided: KoDecided;
  /** Goal events (regulation + extra time), for a live reveal. */
  events: MatchEvent[];
  pens?: ShootoutResult;
  homeWon: boolean;
}

/** Resolve one knockout tie to a definite winner: regulation, then extra time,
 *  then a shootout if still level. The single reg -> ET -> shootout resolver,
 *  shared by the Quick Play bracket and the Cup Run. */
export function resolveKoTie(home: GroupTeam, away: GroupTeam): KoTieResult {
  // `GroupTeam extends Side`, so a team is already what the sim takes (hygiene H67).
  const h = home;
  const a = away;

  const reg = simulateMatch(h, a);
  let homeGoals = reg.homeGoals;
  let awayGoals = reg.awayGoals;
  let events = reg.events;
  if (homeGoals !== awayGoals) {
    return { homeGoals, awayGoals, decided: 'reg', events, homeWon: homeGoals > awayGoals };
  }

  const et = simulateExtraTime(h, a);
  homeGoals += et.homeGoals;
  awayGoals += et.awayGoals;
  events = [...events, ...et.events];
  if (homeGoals !== awayGoals) {
    return { homeGoals, awayGoals, decided: 'aet', events, homeWon: homeGoals > awayGoals };
  }

  const pens = simulateShootout({ penTakers: home.penTakers }, { penTakers: away.penTakers });
  return { homeGoals, awayGoals, decided: 'pens', events, pens, homeWon: pens.homeWon };
}

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
 *  squads higher so better teams turn up more often deeper in the bracket. Drawn
 *  from `pool` (the squad-pool setting; defaults to the whole dataset). `slopeBonus`
 *  steepens the weighting toward stronger squads (Cup Run Ascension; 0 = base). */
export function drawOpponent(faced: Set<string>, pool: readonly Squad[] = SQUADS, slopeBonus = 0): GroupTeam {
  const candidates = pool.filter((s) => !faced.has(s.id));
  const src = candidates.length ? candidates : pool;
  const slope = DRAW_WEIGHT_SLOPE + slopeBonus;
  const weights = src.map((s) => Math.exp((overallOf(s.id) - REFERENCE_RATING) * slope));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < src.length; i++) {
    r -= weights[i];
    if (r <= 0) return squadGroupTeam(src[i]);
  }
  return squadGroupTeam(src[src.length - 1]);
}
