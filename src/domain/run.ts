import type { Player, Position, Squad } from '../data/types';
import { ELO_MAX, primaryPosition } from '../data/types';
import type { FormationName, Style } from './formations';
import { SQUADS } from '../data/squads';
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
import { offerBoons, availableBoons, boonById, type Boon } from './boons';
import { ascensionAt } from './ascension';

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

/** The shape the XI kicked off in. Recorded rather than derived: the run receives a
 *  bare `Player[]`, `placedPlayers` promotes each slot's role to `positions[0]` (so the
 *  natural position cannot be recovered from the XI afterwards), and a roster boost
 *  changes the XI later anyway. Natural positions come from the DATASET player behind
 *  the id, never from the run's copy. */
export interface RunShape {
  formation: FormationName;
  style: Style;
  /** One entry per slot, in formation order. */
  slots: { slotId: string; role: Position; playerId: string }[];
}

/** How the XI was assembled, recorded at kickoff for the same reason: the album grows,
 *  which moves the owned-sticker discount and therefore what the XI "cost". Everything
 *  past `method` is per-method, so a rolled XI carries no prices and a bought one no
 *  re-roll count. */
export interface RunBuild {
  method: 'roll' | 'budget';
  /** Budget builds: the budget in force, what was spent against it, and the dearest
   *  single player - all at the discounted prices actually charged. */
  budget?: number;
  spent?: number;
  dearest?: number;
  /** Budget builds: how many of the XI were already in the album, and so discounted. */
  discounted?: number;
  /** Roll builds: squad re-rolls used (starting allowance minus what was left). */
  rerollsUsed?: number;
  /** Collectible swaps used (both methods start with INITIAL_SWAPS). */
  swapsUsed?: number;
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
  /** Career perks active for this run, as perk id -> owned tier (affects offers / start). */
  perkLevels: Record<string, number>;
  /** Career-unlocked boon ids, added to the offer pool alongside the starters. */
  unlockedBoons: string[];
  /** Ascension tier this run is played at (0 = Base). Set at beginRun; drives the
   *  user handicap, the knockout draw strength, and the end-of-run reward multiplier. */
  ascension: number;
  /** The pending 1-of-3 boon offer, when phase === 'boon'. */
  offer: Boon[] | null;
  /** Boost-offer re-rolls left this run (Physio Table perk; absent on older saves). */
  rerollsLeft?: number;
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
  // --- Recorded at kickoff, for the challenge catalogue (docs/challenges-spec.html).
  // All three are OPTIONAL: a run persisted before they existed resumes and finishes
  // normally, it simply cannot complete the entries that read them (a missing field
  // reads as "not satisfied", never as a throw).
  /** The formation, style and slot assignment the XI kicked off in (slice B). */
  shape?: RunShape;
  /** How the XI was built, and what it cost (slice C). */
  build?: RunBuild;
  /** The chemistry bonus at kickoff (slice D). Kept rather than recomputed: boosts
   *  change ratings and the roster, and chemistry counts players in their primary
   *  position, so asking again at run end answers a different question. */
  chemistry?: number;
  /** Appearances and goals per player, accumulated match by match (see `RunTally`).
   *  Optional for the same reason as the three above: a run persisted before it existed
   *  finishes normally and simply contributes nothing to the career's player records. */
  tally?: RunTally;
}

/**
 * Per-run appearance and goal tallies, keyed on PLAYER ID.
 *
 * Accumulated as each match is played rather than derived when the run ends, for two
 * reasons that are easy to get wrong:
 *
 *  1. **The XI changes mid-run.** A roster boost swaps players in, so someone who
 *     scored in the group may not be in `xi` by the time the run is banked.
 *  2. **A `MatchEvent` carries a scorer NAME, not an id** (`scorerPool` is built from
 *     `player.name`). The only place that name can be resolved back to a player id is
 *     against the XI that was actually on the pitch for that match.
 *
 * Shootout penalties are excluded by construction, not by a filter: they live in
 * `KoMatch.pens`, never in `events`, so nothing here can see them. `npm run checks`
 * asserts that, because it is the kind of thing a later refactor could quietly break.
 */
