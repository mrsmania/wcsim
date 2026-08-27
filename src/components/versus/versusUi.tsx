import type { ReactNode } from 'react';
import { Check, Clock } from 'lucide-react';
import type { MemberView } from '../../domain/pvpWire';
import { CARD_FLAT, MONO_CAP } from '../matchUi';

// The versus screens' shared atoms. Small on purpose: a room reuses the build page, the
// match card and the standings the rest of the game already has, and what is genuinely
// new is the clock, the seat list and the code you read out to somebody.

/**
 * The pick clock.
 *
 * THE LOUDEST THING ON THE SCREEN, by decision (plan section 8): a draft is twenty
 * seconds a pick and the number is what the whole screen is about. It turns amber under
 * five seconds and red under two, and it says so in words as well as in colour, because
 * "it went red" is not a thing everybody can see.
 */
export function PickClock({
    remainingMs,
    ordinal,
    locked,
}: {
    remainingMs: number;
    /** Which pick this is, 1-based. */
    ordinal: number;
    /** The window is close enough to its end that a pick would not arrive in time. */
    locked: boolean;
}) {
    const secs = Math.ceil(remainingMs / 1000);
    const tone =
        locked || secs <= 2 ? 'text-loss' : secs <= 5 ? 'text-amber-ink' : 'text-ink';
    return (
        <div className={`${CARD_FLAT} flex items-center justify-between gap-4 px-4 py-3`}>
            <div>
                <div className={MONO_CAP}>Pick {ordinal} of 11</div>
                <div className="mt-0.5 text-[12px] font-semibold text-muted">
                    {locked ? 'Too late for this one' : 'Buy a player, then tap his position'}
                </div>
            </div>
            <div className={`flex items-baseline gap-1 font-mono text-4xl font-bold tabular-nums ${tone}`}>
                {secs}
                <span className="text-[13px] font-semibold">s</span>
            </div>
        </div>
    );
}

/** One player in the room: their name, and whatever this phase says about them. */
export function SeatRow({
    member,
    you,
    host,
    detail,
}: {
    member: MemberView;
    you: boolean;
    host: boolean;
    detail: ReactNode;
}) {
    return (
        <li className="flex items-center gap-3 border-b border-hair py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                {member.name}
                {you && <span className="ml-1.5 font-mono text-[10px] text-pitch">YOU</span>}
                {host && <span className="ml-1.5 font-mono text-[10px] text-muted">HOST</span>}
            </span>
            {detail}
        </li>
    );
}

/** Ready / not ready, as the lobby's own two states. */
export function ReadyMark({ ready }: { ready: boolean }) {
    return ready ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-pitch">
            <Check size={13} strokeWidth={3} /> Ready
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
            <Clock size={13} /> Choosing
        </span>
    );
}

/** The six characters somebody types to get in. Big and monospaced because it is read
 *  aloud down a phone as often as it is copied. */
export function RoomCode({ code }: { code: string }) {
    return (
        <span className="rounded-[5px] border border-line bg-chalk px-2.5 py-1 font-mono text-[18px] font-bold tracking-[0.28em] text-ink">
            {code}
        </span>
    );
}

/** A short line of state, in the room's own voice. */
export function RoomNote({ children }: { children: ReactNode }) {
    return <p className="text-[13px] leading-relaxed text-muted">{children}</p>;
}
