import type { Player, Squad } from '../data/types';
import type { Formation, FormationName, Style } from '../domain/formations';
import { canPlace, isComplete, planMove, type Filled } from '../domain/draft';
import { canSwapInto } from '../domain/album';
import type { MatchSpeed } from '../domain/clock';

export type Phase = 'setup' | 'draft' | 'complete';

/** How the XI is being assembled: rolling random squads ('roll') or hand-picking
 *  from all squads within a budget ('budget'). Both share the same draft state
 *  (`filled`) and the same pitch/ratings/line-up; only the left column differs. */
export type BuildMethod = 'roll' | 'budget';

// The two draft allowances now live in config.ts, so `domain/` and the server seed can read
// them without importing the state layer (the layering runs domain -> state). Imported and
// re-exported here because this is where the reducer's own call sites expect them.
import { INITIAL_REROLLS, INITIAL_SWAPS } from '../config';
export { INITIAL_REROLLS, INITIAL_SWAPS };

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
  /** Match simulation playback speed. */
  speed: MatchSpeed;
  /** Remaining collectible swaps this run (sticker album feature). */
  swapsLeft: number;
}

export type Action =
  | { type: 'SET_FORMATION'; name: FormationName }
  | { type: 'SET_STYLE'; style: Style }
  | {
      type: 'START_DRAFT';
      formation: Formation;
      /** Extra re-rolls on top of INITIAL_REROLLS (the Extra Re-roll perk's tier). */
      extraRerolls?: number;
    }
  | { type: 'START_BUDGET'; formation: Formation }
  | { type: 'BUY_PLAYER'; slotId: string; player: Player }
  | {
      type: 'AUTOFILL';
      formation: Formation;
      filled: Filled;
      usedPersonIds: string[];
    }
  | { type: 'ROLL_START'; isReroll: boolean }
  | { type: 'ROLL_SETTLE'; squad: Squad }
  // `null` clears the selection (picking a placed player up for a move does that).
  | { type: 'SELECT_PLAYER'; playerId: string | null }
  | { type: 'PLACE_PLAYER'; slotId: string }
  | { type: 'SWAP_PLAYER'; slotId: string }
  | { type: 'REMOVE_PLAYER'; slotId: string }
  | { type: 'MOVE_PLAYER'; fromSlotId: string; toSlotId: string }
  | { type: 'SET_SPEED'; speed: MatchSpeed }
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
  speed: 'fast',
  swapsLeft: INITIAL_SWAPS,
};

function currentPlayer(squad: Squad | null, playerId: string | null): Player | null {
  if (!squad || !playerId) return null;
  return squad.players.find((p) => p.id === playerId) ?? null;
}


/** The tail every placement action shares: write the player into the slot, update the
 *  used-person list, and recompute the phase from whether the XI is now complete. Three
 *  cases below ended in the same three steps (hygiene H64).
 *
 *  `freeing` is the personId leaving the XI, which only a swap has. `clearDrawn` is the
 *  one asymmetry, and it is a parameter rather than an accident: placing and swapping clear
 *  the drawn squad and the held card so the draw effect rolls the next squad, while BUYING
 *  does neither because the budget build has no drawn squad to clear.
 *
 *  Each case keeps its OWN guards. This is only the tail. */
function place(
  state: GameState,
  formation: Formation,
  slot: { id: string },
  player: Player,
  opts: { freeing?: string; clearDrawn: boolean },
): GameState {
  const filled: Filled = { ...state.filled, [slot.id]: player };
  const kept = opts.freeing
    ? state.usedPersonIds.filter((id) => id !== opts.freeing)
    : state.usedPersonIds;
  return {
    ...state,
    filled,
    usedPersonIds: [...kept, player.personId],
    ...(opts.clearDrawn ? { currentSquad: null, selectedPlayerId: null } : {}),
    phase: isComplete(formation, filled) ? 'complete' : 'draft',
  };
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_FORMATION':
      return state.phase === 'setup' ? { ...state, formationName: action.name } : state;

    case 'SET_STYLE':
      return state.phase === 'setup' ? { ...state, style: action.style } : state;

    case 'START_DRAFT':
      return {
        ...state,
        phase: 'draft',
        build: 'roll',
        formation: action.formation,
        filled: {},
        // Set here rather than left at the initial value: a draft can start without a
        // reset in between, and the perk that tops it up is read per draft.
        rerollsLeft: INITIAL_REROLLS + Math.max(0, action.extraRerolls ?? 0),
      };

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
      // No `clearDrawn`: the budget build has no drawn squad or held card to clear.
      return place(state, formation, slot, player, { clearDrawn: false });
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
      // Clears the drawn squad, so the draw effect rolls the next one unless complete.
      return place(state, formation, slot, player, { clearDrawn: true });
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
        canSwapInto(player, outgoing, slot.position, new Set(state.usedPersonIds));
      if (!formation || !player || !slot || !outgoing || !eligible) {
        return state; // invalid swap: ignore
      }
      return {
        ...place(state, formation, slot, player, {
          freeing: outgoing.personId,
          clearDrawn: true,
        }),
        swapsLeft: state.swapsLeft - 1,
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

    case 'MOVE_PLAYER': {
      // Shift an already-placed player to another of his roles. `planMove` owns the rule
      // and hands back the whole resulting placement, because a move is not always two
      // players: where nobody can trade pairwise, a rotation of three or more can still
      // be legal, and then everyone on that chain shifts one place round.
      //
      // The XI keeps the same eleven people whatever the shape, so usedPersonIds and the
      // phase are both untouched (the count cannot change).
      //
      // The player objects are moved AS THEY ARE. Nothing here writes back a copy with
      // its positions reordered - that is what would make a player's range shrink each
      // time he moved (see planMove).
      if (state.phase !== 'draft' && state.phase !== 'complete') return state;
      const { formation, filled } = state;
      const moved = formation
        ? planMove(formation, filled, action.fromSlotId, action.toSlotId)
        : null;
      if (!moved) return state; // invalid move: ignore
      return { ...state, filled: moved };
    }

    case 'SET_SPEED':
      return { ...state, speed: action.speed };

    case 'RESET':
      // Keep the display prefs across a reset.
      return { ...initialState, speed: state.speed };

    default:
      return state;
  }
}