export interface RunTally {
  /** Matches this player was in the XI for. */
  apps: Record<string, number>;
  /** Goals in normal or extra time. Never shootout kicks - see above. */
  goals: Record<string, number>;
}

export const emptyTally = (): RunTally => ({ apps: {}, goals: {} });

/** Add `matches` to a tally: every player in `xi` gains an appearance per match, and
 *  each of the user's goal events gains its scorer a goal. `userSide` is which side of
 *  the events is the user's - always 'home', since both the group fixtures and the
 *  knockout ties are normalised that way, but named rather than assumed. */
export function addMatches(
  tally: RunTally,
  xi: Player[],
  matches: { events: MatchEvent[] }[],
  userSide: 'home' | 'away' = 'home',
): RunTally {
  if (!matches.length) return tally;
  const apps = { ...tally.apps };
  const goals = { ...tally.goals };
  for (const p of xi) apps[p.id] = (apps[p.id] ?? 0) + matches.length;
  // Names are unique per person across the dataset (personId is the name slug), so a
  // scorer name resolves to exactly one player of the XI. An unmatched name - the sim's
  // 'Unknown' fallback when a scorer pool is empty - is dropped rather than guessed.
  const byName = new Map(xi.map((p) => [p.name, p.id]));
  for (const m of matches) {
    for (const e of m.events) {
      if (e.side !== userSide) continue;
      const id = byName.get(e.scorer);
      if (id) goals[id] = (goals[id] ?? 0) + 1;
    }
  }
  return { apps, goals };
}

/** Goals for and against, and knockout ties won, read back off a run's own history.
 *  Used by the career's run archive; `viewOf` in challenges.ts computes the same three
 *  numbers its own way (worth folding together, but that is a hygiene item, not this). */
export function runTotals(run: RunState): {
  goalsFor: number;
  goalsAgainst: number;
  roundsWon: number;
} {
  let goalsFor = 0;
  let goalsAgainst = 0;
  let roundsWon = 0;
  for (const r of run.history) {
    if (r.stage === 'group') {
      for (const g of r.groupResults ?? []) {
        goalsFor += g.us;
        goalsAgainst += g.them;
      }
    } else {
      goalsFor += r.userGoals ?? 0;
      goalsAgainst += r.oppGoals ?? 0;
      if (r.won) roundsWon++;
    }
  }
  return { goalsFor, goalsAgainst, roundsWon };
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

/** Boon offer size (3), widened by the Extra Choice perk (+1 per owned tier). */
const offerSize = (perkLevels: Record<string, number>) => 3 + (perkLevels['extra-boon'] ?? 0);

/** What the build page knows at kickoff and the run cannot work out later. Optional
 *  in full: a caller with nothing to hand (the checks harness) begins a run that simply
 *  cannot complete the entries reading these. */
export interface Kickoff {
  shape?: RunShape;
  build?: RunBuild;
}

export function beginRun(
  xi: Player[],
  perkLevels: Record<string, number> = {},
  unlockedBoons: string[] = [],
  ascension = 0,
  kickoff: Kickoff = {},
): RunState {
  let players = xi;
  const activeBoons: string[] = [];
  const boostedIds: string[] = [];
  // Deep Squad perk: a flat +N to the drafted XI at kickoff (N = owned tier).
  const deepSquad = perkLevels['deep-squad'] ?? 0;
  if (deepSquad > 0) {
    players = players.map((p) => ({ ...p, elo: Math.min(ELO_MAX, p.elo + deepSquad) }));
  }
  // Scout Network perk: begin with N distinct team boosts already applied (N = tier).
  // Commons only - a free legendary before kick-off outweighed every boost choice the
  // run itself offers.
  const scout = perkLevels['scout'] ?? 0;
  if (scout > 0) {
    const commons = availableBoons(unlockedBoons).filter((b) => b.rarity === 'common');
    for (const boon of offerBoons(commons, scout)) {
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
    perkLevels,
    unlockedBoons,
    ascension,
    offer: null,
    // Physio Table perk: re-rolls of a boost offer available this run (0 without it).
    rerollsLeft: perkLevels['physio'] ?? 0,
    nextOpponent: null,
    score: 0,
    outcome: null,
    history: [],
    tally: emptyTally(),
    boostedIds,
    stickersApplied: false,
    shape: kickoff.shape,
    build: kickoff.build,
    // Kickoff chemistry: of the XI that actually starts, so a Scout Network roster boost
    // is already in it. (Rating perks cannot move it - chemistry reads squads, nations,
    // eras and primary positions, never elo.)
    chemistry: chemistryOf(players),
  };
}

/** Simulate the group stage up front, returning the committed next state plus the
 *  user's three matches (for live reveal). Qualify -> draw the R16 opponent + offer
 *  a boon; otherwise the run ends. */
export function prepareGroupStage(
  run: RunState,
  atkDefDelta = 0,
  pool: Squad[] = SQUADS,
): PreparedGroup | null {
  if (run.phase !== 'group') return null;
  const asc = ascensionAt(run.ascension);
  const user = userGroupTeam(run.xi, chemistryOf(run.xi), atkDefDelta + asc.userDelta);
  const opponents = pickOpponents(3, pool);
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
  // Three appearances each, plus whoever scored. Done here rather than at run end
  // because this is the only point that holds both the XI that played and the events.
  const tally = addMatches(
    run.tally ?? emptyTally(),
    run.xi,
    userMatches.map((m) => m.result),
  );
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
        tally,
      },
      userMatches,
      group,
    };
  }
  // Exclude the group opponents from the knockout draw (no immediate rematch).
  const faced = [...run.facedIds, ...opponents.map((s) => s.id)];
  const opp = drawOpponent(new Set(faced), pool, asc.drawSlopeBonus);
  return {
    next: {
      ...run,
      phase: 'boon',
      offer: offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels)),
      nextOpponent: opp,
      facedIds: [...faced, opp.id],
      score: STAGE_SCORE.group,
      history: [...run.history, groupRecord],
      tally,
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
/**
 * Spend a Physio Table re-roll: draw a fresh offer of the same size and knock one off
 * the counter. Returns the run untouched when there is nothing to re-roll, so callers
 * can gate on `rerollsLeft` for the button and still be safe if they do not.
 */
