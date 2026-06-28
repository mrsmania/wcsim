import type { Player, Squad } from '../data/types';
import { SQUADS } from '../data/squads';
import { scorerPool, xiStrength, type MatchResult, type Strength } from './match';

export const GROUP_MATCHDAYS = 3;
export const USER_ID = 'user';

export interface GroupTeam {
  id: string;
  name: string;
  code: string;
  year?: number;
  isUser: boolean;
  strength: Strength;
  scorers: string[];
  /** Penalty takers, best first (used by the knockout shootout). */
  penTakers: { name: string; elo: number }[];
}

/** Ranked penalty takers (best elo first). */
function penTakersFrom(players: Player[]): { name: string; elo: number }[] {
  return [...players].sort((a, b) => b.elo - a.elo).map((p) => ({ name: p.name, elo: p.elo }));
}

export interface Fixture {
  matchday: number;
  homeId: string;
  awayId: string;
  result?: MatchResult;
}

/** A simulated result for one fixture, recorded into the group after a matchday. */
export interface MatchdayResult {
  homeId: string;
  awayId: string;
  result: MatchResult;
}

export interface GroupState {
  teams: GroupTeam[];
  fixtures: Fixture[];
  /** Next matchday to play (1..3); GROUP_MATCHDAYS+1 once finished. */
  matchday: number;
}

/** Build the user's match team. `chemistryBonus` (0 when the feature is off) is
 *  added to overall only, so a cohesive draft simulates a touch stronger. */
export function userGroupTeam(players: Player[], chemistryBonus = 0): GroupTeam {
  const strength = xiStrength(players);
  return {
    id: USER_ID,
    name: 'Your XI',
    code: 'YOU',
    isUser: true,
    strength: { ...strength, overall: strength.overall + chemistryBonus },
    scorers: scorerPool(players),
    penTakers: penTakersFrom(players),
  };
}

/** The best 11 of a squad by elo (used as its match XI). */
function bestEleven(squad: Squad): Player[] {
  return [...squad.players].sort((a, b) => b.elo - a.elo).slice(0, 11);
}

export function squadGroupTeam(squad: Squad): GroupTeam {
  const bestXI = bestEleven(squad);
  return {
    id: squad.id,
    name: squad.nation,
    code: squad.code,
    year: squad.year,
    isUser: false,
    strength: xiStrength(bestXI),
    scorers: scorerPool(bestXI),
    penTakers: penTakersFrom(bestXI),
  };
}

/** A squad's overall rating (avg elo of its best XI). Used to weight draws. */
export function squadOverall(squad: Squad): number {
  return xiStrength(bestEleven(squad)).overall;
}

/** Pick `count` distinct random squads as opponents. */
export function pickOpponents(count: number): Squad[] {
  const pool = [...SQUADS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Build a 4-team group (user + 3 opponents) with a round-robin schedule where
 *  the user plays once per matchday. */
export function createGroup(user: GroupTeam, opponents: Squad[]): GroupState {
  const teams = [user, ...opponents.map(squadGroupTeam)];
  const [u, a, b, c] = teams.map((t) => t.id);
  const fixtures: Fixture[] = [
    { matchday: 1, homeId: u, awayId: a },
    { matchday: 1, homeId: b, awayId: c },
    { matchday: 2, homeId: u, awayId: b },
    { matchday: 2, homeId: c, awayId: a },
    { matchday: 3, homeId: u, awayId: c },
    { matchday: 3, homeId: a, awayId: b },
  ];
  return { teams, fixtures, matchday: 1 };
}

export function teamById(group: GroupState, id: string): GroupTeam {
  return group.teams.find((t) => t.id === id)!;
}

export function fixturesForMatchday(group: GroupState, md: number): Fixture[] {
  return group.fixtures.filter((f) => f.matchday === md);
}

export interface Standing {
  team: GroupTeam;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export function standings(group: GroupState): Standing[] {
  const table = new Map<string, Standing>();
  for (const t of group.teams) {
    table.set(t.id, { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 });
  }
  for (const f of group.fixtures) {
    if (!f.result) continue;
    const h = table.get(f.homeId)!;
    const a = table.get(f.awayId)!;
    h.played++;
    a.played++;
    h.gf += f.result.homeGoals;
    h.ga += f.result.awayGoals;
    a.gf += f.result.awayGoals;
    a.ga += f.result.homeGoals;
    if (f.result.homeGoals > f.result.awayGoals) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (f.result.homeGoals < f.result.awayGoals) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  for (const s of table.values()) s.gd = s.gf - s.ga;
  return [...table.values()].sort(
    (x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name),
  );
}

export function isGroupFinished(group: GroupState): boolean {
  return group.matchday > GROUP_MATCHDAYS;
}

/** User finishes in the top 2 (qualification places). */
export function userAdvanced(group: GroupState): boolean {
  const idx = standings(group).findIndex((s) => s.team.isUser);
  return idx >= 0 && idx < 2;
}
