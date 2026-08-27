import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player } from '../../data/types';
import type { RoomView } from '../../domain/pvpWire';
import { getFormation, type FormationName, type Style } from '../../domain/formations';
import {
    meIn,
    memberOf,
    playersOf,
    roomDisplay,
    roundsFor,
    shouldReveal,
    spectateTie,
    tieOf,
    viewerTie,
    xiFrom,
} from '../../domain/pvpView';
import { holdVersusRoom } from '../../nav/versusRoom';
import { useVersusRoom } from '../../hooks/useVersusRoom';
import { CARD_FLAT, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN, StageHeader } from '../matchUi';
import RoomBracket, { currentRoundLabel, shortName } from './RoomBracket';
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

const HEADINGS: Record<string, string> = {
    lobby: 'The room',
    drafting: 'The draft',
    round: 'The match',
    ended: 'The result',
};

export default function RoomScreen({ code }: { code: string }) {
    const navigate = useNavigate();
    const room = useVersusRoom(code, true);
    const view = room.view;
    const [leaving, setLeaving] = useState(false);

    const leave = useCallback(() => {
        holdVersusRoom(null);
        navigate('/versus');
    }, [navigate]);

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

    if (!view) {
        // A PRIVATE ROOM IS INVISIBLE UNTIL YOU TAKE A SEAT, and that is the policy
        // working rather than a fault: a room you may not see answers "no such room"
        // rather than "not allowed", so a code cannot be confirmed by probing for it. So
        // arriving with a code and being told there is no room is the NORMAL first step,
        // and the answer to it is to join - which is what the code is for.
        const missing = room.error?.code === 'no-such-room';
        return (
            <>
                <StageHeader eyebrow="Versus" title={missing ? 'Take your seat' : 'Finding the room'} />
                <div className={`${CARD_FLAT} p-5`}>
                    {missing ? (
                        <RoomNote>
                            Room {code}. Take a seat and the room opens up; until you do, a
                            private room is not visible at all.
                        </RoomNote>
                    ) : room.error ? (
                        <RefereeProblem message={refereeMessage(room.error, 'reach the room')} />
                    ) : (
                        <RoomNote>One moment.</RoomNote>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {missing && (
                            <button
                                className={PRIMARY_BTN}
                                onClick={() => void room.join().catch(() => undefined)}
                            >
                                Join room {code}
                            </button>
                        )}
                        {room.error && (
                            <button className={SECONDARY_BTN} onClick={() => navigate('/versus')}>
                                Back to versus
                            </button>
                        )}
                    </div>
                </div>
            </>
        );
    }

    const me = meIn(view);

    // A public room you have not joined. The only way in is to take a seat.
    if (!me) {
        return (
            <>
                <StageHeader eyebrow="Versus" title="Join the room" />
                <div className={`${CARD_FLAT} p-5`}>
                    <RoomNote>
                        {view.members.length} of {view.size} are in, playing with $
                        {view.rules.budget} each.
                    </RoomNote>
                    <button className={`${PRIMARY_BTN} mt-3`} onClick={() => void room.join()}>
                        Take a seat
                    </button>
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
                        : (HEADINGS[view.status] ?? 'The room')
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
                                <RoomNote>
                                    Both teams are in. {them.name} versus you, any moment.
                                </RoomNote>
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
                                live={shouldReveal(mine.raw, view.at)}
                                onEnd={room.refresh}
                            />
                        )
                    ) : watching ? (
                        <>
                            <div className={`${CARD_FLAT} px-4 py-3`}>
                                <div className={MONO_CAP}>You are out</div>
                                <RoomNote>
                                    Your run ended in the{' '}
                                    {roundLabelOf(view, me.outIn ?? view.round)}. Stay and watch
                                    it out: this is {watching.home.name} against{' '}
                                    {watching.away.name}.
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
                    {tree && <RoomBracket view={view} serverNow={view.at} />}
                    {ended ? (
                        <RoomResult view={view} tie={ended.tie} you={me} them={ended.them} />
                    ) : (
                        <div className={`${CARD_FLAT} p-5`}>
                            <RoomNote>This room is finished.</RoomNote>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-6 flex items-center gap-2">
                {view.status === 'ended' ? (
                    <button className={PRIMARY_BTN} onClick={leave}>
                        Back to versus
                    </button>
                ) : leaving ? (
                    <>
                        <RoomNote>Your team plays on without you.</RoomNote>
                        <button className={SECONDARY_BTN} onClick={leave}>
                            Leave anyway
                        </button>
                        <button className={SECONDARY_BTN} onClick={() => setLeaving(false)}>
                            Stay
                        </button>
                    </>
                ) : (
                    <button className={SECONDARY_BTN} onClick={() => setLeaving(true)}>
                        Leave
                    </button>
                )}
            </div>
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