export function rerollOffer(run: RunState): RunState {
  if (run.phase !== 'boon' || !run.offer || (run.rerollsLeft ?? 0) <= 0) return run;
  return {
    ...run,
    offer: offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels)),
    rerollsLeft: (run.rerollsLeft ?? 0) - 1,
  };
}

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
export function prepareKnockoutRound(
  run: RunState,
  atkDefDelta = 0,
  pool: Squad[] = SQUADS,
): PreparedKnockout | null {
  if (run.phase !== 'match' || !run.nextOpponent) return null;
  const asc = ascensionAt(run.ascension);
  const round = run.koRound;
  const roundName = KO_ROUNDS[round];
  const opp = run.nextOpponent;
  const userTeam = userGroupTeam(run.xi, chemistryOf(run.xi), atkDefDelta + asc.userDelta);
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
  // One appearance each for the XI that played the tie, plus its scorers. The shootout
  // is not in `match.events`, so a tie won on penalties adds no goals here - which is
  // the definition the cabinet's top-scorer list advertises.
  const tally = addMatches(run.tally ?? emptyTally(), run.xi, [match]);

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
      tally,
    };
  } else if (round >= KO_ROUNDS.length - 1) {
    next = {
      ...run,
      phase: 'ended',
      outcome: 'champion',
      score: STAGE_SCORE.champion,
      nextOpponent: null,
      history,
      tally,
    };
  } else {
    const nextRound = round + 1;
    const nextOpp = drawOpponent(new Set(run.facedIds), pool, asc.drawSlopeBonus);
    next = {
      ...run,
      phase: 'boon',
      koRound: nextRound,
      offer: offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels)),
      nextOpponent: nextOpp,
      facedIds: [...run.facedIds, nextOpp.id],
      score: STAGE_SCORE[LOST_IN[round]],
      history,
      tally,
    };
  }
  return { next, match, opp, roundName };
}

/** Commit the pending knockout tie without revealing it (used by the checks harness). */
export const playKnockoutRound = (run: RunState): RunState =>
  prepareKnockoutRound(run)?.next ?? run;
