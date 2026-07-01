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
 *  then a shootout if still level. (Generalises `playKnockout` to any two teams.) */
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
 * results yet. Nothing beyond the current round is simulated — rounds are played
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

/** Simulate every tie in the current round, returning the games with results.
 *  The caller reveals the user's game (index 0) via the clock, then records the
 *  whole round. */
export function playRound(b: BracketState): BracketGame[] {
  return b.rounds[b.current].map((g) => {
    const sim = simGame(b.teams[g.homeId], b.teams[g.awayId]);
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

/** Record a played round's results (from {@link playRound}) and advance: the user
 *  moves on and the next round's ties are created, or the run ends. */
export function recordRound(b: BracketState, played: BracketGame[]): BracketState {
  const cur = b.current;
  const rounds = b.rounds.map((r, i) => (i === cur ? played : r));
  const userWon = played[0].result?.winnerId === USER_ID;
  if (!userWon) return { ...b, rounds, outcome: 'out' };
  if (cur >= BRACKET_ROUNDS.length - 1) {
    return { ...b, rounds, outcome: 'champion', current: BRACKET_ROUNDS.length };
  }
  const winners = played.map((g) => g.result!.winnerId);
  return { ...b, rounds: [...rounds, pairGames(winners)], current: cur + 1 };
}
