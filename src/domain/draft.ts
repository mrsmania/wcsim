import { ELO_MAX, type Player, type Position, type Squad } from '../data/types';
import type { Formation, Slot } from './formations';
import { pick } from './random';

/** Map of slotId -> placed player (or null/absent if still open). */
export type Filled = Record<string, Player | null>;

// --- placement -------------------------------------------------------------

/** True when the slot is empty and the slot's role is one the player can fill. */
export function canPlace(player: Player, slot: Slot, filled: Filled): boolean {
  return !filled[slot.id] && player.positions.includes(slot.position);
}

/**
 * Move the player in `fromSlotId` to `toSlotId`, returning the resulting placement, or
 * null when there is no legal way to do it. Everyone displaced is re-placed into a slot
 * they can actually play, so the XI is always valid afterwards.
 *
 * Three shapes, all the same rule underneath:
 *   * the target is EMPTY            -> he simply takes it
 *   * a straight trade               -> the occupant can play the slot being vacated
 *   * a ROTATION of three or more    -> nobody can trade pairwise, but a cycle works
 *
 * That third one is why this is a search and not a pair of ifs. Real example from the
 * dataset: Knoflicek [LW,ST] at LW, Burruchaga [AM,RW,ST] at ST, Donadoni [LW,RW,AM] at
 * RW. Every pairwise swap is refused (Burruchaga cannot play LW, Donadoni cannot play ST,
 * Knoflicek cannot play RW), yet rotating all three one place round is perfectly legal.
 * A pairwise-only rule offers nothing here, which reads as the front three being stuck.
 *
 * The search is the standard bipartite augmenting path (Kuhn): put the mover in his
 * target, then try to re-place whoever he displaced, recursing through whoever THAT
 * displaces. Each slot is considered at most once per search, which keeps it linear and
 * loses nothing - a slot that cannot help this chain cannot help a later branch of it -
 * and it finds the smallest rearrangement rather than reshuffling the whole XI.
 *
 * Eligibility reads the whole `positions` list, never `positions[0]`. `placedPlayers`
 * hands downstream code copies with the filled slot promoted to the front, so keying a
 * move off the primary position would let a player's range collapse to wherever he
 * happens to be standing - and shrink again with every move. The list is a set here, and
 * order carries no meaning.
 */
export function planMove(
  formation: Formation,
  filled: Filled,
  fromSlotId: string,
  toSlotId: string,
): Filled | null {
  if (fromSlotId === toSlotId) return null;
  const from = formation.slots.find((s) => s.id === fromSlotId);
  const to = formation.slots.find((s) => s.id === toSlotId);
  if (!from || !to) return null;
  const mover = filled[from.id];
  if (!mover || !mover.positions.includes(to.position)) return null;

  // The mover goes first, which frees his old slot for the chain to end in.
  const next: Filled = { ...filled };
  delete next[from.id];
  next[to.id] = mover;

  const displaced = filled[to.id];
  if (!displaced) return next;

  const visited = new Set<string>([to.id]);
  const rehouse = (player: Player): boolean => {
    for (const s of formation.slots) {
      if (visited.has(s.id) || !player.positions.includes(s.position)) continue;
      visited.add(s.id);
      const sitting = next[s.id];
      // Free (an empty slot, or the one the mover just left) or its occupant can be
      // moved along in turn. Assign only once the rest of the chain has worked out.
      if (!sitting || rehouse(sitting)) {
        next[s.id] = player;
        return true;
      }
    }
    return false;
  };
  return rehouse(displaced) ? next : null;
}

/** Whether that move is possible at all (see planMove for the rule). */
export function canMove(
  formation: Formation,
  filled: Filled,
  fromSlotId: string,
  toSlotId: string,
): boolean {
  return planMove(formation, filled, fromSlotId, toSlotId) !== null;
}

/** Every slot the player in `fromSlotId` can move to: empty ones, straight trades, and
 *  any slot reachable by rotating a chain of team-mates round. */
export function moveTargets(formation: Formation, filled: Filled, fromSlotId: string): Set<string> {
  const out = new Set<string>();
  for (const s of formation.slots) {
    if (canMove(formation, filled, fromSlotId, s.id)) out.add(s.id);
  }
  return out;
}

/** Set of slot roles that still have at least one open slot. */
export function positionsWithOpenSlot(formation: Formation, filled: Filled): Set<Position> {
  const open = new Set<Position>();
  for (const s of formation.slots) {
    if (!filled[s.id]) open.add(s.position);
  }
  return open;
}

/** Can this player be drafted right now: not already used, and fits some open slot. */
export function isSelectable(
  player: Player,
  openPositions: Set<Position>,
  usedPersonIds: Set<string>,
): boolean {
  if (usedPersonIds.has(player.personId)) return false;
  return player.positions.some((p) => openPositions.has(p));
}

export function filledCount(formation: Formation, filled: Filled): number {
  return formation.slots.reduce((n, s) => (filled[s.id] ? n + 1 : n), 0);
}

export function isComplete(formation: Formation, filled: Filled): boolean {
  return filledCount(formation, filled) === formation.slots.length;
}

