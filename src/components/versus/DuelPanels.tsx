import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duelDowngraded, inviteUrl, isDuel } from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { createRoom, leaveRoom, type CreateRoomInput } from '../../state/pvp/referee';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import { CARD, CARD_FLAT, MONO_CAP, PRIMARY_BTN, btn } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { InviteRoom, RefereeProblem, RoomNote } from './versusUi';

// The two panels a duel has that a live room does not (P51, roadmap item 46).
//
// A DUEL IS A ROOM WITH ITS DEADLINES OFF, so nearly everything it shows is the room's own
// screens unchanged - the same draft, the same match card, the same result with both XIs.
// What is genuinely new is the WAITING, and waiting is the whole mode.
//
// THERE WAS A THIRD, AND ITS DELETION IS THE POINT OF THE 2026-08-31 CHANGE. A duel used
// to be addressed to an account by name, so it opened in a lobby, its recipient got an
// accept-or-decline screen, and its SENDER could not touch their own team until somebody
// answered - a wait that bought nothing, since the two drafts never interact and the match
// is played by the server. Now a duel opens straight into its challenger's draft and the
// invitation is a link like any other: whoever opens it takes the seat, mid-draft, and
// starts building. So there is nothing to accept, and `DuelChallenge` is gone.
//
// THERE IS NO NOTIFICATION IN THIS GAME, and these panels are written knowing it. Nothing
// is emailed and nothing is pushed, so a challenge travels by the link its sender pastes
// into a message. Telling somebody yourself is part of the feature rather than a gap in it.

/** Where this build is served from, for the invitation link. */
const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);
const base = (): string => import.meta.env.BASE_URL;

/**
 * Nobody has taken your challenge up yet.
 *
 * IT SITS ABOVE THE BOARD RATHER THAN INSTEAD OF IT, which is the whole change: you are
 * drafting while this is on screen. The link is here because THIS is the moment it is
 * wanted - a challenge nobody has been told about is a room nobody will ever open - and
 * calling it off is here because a challenge you have thought better of should not sit on
 * a link for a week.
 */
export function DuelInvite({ view, room }: { view: RoomView; room: VersusRoom }) {
    const navigate = useNavigate();
    const [dropping, setDropping] = useState(false);
    return (
        <div className={`${CARD} p-4`}>
            <div className={MONO_CAP}>Nobody opposite yet</div>
            <RoomNote>
                <span className="mt-1 block">
                    Build your XI now and send it whenever you like. Whoever opens this link
                    first takes the challenge, builds theirs in their own time, and the match
                    plays itself the moment the second team is in.
                </span>
            </RoomNote>
            <div className="mt-3">
                <InviteRoom code={view.code} url={inviteUrl(origin(), base(), view.code)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {dropping ? (
                    <>
                        <RoomNote>The link stops working and the challenge is gone.</RoomNote>
                        <button
                            className={`ml-auto ${btn('quiet', 'sm')}`}
                            onClick={() => {
                                void room.leave().catch(() => undefined);
                                navigate('/versus');
                            }}
                        >
                            Call it off
                        </button>
                        <button
                            className={btn('quiet', 'sm')}
                            onClick={() => setDropping(false)}
                        >
                            Keep it
                        </button>
                    </>
                ) : (
                    <button className={btn('quiet', 'sm')} onClick={() => setDropping(true)}>
                        Call it off
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Play them again.
 *
 * A REMATCH IS A NEW DUEL, not a reopened one: the old one has a result, and a result that
 * can change is not a result. So this opens one with the same rules and hands back the same
 * link to send, which is the same path the create form takes - the button is a shortcut
 * through a form the player has already filled in once.
 */
export function DuelRematch({ view }: { view: RoomView }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);
    if (!isDuel(view)) return null;
    const them = view.members.find((m) => m.userId !== view.you?.userId);
    if (!them) return null;

    const again = (): void => {
        setBusy(true);
        setError(null);
        const input: CreateRoomInput = {
            visibility: 'private',
            size: 2,
            method: view.rules.method,
            budget: view.rules.budget,
            years: view.rules.years,
            pickSeconds: view.pickSeconds,
            rerolls: view.rerolls,
            showRatings: view.showRatings,
            pace: 'async',
        };
        void createRoom(input)
            .then(async (next) => {
                // The same guard the create form carries, and for the same reason: a
                // server older than duels opens an ordinary room and calls it success, so
                // the answer is what gets tested. See `duelDowngraded`.
                if (duelDowngraded('async', next)) {
                    await leaveRoom(next.code).catch(() => undefined);
                    setBusy(false);
                    setError({
                        text: 'The versus server has not been rebuilt for duels yet, so a rematch cannot be sent.',
                        raw: 'duels not deployed',
                        deployment: true,
                        room: null,
                    });
                    return;
                }
                navigate(`/versus/${next.code}`);
            })
            .catch((err: unknown) => {
                setBusy(false);
                setError(refereeMessage(err, 'send a rematch'));
            });
    };

    return (
        <div className={`${CARD_FLAT} p-4`}>
            <div className={MONO_CAP}>Again?</div>
            <RoomNote>
                Same rules, a fresh XI each. It opens a new challenge with a link to send
                {them.name ? ` to ${them.name}` : ''}.
            </RoomNote>
            <button className={`${PRIMARY_BTN} mt-3`} disabled={busy} onClick={again}>
                Play again
            </button>
            {error && <RefereeProblem message={error} />}
        </div>
    );
}
