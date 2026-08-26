// ---------------------------------------------------------------------------
// Player versus Player: the rules a room is judged by.
//
// Wave 0 of docs/pvp-plan.md, and the whole of what a PvP room needs that is not
// plumbing. Everything here is PURE and framework-free for a reason beyond the usual
// one: the referee (the server-side service that validates a submitted XI, deals roll
// squads and simulates the ties) bundles this exact code rather than reimplementing it,
// so a second copy of the rules in SQL cannot drift from the game's own.
//
// The three things it owns:
//
//   * `validateXi` - is this XI legal, what did it cost, and was he even dealt.
//   * `autoPick` / `autoCompleteXi` - what happens when the pick clock runs out.
//   * `pvpTeam` - a match side for a player, which `userGroupTeam` cannot describe.
//
// TWO RULES RUN THROUGH ALL OF IT, and both are load-bearing:
//
// 1. NOTHING TRUSTS THE SUBMITTED PLAYER OBJECT. A room is account-only and the client
//    posts an XI over the wire, so every player is resolved through `basePlayer` before
//    anything is asked of him. A submitted rating decides his price, a submitted
//    `positions` decides whether he may stand in a slot, and both arrive from a browser.
//    This is the same lesson `useStickerAlbum` learned when a boosted +2 copy of an 89
//    looked Legendary to the album and the server refused the whole bank: judge the
//    DATASET player, never the object in hand.
// 2. CHEMISTRY IS OFF IN A ROOM (plan P25). `pvpTeam` takes no chemistry argument at
//    all rather than defaulting one to zero, so a caller cannot quietly reintroduce it.
//    Measured before deciding: the same eleven players with the full bonus beat
//    themselves without it 73.2% of the time, because `userGroupTeam` adds it to attack
//    AND defence and those are the two numbers the sim reads. In the single-player game
//    that is a nudge helping a patchwork XI close on an intact national side, which is
//    what chemistry exists for; in a room both sides are patchwork, so it stopped being
//    a nudge and became the game - and a pure knowledge check at that, since eleven men
//    from one squad reach the cap while a naively built XI never does.
// ---------------------------------------------------------------------------

import type { Player, Squad } from '../data/types';
import { SQUAD_BY_ID, basePlayer, datasetPlayer, squadsInPool } from '../data/squads';
import type { Formation, Slot } from './formations';
import type { Filled } from './draft';
import { priceOf } from './pricing';
import { scorerPool, xiStrength, type PenTaker } from './match';
import type { GroupTeam } from './tournament';
import { pick } from './random';

/** Cheapest any player can be (`priceOf` has a floor of 1). Reserved per still-empty
 *  slot by the budget auto-pick, so one expiry early in a draft can never leave an XI
 *  that is impossible to finish. `domain/budget.ts` holds its own copy of this constant
 *  for the same purpose; they are the same fact about the price curve. */
const MIN_PRICE = 1;

/** How a room's XIs are built. Mirrors the host's choices that the RULES care about;
 *  the ones that only affect presentation (whether ratings are shown, the room's
 *  visibility) are deliberately absent, because nothing here should be able to read
 *  them and accidentally make them matter. */
export interface RoomRules {
  method: 'roll' | 'budget';
  /** Dollars, budget rooms only. Ignored when `method` is 'roll'. */
  budget: number;
  /** The World Cups this room draws from. Empty means every tournament, exactly as the
   *  `poolYears` setting does - never a literal list of every current year, which is the
   *  bug that once hid a whole tournament from every existing save. */
  years: readonly number[];
}

/** Why an XI was refused. A LIST rather than a single reason: a player told only the
 *  first thing wrong with their team has to submit again to discover the second, and in
 *  a room the referee is answering a machine anyway. */
export type XiFault =
  | 'unknown-player'
  | 'empty-slot'
  | 'wrong-position'
  | 'duplicate-person'
  | 'out-of-pool'
  | 'over-budget'
  | 'undealt';

