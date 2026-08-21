import { WORLD_CUP_YEARS } from '../data/squads';
import type { Difficulty } from '../domain/difficulty';

/** Light (default) or dark theme. */
export type Theme = 'light' | 'dark';
export type { Difficulty };

/** User preferences. Persisted under their own key, separate from the game / album /
 *  career / run, so resetting any of those never touches these. */
export interface Settings {
    theme: Theme;
    difficulty: Difficulty;
    /** World Cup years the game draws from - the user's squad rolls, the transfer
     *  market, the opponents, and the sticker-album target. Defaults to every year
     *  in the dataset. Never empty (an empty selection falls back to all). */
    poolYears: number[];
    /** Whether a Cup Run's bracket shows the full 16-team draw rather than just your
     *  own path (the "Your path" accordion in `RunBracket`). Set by the control itself,
     *  not by the settings sheet: it is a viewing preference, and holding it here is
     *  what stops it re-collapsing every time you navigate back into the run. */
    showFullDraw: boolean;
}

const KEY = 'wcsim_settings_v1';

export const DEFAULT_SETTINGS: Settings = {
    theme: 'light',
    difficulty: 'normal',
    poolYears: WORLD_CUP_YEARS,
    showFullDraw: false,
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
            showFullDraw: parsed.showFullDraw === true,
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
