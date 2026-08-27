import { useState, type ReactNode } from 'react';
import { Check, Clock, Flag } from 'lucide-react';
import { reportName, type ReportOutcome } from '../../state/pvp/records';
import type { MemberView } from '../../domain/pvpWire';
import { CARD_FLAT, MONO_CAP } from '../matchUi';
import type { RefereeMessage } from './refereeMessage';

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
    hint,
}: {
    remainingMs: number;
    /** Which pick this is, 1-based. */
    ordinal: number;
    /** The window is close enough to its end that a pick would not arrive in time. */
    locked: boolean;
    /** What to do with the window, which is not the same sentence in both kinds of room:
     *  you BUY in a budget room and you are DEALT in a roll one. */
    hint: string;
}) {
    const secs = Math.ceil(remainingMs / 1000);
    const tone =
        locked || secs <= 2 ? 'text-loss' : secs <= 5 ? 'text-amber-ink' : 'text-ink';
    return (
        <div className={`${CARD_FLAT} flex items-center justify-between gap-4 px-4 py-3`}>
            <div>
                <div className={MONO_CAP}>Pick {ordinal} of 11</div>
                <div className="mt-0.5 text-[12px] font-semibold text-muted">
                    {locked ? 'Too late for this one' : hint}
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
                {you && <span className="ml-1.5 font-mono text-[10px] text-pitch-ink">YOU</span>}
                {host && <span className="ml-1.5 font-mono text-[10px] text-muted">HOST</span>}
            </span>
            {detail}
        </li>
    );
}

/** Ready / not ready, as the lobby's own two states. */
export function ReadyMark({ ready }: { ready: boolean }) {
    return ready ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-pitch-ink">
            <Check size={13} strokeWidth={3} /> Ready
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">
            <Clock size={13} /> Choosing
        </span>
    );
}

/**
 * Report a display name (P22).
 *
 * NO WORD FILTER AND NO AUTOMATIC ACTION: the owner reads the reports and renames or
 * removes an account by hand, which is the right amount of machinery for a game this size.
 * So there is no category to pick and no text to write - the button IS the report, and it
 * confirms once before sending because a report about a person should not be one stray tap.
 *
 * Pressing it twice is not a failure. One report per person per target is a unique index,
 * because a report button is not a vote, so the second press reads as "yes, we have it".
 */
export function ReportName({ userId, name }: { userId: string; name: string }) {
    const [asking, setAsking] = useState(false);
    const [done, setDone] = useState<ReportOutcome | null>(null);

    if (done) {
        return (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
                {done === 'failed' ? 'Not sent' : 'Reported'}
            </span>
        );
    }
    if (!asking) {
        return (
            <button
                type="button"
                aria-label={`Report the name ${name}`}
                title="Report this name"
                className="text-dim transition hover:text-loss"
                onClick={() => setAsking(true)}
            >
                <Flag size={13} strokeWidth={2.5} />
            </button>
        );
    }
    return (
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
            <button
                type="button"
                className="font-bold text-loss"
                onClick={() => void reportName(userId).then(setDone)}
            >
                Report
            </button>
            <button type="button" className="text-dim" onClick={() => setAsking(false)}>
                Cancel
            </button>
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

/**
 * A refusal, said in words, with the referee's own code underneath.
 *
 * The code line is not debris: the referee returns it precisely so a deployment can be
 * debugged, and a player reporting "it says HTTP 401 unauthorized bad-signature" has
 * handed over the whole answer. `deployment` marks the ones that are the owner's to fix
 * rather than anything the player did, so the copy does not send them round in circles.
 */
export function RefereeProblem({
    message,
    action,
}: {
    message: RefereeMessage;
    /** Something to DO about it, when the refusal has an answer. Only one does: being
     *  told you are already in a room with no route to that room is a dead end. */
    action?: ReactNode;
}) {
    return (
        <div className="mt-3 rounded-[5px] border border-loss/50 bg-loss/[0.07] px-3 py-2.5">
            <p className="text-[13px] font-semibold leading-snug text-ink">{message.text}</p>
            {action && <div className="mt-2">{action}</div>}
            {message.deployment && (
                <p className="mt-1 text-[12px] text-muted">
                    This one is a server setting, not something to retry.
                </p>
            )}
            {message.raw && (
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
                    {message.raw}
                </p>
            )}
        </div>
    );
}
