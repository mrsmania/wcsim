import type { Player, Position, Squad } from '../data/types';
import type { Formation, Slot } from './formations';

/** Map of slotId -> placed player (or null/absent if still open). */
export type Filled = Record<string, Player | null>;

// --- placement -------------------------------------------------------------

/** True when the slot is empty and the slot's role is one the player can fill. */
export function canPlace(player: Player, slot: Slot, filled: Filled): boolean {
  return !filled[slot.id] && player.positions.includes(slot.position);
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

/** Average elo of the players placed so far (0 when none). */
export function teamRating(formation: Formation, filled: Filled): number {
  const players = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
  if (players.length === 0) return 0;
  return Math.round(players.reduce((sum, p) => sum + p.elo, 0) / players.length);
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
  return arr[Math.floor(Math.random() * arr.length)];
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

/** "Another team": a different nation from the same tournament year. */
export function rollAnotherTeam(
  squads: Squad[],
  current: Squad,
  open: Set<Position>,
  used: Set<string>,
): Squad | null {
  return pickFrom(
    squads.filter((s) => s.year === current.year && s.id !== current.id),
    open,
    used,
  );
}

/** "Another cup": the same nation at a different World Cup. */
export function rollAnotherCup(
  squads: Squad[],
  current: Squad,
  open: Set<Position>,
  used: Set<string>,
): Squad | null {
  return pickFrom(
    squads.filter((s) => s.code === current.code && s.id !== current.id),
    open,
    used,
  );
}

export function hasAnotherTeam(squads: Squad[], current: Squad): boolean {
  return squads.some((s) => s.year === current.year && s.id !== current.id);
}

export function hasAnotherCup(squads: Squad[], current: Squad): boolean {
  return squads.some((s) => s.code === current.code && s.id !== current.id);
}
