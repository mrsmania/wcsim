import { useCallback, useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { NAME_MAX, NAME_MIN, validateName } from '../../domain/displayName';
import type { PvpVersion, VersionMismatch } from '../../domain/pvpVersion';
import { inviteNote, inviteRules, inviteState } from '../../domain/pvpView';
import type { InviteRoom } from '../../domain/pvpWire';
import {
    claimDisplayName,
    clientVersion,
    currentDisplayName,
    handshake,
    readInvite,
} from '../../state/pvp/referee';
import { CARD, MONO_CAP, PRIMARY_BTN, StageHeader } from '../matchUi';
import RoomScreen from './RoomScreen';
import VersusHome from './VersusHome';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomCode, RoomNote } from './versusUi';

// The way into versus, and the three things that have to be true before anybody sees a
// room: an account, a referee that speaks this build's language, and a name to be called.
//
// THE HANDSHAKE IS FIRST AND IT IS NOT DECORATION (P35). The client deploys on a push to
// `main` and the referee is rebuilt by hand, so they are never in lockstep, and there are
// two ways they drift: the protocol, and the DATASET the referee bundles to validate
// picks. A client offering a player the referee has never heard of gets every pick
// refused halfway through a draft with no way to say why. Better to say "versus is
// updating" at the door.

type Gate =
    | { kind: 'checking' }
    | { kind: 'unreachable' }
    | { kind: 'mismatch'; why: VersionMismatch; theirs: PvpVersion | null }
    | { kind: 'name' }
    | { kind: 'ready'; name: string };

