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

const CATEGORY_OF: Record<Position, PositionCategory> = {
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
  /** Holistic strength at the time of that tournament, on a 60-99 scale
   *  (shown in the UI as "rating"). The 1998/2002 squads are partial
   *  placeholders; 2006 onward are researched. */
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
  /** Overall team strength for match simulation, on a 60-99 scale. The
   *  1998/2002 squads are partial placeholders; 2006 onward are researched. */
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

/** Display surname: the last word, plus any leading particles. Index 0 (a lone
 *  first name) is never consumed: single-word names return whole, and the
 *  particle walk stops at `i > 0`. Dots are stripped only when testing a token
 *  against the particle set, not from the returned surname. */
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

/** A player's natural/primary role (positions[0]). */
export function primaryPosition(player: Player): Position {
  return player.positions[0];
}

/** Categories counted as attack in match strength (mirrors match.ts). */
export const ATTACK_CATS: PositionCategory[] = ['MID', 'FWD'];

/** Categories counted as defense in match strength (mirrors match.ts). */
export const DEF_CATS: PositionCategory[] = ['GK', 'DEF'];
