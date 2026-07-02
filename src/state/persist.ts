import { initialState, type GameState } from './gameReducer';

// Persist the whole game so clean-path routes (/group, /knockout) survive a
// refresh and are bookmarkable. One versioned key; bump it on a schema change.
const KEY = 'wcsim:game:v1';

/** Load a persisted game, or null if absent / unreadable / stale. Only the roll
 *  animation flag is reset (no scramble is running right after a load); the drawn
 *  squad and current selection are KEPT, so reloading mid-draft restores the same
 *  squad rather than rolling a fresh one. Nulling them would let a reload act as a
 *  free, unlimited re-roll (bypassing the re-roll limit). If no squad was in hand
 *  (a settle hadn't happened yet), the draw-next-squad effect rolls one as usual.
 *  Merged over `initialState` to tolerate added fields. */
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
