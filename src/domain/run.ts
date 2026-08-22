import type { Player, Position, Squad } from '../data/types';
import { primaryPosition } from '../data/types';
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
  bracketSeedFromGroup,
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
import {
  offerBoons,
  availableBoons,
  boonById,
  type Boon,
  type BoonContext,
  type RatingPlan,
} from './boons';
import { xiOf, type RunEffect } from './effects';
import { formFor, formForAll } from './form';
import {
  makeEvent,
  makeShop,
  nodeKindFor,
  shopItemById,
  eventById,
  type NodeEffect,
  type NodeKind,
  type ShopStock,
} from './nodes';
import {
  bracketChampion,
  buildBracket,
  currentGame,
  opponentOf,
  playRound,
  recordRound,
  type BracketGame,
  type BracketState,
} from './bracket';
import { ascensionAt } from './ascension';

// ---------------------------------------------------------------------------
// Cup Run - prototype run state machine. Pure over Math.random via
// the sim. The UI steps it: playGroupStage -> chooseBoon -> playKnockoutRound ...
// ---------------------------------------------------------------------------

export type RunPhase = 'group' | 'boon' | 'shop' | 'event' | 'match' | 'ended';

/** The round number the group stage grants effects on. Knockout rounds are 0-based
 *  (`koRound`), so the group sits one below them. */
export const GROUP_ROUND = -1;

/** What granting one boon did: the new roster, the new ledger, and (for a roster boon)
 *  who came in and who went out, so the UI can describe the swap without re-diffing. */
interface Granted {
  roster: Player[];
  effects: RunEffect[];
  swappedIn?: Player;
  swappedOut?: Player;
}

/**
 * Apply one boon to the roster + ledger.
 *
 * The single place a boon becomes a change, so the two halves cannot drift: a `rating`
 * boon RESOLVES its plan once against the XI as it currently stands and appends the
 * resulting effects, and a `roster` boon rewrites the roster.
 *
 * Resolving once is the point. "Your weakest player" has to mean whoever that was when the
 * card was taken; a plan re-evaluated on every recompute would let a later effect move the
 * target and change the run under the player.
 */
function grantBoon(
  roster: Player[],
  effects: RunEffect[],
  boon: Boon,
  ctx: BoonContext,
  atRound: number,
  expiresAfter?: number,
): Granted {
  if (boon.effect.kind === 'roster') {
    const next = boon.effect.apply(roster, ctx);
    return {
      roster: next,
      effects,
      swappedIn: next.find((p) => !roster.some((b) => b.id === p.id)),
      swappedOut: roster.find((p) => !next.some((b) => b.id === p.id)),
    };
  }
  const plans = boon.effect.plan(xiOf(roster, effects, atRound), ctx);
  return { roster, effects: [...effects, ...effectsFrom(plans, boon.id, boon.name, atRound, expiresAfter)] };
}

/** Turn resolved plans into ledger entries. Empty plans (a conditional boon whose
 *  condition did not fire) contribute nothing, which is how "it did nothing this time"
 *  is represented - never a zero-delta entry. */
export function effectsFrom(
  plans: RatingPlan[],
  source: string,
  label: string,
  atRound: number,
  expiresAfter?: number,
): RunEffect[] {
  return plans
    .filter((pl) => pl.ids.length > 0 && pl.delta !== 0)
    .map((pl, i) => ({
      id: `${source}-${atRound}-${i}-${pl.delta}`,
      source,
      label,
      target: { ids: pl.ids },
      delta: pl.delta,
      appliedAt: atRound,
      ...(expiresAfter !== undefined ? { expiresAfter } : {}),
    }));
}

/** Rewrite the `xi` cache from the roster + ledger. Every transition that touches either
 *  input must end with this; `npm run checks` asserts the cache agrees. */
