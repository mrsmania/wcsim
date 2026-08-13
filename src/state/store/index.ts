import { FEATURES } from '../../config';
import { createLocalStore } from './localStore';
import type { AccountSnapshot, Store } from './types';

export type {
  AccountSnapshot,
  AlbumStats,
  FinishRunInput,
  FinishRunResult,
  Settings,
  Store,
} from './types';

/**
 * The app's single persistence handle. Import this, never the per-key storage
 * modules (`persist.ts`, `albumStorage.ts`, `careerStorage.ts`, `runStorage.ts`,
 * `settingsStorage.ts`) - those are the local implementation's internals.
 *
 * `main.tsx` calls `bootStore()` once before the first render; everything after
 * that reads `peek()` and writes through the save methods.
 *
 * Guests and signed-in players get different implementations behind this same
 * façade (D8: the two worlds never mix), which is why it is a stable object that
 * delegates rather than a value that gets reassigned.
 */
let impl: Store = createLocalStore();

/** True once a signed-in implementation is in place. */
let remote = false;

export const store: Store = {
  load: () => impl.load(),
  peek: () => impl.peek(),
  saveGame: (g) => impl.saveGame(g),
  finishRun: (i) => impl.finishRun(i),
  trade: (t, p) => impl.trade(t, p),
  clearAlbum: () => impl.clearAlbum(),
  saveCareer: (c) => impl.saveCareer(c),
  saveSettings: (s) => impl.saveSettings(s),
  saveRun: (r) => impl.saveRun(r),
  saveReveal: (r) => impl.saveReveal(r),
};

/** Whether the current store is account-backed (as opposed to guest/local). */
export const isSignedIn = (): boolean => remote;

export interface BootResult {
  snapshot: AccountSnapshot;
  /** The signed-in email, or null for a guest. */
  email: string | null;
}

/**
 * Choose the implementation and read everything once, before the first render.
 *
 * Guest is the default and needs no network. With accounts configured AND a stored
 * session, the account store is used instead and the client library is loaded on
 * demand, so a guest never downloads it.
 *
 * Throws when a signed-in load fails: that is the "server unreachable" case, and
 * per D9 a signed-in player is blocked rather than quietly dropped to local play.
 */
export async function bootStore(): Promise<BootResult> {
  if (FEATURES.accounts) {
    const { currentAccount } = await import('../auth');
    const account = await currentAccount().catch(() => null);
    if (account) {
      const { supabase } = await import('../auth');
      const { createRemoteStore } = await import('./remoteStore');
      impl = createRemoteStore(supabase(), account.id);
      remote = true;
      return { snapshot: await impl.load(), email: account.email };
    }
  }
  impl = createLocalStore();
  remote = false;
  return { snapshot: await impl.load(), email: null };
}
