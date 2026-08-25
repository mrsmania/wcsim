// Which screen a URL means. The URL is the source of truth for *which screen* (the
// reducer stays the source of truth for the build), and that mapping used to be ten
// `is*` booleans declared halfway down `App.tsx` and then re-tested in the render
// chain - so the route contract was spread across a component and could not be
// asserted anywhere (hygiene H82).
//
// Feature flags are read HERE, not by the caller, because a flagged-off screen is not
// a screen: with the album off, `/album` is simply not a route, and the catch-all
// redirect is the correct answer rather than a special case at the call site.
//
// The `<Routes>` rewrite this obviously invites is a separate, larger change. This is
// the pure half only.

import { FEATURES } from '../config';

/** The screens the app can be showing. `unknown` is every other path, which the
 *  catch-all redirects to the front page - what `/group`, `/knockout` and the four
 *  deleted aliases all do. */
export type Screen =
    | 'front'
    | 'build'
    | 'cup-run'
    | 'career'
    | 'album'
    | 'records'
    | 'cabinet'
    | 'squads'
    | 'unknown';

/** The screen a basename-relative pathname means.
 *
 *  Two behaviours here are deliberate and were live before this module existed, so do
 *  not "tidy" them:
 *  - `/records/cabinet` with the cabinet flag off falls back to `records` (the
 *    challenge ledger), rather than redirecting. The segmented control simply loses
 *    one of its two options.
 *  - `records` does not test `FEATURES.challenges`. With both honours flags off the
 *    Records tab disappears from the bar, but the route still renders the ledger. */
export function screenOf(path: string): Screen {
    if (FEATURES.squadBrowser && (path === '/squads' || path.startsWith('/squads/')))
        return 'squads';
    if (path === '/career') return 'career';
    if (path === '/cup-run') return 'cup-run';
    if (FEATURES.stickerAlbum && path === '/album') return 'album';
    if (path === '/records/cabinet') return FEATURES.trophyCabinet ? 'cabinet' : 'records';
    if (path === '/records') return 'records';
    if (path === '/') return 'front';
    if (path === '/play') return 'build';
    return 'unknown';
}

/** The two honours screens are segments of ONE destination, which is what keeps the
 *  tab bar at five. */
export const isRecords = (s: Screen) => s === 'records' || s === 'cabinet';

/** The Play tab covers the cover, the build and the live run: one tab for the one way
 *  the game is played. */
export const isPlayTab = (s: Screen) => s === 'front' || s === 'build' || s === 'cup-run';