function recomputeXi(run: RunState): RunState {
  return { ...run, xi: xiOf(run.roster ?? run.xi, run.effects ?? [], run.koRound) };
}
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
  /** The XI as it is actually played: `roster` with every active `effect` applied.
   *
   *  This is a CACHE, rewritten by `recomputeXi` at every transition that touches either
   *  input. It stays a stored field rather than being derived at each read so that every
   *  existing consumer - the sim, `xiStrength`, `chemistryOf`, `domain/challenges.ts`, the
   *  sticker banking, every component - is untouched by the ledger. `npm run checks`
   *  asserts it agrees with `xiOf` at every phase of a run, which is what catches a new
   *  transition that forgets to recompute. */
  xi: Player[];
  /** Who is in the XI, at DATASET ratings. Roster boosts (Transfer, Poach, Wildcard,
   *  Legends' Reunion) rewrite this; nothing else does.
   *
   *  Optional only so a run persisted before the effect ledger existed still resumes -
   *  `runStorage` fills it from `xi`, which leaves that run's boosts baked in but lets it
   *  finish. Treat it as required in new code. */
  roster?: Player[];
  /** What has been done to the roster, oldest first. Order is load-bearing: `xiOf` folds
   *  the deltas in sequence and clamps at every step. Optional for the same reason as
   *  `roster`. */
  effects?: RunEffect[];
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
  /** Form earned so far this run (see `domain/form.ts`). Spent at shop nodes and thrown
   *  away with the run - it never reaches the career. Optional so a run saved before it
   *  existed resumes; it simply starts earning from its next result. */
  form?: number;
  /** The shop's stock, when `phase === 'shop'`. Decided in the round's decision helper and
   *  stored, never drawn at render time - a reload must not re-roll the shop. */
  shop?: ShopStock;
  /** The drawn event's id, when `phase === 'event'`. Stored for the same reason. */
  event?: string;
  /** Extra cards on every later boost offer, bought at a shop. */
  bonusOfferSize?: number;
  /** The bracket has been revealed for the rest of the run (a shop purchase). */
  revealed?: boolean;
  /** The drawn opponent for the upcoming knockout tie (shown before it is played).
   *  With a bracket this is derived from it rather than drawn directly - it stays the
   *  single field every consumer reads, including the two boons that key off the next
   *  opponent (Poach, Familiar Foes). */
  nextOpponent: GroupTeam | null;
  /** The 16-team knockout bracket (roadmap item 28). Optional because it is genuinely
   *  absent for the whole group stage: it is built when the group is survived, never
   *  before, because there is nothing to seed it from until then. */
  bracket?: BracketState;
  /** The group as drawn and played, held from the draw until the run leaves the group
   *  phase (it is dropped from the state `prepareGroupStage` commits, so it never
   *  outlives the stage it belongs to).
   *
   *  It lives here rather than only on the screen's live reveal because the reveal is
   *  transient - and for a signed-in player it is never persisted at all - so a reload
   *  mid-group had nothing to restore and simply drew three new opponents over the
   *  group already in progress. Optional: a run saved before this field existed draws
   *  its group the first time it plays, as it always did. */
  group?: GroupState;
  /** The pending knockout round, decided up front and kept until it is committed (see
   *  `KoPending`). Optional: a run persisted before this existed decides its next tie
   *  the first time it plays it, as it always did. */
  koPending?: KoPending;
  /** What surviving the group decided (see `GroupExit`), held until the group is
   *  committed. Optional, like the two above. */
  groupExit?: GroupExit;
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

/**
 * Everything a knockout round decides by dice, settled the moment the round starts and
 * held on the run until the round is committed.
 *
 * The point is that a reload cannot re-roll it. Playback is transient by design (and for
 * a signed-in player never persisted at all), so a tie that lived only on the screen's
 * reveal was re-simulated on every reload - reload until you win. Everything random in
 * the round is in here, not just the scoreline: the other ties of the round (inside
 * `bracket`), the boost offer that follows, and the next opponent. Otherwise the same
 * reload re-rolls the offer that the Physio Table perk charges Prestige to re-roll.
 */
export interface KoPending {
  /** The `koRound` this belongs to, so a stale one can never be replayed into another
   *  round. Committing the round drops it, so this is belt and braces. */
  round: number;
  /** The user's tie. The live reveal is playback of exactly this. */
  match: KoMatch;
  /** The tree with the whole round played into it (the user's result spliced in, the
   *  other ties resolved). Absent on a run without a bracket. */
  bracket?: BracketState;
  /** The boost offer waiting after this tie, and the opponent of the round after it.
   *  Both absent when the tie ends the run (a loss, or the final). */
  offer?: Boon[];
  nextOpponent?: GroupTeam;
  /** Which kind of stop follows this tie, and whatever that kind had to draw. Decided
   *  HERE, with the rest of the round, because a node drawn at render time would be
   *  re-drawn by a reload - the same rule that put the group, the tree and the offer on
   *  the run in the first place. Absent on a run whose tie ends it. */
  nodeKind?: NodeKind;
  shop?: ShopStock;
  event?: string;
}

