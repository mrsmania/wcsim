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
    /** The "x" on a placed badge. Off in a PER-PICK room, where the referee holds the XI
     *  as a log of eleven windows and has no instruction for taking a player back out, so
     *  the tap would place him again on the next reconcile - a control that undoes itself.
     *  On in a whole-draft room, where the board is submitted as a map (P52). */
    removePlayer: boolean;
    /** Moving a placed player to another of his roles. P42 always said a room SHOULD allow
     *  it - the XI is a slot map, not a list of picks - and until P52 the referee took
     *  picks and nothing else, so a move was reverted by the next answer. A whole-draft
     *  room submits the map, so a move is just another map and needs no new rule. */
    movePlayer: boolean;
    /** The chemistry card. Off in a room (P25): the match is played without it. */
    chemistry: boolean;
    /** The album's marks: the tier star on a market row and the Collectible filter. Off
     *  in a room, where the album has no business being at all (P3, P8). */
    collectibles: boolean;
    /** Swapping a collectible into a filled slot. Off in a room for the same reason, and
     *  it needs saying separately: the two per-run swaps come from the reducer's initial
     *  state, so a roll room that only hid the STARS would still let a player use them. */
    swap: boolean;
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
    swap: true,
};

/** A PER-PICK room's draft (a roll room, and any room from a referee older than P52):
 *  none of them. */
export const ROOM_CONTROLS: BuildControls = {
    autoFill: false,
    clear: false,
    startOver: false,
    randomTeam: false,
    removePlayer: false,
    movePlayer: false,
    chemistry: false,
    collectibles: false,
    swap: false,
};

/**
 * What a room's draft offers, which now depends on how it drafts (P52).
 *
 * A WHOLE-DRAFT ROOM CAN AFFORD TWO OF THEM, and only because of how it submits: the board
 * goes to the referee as a map, so moving a player and taking one back out are the same
 * instruction as buying one, and the answer confirms them the same way. Nothing else moves
 * - auto-fill still makes eleven decisions in one tap, Start over still navigates out of
 * the room, and the album and the chemistry card are out for reasons that have nothing to
 * do with the clock (P3, P8, P25).
 *
 * Derived rather than a third constant, so a control added to `BuildControls` cannot be
 * forgotten here: it starts from the room's own set and turns on exactly the two that P42
 * always wanted.
 */
export const roomControls = (wholeDraft: boolean): BuildControls =>
    wholeDraft ? { ...ROOM_CONTROLS, removePlayer: true, movePlayer: true } : ROOM_CONTROLS;
