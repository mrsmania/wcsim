import { WORLD_CUP_YEARS } from '../data/squads';
import type { Difficulty } from '../domain/difficulty';

/** Light (default) or dark theme. */
export type Theme = 'light' | 'dark';

/** User preferences. Persisted under their own key, separate from the game / album /
 *  career / run, so resetting any of those never touches these. */
export interface Settings {
    theme: Theme;
    difficulty: Difficulty;
    /** World Cup years the game draws from - the user's squad rolls, the transfer
     *  market, the opponents, and the sticker-album target. Defaults to every year
     *  in the dataset. Never empty (an empty selection falls back to all). */
    poolYears: readonly number[];
    /** Whether a Cup Run's bracket shows the full 16-team tree rather than just your
     *  own path (the accordion in `RunBracket`). Set by the control itself,
     *  not by the settings sheet: it is a viewing preference, and holding it here is
     *  what stops it re-collapsing every time you navigate back into the run. */
    showFullDraw: boolean;
}

const KEY = 'wcsim_settings_v1';

/** The shape actually WRITTEN to storage, which is not `Settings`.
 *
 *  `poolYears: null` means "every tournament in the dataset", and that is deliberately
 *  NOT the same thing as a list naming every year that exists today. Storing the list
 *  is what broke 1986: a save written before it was added held the nine years 1990-2022,
 *  every one of them still valid, so nothing repaired it - and "every tournament"
 *  silently became "every tournament except 1986", for the album, the squad rolls, the
 *  transfer market and the opponents alike. The next tournament would have done it again.
 *
 *  `v` exists so `normalizeSettings` can tell a save that could express that (v2) from
 *  one that could not (v1, no field). */
export interface StoredSettings {
    v: number;
    theme: Theme;
    difficulty: Difficulty;
    poolYears: readonly number[] | null;
    showFullDraw: boolean;
}

const SHAPE_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
    theme: 'light',
    difficulty: 'normal',
    poolYears: WORLD_CUP_YEARS,
    showFullDraw: false,
};

/** True when `years` already names every tournament in the dataset. */
function coversEveryYear(years: readonly number[]): boolean {
    const set = new Set(years);
    return WORLD_CUP_YEARS.every((y) => set.has(y));
}

/** A stored settings blob (from localStorage or the account server) turned back into
 *  `Settings`. Tolerant of an absent value, a non-object, missing fields and years that
 *  are no longer in the dataset; an empty pool falls back to all years.
 *
 *  **A v1 save gets its whole pool back**, because a v1 save cannot say whether its list
 *  meant "these tournaments" or "all of them". Guessing wrong in one direction costs a
 *  tick-box in the settings sheet; guessing wrong in the other hides a tournament from
 *  the game and never mentions it. */
export function normalizeSettings(raw: unknown): Settings {
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
    // Partial, because this is whatever is in storage or on the server - an old shape, a
    // hand-edited blob, a field this build has never heard of. Every read below guards.
    const stored = raw as Partial<StoredSettings>;
    let poolYears = WORLD_CUP_YEARS;
    if (stored.v === SHAPE_VERSION && Array.isArray(stored.poolYears)) {
        const years = stored.poolYears.filter(
            (y): y is number => typeof y === 'number' && WORLD_CUP_YEARS.includes(y),
        );
        if (years.length) poolYears = years;
    }
    return {
        theme: stored.theme === 'dark' ? 'dark' : 'light',
        difficulty:
            stored.difficulty === 'casual' || stored.difficulty === 'hard'
                ? stored.difficulty
                : 'normal',
        poolYears,
        showFullDraw: stored.showFullDraw === true,
    };
}

/** `Settings` in the shape that gets written. Both stores go through it, so there is one
 *  definition of how a pool selection is recorded - see `StoredSettings`. */
export function toStored(s: Settings): StoredSettings {
    return {
        v: SHAPE_VERSION,
        theme: s.theme,
        difficulty: s.difficulty,
        poolYears: coversEveryYear(s.poolYears) ? null : s.poolYears,
        showFullDraw: s.showFullDraw,
    };
}

/** Load saved preferences (tolerant of an absent key or bad JSON). */
export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT_SETTINGS;
        return normalizeSettings(JSON.parse(raw));
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function saveSettings(s: Settings): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(toStored(s)));
    } catch {
        /* storage unavailable (private mode / quota); prefs just won't persist */
    }
}
