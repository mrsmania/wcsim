import { emptyAlbum, type AlbumState } from '../domain/album';
import { readJson, removeKeys, writeJson } from './storage/kv';

// The album lives under its own versioned key, separate from the game state
// (`wcsim:game:v1`), so resetting or clearing a run never touches the collection
// (FR-7). This module is the only place that reads or writes these keys.
export const ALBUM_KEY = 'wcsim_album_v1';
export const ALBUM_STATS_KEY = 'wcsim_album_stats_v1';

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
    return readJson(
        ALBUM_KEY,
        (raw) => {
            const parsed = raw as Partial<AlbumState> | null;
            if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.collected)) {
                return emptyAlbum();
            }
            return {
                version: 1 as const,
                collected: parsed.collected,
                duplicates: parsed.duplicates ?? {},
            };
        },
        emptyAlbum(),
    );
}

export function saveAlbum(album: AlbumState): void {
    writeJson(ALBUM_KEY, album);
}

export function loadStats(): AlbumStats {
    return readJson(
        ALBUM_STATS_KEY,
        (raw) => {
            const parsed = raw as Partial<AlbumStats> | null;
            if (!parsed || typeof parsed.runsPlayed !== 'number') return emptyStats();
            return {
                runsPlayed: parsed.runsPlayed,
                stickersEarned: parsed.stickersEarned ?? 0,
                tradesCompleted: parsed.tradesCompleted ?? 0,
            };
        },
        emptyStats(),
    );
}

export function saveStats(stats: AlbumStats): void {
    writeJson(ALBUM_STATS_KEY, stats);
}

/** Wipe the album from storage (collection + trade telemetry), for a manual reset.
 *  The caller resets its in-memory album to `emptyAlbum()`. Leaves the game, career,
 *  and run keys untouched. */
export function clearAlbum(): void {
    removeKeys(ALBUM_KEY, ALBUM_STATS_KEY);
}