/**
 * What surviving the group decided, beyond the group itself: the knockout tree it seeds,
 * the first boost offer, and the Round-of-16 opponent.
 *
 * Same reason as {@link KoPending} - rolled once, when the group is prepared, and held on
 * the run - because otherwise a reload mid-group re-drew the field of 16 (and so the next
 * opponent) and re-rolled the boost offer that the Physio Table perk charges Prestige to
 * re-roll. Kept beside `group` rather than inside it because `GroupState` is the shared
 * tournament type, not a run type. Only ever set when the group was survived: an exit
 * decides nothing.
 */
export interface GroupExit {
  /** The 16-team tree, on a run playing with one. */
  bracket?: BracketState;
  offer: Boon[];
  nextOpponent: GroupTeam;
  /** The stop that follows the group, decided here for the same reason the tree and the
   *  offer are: a reload must replay it, never re-draw it. Optional so a run saved before
   *  run nodes existed resumes straight into its boost pick, as it always did. */
  nodeKind?: NodeKind;
  shop?: ShopStock;
  event?: string;
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
  /** The run as it must be held WHILE the group is revealed: the same run with the
   *  drawn group recorded on it, so a reload replays that group instead of drawing a
   *  fresh one. The identical object when the group was already on the run, so
   *  committing it is a no-op on a resume. */
  current: RunState;
  userMatches: UserMatch[];
  /** The fully simulated group, for the final-standings overview after the reveal. */
  group: GroupState;
}

/** A prepared knockout tie: the committed next state plus the revealed match. */
export interface PreparedKnockout {
  next: RunState;
  /** The run to hold WHILE the tie reveals: the same run with the round's decisions
   *  recorded on it, so a reload replays them instead of rolling again. The identical
   *  object when they were already there, so a resume writes nothing. */
  current: RunState;
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
/** Cards in a boost offer: three, plus the Extra Choice perk's tier, plus anything bought
 *  at a shop (`bonusOfferSize`). */
const offerSize = (perkLevels: Record<string, number>, bonus = 0) =>
  3 + (perkLevels['extra-boon'] ?? 0) + bonus;

/** Decide the stop that follows a round: its kind, and whatever that kind draws.
 *  Called ONLY from `decideGroupExit` / `decideKoRound`, which is what keeps a node from
 *  being re-drawn by a reload. */
function decideNode(afterRound: number): { nodeKind: NodeKind; shop?: ShopStock; event?: string } {
  const nodeKind = nodeKindFor(afterRound);
  if (nodeKind === 'shop') return { nodeKind, shop: makeShop() };
  if (nodeKind === 'event') return { nodeKind, event: makeEvent() };
  return { nodeKind };
}

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
  // The roster is the drafted XI at dataset ratings; everything done to it goes in the
  // ledger, including the two perks that used to rewrite the players here.
  let roster = xi;
  let effects: RunEffect[] = [];
  const activeBoons: string[] = [];
  const boostedIds: string[] = [];
  // Deep Squad perk: a flat +N to the drafted XI at kickoff (N = owned tier). An effect
  // rather than a rewrite, so the XI panel can name it like any other bonus.
  const deepSquad = perkLevels['deep-squad'] ?? 0;
  if (deepSquad > 0) {
    effects = [
      ...effects,
      {
        id: `deep-squad-${effects.length}`,
        source: 'deep-squad',
        label: 'Deep Squad',
        target: { ids: roster.map((p) => p.id) },
        delta: deepSquad,
        appliedAt: GROUP_ROUND,
      },
    ];
  }
  // Scout Network perk: begin with N distinct team boosts already applied (N = tier).
  // Commons only - a free legendary before kick-off outweighed every boost choice the
  // run itself offers.
  const scout = perkLevels['scout'] ?? 0;
  if (scout > 0) {
    const commons = availableBoons(unlockedBoons).filter((b) => b.rarity === 'common');
    for (const boon of offerBoons(commons, scout)) {
      const granted = grantBoon(roster, effects, boon, { opponentSquadId: null }, GROUP_ROUND);
      roster = granted.roster;
      effects = granted.effects;
      if (granted.swappedIn) boostedIds.push(granted.swappedIn.id);
      activeBoons.push(boon.id);
    }
  }
  return {
    xi: xiOf(roster, effects, GROUP_ROUND),
    roster,
    effects,
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
    form: 0,
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
    chemistry: chemistryOf(xiOf(roster, effects, GROUP_ROUND)),
  };
}

