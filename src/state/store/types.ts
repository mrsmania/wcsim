import type { GameState } from '../gameReducer';
import type { AlbumState } from '../../domain/album';
import type { CareerState } from '../../domain/career';
import type { Reveal, RunState } from '../../domain/run';
import type { AlbumStats } from '../albumStorage';
import type { Settings } from '../settingsStorage';
import type { StickerTier } from '../../config';

// ---------------------------------------------------------------------------
// The persistence seam. Everything the app persists goes through one `Store`,
// so where it is stored is a single decision instead of five import sites.
// There are TWO implementations behind this one facade now: `localStore` (localStorage)
// for a guest and `remoteStore` for an account, chosen by `bootStore`. This said "today
// there is exactly one ... an account-backed one lands behind it later", which is the
// promise the seam kept. See docs/cloud-sync-design.md.
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

/** A finished run's sticker haul, the only way a collection ever grows. */
export interface FinishRunInput {
  /** Stable identity for this run, so banking it twice is refused rather than
   *  double-counted (the server-side twin of the `stickersApplied` flag). */
  runKey: string;
  /** Collectible ids in the final XI (boosts and swaps included). */
  collectibleIds: string[];
  wonCup: boolean;
  /** The cup-win reward pick, or null. Never Monumental (album spec D-1). */
  cupPickId: string | null;
  /** Collectible swaps used this run, capped at INITIAL_SWAPS. */
  swapsUsed: number;
  /** How the run ended, for the run history: 'champion' | 'out' | 'group'. */
  outcome: string;
}

// `localStore.finishRun` deliberately reads only three of these six. `runKey`, `swapsUsed`
// and `outcome` exist for the SERVER: the key is what makes a double submit refusable, and
// the other two are validated and recorded server-side. A guest has no second writer to
// race and nothing to validate against, so ignoring them is correct rather than an
// oversight - which is why it is written down (hygiene H76).

export interface FinishRunResult {
  album: AlbumState;
  /** Ids that were NOT already collected, i.e. what the run-end summary shows. */
  newly: string[];
}

export interface Store {
  /** Read everything. Called once before the first render, by `bootStore` - nothing
   *  re-syncs, and `store.load()` on the facade has no caller at all.
   *  Replaces whatever `peek` returns. */
  load(): Promise<AccountSnapshot>;
  /** The latest values held in memory, updated by every save. Synchronous, for the
   *  components that re-read on navigation. Throws if called before `load`. */
  peek(): AccountSnapshot;

  saveGame(game: GameState): Promise<void>;
  /** Bank a finished run's collectibles (and the cup pick). The only path that grows
   *  a collection: signed in, the server validates it and is the one counting. */
  finishRun(input: FinishRunInput): Promise<FinishRunResult>;
  /** Spend duplicates on one chosen sticker. Returns the resulting collection. */
  trade(tier: StickerTier, playerId: string): Promise<AlbumState>;
  /** Wipe the collection + telemetry only; game, career, and run are untouched. */
  clearAlbum(): Promise<void>;
  saveCareer(career: CareerState): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** `null` drops the run (and any in-flight reveal with it). */
  saveRun(run: RunState | null): Promise<void>;
  /** `null` drops the in-flight reveal only. */
  saveReveal(reveal: Reveal | null): Promise<void>;

  /** The one-time guest -> account move (FR-15, FR-16). Account-backed stores only;
   *  the server refuses it if the account already holds anything. */
  importGuest?(payload: unknown): Promise<void>;
}
