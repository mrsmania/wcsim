import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '../domain/pvpWire';
import { holdLiveMatch } from '../nav/liveMatch';
import { holdVersusRoom } from '../nav/versusRoom';
import {
    RefereeError,
    joinRoom,
    readRoom,
    rerollDeal,
    seen,
    setLineup as postLineup,
    startRoom,
    submitPick,
    type PickAnswer,
} from '../state/pvp/referee';

// ---------------------------------------------------------------------------
// One room, live.
//
// Wave 5 of docs/pvp-plan.md. It holds the referee's answer, keeps it fresh, and runs
// the pick clock. Everything else about a room is rendering.
//
// THE CLIENT NEVER SUBTRACTS ONE CLOCK FROM ANOTHER (plan section 5). The referee sends
// REMAINING MILLISECONDS, not a deadline, and this counts down from the moment that
// answer arrived, measured on `performance.now()` - a monotonic clock, so a phone whose
// wall clock is two minutes fast, or that corrects itself mid-draft, does not see a
// window that expired before it opened. The countdown is RECOMPUTED from that base on
// every tick and whenever the tab comes back, never accumulated, so a backgrounded tab
// returns showing the time that is actually left rather than the time it was showing when
// it went away.
//
// THE CONTROLS LOCK EARLY, BY A MEASURED ROUND TRIP. A pick that leaves at the last
// moment arrives after the deadline and is refused, and being told "the clock beat you"
// for a tap you made in time is worse than the tap being refused on screen. So the lock
// lead is the recent round trip to the referee, measured here, floored so a fast link
// still leaves a moment.
//
// FRESHNESS IS A BROADCAST PLUS A POLL, and the poll is not a fallback nobody exercises:
// `REALTIME_URL` is an optional part of the referee's configuration, and with it absent
// the referee says so and rooms poll (referee/README.md). A room must work either way.
// ---------------------------------------------------------------------------

/** How often to re-read while something is moving (a draft, a reveal), and while it is
 *  not. The lobby number is what a broadcast normally beats; it exists so a room whose
 *  Realtime is down is slow rather than stuck. */
const POLL_BUSY_MS = 2000;
const POLL_IDLE_MS = 5000;

/** Liveness (P31): a member unseen for ninety seconds is dropped from a lobby. */
const SEEN_MS = 25_000;

/** The floor on the lock lead. Even on a perfect link the last tenth of a second is not
 *  worth offering. */
const MIN_LOCK_MS = 250;
/** And the ceiling, so one slow request does not lock the controls for a quarter of the
 *  window afterwards. */
const MAX_LOCK_MS = 2500;

export interface VersusRoom {
    view: RoomView | null;
    /** The last failure, or null. Cleared by the next answer. */
    error: RefereeError | null;
    /** True until the first answer arrives. */
    loading: boolean;
    /** Milliseconds left in YOUR pick window, counted locally; null when you have none. */
    remainingMs: number | null;
    /** True when the window is close enough to its end that a pick would not arrive in
     *  time. The board goes read-only rather than taking a tap it cannot honour. */
    locked: boolean;
    refresh: () => void;
    ready: (formationName: string, style: string, ready: boolean) => Promise<void>;
    start: () => Promise<void>;
    join: () => Promise<void>;
    reroll: () => Promise<void>;
    pick: (slotId: string, playerId: string) => Promise<PickAnswer['outcome']>;
}

/** Whether anything in this room is moving, i.e. whether to poll fast. */
function busy(view: RoomView | null): boolean {
    if (!view) return true;
    return view.status === 'drafting' || view.status === 'round';
}

