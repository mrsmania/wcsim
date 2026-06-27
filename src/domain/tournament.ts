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

export function userGroupTeam(players: Player[]): GroupTeam {
  return {
    id: USER_ID,
    name: 'Your XI',
    code: 'YOU',
    isUser: true,
    strength: xiStrength(players),
    scorers: scorerPool(players),
  };
}

export function squadGroupTeam(squad: Squad): GroupTeam {
  const bestXI = [...squad.players].sort((a, b) => b.elo - a.elo).slice(0, 11);
  return {
    id: squad.id,
    name: squad.nation,
    code: squad.code,
    year: squad.year,
    isUser: false,
    strength: xiStrength(bestXI),
    scorers: scorerPool(bestXI),
  };
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
