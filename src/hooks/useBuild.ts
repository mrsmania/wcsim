import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { MutableRefObject } from 'react';
import type { Player, Position, Squad } from '../data/types';
import {
    canPlace,
    hasAnotherCup,
    hasAnotherTeam,
    homeViewOf,
    placedPlayers,
    positionsWithOpenSlot,
    randomXI,
    STRENGTH_BANDS,
    type RerollKind,
    type TeamStrength,
} from '../domain/draft';
import { swapEligibleIds as swapEligibleIdsOf } from '../domain/album';
import {
    FORMATIONS_DATA,
    getFormation,
    STYLES,
    type Formation,
    type FormationName,
    type Style,
} from '../domain/formations';
import type { MatchSpeed } from '../domain/clock';
import { FEATURES } from '../config';
import { gameReducer, initialState, type Action, type GameState } from '../state/gameReducer';
import type { BuildIo } from '../state/buildIo';
import { useSquadRoll } from './useSquadRoll';
import { useBudgetBuild, type BudgetBuild } from './useBudgetBuild';
import { useMovePlayer, type MovePlayer } from './useMovePlayer';
import { useStackedScroll } from './useStackedScroll';
import type { Pool } from './usePool';

// THE BUILD, AS AN INSTANTIABLE UNIT (pvp-plan P29, wave 4).
//
// Everything it takes to build an XI - the reducer, the two effects, the three
// interaction machines, the eight derivations and the eleven handlers - held in one hook
// that can be called MORE THAN ONCE. Until now it could not be: it was the composition
// root's own body, writing to the single persisted game state and to the player's active
// run on the way past, so a second build could not exist without stealing the first one's
// storage and deleting whatever run was in flight.
//
// The two writes are the seam and they are handed in (`state/buildIo.ts`): the app's own
// build gets `soloBuildIo` and behaves exactly as before; a versus room gets
// `detachedBuildIo` and writes nothing at all. NOTHING IN THIS FILE MAY IMPORT THE STORE -
// a write added here reaches the server from inside a room, per tap, with a pick clock
// running. `scripts/checks/build.ts` asserts that.
//
// What is NOT here, on purpose: the album, the career, the run, routing, and the page's
// layout. Those are the app's, and a room has none of them.

/** Which of the build's three faces is showing. Derived from the BOARD rather than from
 *  `phase`, so returning to the build page mid-run still reads as the locked XI. */
export type BuildView = 'setup' | 'draft' | 'complete';

export interface BuildInput {
    /** A build to resume, or null to start at setup. A room always starts fresh. */
    initial: GameState | null;
    /** Where this build's two writes go, or nowhere. */
    io: BuildIo;
    /** The squads and players this build draws from (the room's cups, or the setting). */
    pool: Pool;
    /** Re-rolls on top of `INITIAL_REROLLS`. The app reads the Extra Re-roll perk off the
     *  live career; a room has no career at all (P8), so it passes its own allowance. */
    extraRerolls: number;
    /** Called when a player is bought into a slot, beside the dispatch that does it. A
     *  versus room posts the pick to the referee from here, which is the one place that
     *  cannot disagree with what the board just did. */
    onBuy?: (slotId: string, player: Player) => void;
}

export interface Build {
    state: GameState;
    dispatch: (action: Action) => void;
    /** The squads and players this build draws from, as handed in: the market lists them
     *  and the rolls come from them. */
    pool: Pool;

    /** setup / draft / complete, from the board. */
    view: BuildView;
    /** The formation being previewed during setup; null until the formations load. */
    previewFormation: Formation | null;
    /** The formation on screen: the preview during setup, the locked one after it. */
    activeFormation: Formation | null;
    isBudgetBuild: boolean;
    /** The squad the drawn-squad panel shows: a scramble frame while rolling. */
    panelSquad: Squad | null;
    selectedPlayer: Player | null;
    /** Positions with at least one open slot, for the drawn-squad panel's marks. */
    openPositions: Set<Position>;
    /** Drawn-squad players that can be swapped into a filled slot (sticker album). */
    swapEligibleIds: Set<string>;
    /** The people already in the XI, as a set. */
    usedPersonIds: Set<string>;
    availableStyles: readonly Style[];
    /** The completed XI, in slot order; null until all eleven are filled. */
    draftedXi: Player[] | null;
    /** Whether the two targeted re-rolls have anything to draw from. */
    canAnotherTeam: boolean;
    canAnotherCup: boolean;

    /** The mobile scroll dance's two anchors, for the page layout to attach. */
    panelRef: MutableRefObject<HTMLElement | null>;
    boardRef: MutableRefObject<HTMLDivElement | null>;

    /** The transfer market's held card and target slot. */
    market: BudgetBuild;
    /** Moving a placed player to another of his roles. */
    movePlayer: MovePlayer;

