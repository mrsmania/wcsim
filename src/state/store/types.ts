import type { GameState } from '../gameReducer';
import type { AlbumState } from '../../domain/album';
import type { CareerState } from '../../domain/career';
import type { RunState } from '../../domain/run';
import type { AlbumStats } from '../albumStorage';
import type { Settings } from '../settingsStorage';
// Type-only (erased at build) so the store keeps no runtime dependency on the
// component layer; `Reveal` is a plain-data view-model over domain types.
import type { Reveal } from '../../components/cupRun/types';

// ---------------------------------------------------------------------------
// The persistence seam. Everything the app persists goes through one `Store`,
// so where it is stored is a single decision instead of five import sites.
// Today there is exactly one implementation (localStorage, unchanged); an
// account-backed one lands behind it later. See docs/cloud-sync-design.md.
//
// Why async: the local implementation resolves immediately, but the signatures
// are promises so a remote implementation can slot in without touching call
// sites a second time. Loads happen ONCE, before the first render (main.tsx);
// afterwards the store holds the latest values in memory, so components that
// re-read on navigation stay synchronous (`peek`).
// ---------------------------------------------------------------------------

export type { AlbumStats, Settings };

/** Everything persisted for one player, read in a single round trip at boot. */
export interface AccountSnapshot {
  /** A persisted game, or null when there is none (a first visit / after a reset). */
  game: GameState | null;
  album: AlbumState;
  albumStats: AlbumStats;
  career: CareerState;
  settings: Settings;
  /** An in-progress Cup Run, or null. */
  run: RunState | null;
  /** An in-flight match reveal. Only meaningful with a `run`; a stale one is dropped. */
  reveal: Reveal | null;
}

export interface Store {
  /** Read everything. Called once before the first render, and again to re-sync.
   *  Replaces whatever `peek` returns. */
  load(): Promise<AccountSnapshot>;
  /** The latest values held in memory, updated by every save. Synchronous, for the
   *  components that re-read on navigation. Throws if called before `load`. */
  peek(): AccountSnapshot;

  saveGame(game: GameState): Promise<void>;
  /** The collection and its trade telemetry always change together. */
  saveAlbum(album: AlbumState, stats: AlbumStats): Promise<void>;
  /** Wipe the collection + telemetry only; game, career, and run are untouched. */
  clearAlbum(): Promise<void>;
  saveCareer(career: CareerState): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** `null` drops the run (and any in-flight reveal with it). */
  saveRun(run: RunState | null): Promise<void>;
  /** `null` drops the in-flight reveal only. */
  saveReveal(reveal: Reveal | null): Promise<void>;
}
