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
import type { AccountSnapshot, Store } from './types';

// ---------------------------------------------------------------------------
// The localStorage implementation of `Store`: guest storage, i.e. what the app
// has always done. It deliberately delegates to the existing per-key modules
// rather than reimplementing them, so all the tolerant parsing and migration
// (career v1 -> v2, game merged over initialState, run field defaults, settings
// clamping) is the same code it always was.
// ---------------------------------------------------------------------------

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

    async saveAlbum(album, stats) {
      patch({ album, albumStats: stats });
      saveAlbum(album);
      saveStats(stats);
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
