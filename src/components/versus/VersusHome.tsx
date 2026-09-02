import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import {
    agoLine,
    duelAlert,
    duelDowngraded,
    duelLine,
    duelRules,
    duelListed,
    duelTurn,
    lobbyJoinable,
    lobbyLine,
    offersRatingSwitch,
    seatsLine,
} from '../../domain/pvpView';
import {
    DEFAULT_DRAFT_SECONDS,
    DEFAULT_ROOM_BUDGET,
    DRAFT_SECONDS,
    PICK_SECONDS,
    ROOM_BUDGETS,
    type DraftSeconds,
    type PickSeconds,
    type RoomBudget,
} from '../../domain/pvpRoom';
import type { DuelRow, LobbyRoom } from '../../domain/pvpWire';
import { useHeldVersusRoom } from '../../nav/versusRoom';
import { RefereeError, createRoom, leaveRoom, readDuels, readLobby } from '../../state/pvp/referee';
import { onDuelsChanged } from '../../state/pvp/duels';
import { myRecord, NO_RECORD, type PvpRecord } from '../../state/pvp/records';
import { onWatchedChange, watchedDuels } from '../../state/pvp/watched';
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

// THE VERSUS TAB: everything you have on, everything you have played, and the way to start
// another one.
//
// IT LEADS WITH YOUR OWN MATCHES because of duels. A live room is a thing you are AT for
// twenty minutes, so the page that opens one is the page; a duel is a thing you are IN for
// days, and the question somebody arrives with is "is there anything waiting for me" - not
// "what settings shall I choose". So your matches are first, the form is beside them, and
// the public lobby is under it.
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

/**
 * What each budget buys, in the only terms that matter: how good the team comes out.
 *
 * BUILT FROM THE DOMAIN'S OWN LADDER, not typed out beside it - the same rule the clock
 * lengths follow, and for the same reason (a list that agrees with nothing also disagrees
 * with nothing). A sixth rung is a type error here rather than a figure the host silently
 * cannot choose.
 *
 * The numbers are MEASURED, 2026-08-30: the rating of the best XI each budget can actually
 * buy, over all fifteen tournaments. Re-derive them rather than trusting them; the dataset
 * moves, and this figure has been restated once already.
 */
const BUDGET_COPY: Record<RoomBudget, string> = {
    100: 'Tight. A well-shopped XI rates about 82, and every slot is a compromise.',
    125: 'About 85 across the team. Room for a name or two, and the rest is judgement.',
    150: 'About 88. Three genuine greats, or spread it and take nine good ones.',
    175: 'About 90. The squeeze is mostly off and the XI is elite either way.',
    200: 'About 92. Nearly every slot can be a great, so the game is won elsewhere.',
};
const BUDGETS = ROOM_BUDGETS.map((value) => ({ value, label: `$${value}`, sub: BUDGET_COPY[value] }));

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

/** And the WHOLE DRAFT's lengths (P52), which is what a budget room runs instead. Built
 *  from the domain's own list for the same reason, and worded in what the time is FOR: the
 *  question a host is answering is how long an evening this is, not how many seconds. */
const DRAFT_COPY: Record<DraftSeconds, { label: string; sub: string }> = {
    180: {
        label: '3 minutes',
        sub: 'Brisk. About what eleven twenty-second picks used to add up to.',
    },
    300: {
        label: '5 minutes',
        sub: 'Room to shop, change your mind and rearrange the shape.',
    },
    480: {
        label: '8 minutes',
        sub: 'Unhurried. Read the market properly and tune the last few slots.',
    },
};
const DRAFTS = DRAFT_SECONDS.map((value) => ({ value, ...DRAFT_COPY[value] }));

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
/**
 * What to say when the versus server is older than duels.
 *
 * `deployment: true` because it is nothing the player can do anything about, which is the
 * distinction that field exists for: this is the owner's to fix by rebuilding the server.
 */
const NO_DUELS: RefereeMessage = {
    text: 'The versus server is running an older build, so the challenge it opened is not the one this page knows how to play. It has been closed again. Play "Together, now" until the server is updated.',
    raw: 'duels not deployed',
    deployment: true,
    room: null,
};

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

/**
 * One duel on the list.
 *
 * THE ACTION IS WHAT THE ROW IS FOR, and there are three of them: a match nobody has
 * watched is the loudest thing on this page, then a team that is not sent, then everything
 * else, which is a link to look at. `duelAlert` decides the first two and it is shared with
 * the chrome's strip, so the tab and the page can never disagree about what is waiting.
 */
