import { useCallback, useEffect, useState } from 'react';
import type { Player } from '../data/types';
import type { Filled } from '../domain/draft';
import type { Formation, Slot } from '../domain/formations';
import type { Action } from '../state/gameReducer';

// The transfer market's interaction machine: the card currently held and the empty slot
// being shopped for, plus the seven handlers that move them. Both are transient - never
// persisted - and both drive the SHARED pitch, which is why they lived in the
// composition root (hygiene H80).
//
// It cross-cancels with `useMovePlayer`: taking a card drops a move in progress, and
// picking a placed player up drops the card. Only the first direction is wired here
// (`onTakeCard`); the composition root wires the other, because neither hook can own
// both without knowing about the other.

export interface BudgetBuild {
    /** The market player in hand, by id. */
    heldId: string | null;
    /** That player, resolved against the ACTIVE POOL - the same set the market lists.
     *
     *  It used to resolve against every player in the dataset, which was harmless only
     *  because the id could not come from anywhere but the market. Narrowing the pool with
     *  a card in hand left a card held that the market no longer offers, and the buy would
     *  have gone through (hygiene H86). A miss now drops the card. */
    heldPlayer: Player | null;
    /** The empty slot being shopped for: the tapped one if it is still empty, else the
     *  first open slot. Null outside the budget build. */
    targetSlot: Slot | null;
    /** Enter the budget build in place - no route change, the left column swaps to the
     *  market while the pitch and the ratings stay put. Also used to clear it: the same
     *  action re-enters it fresh. */
    enter: (formation: Formation) => void;
    /** Hold or release a market player; its eligible slots then pulse on the pitch. */
    hold: (player: Player) => void;
    /** Buy the held player into an eligible slot, then shop the next empty one. */
    place: (slotId: string) => void;
    /** Tap an empty slot with no eligible player held: shop that position instead. */
    shop: (slotId: string) => void;
    /** Remove a bought player (dropping back to building) and shop that slot again. */
    remove: (slotId: string) => void;
    /** Commit a full budget XI the market computed. AUTOFILL takes it to 'complete'. */
    autoFill: (filled: Filled, usedPersonIds: string[]) => void;
    /** Drop the held card, for the move gesture to call when it takes over. */
    dropHeld: () => void;
}

export function useBudgetBuild({
    isBudgetBuild,
    formation,
    activeFormation,
    filled,
    pool,
    dispatch,
    onTakeCard,
    onBuy,
    scrollToPitch,
    scrollToPanel,
}: {
    isBudgetBuild: boolean;
    /** The locked formation, for the handlers that dispatch. */
    formation: Formation | null;
    /** The formation on screen, for resolving the target slot (a setup-phase preview
     *  included, so the two are not always the same object). */
    activeFormation: Formation | null;
    filled: Filled;
    /** The active pool by id: what the market offers, and so what may be held. */
    pool: Map<string, Player>;
    dispatch: (action: Action) => void;
    /** Called when a card is taken, so a move in progress can be dropped. */
    onTakeCard: () => void;
    /** Called when a buy is actually being made, with the slot and the player. It fires
     *  from inside `place`, after its guards and beside the dispatch, so a caller cannot
     *  be told about a purchase the reducer then refuses. A versus room posts the pick to
     *  the referee here; the single-player game passes nothing. */
    onBuy?: (slotId: string, player: Player) => void;
    /** Mobile choreography: holding a card scrolls to the board, buying scrolls back to
     *  the market. Passed in, because the refs belong to the layout. */
    scrollToPitch: () => void;
    scrollToPanel: () => void;
}): BudgetBuild {
    const [heldId, setHeldId] = useState<string | null>(null);
    const [targetId, setTargetId] = useState<string | null>(null);

    const clearBoth = useCallback(() => {
        setHeldId(null);
        setTargetId(null);
    }, []);

    const enter = useCallback(
        (f: Formation) => {
            clearBoth();
            dispatch({ type: 'START_BUDGET', formation: f });
        },
        [clearBoth, dispatch],
    );

    // Mobile: holding a card scrolls the pitch up, exactly as picking a drawn player
    // does. The roll draft gets that from App's `selectedPlayerId` effect; the market
    // holds its card here, so it never fired there - the same gesture with half the
    // help. `willHold` is computed before the setter rather than inside an updater,
    // because a scroll is a side effect and setState updaters can run twice.
    const hold = useCallback(
        (player: Player) => {
            onTakeCard();
            const willHold = heldId !== player.id;
            setHeldId(willHold ? player.id : null);
            if (willHold) scrollToPitch();
        },
        [heldId, onTakeCard, scrollToPitch],
    );

    const autoFill = useCallback(
        (filledXi: Filled, usedPersonIds: string[]) => {
            if (!formation) return;
            clearBoth();
            dispatch({ type: 'AUTOFILL', formation, filled: filledXi, usedPersonIds });
        },
        [formation, clearBoth, dispatch],
    );

    const place = useCallback(
        (slotId: string) => {
            const player = heldId ? (pool.get(heldId) ?? null) : null;
            if (!player || !formation) return;
            dispatch({ type: 'BUY_PLAYER', slotId, player });
            onBuy?.(slotId, player);
            setHeldId(null);
            const next = formation.slots.find((s) => s.id !== slotId && !filled[s.id]);
            setTargetId(next ? next.id : null);
            // Mobile: back up to the market for the next position, as a placement does.
            scrollToPanel();
        },
        [heldId, formation, filled, pool, dispatch, onBuy, scrollToPanel],
    );

    const shop = useCallback((slotId: string) => {
        setTargetId(slotId);
        setHeldId(null);
    }, []);

    const remove = useCallback(
        (slotId: string) => {
            dispatch({ type: 'REMOVE_PLAYER', slotId });
            setTargetId(slotId);
            setHeldId(null);
        },
        [dispatch],
    );

    const dropHeld = useCallback(() => setHeldId(null), []);

    const targetSlot =
        isBudgetBuild && activeFormation
            ? (activeFormation.slots.find((s) => s.id === targetId && !filled[s.id]) ??
              activeFormation.slots.find((s) => !filled[s.id]) ??
              null)
            : null;
    const heldPlayer = isBudgetBuild && heldId ? (pool.get(heldId) ?? null) : null;

    // The pool narrowed with a card in hand: drop the card. Deliberate, and the reason it
    // is a drop rather than a keep is that the market no longer lists that player, so
    // holding him leaves a highlighted board with nothing behind it.
    useEffect(() => {
        if (heldId && !pool.has(heldId)) setHeldId(null);
    }, [heldId, pool]);

    return {
        heldId,
        heldPlayer,
        targetSlot,
        enter,
        hold,
        place,
        shop,
        remove,
        autoFill,
        dropHeld,
    };
}
