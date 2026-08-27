import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import {
    agoLine,
    lobbyJoinable,
    lobbyLine,
    offersRatingSwitch,
    seatsLine,
} from '../../domain/pvpView';
import type { LobbyRoom } from '../../domain/pvpWire';
import { useHeldVersusRoom } from '../../nav/versusRoom';
import { createRoom, readLobby } from '../../state/pvp/referee';
import { myRecord, NO_RECORD, type PvpRecord } from '../../state/pvp/records';
import {
    CARD,
    MONO_CAP,
    PRIMARY_BTN,
    SECONDARY_BTN,
    SECONDARY_BTN_BASE,
    StageHeader,
} from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// The way in: make a room, or type the code somebody gave you.
//
// TWO KINDS OF ROOM, THREE SIZES, AND NOW PUBLIC OR PRIVATE: buy an XI from a shared budget
// or roll random squads, two, four or eight people, and either a code you send to somebody
// or a room anybody signed in can find. The one control the referee still takes and this
// does not offer is the thirty-second clock, which is a decision rather than an omission:
// see the note on `PICK_SECONDS`.
//
// THE LOBBY LIST IS THE HALF OF THIS FEATURE THAT DEPENDS ON OTHER PEOPLE, and it is
// therefore also the half that looks broken when nobody is playing. So an empty list says
// so in the room's own voice and puts the answer next to it - open one - rather than
// rendering an empty table and leaving the reader to wonder whether it loaded.
//
// SIZE IS THE ONE SETTING THAT CHANGES THE SHAPE OF THE EVENING rather than the shape of an
// XI, so it is written in rounds and in waiting: a room of eight is three rounds and a draft
// that finishes when the SLOWEST of eight people finishes (P47), which is the cost that
// decision knowingly accepts. The host can drop the size later if the room will not fill
// (P7), which is what stops a room of eight becoming a room of nobody.
//
// THE RATINGS SWITCH IS OFFERED FOR A ROLL ROOM AND NOT FOR A BUDGET ONE (P5), and the
// reason is not squeamishness: a budget room shows a price computed straight from the
// rating it would be hiding, so the switch would hide nothing. That was P14, and it is
// void because the two can no longer co-occur. `offersRatingSwitch` is that rule, shared
// with the checks.
//
// WRITTEN IN OUTCOMES, NOT SETTINGS (plan section 8). "$110 buys about one 99-rated star
// and ten players around 80" is a sentence somebody can act on; "budget: 110" is not, and
// a player can arrive here having never built an XI, since the mode is deliberately
// independent of the career.

/** The budgets on offer, and what each one buys. The referee allows $70 to $200 in any
 *  step; three named choices are what a room needs, and the third is the one that makes
 *  the price curve bite. */
const BUDGETS = [
    { value: 90, label: '$90', sub: 'Tight. One star at most, and the rest is bargains.' },
    { value: 110, label: '$110', sub: 'The standard. About one 99 and ten players near 80.' },
    { value: 150, label: '$150', sub: 'Generous. Two or three genuine greats.' },
];

/** The three sizes, named in what each one is to play rather than in seats. */
const SIZES = [
    { value: 2, label: 'Two', sub: 'One match. Straight into it.' },
    { value: 4, label: 'Four', sub: 'Semi-finals and a final. Two rounds.' },
    { value: 8, label: 'Eight', sub: 'Quarters, semis, final. The longest wait to draft.' },
];

/** How many re-rolls a roll room allows. Named in outcomes: what the number MEANS is how
 *  often you can refuse a squad you were dealt. */
const REROLLS = [
    { value: 0, label: 'None', sub: 'Take what you are dealt, every time.' },
    { value: 3, label: 'Three', sub: 'Enough to refuse a squad with nobody you need.' },
    { value: 6, label: 'Six', sub: 'Generous. You will nearly always get a shape you want.' },
];

/** One row of choices, each a name and a sentence about what it does to the game. */
function Choice<T extends number | string>({
    label,
    options,
    value,
    onPick,
}: {
    label: string;
    options: readonly { value: T; label: string; sub: string }[];
    value: T;
    onPick: (v: T) => void;
}) {
    return (
        <>
            <div className={`${MONO_CAP} mt-4`}>{label}</div>
            <div className="mt-1.5 flex flex-col gap-1.5">
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        onClick={() => onPick(o.value)}
                        className={`rounded-[5px] border px-3 py-2 text-left transition ${
                            o.value === value
                                ? 'border-pitch bg-pitch/10'
                                : 'border-line bg-panel hover:border-pitch'
                        }`}
                    >
                        <span className="font-mono text-[13px] font-bold text-ink">{o.label}</span>
                        <span className="ml-2 text-[12px] text-muted">{o.sub}</span>
                    </button>
                ))}
            </div>
        </>
    );
}