/** The players placed so far, in slot order. Each player's `positions` is reordered so
 *  the SLOT they were placed in leads (positions[0] = the slot's role). Downstream code
 *  keys off the primary position (xiStrength, the boosts' attacker/defender split,
 *  chemistry, the XI display), so this makes a player count as the role they actually
 *  play rather than their nominal main position - e.g. a DM/CB placed at CB is treated
 *  as a defender (and gets the Defensive Drills boost). `canPlace` guarantees the slot
 *  role is one of the player's positions, so it is always present to promote. */
export function placedPlayers(formation: Formation, filled: Filled): Player[] {
  const out: Player[] = [];
  for (const s of formation.slots) {
    const p = filled[s.id];
    if (!p) continue;
    out.push(
      p.positions[0] === s.position
        ? p
        : { ...p, positions: [s.position, ...p.positions.filter((pos) => pos !== s.position)] },
    );
  }
  return out;
}

/** Average elo of the players placed so far (0 when none). */
export function teamRating(formation: Formation, filled: Filled): number {
  const players = placedPlayers(formation, filled);
  if (players.length === 0) return 0;
  return Math.round(players.reduce((sum, p) => sum + p.elo, 0) / players.length);
}

/** Strength tiers for the "Random team" shortcut, mapped to elo bands. */
export type TeamStrength = 'weak' | 'medium' | 'strong' | 'very-strong';

export const STRENGTH_BANDS: Record<TeamStrength, { min: number; max: number }> = {
  weak: { min: 0, max: 75 },
  medium: { min: 75, max: 80 },
  strong: { min: 80, max: 88 },
  'very-strong': { min: 88, max: ELO_MAX },
};

/**
 * Auto-pick a full, valid XI for a formation: a random eligible player per slot,
 * each a distinct person. When a `band` is given, prefer players whose elo falls
 * in that range (falling back to the nearest-rated eligible player so the XI
 * always completes). Scarce positions are filled first to avoid dead-ends.
 */
export function randomXI(
  formation: Formation,
  squads: Squad[],
  band?: { min: number; max: number },
): { filled: Filled; usedPersonIds: string[] } {
  const pool = squads.flatMap((s) => s.players);
  const inBand = (p: Player) => !band || (p.elo >= band.min && p.elo < band.max);
  const mid = band ? (band.min + band.max) / 2 : 0;
  const candidatesFor = (slot: Slot) => pool.filter((p) => p.positions.includes(slot.position));
  // Fill the slots with the fewest in-band candidates first.
  const order = [...formation.slots].sort(
    (a, b) => candidatesFor(a).filter(inBand).length - candidatesFor(b).filter(inBand).length,
  );
  const used = new Set<string>();
  const filled: Filled = {};
  for (const slot of order) {
    const eligible = candidatesFor(slot).filter((p) => !used.has(p.personId));
    let pickPool = eligible.filter(inBand);
    if (pickPool.length === 0) {
      // No one in the band for this slot: take from the nearest-rated eligible players.
      pickPool = [...eligible].sort((a, b) => Math.abs(a.elo - mid) - Math.abs(b.elo - mid)).slice(0, 5);
    }
    if (pickPool.length === 0) continue;
    const chosen = pick(pickPool);
    used.add(chosen.personId);
    filled[slot.id] = chosen;
  }
  return { filled, usedPersonIds: [...used] };
}

// --- rolling ---------------------------------------------------------------

function squadHasSelectable(squad: Squad, open: Set<Position>, used: Set<string>): boolean {
  return squad.players.some((p) => isSelectable(p, open, used));
}

/**
 * Pick a random squad from `pool`, preferring ones that actually have a
 * draftable player for the open slots (so the draft never dead-ends). Falls
 * back to the whole pool if none are actionable. Returns null for an empty pool.
 */
function pickFrom(pool: Squad[], open: Set<Position>, used: Set<string>): Squad | null {
  if (pool.length === 0) return null;
  const actionable = pool.filter((s) => squadHasSelectable(s, open, used));
  const arr = actionable.length ? actionable : pool;
  return pick(arr);
}

/** Auto draw / "Another roll": any squad except the current one. */
export function rollAny(
  squads: Squad[],
  open: Set<Position>,
  used: Set<string>,
  excludeId: string | null,
): Squad | null {
  return pickFrom(squads.filter((s) => s.id !== excludeId), open, used);
}

// The two re-roll predicates, defined once each. They were written out twice - once to
// roll and once to decide whether the button is offered - and a drift between the pair
// hands the player a live button that cannot roll anything.
/** "Another team": a different nation from the same tournament year. */
const sameYear = (current: Squad) => (s: Squad) => s.year === current.year && s.id !== current.id;
/** "Another cup": the same nation at a different World Cup. */
const sameNation = (current: Squad) => (s: Squad) => s.code === current.code && s.id !== current.id;

export function rollAnotherTeam(
  squads: Squad[],
  current: Squad,
  open: Set<Position>,
  used: Set<string>,
): Squad | null {
  return pickFrom(squads.filter(sameYear(current)), open, used);
}

export function rollAnotherCup(
  squads: Squad[],
  current: Squad,
  open: Set<Position>,
  used: Set<string>,
): Squad | null {
  return pickFrom(squads.filter(sameNation(current)), open, used);
}

export function hasAnotherTeam(squads: Squad[], current: Squad): boolean {
  return squads.some(sameYear(current));
}

export function hasAnotherCup(squads: Squad[], current: Squad): boolean {
  return squads.some(sameNation(current));
}
