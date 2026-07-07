import {
  simulateExtraTime,
  simulateMatch,
  simulateShootout,
  type MatchEvent,
  type MatchResult,
  type PenKick,
  type Side,
} from './match';
import { USER_ID, type GroupTeam } from './tournament';
import { drawOpponent, KO_ROUNDS, type KoDecided } from './knockout';

/** Round labels, longest to the final. Reused from the knockout module. */
export const BRACKET_ROUNDS = KO_ROUNDS;
export const FIELD_SIZE = 16;

export interface BracketResult {
  homeGoals: number;
  awayGoals: number;
  decided: KoDecided;
  pens?: { home: number; away: number; kicks: PenKick[] };
  events: MatchEvent[];
  winnerId: string;
}

/** One game in the bracket. Participants are known as soon as the feeding round
 *  resolves; `result` is filled only once that round has actually been played. */
export interface BracketGame {
  homeId: string;
  awayId: string;
  /** True when the user's XI is one of the two participants. */
  hasUser: boolean;
  result?: BracketResult;
}

export interface BracketState {
  /** id -> team, for every entrant known so far. */
  teams: Record<string, GroupTeam>;
  /** Rounds created so far. rounds[0] (the 8 Round-of-16 ties) exists from the
   *  start; each later round is appended only once its feeder round is played. */
  rounds: BracketGame[][];
  /** The round the user plays next (0..3) while alive; the round they lost when
   *  'out'; BRACKET_ROUNDS.length when 'champion'. */
  current: number;
  outcome: 'alive' | 'champion' | 'out';
}

const sideOf = (t: GroupTeam): Side => ({ strength: t.strength, scorers: t.scorers });

/** Simulate one knockout game to a definite winner: regulation, then extra time,
 *  then a shootout if still level. The single reg -> ET -> shootout resolver. */
function simGame(home: GroupTeam, away: GroupTeam): {
  result: MatchResult;
  decided: KoDecided;
  pens?: { home: number; away: number; kicks: PenKick[] };
  homeWon: boolean;
} {
  const h = sideOf(home);
  const a = sideOf(away);

  const reg = simulateMatch(h, a);
  if (reg.homeGoals !== reg.awayGoals) {
    return { result: reg, decided: 'reg', homeWon: reg.homeGoals > reg.awayGoals };
  }

  const et = simulateExtraTime(h, a);
  const combined: MatchResult = {
    homeGoals: reg.homeGoals + et.homeGoals,
    awayGoals: reg.awayGoals + et.awayGoals,
    events: [...reg.events, ...et.events],
  };
  if (combined.homeGoals !== combined.awayGoals) {
    return { result: combined, decided: 'aet', homeWon: combined.homeGoals > combined.awayGoals };
  }

  const sh = simulateShootout({ penTakers: home.penTakers }, { penTakers: away.penTakers });
  return {
    result: combined,
    decided: 'pens',
    pens: { home: sh.home, away: sh.away, kicks: sh.kicks },
    homeWon: sh.homeWon,
  };
}

/** Pair a flat list of team ids into games (adjacent pairs). */
function pairGames(ids: string[]): BracketGame[] {
  const games: BracketGame[] = [];
  for (let i = 0; i < ids.length / 2; i++) {
    const homeId = ids[2 * i];
    const awayId = ids[2 * i + 1];
    games.push({ homeId, awayId, hasUser: homeId === USER_ID || awayId === USER_ID });
  }
  return games;
}

/**
 * Build the opening bracket: the 16-team field and the Round of 16 ties, with no
 * results yet. Nothing beyond the current round is simulated - rounds are played
 * (and their winners revealed) one at a time, exactly like the group stage.
 *
 * The user is seeded at index 0 and the team that qualified alongside them at
 * index 8 (the opposite half), so they can only meet again in the final. The
 * remaining 14 spots are drawn elo-weighted, excluding the whole group (so no
 * immediate rematches).
 */
export function buildBracket(
  user: GroupTeam,
  coQualifier: GroupTeam,
  excludeIds: string[],
): BracketState {
  const faced = new Set<string>([USER_ID, coQualifier.id, ...excludeIds]);
  const teams: Record<string, GroupTeam> = { [USER_ID]: user, [coQualifier.id]: coQualifier };

  const seeds: string[] = new Array(FIELD_SIZE);
  seeds[0] = USER_ID;
  seeds[FIELD_SIZE / 2] = coQualifier.id; // index 8: the other half of the draw
  for (let i = 0; i < FIELD_SIZE; i++) {
    if (seeds[i]) continue;
    const t = drawOpponent(faced);
    faced.add(t.id);
    teams[t.id] = t;
    seeds[i] = t.id;
  }

  return { teams, rounds: [pairGames(seeds)], current: 0, outcome: 'alive' };
}

