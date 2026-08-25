import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyAlbum, type AlbumState } from '../../domain/album';
import { INITIAL_CAREER, levelForXp, type CareerState } from '../../domain/career';
import { normalizeSettings, toStored } from '../settingsStorage';
import type { AccountSnapshot, AlbumStats, FinishRunResult, Store } from './types';

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
class StaleVersionError extends Error {
  constructor() {
    super('This account was updated on another device.');
    this.name = 'StaleVersionError';
  }
}

const isStale = (message: string) => message.includes('stale_version');

/** A failed RPC, keeping PostgREST's code so callers can tell WHY it failed. */
class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

/** PostgREST answers a call to a function it cannot find with PGRST202, and does so
 *  BEFORE reaching Postgres - nothing ran. That is what makes falling back to the older
 *  function safe: the run key has not been claimed, so the retry is a first attempt and
 *  not a double submit. Any other failure is a real one and must not be retried. */
const isMissingFunction = (err: unknown) =>
  err instanceof RpcError &&
  (err.code === 'PGRST202' || /could not find the function/i.test(err.message));

/** A pre-0012 server refusing a cup pick the album already holds (a full album, where
 *  the reward is a duplicate by design). Its `raise` aborts the transaction, so nothing
 *  was written and the same run key can be submitted again - see `finishRun`. */
const isDuplicateCupPick = (err: unknown) =>
  err instanceof RpcError && /cup pick .* is already collected/.test(err.message);

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

/** What `finish_run_v2` hands back: the newly-collected ids plus the three things the
 *  client used to fetch in two further round trips (migration 0010). */
interface FinishRunPayload {
  newly: string[];
  version: number;
  album: { player_id: string; copies: number }[];
  stats: { runs_played: number; stickers_earned: number; trades_completed: number } | null;
}

interface CareerRow {
  xp: number;
  prestige: number;
  perk_levels: Record<string, number> | null;
  unlocked_boons: string[] | null;
  ascension: number;
  last_ascension: number | null;
  /** Absent on a server that has not had migration 0011 applied: challenge progress
   *  then simply does not persist for that account, and nothing else is affected. */
  completed_challenges?: string[] | null;
  stats: Partial<CareerState['stats']> | null;
}

/** The `album_stats` row as the app holds it. Written out three times before, once per
 *  read path (boot, the one-trip bank, the fallback bank). */
function albumStatsFromRow(
  row: { runs_played: number; stickers_earned: number; trades_completed: number } | null | undefined,
): AlbumStats {
  return {
    runsPlayed: row?.runs_played ?? 0,
    stickersEarned: row?.stickers_earned ?? 0,
    tradesCompleted: row?.trades_completed ?? 0,
  };
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
    completedChallenges: row.completed_challenges ?? [],
    stats: { ...INITIAL_CAREER.stats, ...(row.stats ?? {}) },
  };
}

/** The jsonb payload `save_career` takes. camelCase BY CONTRACT with that function, which
 *  is why it has its own name rather than being inferred: the reading side (`CareerRow`) is
 *  typed, and this had nothing recording that the two are deliberately different shapes
 *  (verified against migration 0011). A key the function does not know is silently dropped,
 *  so a typo here loses data without failing (hygiene H76). */
interface CareerPayload {
  xp: number;
  prestige: number;
  perkLevels: Record<string, number>;
  unlockedBoons: string[];
  ascension: number;
  lastAscension: number | null;
  completedChallenges: string[];
  stats: CareerState['stats'];
}

function careerToRow(c: CareerState): CareerPayload {
  return {
    xp: c.xp,
    prestige: c.prestige,
    perkLevels: c.perkLevels,
    unlockedBoons: c.unlockedBoons,
    ascension: c.ascension,
    lastAscension: c.lastAscension ?? null,
    completedChallenges: c.completedChallenges,
    stats: c.stats,
  };
}

