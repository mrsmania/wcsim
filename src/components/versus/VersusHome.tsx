import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import {
    agoLine,
    duelLine,
    duelRules,
    duelTurn,
    lobbyJoinable,
    lobbyLine,
    offersRatingSwitch,
    seatsLine,
} from '../../domain/pvpView';
import { PICK_SECONDS, type PickSeconds } from '../../domain/pvpRoom';
import type { DuelRow, LobbyRoom } from '../../domain/pvpWire';
import { useHeldVersusRoom } from '../../nav/versusRoom';
import { createRoom, readDuels, readLobby } from '../../state/pvp/referee';
import { myRecord, NO_RECORD, type PvpRecord } from '../../state/pvp/records';
import {
    CARD,
    CHIP_OFF,
    CHIP_ON,
    MONO_CAP,
    PRIMARY_BTN,
    SECONDARY_BTN,
    StageHeader,
    btn,
} from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// The way in: make a room, or type the code somebody gave you.
//
// TWO KINDS OF ROOM, THREE SIZES, PUBLIC OR PRIVATE, AND EITHER CLOCK: buy an XI from a
// shared budget or roll random squads, two, four or eight people, a code you send to
// somebody or a room anybody signed in can find, twenty or thirty seconds a pick. That is
// every setting the referee takes; nothing it accepts is unreachable from here.
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
    { value: 90, label: '$90', sub: 'Tight: one star at most, and the rest is bargains.' },
    { value: 110, label: '$110', sub: 'About one 99 and ten players near 80.' },
    { value: 150, label: '$150', sub: 'Two or three genuine greats.' },
];

/** Two, four or eight. No description: the number is the answer, and the lobby states how
 *  many rounds that comes to. */
const SIZES = [
    { value: 2, label: 'Two' },
    { value: 4, label: 'Four' },
    { value: 8, label: 'Eight' },
];

/**
 * How long a pick gets (P20). Two values and not a slider, so the lobby list can say fast
 * or considered and a ladder could one day compare like with like.
 *
 * The referee has taken either since wave 1 and this form sent a flat twenty until wave 9,
 * with a comment upstairs calling that a decision and pointing at a note that did not
 * exist. It was an omission wearing a decision's clothes, and P20 is locked: the host
 * chooses. Independent of the draft method deliberately - twenty seconds is tight for
 * shopping a market and roomy for taking one man off a dealt squad, so tying the two
 * would make one of the two rooms wrong.
 */
const CLOCK_COPY: Record<PickSeconds, { label: string; sub: string }> = {
    20: { label: '20 seconds', sub: 'Fast. Decide on instinct and keep the room moving.' },
    30: {
        label: '30 seconds',
        sub: 'Considered. Time to read the market, or the squad you were dealt.',
    },
};

/** BUILT FROM THE REFEREE'S OWN LIST, not typed out beside it. That is the whole reason the
 *  omission above went unnoticed: a hardcoded 20 here agreed with nothing and disagreed with
 *  nothing either. A third clock length added to `PICK_SECONDS` is now a type error in
 *  `CLOCK_COPY` rather than a value the host silently cannot choose. */
const CLOCKS = PICK_SECONDS.map((value) => ({ value, ...CLOCK_COPY[value] }));

/** How many re-rolls a roll room allows. Named in outcomes: what the number MEANS is how
 *  often you can refuse a squad you were dealt. */
const REROLLS = [
    { value: 0, label: 'None', sub: 'Take what you are dealt, every time.' },
    { value: 3, label: 'Three', sub: 'Enough to refuse a squad with nobody you need.' },
    { value: 6, label: 'Six', sub: 'You will nearly always get a shape you want.' },
];

/**
 * One row of choices: the labels on the buttons, and ONE line under the row saying what the
 * chosen one means.
 *
 * The description used to live inside each button, which put four sentences on screen to
 * explain one decision and made every option a paragraph. `AscensionPicker` had already
 * settled the right shape - a row of short labels with a single line beneath that follows
 * the selection - and this is that. A button says what it is; the room says what it does.
 */
