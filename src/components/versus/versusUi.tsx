import { useState, type ReactNode } from 'react';
import {
    Bot,
    Check,
    ChevronDown,
    Clock,
    Link2,
    RotateCw,
    Share2,
    UserMinus,
    UserPlus,
} from 'lucide-react';
import { duelAlert, duelLine, duelRules, duelTurn, inviteText, seatCounts } from '../../domain/pvpView';
import type { DuelRow, MemberView } from '../../domain/pvpWire';
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
                className="animate-kickoff font-display text-[120px] font-bold leading-none tabular-nums text-pitch-ink"
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
                {you && <span className="ml-1.5 font-mono text-[10px] text-pitch-ink">You</span>}
                {host && <span className="ml-1.5 font-mono text-[10px] text-muted">Host</span>}
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
            <span className="font-mono text-[10px] text-dim">
                Waiting
            </span>
        </li>
    );
}

/** Ready / not ready, as the lobby's own two states. */
export function ReadyMark({ ready }: { ready: boolean }) {
    return ready ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-pitch-ink">
            <Check size={13} strokeWidth={3} /> Ready
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-dim">
            <Clock size={13} /> Choosing
        </span>
    );
}

/**
 * Throw somebody out, as the host.
 *
 * THE ONLY THING YOU EVER DO ABOUT ANOTHER PERSON IN THIS GAME, since 2026-09-02: there
 * used to be a report-this-name flag beside it, and the host's removal replaced it (P22
 * is answered by the host now, not by a queue the owner reads). So this is the whole of
 * the answer to a name or a person you want nothing to do with, which is the reason it
 * confirms rather than firing on one tap.
 *
 * IT CONFIRMS, and the confirm NAMES THEM. The rows are a phone-width list of near
 * identical lines, so "Remove" alone would be a stray tap away from throwing out the wrong
 * person - and this cannot be taken back: the removal sticks, and there is no undo but
 * sending them the link again.
 *
 * NO "REMOVED" STATE afterwards. A removal takes the whole ROW away with it, and the seat
 * is drawn empty by the next answer, so there is nothing left to caption.
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
        <span className="flex items-center gap-2 font-mono text-[10px]">
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
                    className={`mt-1.5 font-mono text-[10px] font-bold ${
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
                <p className="mt-1.5 font-mono text-[10px] text-dim">
                    {message.raw}
                </p>
            )}
        </div>
    );
}

// --- THE VERSUS TAB'S OWN FURNITURE ----------------------------------------
// Added 2026-09-15 with the page rework (docs/redesign-2026/turf-flat/versus-option-2.html).
// The page drew five criticisms - too much text, the history buries the action, the lobby
// does not look like a lobby, too many buttons, no guidance - and three of the five are
// answered by things that had no name here: a visible section heading, a setting that folds
// while still saying what it is set to, and a room's seats drawn rather than counted in
// words.

/**
 * A visible section heading, which is the whole of the "no guidance" complaint.
 *
 * The page used to mark its parts with `MONO_CAP`, a 10px grey caption, so a reader scanning
 * it had nothing at heading weight to land on and the whole thing read as an undivided stack
 * of cards. This is the rule the album and the career page already use - a display title over
 * `border-b-2 border-ink` - written here rather than shared, because both of those carry
 * their own copy of it and folding all three into one atom is a separate job in files another
 * session is holding.
 *
 * `count` is the quiet figure beside it ("4") and `end` the one control a section may own,
 * which in practice is Refresh.
 */
export function SectionHead({
    title,
    count,
    end,
}: {
    title: string;
    count?: ReactNode;
    end?: ReactNode;
}) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b-2 border-ink pb-2">
            <h3 className="font-display text-[17px] font-bold tracking-[-0.01em]">{title}</h3>
            {count}
            {end && <div className="ml-auto">{end}</div>}
        </div>
    );
}