export function createRemoteStore(client: SupabaseClient, userId: string): Store {
  let cache: AccountSnapshot | null = null;
  let version = 0;
  /** Whether this server has migration 0010's one-trip bank. Assumed yes, and turned
   *  off for the session the first time it answers "no such function" - the client is
   *  deployed by pushing to main and the migration is applied by hand on the NAS, so the
   *  two are never in lockstep and neither order may break banking. */
  let hasFinishRunV2 = true;

  const peek = (): AccountSnapshot => {
    if (!cache) throw new Error('store.peek() before store.load()');
    return cache;
  };
  const patch = (next: Partial<AccountSnapshot>): void => {
    cache = { ...peek(), ...next };
  };

  /** Turn a Supabase error into ours, keeping what the caller might branch on: a stale
   *  version becomes `StaleVersionError` so the write path can re-read and retry, and
   *  anything else keeps its `code`.
   *
   *  Four sites used to differ on this. `rpc` mapped both; `rpcPlain`, `readVersion` and
   *  `readAlbum` threw a bare `Error(message)` and lost the code and the stale mapping - so
   *  `moveGuestProgressIn`, which goes through `rpcPlain`, could not tell "the account
   *  already holds something" from a dropped connection (hygiene H75). */
  const wrapError = (error: { message: string; code?: string }): Error =>
    isStale(error.message) ? new StaleVersionError() : new RpcError(error.message, error.code);

  /** Read the account's current version straight from the server. */
  const readVersion = async (): Promise<number> => {
    const { data, error } = await client
      .from('profiles')
      .select('state_version')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw wrapError(error);
    return data?.state_version ?? 0;
  };

  // Writes are SERIALIZED through this chain. The app fires several independent ones
  // (game state on every reducer change, run state per round, career, banking a run),
  // and each carries the version it last read - so two in flight at once means the
  // second is stale by construction. Queueing them removes that entirely; the version
  // check then only ever catches what it is for, another device.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    // Keep the chain alive whatever happens to this link.
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  /**
   * Run a version-checked RPC. Queued, and on a conflict it re-reads the version and
   * tries once more: that covers a version this client had merely lost track of (a
   * write it did not make, a settings save, a reload elsewhere) without silently
   * papering over a genuine other-device conflict, which fails on the retry too.
   */
  const rpc = <T>(name: string, args: Record<string, unknown>): Promise<T> =>
    serialize(async () => {
      const call = async (v: unknown) => {
        const { data, error } = await client.rpc(name, { ...args, p_expected_version: v });
        if (error) throw wrapError(error);
        return data as T;
      };
      try {
        return await call(version);
      } catch (err) {
        if (!(err instanceof StaleVersionError)) throw err;
        version = await readVersion();
        return await call(version);
      }
    });

  /** For calls with no version check (settings). Still queued, so ordering holds. */
  const rpcPlain = <T>(name: string, args: Record<string, unknown>): Promise<T> =>
    serialize(async () => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw wrapError(error);
      return data as T;
    });

  const readAlbum = async (): Promise<AlbumState> => {
    const { data, error } = await client
      .from('album_stickers')
      .select('player_id, copies')
      .eq('user_id', userId);
    if (error) throw wrapError(error);
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
      cache = {
        game: (game.data?.data as AccountSnapshot['game']) ?? null,
        album,
        albumStats: albumStatsFromRow(stats.data),
        career: careerFromRow(career.data as CareerRow | null),
        // Through the same normaliser a guest's blob goes through, not cast straight
        // across: the account row is jsonb the client wrote, so it carries the same
        // stale-pool problem (and the same tolerance needs) as localStorage.
        settings: normalizeSettings(settings.data?.data),
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
      version = await rpc<number>('save_game', { p_data: game });
    },

    async finishRun({ runKey, collectibleIds, wonCup, cupPickId, swapsUsed, outcome }) {
      const bank = async (args: Record<string, unknown>): Promise<FinishRunResult> => {
        // One round trip (migration 0010). Banking used to cost three - the call, then a
        // version read, then the album + stats - and that multiplier, not the function
        // (1-9 ms) or the release timer, is what made a finished run sit for a second or
        // two. finish_run_v2 returns everything those reads were for, computed inside the
        // same transaction, so the "server counted, do not guess" rule is unchanged.
        if (hasFinishRunV2) {
          try {
            const p = await rpc<FinishRunPayload>('finish_run_v2', args);
            // Keep the old value if the payload somehow lacks one: the next write then
            // fails as stale and the rpc retry re-reads it, rather than sending undefined.
            version = p.version ?? version;
            const album = albumFromRows(p.album ?? []);
            // Keep the PREVIOUS counters when the payload omits them, the same way the
            // version two lines up is kept and for the same reason - zeroing a cache the
            // server did not speak to would make the next screen read as a fresh account
            // (hygiene H76).
            patch({
              album,
              albumStats: p.stats ? albumStatsFromRow(p.stats) : peek().albumStats,
            });
            return { album, newly: p.newly ?? [] };
          } catch (err) {
            if (!isMissingFunction(err)) throw err;
            // A server that has not had 0010 applied yet. Nothing ran (see
            // isMissingFunction), so the older call below is a first attempt, and this
            // client stops asking for the rest of the session.
            hasFinishRunV2 = false;
          }
        }

        const newly = await rpc<string[]>('finish_run', args);
        // The server counted; re-read rather than guess at the result. Its version comes
        // back too, since a retry inside the call may have moved it.
        version = await readVersion();
        const [album, stats] = await Promise.all([
          readAlbum(),
          client
            .from('album_stats')
            .select('runs_played, stickers_earned, trades_completed')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);
        patch({ album, albumStats: albumStatsFromRow(stats.data) });
        return { album, newly: newly ?? [] };
      };

      const args = {
        p_run_key: runKey,
        p_collectible_ids: collectibleIds,
        p_won_cup: wonCup,
        p_cup_pick: cupPickId,
        p_swaps_used: swapsUsed,
        p_outcome: outcome,
      };

      let banked: FinishRunResult;
      try {
        banked = await bank(args);
      } catch (err) {
        // A cup pick the album already holds is legal - with nothing left to collect the
        // reward IS a duplicate (album spec FR-3) - but a server without migration 0012
        // refuses it and loses the whole bank. So submit the pick as one more of the
        // run's collectibles instead: those are added copy by copy with no
        // already-collected check, which is exactly what a duplicate needs, and 11 + 1
        // still fits the server's cap of 12. Safe as a retry because the refusal aborted
        // the transaction, so the run key it claimed was rolled back with it.
        if (!isDuplicateCupPick(err) || !cupPickId || collectibleIds.length >= 12) throw err;
        banked = await bank({
          ...args,
          p_cup_pick: null,
          p_collectible_ids: [...collectibleIds, cupPickId],
        });
      }

      // Put the run back. `finish_run` clears `active_run` server-side - reasonably, the
      // run is over - but the client still needs it: the run-end screen has to survive a
      // reload until the player picks "New run" or walks away, and without this a
      // signed-in reload found no run and dropped back to the build page. A guest never
      // had the problem (`localStore.finishRun` does not touch the run), so writing it
      // back is what makes the two worlds behave the same rather than a special case.
      //
      // It also covers a case that has nothing to do with the run that just ended: the
      // standard World Cup banks through here too, and clearing `active_run` for it wiped
      // an unrelated Cup Run that was still in flight (both can be live at once).
      // Read after the bank, not before: the cache holds the run with its
      // once-per-run `stickersApplied` flag already set by then (the screen sets it in
      // the same effect that reports the end, and a child's effect runs before the
      // parent's), and writing back an UNflagged run would let a reload bank it a
      // second time.
      const heldRun = peek().run;
      if (heldRun) version = await rpc<number>('save_run', { p_data: heldRun });
      return banked;
    },

    async trade(tier, playerId) {
      version = await rpc<number>('execute_trade', {
        p_target_tier: tier,
        p_player_id: playerId,
      });
      const album = await readAlbum();
      patch({ album });
      return album;
    },

    async clearAlbum() {
      // Deliberately unsupported for an account: wiping a synced collection from a
      // settings toggle is a bigger decision than a local reset, and it is what account
      // deletion is for.
      //
      // This throw is now a backstop rather than the gate. It used to be the only thing
      // saying no, while claiming a guest-only reset that was not implemented anywhere -
      // so the album screen offered the button to everyone, and since a failed write while
      // signed in is the blocking unreachable state (D9), refusing here showed the player a
      // server error for a request that never left the browser.
      // `useStickerAlbum`'s `canResetAlbum` is the real gate, and it hides that footer.
      // (A difficulty change used to come through here too; that rule is gone - item 24.)
      throw new Error('Resetting the album is not available while signed in.');
    },

    async saveCareer(career) {
      patch({ career });
      version = await rpc<number>('save_career', { p_career: careerToRow(career) });
    },

    async saveSettings(settings) {
      patch({ settings });
      await rpcPlain('save_settings', { p_data: toStored(settings) });
    },

    async saveRun(run) {
      patch(run ? { run } : { run: null, reveal: null });
      version = await rpc<number>('save_run', { p_data: run });
    },

    async saveReveal(reveal) {
      // Transient by design (see `load`): kept in memory only, never persisted.
      patch({ reveal });
    },

    async importGuest(payload) {
      // One transaction server-side, refused if the account already holds anything.
      // The caller deletes the local copy only after this returns (FR-16a ordering).
      // No version check on this one, so it goes through the plain path.
      await rpcPlain('import_guest_progress', { p_payload: payload });
      cache = null;
      await this.load();
    },
  };
}