export interface XiVerdict {
  ok: boolean;
  faults: XiFault[];
  /** What the XI cost at the room's prices. 0 in a roll room, where nothing is bought. */
  cost: number;
  /** The dataset players, in slot order. Empty when the XI is not complete. */
  players: Player[];
}

/** The squads a roll-room player was actually dealt, by id. A budget room passes
 *  nothing: its pool is the whole room pool. */
export type Dealt = readonly string[];

// --- The room's pool -------------------------------------------------------

/** The squads a room draws from. Thin wrapper over `squadsInPool` so every rule here
 *  asks the same question the rest of the game asks, rather than filtering by year by
 *  hand and drifting from the "empty means all" convention. */
export function roomSquads(rules: RoomRules): readonly Squad[] {
  return squadsInPool(rules.years);
}

/** Every player a room allows. */
export function roomPlayers(rules: RoomRules): Player[] {
  return roomSquads(rules).flatMap((s) => s.players);
}

/** True when this player's squad is one the room allows. Reads the DATASET squad of the
 *  dataset player, so a submitted `squadId` cannot smuggle a 1970 star into a
 *  2022-only room. */
function inPool(p: Player, allowedSquadIds: ReadonlySet<string>): boolean {
  return allowedSquadIds.has(p.squadId);
}

// --- What it cost ----------------------------------------------------------

/** What one player costs in a room: the plain curve, and NEVER the album discount.
 *  `priceFor` exists for the single-player market, where owning a sticker makes a
 *  player cheaper; in a room that would make a long-standing collection buy a better
 *  team, which is exactly what plan P3 and P8 rule out. Kept as its own named function
 *  so a future caller reaching for `priceFor` here is an obvious mistake rather than a
 *  silent one. */
export function pvpPriceOf(p: Player): number {
  return priceOf(basePlayer(p).elo);
}

/** What a set of players costs. */
export function xiCost(players: readonly Player[]): number {
  return players.reduce((total, p) => total + pvpPriceOf(p), 0);
}

// --- Is this XI legal? -----------------------------------------------------

/**
 * Judge a submitted XI against a room's rules.
 *
 * `filled` is a slot map rather than a list of picks, and that is deliberate (plan P42):
 * placing a player promotes the slot's role onto him, so moving two multi-position
 * players between slots changes both of the numbers the sim reads without changing who
 * is in the team. A pick log cannot express that; the final map can.
 *
 * Every check resolves through `basePlayer` first. The eligibility test in particular
 * reads the DATASET positions and not the submitted ones, because `placedPlayers` hands
 * downstream code copies with the filled slot promoted to the front of `positions` - so
 * trusting the incoming list would let a player's range be whatever the client says it
 * is, which in a competitive room is the whole ruleset handed to the browser.
 */
export function validateXi(
  formation: Formation,
  filled: Filled,
  rules: RoomRules,
  dealt?: Dealt,
): XiVerdict {
  const faults = new Set<XiFault>();
  const allowed = new Set(roomSquads(rules).map((s) => s.id));
  const dealtIds = dealt ? new Set(dealt) : null;
  const seenPersons = new Set<string>();
  const players: Player[] = [];

  for (const slot of formation.slots) {
    const submitted = filled[slot.id];
    if (!submitted) {
      faults.add('empty-slot');
      continue;
    }
    // Not `basePlayer`, which falls back to the object it was given when the id is
    // unknown - the one place that fallback is wrong, because here an unknown id is
    // precisely the thing being tested for.
    const p = datasetPlayer(submitted.id);
    if (!p) {
      faults.add('unknown-player');
      continue;
    }
    players.push(p);
    if (!p.positions.includes(slot.position)) faults.add('wrong-position');
    if (!inPool(p, allowed)) faults.add('out-of-pool');
    if (seenPersons.has(p.personId)) faults.add('duplicate-person');
    seenPersons.add(p.personId);
    if (dealtIds && !dealtIds.has(p.squadId)) faults.add('undealt');
  }

  const cost = rules.method === 'budget' ? xiCost(players) : 0;
  if (rules.method === 'budget' && cost > rules.budget) faults.add('over-budget');

  const complete = players.length === formation.slots.length && !faults.has('empty-slot');
  return {
    ok: faults.size === 0 && complete,
    faults: [...faults],
    cost,
    players: complete ? players : [],
  };
}

