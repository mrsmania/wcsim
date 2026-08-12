import { createLocalStore } from './localStore';

export type { AccountSnapshot, AlbumStats, Settings, Store } from './types';

/**
 * The app's single persistence handle. Import this, never the per-key storage
 * modules (`persist.ts`, `albumStorage.ts`, `careerStorage.ts`, `runStorage.ts`,
 * `settingsStorage.ts`) - those are the local implementation's internals now.
 *
 * `main.tsx` calls `load()` once before the first render; everything after that
 * reads `peek()` and writes through the save methods.
 *
 * This module is where an account-backed store gets chosen instead (guest ->
 * local, signed in -> remote), which is why it is a module-level singleton
 * rather than something threaded through props. See docs/cloud-sync-design.md.
 */
export const store = createLocalStore();
