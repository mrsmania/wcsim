import type { Player, Squad } from '../data/types';
import { SQUADS } from '../data/squads';
import { scorerPool, simulateMatch, xiStrength, type MatchResult, type Strength } from './match';

export const GROUP_MATCHDAYS = 3;
export const USER_ID = 'user';

/** How many teams advance from the group (the top `QUALIFY_COUNT` of the table).
 *  Defined once so the "top 2 advance" rule lives in a single place. */
export const QUALIFY_COUNT = 2;

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
  const team = group.teams.find((t) => t.id === id);
  if (!team) throw new Error(`teamById: no team with id "${id}" in this group`);
  return team;
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

/** The teams that advance from the group: the top `QUALIFY_COUNT` of the table.
 *  The single source of the "top 2 advance" rule. */
export function qualifiers(group: GroupState): GroupTeam[] {
  return standings(group).slice(0, QUALIFY_COUNT).map((s) => s.team);
}

/** User finishes in a qualification place. */
export function userAdvanced(group: GroupState): boolean {
  return qualifiers(group).some((t) => t.isUser);
}

/** Seed the knockout bracket from a finished group: the user, the team that
 *  qualified alongside them, and every group team to exclude from the draw (so
 *  there are no immediate rematches). Throws with a clear message if the user is
 *  not among the qualifiers (the caller should only enter the knockouts once the
 *  user has advanced). */
export function bracketSeedFromGroup(group: GroupState): {
  user: GroupTeam;
  coQualifier: GroupTeam;
  excludeIds: string[];
} {
  const top = qualifiers(group);
  const user = top.find((t) => t.isUser);
  const coQualifier = top.find((t) => !t.isUser);
  if (!user || !coQualifier) {
    throw new Error('bracketSeedFromGroup: user did not qualify (no user + co-qualifier in the top places)');
  }
  const excludeIds = group.teams.filter((t) => !t.isUser).map((t) => t.id);
  return { user, coQualifier, excludeIds };
}

/** Merge a played matchday's results into the group and advance to the next
 *  matchday. The reducer delegates here (mirrors `recordRound` for the bracket). */
export function recordMatchday(group: GroupState, results: MatchdayResult[]): GroupState {
  const md = group.matchday;
  const fixtures = group.fixtures.map((f) => {
    if (f.matchday !== md) return f;
    const r = results.find((x) => x.homeId === f.homeId && x.awayId === f.awayId);
    return r ? { ...f, result: r.result } : f;
  });
  return { ...group, fixtures, matchday: md + 1 };
}

/** Simulate every fixture of matchday `md`, returning the results to record.
 *  The domain entry point for a group matchday: the screen animates these
 *  results via the clock rather than simulating them itself. */
export function simulateMatchday(group: GroupState, md: number): MatchdayResult[] {
  return fixturesForMatchday(group, md).map((f) => {
    const home = teamById(group, f.homeId);
    const away = teamById(group, f.awayId);
    return {
      homeId: f.homeId,
      awayId: f.awayId,
      result: simulateMatch(
        { strength: home.strength, scorers: home.scorers },
        { strength: away.strength, scorers: away.scorers },
      ),
    };
  });
}