    setFormationName: (name: FormationName) => void;
    setStyle: (style: Style) => void;
    setSpeed: (speed: MatchSpeed) => void;
    /** Enter the roll draft. */
    start: () => void;
    /** Enter the budget build in place - no route change, the left column swaps. */
    enterBudget: () => void;
    /** Drop every bought player and stay in the budget build. */
    clearBudget: () => void;
    /** Testing shortcut: a full valid XI within a strength band, straight to complete. */
    randomTeam: (tier: TeamStrength) => void;
    reroll: (kind: RerollKind) => void;
    selectPlayer: (playerId: string) => void;
    place: (slotId: string) => void;
    swap: (slotId: string) => void;
    remove: (slotId: string) => void;
    startMove: (slotId: string) => void;
    /** Back to an empty board. The caller adds whatever else a reset means to IT
     *  (the app navigates and drops a pending sticker summary; a room does neither). */
    reset: () => void;
}

export function useBuild({ initial, io, pool, extraRerolls, onBuy }: BuildInput): Build {
    const [state, dispatch] = useReducer(gameReducer, initialState, () => initial ?? initialState);
    const {
        phase,
        formationName,
        style,
        build,
        formation,
        filled,
        currentSquad,
        selectedPlayerId,
        usedPersonIds,
        rerollsLeft,
        rolling,
        swapsLeft,
    } = state;
    const poolSquads = pool.squads;

    // Mirror the build so a refresh resumes it - or, for a detached build, do nothing.
    // This is the per-tap write: every selection, every placement, every formation tap.
    useEffect(() => {
        io.saveBuild(state);
    }, [io, state]);

    // The build page's mobile there-and-back: the two scroll anchors and the two calls
    // that use them (hooks/useStackedScroll).
    const { pitchRef, squadRef, scrollToPitch, scrollToPanel } = useStackedScroll();

    // During setup the pitch previews the selected formation/style; during the draft it
    // uses the locked formation stored in state.
    const previewFormation = useMemo(
        () => getFormation(formationName, style),
        [formationName, style],
    );
    // Keyed on the board, not on `phase` - see `homeViewOf`.
    const view: BuildView = homeViewOf(formation, filled);
    const activeFormation = view === 'setup' ? previewFormation : formation;

    // Mobile: when a player is picked, scroll the pitch to the top (with a little margin
    // via scroll-mt) so the user can tap an open slot. Scrolling back up to the squad
    // after placing is done in `place`.
    useEffect(() => {
        if (phase === 'draft' && selectedPlayerId) scrollToPitch();
    }, [selectedPlayerId, phase, scrollToPitch]);

    // The roll draft: the scramble animation and the draw-next-squad policy, with their
    // four refs and their two effects (hooks/useSquadRoll). It is the subtlest code the
    // build has and none of it is composition, which is why it is not here.
    const { displaySquad, reroll } = useSquadRoll({
        phase,
        build,
        formation,
        currentSquad,
        rolling,
        filled,
        usedPersonIds,
        rerollsLeft,
        pool: poolSquads,
        dispatch,
    });

    // The two transient interaction machines the shared pitch drives (hooks/useMovePlayer
    // and hooks/useBudgetBuild). They cross-cancel: taking a card drops a move in
    // progress, and picking a placed player up drops the card. The move hook is declared
    // first so the market can call its `cancel`; the other direction is `startMove`
    // below, since neither hook can own both without knowing about the other.
    const move = useMovePlayer({ activeFormation, phase, dispatch });
    const market = useBudgetBuild({
        isBudgetBuild: build === 'budget',
        formation,
        activeFormation,
        filled,
        pool: pool.byId,
        dispatch,
        onTakeCard: move.cancel,
        onBuy,
        scrollToPitch,
        scrollToPanel,
    });

    const setFormationName = useCallback(
        (name: FormationName) => dispatch({ type: 'SET_FORMATION', name }),
        [],
    );
    const setStyle = useCallback((st: Style) => dispatch({ type: 'SET_STYLE', style: st }), []);
    const setSpeed = useCallback(
        (speed: MatchSpeed) => dispatch({ type: 'SET_SPEED', speed }),
        [],
    );

    const start = useCallback(() => {
        if (!previewFormation) return;
        // A fresh draft means a fresh team, so drop any in-progress Cup Run.
        io.clearRun();
        // Just enter the draft; the draw-next-squad effect rolls the first squad from
        // committed state (an open slot with no squad in hand).
        dispatch({ type: 'START_DRAFT', formation: previewFormation, extraRerolls });
    }, [previewFormation, io, extraRerolls]);

    const randomTeam = useCallback(
        (tier: TeamStrength) => {
            if (!previewFormation) return;
            io.clearRun();
            const picked = randomXI(previewFormation, poolSquads, STRENGTH_BANDS[tier]);
            dispatch({
                type: 'AUTOFILL',
                formation: previewFormation,
                filled: picked.filled,
                usedPersonIds: picked.usedPersonIds,
            });
        },
        [previewFormation, poolSquads, io],
    );

    // Budget build: enter it in place - the left column swaps to the market, while the
    // pitch and the ratings/line-up stay put.
    const enterBudget = useCallback(() => {
        if (!previewFormation) return;
        io.clearRun();
        market.enter(previewFormation);
    }, [previewFormation, market, io]);

    // Clear every bought player but stay in the budget build (re-enter it fresh). No
    // `clearRun`: there is no new team here, only an emptier one.
    const clearBudget = useCallback(() => {
        if (formation) market.enter(formation);
    }, [formation, market]);

    // Taking a drawn-squad card drops a move in progress: only one thing is being aimed
    // at a time, and the last tap is what the user means. The market's own card does the
    // same, from inside `useBudgetBuild`.
    const selectPlayer = useCallback(
        (playerId: string) => {
            move.cancel();
            dispatch({ type: 'SELECT_PLAYER', playerId });
        },
        [move],
    );

    const place = useCallback(
        (slotId: string) => {
            // The reducer owns placement validation and ignores an invalid slot;
            // dispatch unconditionally and let it be the single source of truth.
            // The draw-next-squad effect rolls the next squad from committed state.
            const slot = formation?.slots.find((s) => s.id === slotId);
            const player = currentSquad?.players.find((p) => p.id === selectedPlayerId);
            const willPlace = !!formation && !!slot && !!player && canPlace(player, slot, filled);

            dispatch({ type: 'PLACE_PLAYER', slotId });

            // Mobile: jump back up to the squad list (showing the next drawn squad); the
            // panel's scroll-mt keeps a little margin above it. Only for a placement
            // that actually landed.
            if (willPlace) scrollToPanel();
        },
        [formation, currentSquad, selectedPlayerId, filled, scrollToPanel],
    );

    // Swap the selected player into an already-filled slot (sticker album feature).
    // The reducer validates eligibility; the draw effect then rolls the next squad
    // for any still-open slot, exactly like a placement.
    const swap = useCallback(
        (slotId: string) => {
            dispatch({ type: 'SWAP_PLAYER', slotId });
            scrollToPanel();
        },
        [scrollToPanel],
    );

    // Testing aid: remove a placed player. The XI drops back to 'draft'; if no squad is
    // in hand (we were "complete"), the draw-next-squad effect rolls one for the freed
    // slot from committed state so a replacement can be drafted.
    const remove = useCallback((slotId: string) => {
        dispatch({ type: 'REMOVE_PLAYER', slotId });
    }, []);

    // Picking a placed player up is the other half of that rule, and the half neither
    // hook can own: the move hook clears the reducer's selection, and the market's held
    // card is dropped here, so the two gestures overwrite each other in both directions
    // rather than one silently winning.
    const startMove = useCallback(
        (slotId: string) => {
            market.dropHeld();
            move.startMove(slotId);
        },
        [market, move],
    );

    const reset = useCallback(() => {
        // A reset is a brand-new team, so drop any in-progress Cup Run too.
        io.clearRun();
        dispatch({ type: 'RESET' });
    }, [io]);

    const openPositions = useMemo<Set<Position>>(
        () =>
            activeFormation ? positionsWithOpenSlot(activeFormation, filled) : new Set<Position>(),
        [activeFormation, filled],
    );
    // Ids of drawn-squad players that can be swapped in (collectible + swaps remain +
    // there's a filled slot they can take): a different-person slot when they're not
    // already in the XI, or their OWN slot as an upgrade (a different card of the same
    // person). Empty when the album is off / no swaps left, so gating is unchanged there.
    const swapEligibleIds = useMemo<Set<string>>(
        () =>
            !FEATURES.stickerAlbum || swapsLeft <= 0 || !activeFormation || !currentSquad
                ? new Set<string>()
                : swapEligibleIdsOf(
                      currentSquad.players,
                      activeFormation.slots,
                      filled,
                      new Set(usedPersonIds),
                  ),
        [swapsLeft, activeFormation, currentSquad, filled, usedPersonIds],
    );
    const usedSet = useMemo(() => new Set(usedPersonIds), [usedPersonIds]);

    // The completed XI (all slots filled) handed to whatever plays it; null until full.
    const draftedXi = useMemo<Player[] | null>(() => {
        if (!formation) return null;
        const ps = placedPlayers(formation, filled);
        return ps.length === formation.slots.length ? ps : null;
    }, [formation, filled]);

    return {
        state,
        dispatch,
        pool,
        view,
        previewFormation,
        activeFormation,
        isBudgetBuild: build === 'budget',
        panelSquad: rolling ? displaySquad : currentSquad,
        selectedPlayer: currentSquad?.players.find((p) => p.id === selectedPlayerId) ?? null,
        openPositions,
        swapEligibleIds,
        usedPersonIds: usedSet,
        availableStyles: FORMATIONS_DATA.stylesByName[formationName] ?? STYLES,
        draftedXi,
        canAnotherTeam: !!currentSquad && hasAnotherTeam(poolSquads, currentSquad),
        canAnotherCup: !!currentSquad && hasAnotherCup(poolSquads, currentSquad),
        panelRef: squadRef,
        boardRef: pitchRef,
        market,
        movePlayer: move,
        setFormationName,
        setStyle,
        setSpeed,
        start,
        enterBudget,
        clearBudget,
        randomTeam,
        reroll,
        selectPlayer,
        place,
        swap,
        remove,
        startMove,
        reset,
    };
}
