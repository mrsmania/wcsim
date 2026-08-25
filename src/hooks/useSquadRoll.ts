import { useCallback, useEffect, useRef, useState } from 'react';
import { SQUADS } from '../data/squads';
import type { Squad } from '../data/types';
import {
    positionsWithOpenSlot,
    rollAnotherCup,
    rollAnotherTeam,
    rollAny,
    type Filled,
    type RerollKind,
} from '../domain/draft';
import type { Formation } from '../domain/formations';
import type { Action, BuildMethod, Phase } from '../state/gameReducer';
import { SCRAMBLE_MS } from './motion';

// The roll draft's two moving parts, which used to sit in the composition root and were
// the subtlest code in it (hygiene H79): the scramble ANIMATION, and the policy that
// decides when to draw the next squad at all. Neither is composition, and both are
// entirely about the roll build - the budget build never draws anything.
//
// Four refs, and every one of them is load-bearing. Do not "simplify" them without
// reading what each is for; between them they are the difference between a draft that
// works and a squad box stuck on "Drawing a squad...".

/** Everything the roll needs. All of it is the reducer's committed state plus the active
 *  pool - the hook holds no game state of its own beyond the scramble frame. */
export interface SquadRollInput {
    phase: Phase;
    /** The budget build fills its slots by buying, so it must never draw a squad. */
    build: BuildMethod;
    formation: Formation | null;
    currentSquad: Squad | null;
    /** The reducer's flag: a roll has been requested and has not settled. */
    rolling: boolean;
    filled: Filled;
    usedPersonIds: string[];
    rerollsLeft: number;
    pool: readonly Squad[];
    dispatch: (action: Action) => void;
}

export interface SquadRoll {
    /** The squad the panel should show: mid-scramble it is a random one per frame, and
     *  the caller picks it over `currentSquad` while `rolling` is true. */
    displaySquad: Squad | null;
    /** Spend a re-roll. Ignores the click when there is nothing to re-roll or none left,
     *  so a stale button cannot spend one. */
    reroll: (kind: RerollKind) => void;
}

export function useSquadRoll({
    phase,
    build,
    formation,
    currentSquad,
    rolling,
    filled,
    usedPersonIds,
    rerollsLeft,
    pool,
    dispatch,
}: SquadRollInput): SquadRoll {
    const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
    const timerRef = useRef<number | null>(null);
    const animatingRef = useRef(false);
    // Re-entry guard for the draw-next-squad effect: once it fires a roll for the
    // current committed state it stops until that roll settles (or a placement /
    // removal changes the state), so one open slot never triggers two rolls.
    const drawGuardRef = useRef(false);
    // The id of the last squad that was in hand, so the next auto-draw can exclude
    // it (never scramble straight back to the same squad). Cleared on reset.
    const lastSquadIdRef = useRef<string | null>(null);

    useEffect(
        () => () => {
            // Clear any in-flight scramble timer on unmount. Also reset the animation
            // flag so a roll that was interrupted here (e.g. React StrictMode's dev
            // remount clearing the timer while `rolling` is still true) is detected as
            // orphaned by the draw-next-squad effect and restarted, rather than leaving
            // the squad box stuck on "Drawing a squad...".
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = null;
            animatingRef.current = false;
        },
        [],
    );

    // Animate a scramble through random squads, then settle on `target`.
    const runRoll = useCallback(
        (target: Squad | null, isReroll: boolean) => {
            if (!target || animatingRef.current) return;
            animatingRef.current = true;
            dispatch({ type: 'ROLL_START', isReroll });

            let delay = 55;
            let elapsed = 0;
            let lastIdx = -1;
            const spin = () => {
                // Cycle to a *different* squad each tick so the scramble reads clearly.
                let idx = Math.floor(Math.random() * SQUADS.length);
                if (SQUADS.length > 1 && idx === lastIdx) idx = (idx + 1) % SQUADS.length;
                lastIdx = idx;
                setDisplaySquad(SQUADS[idx]);
                elapsed += delay;
                delay = Math.min(delay * 1.13, 260);
                if (elapsed < SCRAMBLE_MS) {
                    timerRef.current = window.setTimeout(spin, delay);
                } else {
                    setDisplaySquad(target);
                    dispatch({ type: 'ROLL_SETTLE', squad: target });
                    animatingRef.current = false;
                }
            };
            spin();
        },
        [dispatch],
    );

    // Remember the squad currently in hand so the next auto-draw can exclude it.
    // Cleared back at setup (a fresh run) so the very first roll excludes nothing.
    useEffect(() => {
        if (phase === 'setup') lastSquadIdRef.current = null;
        else if (currentSquad) lastSquadIdRef.current = currentSquad.id;
    }, [phase, currentSquad]);

    // Draw the next squad from committed state. Whenever the draft has an open slot
    // and no squad in hand (and nothing is rolling), roll one. This is the single
    // owner of "draw the next squad": it subsumes the first roll on START_DRAFT,
    // the roll after a placement (PLACE_PLAYER clears currentSquad), and the roll
    // for a freed slot after REMOVE_PLAYER when the XI was complete. Rerolls stay
    // explicit (they keep a squad in hand / set rolling, so this never interferes).
    useEffect(() => {
        // Roll build only: the budget build has no rolling (its slots are filled by
        // buying), so it must never draw a squad.
        const needSquad = phase === 'draft' && build === 'roll' && !!formation && !currentSquad;
        // `rolling` is true but no animation is actually running: the in-flight
        // scramble was interrupted (a reload/StrictMode remount cleared its timer).
        // Recover by rolling again, otherwise the squad box stays on "Drawing...".
        const orphaned = needSquad && rolling && !animatingRef.current;
        const shouldDraw = (needSquad && !rolling) || orphaned;
        if (!shouldDraw) {
            // No draw pending (a squad is in hand, or a real roll is animating, or not
            // in the draft): release the guard so the next open slot triggers one roll.
            drawGuardRef.current = false;
            return;
        }
        // Guard against double rolls, except when recovering an orphaned roll.
        if (drawGuardRef.current && !orphaned) return;
        drawGuardRef.current = true;
        const open = positionsWithOpenSlot(formation, filled);
        const used = new Set(usedPersonIds);
        runRoll(rollAny(pool, open, used, lastSquadIdRef.current), false);
    }, [phase, build, formation, currentSquad, rolling, filled, usedPersonIds, runRoll, pool]);

    const reroll = useCallback(
        (kind: RerollKind) => {
            if (!formation || !currentSquad || rolling || rerollsLeft <= 0) return;
            const open = positionsWithOpenSlot(formation, filled);
            const used = new Set(usedPersonIds);
            const target =
                kind === 'team'
                    ? rollAnotherTeam(pool, currentSquad, open, used)
                    : kind === 'cup'
                      ? rollAnotherCup(pool, currentSquad, open, used)
                      : rollAny(pool, open, used, currentSquad.id);
            runRoll(target, true);
        },
        [formation, currentSquad, filled, usedPersonIds, rerollsLeft, rolling, runRoll, pool],
    );

    return { displaySquad, reroll };
}
