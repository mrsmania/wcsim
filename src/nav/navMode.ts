/**
 * The five-tab navigation preview (roadmap item 27, concept 2).
 *
 * Switched at RUNTIME rather than by a `FEATURES` flag, deliberately: the point is to
 * compare the old chrome with the new one in a single deployed build, on the same
 * progress and the same account. `?nav=tabs` turns it on, `?nav=classic` turns it off,
 * and the choice sticks in its own localStorage key because client-side navigation
 * drops the query string.
 *
 * Read ONCE at module load, like `FEATURES`. Each mode is a different tree of chrome and
 * a different set of routes, so flipping mid-session would remount half the app;
 * `setNavMode` reloads instead. Signing in/out already reloads for the same reason.
 *
 * Nothing about gameplay, persistence or the domain depends on this: it is chrome and
 * click paths only. Its own key means resetting the game, album, career or run never
 * touches it, and it is never synced to an account (it is a per-device preview).
 */

const KEY = 'wcsim_nav_v1';

export type NavMode = 'classic' | 'tabs';

const read = (): NavMode => {
  if (typeof window === 'undefined') return 'classic';
  try {
    const q = new URLSearchParams(window.location.search).get('nav');
    if (q === 'tabs' || q === 'classic') {
      window.localStorage.setItem(KEY, q);
      return q;
    }
    return window.localStorage.getItem(KEY) === 'tabs' ? 'tabs' : 'classic';
  } catch {
    // Private mode / storage disabled: the preview is simply off.
    return 'classic';
  }
};

export const NAV_MODE: NavMode = read();

/** True when the five-tab navigation is on. */
export const TABS = NAV_MODE === 'tabs';

/** Switch mode and reload, dropping `?nav` from the URL so the address stays clean. */
export function setNavMode(mode: NavMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* nothing to persist to: fall through to the reload, which reads 'classic' */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('nav');
  window.location.replace(url.toString());
}
