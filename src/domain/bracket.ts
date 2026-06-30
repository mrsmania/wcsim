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

/** Round labels, longest to the final. Reused from the knockout module so the
 *  bracket and the rest of the app agree on naming. */
export const BRACKET_ROUNDS = KO_ROUNDS;
export const FIELD_SIZE = 16;

/** One game in the bracket. `events` are present for every game (cheap) but only
 *  ever displayed for the user's own games (the live "Your run" feed). */
export interface BracketGame {
  round: number; // 0 = Round of 16 ... 3 = Final
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  decided: KoDecided;
  pens?: { home: number; away: number; kicks: PenKick[] };
  events: MatchEvent[];
  winnerId: string;
  /** True when the user's XI is one of the two participants. */
  hasUser: boolean;
}

export interface BracketState {
  /** id -> team, for all 16 entrants. */
  teams: Record<string, GroupTeam>;
  /** rounds[0..3], with 8 / 4 / 2 / 1 games. The user's path is always index 0. */
  rounds: BracketGame[][];
  /** How many of the user's games have been played/revealed (0..4). */
  played: number;
  outcome: 'alive' | 'champion' | 'out';
}

const sideOf = (t: GroupTeam): Side => ({ strength: t.strength, scorers: t.scorers });

/** Simulate one knockout game to a definite winner: regulation, then extra time,
 *  then a shootout if still level. Generalises `playKnockout` to any two teams so
 *  the whole bracket (not just the user's matches) can be resolved the same way. */
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

/**
 * Build a full 16-team single-elimination bracket, pre-simulated end to end.
 *
 * The user is seeded at index 0, so their path is always game 0 of every round
 * they survive; the other 15 teams are drawn elo-weighted (via `drawOpponent`),
 * excluding the group opponents so there are no immediate rematches. Every game
 * is resolved up front: the user's own games carry full goal `events` (revealed
 * later through the live clock), the rest just need a scoreline + winner. If the
 * user loses, their conqueror simply continues in game 0, so the tree completes.
 *
 * `played`/`outcome` start at the beginning of the run; the reducer advances them
 * as the user reveals each match.
 */
export function buildBracket(user: GroupTeam, excludeIds: string[]): BracketState {
  const faced = new Set<string>([USER_ID, ...excludeIds]);
  const teams: Record<string, GroupTeam> = { [USER_ID]: user };
  const seeds: string[] = [USER_ID];
  for (let i = 0; i < FIELD_SIZE - 1; i++) {
    const t = drawOpponent(faced);
    faced.add(t.id);
    teams[t.id] = t;
    seeds.push(t.id);
  }

  const rounds: BracketGame[][] = [];
  let participants = seeds; // 16 -> 8 -> 4 -> 2
  for (let round = 0; round < BRACKET_ROUNDS.length; round++) {
    const games: BracketGame[] = [];
    const winners: string[] = [];
    for (let g = 0; g < participants.length / 2; g++) {
      const homeId = participants[2 * g];
      const awayId = participants[2 * g + 1];
      const sim = simGame(teams[homeId], teams[awayId]);
      const winnerId = sim.homeWon ? homeId : awayId;
      games.push({
        round,
        homeId,
        awayId,
        homeGoals: sim.result.homeGoals,
        awayGoals: sim.result.awayGoals,
        decided: sim.decided,
        pens: sim.pens,
        events: sim.result.events,
        winnerId,
        hasUser: homeId === USER_ID || awayId === USER_ID,
      });
      winners.push(winnerId);
    }
    rounds.push(games);
    participants = winners;
  }

  return { teams, rounds, played: 0, outcome: 'alive' };
}

/** The user's current (next-to-play) game, or null once the run is over. */
export function currentGame(b: BracketState): BracketGame | null {
  if (b.outcome !== 'alive' || b.played >= BRACKET_ROUNDS.length) return null;
  const g = b.rounds[b.played]?.[0];
  return g && g.hasUser ? g : null;
}

/** Advance the bracket after the user's current game has been revealed: win →
 *  next round (or champion on the final), loss → out. Pure pointer math, since
 *  the games are already simulated. */
export function advanceBracket(b: BracketState): BracketState {
  const g = b.rounds[b.played]?.[0];
  if (!g || !g.hasUser || b.outcome !== 'alive') return b;
  if (g.winnerId !== USER_ID) return { ...b, outcome: 'out' };
  if (b.played >= BRACKET_ROUNDS.length - 1) return { ...b, outcome: 'champion', played: BRACKET_ROUNDS.length };
  return { ...b, played: b.played + 1 };
}
