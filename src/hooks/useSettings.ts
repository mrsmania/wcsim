import { useCallback, useEffect, useState } from 'react';
import type { Difficulty } from '../domain/difficulty';
import { store, type Settings, type Theme } from '../state/store';

export interface SettingsApi {
    settings: Settings;
    setTheme: (t: Theme) => void;
    setDifficulty: (d: Difficulty) => void;
    setPoolYears: (years: number[]) => void;
    setShowFullDraw: (open: boolean) => void;
}

/** Owns the persisted user preferences and applies the theme to the document.
 *  Separate from the game/album/career/run state, so a reset of any of those
 *  never touches settings. `initial` comes from the boot snapshot (main.tsx). */
export function useSettings(initial: Settings): SettingsApi {
    const [settings, setSettings] = useState<Settings>(initial);

    // Persist on any change.
    useEffect(() => {
        void store.saveSettings(settings);
    }, [settings]);

    // Reflect the theme on <html> (the pre-paint script in index.html sets the
    // initial value to avoid a flash; this keeps it in sync on change).
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', settings.theme);
    }, [settings.theme]);

    const setTheme = useCallback((theme: Theme) => setSettings((s) => ({ ...s, theme })), []);
    const setDifficulty = useCallback(
        (difficulty: Difficulty) => setSettings((s) => ({ ...s, difficulty })),
        [],
    );
    const setPoolYears = useCallback(
        (poolYears: number[]) => setSettings((s) => ({ ...s, poolYears })),
        [],
    );
    const setShowFullDraw = useCallback(
        (showFullDraw: boolean) => setSettings((s) => ({ ...s, showFullDraw })),
        [],
    );

    return { settings, setTheme, setDifficulty, setPoolYears, setShowFullDraw };
}
