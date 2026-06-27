import type { Player, Squad } from '../data/types';
import type { Formation, FormationName, Style } from '../domain/formations';
import { canPlace, isComplete, type Filled } from '../domain/draft';
import type { GroupState, MatchdayResult } from '../domain/tournament';

export type Phase = 'setup' | 'draft' | 'complete' | 'group';

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
}

export type Action =
  | { type: 'SET_FORMATION'; name: FormationName }
  | { type: 'SET_STYLE'; style: Style }
  | { type: 'START_DRAFT'; formation: Formation }
  | { type: 'ROLL_START' }
  | { type: 'ROLL_SETTLE'; squad: Squad }
  | { type: 'CONSUME_REROLL' }
  | { type: 'SELECT_PLAYER'; playerId: string }
  | { type: 'PLACE_PLAYER'; slotId: string }
  | { type: 'START_GROUP'; group: GroupState }
  | { type: 'RECORD_MATCHDAY'; results: MatchdayResult[] }
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

    case 'ROLL_START':
      return { ...state, rolling: true, selectedPlayerId: null };

    case 'ROLL_SETTLE':
      return { ...state, rolling: false, currentSquad: action.squad };

    case 'CONSUME_REROLL':
      return { ...state, rerollsLeft: Math.max(0, state.rerollsLeft - 1) };

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

    case 'START_GROUP':
      return { ...state, phase: 'group', group: action.group };

    case 'RECORD_MATCHDAY': {
      if (!state.group) return state;
      const md = state.group.matchday;
      const fixtures = state.group.fixtures.map((f) => {
        if (f.matchday !== md) return f;
        const r = action.results.find((x) => x.homeId === f.homeId && x.awayId === f.awayId);
        return r ? { ...f, result: r.result } : f;
      });
      return { ...state, group: { ...state.group, fixtures, matchday: md + 1 } };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
