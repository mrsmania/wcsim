import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyAlbum, type AlbumState } from '../../domain/album';
import { INITIAL_CAREER, levelForXp, type CareerState } from '../../domain/career';
import { DEFAULT_SETTINGS } from '../settingsStorage';
import type { AccountSnapshot, AlbumStats, Store } from './types';

// ---------------------------------------------------------------------------
// The signed-in implementation of `Store`: the database is the only copy (D8).
// Read once at boot, hold in memory, write through. Nothing is mirrored to
// localStorage, so there is never a second copy to reconcile.
//
// Writes carry the version they last read (FR-11). A rejected version means
// another device moved the account on; `StaleVersionError` is thrown so the app
// can reload rather than overwrite.
// ---------------------------------------------------------------------------

/** Thrown when a write is refused because another device got there first. */
export class StaleVersionError extends Error {
  constructor() {
    super('This account was updated on another device.');
    this.name = 'StaleVersionError';
  }
}

const isStale = (message: string) => message.includes('stale_version');

/** Album rows -> the client's shape: a row means collected, copies-1 are duplicates. */
function albumFromRows(rows: { player_id: string; copies: number }[]): AlbumState {
  const album = emptyAlbum();
  const duplicates: Record<string, number> = {};
  for (const r of rows) {
    album.collected.push(r.player_id);
    if (r.copies > 1) duplicates[r.player_id] = r.copies - 1;
  }
  return { ...album, duplicates };
}

interface CareerRow {
  xp: number;
  prestige: number;
  perk_levels: Record<string, number> | null;
  unlocked_boons: string[] | null;
  ascension: number;
  last_ascension: number | null;
  stats: Partial<CareerState['stats']> | null;
}

function careerFromRow(row: CareerRow | null): CareerState {
  if (!row) return INITIAL_CAREER;
  return {
    version: 2,
    xp: row.xp,
    // Derived, never stored (the same rule the local store follows).
    level: levelForXp(row.xp),
    prestige: row.prestige,
    perkLevels: row.perk_levels ?? {},
    unlockedBoons: row.unlocked_boons ?? [],
    ascension: row.ascension,
    lastAscension: row.last_ascension ?? undefined,
    stats: { ...INITIAL_CAREER.stats, ...(row.stats ?? {}) },
  };
}

function careerToRow(c: CareerState) {
  return {
    xp: c.xp,
    prestige: c.prestige,
    perkLevels: c.perkLevels,
    unlockedBoons: c.unlockedBoons,
    ascension: c.ascension,
    lastAscension: c.lastAscension ?? null,
    stats: c.stats,
  };
}

export function createRemoteStore(client: SupabaseClient, userId: string): Store {
  let cache: AccountSnapshot | null = null;
  let version = 0;

  const peek = (): AccountSnapshot => {
    if (!cache) throw new Error('store.peek() before store.load()');
    return cache;
  };
  const patch = (next: Partial<AccountSnapshot>): void => {
    cache = { ...peek(), ...next };
  };

  /** Run an RPC, translating a rejected version into StaleVersionError. */
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw isStale(error.message) ? new StaleVersionError() : new Error(error.message);
    return data as T;
  };

  const readAlbum = async (): Promise<AlbumState> => {
    const { data, error } = await client
      .from('album_stickers')
      .select('player_id, copies')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return albumFromRows(data ?? []);
  };

  return {
    async load() {
      // One round trip per bucket, issued together.
      const [profile, album, stats, career, settings, game, run] = await Promise.all([
        client.from('profiles').select('state_version').eq('id', userId).maybeSingle(),
        readAlbum(),
        client
          .from('album_stats')
          .select('runs_played, stickers_earned, trades_completed')
          .eq('user_id', userId)
          .maybeSingle(),
        client.from('career').select('*').eq('user_id', userId).maybeSingle(),
        client.from('settings').select('data').eq('user_id', userId).maybeSingle(),
        client.from('game_state').select('data').eq('user_id', userId).maybeSingle(),
        client.from('active_run').select('data').eq('user_id', userId).maybeSingle(),
      ]);

      const firstError = [profile, stats, career, settings, game, run].find((r) => r.error)?.error;
      if (firstError) throw new Error(firstError.message);

      version = profile.data?.state_version ?? 0;
      const s = stats.data;
      cache = {
        game: (game.data?.data as AccountSnapshot['game']) ?? null,
        album,
        albumStats: {
          runsPlayed: s?.runs_played ?? 0,
          stickersEarned: s?.stickers_earned ?? 0,
          tradesCompleted: s?.trades_completed ?? 0,
        } satisfies AlbumStats,
        career: careerFromRow(career.data as CareerRow | null),
        settings: (settings.data?.data as AccountSnapshot['settings']) ?? DEFAULT_SETTINGS,
        run: (run.data?.data as AccountSnapshot['run']) ?? null,
        // Deliberately not stored server-side: a refresh mid-reveal replays the
        // current match, exactly as it does for a guest.
        reveal: null,
      };
      return cache;
    },

    peek,

    async saveGame(game) {
      patch({ game });
      version = await rpc<number>('save_game', {
        p_data: game,
        p_expected_version: version,
      });
    },

    async finishRun({ runKey, collectibleIds, wonCup, cupPickId, swapsUsed, outcome }) {
      const newly = await rpc<string[]>('finish_run', {
        p_run_key: runKey,
        p_collectible_ids: collectibleIds,
        p_won_cup: wonCup,
        p_cup_pick: cupPickId,
        p_swaps_used: swapsUsed,
        p_outcome: outcome,
        p_expected_version: version,
      });
      // The server counted; re-read rather than guess at the result.
      const [album, stats] = await Promise.all([
        readAlbum(),
        client
          .from('album_stats')
          .select('runs_played, stickers_earned, trades_completed')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      version += 1;
      patch({
        album,
        albumStats: {
          runsPlayed: stats.data?.runs_played ?? 0,
          stickersEarned: stats.data?.stickers_earned ?? 0,
          tradesCompleted: stats.data?.trades_completed ?? 0,
        },
        run: null,
      });
      return { album, newly: newly ?? [] };
    },

    async trade(tier, playerId) {
      version = await rpc<number>('execute_trade', {
        p_target_tier: tier,
        p_player_id: playerId,
        p_expected_version: version,
      });
      const album = await readAlbum();
      patch({ album });
      return album;
    },

    async clearAlbum() {
      // Deliberately unsupported for an account: wiping a synced collection from a
      // settings toggle is a bigger decision than a local reset, and it is what
      // account deletion is for. The album screen's reset stays guest-only.
      throw new Error('Resetting the album is not available while signed in.');
    },

    async saveCareer(career) {
      patch({ career });
      version = await rpc<number>('save_career', {
        p_career: careerToRow(career),
        p_expected_version: version,
      });
    },

    async saveSettings(settings) {
      patch({ settings });
      const { error } = await client.rpc('save_settings', { p_data: settings });
      if (error) throw new Error(error.message);
    },

    async saveRun(run) {
      patch(run ? { run } : { run: null, reveal: null });
      version = await rpc<number>('save_run', {
        p_data: run,
        p_expected_version: version,
      });
    },

    async saveReveal(reveal) {
      // Transient by design (see `load`): kept in memory only, never persisted.
      patch({ reveal });
    },

    async importGuest(payload) {
      // One transaction server-side, refused if the account already holds anything.
      // The caller deletes the local copy only after this returns (FR-16a ordering).
      version = await rpc<number>('import_guest_progress', { p_payload: payload });
      cache = null;
      await this.load();
    },
  };
}
