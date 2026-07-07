import type { Player } from '../data/types';
import { ELO_MAX, primaryPosition } from '../data/types';
import { FEATURES } from '../config';
import { computeChemistry } from './chemistry';
import {
  userGroupTeam,
  createGroup,
  simulateMatchday,
  recordMatchday,
  userAdvanced,
  standings,
  pickOpponents,
  GROUP_MATCHDAYS,
  USER_ID,
  type GroupState,
  type GroupTeam,
} from './tournament';
import type { MatchEvent, MatchResult, ShootoutResult } from './match';
import {
  drawOpponent,
  resolveKoTie,
  KO_ROUNDS,
  LOST_IN,
  type Finish,
  type KoDecided,
} from './knockout';
import { offerBoons, boonById, type Boon } from './boons';

// ---------------------------------------------------------------------------
// Cup Run - prototype run state machine. Pure over Math.random via
// the sim. The UI steps it: playGroupStage -> chooseBoon -> playKnockoutRound ...
// ---------------------------------------------------------------------------

export type RunPhase = 'group' | 'boon' | 'match' | 'ended';
/** How far the run ended: the shared Finish union, under the run's own name
 *  (career.ts and the checks harness key off RunOutcome). */
export type RunOutcome = Finish;

/** One completed round, for the progress ladder. `stage` is 'group' or a KO round
 *  index (0 = Round of 16). `won` = advanced (group) / won the tie (knockout). */
export interface RoundRecord {
  stage: 'group' | number;
  won: boolean;
  /** Knockout: the opponent + scoreline. */
  oppName?: string;
  oppCode?: string;
  oppYear?: number;
  userGoals?: number;
  oppGoals?: number;
  decided?: KoDecided;
  oppRating?: number;
  userRating?: number;
  /** Knockout: the settled tie's goal events + shootout, for a full review. */
  events?: MatchEvent[];
  pens?: ShootoutResult;
  /** The boost picked right after this round's games (id, resolve via boonById);
   *  unset on the final round and on a group-stage exit (no boost is chosen there). */
  boostId?: string;
  /** Group: finishing position + table size. */
  groupPos?: number;
  groupSize?: number;
  /** Group: the user's three matchday scorelines (user perspective). */
  groupResults?: { code: string; name: string; us: number; them: number }[];
}

export interface RunState {
  /** The current XI, with any boon rating deltas baked in. */
  xi: Player[];
  phase: RunPhase;
  /** Index into KO_ROUNDS for the next knockout tie (0 = Round of 16). */
  koRound: number;
  /** Squad ids already drawn as opponents (avoid repeats). */
  facedIds: string[];
  activeBoons: string[];
  /** Career perks active for this run (affects offers / start). */
  perks: string[];
  /** The pending 1-of-3 boon offer, when phase === 'boon'. */
  offer: Boon[] | null;
  /** The drawn opponent for the upcoming knockout tie (shown before it is played). */
  nextOpponent: GroupTeam | null;
  score: number;
  outcome: RunOutcome | null;
  /** Per-round results for the progress ladder (oldest first). */
  history: RoundRecord[];
  /** Ids of players brought into the XI by a roster boost, for tagging on the XI. */
  boostedIds: string[];
  /** Whether this run's collectibles have been merged into the sticker album. Guards
   *  a once-per-run apply that survives a reload (mirrors the main game's flag). */
  stickersApplied: boolean;
}

/** A finished knockout tie, normalised to the user's perspective (user = home).
 *  Carries the goal events + shootout so the UI can reveal it minute by minute. */
export interface KoMatch {
  userGoals: number;
  oppGoals: number;
  decided: KoDecided;
  events: MatchEvent[];
  pens?: ShootoutResult;
  userWon: boolean;
}

/** One of the user's group matches, normalised to the user-as-home perspective. */
export interface UserMatch {
  opp: GroupTeam;
  result: MatchResult;
}

/** The group stage, computed up front: the committed next state plus the user's
 *  three matches for live reveal (simulation is separate from playback). */
export interface PreparedGroup {
  next: RunState;
  userMatches: UserMatch[];
  /** The fully simulated group, for the final-standings overview after the reveal. */
  group: GroupState;
}

/** A prepared knockout tie: the committed next state plus the revealed match. */
export interface PreparedKnockout {
  next: RunState;
  match: KoMatch;
  opp: GroupTeam;
  roundName: string;
}

