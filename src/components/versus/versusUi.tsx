import { useState, type ReactNode } from 'react';
import { Bot, Check, Clock, Flag, Link2, Share2, UserMinus, UserPlus } from 'lucide-react';
import { reportName, type ReportOutcome } from '../../state/pvp/records';
import { inviteText } from '../../domain/pvpView';
import type { MemberView } from '../../domain/pvpWire';
import { CARD_FLAT, MONO_CAP, Meter, btn } from '../matchUi';
import type { RefereeMessage } from './refereeMessage';

// The versus screens' shared atoms. Small on purpose: a room reuses the build page, the
// match card and the standings the rest of the game already has, and what is genuinely
// new is the clock, the seat list and the code you read out to somebody.

/**
 * The pick clock, as a bar that drains.
 *
 * THE LOUDEST THING ON THE SCREEN, by decision (plan section 8): a draft is twenty seconds
 * a pick and how long is left is what the whole screen is about. It was a big numeral until
 * 2026-08-30 and it is a BAR now, for the reason a bar beats a number at this job: what a
 * player needs from it is "how much of my window is gone", which is a proportion, and
 * reading a proportion off a bar costs a glance where reading it off "13" costs arithmetic
 * against a window length nobody memorised. It also degrades better - a bar a quarter full
 * is still legible out of the corner of an eye, over a market you are reading.
 *
 * IT NEEDS THE WINDOW LENGTH, which is the one thing a number did not: a proportion has no
 * meaning without what it is a proportion OF, and the host chooses between twenty and
 * thirty seconds (P20). Passing the remaining milliseconds alone would draw a thirty-second
 * window as though it were a twenty.
 *
 * It turns amber under five seconds and red under two, AND SAYS SO IN WORDS, because "it
 * went red" is not a thing everybody can see - and with the numeral gone the colour would
 * otherwise be the only thing carrying it. The count itself stays available to a screen
 * reader through `aria-valuetext`, which is the right place for a number nobody wants on
 * screen.
 */
export function PickClock({
    remainingMs,
    windowMs,
    ordinal,
    locked,
    hint,
}: {
    remainingMs: number;
    /** How long this room's window is, in milliseconds: `pickSeconds * 1000` (P20 allows
     *  twenty or thirty). Without it there is no proportion to draw. */
    windowMs: number;
    /** Which pick this is, 1-based. */
    ordinal: number;
    /** The window is close enough to its end that a pick would not arrive in time. */
    locked: boolean;
    /** What to do with the window, which is not the same sentence in both kinds of room:
     *  you BUY in a budget room and you are DEALT in a roll one. */
    hint: string;
}) {
    const secs = Math.ceil(remainingMs / 1000);
    const left = Math.max(0, secs);
    const urgent = locked || secs <= 2;
    const near = !urgent && secs <= 5;
    const pct = windowMs > 0 ? (remainingMs / windowMs) * 100 : 0;
    // A surface rather than text, so the plain tokens are right here: it is `amber-ink`
    // and `pitch-ink` that exist for the other case.
    const fill = urgent ? 'bg-loss' : near ? 'bg-amber' : 'bg-pitch';
    return (
        <div
            className={`${CARD_FLAT} px-4 py-3`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(windowMs / 1000)}
            aria-valuenow={left}
            aria-valuetext={`${left} second${left === 1 ? '' : 's'} left of this pick`}
        >
            {/* STACKED, not a caption opposite a sentence: the hint runs to eight words and
                a phone is 380px wide, so side by side it wraps "Pick 4 of 11" onto two
                lines to make room for it. */}
            <div className={MONO_CAP}>Pick {ordinal} of 11</div>
            <div
                className={`mt-0.5 text-[12px] font-semibold ${
                    urgent ? 'text-loss' : near ? 'text-amber-ink' : 'text-muted'
                }`}
            >
                {locked ? 'Too late for this one' : urgent || near ? 'Nearly out of time' : hint}
            </div>
            {/* Keyed on the window, so a new pick starts a full bar rather than sliding
                back up to it: the transition is there to make ten updates a second read as
                one continuous drain, and it would animate the reset too. */}
            <Meter
                key={ordinal}
                pct={pct}
                height={12}
                fill={`${fill} transition-[width] duration-100 ease-linear`}
                className="mt-2"
            />
        </div>
    );
}

/**
 * THE WHOLE DRAFT'S CLOCK (P52), which is what a budget room runs instead of eleven windows.
 *
 * It is the same bar as `PickClock` and deliberately NOT the same component. Three things
 * differ and each of them is the mode: it counts minutes rather than seconds, so the units
 * change and "nearly out of time" has to mean half a minute rather than five; it is never
 * `locked`, because there is no per-tap deadline to beat - a board that arrives late is
 * refused and the one the referee already holds is the one that plays; and what it says is
 * how much of the DRAFT is left rather than how much of a pick, which is the difference
 * the mode exists for.
 */