/**
 * One duel on a list, wherever that list is.
 *
 * THE ACTION IS WHAT THE ROW IS FOR, and there are three of them: a match nobody has
 * watched is the loudest thing on the versus page, then a team that is not sent, then
 * everything else, which is a link to look at. `duelAlert` decides the first two and it is
 * shared with the chrome's strip, so the tab and the page can never disagree about what is
 * waiting.
 *
 * IT LIVES HERE RATHER THAN ON THE VERSUS PAGE because the archive moved to Records
 * (2026-09-17). The two readers want the identical row and differ only in what they pass:
 * versus lists the ones you can still act on and keeps their codes, Records lists the
 * finished ones and drops them.
 *
 * `code` is FALSE on a finished one, which is the owner's third correction to the page
 * rework: a code is how you reach a room, and a room that has been played is not going
 * anywhere. An open one keeps it, and has to - a challenge nobody has taken up has no other
 * identity, since the opponent column reads "Nobody yet" until somebody follows the link.
 *
 * `go` IS HANDED THE CODE AND NOT A URL, because the two pages send a row to two different
 * addresses: the versus page opens a room at the versus door, and the archive opens one at
 * its own, so that the Records tab stays lit while you read your own match. A row has no
 * business knowing which page it is on, so it says WHICH room and the page says where.
 */
export function DuelLine({
    row,
    watched,
    code = true,
    go,
}: {
    row: DuelRow;
    watched: ReadonlySet<string>;
    code?: boolean;
    go: (code: string) => void;
}) {
    const alert = duelAlert(row, watched);
    const turn = duelTurn(row);
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink">
                    {row.opponentName || 'Nobody yet'}
                    {code && (
                        <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                            {row.code}
                        </span>
                    )}
                </div>
                <div
                    className={`text-[12px] ${alert ? 'font-semibold text-pitch-ink' : 'text-muted'}`}
                >
                    {alert === 'watch' ? 'The match has been played' : duelLine(row)}
                    {/* What it plays is worth knowing while there is still a team to build
                        and is noise once there is not: a finished row's own line is the
                        result, and appending "roll for your XI, one man from each squad" to
                        it wrapped every alert onto a second line to say nothing. */}
                    {row.status !== 'ended' && <> &middot; {duelRules(row)}</>}
                </div>
            </div>
            <button
                type="button"
                className={`shrink-0 ${btn(alert ? 'primary' : 'secondary', 'compact')}`}
                onClick={() => go(row.code)}
            >
                {alert === 'watch'
                    ? 'Watch it'
                    : alert === 'your-move'
                      ? 'Your move'
                      : turn === 'done'
                        ? 'See it'
                        : 'Open'}
            </button>
        </li>
    );
}

/** The quiet figure beside a section heading. */
export function HeadCount({ children }: { children: ReactNode }) {
    return (
        <span className="font-mono text-[11px] font-bold tabular-nums text-muted">{children}</span>
    );
}

/** Refresh, as a button somebody can tell is a button. It says nothing about when it last
 *  looked: that line belongs under the list, where it describes the list rather than the
 *  control. */
export function RefreshButton({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={btn('secondary', 'compact')}>
            <RotateCw className="size-3" aria-hidden />
            Refresh
        </button>
    );
}

/**
 * A room's seats, drawn.
 *
 * WHERE IT SITS IS THE POINT, and it is the owner's own correction: between the room's name
 * and the way in, never at the head of the row. Leading with it started every row of the
 * list with a different shape - two dots, then eight, then four - which is the noise. Ending
 * with it, right-aligned in a slot wide enough for eight, gives the list three columns that
 * line up, so the eye runs down rather than hunting along each line.
 *
 * THREE STATES, because a chair can be taken by two different things. A solid green dot is a
 * person; a grey one is a practice opponent, which is genuinely taken and still yields to
 * anybody who turns up (`joinRoom`), so it is neither a person nor a free chair; a hollow one
 * is free. `pitch-ink` and not `pitch-dark` for the person, because the surface green is a
 * near-black on graphite and a taken seat has to read on both papers.
 *
 * The count is the accessible name, since a row of dots says nothing to a screen reader and
 * "3 people, 2 practice opponents, 3 seats free" is the sentence it is standing in for.
 */
