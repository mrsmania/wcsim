/**
 * "The click that navigated here asked for a run to start."
 *
 * The five-tab chrome has no pre-run screen: pressing Start Run on the build page is meant
 * to land on `/cup-run` already showing the group draw. The first version of that inferred
 * the intent from the state - arriving with no run in progress meant "begin one" - which is
 * wrong in a way that loses runs: a reload, a Back navigation, a bookmark, a tab tap, or a
 * save that has not landed yet all look identical to a deliberate kickoff, and each of them
 * would silently draw a fresh group over whatever was there.
 *
 * So the intent is passed instead of guessed. Module state rather than router state on
 * purpose: `location.state` lives in `history.state`, which SURVIVES a reload, so it would
 * reintroduce exactly the bug it was meant to fix. A module variable cannot survive one.
 */

let requested = false;

/** Called by the build page's Start Run, immediately before navigating. */
export function requestRunStart(): void {
  requested = true;
}

/** Read-and-clear: true at most once per request. */
export function consumeRunStart(): boolean {
  const was = requested;
  requested = false;
  return was;
}
