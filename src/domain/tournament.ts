import type { Player, Squad } from '../data/types';
import { SQUADS } from '../data/squads';
import {
  scorerPool,
  simulateMatch,
  xiStrength,
  type MatchResult,
  type Side,
  type Strength,
} from './match';
import { shuffled } from './random';

export const GROUP_MATCHDAYS = 3;
export const USER_ID = 'user';

/** How many teams advance from the group (the top `QUALIFY_COUNT` of the table).
 *  Defined once so the "top 2 advance" rule lives in a single place. */
export const QUALIFY_COUNT = 2;

/** Opponents drawn into the user's group. Their count and GROUP_MATCHDAYS are the same
 *  fact about a four-team group; both call sites wrote the 3 out by hand. */
export const GROUP_OPPONENTS = 3;

/** Points for a win, and for a draw. Named beside the other group rules rather than
 *  appearing bare four times inside `standings`. */
const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/** Players in an XI. */
export const XI_SIZE = 11;

/** A team in the group, which IS a `Side` the match sim can take plus the identity the
 *  screens need. Declared as an extension rather than repeating `strength` and `scorers`:
 *  it already satisfied `Side` structurally, so the relationship existed and nothing said
 *  so - which is why one caller projected it through a helper and another open-coded the
 *  same projection inline. Both are gone; a GroupTeam can be passed straight to
 *  `simulateMatch` (hygiene H67). */
export interface GroupTeam extends Side {
  id: string;
  name: string;
  code: string;
  year?: number;
  isUser: boolean;
  /** Penalty takers, best first (used by the knockout shootout). */
  penTakers: { name: string; elo: number }[];
}

/** Ranked penalty takers (best elo first).
 *
 *  `bonus` lifts the first `top` of them and NOTHING else - it never reaches `strength`,
 *  so it cannot move a scoreline, only the shootout that follows one. That separation is
 *  the whole point of the Ice Veins boost: a lever the sim reads which the attack and
 *  defence averages do not. */
function penTakersFrom(
  players: Player[],
  bonus = 0,
  top = 0,
): { name: string; elo: number }[] {
  return [...players]
    .sort((a, b) => b.elo - a.elo)
    .map((p, i) => ({ name: p.name, elo: i < top ? p.elo + bonus : p.elo }));
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

/** Build the user's match team. `chemistryBonus` (0 when the feature is off) lifts
 *  attack, defense, and overall equally, so a cohesive draft both scores a little
 *  more and concedes a little less. `atkDefDelta` is the difficulty handicap (see
 *  domain/difficulty.ts): it shifts attack/defense only - the match sim drives goals
 *  from those, so it moves the user's win probability - while overall (the displayed
 *  rating) is left untouched. Both must reach attack/defense; overall carries the
 *  chemistry bonus for the ratings strip. */
export function userGroupTeam(
  players: Player[],
  chemistryBonus = 0,
  atkDefDelta = 0,
  /** Shootout-only bonus and how many takers it reaches (Ice Veins). Deliberately a
   *  separate argument from the two above: those reach `strength` and so the scoreline,
   *  and this must not. */
  penBonus = 0,
  penBonusTop = 0,
): GroupTeam {
  const base = xiStrength(players);
  const strength: Strength = {
    attack: base.attack + chemistryBonus + atkDefDelta,
    defense: base.defense + chemistryBonus + atkDefDelta,
    overall: base.overall + chemistryBonus,
  };
  return {
    id: USER_ID,
    name: 'Your XI',
    code: 'YOU',
    isUser: true,
    strength,
    scorers: scorerPool(players),
    penTakers: penTakersFrom(players, penBonus, penBonusTop),
  };
}

/** The best 11 of a set of players by elo (used as a squad's match XI). */
export function bestEleven(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.elo - a.elo).slice(0, XI_SIZE);
}

export function squadGroupTeam(squad: Squad): GroupTeam {
  const bestXI = bestEleven(squad.players);
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
  return xiStrength(bestEleven(squad.players)).overall;
}

/** Pick `count` distinct random squads as opponents, from `pool` (the squad-pool
 *  setting; defaults to the whole dataset). */
export function pickOpponents(count: number, pool: Squad[] = SQUADS): Squad[] {
  return shuffled(pool).slice(0, count);
}

/** Build a 4-team group (user + 3 opponents) with a round-robin schedule where
 *  the user plays once per matchday, always as the home side. Consumers rely on
 *  that user-is-home invariant (run.ts's prepareGroupStage reads the user's
 *  results without normalising sides). */
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
      h.points += WIN_POINTS;
      a.lost++;
    } else if (f.result.homeGoals < f.result.awayGoals) {
      a.won++;
      a.points += WIN_POINTS;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += DRAW_POINTS;
      a.points += DRAW_POINTS;
    }
  }
  for (const s of table.values()) s.gd = s.gf - s.ga;
  return [...table.values()].sort(
    (x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name),
  );
}

/** The teams that advance from the group: the top `QUALIFY_COUNT` of the table.
 *  The single source of the "top 2 advance" rule. */
function qualifiers(group: GroupState): GroupTeam[] {
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

/**
 * The group as it stood after matchday `md`: every later result blanked, and the
 * "next matchday to play" wound back to match.
 *
 * The World Cup screen never needs this - it records one matchday at a time, so its
 * group IS the group as of now. A Cup Run does: `prepareGroupStage` plays all three
 * matchdays up front (it has to, because the run's XI, its chemistry and its tally are
 * settled in one pass), so revealing the table matchday by matchday means projecting
 * backwards rather than simulating forwards. Pure, and `standings` does the rest.
 */
export function groupAsOf(group: GroupState, md: number): GroupState {
  return {
    ...group,
    fixtures: group.fixtures.map((f) => (f.matchday <= md ? f : { ...f, result: undefined })),
    matchday: Math.min(md + 1, GROUP_MATCHDAYS + 1),
  };
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

/** A group split into the user's team and the three opponents, which is how the draw
 *  reveal and anything else showing "you versus these" wants to read it. Null when the
 *  group has no user or no opponents, which a well-formed group never does - the null is
 *  there so a caller cannot end up rendering a draw with a missing side.
 *
 *  Derived inside `CupRunScreen` before (hygiene H147). `isUser` is the discriminator, and
 *  `USER_ID` is deliberately not used here: the flag is what every other consumer tests. */
export function splitGroup(group: GroupState): { user: GroupTeam; opponents: GroupTeam[] } | null {
  const user = group.teams.find((t) => t.isUser);
  const opponents = group.teams.filter((t) => !t.isUser);
  return user && opponents.length ? { user, opponents } : null;
}

/** Play a freshly created group out in full: all three matchdays, in one pass.
 *
 *  One pass rather than matchday by matchday because the XI, its chemistry and the run's
 *  tally are settled together - which is why the live table is PROJECTED backwards with
 *  `groupAsOf` rather than simulated forwards. Written out identically in `domain/run.ts`
 *  and `domain/odds.ts` before (hygiene H56). */
export function playWholeGroup(group: GroupState): GroupState {
  let g = group;
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    g = recordMatchday(g, simulateMatchday(g, md));
  }
  return g;
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
        home,
        away,
      ),
    };
  });
}