/** Cumulative score for reaching each stage. */
const STAGE_SCORE: Record<RunOutcome, number> = {
  group: 10,
  r16: 25,
  qf: 45,
  sf: 70,
  final: 95,
  champion: 140,
};
/** Team chemistry bonus for the current XI (0 when the feature is off). Recomputed
 *  live from the players so it stays correct after a roster boon changes the XI;
 *  every player is treated as in their natural role (a run tracks players, not slots). */
export function chemistryOf(xi: Player[]): number {
  if (!FEATURES.chemistry) return 0;
  return computeChemistry(xi.map((p) => ({ player: p, slotPosition: primaryPosition(p) }))).bonus;
}

/** Boon offer size, widened by the Extra Boon perk. */
const offerSize = (perks: string[]) => (perks.includes('extra-boon') ? 4 : 3);

export function beginRun(xi: Player[], perks: string[] = []): RunState {
  let players = xi;
  const activeBoons: string[] = [];
  const boostedIds: string[] = [];
  // Deep Squad perk: a flat +1 to the drafted XI at kickoff.
  if (perks.includes('deep-squad')) {
    players = players.map((p) => ({ ...p, elo: Math.min(ELO_MAX, p.elo + 1) }));
  }
  // Scout Network perk: begin with one random boon already applied.
  if (perks.includes('scout')) {
    const boon = offerBoons(1)[0];
    if (boon) {
      const before = players;
      players = boon.apply(players, { opponentSquadId: null });
      const inP = players.find((p) => !before.some((b) => b.id === p.id));
      if (inP) boostedIds.push(inP.id);
      activeBoons.push(boon.id);
    }
  }
  return {
    xi: players,
    phase: 'group',
    koRound: 0,
    facedIds: [],
    activeBoons,
    perks,
    offer: null,
    nextOpponent: null,
    score: 0,
    outcome: null,
    history: [],
    boostedIds,
    stickersApplied: false,
  };
}

/** Simulate the group stage up front, returning the committed next state plus the
 *  user's three matches (for live reveal). Qualify -> draw the R16 opponent + offer
 *  a boon; otherwise the run ends. */
export function prepareGroupStage(run: RunState, atkDefDelta = 0): PreparedGroup | null {
  if (run.phase !== 'group') return null;
  const user = userGroupTeam(run.xi, chemistryOf(run.xi), atkDefDelta);
  const opponents = pickOpponents(3);
  let group = createGroup(user, opponents);
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    group = recordMatchday(group, simulateMatchday(group, md));
  }
  // The user's three fixtures. createGroup schedules the user as the home side of
  // every group fixture (the match card renders the user on the left), so the
  // results are already in the user's perspective; the throw guards that invariant.
  const byId = new Map(group.teams.map((t) => [t.id, t]));
  const userMatches: UserMatch[] = [];
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    const fx = group.fixtures.find(
      (f) => f.matchday === md && (f.homeId === USER_ID || f.awayId === USER_ID),
    );
    if (!fx?.result) continue;
    if (fx.homeId !== USER_ID) {
      throw new Error('prepareGroupStage: user fixture must be home (createGroup invariant)');
    }
    userMatches.push({ opp: byId.get(fx.awayId)!, result: fx.result });
  }

  const table = standings(group);
  const pos = table.findIndex((s) => s.team.isUser) + 1;
  const advanced = userAdvanced(group);
  const groupRecord: RoundRecord = {
    stage: 'group',
    won: advanced,
    groupPos: pos,
    groupSize: table.length,
    groupResults: userMatches.map((m) => ({
      code: m.opp.code,
      name: m.opp.name,
      us: m.result.homeGoals,
      them: m.result.awayGoals,
    })),
  };
  if (!advanced) {
    return {
      next: {
        ...run,
        phase: 'ended',
        outcome: 'group',
        score: STAGE_SCORE.group,
        history: [...run.history, groupRecord],
      },
      userMatches,
      group,
    };
  }
  // Exclude the group opponents from the knockout draw (no immediate rematch).
  const faced = [...run.facedIds, ...opponents.map((s) => s.id)];
  const opp = drawOpponent(new Set(faced));
  return {
    next: {
      ...run,
      phase: 'boon',
      offer: offerBoons(offerSize(run.perks)),
      nextOpponent: opp,
      facedIds: [...faced, opp.id],
      score: STAGE_SCORE.group,
      history: [...run.history, groupRecord],
    },
    userMatches,
    group,
  };
}

/** Commit the group stage without revealing it (used by the checks harness). */
export const playGroupStage = (run: RunState): RunState => prepareGroupStage(run)?.next ?? run;

