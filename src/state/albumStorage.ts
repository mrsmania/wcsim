import { emptyAlbum, type AlbumState } from '../domain/album';

// The album lives under its own versioned key, separate from the game state
// (`wcsim:game:v1`), so resetting or clearing a run never touches the collection
// (FR-7). This module is the only place that reads or writes these keys.
const ALBUM_KEY = 'wcsim_album_v1';
const STATS_KEY = 'wcsim_album_stats_v1';

/** Lightweight telemetry for calibrating the trade costs (D-5). Inspect in the
 *  browser console after a few dozen runs. */
export interface AlbumStats {
    runsPlayed: number;
    /** New (non-duplicate) stickers earned from drafting + cup picks. */
    stickersEarned: number;
    tradesCompleted: number;
}

function emptyStats(): AlbumStats {
    return { runsPlayed: 0, stickersEarned: 0, tradesCompleted: 0 };
}

/** Load the stored album, or an empty default. Never throws (bad/missing data ->
 *  empty). No migration needed for v1; add one here when the schema changes. */
export function loadAlbum(): AlbumState {
    try {
        const raw = localStorage.getItem(ALBUM_KEY);
        if (!raw) return emptyAlbum();
        const parsed = JSON.parse(raw) as Partial<AlbumState> | null;
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.collected)) {
            return emptyAlbum();
        }
        return {
            version: 1,
            collected: parsed.collected,
            duplicates: parsed.duplicates ?? {},
        };
    } catch {
        return emptyAlbum();
    }
}

export function saveAlbum(album: AlbumState): void {
    try {
        localStorage.setItem(ALBUM_KEY, JSON.stringify(album));
    } catch {
        /* storage unavailable (private mode / quota); the album just won't persist */
    }
}

export function loadStats(): AlbumStats {
    try {
        const raw = localStorage.getItem(STATS_KEY);
        if (!raw) return emptyStats();
        const parsed = JSON.parse(raw) as Partial<AlbumStats> | null;
        if (!parsed || typeof parsed.runsPlayed !== 'number') return emptyStats();
        return {
            runsPlayed: parsed.runsPlayed,
            stickersEarned: parsed.stickersEarned ?? 0,
            tradesCompleted: parsed.tradesCompleted ?? 0,
        };
    } catch {
        return emptyStats();
    }
}

export function saveStats(stats: AlbumStats): void {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
        /* ignore */
    }
}

/** Wipe the album from storage (collection + trade telemetry), for a manual reset.
 *  The caller resets its in-memory album to `emptyAlbum()`. Leaves the game, career,
 *  and run keys untouched. */
export function clearAlbum(): void {
    try {
        localStorage.removeItem(ALBUM_KEY);
        localStorage.removeItem(STATS_KEY);
    } catch {
        /* ignore */
    }
}
