// What a build offers, as data rather than as a flag.
//
// Wave 5 of docs/pvp-plan.md, decision P41. Its own module and NOT part of
// `BuildSurface.tsx`, so `npm run checks` can assert the two sets without pulling React
// into a node process - the same reason `domain/` is framework-free.

/**
 * What a versus room hides (P41), as a LIST rather than as one flag, because the list is
 * the decision: each entry is off for its own reason - some about the clock, some about the
 * album, some about what the referee can be told - so each has to be argued about on its
 * own terms, and turning one back on is a change to one line rather than to a policy.
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
    /** The "x" on a placed badge. Still off in a PER-PICK room, and the move going in
     *  beside it did not change that: a pick there is SPENT, so there is nothing to give
     *  back and the referee has no instruction that could - which is why the permutation
     *  rule a move is taken under refuses a board with a player missing as firmly as one
     *  with a player added. On in a whole-draft room, where the board is submitted as a
     *  map (P52) and un-buying really is just another map. */
    removePlayer: boolean;
    /** Moving a placed player to another of his roles. P42 always said a room SHOULD allow
     *  it - the XI is a slot map, not a list of picks - and for two waves the referee took
     *  picks and nothing else, so a move was reverted by the next answer and the control
     *  was off everywhere. It is ON IN BOTH KINDS OF ROOM NOW, by two different routes: a
     *  whole-draft room submits the map (P52), so a move is just another map; a per-pick
     *  room posts the rearranged board to `movePlayers`, which takes it only when it is a
     *  PERMUTATION of the board already there - the same eleven people, standing somewhere
     *  else - so it can be taken outside the pick protocol without being a way to smuggle
     *  a pick through it. The one thing that can still switch it off is a referee too old
     *  to have that route: see `canMove`. */
    movePlayer: boolean;
    /** The chemistry card. Off in a room (P25): the match is played without it. */
    chemistry: boolean;
    /** The board's TWO-COLOUR pulse while a player is held: amber for the slot that is his
     *  natural role, white for every other one he can fill. Off in a room, where nothing
     *  pays for a natural role - the chemistry point is not awarded (P25) and no honour is
     *  earned in a room at all - so the second colour would be a distinction with nothing
     *  behind it, and reads as a recommendation the room does not make. With it off every
     *  slot he can take pulses the same amber. */
    naturalHint: boolean;
    /** The album's marks: the tier star on a market or drawn-squad row, the Collectible
     *  filter, and the star plus tier accent on the line-up sheet. Off in a room, where
     *  the album has no business being at all (P3, P8) - the sheet included, since a room
     *  awards no sticker and the marks would be pointing at a collection this game cannot
     *  add to. */
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
    naturalHint: true,
    collectibles: true,
    swap: true,
};

/** THE BASELINE: none of them. It is also literally what a per-pick room gets from a
 *  referee too old to have the move route, which is why it stays a constant rather than
 *  becoming a third case of `roomControls`. */
export const ROOM_CONTROLS: BuildControls = {
    autoFill: false,
    clear: false,
    startOver: false,
    randomTeam: false,
    removePlayer: false,
    movePlayer: false,
    chemistry: false,
    naturalHint: false,
    collectibles: false,
    swap: false,
};

/**
 * What a room's draft offers, which depends on how it drafts (P52) and on what the referee
 * it is talking to can hear.
 *
 * A WHOLE-DRAFT ROOM CAN AFFORD TWO OF THEM, and only because of how it submits: the board
 * goes to the referee as a map, so moving a player and taking one back out are the same
 * instruction as buying one, and the answer confirms them the same way.
 *
 * A PER-PICK ROOM NOW GETS THE MOVE TOO, and only that one. It goes through a route of its
 * own (`movePlayers`) which takes a rearranged board and nothing else, so the gesture works
 * without the pick protocol having to learn about it - where the un-buy beside it still
 * cannot, a spent pick having nothing to give back. Nothing else moves in either kind:
 * auto-fill still makes eleven decisions in one tap, Start over still navigates out of the
 * room, and the album and the chemistry card are out for reasons that have nothing to do
 * with the clock (P3, P8, P25).
 *
 * `canMove` IS THE ONE THING THAT TAKES IT AWAY AGAIN, and it is about the server rather
 * than the room: `PVP_PROTOCOL` was not bumped for the move, the client half deploys by
 * pushing to `main` and the referee is rebuilt by hand, so a room can be sitting on a
 * referee that has never heard of the route. A control that undoes itself a second later is
 * worse than one that is not there - which is precisely why the gesture was off for two
 * waves - so the first `no-route` answer takes it off the board.
 *
 * Derived rather than three more constants, so a control added to `BuildControls` cannot be
 * forgotten here: each case starts from the room's own set and turns on what it has earned.
 */
export const roomControls = (wholeDraft: boolean, canMove = true): BuildControls =>
    wholeDraft
        ? { ...ROOM_CONTROLS, removePlayer: true, movePlayer: canMove }
        : { ...ROOM_CONTROLS, movePlayer: canMove };
