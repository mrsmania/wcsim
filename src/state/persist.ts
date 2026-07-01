import { initialState, type GameState } from './gameReducer';

// Persist the whole game so clean-path routes (/group, /knockout) survive a
// refresh and are bookmarkable. One versioned key; bump it on a schema change.
const KEY = 'wcsim:game:v1';

/** Load a persisted game, or null if absent / unreadable / stale. Transient draft
 *  fields are reset so a restore mid-draft re-rolls cleanly instead of resuming a
 *  half-finished roll animation. Merged over `initialState` to tolerate added fields. */
export function loadGame(): GameState | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<GameState> | null;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.phase !== 'string') return null;
        return {
            ...initialState,
            ...parsed,
            rolling: false,
            currentSquad: null,
            selectedPlayerId: null,
        };
    } catch {
        return null;
    }
}

/** Persist the whole game state. */
export function saveGame(state: GameState): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
        /* storage unavailable (private mode / quota); the game just won't persist */
    }
}