/** Draw three opponents and play all three matchdays at once. The random half of the
 *  group, split out so `prepareGroupStage` can skip it for a group already drawn. All
 *  three matchdays have to be played in one pass: the XI, its chemistry and the run's
 *  tally are settled together, which is why the live table is projected backwards
 *  (`groupAsOf`) rather than simulated forwards. */
function drawAndPlayGroup(run: RunState, userDelta: number, pool: Squad[]): GroupState {
  const user = userGroupTeam(run.xi, chemistryOf(run.xi), userDelta);
  let group = createGroup(user, pickOpponents(3, pool));
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    group = recordMatchday(group, simulateMatchday(group, md));
  }
  return group;
}

/** The squad ids of a group's three opponents. Read off the group rather than the draw
 *  that produced it, so a replayed group excludes exactly the same teams. */
const oppIdsOf = (group: GroupState): string[] =>
  group.teams.filter((t) => !t.isUser).map((t) => t.id);

/** Roll what surviving the group decides: the tree (or a single drawn opponent on a run
 *  without one) and the first boost offer. The one place those dice are thrown, so
 *  `prepareGroupStage` can skip it for a group whose exit is already decided. */
function decideGroupExit(
  run: RunState,
  group: GroupState,
  drawSlopeBonus: number,
  pool: Squad[],
): GroupExit {
  const offer = offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels, run.bonusOfferSize));
  const node = decideNode(GROUP_ROUND);
  // With a bracket, the field of 16 IS the draw: it is seeded from the finished group
  // (the user, whoever qualified with them, and the whole group excluded), so the next
  // opponent is read off it instead of drawn on its own. Ascension's slope is passed in,
  // or the higher tiers would field a Base-strength field.
  const seed = bracketSeedFromGroup(group);
  const bracket = buildBracket(seed.user, seed.coQualifier, seed.excludeIds, pool, drawSlopeBonus);
  const first = currentGame(bracket);
  const opp0 = first ? opponentOf(bracket, first) : undefined;
  if (!first || !opp0) {
    throw new Error('decideGroupExit: a freshly built bracket must have the user in round 0');
  }
  return { bracket, offer, nextOpponent: opp0, ...node };
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
  // A group already drawn is replayed, never re-drawn: it is the same three opponents
  // and the same three results, so a reload cannot change the group under the player.
  const group = run.group ?? drawAndPlayGroup(run, atkDefDelta + asc.userDelta, pool);
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
  // Form for all three group results at once, for the same reason the tally is: this is
  // the point that holds them. Awarded on the COMMITTED state, so a replayed prepare
  // (a reload mid-reveal) cannot pay twice.
  const form =
    (run.form ?? 0) +
    formForAll(userMatches.map((m) => ({ us: m.result.homeGoals, them: m.result.awayGoals })));
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
  // Both halves are decided once and then replayed: the group, and (if it was survived)
  // what comes out of it. `current` is the run holding them, and is the run itself when
  // they were already there, so replaying writes nothing.
  const exit = advanced
    ? (run.groupExit ?? decideGroupExit(run, group, asc.drawSlopeBonus, pool))
    : undefined;
  const current: RunState =
    group === run.group && exit === run.groupExit
      ? run
      : { ...run, group, ...(exit ? { groupExit: exit } : {}) };
  if (!advanced) {
    return {
      // `group: undefined` on every committed state below: the group belongs to the
      // stage being left, and the run's own history carries the results it needs.
      next: {
        ...run,
        phase: 'ended',
        outcome: 'group',
        group: undefined,
        groupExit: undefined,
        score: STAGE_SCORE.group,
        history: [...run.history, groupRecord],
        tally,
        form,
      },
      current,
      userMatches,
      group,
    };
  }
  if (!exit) throw new Error('prepareGroupStage: a survived group must carry its exit');
  // The tree (when there is one), the offer and the next opponent are all read from the
  // exit decided above - the two branches this used to have now differ only in whether
  // that exit came with a bracket.
  return {
    next: {
      ...run,
      // The stop the group decided (a boost pick unless run nodes are on). `offer` is
      // carried whatever the kind: a shop or an event still leads into the next tie, and
      // the offer it holds is the one the NEXT boost stop will show.
      phase: exit.nodeKind ?? 'boon',
      offer: exit.offer,
      ...(exit.shop ? { shop: exit.shop } : {}),
      ...(exit.event ? { event: exit.event } : {}),
      ...(exit.bracket ? { bracket: exit.bracket } : {}),
      group: undefined,
      groupExit: undefined,
      nextOpponent: exit.nextOpponent,
      // Exclude the group opponents from the knockout draw too (no immediate rematch).
      facedIds: [...run.facedIds, ...oppIdsOf(group), exit.nextOpponent.id],
      score: STAGE_SCORE.group,
      history: [...run.history, groupRecord],
      tally,
      form,
    },
    current,
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
    offer: offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels, run.bonusOfferSize)),
    rerollsLeft: (run.rerollsLeft ?? 0) - 1,
  };
}