export function DraftClock({
    remainingMs,
    totalMs,
    filled,
    done,
}: {
    remainingMs: number;
    /** How long this room's whole draft is, in milliseconds. Without it there is no
     *  proportion to draw - the same trap `PickClock` has, and the host chooses between
     *  three lengths here rather than two. */
    totalMs: number;
    /** How many of the eleven are placed, which is what the clock is about. */
    filled: number;
    /** They have said they are through, so the clock is somebody else's problem now. */
    done: boolean;
}) {
    const secs = Math.max(0, Math.ceil(remainingMs / 1000));
    const urgent = secs <= 15;
    const near = !urgent && secs <= 45;
    const pct = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
    const fill = urgent ? 'bg-loss' : near ? 'bg-amber' : 'bg-pitch';
    const mins = Math.floor(secs / 60);
    const left = mins > 0 ? `${mins}m ${String(secs % 60).padStart(2, '0')}s` : `${secs}s`;
    return (
        <div
            className={`${CARD_FLAT} px-4 py-3`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(totalMs / 1000)}
            aria-valuenow={secs}
            aria-valuetext={`${left} left of the draft`}
        >
            <div className={MONO_CAP}>
                {filled} of 11 bought &middot; {left} left
            </div>
            <div
                className={`mt-0.5 text-[12px] font-semibold ${
                    urgent ? 'text-loss' : near ? 'text-amber-ink' : 'text-muted'
                }`}
            >
                {done
                    ? 'You are done. Waiting for the others.'
                    : urgent
                      ? 'Almost out of time - anything empty gets filled for you'
                      : near
                        ? 'Not long left'
                        : 'Buy, move and sell as much as you like until you say you are done'}
            </div>
            <Meter
                pct={pct}
                height={12}
                fill={`${fill} transition-[width] duration-100 ease-linear`}
                className="mt-2"
            />
        </div>
    );
}

/**
 * KICK-OFF. The three seconds between the room being ready and the draft starting.
 *
 * IT IS FULL SCREEN BECAUSE IT IS THE MOMENT THE ROOM HAS BEEN WAITING FOR, and because
 * what happens at zero is a twenty-second clock: somebody still reading the formation chips
 * when the first pick window opens has lost a fifth of it. Everything else on the lobby can
 * wait three seconds, and blocking the taps is part of the point - a shape changed at
 * "one" would not reach the server before the draft did.
 *
 * IT IS THE COUNT AND NOTHING ELSE, and that is a correction (2026-09-01, reported from the
 * game). At zero it used to swap in a SECOND screen - a big "Kick-off" over a line saying
 * the room was beginning - and hold that until the draft arrived. What arrives is one round
 * trip away, so the screen was on and gone again inside a fraction of a second: nobody could
 * read it, which is the one fault a screen whose whole content is words can have. So the
 * cover lifts the moment the count runs out, and what follows is the draft itself with the
 * first squad rolling in front of you. The gap shows the LOBBY, which is both honest - the
 * room genuinely has not started yet - and where a kick-off that never lands falls back to
 * anyway, so it is one fallback rather than two.
 *
 * It sits UNDER the shared `Overlay` (`z-[80]`) and over the phone's tab bar (`z-20`), so a
 * sticker lightbox or a reward picker still comes out on top of it. Nothing here can be
 * dismissed: the room is starting whether or not this screen is looked at, which is the
 * same rule the reveal windows keep.
 *
 * `secondsLeft` is always one or more: the caller unmounts this at zero, which is the whole
 * of the change above.
 */
export function KickoffCountdown({ secondsLeft }: { secondsLeft: number }) {
    return (
        <div
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-ground px-6 text-center"
            role="status"
            aria-live="assertive"
        >
            <div className={MONO_CAP}>Everybody is ready</div>
            {/* `tabular-nums` so 3, 2 and 1 do not shift the layout, and a key on the value
                so the fade plays again on each tick rather than once. */}
            <div
                key={secondsLeft}
                className="animate-kickoff font-display text-[120px] font-extrabold leading-none tabular-nums text-pitch-ink"
            >
                {secondsLeft}
            </div>
            <p className="text-[15px] font-bold text-ink">The draft starts</p>
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
                {/* A practice opponent is marked on the seat, not by its name: the name is
                    already unlike a person's, and one player in a room of eight scanning
                    for who is real should not have to read eight of them to find out. */}
                {member.bot && (
                    <Bot
                        size={13}
                        strokeWidth={2.5}
                        aria-label="Practice opponent"
                        className="mr-1.5 inline align-[-2px] text-muted"
                    />
                )}
                {member.name}
                {you && <span className="ml-1.5 font-mono text-[10px] text-pitch-ink">YOU</span>}
                {host && <span className="ml-1.5 font-mono text-[10px] text-muted">HOST</span>}
            </span>
            {detail}
        </li>
    );
}

/** A chair nobody is sitting in. Drawn as a row rather than left out, so the lobby shows
 *  the whole room: dimmed and dashed, because it is the one row that is not a person and
 *  should not read as one waiting. */