export function SeatPips({
    size,
    seated,
    bots = 0,
}: {
    size: number;
    seated: number;
    bots?: number;
}) {
    // The split is `domain/pvpView`'s, like every other derivation the versus screens make:
    // the clamping and the pluralisation are the parts that go wrong quietly, and there
    // they can be checked.
    const { people, practice, free, label } = seatCounts({ size, seated, bots });
    const dot = (cls: string, key: string) => (
        <span key={key} className={`size-[9px] rounded-full ${cls}`} />
    );
    return (
        // The minimum width is eight dots and their gaps, so a room of two and a room of
        // eight put their button at the same x. It drops below `sm`, where the row wraps
        // anyway and holding the width open would squeeze the name instead.
        <span
            className="flex shrink-0 items-center justify-end gap-[3px] sm:min-w-[93px]"
            title={label}
            aria-label={label}
        >
            {Array.from({ length: people }, (_, i) => dot('bg-pitch-ink', `p${i}`))}
            {Array.from({ length: practice }, (_, i) => dot('bg-muted', `b${i}`))}
            {Array.from({ length: free }, (_, i) => dot('border border-line', `f${i}`))}
        </span>
    );
}

/**
 * One setting, folded, showing its own answer.
 *
 * THE ANSWER ON THE RIGHT IS WHAT MAKES THIS A FOLD RATHER THAN A HIDING PLACE, and it is
 * the whole reason folding is an improvement here at all. The form it replaces was seven
 * chip rows with an explaining paragraph under each - twenty chips and seven paragraphs to
 * open a room whose defaults are already right - and folding that would only have moved the
 * problem if a shut row said nothing. A shut row here reads "Roll, 3 re-rolls", so the whole
 * of the room is legible without opening anything.
 *
 * THEY OPEN INDEPENDENTLY. Shutting one somebody deliberately opened to compare against
 * another reads as a fight, and the card grows downwards inside its own column, so nothing
 * else on the page moves when it does.
 */
export function Setting({
    label,
    answer,
    children,
}: {
    label: string;
    /** What this setting is set to, in the words the room itself would use. */
    answer: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-t border-hair last:border-b">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2 py-2.5 text-left"
            >
                <span className="font-display text-[13.5px] font-bold">{label}</span>
                <span className="ml-auto font-mono text-[12px] text-muted">{answer}</span>
                <ChevronDown
                    className={`size-3.5 shrink-0 text-muted transition-transform ${
                        open ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                />
            </button>
            {open && <div className="pt-2 pb-3.5">{children}</div>}
        </div>
    );
}

/** A caption inside an open setting, over the chips it names. */
export function SettingRow({
    label,
    note,
    children,
}: {
    label: string;
    /** What the chosen one means, on one line. It sits under the chips rather than inside
     *  them, which is the shape `AscensionPicker` settled: a button says what it is, and
     *  the line beneath says what it does. */
    note?: string;
    children: ReactNode;
}) {
    return (
        <div className="mt-3 first:mt-0">
            <div className={MONO_CAP}>{label}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
            {note && <p className="mt-1.5 text-[12px] leading-snug text-muted">{note}</p>}
        </div>
    );
}

/**
 * One of two big choices: the decisions worth making with your eyes rather than off a chip.
 *
 * A chip row is right for "three or six re-rolls", where the labels are the whole of the
 * difference. It is wrong for the two that shape the evening - whether anybody has to be
 * present, and whether you roll or shop - because each of those needs a sentence to mean
 * anything, and one sentence under a chip row belongs to whichever chip is lit rather than
 * to the one being considered. So these carry their own.
 *
 * `font-display` is on the TITLE and the padding is a single `p-3`, which keeps it clear of
 * the bespoke-button scan in `scripts/checks/ui.ts` - honestly so, since this is a radio
 * group and not a fourth button design.
 */
export function BigChoice<T extends string>({
    name,
    value,
    onPick,
    options,
}: {
    name: string;
    value: T;
    onPick: (v: T) => void;
    options: readonly { value: T; label: string; sub: string }[];
}) {
    return (
        <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={o.value === value}
                    onClick={() => onPick(o.value)}
                    className={`rounded-md border p-3 text-left transition ${
                        o.value === value
                            ? 'border-pitch-dark shadow-[inset_0_0_0_1px_var(--color-pitch-dark)]'
                            : 'border-line hover:border-pitch'
                    }`}
                >
                    <span className="block font-display text-[14.5px] font-bold">{o.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {o.sub}
                    </span>
                </button>
            ))}
        </div>
    );
}
