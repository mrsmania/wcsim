import { WORLD_CUP_YEARS } from '../data/squads';

/** Light (default) or dark theme. */
export type Theme = 'light' | 'dark';
/** How hard it is to win a tie (lower = the user wins direct duels less often). */
export type Difficulty = 'casual' | 'normal' | 'hard';

/** User preferences. Persisted under their own key, separate from the game / album /
 *  career / run, so resetting any of those never touches these. */
export interface Settings {
    theme: Theme;
    difficulty: Difficulty;
    /** World Cup years the game draws from - the user's squad rolls, the transfer
     *  market, the opponents, and the sticker-album target. Defaults to every year
     *  in the dataset. Never empty (an empty selection falls back to all). */
    poolYears: number[];
}

const KEY = 'wcsim_settings_v1';

export const DEFAULT_SETTINGS: Settings = {
    theme: 'light',
    difficulty: 'normal',
    poolYears: WORLD_CUP_YEARS,
};

/** Load saved preferences, merged over the defaults (tolerant of an absent key,
 *  bad JSON, or added fields). Only years present in the dataset are kept, and an
 *  empty pool falls back to all years. */
export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<Settings> | null;
        if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
        const years = Array.isArray(parsed.poolYears)
            ? parsed.poolYears.filter((y) => WORLD_CUP_YEARS.includes(y))
            : DEFAULT_SETTINGS.poolYears;
        return {
            theme: parsed.theme === 'dark' ? 'dark' : 'light',
            difficulty:
                parsed.difficulty === 'casual' || parsed.difficulty === 'hard'
                    ? parsed.difficulty
                    : 'normal',
            poolYears: years.length ? years : WORLD_CUP_YEARS,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(s: Settings): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* storage unavailable (private mode / quota); prefs just won't persist */
    }
}
