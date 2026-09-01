import { useEffect, useRef, useState } from 'react';
import { type FormationName, type Style } from '../../domain/formations';
import { ROOM_SIZES } from '../../domain/pvpRoom';
import {
    KICKOFF_HOLD_SECONDS,
    KICKOFF_SECONDS,
    botsIn,
    everybodyReady,
    inviteUrl,
    isDuel,
    peopleIn,
    roundsFor,
    seatsOf,
} from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import { CARD, CHIP_OFF, CHIP_ON, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN } from '../matchUi';
import {
    EmptySeat,
    InviteRoom,
    KickoffCountdown,
    ReadyMark,
    ReportName,
    RoomNote,
    SeatRow,
} from './versusUi';
import ShapePicker from './ShapePicker';
import { DuelInvite } from './DuelPanels';

/** Where this build is being served from, for the invite link. Read here rather than
 *  inside `inviteUrl`, which is `domain/` and has no window - and defaulted so a checks
 *  harness or a server render cannot throw on it. */
const origin = (): string => (typeof window === 'undefined' ? '' : window.location.origin);
const base = (): string => import.meta.env.BASE_URL;

// The lobby: who is here, what shape you are playing, and the host's Start.
//
// FORMATION AND STYLE ARE CHOSEN HERE (P19) because they shape all eleven picks, and the
// clock should only ever cover picking players. They are also the reason a lobby cannot
// simply show everybody's row: your shape is yours until the room starts, or the last
// person to choose could counter everyone else.
//
// READY IS A SIGNAL, NOT A LOCK (P48). The host may start a full room whoever has
// pressed it, and anybody who has not is given an ordinary 4-3-3; you can change your
// shape right up to the start. Nobody can hold a room by wandering off, and it needs no
// second clock.
//
// A DUEL HAS A LOBBY TOO, and it is this one with three quarters of it switched off: no
// practice opponents, no playing it smaller, and no host Start. What is left is the half
// that matters - the shape, and Ready - because nothing at all is dealt or bought in a duel
// until both players have pressed it (`tickDuel`). That is the whole of the fix for "I can
// just close the room again and re-open one until I have a banger team": there is nothing
// to see before you are committed, and once you are, leaving costs the duel.
//
// NOBODY PRESSES START IN A DUEL. A live room's kick-off is sent by the host's own client
// after its three-second count, and a duel's two players are deliberately not both here, so
// the SERVER starts it on the same two conditions - full, and everybody ready. The count is
// therefore not armed here at all: the draft simply arrives on the next poll.
//
// A ROOM THAT WILL NOT FILL CAN BE PLAYED SMALLER (P7). The host may drop eight to four or
// two, never upwards and never below the people already sitting here, and NO BYES ARE EVER
// CREATED - the room plays a full bracket at its new size. It is offered rather than
// automatic, because "three of you turned up, shall we just play?" is the host's call and
// not the server's.