function DuelLine({
    row,
    watched,
    go,
}: {
    row: DuelRow;
    watched: ReadonlySet<string>;
    go: (to: string) => void;
}) {
    const alert = duelAlert(row, watched);
    const turn = duelTurn(row);
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink">
                    {row.opponentName || 'Nobody yet'}
                    <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                        {row.code}
                    </span>
                </div>
                <div
                    className={`text-[12px] ${
                        alert ? 'font-semibold text-pitch-ink' : 'text-muted'
                    }`}
                >
                    {alert === 'watch' ? 'The match has been played' : duelLine(row)} &middot;{' '}
                    {duelRules(row)}
                </div>
            </div>
            <button
                type="button"
                className={`shrink-0 ${btn(alert ? 'primary' : 'secondary', 'compact')}`}
                onClick={() => go(`/versus/${row.code}`)}
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

export default function VersusHome({
    name,
    onRename,
}: {
    name: string;
    onRename: () => void;
}) {
    const navigate = useNavigate();
    const held = useHeldVersusRoom();
    // ROLLING IS THE DEFAULT (2026-08-30). It is the game this one actually is: a squad you
    // did not choose, one man from it, and the same eleven decisions for everybody. Buying
    // is the variant where knowing the price list is the skill, and it is one tap away.
    const [method, setMethod] = useState<'budget' | 'roll'>('roll');
    const [visibility, setVisibility] = useState<'private' | 'public'>('private');
    const [size, setSize] = useState(2);
    const [budget, setBudget] = useState<RoomBudget>(DEFAULT_ROOM_BUDGET);
    const [rerolls, setRerolls] = useState(3);
    const [pickSeconds, setPickSeconds] = useState<PickSeconds>(20);
    const [draftSeconds, setDraftSeconds] = useState<DraftSeconds>(DEFAULT_DRAFT_SECONDS);
    const [showRatings, setShowRatings] = useState(true);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);
    // A DUEL IS THE SAME FORM WITH THE WAITING TAKEN OUT (P51): the same two draft methods
    // and the same money, minus everything that only means something when people are
    // present - how many of you, how long a pick gets, who may walk in.
    //
    // AND MINUS WHO, since 2026-08-31. A challenge used to be addressed to an account by
    // display name, which meant knowing what somebody had called themselves before you
    // could play them, and a whole apparatus behind it - a name lookup, a seat nobody else
    // could take, an accept-or-decline screen, a refusal for opening the wrong link. The
    // link says all of that already: whoever you send it to is who you are playing.
    const [pace, setPace] = useState<'live' | 'async'>('live');
    const duel = pace === 'async';

    const make = () => {
        setBusy(true);
        setError(null);
        void createRoom({
            pace,
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
            draftSeconds,
        })
            .then(async (room) => {
                // THE ANSWER IS TESTED, NOT THE STATUS. A server that predates duels opens
                // an ordinary room for one and reports success, so without this the player
                // asked for a challenge and silently got a live lobby. The room it opened
                // instead is CLOSED rather than left in the way: it is not the one that was
                // asked for, and it would otherwise hold this account's one live seat (P39)
                // until the sweeper collected it a quarter of an hour later.
                if (duel && duelDowngraded('async', room)) {
                    await leaveRoom(room.code).catch(() => undefined);
                    setBusy(false);
                    setError(NO_DUELS);
                    return;
                }
                navigate(`/versus/${room.code}`);
            })
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
    // Whether this server does duels at all, probed off the list below rather than
    // announced: `PVP_PROTOCOL` was deliberately not bumped for an additive change, so the
    // handshake cannot tell an old container from a new one. It is a HINT and not a gate -
    // the authoritative test is the answer to the create itself - so it starts optimistic
    // and only a refusal that means exactly this moves it.
    const [duelsRoute, setDuelsRoute] = useState(true);
    const [record, setRecord] = useState<PvpRecord>(NO_RECORD);
    const [watched, setWatched] = useState<ReadonlySet<string>>(watchedDuels);
    useEffect(() => onWatchedChange(setWatched), []);
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
            .then((r) => {
                setDuels(r.duels);
                setDuelsRoute(true);
            })
            .catch((err: unknown) => {
                setDuels([]);
                // ONLY this one refusal means "this server has no duels". A timeout, a 500
                // or a signed-out session all land here too and mean nothing of the sort,
                // and treating them the same would hide the feature over a dropped packet.
                if (err instanceof RefereeError && err.code === 'no-such-route') {
                    setDuelsRoute(false);
                }
            });
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
    // AND AT ONCE WHEN THIS PLAYER HAS JUST MOVED ONE. Withdrawing from a duel is a
    // forfeit, so the row leaves "On now" for a loss under "Played" - but the leave is
    // answered after this screen has already mounted and read the list, so ten seconds of
    // it saying the game is still on is ten seconds of it being wrong about something the
    // reader did themselves. `duelsChanged` fires when the referee answers.
    useEffect(() => onDuelsChanged(refreshLobby), [refreshLobby]);

    // ON NOW versus PLAYED. Two lists rather than one sorted list, because they are read
    // for different reasons: the first is a to-do list and the second is a record. A duel
    // that CLOSED without a match belongs with the played ones - it is over either way.
    // A DUEL THAT ENDED WITHOUT AN OUTCOME IS NOT A GAME THAT WAS PLAYED, so it is not on
    // the list at all - a challenge nobody took up and its sender called off, or one nobody
    // touched for a week, under a heading reading "Played" is simply untrue. A walkover has
    // a winner and stays (`duelListed`).
    const listed = duels.filter(duelListed);
    const open = listed.filter((d) => d.status !== 'ended');
    const finished = listed.filter((d) => d.status === 'ended');

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

            {/* WHO YOU ARE, AND WHAT YOU HAVE DONE, ON ONE LINE. Both answer the same
                question - what the others see of you - and the name is the half that was
                missing: a player who picked one once had no way of finding out what it was,
                let alone changing it. It is not two cards, because the record half is often
                empty and a card that says only your own name is chrome. The name is always
                there, so this row always is. */}
            <div className={`${CARD} mb-[18px] flex flex-wrap items-center gap-x-5 gap-y-1 p-4`}>
                <div className={MONO_CAP}>You are</div>
                <span className="text-[14px] font-bold text-ink">{name}</span>
                {record.played > 0 && (
                    <span className="text-[13px] text-muted">
                        {record.won} won, {record.lost} lost
                        {record.roomsWon > 0 &&
                            `, ${record.roomsWon} room${record.roomsWon === 1 ? '' : 's'} won outright`}
                    </span>
                )}
                <button className={`${btn('secondary', 'compact')} ml-auto`} onClick={onRename}>
                    Change name
                </button>
            </div>

            {/* YOUR MATCHES, FIRST AND FULL WIDTH. Nothing in this game sends a message,
                so this list is the only way a duel ever reaches anybody: a team waiting to
                be sent, an opponent who has just sent theirs, a match played overnight
                while nobody was watching. A form for starting another one is not what
                somebody opens this page to find. */}
            {open.length > 0 && (
                <div className={`${CARD} mb-[22px] p-4`}>
                    <div className={MONO_CAP}>On now</div>
                    <ul className="mt-1">
                        {open.map((d) => (
                            <DuelLine key={d.code} row={d} watched={watched} go={navigate} />
                        ))}
                    </ul>
                </div>
            )}

            {finished.length > 0 && (
                <div className={`${CARD} mb-[22px] p-4`}>
                    <div className={MONO_CAP}>Played</div>
                    <ul className="mt-1">
                        {finished.map((d) => (
                            <DuelLine key={d.code} row={d} watched={watched} go={navigate} />
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid items-start gap-[22px] min-[860px]:grid-cols-2">
                <div className={`${CARD} p-4`}>
                    <div className={MONO_CAP}>{duel ? 'Challenge somebody' : 'Make a room'}</div>
                    <RoomNote>
                        An XI each out of all {WORLD_CUP_YEARS.length} World Cups, then one
                        match. Your career, album and perks stay out of it: eleven players
                        against eleven.
                        {duel && (
                            <span className="mt-1.5 block">
                                You get a link to send. Whoever opens it takes the challenge,
                                you each build in your own time once you are both ready, and
                                the match plays itself when the second team is sent.
                            </span>
                        )}
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

                    {duel ? null : (
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
                        // Rolling first, because it is the default and every other row in
                        // this form puts its default first.
                        options={[
                            {
                                value: 'roll' as const,
                                label: 'Roll for them',
                                sub: 'Random squads, one man from each. The skill is knowing who to take.',
                            },
                            {
                                value: 'budget' as const,
                                label: 'Buy them',
                                sub: 'Shop the whole dataset. The skill is knowing what a player is worth.',
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

                    {/* LAST, because it is the last thing to decide - and it is now TWO
                        settings rather than one, because the two methods no longer keep
                        time the same way (P52). A roll draft is eleven decisions about
                        eleven dealt squads, so it runs a window per pick; a budget draft is
                        one decision about one pool of money, so it runs one clock over the
                        lot and lets you go back and sell. A duel has neither: nobody is
                        waiting, which is the whole point of it. */}
                    {!duel &&
                        (method === 'budget' ? (
                            <Choice
                                label="How long the whole draft gets"
                                value={draftSeconds}
                                onPick={setDraftSeconds}
                                options={DRAFTS}
                            />
                        ) : (
                            <Choice
                                label="How long a pick gets"
                                value={pickSeconds}
                                onPick={setPickSeconds}
                                options={CLOCKS}
                            />
                        ))}

                    {duel && !duelsRoute && (
                        <p className="mt-4 rounded-[5px] border border-line bg-faint px-3 py-2.5 text-[12px] leading-snug text-muted">
                            The versus server here has not been rebuilt for duels yet, so a
                            challenge cannot be sent. Everything else about versus works;
                            play "Together, now" until it is updated.
                        </p>
                    )}
                    {/* THE OTHER SKEW HAS NO PROBE and cannot have one: a server that has
                        duels but predates the change below answers this route perfectly
                        well. It is caught on the ANSWER instead (`duelDowngraded`), which
                        is why that guard tests the status as well as the pace. */}

                    <button
                        className={`${PRIMARY_BTN} mt-4 w-full`}
                        disabled={busy || (duel && !duelsRoute)}
                        onClick={make}
                    >
                        {duel ? 'Start building my XI' : 'Open a room'}
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
                                            className={`shrink-0 ${btn('secondary', 'compact')}`}
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