// --- When the clock runs out -----------------------------------------------

/** What the auto-pick decided, or null when there is nothing left to fill. */
export interface AutoPick {
  slotId: string;
  player: Player;
  /** True when the player's own held card was placed rather than a random pick. */
  held: boolean;
}

export interface AutoPickInput {
  /** A card the player was holding when the window expired. Placed if it fits an empty
   *  slot (plan P12): it is their own expressed choice, so it cannot be gamed, and it
   *  stops running out of time while deciding WHERE from being punished as hard as
   *  running out while deciding WHO. */
  held?: Player | null;
  /** Money left, budget rooms only. */
  remaining?: number;
  /** The squads dealt so far, roll rooms only. The candidate pool is the LAST one: the
   *  referee cannot know what is on a player's screen, so it fills from what it last
   *  dealt, which is also why a re-roll arriving after the deadline is refused. */
  dealt?: Dealt;
}

/** Slots with nobody in them. */
function emptySlots(formation: Formation, filled: Filled): Slot[] {
  return formation.slots.filter((s) => !filled[s.id]);
}

/** The personIds already spoken for. */
function usedPersons(filled: Filled): Set<string> {
  const used = new Set<string>();
  for (const p of Object.values(filled)) if (p) used.add(basePlayer(p).personId);
  return used;
}

/** Who could legally go into this slot, given everything the room and the draft allow. */
function candidatesFor(
  slot: Slot,
  pool: readonly Player[],
  used: ReadonlySet<string>,
  maxPrice: number | null,
): Player[] {
  return pool.filter(
    (p) =>
      p.positions.includes(slot.position) &&
      !used.has(p.personId) &&
      (maxPrice === null || priceOf(p.elo) <= maxPrice),
  );
}

/**
 * Fill one empty slot, the way an expired pick window does.
 *
 * Random, by decision (plan P21) rather than "the best affordable": a good fallback
 * would make running out of time nearly free, and in a budget room often the smarter
 * play, which turns the clock from a rule into a suggestion.
 *
 * The budget reserve is the part that is easy to leave out and impossible to recover
 * from. Spending freely on an early expiry can leave the last slots unaffordable, and
 * the rules must not be able to produce an XI that cannot be finished - so a pick may
 * never spend more than the remaining money less one dollar for every slot still empty
 * after this one. `autoFillBudget` reserves the same way for the same reason.
 */
export function autoPick(
  formation: Formation,
  filled: Filled,
  rules: RoomRules,
  input: AutoPickInput = {},
): AutoPick | null {
  const open = emptySlots(formation, filled);
  if (!open.length) return null;
  const used = usedPersons(filled);

  // A held card first, if it fits anywhere still open.
  const heldBase = input.held ? basePlayer(input.held) : null;
  if (heldBase && !used.has(heldBase.personId)) {
    const fits = open.filter((s) => heldBase.positions.includes(s.position));
    if (fits.length) {
      const slot = pick(fits);
      if (slot) return { slotId: slot.id, player: heldBase, held: true };
    }
  }

  const pool =
    rules.method === 'roll'
      ? (SQUAD_BY_ID[input.dealt?.[input.dealt.length - 1] ?? '']?.players ?? [])
      : roomPlayers(rules);

  // The reserve is per slot still empty AFTER this one.
  const maxPrice =
    rules.method === 'budget'
      ? Math.max(MIN_PRICE, (input.remaining ?? 0) - (open.length - 1) * MIN_PRICE)
      : null;

  // Try slots in a random order: a slot with no candidate at all (a roll room whose
  // dealt squad has nobody for it) must not stall the whole draft, so move to another
  // empty slot rather than returning null and leaving the window unfillable.
  for (const slot of shuffle(open)) {
    const cands = candidatesFor(slot, pool, used, maxPrice);
    const chosen = pick(cands);
    if (chosen) return { slotId: slot.id, player: chosen, held: false };
  }
  return null;
}

