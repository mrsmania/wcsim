import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duelRules, inviteUrl, isDuel } from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { createRoom, type CreateRoomInput } from '../../state/pvp/referee';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import { CARD, CARD_FLAT, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN, btn } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { InviteRoom, RefereeProblem, RoomNote } from './versusUi';

// The three screens a duel has that a live room does not (P51, roadmap item 46).
//
// A DUEL IS A ROOM WITH ITS DEADLINES OFF, so nearly everything it shows is the room's own
// screens unchanged - the same draft, the same match card, the same result with both XIs.
// What is genuinely new is the WAITING, and waiting is the whole mode: a challenge that has
// not been answered, and the answer to it.
//
// THERE IS NO NOTIFICATION IN THIS GAME, and these screens are written knowing it. Nothing
// is emailed and nothing is pushed, so a challenge arrives by sitting on the other person's
// duel list until they next open the page - which is why the challenger's screen says what
// it says, and why the link is on it. Telling somebody yourself is part of the feature
// rather than a gap in it.

/** Where this build is served from, for the invitation link. */
const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);
const base = (): string => import.meta.env.BASE_URL;

/**
 * You have been challenged, and have not answered.
 *
 * THIS IS THE ONE ROOM IN THE APP A PLAYER DID NOT CHOOSE TO OPEN, and that is why it is
 * the one place arriving does not take the seat. Everywhere else there is one door and
 * walking through it is the answer (a code you typed, a lobby row you tapped, a link you
 * followed); a challenge came to YOU, so it gets a question with two answers.
 */
export function DuelChallenge({ view, room }: { view: RoomView; room: VersusRoom }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const from = view.members[0]?.name ?? 'Somebody';
    return (
        <div className={`${CARD} p-5`}>
            <div className={MONO_CAP}>A challenge</div>
            <div className="mt-1 text-[19px] font-extrabold text-ink">{from} has challenged you</div>
            <RoomNote>
                <span className="mt-1.5 block">
                    {duelRules(view.rules)}, then one match. Take as long as you like over it:
                    neither of you has to be here at the same time, and the match plays itself
                    when the second XI is in.
                </span>
            </RoomNote>
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    className={PRIMARY_BTN}
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        // Accepting starts the draft on the spot: a duel has no lobby to
                        // wait in, because there is nobody to wait with.
                        void room.join().finally(() => setBusy(false));
                    }}
                >
                    Accept and build your XI
                </button>
                <button
                    className={SECONDARY_BTN}
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        // Declining is leaving: the referee closes a duel its recipient has
                        // said no to, and the challenger's list says so at their next look.
                        void room.leave().finally(() => navigate('/versus'));
                    }}
                >
                    No thanks
                </button>
            </div>
        </div>
    );
}

/**
 * You sent a challenge and it has not been answered.
 *
 * The link is here rather than on a Share panel of its own because THIS is the moment it is
 * wanted: a challenge nobody has been told about is a row on a list nobody has looked at,
 * and the whole of this game's notification system is you sending somebody a message.
 */
export function DuelWaiting({ view, room }: { view: RoomView; room: VersusRoom }) {
    const navigate = useNavigate();
    return (
        <div className={`${CARD} p-5`}>
            <div className={MONO_CAP}>Challenge sent</div>
            <div className="mt-1 text-[19px] font-extrabold text-ink">
                {view.invitedName
                    ? `Waiting for ${view.invitedName}`
                    : 'Waiting for somebody to take it up'}
            </div>
            <RoomNote>
                <span className="mt-1.5 block">
                    {view.invitedName
                        ? `It is on ${view.invitedName}'s list the next time they open Versus. Nothing here sends a message, so tell them - the link takes them straight to it.`
                        : 'Send the link to whoever you want to play. The first person to open it takes the challenge.'}
                </span>
            </RoomNote>
            <div className="mt-3">
                <InviteRoom code={view.code} url={inviteUrl(origin(), base(), view.code)} />
            </div>
            <div className="mt-4">
                <button
                    className={btn('quiet', 'md')}
                    onClick={() => {
                        void room.leave().catch(() => undefined);
                        navigate('/versus');
                    }}
                >
                    Call it off
                </button>
            </div>
        </div>
    );
}

/**
 * Play them again.
 *
 * A REMATCH IS A NEW DUEL, not a reopened one: the old one has a result, and a result that
 * can change is not a result. So this creates one with the same rules and the same opponent
 * and goes to it, which is the same path the challenge form takes - the button is a
 * shortcut through a form the player has already filled in once.
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
            opponent: them.name,
        };
        void createRoom(input)
            .then((next) => navigate(`/versus/${next.code}`))
            .catch((err: unknown) => {
                setBusy(false);
                setError(refereeMessage(err, 'send a rematch'));
            });
    };

    return (
        <div className={`${CARD_FLAT} p-4`}>
            <div className={MONO_CAP}>Again?</div>
            <RoomNote>
                Same rules, same opponent, a fresh XI each. It goes to {them.name} as a new
                challenge.
            </RoomNote>
            <button className={`${PRIMARY_BTN} mt-3`} disabled={busy} onClick={again}>
                Challenge {them.name} again
            </button>
            {error && <RefereeProblem message={error} />}
        </div>
    );
}