/**
 * Apply one node effect to a run. The single place a shop item or an event option becomes
 * a change, so the node catalogue never has to know how the run stores anything.
 *
 * Rating effects go through the ledger like a boost, so they are itemised and can expire;
 * `lasts` is a number of rounds INCLUDING the current one, so `lasts: 1` means "this round
 * and no further".
 */
function applyNodeEffect(
  run: RunState,
  eff: NodeEffect,
  source: string,
  label: string,
): RunState {
  const ctx = { opponentSquadId: run.nextOpponent?.id ?? null };
  switch (eff.kind) {
    case 'rating': {
      const roster = run.roster ?? run.xi;
      const effects = run.effects ?? [];
      const plans = eff.plan(xiOf(roster, effects, run.koRound), ctx);
      const expiresAfter = eff.lasts === undefined ? undefined : run.koRound + eff.lasts - 1;
      return recomputeXi({
        ...run,
        effects: [...effects, ...effectsFrom(plans, source, label, run.koRound, expiresAfter)],
      });
    }
    case 'roster': {
      const roster = eff.apply(run.roster ?? run.xi, ctx);
      const inP = roster.find((p) => !(run.roster ?? run.xi).some((b) => b.id === p.id));
      return recomputeXi({
        ...run,
        roster,
        boostedIds: inP ? [...run.boostedIds, inP.id] : run.boostedIds,
      });
    }
    case 'reroll':
      return { ...run, rerollsLeft: (run.rerollsLeft ?? 0) + eff.n };
    case 'offerSize':
      return { ...run, bonusOfferSize: (run.bonusOfferSize ?? 0) + eff.n };
    case 'form':
      // Clamped at zero: an option that charges Form is gated on affording it, but a
      // negative balance must be unrepresentable rather than merely unlikely.
      return { ...run, form: Math.max(0, (run.form ?? 0) + eff.n) };
    case 'reveal':
      return { ...run, revealed: true };
    case 'none':
      return run;
  }
}

/** Form an event option costs, as a positive number (0 when it costs nothing). Used to
 *  gate the option in the UI, so a player is never offered a trade they cannot make. */
export function optionCost(effects: NodeEffect[]): number {
  return effects.reduce((c, e) => c + (e.kind === 'form' && e.n < 0 ? -e.n : 0), 0);
}

/** Buy one item from the shop stop. Refuses silently when it is not affordable, already
 *  bought, or not in this stop's stock, so the caller can gate on the same facts for the
 *  button and still be safe if it does not. */
export function buyShopItem(run: RunState, itemId: string): RunState {
  if (run.phase !== 'shop' || !run.shop) return run;
  if (!run.shop.itemIds.includes(itemId) || run.shop.purchased.includes(itemId)) return run;
  const item = shopItemById(itemId);
  if (!item || (run.form ?? 0) < item.cost) return run;
  const paid: RunState = {
    ...run,
    form: (run.form ?? 0) - item.cost,
    shop: { ...run.shop, purchased: [...run.shop.purchased, itemId] },
  };
  return applyNodeEffect(paid, item.effect, item.id, item.name);
}

