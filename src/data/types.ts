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
  players: Player[];
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
