import { initialState, type GameState } from './gameReducer';
import { readJson, writeJson } from './storage/kv';

// Persist the whole game (the build: formation, the XI in progress, the drawn squad)
// so a refresh mid-build resumes it. One versioned key; bump it on a schema change.
//
// This is the one key with colons rather than underscores. Renaming it would orphan
// every saved game for no gain, so it stays as it is - noted here because the
// inconsistency looks like an oversight and is not worth "fixing" (hygiene H88).
export const GAME_KEY = 'wcsim:game:v1';

/** Load a persisted game, or null if absent / unreadable / stale. Only the roll
 *  animation flag is reset (no scramble is running right after a load); the drawn
 *  squad and current selection are KEPT, so reloading mid-draft restores the same
 *  squad rather than rolling a fresh one. Nulling them would let a reload act as a
 *  free, unlimited re-roll (bypassing the re-roll limit). If no squad was in hand
 *  (a settle hadn't happened yet), the draw-next-squad effect rolls one as usual.
 *  Merged over `initialState` to tolerate added fields. */
export function loadGame(): GameState | null {
    return readJson<GameState | null>(
        GAME_KEY,
        (raw) => {
            const parsed = raw as Partial<GameState> | null;
            if (!parsed || typeof parsed !== 'object' || typeof parsed.phase !== 'string')
                return null;
            return { ...initialState, ...parsed, rolling: false };
        },
        null,
    );
}

/** Persist the whole game state. */
export function saveGame(state: GameState): void {
    writeJson(GAME_KEY, state);
}
