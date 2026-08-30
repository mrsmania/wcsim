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
    /** True when the squads are DEALT rather than rolled: a versus roll room, where the
     *  referee hands them over one at a time (P13 - pre-generating the sequence would let
     *  a player read every future squad, re-roll outcomes included, off their own row).
     *
     *  It stands down everything that DECIDES a squad - the draw-next-squad effect and the
     *  local re-roll - because each of those would decide something the server owns. It
     *  does NOT stand down the scramble, which decides nothing: the caller hands the dealt
     *  squad to `deal` and the animation plays to it. Switching that off with the rest was
     *  throwing away the one part that was never the server's, and it left the moment the
     *  whole draft is about arriving as a squad that had simply appeared. */
    dealt?: boolean;
    dispatch: (action: Action) => void;
}

export interface SquadRoll {
    /** The squad the panel should show: mid-scramble it is a random one per frame, and
     *  the caller picks it over `currentSquad` while `rolling` is true. */
    displaySquad: Squad | null;
    /** Spend a re-roll. Ignores the click when there is nothing to re-roll or none left,
     *  so a stale button cannot spend one. */
    reroll: (kind: RerollKind) => void;
    /** Scramble to a squad somebody ELSE chose, which in practice is the referee dealing
     *  one in a versus room. The animation is the same one and the target is not ours to
     *  pick, which is the whole difference between this and `reroll`. */
    deal: (squad: Squad) => void;
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
    dealt = false,
    dispatch,
}: SquadRollInput): SquadRoll {
    const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
    const timerRef = useRef<number | null>(null);
    const animatingRef = useRef(false);
    // Re-entry guard for the draw-next-squad effect: once it fires a roll for the
    // current committed state it stops until that roll settles (or a placement /
    // removal changes the state), so one open slot never triggers two rolls.
    const drawGuardRef = useRef(false);
    // A squad dealt while a scramble was still running: the animation ends on this
    // instead of on the one it started for. See the settle branch of `runRoll`.
    const pendingDealRef = useRef<Squad | null>(null);
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
            pendingDealRef.current = null;
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
                    // A deal that arrived mid-scramble settles here instead, so the beat
                    // is spent once and ends on the squad the referee actually holds. It
                    // is reachable without anybody doing anything: a window expiring
                    // during the scramble auto-picks and deals the next squad. The
                    // single-player path never sets it, so this reads as `target` there.
                    const latest = pendingDealRef.current ?? target;
                    pendingDealRef.current = null;
                    setDisplaySquad(latest);
                    dispatch({ type: 'ROLL_SETTLE', squad: latest });
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
        // buying), so it must never draw a squad. Nor does a DEALT one: there the squad
        // arrives from the referee and a local draw would race it.
        const needSquad =
            !dealt && phase === 'draft' && build === 'roll' && !!formation && !currentSquad;
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
    }, [dealt, phase, build, formation, currentSquad, rolling, filled, usedPersonIds, runRoll, pool]);

    const reroll = useCallback(
        (kind: RerollKind) => {
            if (dealt || !formation || !currentSquad || rolling || rerollsLeft <= 0) return;
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
        [dealt, formation, currentSquad, filled, usedPersonIds, rerollsLeft, rolling, runRoll, pool],
    );

    /**
     * Play the scramble to a squad the referee dealt.
     *
     * EXACTLY THE SINGLE-PLAYER ANIMATION, same duration and all: a room's draft is the
     * same draft, and a shorter beat for a room would be a second scramble to keep in
     * step with the first. It costs `SCRAMBLE_MS` of a pick window that is twenty seconds
     * (P20 allows thirty) and that is accepted rather than overlooked - the deal is the
     * moment a roll draft is about, and it was arriving as a squad that had simply
     * appeared.
     *
     * It is not `reroll`: the target is the SERVER'S, so there is no draw to make and
     * nothing to spend, which is why `dealt` stands the draw and the re-roll down and
     * leaves this alone.
     */
    const deal = useCallback(
        (squad: Squad) => {
            // One beat per deal, and the newest deal wins: a second one arriving while
            // the first is still spinning re-points the settle rather than starting
            // another scramble for a squad nobody has seen yet.
            if (animatingRef.current) {
                pendingDealRef.current = squad;
                return;
            }
            runRoll(squad, false);
        },
        [runRoll],
    );

    return { displaySquad, reroll, deal };
}
