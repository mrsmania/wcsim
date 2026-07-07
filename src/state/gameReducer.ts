import type { Player, Squad } from '../data/types';
import type { Formation, FormationName, Style } from '../domain/formations';
import { canPlace, isComplete, type Filled } from '../domain/draft';
import { recordMatchday, type GroupState, type MatchdayResult } from '../domain/tournament';
import { recordRound, type BracketGame, type BracketState } from '../domain/bracket';
import { isCollectible } from '../domain/album';
import type { MatchSpeed } from '../domain/clock';

export type Phase = 'setup' | 'draft' | 'complete' | 'group' | 'knockout';

/** How the XI is being assembled: rolling random squads ('roll') or hand-picking
 *  from all squads within a budget ('budget'). Both share the same draft state
 *  (`filled`) and the same pitch/ratings/line-up; only the left column differs. */
export type BuildMethod = 'roll' | 'budget';

const INITIAL_REROLLS = 3;
/** Player swaps allowed per game (sticker album feature). Only collectibles can be
 *  swapped in, and only this many times per run. */
const INITIAL_SWAPS = 2;

export interface GameState {
  phase: Phase;
  /** Selected during setup; locked once the draft starts. */
  formationName: FormationName;
  style: Style;
  /** How the current XI is being built. Set when the draft/budget build begins;
   *  gates the roll-only "draw next squad" effect and picks the left-column panel. */
  build: BuildMethod;
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
  /** Whether this run's collectibles have been merged into the sticker album yet.
   *  The run-end condition (group elimination / bracket outcome) is persistent, so
   *  this guards a once-per-run apply that survives a reload. Reset with the run. */
  stickersApplied: boolean;
  /** Remaining collectible swaps this run (sticker album feature). */
  swapsLeft: number;
}

export type Action =
  | { type: 'SET_FORMATION'; name: FormationName }
  | { type: 'SET_STYLE'; style: Style }
  | { type: 'START_DRAFT'; formation: Formation }
  | { type: 'START_BUDGET'; formation: Formation }
  | { type: 'BUY_PLAYER'; slotId: string; player: Player }
  | { type: 'AUTOFILL'; formation: Formation; filled: Filled; usedPersonIds: string[] }
  | { type: 'ROLL_START'; isReroll: boolean }
  | { type: 'ROLL_SETTLE'; squad: Squad }
  | { type: 'SELECT_PLAYER'; playerId: string }
  | { type: 'PLACE_PLAYER'; slotId: string }
  | { type: 'SWAP_PLAYER'; slotId: string }
  | { type: 'REMOVE_PLAYER'; slotId: string }
  | { type: 'START_GROUP'; group: GroupState }
  | { type: 'RECORD_MATCHDAY'; results: MatchdayResult[] }
  | { type: 'START_BRACKET'; bracket: BracketState }
  | { type: 'RECORD_BRACKET_ROUND'; games: BracketGame[] }
  | { type: 'SET_SPEED'; speed: MatchSpeed }
  | { type: 'SET_AUTO'; auto: boolean }
  | { type: 'MARK_STICKERS_APPLIED' }
  | { type: 'RESET' };

export const initialState: GameState = {
  phase: 'setup',
  formationName: '4-3-3',
  style: 'bal',
  build: 'roll',
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
  stickersApplied: false,
  swapsLeft: INITIAL_SWAPS,
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
      return { ...state, phase: 'draft', build: 'roll', formation: action.formation, filled: {} };

    case 'START_BUDGET':
      // Enter the budget build: a draft with no rolling (the "draw next squad"
      // effect is gated on build === 'roll'), sharing the same filled/pitch/panels.
      return {
        ...state,
        phase: 'draft',
        build: 'budget',
        formation: action.formation,
        filled: {},
        usedPersonIds: [],
        currentSquad: null,
        selectedPlayerId: null,
        rolling: false,
      };

    case 'BUY_PLAYER': {
      // Budget build: place a hand-picked player into an eligible open slot. The UI
      // enforces the budget (unaffordable rows are not selectable); the reducer owns
      // the placement rules (position match + one-per-person), mirroring PLACE_PLAYER.
      const { formation, filled } = state;
      const { player } = action;
      const slot = formation?.slots.find((s) => s.id === action.slotId);
      if (!formation || !slot || !canPlace(player, slot, filled)) return state;
      if (state.usedPersonIds.includes(player.personId)) return state;
      const nextFilled: Filled = { ...filled, [slot.id]: player };
      const done = isComplete(formation, nextFilled);
      return {
        ...state,
        filled: nextFilled,
        usedPersonIds: [...state.usedPersonIds, player.personId],
        phase: done ? 'complete' : 'draft',
      };
    }

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

    case 'SWAP_PLAYER': {
      // Replace an already-placed player with the selected player from the current
      // squad. Restricted: only a COLLECTIBLE can be swapped in, only INTO a slot its
      // role fits, and only while swaps remain (INITIAL_SWAPS per run). The outgoing
      // player leaves the XI, freeing their personId; the incoming personId becomes
      // used. Lets a collectible be brought in even when its position was already
      // filled. currentSquad clears like PLACE_PLAYER, so the draw effect rolls the
      // next squad for any still-open slot.
      const { formation, currentSquad, selectedPlayerId, filled } = state;
      const player = currentPlayer(currentSquad, selectedPlayerId);
      const slot = formation?.slots.find((s) => s.id === action.slotId);
      const outgoing = slot ? filled[slot.id] : null;
      // Swap into a filled slot the incoming role fits, when either the occupant is
      // a different person and the incoming isn't already in the XI (a normal swap),
      // OR the occupant is the SAME person (a better/other version - upgrade them in
      // place; a different card, not a no-op). The same-person case can only target
      // the slot that person already sits in, which avoids ever duplicating a person.
      const eligible =
        !!player &&
        !!slot &&
        !!outgoing &&
        state.swapsLeft > 0 &&
        isCollectible(player) &&
        player.positions.includes(slot.position) &&
        (outgoing.personId === player.personId
          ? outgoing.id !== player.id
          : !state.usedPersonIds.includes(player.personId));
      if (!formation || !player || !slot || !outgoing || !eligible) {
        return state; // invalid swap: ignore
      }
      const nextFilled: Filled = { ...filled, [slot.id]: player };
      const done = isComplete(formation, nextFilled);
      return {
        ...state,
        filled: nextFilled,
        usedPersonIds: [
          ...state.usedPersonIds.filter((id) => id !== outgoing.personId),
          player.personId,
        ],
        swapsLeft: state.swapsLeft - 1,
        currentSquad: null,
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

    case 'MARK_STICKERS_APPLIED':
      return { ...state, stickersApplied: true };

    case 'RESET':
      // Keep the display prefs across a reset.
      return { ...initialState, speed: state.speed, auto: state.auto };

    default:
      return state;
  }
}