/** A local shuffle. `domain/random.ts`'s `shuffled` takes a readonly array and is the
 *  same algorithm; this exists only so the slot order here is drawn without importing a
 *  second name for one call. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Fill every empty slot by repeated auto-pick: what a player who does nothing at all
 * for a whole draft ends up with.
 *
 * It exists as its own function because it is the thing the plan promises (P12: no
 * forfeits, ever) and therefore the thing to assert. It also handles the one case
 * `autoPick` cannot: a slot with no candidate is skipped rather than retried forever,
 * so this returns whatever it managed, and a caller can tell by counting.
 */
export function autoCompleteXi(
  formation: Formation,
  filled: Filled,
  rules: RoomRules,
  input: AutoPickInput = {},
): Filled {
  const next: Filled = { ...filled };
  let remaining = input.remaining ?? 0;
  let held = input.held ?? null;
  // Bounded by the slot count: every iteration either fills a slot or gives up entirely.
  for (let guard = 0; guard <= formation.slots.length; guard++) {
    const made = autoPick(formation, next, rules, { held, remaining, dealt: input.dealt });
    if (!made) break;
    next[made.slotId] = made.player;
    remaining -= rules.method === 'budget' ? pvpPriceOf(made.player) : 0;
    held = null;
  }
  return next;
}

// --- A match side ----------------------------------------------------------

/** Ranked penalty takers, best first. The same rule `tournament.ts` uses for a group
 *  team, minus the shootout bonus arguments: no PvP card exists to grant one, and a
 *  parameter nothing passes is a parameter nothing tests. */
function penTakersFor(players: readonly Player[]): PenTaker[] {
  return [...players]
    .sort((a, b) => b.elo - a.elo)
    .map((p) => ({ name: p.name, elo: p.elo }));
}

export interface PvpSide {
  /** The account this XI belongs to. */
  id: string;
  /** What the other players see, i.e. the display name. */
  name: string;
  /** Three letters for the compact bracket cells, derived from the name by the caller
   *  rather than here: a display name is user-supplied text and shortening it is a
   *  presentation decision with its own normalisation rules. */
  code: string;
  players: Player[];
  /** Whether this side is the viewer's own. Presentation only, and the reason this is a
   *  parameter: `userGroupTeam` hard-codes `isUser: true` along with the id, the name
   *  and the code, so it can describe the one side a single-player match has and cannot
   *  describe two opponents in one tie. That is what this function exists for. */
  isUser?: boolean;
}

/**
 * A match side for one player in a room.
 *
 * Deliberately takes NO chemistry and no difficulty handicap. Chemistry is off in a room
 * (P25, and the header of this file says why); the casual/normal/hard setting is a
 * personal preference and applying one player's to a shared match would be absurd. So a
 * PvP side is exactly what the dataset says the eleven players are, which is also what
 * makes a result comparable between rooms - the thing a ladder will need.
 *
 * Ratings are read through `basePlayer`, so an XI that reached here as anything other
 * than dataset copies still plays at its real strength.
 */
export function pvpTeam(side: PvpSide): GroupTeam {
  const players = side.players.map(basePlayer);
  return {
    id: side.id,
    name: side.name,
    code: side.code,
    isUser: side.isUser ?? false,
    strength: xiStrength(players),
    scorers: scorerPool(players),
    penTakers: penTakersFor(players),
  };
}
