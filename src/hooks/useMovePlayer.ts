import { useCallback, useEffect, useState } from 'react';
import type { Formation } from '../domain/formations';
import type { Action, Phase } from '../state/gameReducer';

// Moving a placed player to another of his roles (`FEATURES.movePlayers`): one piece of
// transient state and the three things that touch it. Half of hygiene H80 - the other
// half is `useBudgetBuild`, and the two cross-cancel by design, which is why they were
// extracted together.
//
// The cancellation rule lives partly in the composition root on purpose: picking a
// placed player up drops whatever card was held, and taking a card drops a move in
// progress, so neither hook can own both directions without knowing about the other.

export interface MovePlayer {
    /** The slot whose player is currently being moved, or null. */
    movingSlotId: string | null;
    /** Pick a placed player up, or put him back down if he is the one already held.
     *  Clears the drawn-squad selection, which is the reducer's half of "one thing is
     *  being aimed at a time"; the caller drops the market's held card. */
    startMove: (slotId: string) => void;
    /** Drop him into the chosen slot. The reducer re-checks eligibility and ignores an
     *  invalid pair, so a stale click cannot corrupt the XI. */
    move: (toSlotId: string) => void;
    /** Abandon the move, for the other gesture to call when it takes over. */
    cancel: () => void;
}

export function useMovePlayer({
    activeFormation,
    phase,
    dispatch,
}: {
    activeFormation: Formation | null;
    phase: Phase;
    dispatch: (action: Action) => void;
}): MovePlayer {
    const [movingSlotId, setMovingSlotId] = useState<string | null>(null);

    const startMove = useCallback(
        (slotId: string) => {
            dispatch({ type: 'SELECT_PLAYER', playerId: null });
            setMovingSlotId((cur) => (cur === slotId ? null : slotId));
        },
        [dispatch],
    );

    const move = useCallback(
        (toSlotId: string) => {
            if (!movingSlotId) return;
            dispatch({ type: 'MOVE_PLAYER', fromSlotId: movingSlotId, toSlotId });
            setMovingSlotId(null);
        },
        [movingSlotId, dispatch],
    );

    const cancel = useCallback(() => setMovingSlotId(null), []);

    // A formation change (different slots) or leaving the build behind drops the move.
    // Deliberately NOT keyed on the selection: `startMove` clears it, so watching it
    // here would have a move cancel itself the moment it began.
    useEffect(() => {
        setMovingSlotId(null);
    }, [activeFormation, phase]);

    return { movingSlotId, startMove, move, cancel };
}