/** The user's current (next-to-play) game, or null once the run is over. */
export function currentGame(b: BracketState): BracketGame | null {
  if (b.outcome !== 'alive' || b.current >= b.rounds.length) return null;
  const g = b.rounds[b.current][0];
  return g?.hasUser ? g : null;
}

/** Simulate a set of ties, returning the games with their results filled in.
 *  Stronger teams (higher rating) win more often, since `simGame` scores from
 *  each side's overall rating. */
function simulateGames(teams: Record<string, GroupTeam>, games: BracketGame[]): BracketGame[] {
  return games.map((g) => {
    const sim = simGame(teams[g.homeId], teams[g.awayId]);
    return {
      ...g,
      result: {
        homeGoals: sim.result.homeGoals,
        awayGoals: sim.result.awayGoals,
        decided: sim.decided,
        pens: sim.pens,
        events: sim.result.events,
        winnerId: sim.homeWon ? g.homeId : g.awayId,
      },
    };
  });
}

/** Simulate every tie in the current round, returning the games with results.
 *  The caller reveals the user's game (index 0) via the clock, then records the
 *  whole round. */
export function playRound(b: BracketState): BracketGame[] {
  return simulateGames(b.teams, b.rounds[b.current]);
}

/** Play out the rest of the bracket from a round's winners to a champion. */
function completeFrom(
  teams: Record<string, GroupTeam>,
  winners: string[],
  fromRound: number,
): BracketGame[][] {
  const rest: BracketGame[][] = [];
  let advancing = winners;
  for (let round = fromRound; round < BRACKET_ROUNDS.length; round++) {
    const games = simulateGames(teams, pairGames(advancing));
    rest.push(games);
    advancing = games.map((g) => g.result!.winnerId);
  }
  return rest;
}

/** Record a played round's results (from {@link playRound}) and advance: the user
 *  moves on and the next round's ties are created, or, if the user is knocked
 *  out, the remaining rounds are simulated so a champion is still crowned. */
export function recordRound(b: BracketState, played: BracketGame[]): BracketState {
  const cur = b.current;
  const rounds = b.rounds.map((r, i) => (i === cur ? played : r));
  const winners = played.map((g) => g.result!.winnerId);
  const userWon = played[0].result?.winnerId === USER_ID;

  if (userWon) {
    if (cur >= BRACKET_ROUNDS.length - 1) {
      return { ...b, rounds, outcome: 'champion', current: BRACKET_ROUNDS.length };
    }
    return { ...b, rounds: [...rounds, pairGames(winners)], current: cur + 1 };
  }

  // Knocked out: finish the tournament for the remaining teams.
  const rest = completeFrom(b.teams, winners, cur + 1);
  return { ...b, rounds: [...rounds, ...rest], current: cur, outcome: 'out' };
}

/** The eventual winner of the whole bracket, once the final has been played
 *  (whether the user lifted it or not); null while the run is still going. */
export function bracketChampionId(b: BracketState): string | null {
  const finalGame = b.rounds[BRACKET_ROUNDS.length - 1]?.[0];
  return finalGame?.result?.winnerId ?? null;
}

// ---------------------------------------------------------------------------
// Flat accessors. These keep screen JSX (WP5) from reaching into the bracket
// shape with `?.[0]`/`!` chains; each returns a plain, already-resolved value.
// ---------------------------------------------------------------------------

/** The non-user team in a game, or undefined if the game has no user side (it
 *  always does on the user's own path, so callers there can treat it as set). */
export function opponentOf(b: BracketState, game: BracketGame): GroupTeam | undefined {
  const oppId = game.homeId === USER_ID ? game.awayId : game.homeId;
  return b.teams[oppId];
}

/** The user's game in a given round (index 0 of that round), or undefined if the
 *  round has not been reached yet. */
export function userGameInRound(b: BracketState, round: number): BracketGame | undefined {
  return b.rounds[round]?.[0];
}

/** The crowned champion once the final has been played, with the final score
 *  oriented winner-first; null while the run is still going. The champion is the
 *  user when they lifted the cup, otherwise whichever team went on to win it. */
export function bracketChampion(
  b: BracketState,
): { team: GroupTeam; homeGoals: number; awayGoals: number } | null {
  const finalGame = b.rounds[BRACKET_ROUNDS.length - 1]?.[0];
  const r = finalGame?.result;
  if (!finalGame || !r) return null;
  const teamId = b.outcome === 'champion' ? USER_ID : r.winnerId;
  const team = b.teams[teamId];
  if (!team) return null;
  const winnerIsHome = r.winnerId === finalGame.homeId;
  return {
    team,
    homeGoals: winnerIsHome ? r.homeGoals : r.awayGoals,
    awayGoals: winnerIsHome ? r.awayGoals : r.homeGoals,
  };
}
