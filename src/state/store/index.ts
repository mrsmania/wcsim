import { FEATURES } from '../../config';
import { toStored } from '../settingsStorage';
import { clearGuestData, createLocalStore, hasGuestData } from './localStore';
import type { AccountSnapshot, Store } from './types';

// Only what something outside this directory actually imports from the facade. The other
// four names this used to re-export had no importer at all: both store implementations take
// `Store`, `AlbumStats`, `FinishRunInput` and `FinishRunResult` from `./types` directly, so
// re-exporting them here only suggested a public surface that was not one.
//
// `Settings` and `Theme` ARE part of that surface, though, and are re-exported for it:
// `saveSettings` takes a `Settings`, so it is the seam's own vocabulary, and `useSettings`
// was reaching past the seam into `settingsStorage` to get them - the one thing the seam's
// docstring below tells callers never to do (hygiene H63).
export type { AccountSnapshot } from './types';
export type { Settings, Theme } from '../settingsStorage';

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
let remote = false;

/** Notified when a write fails. For a signed-in player that is the blocking
 *  "unreachable" state (D9); a guest write cannot realistically fail. */
type ErrorListener = (err: Error) => void;
let onError: ErrorListener | null = null;

export function onStoreError(listener: ErrorListener): () => void {
  onError = listener;
  return () => {
    onError = null;
  };
}

/** Run a write, reporting a failure rather than letting it vanish into a promise. */
function reporting<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err));
    if (remote) onError?.(e);
    else console.error('store write failed', e);
    throw e;
  });
}

export const store: Store = {
  load: () => impl.load(),
  peek: () => impl.peek(),
  saveGame: (g) => reporting(() => impl.saveGame(g)),
  finishRun: (i) => reporting(() => impl.finishRun(i)),
  trade: (t, p) => reporting(() => impl.trade(t, p)),
  clearAlbum: () => reporting(() => impl.clearAlbum()),
  saveCareer: (c) => reporting(() => impl.saveCareer(c)),
  saveSettings: (s) => reporting(() => impl.saveSettings(s)),
  saveRun: (r) => reporting(() => impl.saveRun(r)),
  saveReveal: (r) => reporting(() => impl.saveReveal(r)),
};

/** Whether the current store is account-backed (as opposed to guest/local). */
export const isSignedIn = (): boolean => remote;

/** An account with no progress yet, i.e. one the guest data could move into. */
function accountIsEmpty(s: AccountSnapshot): boolean {
  return (
    s.album.collected.length === 0 &&
    s.career.xp === 0 &&
    s.career.prestige === 0 &&
    s.game === null &&
    s.run === null
  );
}

export interface BootResult {
  snapshot: AccountSnapshot;
  /** The signed-in email, or null for a guest. */
  email: string | null;
}

/**
 * Move this device's guest progress into an empty account, then delete the local copy
 * (FR-15, FR-16, FR-16a). Automatic: signing in on a device that has progress means
 * you want that progress, so there is nothing to ask about.
 *
 * The ordering is the safety: the server confirms before anything local is deleted, so
 * a failure leaves the only copy intact - and since nothing records a refusal, the next
 * sign-in simply tries again.
 */
async function moveGuestProgressIn(): Promise<AccountSnapshot | null> {
  if (!impl.importGuest) return null;
  try {
    // Settings go over in STORED form: `import_guest_progress` inserts
    // `p_payload->'settings'` verbatim into the account's jsonb, so handing it the
    // in-memory shape would write a blob the next load reads as a v1 save and widens
    // back to every tournament. See `settingsStorage.toStored`.
    const { reveal: _reveal, settings, ...rest } = await createLocalStore().load();
    await impl.importGuest({ ...rest, settings: toStored(settings) });
    clearGuestData();
    return impl.peek();
  } catch (err) {
    // The account is usable and the local copy is untouched, so carry on rather than
    // blocking; the next sign-in retries.
    console.error('moving guest progress into the account failed', err);
    return null;
  }
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
    const { currentAccount, supabase } = await import('../auth');
    const account = await currentAccount().catch(() => null);
    if (account) {
      const { createRemoteStore } = await import('./remoteStore');
      impl = createRemoteStore(supabase(), account.id);
      remote = true;
      let snapshot = await impl.load();

      // Move guest progress in, but only into an account holding nothing: a populated
      // account is left strictly alone, since there would be no safe way to combine
      // two collections.
      if (accountIsEmpty(snapshot) && hasGuestData()) {
        snapshot = (await moveGuestProgressIn()) ?? snapshot;
      }
      return { snapshot, email: account.email };
    }
  }
  impl = createLocalStore();
  remote = false;
  return { snapshot: await impl.load(), email: null };
}

