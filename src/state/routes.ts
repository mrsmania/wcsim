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
    | 'records-versus'
    | 'squads'
    | 'versus'
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
    // The versus segment reads the SAME flag the tab does, so a build with no referee has
    // no such route rather than a third segment that cannot load. It falls back to the
    // ledger exactly as the cabinet does, and for the reason given above: a segment that
    // is not there loses an option off the control, it does not redirect you off the page.
    if (path === '/records/versus') return FEATURES.pvp ? 'records-versus' : 'records';
    if (path === '/records') return 'records';
    if (path === '/') return 'front';
    if (path === '/play') return 'build';
    // Versus gets its OWN destination rather than a segment under Play (plan section 8).
    // The Records precedent does not transfer: Records is two read-only screens of one
    // shape, while Play covers three routes of three shapes, one of which is the
    // marketing cover the navigation rework deliberately kept. `/versus/:code` is the
    // same destination, which is why both forms land here.
    if (FEATURES.pvp && (path === '/versus' || /^\/versus\/[A-Za-z0-9]{4,12}$/.test(path)))
        return 'versus';
    return 'unknown';
}

/** The honours screens are segments of ONE destination, which is what keeps them off the
 *  tab bar as entries of their own. Three of them since 2026-09-17: the ledger, the
 *  cabinet, and what versus has to show for itself. */
export const isRecords = (s: Screen) =>
    s === 'records' || s === 'cabinet' || s === 'records-versus';

/** The Play tab covers the cover, the build and the live run: one tab for the one way
 *  the game is played. */
export const isPlayTab = (s: Screen) => s === 'front' || s === 'build' || s === 'cup-run';