export function useVersusRoom(code: string, enabled: boolean): VersusRoom {
    const [view, setView] = useState<RoomView | null>(null);
    const [error, setError] = useState<RefereeError | null>(null);
    const [loading, setLoading] = useState(true);
    // The countdown's base: the window as the server described it, and the monotonic
    // reading at the moment that description arrived.
    const clock = useRef<{ ordinal: number; remainingMs: number; at: number } | null>(null);
    const [remainingMs, setRemainingMs] = useState<number | null>(null);
    const roundTrip = useRef(400);
    const alive = useRef(true);

    // One place every answer lands, so the clock base and the chrome's pointer cannot be
    // updated in one path and forgotten in another.
    const accept = useCallback((next: RoomView) => {
        if (!alive.current) return;
        setView(next);
        setError(null);
        setLoading(false);
        const w = next.you?.window ?? null;
        clock.current = w
            ? { ordinal: w.ordinal, remainingMs: w.remainingMs, at: performance.now() }
            : null;
        setRemainingMs(w ? w.remainingMs : null);
        holdVersusRoom({
            code: next.code,
            status: next.status,
            picked: next.members.find((m) => m.userId === next.you?.userId)?.picked ?? 0,
            size: next.size,
        });
    }, []);

    /** Run a call, recording what it cost so the lock lead is a measurement. */
    const timed = useCallback(
        async <T,>(run: () => Promise<T>): Promise<T> => {
            const at = performance.now();
            try {
                return await run();
            } finally {
                const took = performance.now() - at;
                // An exponential average, so one stalled request does not set the lead
                // for the rest of the draft and one fast one does not undo a bad link.
                roundTrip.current = roundTrip.current * 0.7 + took * 0.3;
            }
        },
        [],
    );

    const refresh = useCallback(() => {
        if (!enabled || !code) return;
        void timed(() => readRoom(code))
            .then(accept)
            .catch((err: unknown) => {
                if (!alive.current) return;
                setLoading(false);
                if (err instanceof RefereeError) setError(err);
            });
    }, [code, enabled, accept, timed]);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    // First read, and re-read whenever the room changes identity.
    useEffect(() => {
        setLoading(true);
        setView(null);
        refresh();
    }, [refresh]);

    // The poll. Fast while a draft or a reveal is running, slower in a lobby.
    useEffect(() => {
        if (!enabled || !code) return;
        const every = busy(view) ? POLL_BUSY_MS : POLL_IDLE_MS;
        const t = window.setInterval(refresh, every);
        return () => window.clearInterval(t);
    }, [enabled, code, refresh, view]);

    // The broadcast (P33): a nudge saying "this room changed", never state. Each client
    // then asks for its OWN view, which is what keeps a draft private with one channel
    // for everybody. Realtime being absent or down degrades a room to the poll above.
    useEffect(() => {
        if (!enabled || !code) return;
        let cancel: (() => void) | null = null;
        let dropped = false;
        void (async () => {
            try {
                const { supabase } = await import('../state/auth');
                const channel = supabase()
                    .channel(`pvp:${code}`)
                    .on('broadcast', { event: 'room' }, () => refresh())
                    .subscribe();
                if (dropped) {
                    void supabase().removeChannel(channel);
                    return;
                }
                cancel = () => void supabase().removeChannel(channel);
            } catch {
                // No Realtime configured, or the socket refused. The poll covers it.
            }
        })();
        return () => {
            dropped = true;
            cancel?.();
        };
    }, [enabled, code, refresh]);

    // Liveness, while the room is held.
    useEffect(() => {
        if (!enabled || !code) return;
        const ping = () => void seen(code).catch(() => undefined);
        ping();
        const t = window.setInterval(ping, SEEN_MS);
        return () => window.clearInterval(t);
    }, [enabled, code]);

    // The countdown. Recomputed from the base on every tick, and again the moment the tab
    // comes back, so nothing accumulates and a backgrounded tab tells the truth.
    useEffect(() => {
        const tick = () => {
            const base = clock.current;
            if (!base) {
                setRemainingMs(null);
                return;
            }
            setRemainingMs(Math.max(0, base.remainingMs - (performance.now() - base.at)));
        };
        const t = window.setInterval(tick, 100);
        document.addEventListener('visibilitychange', tick);
        return () => {
            window.clearInterval(t);
            document.removeEventListener('visibilitychange', tick);
        };
    }, []);

    // The tab bar goes inert while YOUR window is open, the same mechanism a live match
    // reveal already uses and for a related reason: leaving mid-window does not pause the
    // clock, it spends it. The room's own Leave is still there, so nobody is trapped.
    const windowOpen = !!view?.you?.window;
    useEffect(() => (windowOpen ? holdLiveMatch() : undefined), [windowOpen]);

    const command = useCallback(
        async (run: () => Promise<RoomView>): Promise<void> => {
            try {
                accept(await timed(run));
            } catch (err) {
                if (err instanceof RefereeError) setError(err);
                throw err;
            }
        },
        [accept, timed],
    );

    const ready = useCallback(
        (formationName: string, style: string, isReady: boolean) =>
            command(() => postLineup(code, formationName, style, isReady)),
        [code, command],
    );
    const start = useCallback(() => command(() => startRoom(code)), [code, command]);
    const join = useCallback(() => command(() => joinRoom(code)), [code, command]);
    const reroll = useCallback(() => command(() => rerollDeal(code)), [code, command]);

    const pick = useCallback(
        async (slotId: string, playerId: string): Promise<PickAnswer['outcome']> => {
            const ordinal = clock.current?.ordinal;
            // No window means the clock already filled this slot, or the draft is over.
            // Saying so is better than sending an ordinal the referee will not recognise.
            if (ordinal === undefined) return 'no-window';
            const answer = await timed(() => submitPick(code, ordinal, slotId, playerId));
            accept(answer.room);
            return answer.outcome;
        },
        [code, accept, timed],
    );

    const lockLead = Math.min(MAX_LOCK_MS, Math.max(MIN_LOCK_MS, roundTrip.current));
    return {
        view,
        error,
        loading,
        remainingMs,
        locked: remainingMs !== null && remainingMs <= lockLead,
        refresh,
        ready,
        start,
        join,
        reroll,
        pick,
    };
}
