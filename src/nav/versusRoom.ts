import { useEffect, useState } from 'react';

/**
 * "You are in a versus room, and it is this one."
 *
 * Wave 5 of docs/pvp-plan.md. The chrome needs it for two things the plan asks for: a
 * live room is the top of the Continue precedence (room, then run, then build), and a
 * one-line strip sits in the chrome while you hold one, so tapping the crest out of habit
 * mid-room does not strand you on your solo build with a clock running.
 *
 * IT IS NOT PROGRESS AND IT DOES NOT GO THROUGH THE STORE. A room may never write the
 * player's saved game (P29), and this is not the player's anyway: it is a pointer to
 * something the SERVER owns, scoped to one account and one tab. So it lives here, as
 * module state mirrored into `sessionStorage` - which is per-tab, dies with the tab, and
 * is nothing the guest-to-account import should ever carry.
 *
 * The pointer is a convenience, never the truth. The referee is the truth: re-entering
 * the six-character code always returns you to the room, which is what makes losing this
 * (a different tab, a cleared session) a nuisance rather than a dead end.
 */

const KEY = 'wcsim_versus_room';

export interface HeldRoom {
    code: string;
    status: 'lobby' | 'drafting' | 'round' | 'ended';
    /** The strip's whole sentence, written by `roomLine` (domain/pvpView) when the answer
     *  arrived. The chrome used to compose it from a status and a pick count, which was
     *  the same job done twice and got it wrong as soon as a room had more than one round:
     *  "match on" is what a two-player room plays, and a room of eight plays a
     *  quarter-final. Holding the line rather than the ingredients means the room's own
     *  vocabulary reaches the chrome unchanged. */
    line: string;
}

function read(): HeldRoom | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as Partial<HeldRoom>;
        return typeof v?.code === 'string' && typeof v.status === 'string'
            ? { code: v.code, status: v.status, line: v.line ?? 'in progress' }
            : null;
    } catch {
        // A private window, storage turned off, or a shape from an older build. Losing
        // the pointer costs a code re-entry and nothing else.
        return null;
    }
}

let held: HeldRoom | null = read();
const subs = new Set<(room: HeldRoom | null) => void>();

const emit = (): void => {
    for (const s of subs) s(held);
};

/** Record which room you are in, or clear it with null. */
export function holdVersusRoom(room: HeldRoom | null): void {
    // An ended room is over: it is still readable by its code, but it is not something to
    // be offered as "carry on".
    const next = room && room.status !== 'ended' ? room : null;
    const same =
        next?.code === held?.code && next?.status === held?.status && next?.line === held?.line;
    if (same) return;
    held = next;
    try {
        if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
        else sessionStorage.removeItem(KEY);
    } catch {
        // See `read`: the in-memory copy still works for this navigation.
    }
    emit();
}

/** The room you hold, or null. */
export function heldVersusRoom(): HeldRoom | null {
    return held;
}

/** Subscribe to it (re-renders on change). */
export function useHeldVersusRoom(): HeldRoom | null {
    const [room, setRoom] = useState<HeldRoom | null>(held);
    useEffect(() => {
        subs.add(setRoom);
        setRoom(held);
        return () => {
            subs.delete(setRoom);
        };
    }, []);
    return room;
}