export default function VersusScreen({
    signedIn,
    onOpenAccount,
}: {
    signedIn: boolean;
    /** Open the account dialog. An invitation lands on a signed-out screen and the whole of
     *  what to do about it is signing in, so the door has to be ON that screen rather than
     *  pointed at from it. */
    onOpenAccount: () => void;
}) {
    const inRoom = useMatch('/versus/:code');
    const code = inRoom?.params.code?.toUpperCase() ?? null;
    const [gate, setGate] = useState<Gate>({ kind: 'checking' });
    // Changing the name is a DETOUR rather than a gate: the same panel, reached on purpose
    // from the versus page instead of because there is nothing to be called yet.
    const [renaming, setRenaming] = useState(false);

    const check = useCallback(async () => {
        const shake = await handshake();
        if (shake.unreachable) return setGate({ kind: 'unreachable' });
        if (shake.mismatch) {
            return setGate({ kind: 'mismatch', why: shake.mismatch, theirs: shake.theirs });
        }
        try {
            const name = await currentDisplayName();
            setGate(name ? { kind: 'ready', name } : { kind: 'name' });
        } catch {
            setGate({ kind: 'unreachable' });
        }
    }, []);

    useEffect(() => {
        if (!signedIn) return;
        setGate({ kind: 'checking' });
        setRenaming(false);
        void check();
    }, [signedIn, check]);

    if (!signedIn) return <SignedOut code={code} onOpenAccount={onOpenAccount} />;

    if (gate.kind === 'checking') {
        return (
            <>
                <StageHeader eyebrow="Versus" title="Play somebody" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>Checking with the referee.</RoomNote>
                </div>
            </>
        );
    }

    if (gate.kind === 'unreachable' || gate.kind === 'mismatch') {
        const mine = clientVersion();
        return (
            <>
                <StageHeader eyebrow="Versus" title="Versus is updating" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>
                        {gate.kind === 'unreachable'
                            ? 'The referee is not answering. Versus is off until it does; nothing else in the game is affected.'
                            : gate.why === 'protocol'
                              ? 'This page and the referee are on different versions. Try again in a few minutes.'
                              : 'This page and the referee are carrying different squads, so a team built here could not be checked there. Try again in a few minutes.'}
                    </RoomNote>
                    {gate.kind === 'mismatch' && (
                        <p className={`${MONO_CAP} mt-3`}>
                            here {mine.protocol}/{mine.dataset}
                            {gate.theirs && ` · there ${gate.theirs.protocol}/${gate.theirs.dataset}`}
                        </p>
                    )}
                </div>
            </>
        );
    }

    if (gate.kind === 'name') {
        return <NamePanel current={null} onDone={(name) => setGate({ kind: 'ready', name })} />;
    }

    // Not while in a room: the code in the URL is somewhere to be, and a panel that replaced
    // it would take a player out of a draft to rename themselves.
    if (renaming && !code) {
        return (
            <NamePanel
                current={gate.name}
                onDone={(name) => {
                    setGate({ kind: 'ready', name });
                    setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
            />
        );
    }

    return code ? (
        <RoomScreen code={code} />
    ) : (
        <VersusHome name={gate.name} onRename={() => setRenaming(true)} />
    );
}

/**
 * THE DOOR FOR SOMEBODY WITH NO ACCOUNT, and it is not one screen.
 *
 * A room is account-only (P17), so a link somebody was sent lands HERE rather than in the
 * room, and until 2026-09-01 it answered that with the general pitch for the mode plus a
 * sentence pointing at the account button in the masthead. Somebody who has just been sent
 * a game does not need the pitch, and the page they got said nothing about the thing they
 * had followed: not that the link had worked, not which room it was, not that an account was
 * the only step left. So an invitation gets its own screen, leading with the code and the
 * button, and the pitch is one line rather than the page.
 *
 * SIGNING IN COMES BACK TO THE ROOM, and that is the reason the button is here rather than a
 * pointer to the masthead. The dialog is an overlay over this page and signing in RELOADS it
 * (`App`, so the store is rebuilt against the account), so what the reload lands on is this
 * URL, which is the room's own address; `RoomScreen` then takes the seat on arrival exactly
 * as it does for anybody following the link with an account already. Nothing has to remember
 * the code across the sign-in, which is the point of saying it in the copy: the address is
 * the memory, so there is no pending-invitation state to go stale or to seat somebody who
 * signed in an hour later for a different reason.
 *
 * AND IT SAYS WHAT THE INVITATION IS TO, which took a route of its own (`readInvite`,
 * `GET /v1/rooms/:code/invite`). It could not, for a day: every read of a room needs a
 * session and a private room answers "no such room" to anybody without a seat, so the most
 * motivated arrival in the product was shown a code and a paragraph of general pitch. What
 * the referee now answers unauthenticated is what is printed on an invitation - who opened
 * it, what it plays, whether a seat is still there - and nothing from inside the room: no
 * member, no XI, no formation (P19). The code is the credential, which is only true while it
 * cannot be guessed at speed, hence the rate limit in front of it (`referee/src/invites.ts`).
 *
 * IT STILL WORKS WITH NO ANSWER AT ALL, and that is not a fallback added afterwards. A
 * referee older than the route, an unreachable one, a room that has closed and a read that
 * was rate limited all come back as null, and null renders as this screen did before the
 * route existed: the code, and a line saying why there is nothing else. That is also what
 * makes shipping this client before the container harmless.
 *
 * NOTHING HERE IS A PROMISE. What it shows is a snapshot read once (nobody sits on a
 * sign-in screen, so it is not polled), and signing in takes a mail client and a minute -
 * so the seat can be gone by the time they land. `RoomScreen` is what actually takes it,
 * and what says so if it cannot.
 */
function SignedOut({ code, onOpenAccount }: { code: string | null; onOpenAccount: () => void }) {
    const room = useInvite(code);
    // No code: somebody who came in through the Versus tab, so this is the pitch for the
    // mode. The button is the only change - "sign in from the button at the top of the page"
    // is an instruction where a button is an action, and it is the same dialog either way.
    if (!code) {
        return (
            <>
                <StageHeader eyebrow="Versus" title="Play somebody" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>
                        Two, four or eight people, a team each from the same money or the same
                        dice, and a knockout to settle it. Play whoever is around, or send a
                        link to the people you want. It needs an account, because the others
                        have to know who they beat and the result has to live somewhere none of
                        you can edit.
                    </RoomNote>
                    <RoomNote>
                        <span className="mt-2 block">
                            An email address and a six-digit code, no password. Everything you
                            have already - your XI, your run, your album - stays exactly as it
                            is; a room never touches any of it.
                        </span>
                    </RoomNote>
                    <div className="mt-4">
                        <button type="button" className={PRIMARY_BTN} onClick={onOpenAccount}>
                            Sign in
                        </button>
                    </div>
                </div>
            </>
        );
    }

    // What the button can honestly offer. A room that is full, under way or over is still
    // worth signing in for - it is somebody's game and there may be a rematch - but the
    // label must not promise a chair that is not there.
    const seatWaiting = !room || inviteState(room) === 'open';

    return (
        <>
            <StageHeader eyebrow="Versus" title="You have been invited" />
            <div className={`${CARD} p-5`}>
                <div className={MONO_CAP}>The room you were sent</div>
                <div className="mt-1.5">
                    <RoomCode code={code} />
                </div>
                {room && (
                    <div className="mt-3 border-t border-hair pt-3">
                        <div className="text-[13.5px] font-bold text-ink">
                            {room.hostName || 'Somebody'}
                            {room.pace === 'async'
                                ? ' has challenged you'
                                : ` opened a room for ${room.size}`}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted">{inviteRules(room)}</div>
                        <div className="mt-0.5 text-[12px] text-muted">{inviteNote(room)}</div>
                    </div>
                )}
                <div className="mt-3">
                    <RoomNote>
                        A team each, from the same money or the same dice, and a match to
                        settle it. One thing stands between you and it: a room needs an
                        account, because the other player has to know who they beat and the
                        result has to live somewhere neither of you can edit.
                    </RoomNote>
                    <RoomNote>
                        <span className="mt-2 block">
                            An email address and a six-digit code, no password. Sign in and you
                            come straight back here
                            {seatWaiting
                                ? ', and your seat is taken the moment you land.'
                                : // A room that is full, under way or over. Repeating the
                                  // promise would be the one thing this screen must not do:
                                  // the seat is the part it cannot check.
                                  '. Whether there is still room for you is up to the room.'}
                        </span>
                    </RoomNote>
                </div>
                <div className="mt-4">
                    <button type="button" className={PRIMARY_BTN} onClick={onOpenAccount}>
                        {seatWaiting ? 'Sign in and take your seat' : 'Sign in'}
                    </button>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-dim">
                    {room
                        ? 'That is everything an invitation says about a room: what is inside one is for the people in it. '
                        : 'The room itself says nothing at all to somebody who is not in it, which is why there is only the code here. '}
                    Whatever you have played as a guest - your XI, your run, your album - stays
                    exactly as it is.
                </p>
            </div>
        </>
    );
}

/**
 * The invitation, read once.
 *
 * NOT POLLED, DELIBERATELY: nobody sits on a sign-in screen watching a room fill up, and
 * the next thing that happens here is a reload (signing in rebuilds the store against the
 * account), which asks again on the way past. A failure is not retried either - null is a
 * complete answer for this screen, and the copy under it is written for exactly that.
 */
function useInvite(code: string | null): InviteRoom | null {
    const [room, setRoom] = useState<InviteRoom | null>(null);
    useEffect(() => {
        if (!code) return;
        let live = true;
        void readInvite(code).then((r) => {
            if (live) setRoom(r);
        });
        return () => {
            live = false;
        };
    }, [code]);
    return room;
}

/**
 * Choosing what everybody else calls you (P22), and changing it later.
 *
 * The rule is in `domain/displayName.ts` and it is enforced on both sides, which is why
 * this can show what a name WOULD become before it is claimed: normalised, folded, and
 * refused if the folded form is already held. There is no word filter, by decision; the
 * answer to a name somebody should not have is a report and the owner renaming them.
 *
 * ONE PANEL FOR BOTH, and the only difference is `current`. Picking a name for the first
 * time and changing one are the same instruction (`set_display_name` updates the row it
 * finds, and re-claiming a key you already hold is not a collision), the same rule and the
 * same three things that can go wrong. What changes is the copy, the field starting full,
 * and there being somewhere to go back to.
 *
 * A RENAME REACHES A ROOM ALREADY IN FLIGHT, and that is why there is nothing to warn about
 * here. No room stores a name: `pvp_members` holds a seat and every screen reads the name
 * off `profiles` through a join, so the lobby you are sitting in, the tree, the duel list
 * and the result all say the new one within a poll. Records key on the account (P22), so
 * nothing you have won is left behind under the old name either.
 */
function NamePanel({
    current,
    onDone,
    onCancel,
}: {
    current: string | null;
    onDone: (name: string) => void;
    onCancel?: () => void;
}) {
    const [raw, setRaw] = useState(current ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);
    const verdict = validateName(raw);
    // Nothing to save is not an error, so the button goes quiet rather than the form
    // reporting a fault. The comparison is on the NORMALISED name, since that is what would
    // be stored: adding a trailing space is not a rename.
    const unchanged = current !== null && verdict.name === current;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!verdict.ok || busy || unchanged) return;
        setBusy(true);
        setError(null);
        void claimDisplayName(raw)
            .then(onDone)
            .catch((err: unknown) => {
                setBusy(false);
                setError(refereeMessage(err, 'save that name'));
            });
    };

    return (
        <>
            <StageHeader
                eyebrow="Versus"
                title={current === null ? 'Pick a name' : 'Change your name'}
                // The way back, as the crumb every versus screen carries - and it is what
                // `onCancel` means, so it appears exactly when there IS somewhere to go.
                // Picking a name for the first time has nowhere: versus does not open
                // until there is one, so a crumb there would lead back to this same panel.
                crumb={
                    onCancel
                        ? { dir: 'back', label: 'Back to versus', onClick: onCancel }
                        : undefined
                }
            />
            <form className={`${CARD} max-w-[460px] p-5`} onSubmit={submit}>
                <RoomNote>
                    What everybody else sees. {NAME_MIN} to {NAME_MAX} characters, and one
                    nobody else is using.
                </RoomNote>
                {current !== null && (
                    <RoomNote>
                        <span className="mt-2 block">
                            It changes everywhere at once, rooms you are already in included.
                            Nothing you have won moves with it: your record follows the
                            account, not the name.
                        </span>
                    </RoomNote>
                )}
                <input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    autoComplete="off"
                    maxLength={40}
                    aria-label="Display name"
                    className="mt-3 w-full rounded-[5px] border border-line bg-ground px-3 py-2.5 text-[16px] font-bold text-ink outline-none focus:border-pitch"
                />
                {raw.trim() !== '' && !verdict.ok && (
                    <p className="mt-2 text-[13px] text-muted">
                        {verdict.faults.includes('too-short') && `At least ${NAME_MIN} characters. `}
                        {verdict.faults.includes('too-long') && `At most ${NAME_MAX} characters. `}
                        {verdict.faults.includes('bad-character') &&
                            `Not allowed: ${verdict.rejected.join(' ')}`}
                    </p>
                )}
                {verdict.ok && !unchanged && verdict.name !== raw && (
                    <p className="mt-2 text-[13px] text-muted">
                        You will be shown as <b className="text-ink">{verdict.name}</b>.
                    </p>
                )}
                {error && <RefereeProblem message={error} />}
                {/* Saving is the only action left: "Never mind" went up to the crumb,
                    which goes to the same place and is where a way out lives on every
                    other versus screen. */}
                <div className="mt-4">
                    <button className={PRIMARY_BTN} disabled={!verdict.ok || busy || unchanged}>
                        {current === null ? "That's me" : 'Call me that'}
                    </button>
                </div>
            </form>
        </>
    );
}
