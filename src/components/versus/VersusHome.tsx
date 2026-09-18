import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import {
    agoLine,
    draftLengthLine,
    duelAlert,
    duelDowngraded,
    duelListed,
    lobbyJoinable,
    lobbyLine,
    offersRatingSwitch,
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
import {
    BigChoice,
    DuelLine,
    HeadCount,
    RefereeProblem,
    RefreshButton,
    RoomNote,
    SeatPips,
    SectionHead,
    Setting,
    SettingRow,
} from './versusUi';

// THE VERSUS TAB: everything you have on, everything you have played, and the way to start
// another one.
//
// REWORKED 2026-09-15, on five criticisms of the page it replaces, all of them the owner's
// and all of them true of what was there: far too much text; the duel history pushing the
// thing you came for below the fold; a lobby that did not look like a lobby, with a Refresh
// nobody could tell was pressable; far too many buttons to open a room; and no guidance
// anywhere, because every part of the page was marked with a 10px grey caption.
//
// The drawing is docs/redesign-2026/turf-flat/versus-option-2.html, chosen from five in
// versus-page-mock.html. Its shape, and the reason for each half:
//
// TWO COLUMNS THAT NEVER SWAP: everything you DO on the left, everything that is HAPPENING
// on the right. That is what answers the second criticism structurally rather than by
// ordering: the history lives in the other column, so however many duels it grows to it
// cannot push the form down by a pixel. It also means both columns start at the same height,
// so the lobby is on screen from the first paint whether or not you have ever played one.
//
// SEVEN CHIP ROWS BECOME TWO BIG CHOICES AND THREE FOLDED SETTINGS. The form was twenty
// chips and seven explaining paragraphs to open a room whose defaults are already right.
// Folding alone would have been no improvement - it would only have hidden them - so each
// folded row SHOWS ITS OWN ANSWER ("Roll, 3 re-rolls"), and the whole room is legible
// without opening anything. Which three you get is the field dependency doing the work: a
// challenge has nobody to wait for and no clock, so it gets two.
//
// ON A PHONE IT IS ONE COLUMN IN THE ORDER start, join, lobby, waiting, on now.
// The obvious alternative - hoist whatever is waiting on you to the top - was drawn and
// rejected by the owner, and the reason it costs nothing is that the chrome already carries
// a duel strip on every other screen in the game (`useDuelAlert`): somebody with a match
// waiting has been told before they ever opened this page. It is `display: contents` on the
// two column wrappers plus an `order` on each section, so nothing is duplicated and nothing
// moves between sections - there is one of each in the DOM at every width.
//
// THREE SECTIONS ON THE RIGHT AND EACH IS ABSENT WHEN EMPTY. "Waiting on you" and the lobby
// are things to act on now; "On now" is the one to look at. An empty "Waiting on you" would
// be a promise of noise, so it is not rendered at all rather than rendered empty - which is
// also what keeps a first visit down to two sections.
//
// THE ARCHIVE IS NOT HERE ANY MORE (2026-09-17). Finished matches you have watched are the
// third segment of Records, beside the honours ledger and the trophy cabinet, because this
// page is where you go to DO something and that is a list which only ever grows. Nothing is
// duplicated: a result you have not watched is still on this page, under "Waiting on you",
// since the score is the thing being withheld and watching it is an action. It lands in
// Records once you have.
//
// WRITTEN IN OUTCOMES, NOT SETTINGS (plan section 8). "$125 buys about 85 across the team"
// is a sentence somebody can act on; "budget: 125" is not, and a player can arrive here
// having never built an XI, since the mode is deliberately independent of the career.

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

const BUDGETS = ROOM_BUDGETS.map((value) => ({
    value,
    label: `$${value}`,
}));

/** Two, four or eight, and what the number means for the evening: a room of eight is three
 *  rounds, and P47's wait is at the end of the draft rather than at every pick. */
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
const CLOCK_COPY: Record<PickSeconds, { label: string }> = {
    20: { label: '20 seconds' },
    30: {
        label: '30 seconds',
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
const DRAFT_COPY: Record<DraftSeconds, { label: string }> = {
    180: {
        label: '3 minutes',
    },
    300: {
        label: '5 minutes',
    },
    480: {
        label: '8 minutes',
    },
};
const DRAFTS = DRAFT_SECONDS.map((value) => ({ value, ...DRAFT_COPY[value] }));

/** How many re-rolls a roll room allows. Named in outcomes: what the number MEANS is how
 *  often you can refuse a squad you were dealt. */
const REROLLS = [
    { value: 0, label: 'None' },
    { value: 3, label: 'Three' },
    { value: 6, label: 'Six' },
];

/**
 * What to say when the versus server is older than duels.
 *
 * `deployment: true` because it is nothing the player can do anything about, which is the
 * distinction that field exists for: this is the owner's to fix by rebuilding the server.
 */
const NO_DUELS: RefereeMessage = {
    text: 'The versus server is running an older build, so the challenge it opened is not the one this page knows how to play. It has been closed again. Play "Create a cup" until the server is updated.',
    raw: 'duels not deployed',
    deployment: true,
    room: null,
};

/** One row of chips inside a folded setting: short labels, and one line beneath that
 *  follows the selection. `AscensionPicker` settled that shape - a button says what it is,
 *  and the room says what it does - and it is why there is no description inside a chip. */
function Chips<T extends number | string>({
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
        <SettingRow label={label} note={chosen?.sub}>
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
        </SettingRow>
    );
}

export default function VersusHome({ name, onRename }: { name: string; onRename: () => void }) {
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
    // to do, so neither failing puts anything on screen: the list simply stays empty, and
    // the record resolves to zeros, which only decides whether a first visit gets the
    // introduction.
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

    // TWO LISTS, AND THE SPLIT IS BY WHAT THE READER CAN DO rather than by whether the
    // game is over. "Waiting on you" is the to-do list and "In play" is the ones where the
    // next move is somebody else's. There were three until 2026-09-17, when the record went
    // to the Records tab; the page that remains is the half you can act on.
    //
    // A DUEL THAT ENDED WITHOUT AN OUTCOME IS NOT A GAME THAT WAS PLAYED, so it is on no
    // list at all - a challenge nobody took up and its sender called off, or one nobody
    // touched for a week, under a heading reading "Your results" is simply untrue. A
    // walkover has a winner and stays (`duelListed`).
    // THE ALERT DECIDES FIRST AND THE STATUS SECOND, which is the one ordering that works.
    // A finished match nobody has watched is WAITING rather than a result - the score is the
    // thing being withheld, so filing it under the record would give it away in the same
    // breath - and the first version of this tested the status first, so such a match was in
    // neither list and vanished off the page altogether. A finished match you HAVE watched
    // matches neither test and is on Records instead, which is the same partition read one
    // page wider: alert here, else open here, else done there.
    const listed = duels.filter(duelListed);
    const waiting = listed.filter((d) => duelAlert(d, watched));
    const inPlay = listed.filter((d) => !duelAlert(d, watched) && d.status !== 'ended');

    // NOTHING AT ALL YET, which is the only state the long explanation is for. It used to
    // sit above the controls on every visit, a hundred words nobody reads twice; here it is
    // shown to the one reader who has never seen a versus match and to nobody else.
    const firstTime = listed.length === 0 && record.played === 0;

    const join = (e: React.FormEvent) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c.length >= 4) navigate(`/versus/${c}`);
    };

    // What each folded setting says while it is shut. This is the whole of what makes them
    // a fold rather than a hiding place, so each one is the room's own words for the value
    // rather than the value: "Roll, 3 re-rolls", never "roll / 3".
    const whoAnswer = `${SIZES.find((s) => s.value === size)?.label ?? size} people, ${
        visibility === 'private' ? 'friends only' : 'anybody'
    }`;
    const playersAnswer =
        method === 'budget'
            ? `Buy, $${budget} each`
            : `Roll, ${rerolls === 1 ? '1 re-roll' : `${rerolls} re-rolls`}`;
    // A BUDGET DUEL HAS NO HOUSE RULES AT ALL, and the section is absent rather than empty:
    // the ratings switch is not offered for a buying room (P5, a price is computed from the
    // rating it would hide) and a duel has no clock (P51, nobody is waiting). That leaves
    // nothing to put in it, which is the field dependency doing its job.
    const clockAnswer = duel
        ? null
        : method === 'budget'
          ? draftLengthLine(draftSeconds)
          : `${pickSeconds}s a pick`;
    const ratingsAnswer = offersRatingSwitch(method)
        ? showRatings
            ? 'Ratings on'
            : 'Ratings hidden'
        : null;
    const rulesAnswer = [ratingsAnswer, clockAnswer].filter(Boolean).join(', ');

    return (
        <>
            <StageHeader
                title="Play somebody"
                // WHO YOU ARE, ON THE TITLE'S OWN LINE. It was a full card, which is a
                // lot of furniture for a name, and a card that says only your own name is
                // chrome.
                controls={
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                        Your name: <span className="font-bold text-ink">{name}</span>
                        <button className={btn('secondary', 'compact')} onClick={onRename}>
                            Change
                        </button>
                    </div>
                }
            />

            {/* THE ROOM YOU ARE IN, ABOVE EVERYTHING AND FULL WIDTH. The chrome's own room
                strip is shown on every screen in the game EXCEPT this one, so this card is
                the only pointer back, and it outranks both columns at every width. */}
            {held && (
                <div className={`${CARD} mb-[22px] flex flex-wrap items-center gap-3 p-4`}>
                    <div className="min-w-0 flex-1">
                        <div className={MONO_CAP}>You are in a room</div>
                        <RoomNote>
                            {held.code} &middot; {held.line}
                        </RoomNote>
                    </div>
                    <button
                        className={PRIMARY_BTN}
                        onClick={() => navigate(`/versus/${held.code}`)}
                    >
                        Back to it
                    </button>
                </div>
            )}

            {/* THE TWO COLUMNS. Below 860px both wrappers are `display: contents`, so the
                six sections become grid items of this one grid and the `order` on each puts
                them in the phone's order; at and above it the wrappers are blocks, and
                `order` has no meaning outside a flex or grid parent, so source order wins
                and nothing has to be reset. */}
            <div className="grid items-start gap-[22px] min-[860px]:grid-cols-[1.15fr_1fr]">
                <div className="contents min-[860px]:block min-[860px]:space-y-[22px]">
                    <section className="order-1">
                        <SectionHead title="Start a match" />
                        <div className={`${CARD} p-4`}>
                            {firstTime && (
                                <p className="mb-3 text-[13px] leading-relaxed text-muted">
                                    An XI each out of all {WORLD_CUP_YEARS.length} World Cups, then
                                    one match. Your career, album and perks stay out of it: eleven
                                    players against eleven.
                                </p>
                            )}

                            <BigChoice
                                name="When you play it"
                                value={pace}
                                onPick={setPace}
                                options={[
                                    {
                                        value: 'async' as const,
                                        label: 'Challenge a friend',
                                        sub: 'Cross swords with whomever you send your personal link.',
                                    },
                                    {
                                        value: 'live' as const,
                                        label: 'Create a cup',
                                        sub: 'Round of eight, semifinal or final, challenge whoever is online.',
                                    },
                                ]}
                            />

                            <div className="mt-3">
                                {!duel && (
                                    <Setting label="Who is playing" answer={whoAnswer}>
                                        <Chips
                                            label="How many users?"
                                            value={size}
                                            onPick={setSize}
                                            options={SIZES}
                                        />
                                        <Chips
                                            label="Who can join?"
                                            value={visibility}
                                            onPick={setVisibility}
                                            options={[
                                                {
                                                    value: 'public' as const,
                                                    label: 'Anybody',
                                                    sub: 'Room will be Listed in the lobby, open for the public.',
                                                },
                                                {
                                                    value: 'private' as const,
                                                    label: 'Friends only',
                                                    sub: 'Users can only join via code.',
                                                },
                                            ]}
                                        />
                                    </Setting>
                                )}

                                <Setting label="How you get your players" answer={playersAnswer}>
                                    <BigChoice
                                        name="How you get your players"
                                        value={method}
                                        onPick={setMethod}
                                        options={[
                                            {
                                                value: 'roll' as const,
                                                label: 'Roll for them',
                                                sub: 'XI random squads, one man from each.',
                                            },
                                            {
                                                value: 'budget' as const,
                                                label: 'Buy them',
                                                sub: 'Shop your XI from the transfer market.',
                                            },
                                        ]}
                                    />
                                    {method === 'budget' ? (
                                        <Chips
                                            label="How much budget per user?"
                                            value={budget}
                                            onPick={setBudget}
                                            options={BUDGETS}
                                        />
                                    ) : (
                                        <Chips
                                            label="How many re-rolls per user?"
                                            value={rerolls}
                                            onPick={setRerolls}
                                            options={REROLLS}
                                        />
                                    )}
                                </Setting>

                                {rulesAnswer && (
                                    <Setting label="House rules" answer={rulesAnswer}>
                                        {/* P40: this is a HOUSE RULE and the copy says so.
                                            The app ships a squad browser whose whole purpose
                                            is to expose every rating, and a second tab
                                            defeats it completely. It hides the numbers on
                                            the room's own screens, which is worth having and
                                            is all it claims. */}
                                        {offersRatingSwitch(method) && (
                                            <Chips
                                                value={showRatings ? 'on' : 'off'}
                                                label="Display player ratings while drafting?"
                                                onPick={(v) => setShowRatings(v === 'on')}
                                                options={[
                                                    { value: 'on' as const, label: 'Ratings on' },
                                                    {
                                                        value: 'off' as const,
                                                        label: 'Ratings off',
                                                    },
                                                ]}
                                            />
                                        )}
                                        {/* TWO CLOCKS, because the two methods no longer keep
                                            time the same way (P52). A roll draft is eleven
                                            decisions about eleven dealt squads, so it runs a
                                            window per pick; a budget draft is one decision
                                            about one pool of money, so it runs one clock over
                                            the lot and lets you go back and sell. */}
                                        {!duel &&
                                            (method === 'budget' ? (
                                                <Chips
                                                    label="How much time for drafting the XI?"
                                                    value={draftSeconds}
                                                    onPick={setDraftSeconds}
                                                    options={DRAFTS}
                                                />
                                            ) : (
                                                <Chips
                                                    label="How much time per pick?"
                                                    value={pickSeconds}
                                                    onPick={setPickSeconds}
                                                    options={CLOCKS}
                                                />
                                            ))}
                                    </Setting>
                                )}
                            </div>

                            {duel && !duelsRoute && (
                                <p className="mt-4 rounded-[5px] border border-line bg-faint px-3 py-2.5 text-[12px] leading-snug text-muted">
                                    The versus server here has not been rebuilt for duels yet, so a
                                    challenge cannot be sent. Everything else about versus works;
                                    play "Create a cup" until it is updated.
                                </p>
                            )}
                            {/* THE OTHER SKEW HAS NO PROBE and cannot have one: a server that
                                has duels but predates the change below answers this route
                                perfectly well. It is caught on the ANSWER instead
                                (`duelDowngraded`), which is why that guard tests the status
                                as well as the pace. */}

                            <button
                                className={`${PRIMARY_BTN} mt-4 w-full`}
                                disabled={busy || (duel && !duelsRoute)}
                                onClick={make}
                            >
                                {duel ? 'Create challenge' : 'Open room'}
                            </button>
                            {error && (
                                <RefereeProblem
                                    message={error}
                                    // The one refusal with an answer: go to the room that
                                    // holds your seat. Without this the player is told they
                                    // are in a room and given no way to reach it, which is
                                    // how the reported bug felt even after leaving started
                                    // working.
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
                    </section>
                </div>

                <div className="contents min-[860px]:block min-[860px]:space-y-[22px]">
                    {waiting.length > 0 && (
                        <section className="order-4">
                            <SectionHead
                                title="Waiting on you"
                                count={<HeadCount>{waiting.length}</HeadCount>}
                            />
                            {/* The one card on the page that carries the ink border: it is
                                the only thing here with something to do about it. */}
                            <div className={`${CARD} border-pitch-dark p-4`}>
                                <ul>
                                    {waiting.map((d) => (
                                        <DuelLine
                                            key={d.code}
                                            row={d}
                                            watched={watched}
                                            go={(c) => navigate(`/versus/${c}`)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    <section className="order-3">
                        <SectionHead title="Lobby" end={<RefreshButton onClick={refreshLobby} />} />
                        <div className={`${CARD} p-4`}>
                            {lobby === null ? (
                                <RoomNote>Looking.</RoomNote>
                            ) : lobby.length === 0 ? (
                                // THE HALF OF THIS FEATURE THAT DEPENDS ON OTHER PEOPLE is
                                // also the half that looks broken when nobody is playing. So
                                // an empty list says so in the room's own voice, rather than
                                // rendering an empty table and leaving the reader to wonder
                                // whether it loaded.
                                <RoomNote>No open rooms right now.</RoomNote>
                            ) : (
                                <ul>
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
                                                        {/* The code is on the row because a
                                                            public room's code is not a secret,
                                                            and it is what somebody reads out
                                                            when they say "I'm in this one". */}
                                                        <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                                                            {r.code}
                                                        </span>
                                                    </div>
                                                    <div className="text-[12px] text-muted">
                                                        {lobbyLine(r)} &middot;{' '}
                                                        {agoLine(r.openedAt, at)}
                                                    </div>
                                                </div>
                                                {/* THE SEATS, BETWEEN THE NAME AND THE WAY IN.
                                                    The row said "2 of 4 seats left" in words
                                                    and led with nothing; drawn and placed here
                                                    the list gets three columns that line up. */}
                                                <SeatPips
                                                    size={r.size}
                                                    seated={r.seated}
                                                    bots={r.bots}
                                                />
                                                {/* A ROW action, so it takes its own tighter
                                                    box: the page-level size would be taller
                                                    than the hairline row it sits in. */}
                                                <button
                                                    type="button"
                                                    disabled={!open}
                                                    className={`shrink-0 ${btn(open ? 'primary' : 'secondary', 'compact')}`}
                                                    onClick={() => navigate(`/versus/${r.code}`)}
                                                >
                                                    {open ? 'Take a seat' : 'Full'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {lobby !== null && lobby.length > 0 && (
                                // UNDER THE LIST, because it describes the list rather than
                                // the control above it: what Refresh is FOR, given that the
                                // list already keeps itself up to date.
                                //
                                // It says the interval rather than when it last looked, and
                                // that is a correction rather than a shortening: an age
                                // between two stamps taken in the same breath is always
                                // "just now", so the line would have been decoration that
                                // could never be wrong and could never be useful either.
                                <p className="mt-2.5 text-[12px] text-dim">
                                    This list refreshes itself every 10 seconds.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="order-2">
                        <SectionHead title="Join with a code" />
                        <form
                            className={`${CARD} flex flex-wrap items-center gap-3 p-4`}
                            onSubmit={join}
                        >
                            <input
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                                autoCapitalize="characters"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="ABC234"
                                aria-label="Room code"
                                className="min-w-0 flex-1 rounded-[5px] border border-line bg-ground px-3 py-2.5 text-center font-mono text-[18px] font-bold tracking-[0.3em] text-ink outline-none focus:border-pitch"
                            />
                            <button className={SECONDARY_BTN} disabled={code.trim().length < 4}>
                                Go
                            </button>
                        </form>
                    </section>

                    {inPlay.length > 0 && (
                        <section className="order-5">
                            <SectionHead
                                title="On now"
                                count={<HeadCount>{inPlay.length}</HeadCount>}
                            />
                            <div className={`${CARD} p-4`}>
                                <ul>
                                    {inPlay.map((d) => (
                                        <DuelLine
                                            key={d.code}
                                            row={d}
                                            watched={watched}
                                            go={(c) => navigate(`/versus/${c}`)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    {/* WHERE THE ARCHIVE WENT. One quiet line, and it earns its place
                        rather than being a second navigation: the results used to be at
                        the foot of this column, so without it a match you watched simply
                        appears to have been deleted. It is shown only once there is
                        something over there to find, and it is the only cross-reference
                        on the page - the tab bar is the way to everywhere else. */}
                    {record.played > 0 && (
                        <section className="order-6">
                            <p className="text-[12px] leading-snug text-muted">
                                Matches you have played and watched are kept in{' '}
                                <button
                                    type="button"
                                    className="font-semibold text-pitch-ink hover:underline"
                                    onClick={() => navigate('/records/versus')}
                                >
                                    Records
                                </button>
                                , with your win and loss record.
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </>
    );
}
