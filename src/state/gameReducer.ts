import type { Player, Squad } from '../data/types';
import type { Formation, FormationName, Style } from '../domain/formations';
import { canPlace, isComplete, type Filled } from '../domain/draft';
import { recordMatchday, type GroupState, type MatchdayResult } from '../domain/tournament';
import { recordRound, type BracketGame, type BracketState } from '../domain/bracket';
import type { MatchSpeed } from '../domain/clock';

export type Phase = 'setup' | 'draft' | 'complete' | 'group' | 'knockout';

export const INITIAL_REROLLS = 3;

export interface GameState {
  phase: Phase;
  /** Selected during setup; locked once the draft starts. */
  formationName: FormationName;
  style: Style;
  /** Resolved formation, set when the draft begins. */
  formation: Formation | null;
  /** slotId -> placed player. */
  filled: Filled;
  rolling: boolean;
  currentSquad: Squad | null;
  selectedPlayerId: string | null;
  usedPersonIds: string[];
  rerollsLeft: number;
  /** Group stage, set once the World Cup starts. */
  group: GroupState | null;
  /** Knockout bracket, built when the user enters the knockouts. */
  bracket: BracketState | null;
  /** Match simulation playback speed. */
  speed: MatchSpeed;
  /** "Automatic" playback toggle, shared across group + knockout so it carries over. */
  auto: boolean;
}

export type Action =
  | { type: 'SET_FORMATION'; name: FormationName }
  | { type: 'SET_STYLE'; style: Style }
  | { type: 'START_DRAFT'; formation: Formation }
  | { type: 'AUTOFILL'; formation: Formation; filled: Filled; usedPersonIds: string[] }
  | { type: 'ROLL_START'; isReroll: boolean }
  | { type: 'ROLL_SETTLE'; squad: Squad }
  | { type: 'SELECT_PLAYER'; playerId: string }
  | { type: 'PLACE_PLAYER'; slotId: string }
  | { type: 'REMOVE_PLAYER'; slotId: string }
  | { type: 'START_GROUP'; group: GroupState }
  | { type: 'RECORD_MATCHDAY'; results: MatchdayResult[] }
  | { type: 'START_BRACKET'; bracket: BracketState }
  | { type: 'RECORD_BRACKET_ROUND'; games: BracketGame[] }
  | { type: 'SET_SPEED'; speed: MatchSpeed }
  | { type: 'SET_AUTO'; auto: boolean }
  | { type: 'RESET' };

export const initialState: GameState = {
  phase: 'setup',
  formationName: '4-3-3',
  style: 'bal',
  formation: null,
  filled: {},
  rolling: false,
  currentSquad: null,
  selectedPlayerId: null,
  usedPersonIds: [],
  rerollsLeft: INITIAL_REROLLS,
  group: null,
  bracket: null,
  speed: 'fast',
  auto: false,
};

function currentPlayer(squad: Squad | null, playerId: string | null): Player | null {
  if (!squad || !playerId) return null;
  return squad.players.find((p) => p.id === playerId) ?? null;
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_FORMATION':
      return state.phase === 'setup' ? { ...state, formationName: action.name } : state;

    case 'SET_STYLE':
      return state.phase === 'setup' ? { ...state, style: action.style } : state;

    case 'START_DRAFT':
      return { ...state, phase: 'draft', formation: action.formation, filled: {} };

    case 'AUTOFILL':
      return {
        ...state,
        phase: 'complete',
        formation: action.formation,
        filled: action.filled,
        usedPersonIds: action.usedPersonIds,
        currentSquad: null,
        selectedPlayerId: null,
        rolling: false,
      };

    case 'ROLL_START':
      return {
        ...state,
        rolling: true,
        selectedPlayerId: null,
        rerollsLeft: action.isReroll ? Math.max(0, state.rerollsLeft - 1) : state.rerollsLeft,
      };

    case 'ROLL_SETTLE':
      return { ...state, rolling: false, currentSquad: action.squad };

    case 'SELECT_PLAYER':
      return { ...state, selectedPlayerId: action.playerId };

    case 'PLACE_PLAYER': {
      const { formation, currentSquad, selectedPlayerId, filled } = state;
      const player = currentPlayer(currentSquad, selectedPlayerId);
      const slot = formation?.slots.find((s) => s.id === action.slotId);
      if (!formation || !player || !slot || !canPlace(player, slot, filled)) {
        return state; // invalid placement: ignore
      }
      const nextFilled: Filled = { ...filled, [slot.id]: player };
      const done = isComplete(formation, nextFilled);
      return {
        ...state,
        filled: nextFilled,
        usedPersonIds: [...state.usedPersonIds, player.personId],
        currentSquad: null, // component draws the next squad unless complete
        selectedPlayerId: null,
        phase: done ? 'complete' : 'draft',
      };
    }

    case 'REMOVE_PLAYER': {
      // Testing aid: clear a placed slot, free the person to be drafted again, and
      // drop back to drafting (the XI is no longer complete).
      if (state.phase !== 'draft' && state.phase !== 'complete') return state;
      const player = state.filled[action.slotId];
      if (!player) return state;
      const nextFilled: Filled = { ...state.filled };
      delete nextFilled[action.slotId];
      return {
        ...state,
        filled: nextFilled,
        usedPersonIds: state.usedPersonIds.filter((id) => id !== player.personId),
        phase: 'draft',
      };
    }

    case 'START_GROUP':
      return { ...state, phase: 'group', group: action.group };

    case 'RECORD_MATCHDAY':
      return state.group
        ? { ...state, group: recordMatchday(state.group, action.results) }
        : state;

    case 'START_BRACKET':
      return { ...state, phase: 'knockout', bracket: action.bracket };

    case 'RECORD_BRACKET_ROUND':
      return state.bracket
        ? { ...state, bracket: recordRound(state.bracket, action.games) }
        : state;

    case 'SET_SPEED':
      return { ...state, speed: action.speed };

    case 'SET_AUTO':
      return { ...state, auto: action.auto };

    case 'RESET':
      return { ...initialState, speed: state.speed, auto: state.auto };

    default:
      return state;
  }
}
