// What a build offers, as data rather than as a flag.
//
// Wave 5 of docs/pvp-plan.md, decision P41. Its own module and NOT part of
// `BuildSurface.tsx`, so `npm run checks` can assert the two sets without pulling React
// into a node process - the same reason `domain/` is framework-free.

/**
 * The four controls a versus room hides (P41), as a LIST rather than as one flag,
 * because the list is the decision: each of them breaks the pick clock in its own way,
 * and a future fifth control has to be argued about on its own terms.
 */
export interface BuildControls {
    /** "Auto-fill & spend": ten picks in one tap, so it skips the clock entirely and
     *  produces a better XI than timing out does. */
    autoFill: boolean;
    /** "Clear": empties the board, which the referee holds and would not follow. */
    clear: boolean;
    /** "Start over": runs the app's reset, which navigates out of a room mid-draft. */
    startOver: boolean;
    /** The random-team shortcut on the setup panel: a complete XI in one tap. */
    randomTeam: boolean;
    /** The "x" on a placed badge. In a room the referee holds the XI and has no
     *  instruction for taking a player back out, so the tap would place him again on the
     *  next reconcile - a control that undoes itself. */
    removePlayer: boolean;
    /** Moving a placed player to another of his roles. P42 says a room SHOULD allow it -
     *  the XI is submitted as a slot map, not a list of picks - but the referee takes
     *  picks and nothing else, so a move here would be reverted by the next answer. It
     *  needs an instruction the referee does not have; until then it is off rather than
     *  broken. */
    movePlayer: boolean;
    /** The chemistry card. Off in a room (P25): the match is played without it. */
    chemistry: boolean;
    /** The album's marks: the tier star on a market row and the Collectible filter. Off
     *  in a room, where the album has no business being at all (P3, P8). */
    collectibles: boolean;
}

/** The single-player build: everything on. */
export const SOLO_CONTROLS: BuildControls = {
    autoFill: true,
    clear: true,
    startOver: true,
    randomTeam: true,
    removePlayer: true,
    movePlayer: true,
    chemistry: true,
    collectibles: true,
};

/** A room's draft: none of them. */
export const ROOM_CONTROLS: BuildControls = {
    autoFill: false,
    clear: false,
    startOver: false,
    randomTeam: false,
    removePlayer: false,
    movePlayer: false,
    chemistry: false,
    collectibles: false,
};
