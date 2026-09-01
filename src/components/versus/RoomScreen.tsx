import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player } from '../../data/types';
import type { RoomView } from '../../domain/pvpWire';
import { getFormation, type FormationName, type Style } from '../../domain/formations';
import {
    isDuel,
    leaveKind,
    meIn,
    memberOf,
    playersOf,
    roomDisplay,
    roundsFor,
    shouldReveal,
    spectateTie,
    walkover,
    tieOf,
    viewerTie,
    xiFrom,
} from '../../domain/pvpView';
import { roomClosed } from '../../domain/pvpRoom';
import { holdVersusRoom, useHeldVersusRoom } from '../../nav/versusRoom';
import { duelsChanged } from '../../state/pvp/duels';
import { markDuelWatched, watchedDuels } from '../../state/pvp/watched';
import { useVersusRoom } from '../../hooks/useVersusRoom';
import {
    CARD_FLAT,
    MONO_CAP,
    PRIMARY_BTN,
    SECONDARY_BTN,
    StageCrumb,
    StageHeader,
    btn,
} from '../matchUi';
import RoomBracket, { currentRoundLabel, shortName } from './RoomBracket';
import { DuelRematch } from './DuelPanels';
import RoomDraft from './RoomDraft';
import RoomLobby from './RoomLobby';
import RoomResult, { decidingTie } from './RoomResult';
import VersusMatch from './VersusMatch';
import { refereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// One room, from the lobby to the result.
//
// It is a branch on the room's status and nothing else: the referee decides when a room
// moves on, including when a match stops being watched (P30 - the round advances when the
// server's reveal window closes, whoever is or is not looking at it), so there is no
// phase machine on this side to disagree with it.
//
// THERE IS NO "THE OTHER PLAYER" ANY MORE. In a room of two the opponent is the only other
// seat, and reading it that way is how this screen was first written; in a room of eight it
// is whoever the draw paired you with, and after you go out there is nobody at all. So the
// opponent comes off the TIE and the tie comes off the round, and the screen has a third
// state besides playing and finished: watching (P24).
//
// A KNOCKED-OUT PLAYER STAYS AND WATCHES THE REST (P24), and the default game is the one
// their own conqueror is in - the single match in the round they have a reason to care
// about, chosen without a control. That match has two other people in it, so it is drawn
// with both of them named rather than with one of them called "you".
//
// A DUEL'S MATCH IS REVEALED WHEN ITS VIEWER TURNS UP, NOT WHEN THE SERVER PLAYS IT. In a
// live room the reveal window is the server's (P30) and it has to be, because two people
// are watching the same match and must see the same one. A duel is played by the server at
// the moment the second XI lands, with nobody necessarily awake - so honouring that window
// would mean the player who opened the app an hour later got a scoreline where the other
// one got a football match. So for a duel the reveal is a LOCAL fact: it plays the first
// time this browser opens it (`state/pvp/watched.ts`), with a way to skip straight to the
// result, and afterwards it is the settled card.

const HEADINGS: Record<string, string> = {
    lobby: 'The room',
    drafting: 'The draft',
    round: 'The match',
    ended: 'The result',
};

const CLOSED_TITLE = 'The room closed';

/**
 * What the way out is called, and what it does, per `leaveKind`.
 *
 * THE LABEL IS THE ACTION AND THE SENTENCE IS THE CONSEQUENCE, which is the house rule for
 * a button (see "Buttons and contrast"): "Call it off" says what the tap is, and the line
 * beside it says who it happens to. Getting that wrong is expensive here, because two of
 * these four are irreversible and one of them ends somebody else's game as well.
 */
const LEAVING: Record<ReturnType<typeof leaveKind>, { label: string; note: string }> = {
    seat: {
        label: 'Leave',
        note: 'You give up your seat, and somebody else can take it.',
    },
    calloff: {
        label: 'Call it off',
        note: 'Nobody has taken it up, so it costs nothing. The link stops working.',
    },
    forfeit: {
        label: 'Give it up',
        note: 'It counts as a loss, and the duel ends now for both of you.',
    },
    away: {
        label: 'Leave',
        note: 'Your team plays on without you.',
    },
};

export default function RoomScreen({ code }: { code: string }) {
    const navigate = useNavigate();
    const room = useVersusRoom(code, true);
    const view = room.view;
    const held = useHeldVersusRoom();
    const [leaving, setLeaving] = useState(false);

    /**
     * Leave, and MEAN IT.
     *
     * This used to clear the local pointer and navigate, and nothing else - so the seat
     * stayed taken on the server and the next room was refused with "you are already in a
     * room" until the liveness sweep noticed ninety seconds later. That was the reported
     * bug. The instruction goes first now; a lobby gives the seat up, and a room that has
     * started answers it as a no-op, which is right (your XI is in a bracket other people
     * are playing).
     *
     * The navigation does not wait for the answer and does not care whether it failed: a
     * player who pressed Leave is leaving. The worst a lost request costs is the ninety
     * seconds it cost before, which is the floor rather than the design.
     *
     * BUT THE DUELS LIST HAS TO BE TOLD WHEN THE ANSWER LANDS, and that was the second
     * reported bug: leaving a duel is a FORFEIT, so the row moves from "On now" to a loss
     * under "Played" - and the versus page we are navigating to reads its list on mount,
     * in parallel with this very request, so it gets the honest pre-forfeit answer and
     * sits on it until its next slow poll. Signalling on SETTLE rather than on send is the
     * whole point: it is the only moment the referee's copy is known to have moved.
     */
    const leave = useCallback(() => {
        void room
            .leave()
            .catch(() => undefined)
            .finally(duelsChanged);
        holdVersusRoom(null);
        navigate('/versus');
    }, [navigate, room]);

    /**
     * TAKE THE SEAT ON ARRIVAL. There is one door into a room now, and this is it.
     *
     * The three ways to get here - typing the code, tapping a row on the public list, and
     * following an invitation link - are all somebody saying they want in, so a screen
     * asking them to confirm it was a second door onto the same street. What is left is the
     * moment in between and the reason it did not work, which is what the block below draws.
     *
     * ONCE PER ROOM, and the ref is what makes that true: a refused join (full, started,
     * already in another room) leaves the read failing exactly as it was, so without the
     * guard this would send the same instruction every two seconds for as long as the
     * screen is open. Retrying is the player's, on a button.
     *
     * The trigger is the READ having come back, either way: a room the viewer may not see
     * answers 404 (which is the policy working - a private code cannot be confirmed by
     * probing), and a public one comes back with no `you` on it. Both mean the same thing
     * here, which is why they are no longer two screens.
     */
    const asked = useRef<string | null>(null);
    useEffect(() => {
        asked.current = null;
    }, [code]);
    useEffect(() => {
        if (room.loading || asked.current === code) return;
        const outside = view ? !meIn(view) : room.error?.code === 'no-such-room';
        if (!outside) return;
        asked.current = code;
        void room.join().then(
            // Cleared on success, so a seat lost LATER - the liveness sweep, five minutes
            // of a sleeping phone - is taken again the same way rather than leaving the
            // screen on "one moment" for ever. It cannot loop: an answer with `you` in it
            // stops the effect firing at all.
            () => {
                asked.current = null;
            },
            () => undefined,
        );
    }, [code, room, view]);

    // The tie the viewer is in, this round, turned round so they are the home side - and
    // the opponent the DRAW gave them, which in a room of more than two is not "the other
    // seat" and after an exit is nobody.
    const mine = useMemo(() => {
        if (!view?.you) return null;
        const t = tieOf(view, view.round, view.you.userId);
        if (!t) return null;
        const tie = viewerTie(t, view.you.userId);
        return { raw: t, tie, them: memberOf(view, tie.opponentId) };
    }, [view]);

    // The game to watch when the viewer is not in one (P24).
    const watching = useMemo(() => {
        if (!view || view.status !== 'round' || mine) return null;
        const t = spectateTie(view);
        if (!t) return null;
        const home = memberOf(view, t.homeId);
        const away = memberOf(view, t.awayId);
        return home && away ? { raw: t, tie: viewerTie(t, t.homeId), home, away } : null;
    }, [view, mine]);

    const me = view ? meIn(view) : null;

    // Whether to PLAY this duel's match rather than print it. See the header: a duel's
    // reveal belongs to whoever turns up, so the fact it reads is local to this browser.
    // It is state rather than a bare read so that the reveal ending, or the skip, takes
    // the match off the screen without waiting for a poll.
    const [watched, setWatched] = useState(() => watchedDuels().has(code));
    useEffect(() => setWatched(watchedDuels().has(code)), [code]);
    const finishWatching = useCallback(() => {
        markDuelWatched(code);
        setWatched(true);
    }, [code]);
    const replay = !!view && isDuel(view) && !watched;

    if (!view || !me) {
        // ARRIVING AT A ROOM IS TAKING THE SEAT. There used to be two doors here and they
        // were the same door: a "Take your seat" page for a code that answered 404 (a
        // private room is invisible until you are in it) and a "Join the room" page for a
        // public one you could already see. Both showed a room you had chosen to open, said
        // little about it, and asked you to confirm that you had meant it - which is a
        // question with one answer, since the only ways to arrive are typing the code,
        // tapping a row on the lobby list, and following an invitation link.
        //
        // So the join is sent as soon as the read comes back, and this screen is only ever
        // the moment in between or the reason it did not work. Leave is the way out, and it
        // gives the seat back properly.
        const failed = room.commandError ?? (room.error?.code === 'no-such-room' ? null : room.error);
        // A refusal that means something else if you were JUST IN THIS ROOM. The reported
        // case was a host whose phone slept, who lost the seat to the liveness rule and was
        // then told that a private room is invisible until you are in it - of a room he had
        // opened himself. The pointer tells the two apart: it is written on every answer
        // the room gives and cleared only by pressing Leave.
        const wasIn = held?.code === code && room.commandError?.code === 'no-such-room';
        const problem = failed ? refereeMessage(failed, 'take a seat') : null;
        return (
            <>
                <StageHeader
                    eyebrow="Versus"
                    title={wasIn ? 'The room is gone' : failed ? 'Could not get in' : 'Taking your seat'}
                />
                <div className={`${CARD_FLAT} p-5`}>
                    {wasIn ? (
                        <RoomNote>
                            The room stopped hearing from this device and then closed, which
                            happens when a phone sleeps or a tab is shut for a few minutes and
                            nobody else is left in it.
                        </RoomNote>
                    ) : problem ? (
                        <RefereeProblem
                            message={problem}
                            action={
                                // The one refusal with somewhere to go: the room that holds
                                // your seat. Being told you are already in a room with no
                                // route to it is the dead end this exists to close.
                                problem.room ? (
                                    <button
                                        className={SECONDARY_BTN}
                                        onClick={() => navigate(`/versus/${problem.room}`)}
                                    >
                                        Go to room {problem.room}
                                    </button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <RoomNote>Room {code}. One moment.</RoomNote>
                    )}
                    {problem && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                className={PRIMARY_BTN}
                                onClick={() => void room.join().catch(() => undefined)}
                            >
                                Try again
                            </button>
                            <button className={SECONDARY_BTN} onClick={() => navigate('/versus')}>
                                Back to versus
                            </button>
                        </div>
                    )}
                </div>
            </>
        );
    }

    const them = mine?.them ?? null;
    const tree = roundsFor(view.size) > 1;
    // The match a finished room is about, from this player's side: the cup they won, or
    // the tie they went out in. `mine` is not it - the room ends on a round they may have
    // been watching rather than playing.
    const deciding = decidingTie(view);
    const decidingThem = deciding ? memberOf(view, deciding.opponentId) : null;
    const ended = deciding && decidingThem ? { tie: deciding, them: decidingThem } : null;
    const myFormation =
        getFormation((me.formationName as FormationName) ?? '4-3-3', (me.style as Style) ?? 'bal') ??
        getFormation('4-3-3', 'bal')!;

    return (
        <>
            <StageHeader
                eyebrow={`Room ${view.code}`}
                // A room of two plays one match and calling it the Final is grandiose; a
                // room of eight plays three rounds and "The match" says nothing.
                title={
                    tree && view.status === 'round'
                        ? currentRoundLabel(view)
                        : roomClosed(view)
                          ? CLOSED_TITLE
                          : (HEADINGS[view.status] ?? 'The room')
                }
                // THE WAY OUT OF A FINISHED ROOM IS A CRUMB, NOT A BUTTON AT THE FOOT OF
                // THE PAGE. A result screen carries the tree, the card and both XIs, so a
                // green button under all of it was the length of the page away from
                // somebody who had read the score and was done - and it was the only
                // control there, which is what makes it navigation rather than an action.
                // Same atom as the run screen's "Back to the build", above the eyebrow.
                //
                // It still calls `leave`: dropping the held pointer is what stops the
                // chrome's strip offering a room that is over, so a plain link to /versus
                // would look identical and leave that behind.
                crumb={
                    view.status === 'ended' ? (
                        <StageCrumb dir="back" label="Back to versus" onClick={leave} />
                    ) : undefined
                }
            />

            {/* A refused command - a Start the referee would not take, a join it turned
                down - said in words, with its own code underneath. It has its own field on
                the hook rather than sharing the poll's, or it would be cleared two seconds
                later by a read that succeeded. */}
            {room.commandError && (
                <div className="mb-[18px]">
                    <RefereeProblem message={refereeMessage(room.commandError, 'do that')} />
                </div>
            )}

            {view.status === 'lobby' && <RoomLobby view={view} room={room} />}

            {view.status === 'drafting' && (
                <RoomDraft
                    // Keyed on the shape: a build cannot change formation underneath
                    // itself, and after the start it never does.
                    key={`${myFormation.name}-${myFormation.style}`}
                    view={view}
                    room={room}
                    formation={myFormation}
                />
            )}

            {view.status === 'round' && (
                <div className="flex flex-col gap-[18px]">
                    {tree && <RoomBracket view={view} serverNow={view.at} />}
                    {mine && them ? (
                        mine.tie.decided === null ? (
                            <div className={`${CARD_FLAT} p-5`}>
                                <div className={MONO_CAP}>Kick-off</div>
                                <RoomNote>{them.name} versus you, any moment.</RoomNote>
                            </div>
                        ) : (
                            <VersusMatch
                                // A fresh key per tie, so the reveal starts with the match
                                // rather than with the screen.
                                key={`${mine.raw.round}-${mine.raw.game}`}
                                label={currentRoundLabel(view)}
                                tie={mine.tie}
                                opponentName={them.name}
                                yourXi={playersOf(myFormation, xiFrom(myFormation, view.you?.xi ?? {}))}
                                theirXi={theirPlayers(view, them.userId)}
                                ratings={roomDisplay(view).ratings}
                                // A duel's is played when its viewer arrives; a live
                                // room's when the server says so.
                                live={isDuel(view) ? replay : shouldReveal(mine.raw, view.at)}
                                onEnd={() => {
                                    if (isDuel(view)) finishWatching();
                                    room.refresh();
                                }}
                            />
                        )
                    ) : watching ? (
                        <>
                            <div className={`${CARD_FLAT} px-4 py-3`}>
                                <div className={MONO_CAP}>You are out</div>
                                <RoomNote>
                                    Beaten in the {roundLabelOf(view, me.outIn ?? view.round)}.
                                    Stay and watch it out.
                                </RoomNote>
                            </div>
                            <VersusMatch
                                key={`watch-${watching.raw.round}-${watching.raw.game}`}
                                label={currentRoundLabel(view)}
                                tie={watching.tie}
                                opponentName={watching.away.name}
                                yourXi={theirPlayers(view, watching.home.userId)}
                                theirXi={theirPlayers(view, watching.away.userId)}
                                ratings={roomDisplay(view).ratings}
                                live={shouldReveal(watching.raw, view.at)}
                                // Neither side is the viewer's, so both are named.
                                sides={{
                                    user: shortName(watching.home.name),
                                    opp: shortName(watching.away.name),
                                }}
                                onEnd={room.refresh}
                            />
                        </>
                    ) : (
                        <div className={`${CARD_FLAT} p-5`}>
                            <RoomNote>The round is being played.</RoomNote>
                        </div>
                    )}
                </div>
            )}

            {view.status === 'ended' && (
                <div className="flex flex-col gap-[18px]">
                    {/* A room that CLOSED never played, so there is no tree and no result to
                        show - only the honest reason (P31). It happens when everybody left a
                        lobby, or when nobody touched one for a quarter of an hour. */}
                    {roomClosed(view) && !ended ? (
                        <div className={`${CARD_FLAT} p-5`}>
                            <div className={MONO_CAP}>The room closed</div>
                            <RoomNote>
                                Nobody was left in it, so it shut rather than sitting open for
                                ever.
                            </RoomNote>
                        </div>
                    ) : walkover(view) ? (
                        // A DUEL SOMEBODY WALKED OUT OF: a winner and no football. There is
                        // no tie to draw and no score to print, so the card says the one
                        // thing that happened, and the rematch sits under it exactly as it
                        // does under a played result.
                        <>
                            <div className={`${CARD_FLAT} p-5`}>
                                <div className={MONO_CAP}>
                                    {view.championId === view.you?.userId
                                        ? 'You win it'
                                        : 'You gave it up'}
                                </div>
                                <RoomNote>
                                    {view.championId === view.you?.userId
                                        ? `${
                                              view.members.find(
                                                  (m) => m.userId !== view.you?.userId,
                                              )?.name ?? 'They'
                                          } left after taking the challenge up, so the duel is yours.`
                                        : 'You left after the challenge had been taken up, so it counts as a loss.'}
                                </RoomNote>
                            </div>
                            <DuelRematch view={view} />
                        </>
                    ) : (
                        <>
                    {tree && <RoomBracket view={view} serverNow={view.at} />}
                    {ended && replay ? (
                        // THE MATCH, PLAYED FOR SOMEBODY WHO WAS NOT THERE. No banner and
                        // no result card above it: the score is the thing being revealed,
                        // and printing it over the top would make the reveal pointless.
                        <div className="flex flex-col gap-3">
                            <VersusMatch
                                key={`replay-${view.code}`}
                                label="The match"
                                tie={ended.tie}
                                opponentName={ended.them.name}
                                yourXi={playersOf(
                                    myFormation,
                                    xiFrom(myFormation, view.you?.xi ?? {}),
                                )}
                                theirXi={theirPlayers(view, ended.them.userId)}
                                ratings
                                live
                                onEnd={finishWatching}
                            />
                            <div>
                                <button className={btn('quiet', 'sm')} onClick={finishWatching}>
                                    Skip to the result
                                </button>
                            </div>
                        </div>
                    ) : ended ? (
                        <>
                            <RoomResult view={view} tie={ended.tie} you={me} them={ended.them} />
                            {/* Only a duel offers one: a live room's rematch is opening
                                another room, which is where its players already are. A
                                duel's opponent is somebody you know and are not sitting
                                with, so "again?" is the whole of the loop. */}
                            <DuelRematch view={view} />
                        </>
                    ) : (
                        <div className={`${CARD_FLAT} p-5`}>
                            <RoomNote>This room is finished.</RoomNote>
                        </div>
                    )}
                        </>
                    )}
                </div>
            )}

            {/* A FINISHED ROOM HAS NO FOOTER AT ALL. There is nothing left to leave, so
                the row would be an empty band of margin under the result: the way out is
                the crumb at the top of the page. */}
            {view.status !== 'ended' && (
                <div className="mt-6 flex items-center gap-2">
                    {leaving ? (
                        <>
                            {/* FOUR DIFFERENT THINGS, and the copy has to say which - a
                                seat given up in a lobby, a duel called off for both
                                players, a duel's seat handed back so the challenge goes on
                                without you, and walking away from a tournament your XI
                                keeps playing in. `leaveKind` is the referee's own rule
                                read from this end. */}
                            <RoomNote>{LEAVING[leaveKind(view)].note}</RoomNote>
                            <button className={SECONDARY_BTN} onClick={leave}>
                                {LEAVING[leaveKind(view)].label}
                            </button>
                            <button
                                className={SECONDARY_BTN}
                                onClick={() => setLeaving(false)}
                            >
                                Stay
                            </button>
                        </>
                    ) : (
                        <button className={SECONDARY_BTN} onClick={() => setLeaving(true)}>
                            {LEAVING[leaveKind(view)].label}
                        </button>
                    )}
                </div>
            )}
        </>
    );
}

/** What a round is called in this room, for a round somebody has already played. */
function roundLabelOf(view: RoomView, round: number): string {
    return currentRoundLabel({ ...view, round }).toLowerCase();
}

/** The other player's XI, once their tie has been played and the referee has opened it. */
function theirPlayers(view: RoomView, userId: string): Player[] {
    const member = view.members.find((m) => m.userId === userId);
    const ids = view.revealed[userId];
    if (!member || !ids) return [];
    const f = getFormation(
        (member.formationName as FormationName) ?? '4-3-3',
        (member.style as Style) ?? 'bal',
    );
    return f ? playersOf(f, xiFrom(f, ids)) : [];
}
