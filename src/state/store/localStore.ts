import { loadGame, saveGame } from '../persist';
import { clearAlbum, loadAlbum, loadStats, saveAlbum, saveStats } from '../albumStorage';
import { loadCareer, saveCareer } from '../careerStorage';
import {
  clearReveal,
  clearRun,
  loadReveal,
  loadRun,
  saveReveal,
  saveRun,
} from '../runStorage';
import { loadSettings, saveSettings } from '../settingsStorage';
import { applyRunStickers, executeTrade, pendingNewStickers } from '../../domain/album';
import type { AlbumStats } from '../albumStorage';
import type { AccountSnapshot, Store } from './types';

// ---------------------------------------------------------------------------
// The localStorage implementation of `Store`: guest storage, i.e. what the app
// has always done. It deliberately delegates to the existing per-key modules
// rather than reimplementing them, so all the tolerant parsing and migration
// (career v1 -> v2, game merged over initialState, run field defaults, settings
// clamping) is the same code it always was.
// ---------------------------------------------------------------------------

/** Guest keys, for the one-time move into an account (FR-16a). Listed here because
 *  this module is the only place that knows what "the guest's data" consists of. */
const GUEST_KEYS = [
  'wcsim:game:v1',
  'wcsim_album_v1',
  'wcsim_album_stats_v1',
  'wcsim_career_v1',
  'wcsim_run_v1',
  'wcsim_run_reveal_v1',
];

/** Is there any guest progress on this device worth importing? Settings alone do not
 *  count: they are preferences, not progress. */
export function hasGuestData(): boolean {
  try {
    return GUEST_KEYS.some((k) => localStorage.getItem(k) !== null);
  } catch {
    return false;
  }
}

/**
 * Delete the guest copy, which makes the first-login import a MOVE rather than a copy
 * (FR-16a). Only ever called AFTER the server has confirmed the import, so a failure
 * can never destroy the only copy. Settings are left alone: they are superseded by
 * the account's own, and a later guest session may as well keep its preferences.
 */
export function clearGuestData(): void {
  try {
    for (const k of GUEST_KEYS) localStorage.removeItem(k);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}

export function createLocalStore(): Store {
  let cache: AccountSnapshot | null = null;

  const peek = (): AccountSnapshot => {
    if (!cache) {
      throw new Error('store.peek() before store.load(): load once at boot (see main.tsx)');
    }
    return cache;
  };

  /** Replace the cache with a patched copy (never mutated in place, so a holder of
   *  an earlier snapshot keeps the values it was given). */
  const patch = (next: Partial<AccountSnapshot>): void => {
    cache = { ...peek(), ...next };
  };

  return {
    async load() {
      const run = loadRun();
      cache = {
        game: loadGame(),
        album: loadAlbum(),
        albumStats: loadStats(),
        career: loadCareer(),
        settings: loadSettings(),
        run,
        // A reveal only means anything with a run in hand, so a stale one is dropped.
        reveal: run ? loadReveal() : null,
      };
      return cache;
    },

    peek,

    async saveGame(game) {
      patch({ game });
      saveGame(game);
    },

    // Guest banking: compute with the pure album helpers and write. The signed-in
    // implementation sends the same facts to the server and lets IT count, which is
    // why this lives behind the interface rather than in the album hook.
    async finishRun({ collectibleIds, wonCup, cupPickId }) {
      const { album, albumStats } = peek();
      const ids = cupPickId ? [...collectibleIds, cupPickId] : collectibleIds;
      const newly = pendingNewStickers(album, ids);
      const next = applyRunStickers(album, collectibleIds, wonCup, cupPickId);
      const stats: AlbumStats = {
        runsPlayed: albumStats.runsPlayed + 1,
        stickersEarned: albumStats.stickersEarned + newly.length,
        tradesCompleted: albumStats.tradesCompleted,
      };
      patch({ album: next, albumStats: stats });
      saveAlbum(next);
      saveStats(stats);
      return { album: next, newly };
    },

    async trade(tier, playerId) {
      const { album, albumStats } = peek();
      const next = executeTrade(album, tier, playerId);
      const stats: AlbumStats = {
        ...albumStats,
        tradesCompleted: albumStats.tradesCompleted + 1,
      };
      patch({ album: next, albumStats: stats });
      saveAlbum(next);
      saveStats(stats);
      return next;
    },

    async clearAlbum() {
      clearAlbum();
      // Re-read rather than construct the empties, so the cache cannot disagree with
      // what a reload would produce.
      patch({ album: loadAlbum(), albumStats: loadStats() });
    },

    async saveCareer(career) {
      patch({ career });
      saveCareer(career);
    },

    async saveSettings(settings) {
      patch({ settings });
      saveSettings(settings);
    },

    async saveRun(run) {
      if (run) {
        patch({ run });
        saveRun(run);
        return;
      }
      // Dropping the run drops its reveal too, so a stale reveal cannot outlive it.
      clearRun();
      patch({ run: null, reveal: null });
    },

    async saveReveal(reveal) {
      patch({ reveal });
      if (reveal) saveReveal(reveal);
      else clearReveal();
    },
  };
}