export default function VersusHome() {
    const navigate = useNavigate();
    const held = useHeldVersusRoom();
    const [method, setMethod] = useState<'budget' | 'roll'>('budget');
    const [visibility, setVisibility] = useState<'private' | 'public'>('private');
    const [size, setSize] = useState(2);
    const [budget, setBudget] = useState(110);
    const [rerolls, setRerolls] = useState(3);
    const [showRatings, setShowRatings] = useState(true);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);

    const make = () => {
        setBusy(true);
        setError(null);
        void createRoom({
            visibility,
            size,
            method,
            budget,
            rerolls,
            // The referee forces this true for a budget room regardless (P5); sending the
            // honest value rather than a hopeful one keeps the two sides agreeing.
            showRatings: offersRatingSwitch(method) ? showRatings : true,
            // Every tournament. Empty means all, exactly as the pool setting does - never
            // a literal list of every current year, which is the bug that once hid a
            // whole World Cup from every existing save.
            years: [],
            pickSeconds: 20,
        })
            .then((room) => navigate(`/versus/${room.code}`))
            .catch((err: unknown) => {
                setBusy(false);
                // Whatever the referee said, said back. The old version of this replaced
                // every refusal with one sentence, which was true of a wrong sign-in
                // secret, a name the server cannot read, and a database error alike.
                setError(refereeMessage(err, 'open a room'));
            });
    };

    // The lobby, and this account's record. Both are decorations beside the thing you came
    // to do, so neither failing puts anything on screen: the list simply stays empty and
    // the record stays at zero.
    const [lobby, setLobby] = useState<LobbyRoom[] | null>(null);
    const [record, setRecord] = useState<PvpRecord>(NO_RECORD);
    const [at, setAt] = useState(() => Date.now());
    const refreshLobby = useCallback(() => {
        void readLobby()
            .then((r) => {
                setLobby(r.rooms);
                setAt(Date.now());
            })
            .catch(() => setLobby([]));
    }, []);
    useEffect(() => {
        refreshLobby();
        void myRecord().then(setRecord);
        // Ten seconds, not two: a lobby is a list you scan before deciding, and a row that
        // reshuffles under the pointer is worse than a row a few seconds stale. The room
        // itself polls fast; this does not need to.
        const t = window.setInterval(refreshLobby, 10_000);
        return () => window.clearInterval(t);
    }, [refreshLobby]);

    const join = (e: React.FormEvent) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c.length >= 4) navigate(`/versus/${c}`);
    };

    return (
        <>
            <StageHeader eyebrow="Versus" title="Play somebody" />

            {held && (
                <div className={`${CARD} mb-[18px] flex flex-wrap items-center gap-3 p-4`}>
                    <div className="min-w-0 flex-1">
                        <div className={MONO_CAP}>You are in a room</div>
                        <RoomNote>
                            {held.code} &middot; {held.line}
                        </RoomNote>
                    </div>
                    <button className={PRIMARY_BTN} onClick={() => navigate(`/versus/${held.code}`)}>
                        Back to it
                    </button>
                </div>
            )}

            {record.played > 0 && (
                <div className={`${CARD} mb-[18px] flex flex-wrap items-baseline gap-x-5 gap-y-1 p-4`}>
                    <div className={MONO_CAP}>Your record</div>
                    <span className="text-[14px] font-bold text-ink">
                        {record.won} won, {record.lost} lost
                    </span>
                    {record.roomsWon > 0 && (
                        <span className="text-[13px] text-muted">
                            {record.roomsWon} room{record.roomsWon === 1 ? '' : 's'} won outright
                        </span>
                    )}
                </div>
            )}

            <div className="grid items-start gap-[22px] min-[860px]:grid-cols-2">
                <div className={`${CARD} p-4`}>
                    <div className={MONO_CAP}>Make a room</div>
                    <RoomNote>
                        An XI each out of all {WORLD_CUP_YEARS.length} World Cups, twenty
                        seconds a pick, then a knockout. Your career, album and perks stay out
                        of it: eleven players against eleven.
                    </RoomNote>

                    <Choice label="How many of you" value={size} onPick={setSize} options={SIZES} />

                    <Choice
                        label="Who can join"
                        value={visibility}
                        onPick={setVisibility}
                        options={[
                            {
                                value: 'private' as const,
                                label: 'Just my friends',
                                sub: 'Code only. Nobody can find it, and nobody can even confirm it exists.',
                            },
                            {
                                value: 'public' as const,
                                label: 'Anybody',
                                sub: 'Listed below for anyone signed in. It still has a code.',
                            },
                        ]}
                    />

                    <Choice
                        label="How you get your players"
                        value={method}
                        onPick={setMethod}
                        options={[
                            {
                                value: 'budget' as const,
                                label: 'Buy them',
                                sub: 'Shop the whole dataset against a budget. Skill is knowing what a player is worth.',
                            },
                            {
                                value: 'roll' as const,
                                label: 'Roll for them',
                                sub: 'Random squads, one at a time, pick one man from each. Skill is knowing who to take.',
                            },
                        ]}
                    />

                    {method === 'budget' ? (
                        <Choice
                            label="How much each"
                            value={budget}
                            onPick={setBudget}
                            options={BUDGETS}
                        />
                    ) : (
                        <>
                            <Choice
                                label="Re-rolls each"
                                value={rerolls}
                                onPick={setRerolls}
                                options={REROLLS}
                            />
                            {/* P40: this is a HOUSE RULE and the copy says so. The app ships
                                a squad browser whose whole purpose is to expose every rating,
                                and a second tab defeats it completely. It hides the numbers
                                on the room's own screens, which is worth having and is all it
                                claims. */}
                            <div className={`${MONO_CAP} mt-4`}>The numbers</div>
                            <div className="mt-1.5 flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setShowRatings(true)}
                                    className={`rounded-[5px] border px-3 py-2 text-left transition ${
                                        showRatings
                                            ? 'border-pitch bg-pitch/10'
                                            : 'border-line bg-panel hover:border-pitch'
                                    }`}
                                >
                                    <span className="font-mono text-[13px] font-bold text-ink">
                                        Ratings on
                                    </span>
                                    <span className="ml-2 text-[12px] text-muted">
                                        You both see what everybody is rated.
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowRatings(false)}
                                    className={`rounded-[5px] border px-3 py-2 text-left transition ${
                                        !showRatings
                                            ? 'border-pitch bg-pitch/10'
                                            : 'border-line bg-panel hover:border-pitch'
                                    }`}
                                >
                                    <span className="font-mono text-[13px] font-bold text-ink">
                                        Ratings hidden
                                    </span>
                                    <span className="ml-2 text-[12px] text-muted">
                                        Pick on the name and the year. The numbers come back at
                                        the whistle.
                                    </span>
                                </button>
                            </div>
                            {!showRatings && (
                                <RoomNote>
                                    <span className="mt-2 block">
                                        A house rule, not a lock: the Squads tab shows every
                                        rating, so a second tab defeats it. Agree not to.
                                    </span>
                                </RoomNote>
                            )}
                        </>
                    )}

                    <button className={`${PRIMARY_BTN} mt-4 w-full`} disabled={busy} onClick={make}>
                        Open a room
                    </button>
                    {error && (
                        <RefereeProblem
                            message={error}
                            // The one refusal with an answer: go to the room that holds
                            // your seat. Without this the player is told they are in a room
                            // and given no way to reach it, which is how the reported bug
                            // felt even after leaving started working.
                            action={
                                error.room ? (
                                    <button
                                        className={SECONDARY_BTN}
                                        onClick={() => navigate(`/versus/${error.room}`)}
                                    >
                                        Go to room {error.room}
                                    </button>
                                ) : undefined
                            }
                        />
                    )}
                </div>

                <div className="flex flex-col gap-[22px]">
                <div className={`${CARD} p-4`}>
                    <div className="flex items-baseline gap-3">
                        <div className={MONO_CAP}>Rooms you can join</div>
                        <button
                            type="button"
                            className="ml-auto font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-pitch"
                            onClick={refreshLobby}
                        >
                            Refresh
                        </button>
                    </div>
                    {lobby === null ? null : lobby.length === 0 ? (
                        <RoomNote>
                            Nobody has a public room open. Open one and it appears here.
                        </RoomNote>
                    ) : (
                        <ul className="mt-1">
                            {lobby.map((r) => {
                                const open = lobbyJoinable(r);
                                return (
                                    <li
                                        key={r.code}
                                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair py-2.5 last:border-b-0"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13.5px] font-bold text-ink">
                                                {r.hostName || 'Somebody'}
                                                {/* The code is on the row because a public
                                                    room's code is not a secret, and it is
                                                    what somebody reads out when they say
                                                    "I'm in this one". */}
                                                <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                                                    {r.code}
                                                </span>
                                                <span className="ml-2 font-mono text-[11px] font-medium text-muted">
                                                    {seatsLine(r)}
                                                </span>
                                            </div>
                                            <div className="text-[12px] text-muted">
                                                {lobbyLine(r)} &middot; {agoLine(r.openedAt, at)}
                                            </div>
                                        </div>
                                        {/* A ROW action, so it takes the identity token and
                                            its own tighter box: the page-level size would
                                            be taller than the hairline row it sits in. */}
                                        <button
                                            type="button"
                                            disabled={!open}
                                            className={`shrink-0 px-3 py-1.5 text-[12px] ${SECONDARY_BTN_BASE} ${
                                                open ? '' : 'cursor-not-allowed opacity-45'
                                            }`}
                                            onClick={() => navigate(`/versus/${r.code}`)}
                                        >
                                            {open ? 'Take a seat' : 'Full'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <form className={`${CARD} p-4`} onSubmit={join}>
                    <div className={MONO_CAP}>Join with a code</div>
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="ABC234"
                        aria-label="Room code"
                        className="mt-3 w-full rounded-[5px] border border-line bg-ground px-3 py-2.5 text-center font-mono text-[20px] font-bold tracking-[0.3em] text-ink outline-none focus:border-pitch"
                    />
                    <button className={`${SECONDARY_BTN} mt-3 w-full`} disabled={code.trim().length < 4}>
                        Go to the room
                    </button>
                </form>
                </div>
            </div>
        </>
    );
}