export default function RoomLobby({ view, room }: { view: RoomView; room: VersusRoom }) {
    const me = view.members.find((m) => m.userId === view.you?.userId) ?? null;
    const [name, setName] = useState<FormationName>(
        (me?.formationName as FormationName) || '4-3-3',
    );
    const [style, setStyle] = useState<Style>((me?.style as Style) || 'bal');
    const [busy, setBusy] = useState(false);
    const isHost = view.hostId === view.you?.userId;
    const full = view.members.length >= view.size;
    const duel = isDuel(view);
    // Downwards only, and never below the people already sitting here: that is the
    // referee's rule (`reduceSize`), and offering a button it would refuse is worse than
    // not offering one.
    const smaller =
        isHost && !duel
            ? ROOM_SIZES.filter((n) => n < view.size && n >= view.members.length)
            : [];
    // The practice opponents, and the counts the host may choose between: every chair no
    // PERSON is sitting in, which is the same bound `setBots` enforces. Offering a number
    // the referee would refuse is the same mistake as offering a size it would refuse.
    const bots = botsIn(view);
    const freeSeats = view.size - peopleIn(view).length;
    const botCounts = Array.from({ length: freeSeats + 1 }, (_, i) => i);

    /**
     * THE SHAPE IS SENT THE MOMENT IT IS PICKED, and that is what removed a button.
     *
     * It used to be held locally until you pressed something, so the primary action read
     * "I'm ready" and then turned into "Change my shape" - a button whose job was to post a
     * choice the chips looked as though they had already made. Nobody could tell what it
     * was for, which is the correct reaction: a chip that is lit and not yet sent is a lie.
     * Picking posts, so Ready is only ever Ready (P48 lets a ready player keep changing
     * shape right up to the start, so nothing here has to lock).
     *
     * A formation change may make the current STYLE illegal - a 3-4-3 has no defensive
     * variant - so it falls back to the first the new formation allows rather than leaving
     * an impossible pair on screen with a disabled button underneath, which is a dead end
     * the player did not ask for.
     */
    const post = (n: FormationName, s: Style, ready: boolean): void => {
        setName(n);
        setStyle(s);
        // Deliberately not gated on `busy`: that flag is the HOST's commands, and sharing
        // it made Start flicker disabled every time somebody tapped a formation. There is
        // no clock in a lobby, and a refused post is reconciled by the next poll.
        void room.ready(n, s, ready).catch(() => undefined);
    };
    /**
     * THE ROOM STARTS ITSELF ONCE EVERYBODY IS READY, and counts down to it.
     *
     * The two things that arm it are the same countdown: everybody pressing Ready, which
     * every client works out for itself from the room it already holds, and the host
     * pressing Start on a room where somebody has not (P48 keeps that button, since Ready
     * is a signal rather than a lock). The first is DERIVED, which is the only reason it
     * needs no new server route and nothing deployed: the same fact reaches every screen
     * within a poll, so everybody counts down together, and at zero the HOST's client
     * sends the instruction it would otherwise have waited for a tap to send.
     *
     * The host's own press is the one asymmetry and it is accepted: a room that was not
     * all-ready has nothing the other clients can read, so they see the draft arrive rather
     * than a count. Fixing that means an instruction the referee does not have, which is
     * the same wall P41's Skip is behind.
     *
     * `armed` drops the moment the room stops being full or somebody un-readies, and the
     * count restarts from three, so a seat lost at "one" is a cancelled kick-off rather
     * than a start the referee refuses.
     *
     * THE COVER COMES OFF AT ZERO, not when the draft arrives (`KickoffCountdown` carries
     * the reason). So this lobby is what is on screen for the round trip in between, and it
     * says so - `starting` below - rather than going back to reading "it starts as soon as
     * everybody is ready" of a room that is already starting.
     */
    const [pressed, setPressed] = useState(false);
    const [since, setSince] = useState<number | null>(null);
    const [now, setNow] = useState(0);
    const fired = useRef(false);
    const armed = !duel && full && (everybodyReady(view) || pressed);
    useEffect(() => {
        if (!armed) {
            setSince(null);
            setPressed(false);
            fired.current = false;
            return;
        }
        // `performance.now()`, never the wall clock: the same monotonic reading the pick
        // clock counts on, and for the same reason - a phone that corrects its clock
        // mid-count must not jump to zero or back to three.
        const from = performance.now();
        setSince(from);
        setNow(from);
        const t = window.setInterval(() => setNow(performance.now()), 100);
        return () => window.clearInterval(t);
    }, [armed]);

    const elapsed = since === null ? 0 : (now - since) / 1000;
    const left = Math.max(0, Math.ceil(KICKOFF_SECONDS - elapsed));
    useEffect(() => {
        if (!armed || since === null || left > 0 || fired.current || !isHost) return;
        fired.current = true;
        void room.start().catch(() => undefined);
    }, [armed, since, left, isHost, room]);

    // The count is over and the room has not moved: the host's tab may have gone in the
    // last second, or its Start may have failed, so the lobby stops promising a kick-off
    // and offers the host another go.
    const stalled = elapsed > KICKOFF_SECONDS + KICKOFF_HOLD_SECONDS;
    // The count has run out and the draft has not landed yet. Uncovered now, so it needs a
    // sentence of its own: this is the ordinary case (one round trip, or one poll for
    // everybody who is not the host), not the failure `stalled` describes.
    const starting = armed && !stalled && left <= 0;

    /** Count again, from three. It is the host's Start button and it is also the way OUT of
     *  a stall: the fire is latched per countdown rather than for ever, so pressing this
     *  after one gives the room another go. */
    const rearm = (): void => {
        fired.current = false;
        const from = performance.now();
        setSince(from);
        setNow(from);
        setPressed(true);
    };

    return (
        <div className="grid items-start gap-[22px] min-[860px]:grid-cols-[minmax(0,1fr)_360px]">
            <div className={`${CARD} p-4`}>
                <ShapePicker
                    name={name}
                    style={style}
                    onPick={(n, st) => post(n, st, me?.ready ?? false)}
                    note={
                        duel
                            ? 'Choose it now. Nothing is dealt until you are both ready, and once the draft starts the slots are the shape.'
                            : 'Chosen here, not on the clock: the clock only ever covers picking players.'
                    }
                />

                {/* One button, labelled for what it DOES. The seat list beside it is where
                    the state is shown, so the button does not have to be both. */}
                <button
                    className={`${me?.ready ? SECONDARY_BTN : PRIMARY_BTN} mt-4`}
                    onClick={() => post(name, style, !me?.ready)}
                >
                    {me?.ready ? 'Not ready' : "I'm ready"}
                </button>
                {duel && (
                    <RoomNote>
                        <span className="mt-2 block">
                            {me?.ready
                                ? full
                                    ? 'Ready. It starts the moment they are too.'
                                    : 'Ready. It starts as soon as somebody takes the challenge up.'
                                : view.rules.method === 'roll'
                                  ? 'Your first squad is dealt once you are both ready, and not before.'
                                  : 'The market opens once you are both ready, and not before.'}
                        </span>
                    </RoomNote>
                )}
            </div>

            <div className={`${CARD} p-4`}>
                {/* A DUEL'S INVITATION IS ITS OWN PANEL, because the sentence beside the
                    link is a different one: a live room's is "send this to whoever is
                    playing tonight" and a duel's is "nothing happens at all until somebody
                    opens this". It used to sit above the board during the draft, which is
                    where a duel started; there is a lobby to put it in again. */}
                {duel ? (
                    <DuelInvite view={view} />
                ) : (
                    <>
                        <div className={MONO_CAP}>Invite somebody</div>
                        <div className="mt-1.5">
                            <InviteRoom
                                code={view.code}
                                url={inviteUrl(origin(), base(), view.code)}
                            />
                        </div>
                        <RoomNote>
                            {view.visibility === 'private'
                                ? 'Private. The link puts them straight in; nobody else can find it.'
                                : 'Public: it is on the list too, so anybody signed in can join.'}
                        </RoomNote>
                    </>
                )}

                <div className={`${MONO_CAP} mt-4`}>
                    {view.members.length} of {view.size} here
                </div>
                {/* EVERY CHAIR, INCLUDING THE EMPTY ONES. A lobby is mostly about who is
                    not here yet, and a list of the people present cannot say that: four
                    rows with two of them empty is the room, where "2 of 4" is a count. It
                    is also what makes the practice opponents below read as what they are -
                    a way to fill exactly those rows. */}
                <ul className="mt-1">
                    {seatsOf(view).map((m, i) =>
                        m ? (
                            <SeatRow
                                key={m.userId}
                                member={m}
                                you={m.userId === view.you?.userId}
                                host={m.userId === view.hostId}
                                detail={
                                    <span className="flex items-center gap-2.5">
                                        <ReadyMark ready={m.ready} />
                                        {/* Not for yourself, not for a seat the host
                                            filled, and only in the lobby: this is where you
                                            first read a STRANGER's name (P22), and a
                                            practice opponent is not a stranger - it is
                                            named by this build. */}
                                        {!m.bot && m.userId !== view.you?.userId && (
                                            <ReportName userId={m.userId} name={m.name} />
                                        )}
                                    </span>
                                }
                            />
                        ) : (
                            <EmptySeat key={`empty-${i}`} />
                        ),
                    )}
                </ul>

                {/* PRACTICE OPPONENTS (`domain/pvpBot.ts`). The one thing a room of eight
                    cannot do for itself is find eight people, and P7's play-it-smaller only
                    answers half of that: dropping to two is a different evening from the
                    tournament the host opened. Filling the chairs is the other half, and it
                    is deliberately not automatic - "shall we just play?" is the host's call.
                    A seat given up here is given back the moment somebody arrives, since a
                    person joining a full room takes the newest bot's chair. */}
                {isHost && !duel && freeSeats > 0 && (
                    <>
                        <div className={`${MONO_CAP} mt-4`}>Nobody else coming?</div>
                        <RoomNote>
                            Fill the empty chairs and start now. They build their own XI out
                            of the same pool, spend nearly all the money, and play to win.
                        </RoomNote>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {botCounts.map((n) => (
                                <button
                                    key={n}
                                    disabled={busy}
                                    className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition ${
                                        n === bots.length ? CHIP_ON : CHIP_OFF
                                    }`}
                                    onClick={() => {
                                        setBusy(true);
                                        void room.setBots(n).finally(() => setBusy(false));
                                    }}
                                >
                                    {n === 0 ? 'None' : `${n} opponent${n === 1 ? '' : 's'}`}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {smaller.length > 0 && (
                    <>
                        <div className={`${MONO_CAP} mt-4`}>Not going to fill?</div>
                        <RoomNote>Play it smaller. Everyone here keeps their seat.</RoomNote>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {smaller.map((n) => (
                                <button
                                    key={n}
                                    disabled={busy}
                                    className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition ${CHIP_OFF}`}
                                    onClick={() => {
                                        setBusy(true);
                                        void room.resize(n).finally(() => setBusy(false));
                                    }}
                                >
                                    Play {n}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div className={`${MONO_CAP} mt-4`}>The rules</div>
                <RoomNote>
                    {view.rules.method === 'budget'
                        ? `Buy an XI with $${view.rules.budget}, out of every World Cup, ${view.pickSeconds} seconds a pick.`
                        : `Roll random squads and pick one man from each, ${view.rerolls} re-roll${
                              view.rerolls === 1 ? '' : 's'
                          } each, ${view.pickSeconds} seconds a pick.`}{' '}
                    {roundsFor(view.size) > 1
                        ? `Then ${roundsFor(view.size)} knockout rounds.`
                        : 'Then one match.'}{' '}
                    No boosts, no perks and no chemistry: eleven players against eleven.
                </RoomNote>
                {!view.showRatings && (
                    <RoomNote>
                        <span className="mt-1.5 block font-semibold text-amber-ink">
                            Ratings are hidden. Pick on the name and the year; the numbers come
                            back at the whistle.
                        </span>
                    </RoomNote>
                )}

                {duel ? (
                    // Nobody starts a duel by hand: the server does it the moment both
                    // players are ready, since neither of them need be here for the other's.
                    <RoomNote>
                        <span className="mt-4 block">
                            {full
                                ? 'It starts as soon as you are both ready. Neither of you has to be here for the other.'
                                : 'Send the link. Nothing is dealt until somebody takes it up.'}
                        </span>
                    </RoomNote>
                ) : isHost ? (
                    <button
                        className={`${PRIMARY_BTN} mt-4 w-full`}
                        // Live again once a countdown has stalled, which is the only way
                        // back from a Start that did not land.
                        disabled={!full || busy || (armed && !stalled)}
                        // It arms the same countdown the room arms itself, rather than
                        // starting the draft under everybody: three seconds is the
                        // difference between a draft appearing and a draft beginning.
                        onClick={rearm}
                    >
                        {full
                            ? stalled
                                ? 'Start it again'
                                : starting
                                  ? 'Starting the draft'
                                  : 'Start the draft'
                            : `Waiting for ${view.size - view.members.length} more`}
                    </button>
                ) : (
                    full && (
                        <RoomNote>
                            <span className="mt-4 block">
                                {stalled
                                    ? 'Waiting for the host to start it.'
                                    : starting
                                      ? 'Starting the draft.'
                                      : 'It starts as soon as everybody is ready.'}
                            </span>
                        </RoomNote>
                    )
                )}
            </div>

            {/* The kick-off. Last in the tree because it covers the screen, and mounted
                only while there is a number to show: at zero it lifts and the lobby above
                waits for the draft, which is what took the unreadable "Kick-off" screen out
                (see `KickoffCountdown`). `stalled` is the other way out, for a host tab that
                went in the last second. */}
            {armed && !stalled && left > 0 && <KickoffCountdown secondsLeft={left} />}
        </div>
    );
}
