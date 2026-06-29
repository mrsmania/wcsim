// Core domain types. Co-located here (sibling-project convention: types in src/data/types.ts).

/** Specific on-pitch roles. These are exactly the roles the formations use.
 *  DM / CM / AM are distinct central-midfield roles (a CM cannot fill a DM or
 *  AM slot unless the player is also tagged for it). */
export type Position =
  | 'GK'
  | 'LB'
  | 'CB'
  | 'RB'
  | 'DM'
  | 'LM'
  | 'CM'
  | 'RM'
  | 'AM'
  | 'LW'
  | 'RW'
  | 'ST';

/** Coarse grouping used for colour-coding and sorting. */
export type PositionCategory = 'GK' | 'DEF' | 'MID' | 'FWD';

export const CATEGORY_OF: Record<Position, PositionCategory> = {
  GK: 'GK',
  LB: 'DEF',
  CB: 'DEF',
  RB: 'DEF',
  DM: 'MID',
  LM: 'MID',
  CM: 'MID',
  RM: 'MID',
  AM: 'MID',
  LW: 'FWD',
  RW: 'FWD',
  ST: 'FWD',
};

export function categoryOf(pos: Position): PositionCategory {
  return CATEGORY_OF[pos];
}

export interface Player {
  /** Unique within the dataset, `${squadId}-${number}`. */
  id: string;
  /** Identity of the real human, shared across squads (slug of the name). */
  personId: string;
  squadId: string;
  /** Jersey number. */
  number: number;
  name: string;
  /** One or more roles this player is eligible for. */
  positions: Position[];
  /** Approximate skill rating, ~70-95. Placeholder data, not authoritative. */
  elo: number;
}

/** A single national team at one specific World Cup. */
export interface Squad {
  /** `${code.toLowerCase()}-${year}`, e.g. 'bra-1998'. */
  id: string;
  /** Nation identity, shared across years. 3-letter code, e.g. 'BRA'. */
  code: string;
  nation: string;
  /** Tournament year, e.g. 1998. */
  year: number;
  /** Overall team strength for match simulation, ~70-95. */
  rating: number;
  players: Player[];
}

/** Display helper: "RB/RM". */
export function formatPositions(positions: Position[]): string {
  return positions.join('/');
}

/** Surname particles kept with the last name (e.g. "Van der Sar", "de Boer"). */
const NAME_PARTICLES = new Set([
  'de', 'del', 'der', 'den', 'van', 'von', 'di', 'da', 'dos', 'das',
  'do', 'la', 'le', 'el', 'ter', 'ten', 'bin', 'al',
]);

/** Display surname: the last word, plus any leading particles. */
export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full;
  let i = parts.length - 1;
  while (i > 0 && NAME_PARTICLES.has(parts[i - 1].toLowerCase().replace(/\./g, ''))) i--;
  return parts.slice(i).join(' ');
}

/** Category ordering for sorting a squad list GK -> DEF -> MID -> FWD. */
export const CATEGORY_ORDER: PositionCategory[] = ['GK', 'DEF', 'MID', 'FWD'];

/** A player's primary category (from its first listed position). */
export function primaryCategory(player: Player): PositionCategory {
  return categoryOf(player.positions[0]);
}