function Choice<T extends number | string>({
    label,
    options,
    value,
    onPick,
}: {
    label: string;
    options: readonly { value: T; label: string; sub?: string }[];
    value: T;
    onPick: (v: T) => void;
}) {
    const chosen = options.find((o) => o.value === value);
    return (
        <>
            <div className={`${MONO_CAP} mt-4`}>{label}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        onClick={() => onPick(o.value)}
                        className={`rounded-[5px] border px-3 py-1.5 font-mono text-[12px] font-bold transition ${
                            o.value === value ? CHIP_ON : CHIP_OFF
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
            {chosen?.sub && (
                <p className="mt-1.5 text-[12px] leading-snug text-muted">{chosen.sub}</p>
            )}
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
    const [pickSeconds, setPickSeconds] = useState<PickSeconds>(20);
    const [showRatings, setShowRatings] = useState(true);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);
    // A DUEL IS THE SAME FORM WITH THE WAITING TAKEN OUT (P51): the same two draft methods
    // and the same money, minus everything that only means something when people are
    // present - how many of you, how long a pick gets, who may walk in.
    const [pace, setPace] = useState<'live' | 'async'>('live');
    const [opponent, setOpponent] = useState('');
    const duel = pace === 'async';

    const make = () => {
        setBusy(true);
        setError(null);
        void createRoom({
            pace,
            // Empty means "whoever I send the link to", which is the same thing a private
            // room has always been. A name is a challenge to that person and nobody else.
            opponent: duel ? opponent.trim() : '',
            visibility: duel ? 'private' : visibility,
            size: duel ? 2 : size,
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
            pickSeconds,
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
    const [duels, setDuels] = useState<DuelRow[]>([]);
    const [record, setRecord] = useState<PvpRecord>(NO_RECORD);
    const [at, setAt] = useState(() => Date.now());
    const refreshLobby = useCallback(() => {
        void readLobby()
            .then((r) => {
                setLobby(r.rooms);
                setAt(Date.now());
            })
            .catch(() => setLobby([]));
        // YOUR DUELS, on the same beat. It fails silently like the lobby does, and for a
        // sharper reason: a referee that predates duels answers 404 for this route, and a
        // page that showed an error for it would be broken for everybody until the server
        // is rebuilt - where an absent list is just a feature that has not arrived.
        void readDuels()
            .then((r) => setDuels(r.duels))
            .catch(() => setDuels([]));
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
                    <div className={MONO_CAP}>{duel ? 'Challenge somebody' : 'Make a room'}</div>
                    <RoomNote>
                        An XI each out of all {WORLD_CUP_YEARS.length} World Cups, then one
                        match. Your career, album and perks stay out of it: eleven players
                        against eleven.
                    </RoomNote>

                    <Choice
                        label="When you play it"
                        value={pace}
                        onPick={setPace}
                        options={[
                            {
                                value: 'live' as const,
                                label: 'Together, now',
                                sub: 'Everybody in the room at once, on a pick clock.',
                            },
                            {
                                value: 'async' as const,
                                label: 'In your own time',
                                sub: 'Challenge one person. Neither of you has to be here: build your XI whenever, and the match plays itself when the second one is in.',
                            },
                        ]}
                    />

                    {duel ? (
                        <>
                            <div className={`${MONO_CAP} mt-4`}>Who</div>
                            <input
                                value={opponent}
                                onChange={(e) => setOpponent(e.target.value.slice(0, 24))}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="Their name"
                                aria-label="The name of the player to challenge"
                                className="mt-1.5 w-full rounded-[5px] border border-line bg-ground px-3 py-2.5 text-[15px] font-semibold text-ink outline-none focus:border-pitch"
                            />
                            <p className="mt-1.5 text-[12px] leading-snug text-muted">
                                {opponent.trim()
                                    ? `It goes to ${opponent.trim()} and nobody else can take it.`
                                    : 'Leave it blank and you get a link to send instead - the first person to open it takes it up.'}
                            </p>
                        </>
                    ) : (
                        <>
                            <Choice
                                label="How many of you"
                                value={size}
                                onPick={setSize}
                                options={SIZES}
                            />

                            <Choice
                                label="Who can join"
                                value={visibility}
                                onPick={setVisibility}
                                options={[
                                    {
                                        value: 'private' as const,
                                        label: 'Just my friends',
                                        sub: 'Code only. Nobody can find it, or even confirm it exists.',
                                    },
                                    {
                                        value: 'public' as const,
                                        label: 'Anybody',
                                        sub: 'Listed below for anyone signed in. It still has a code.',
                                    },
                                ]}
                            />
                        </>
                    )}

                    <Choice
                        label="How you get your players"
                        value={method}
                        onPick={setMethod}
                        options={[
                            {
                                value: 'budget' as const,
                                label: 'Buy them',
                                sub: 'Shop the whole dataset. The skill is knowing what a player is worth.',
                            },
                            {
                                value: 'roll' as const,
                                label: 'Roll for them',
                                sub: 'Random squads, one man from each. The skill is knowing who to take.',
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
                            <Choice
                                label="The numbers"
                                value={showRatings ? 'on' : 'off'}
                                onPick={(v) => setShowRatings(v === 'on')}
                                options={[
                                    { value: 'on' as const, label: 'Ratings on' },
                                    {
                                        value: 'off' as const,
                                        label: 'Ratings hidden',
                                        sub: 'Pick on the name and the year. The numbers come back at the whistle.',
                                    },
                                ]}
                            />
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

                    {/* LAST, and outside the method branch, because it is the one setting
                        that applies to both kinds of room (P20) - but not to a duel, which
                        has no clock at all: the whole point is that nobody is waiting. */}
                    {!duel && (
                        <Choice
                            label="How long a pick gets"
                            value={pickSeconds}
                            onPick={setPickSeconds}
                            options={CLOCKS}
                        />
                    )}

                    <button className={`${PRIMARY_BTN} mt-4 w-full`} disabled={busy} onClick={make}>
                        {duel ? 'Send the challenge' : 'Open a room'}
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
                {/* YOUR DUELS, ABOVE THE LOBBY, because one of these rows may be waiting for
                    you and no lobby row ever is. Nothing in this game sends a message, so
                    this list IS how a challenge arrives - which is also why it leads with
                    whose move it is rather than with a score. */}
                {duels.length > 0 && (
                    <div className={`${CARD} p-4`}>
                        <div className={MONO_CAP}>Your duels</div>
                        <ul className="mt-1">
                            {duels.map((d) => {
                                const turn = duelTurn(d);
                                return (
                                    <li
                                        key={d.code}
                                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair py-2.5 last:border-b-0"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13.5px] font-bold text-ink">
                                                {d.opponentName || 'Whoever takes it up'}
                                                <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                                                    {d.code}
                                                </span>
                                            </div>
                                            <div
                                                className={`text-[12px] ${
                                                    turn === 'yours'
                                                        ? 'font-semibold text-pitch-ink'
                                                        : 'text-muted'
                                                }`}
                                            >
                                                {duelLine(d)} &middot; {duelRules(d)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={`shrink-0 ${btn(
                                                turn === 'yours' ? 'primary' : 'secondary',
                                                'sm',
                                            )}`}
                                            onClick={() => navigate(`/versus/${d.code}`)}
                                        >
                                            {turn === 'yours'
                                                ? 'Your move'
                                                : turn === 'done'
                                                  ? 'See it'
                                                  : 'Open'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <div className={`${CARD} p-4`}>
                    <div className="flex items-baseline gap-3">
                        <div className={MONO_CAP}>Rooms you can join</div>
                        <button
                            type="button"
                            className="ml-auto font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted hover:text-pitch-ink"
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
                                            className={`shrink-0 ${btn('secondary', 'sm')}`}
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
