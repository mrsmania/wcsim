import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duelDowngraded, inviteUrl, isDuel } from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { createRoom, leaveRoom, type CreateRoomInput } from '../../state/pvp/referee';
import { CARD_FLAT, MONO_CAP, PRIMARY_BTN } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { InviteRoom, RefereeProblem, RoomNote } from './versusUi';

// The two panels a duel has that a live room does not (P51, roadmap item 46).
//
// A DUEL IS A ROOM WITH ITS DEADLINES OFF, so nearly everything it shows is the room's own
// screens unchanged - the same draft, the same match card, the same result with both XIs.
// What is genuinely new is the WAITING, and waiting is the whole mode.
//
// THERE WAS A THIRD AND IT IS GONE: a duel used to be addressed to an account by NAME, so
// its recipient got an accept-or-decline screen and a stranger with the link got a refusal.
// The invitation is a link like any other now - whoever opens it takes the seat - so there
// is nothing to accept and `DuelChallenge` went with the addressing.
//
// WHAT IS NOT GONE IS THE WAIT, and one day without it is why. A duel briefly drafted from
// the moment it was created, on the reasoning that the two drafts never interact; what that
// bought was a free re-roll through the front door, since opening and closing a challenge
// both cost nothing and the squad you were dealt could simply be rejected by opening
// another. So the invitation sits in a lobby again, where there is nothing to see.
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
 * IT IS THE LINK AND THE REASON THE LINK MATTERS. Nothing whatever happens in a duel until
 * somebody opens it: no squad is dealt, no market opens, and the room sits in its lobby -
 * so a challenge nobody has been told about is a room nobody will ever open, and this panel
 * is the whole of telling them.
 *
 * CALLING IT OFF IS NOT HERE, deliberately. The room's own way out says what leaving costs,
 * and that sentence changes the moment somebody takes the seat (`leaveKind`): a second
 * button here would be a second answer, and would go on reading "the challenge is gone"
 * after it had become a forfeit.
 */
export function DuelInvite({ view }: { view: RoomView }) {
    const taken = view.members.length >= view.size;
    return (
        <>
            <div className={MONO_CAP}>{taken ? 'Both here' : 'Nobody opposite yet'}</div>
            <RoomNote>
                <span className="mt-1 block">
                    {taken
                        ? 'They took it up. Once you have both pressed ready you each build your XI in your own time, and the match plays itself when the second one is sent.'
                        : 'Whoever opens this link first takes the challenge. You both build in your own time, and the match plays itself when the second team is sent.'}
                </span>
            </RoomNote>
            {!taken && (
                <div className="mt-3">
                    <InviteRoom code={view.code} url={inviteUrl(origin(), base(), view.code)} />
                </div>
            )}
        </>
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