export function EmptySeat() {
    return (
        <li className="flex items-center gap-3 border-b border-hair py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-dim">
                <UserPlus
                    size={13}
                    strokeWidth={2.5}
                    aria-hidden
                    className="mr-1.5 inline align-[-2px]"
                />
                Empty seat
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                Waiting
            </span>
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

/**
 * Throw somebody out, as the host.
 *
 * IT IS `ReportName`'S TWIN, deliberately: an icon on the seat row, an inline confirm, and
 * nothing else. Those are the only two things you ever do ABOUT another person in this
 * game, they sit on the same row inches apart, and giving them different shapes would make
 * the more serious of the two the easier to hit by accident.
 *
 * IT CONFIRMS, and the confirm NAMES THEM. The rows are a phone-width list of near
 * identical lines, so "Remove" alone would be a stray tap away from throwing out the wrong
 * person - and unlike a report this cannot be taken back: the removal sticks, or the player
 * simply walks back in on their next read.
 *
 * NO "REMOVED" STATE afterwards, which is where it stops being `ReportName`'s twin. A
 * report leaves the person sitting there, so the button has to say it was sent; a removal
 * takes the whole ROW away with it, and the seat is drawn empty by the next answer.
 */
export function RemoveSeat({ name, onRemove }: { name: string; onRemove: () => void }) {
    const [asking, setAsking] = useState(false);

    if (!asking) {
        return (
            <button
                type="button"
                aria-label={`Remove ${name} from the room`}
                title="Remove from the room"
                className="text-dim transition hover:text-loss"
                onClick={() => setAsking(true)}
            >
                <UserMinus size={13} strokeWidth={2.5} />
            </button>
        );
    }
    return (
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
            <button
                type="button"
                className="font-bold text-loss"
                onClick={() => {
                    setAsking(false);
                    onRemove();
                }}
            >
                Remove
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

/**
 * Getting somebody else into this room: the code, a link, and the phone's own share sheet.
 *
 * THE CODE ALONE WAS NOT AN INVITATION. A room is opened and then pasted into a message,
 * and reading six characters out to somebody so they can type them into a form is the long
 * way round of that - so the LINK is the primary action here, and arriving on it takes the
 * seat with no further step (`RoomScreen`). The code stays because it is what somebody says
 * out loud, and because a link is no use over the phone.
 *
 * SHARE OPENS THE SYSTEM SHEET (`navigator.share`) rather than a menu of our own. That is
 * the whole point of it: the destinations are the ones already on the person's phone, and
 * nothing here has to know what they are. It is offered only where the browser has it,
 * which is most phones and few desktops, so Copy is always there beside it.
 *
 * Both say what happened, in place and briefly. A copy that gives no sign is a copy you do
 * twice; a share the reader cancels is not a failure and says nothing.
 *
 * THE SENTENCE MUST NOT CARRY THE LINK. The sheet takes `text` and `url` as two fields and
 * most targets paste both, so an invitation that ended in the address sent it twice.
 */
export function InviteRoom({ code, url }: { code: string; url: string }) {
    const [said, setSaid] = useState<'copied' | 'failed' | null>(null);

    const say = (what: 'copied' | 'failed'): void => {
        setSaid(what);
        window.setTimeout(() => setSaid(null), 2000);
    };

    const copy = (): void => {
        void writeToClipboard(url).then((ok) => say(ok ? 'copied' : 'failed'));
    };

    const share = (): void => {
        // A cancelled share rejects, and a cancellation is not a failure: the reader
        // changed their mind, which is a thing the sheet is FOR.
        void navigator
            .share({ title: `Mondialino room ${code}`, text: inviteText(code), url })
            .catch(() => undefined);
    };

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <RoomCode code={code} />
                <button type="button" className={btn('secondary', 'compact')} onClick={copy}>
                    <Link2 size={13} strokeWidth={2.5} className="mr-1.5 inline align-[-2px]" />
                    Copy link
                </button>
                {typeof navigator !== 'undefined' && !!navigator.share && (
                    <button type="button" className={btn('secondary', 'compact')} onClick={share}>
                        <Share2 size={13} strokeWidth={2.5} className="mr-1.5 inline align-[-2px]" />
                        Share
                    </button>
                )}
            </div>
            {said && (
                <p
                    className={`mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                        said === 'copied' ? 'text-pitch-ink' : 'text-loss'
                    }`}
                >
                    {said === 'copied' ? 'Link copied' : 'Could not copy - the link is above'}
                </p>
            )}
        </div>
    );
}

/**
 * Put text on the clipboard, whatever the browser allows.
 *
 * `navigator.clipboard` needs a secure context, so it is absent over plain http - which is
 * exactly how this app is served from the NAS on a LAN, and a Copy button that silently
 * does nothing there is worse than no button. The old `execCommand` route still works in
 * every browser that lacks the new one, so it is the fallback rather than a shim.
 */
async function writeToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Denied, or no permission. Fall through and try the old way.
    }
    try {
        const box = document.createElement('textarea');
        box.value = text;
        // Off-screen rather than hidden: `display: none` cannot be selected.
        box.style.position = 'fixed';
        box.style.left = '-9999px';
        document.body.appendChild(box);
        box.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(box);
        return ok;
    } catch {
        return false;
    }
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