/** The result of applying a boon: the committed next state plus the roster swap it
 *  made, if any (for the "X in for Y" toast). A rating boon leaves both unset. */
export interface BoonChoice {
  next: RunState;
  swappedIn?: Player;
  swappedOut?: Player;
}

/** Apply the chosen boon and move to the pending knockout tie. Returns the next state
 *  plus any roster swap the boon made (so the UI can describe it without re-diffing). */
export function chooseBoon(run: RunState, boonId: string): BoonChoice {
  if (run.phase !== 'boon') return { next: run };
  const boon = boonById(boonId);
  if (!boon) return { next: run };
  const before = run.xi;
  const xi = boon.apply(before, { opponentSquadId: run.nextOpponent?.id ?? null });
  // If the boon swapped the roster, tag the incoming player (an amber "Boost" mark).
  const swappedIn = xi.find((p) => !before.some((b) => b.id === p.id));
  const swappedOut = before.find((p) => !xi.some((b) => b.id === p.id));
  // The boost is chosen right after a round's games, so record it on that round (the
  // most recent history entry) - e.g. the after-group boost lands on the group step.
  const last = run.history.length - 1;
  const history =
    last >= 0 ? run.history.map((r, i) => (i === last ? { ...r, boostId: boon.id } : r)) : run.history;
  return {
    next: {
      ...run,
      xi,
      activeBoons: [...run.activeBoons, boon.id],
      boostedIds: swappedIn ? [...run.boostedIds, swappedIn.id] : run.boostedIds,
      offer: null,
      phase: 'match',
      history,
    },
    swappedIn,
    swappedOut,
  };
}

/** A single knockout tie via the shared resolver (reg -> ET -> shootout), with
 *  the goal events + shootout kept so it can be revealed live. `user` is the
 *  home side, so the resolver's home fields map straight to user/opp. */
function simulateKoTie(user: GroupTeam, opp: GroupTeam): KoMatch {
  const tie = resolveKoTie(user, opp);
  return {
    userGoals: tie.homeGoals,
    oppGoals: tie.awayGoals,
    decided: tie.decided,
    events: tie.events,
    pens: tie.pens,
    userWon: tie.homeWon,
  };
}

/** Prepare the pending knockout tie: simulate it up front (keeping the events for a
 *  live reveal) and compute the committed next state (win -> next round + boon, or
 *  the trophy; loss -> ended). */
export function prepareKnockoutRound(run: RunState, atkDefDelta = 0): PreparedKnockout | null {
  if (run.phase !== 'match' || !run.nextOpponent) return null;
  const round = run.koRound;
  const roundName = KO_ROUNDS[round];
  const opp = run.nextOpponent;
  const userTeam = userGroupTeam(run.xi, chemistryOf(run.xi), atkDefDelta);
  const match = simulateKoTie(userTeam, opp);
  const record: RoundRecord = {
    stage: round,
    won: match.userWon,
    oppName: opp.name,
    oppCode: opp.code,
    oppYear: opp.year,
    oppRating: opp.strength.overall,
    userRating: userTeam.strength.overall,
    userGoals: match.userGoals,
    oppGoals: match.oppGoals,
    decided: match.decided,
    events: match.events,
    pens: match.pens,
    // boostId is left unset here: the boost is picked *after* this round's game, so
    // chooseBoon stamps it onto this record when the next boost is chosen.
  };
  const history = [...run.history, record];

  let next: RunState;
  if (!match.userWon) {
    const outcome = LOST_IN[round];
    next = {
      ...run,
      phase: 'ended',
      outcome,
      score: STAGE_SCORE[outcome],
      nextOpponent: null,
      history,
    };
  } else if (round >= KO_ROUNDS.length - 1) {
    next = {
      ...run,
      phase: 'ended',
      outcome: 'champion',
      score: STAGE_SCORE.champion,
      nextOpponent: null,
      history,
    };
  } else {
    const nextRound = round + 1;
    const nextOpp = drawOpponent(new Set(run.facedIds));
    next = {
      ...run,
      phase: 'boon',
      koRound: nextRound,
      offer: offerBoons(offerSize(run.perks)),
      nextOpponent: nextOpp,
      facedIds: [...run.facedIds, nextOpp.id],
      score: STAGE_SCORE[LOST_IN[round]],
      history,
    };
  }
  return { next, match, opp, roundName };
}

/** Commit the pending knockout tie without revealing it (used by the checks harness). */
export const playKnockoutRound = (run: RunState): RunState =>
  prepareKnockoutRound(run)?.next ?? run;