/** Leave the shop and go on to the tie. The shop is dropped, so it cannot be revisited
 *  or replayed - it belongs to the stop being left, like every other pending decision. */
export function leaveShop(run: RunState): RunState {
  if (run.phase !== 'shop') return run;
  return { ...run, phase: 'match', shop: undefined };
}

/** Take one option on the event stop. */
export function chooseEventOption(run: RunState, optionId: string): RunState {
  if (run.phase !== 'event' || !run.event) return run;
  const card = eventById(run.event);
  const option = card?.options.find((o) => o.id === optionId);
  if (!card || !option) return run;
  if ((run.form ?? 0) < optionCost(option.effects)) return run;
  let next: RunState = { ...run };
  for (const eff of option.effects) {
    next = applyNodeEffect(next, eff, `${card.id}:${option.id}`, card.title);
  }
  return { ...next, phase: 'match', event: undefined };
}

export function chooseBoon(run: RunState, boonId: string): BoonChoice {
  if (run.phase !== 'boon') return { next: run };
  const boon = boonById(boonId);
  if (!boon) return { next: run };
  const granted = grantBoon(
    run.roster ?? run.xi,
    run.effects ?? [],
    boon,
    { opponentSquadId: run.nextOpponent?.id ?? null },
    run.koRound,
  );
  // If the boon swapped the roster, tag the incoming player (an amber "Boost" mark).
  const { swappedIn, swappedOut } = granted;
  // The boost is chosen right after a round's games, so record it on that round (the
  // most recent history entry) - e.g. the after-group boost lands on the group step.
  const last = run.history.length - 1;
  const history =
    last >= 0 ? run.history.map((r, i) => (i === last ? { ...r, boostId: boon.id } : r)) : run.history;
  return {
    next: recomputeXi({
      ...run,
      roster: granted.roster,
      effects: granted.effects,
      activeBoons: [...run.activeBoons, boon.id],
      boostedIds: swappedIn ? [...run.boostedIds, swappedIn.id] : run.boostedIds,
      offer: null,
      phase: 'match',
      history,
    }),
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

/**
 * Play one bracket round around a tie that has already been simulated.
 *
 * The user's game is index 0 of the current round and the user is always its home side
 * (`buildBracket` seeds them at 0, and `pairGames` keeps a winner at the index its game
 * had), which is the same invariant `simulateKoTie` relies on - so the tie's result maps
 * straight onto the game, and the other games in the round are simulated normally.
 */
function advanceBracket(
  b: BracketState,
  userTeam: GroupTeam,
  match: KoMatch,
  oppId: string,
): BracketState {
  // Refresh the stored user side: boosts change the XI between rounds.
  const withUser: BracketState = { ...b, teams: { ...b.teams, [USER_ID]: userTeam } };
  const played = playRound(withUser);
  const own = played[0];
  if (!own?.hasUser || own.homeId !== USER_ID) {
    throw new Error('advanceBracket: the user must be the home side of game 0 of their round');
  }
  const games: BracketGame[] = played.map((g, i) =>
    i === 0
      ? {
          ...g,
          result: {
            homeGoals: match.userGoals,
            awayGoals: match.oppGoals,
            decided: match.decided,
            pens: match.pens,
            events: match.events,
            winnerId: match.userWon ? USER_ID : oppId,
          },
        }
      : g,
  );
  return recordRound(withUser, games);
}

/** The user's opponent in the round they play next, or null once the run is over. */
function nextOpponentOf(b: BracketState): GroupTeam | null {
  const g = currentGame(b);
  if (!g) return null;
  return opponentOf(b, g) ?? null;
}

/** The champion of a run's bracket, whoever it turned out to be (the user, or the team
 *  that went on to win it after they went out). Null without a bracket, or before the
 *  final has been played. Exposed for the run's ended screen. */
export function runChampion(run: RunState) {
  return run.bracket ? bracketChampion(run.bracket) : null;
}

/**
 * Roll everything this knockout round decides: the user's tie, the rest of the round on
 * the tree, and - if the tie is survived - the boost offer and the opponent after it.
 * The one place the dice are thrown for a round, so `prepareKnockoutRound` can skip it
 * for a round already decided.
 */
function decideKoRound(
  run: RunState,
  userTeam: GroupTeam,
  opp: GroupTeam,
  round: number,
  drawSlopeBonus: number,
  pool: Squad[],
): KoPending {
  const match = simulateKoTie(userTeam, opp);
  // With a bracket: the user's own tie is still the one simulated above (so the run's
  // boosts, chemistry, Ascension handicap and difficulty all apply exactly as before),
  // and its result is spliced into the tree; the other ties in the round resolve from
  // their own ratings. The user's team is refreshed first because boosts change the XI
  // between rounds, and the bracket stores a snapshot.
  const bracket = run.bracket ? advanceBracket(run.bracket, userTeam, match, opp.id) : undefined;
  const pending: KoPending = { round, match, ...(bracket ? { bracket } : {}) };
  // A tie that ends the run decides nothing further: no boost is offered and there is
  // no round after it.
  if (!match.userWon || round >= KO_ROUNDS.length - 1) return pending;
  // The bracket already knows who is next; only a run without one draws.
  const fromBracket = bracket ? nextOpponentOf(bracket) : null;
  return {
    ...pending,
    offer: offerBoons(availableBoons(run.unlockedBoons), offerSize(run.perkLevels, run.bonusOfferSize)),
    nextOpponent: fromBracket ?? drawOpponent(new Set(run.facedIds), pool, drawSlopeBonus),
    ...decideNode(round),
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
  // A round already decided is replayed, never re-rolled: the same scoreline, the same
  // shootout, the same rest of the tree, the same boost offer waiting after it.
  const decided =
    run.koPending?.round === round
      ? run.koPending
      : decideKoRound(run, userTeam, opp, round, asc.drawSlopeBonus, pool);
  const current = decided === run.koPending ? run : { ...run, koPending: decided };
  const { match } = decided;
  const nextBracket = decided.bracket;
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
  const form = (run.form ?? 0) + formFor(match.userGoals, match.oppGoals);

  // `koPending: undefined` on every committed state below: the round's decisions belong
  // to the round being left, and `history` carries its result from here on.
  let next: RunState;
  if (!match.userWon) {
    const outcome = LOST_IN[round];
    next = {
      ...run,
      phase: 'ended',
      outcome,
      score: STAGE_SCORE[outcome],
      nextOpponent: null,
      koPending: undefined,
      // Kept, and completed: `recordRound` plays out the rest of the tree when the user
      // is knocked out, so the run's last screen can still crown a champion.
      ...(nextBracket ? { bracket: nextBracket } : {}),
      history,
      tally,
      form,
    };
  } else if (round >= KO_ROUNDS.length - 1) {
    next = {
      ...run,
      phase: 'ended',
      outcome: 'champion',
      score: STAGE_SCORE.champion,
      nextOpponent: null,
      koPending: undefined,
      ...(nextBracket ? { bracket: nextBracket } : {}),
      history,
      tally,
      form,
    };
  } else {
    // Both were decided when the round started, so they are read rather than drawn.
    const nextOpp = decided.nextOpponent;
    const offer = decided.offer;
    if (!nextOpp || !offer) {
      throw new Error('prepareKnockoutRound: a survived tie must carry its offer + next opponent');
    }
    // `recomputeXi` after the increment, never before: `koRound` is what `xiOf` tests
    // expiry against, so a temporary effect only wears off once the round has advanced.
    // This is the one transition where that matters, since it is the only one that moves
    // the round on.
    next = recomputeXi({
      ...run,
      phase: decided.nodeKind ?? 'boon',
      koRound: round + 1,
      offer,
      ...(decided.shop ? { shop: decided.shop } : {}),
      ...(decided.event ? { event: decided.event } : {}),
      nextOpponent: nextOpp,
      facedIds: [...run.facedIds, nextOpp.id],
      koPending: undefined,
      ...(nextBracket ? { bracket: nextBracket } : {}),
      score: STAGE_SCORE[LOST_IN[round]],
      history,
      tally,
      form,
    });
  }
  return { next, current, match, opp, roundName };
}

/** Commit the pending knockout tie without revealing it (used by the checks harness). */
export const playKnockoutRound = (run: RunState): RunState =>
  prepareKnockoutRound(run)?.next ?? run;
