import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import {
    agoLine,
    draftLengthLine,
    duelAlert,
    duelDowngraded,
    duelLine,
    duelRules,
    duelListed,
    duelTurn,
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
import { CARD, CHIP_OFF, CHIP_ON, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN, StageHeader, btn } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import {
    BigChoice,
    HeadCount,
    LiveCount,
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
// ON A PHONE IT IS ONE COLUMN IN THE ORDER start, join, lobby, waiting, on now, results.
// The obvious alternative - hoist whatever is waiting on you to the top - was drawn and
// rejected by the owner, and the reason it costs nothing is that the chrome already carries
// a duel strip on every other screen in the game (`useDuelAlert`): somebody with a match
// waiting has been told before they ever opened this page. It is `display: contents` on the
// two column wrappers plus an `order` on each section, so nothing is duplicated and nothing
// moves between sections - there is one of each in the DOM at every width.
//
// FOUR SECTIONS ON THE RIGHT AND EACH IS ABSENT WHEN EMPTY. "Waiting on you" and the lobby
// are things to act on now; "On now" and "Your results" are things to look at. An empty
// "Waiting on you" would be a promise of noise, so it is not rendered at all rather than
// rendered empty - which is also what keeps a first visit down to two sections.
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
const BUDGET_COPY: Record<RoomBudget, string> = {
    100: 'Tight. A well-shopped XI rates about 82, and every slot is a compromise.',
    125: 'About 85 across the team. Room for a name or two, and the rest is judgement.',
    150: 'About 88. Three genuine greats, or spread it and take nine good ones.',
    175: 'About 90. The squeeze is mostly off and the XI is elite either way.',
    200: 'About 92. Nearly every slot can be a great, so the game is won elsewhere.',
};
const BUDGETS = ROOM_BUDGETS.map((value) => ({ value, label: `$${value}`, sub: BUDGET_COPY[value] }));

/** Two, four or eight, and what the number means for the evening: a room of eight is three
 *  rounds, and P47's wait is at the end of the draft rather than at every pick. */
const SIZES = [
    { value: 2, label: 'Two', sub: 'One match, and it is over.' },
    { value: 4, label: 'Four', sub: 'Two rounds: a semi-final and a final.' },
    { value: 8, label: 'Eight', sub: 'Three rounds. Whoever goes out first stays and watches.' },
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

/**
 * One duel on one of the three lists.
 *
 * THE ACTION IS WHAT THE ROW IS FOR, and there are three of them: a match nobody has
 * watched is the loudest thing on this page, then a team that is not sent, then everything
 * else, which is a link to look at. `duelAlert` decides the first two and it is shared with
 * the chrome's strip, so the tab and the page can never disagree about what is waiting.
 *
 * `code` is FALSE on a finished one, which is the owner's third correction: a code is how
 * you reach a room, and a room that has been played is not going anywhere. An open one keeps
 * it, and has to - a challenge nobody has taken up has no other identity, since the opponent
 * column reads "Nobody yet" until somebody follows the link.
 */
function DuelLine({
    row,
    watched,
    code = true,
    go,
}: {
    row: DuelRow;
    watched: ReadonlySet<string>;
    code?: boolean;
    go: (to: string) => void;
}) {
    const alert = duelAlert(row, watched);
    const turn = duelTurn(row);
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink">
                    {row.opponentName || 'Nobody yet'}
                    {code && (
                        <span className="ml-2 font-mono text-[11px] font-medium tracking-[0.1em] text-dim">
                            {row.code}
                        </span>
                    )}
                </div>
                <div className={`text-[12px] ${alert ? 'font-semibold text-pitch-ink' : 'text-muted'}`}>
                    {alert === 'watch' ? 'The match has been played' : duelLine(row)}
                    {/* What it plays is worth knowing while there is still a team to build
                        and is noise once there is not: a finished row's own line is the
                        result, and appending "roll for your XI, one man from each squad" to
                        it wrapped every alert onto a second line to say nothing. */}
                    {row.status !== 'ended' && <> &middot; {duelRules(row)}</>}
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

/** How many finished duels are listed before the rest are folded away. A record is
 *  something you go looking for, so the section says how many there are and shows the
 *  newest few. */
const RESULTS_SHOWN = 3;

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
    const [allResults, setAllResults] = useState(false);
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

    // THREE LISTS, NOT TWO, and the split is by what the reader can DO rather than by
    // whether the game is over. "Waiting on you" is the to-do list, "In play" is the ones
    // where the next move is somebody else's, "Your results" is the record. The old page
    // had the first two under one heading, which meant the only urgent thing on the page
    // sat in a list of things that are not.
    //
    // A DUEL THAT ENDED WITHOUT AN OUTCOME IS NOT A GAME THAT WAS PLAYED, so it is on no
    // list at all - a challenge nobody took up and its sender called off, or one nobody
    // touched for a week, under a heading reading "Your results" is simply untrue. A
    // walkover has a winner and stays (`duelListed`).
    // THE ALERT DECIDES FIRST AND THE STATUS SECOND, which is the one ordering that works.
    // A finished match nobody has watched is WAITING rather than a result - the score is the
    // thing being withheld, so filing it under the record would give it away in the same
    // breath - and the first version of this tested the status first, so such a match was in
    // neither list and vanished off the page altogether. The three are a partition of
    // `listed` by construction now: alert, else open, else done.
    const listed = duels.filter(duelListed);
    const waiting = listed.filter((d) => duelAlert(d, watched));
    const inPlay = listed.filter((d) => !duelAlert(d, watched) && d.status !== 'ended');
    const played = listed.filter((d) => !duelAlert(d, watched) && d.status === 'ended');
    const results = allResults ? played : played.slice(0, RESULTS_SHOWN);

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
                // WHO YOU ARE AND WHAT YOU HAVE DONE, ON THE TITLE'S OWN LINE. It was a
                // full card, which is a lot of furniture for a name - and a card that often
                // says only your own name is chrome. Both halves answer the same question,
                // what the others see of you, and the record half is simply absent until
                // there is one.
                controls={
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                        <span className="font-bold text-ink">{name}</span>
                        {record.played > 0 && (
                            <span>
                                {record.won} won, {record.lost} lost
                                {record.roomsWon > 0 &&
                                    `, ${record.roomsWon} room${record.roomsWon === 1 ? '' : 's'} won outright`}
                            </span>
                        )}
                        <button className={btn('secondary', 'compact')} onClick={onRename}>
                            Change name
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
                    <button className={PRIMARY_BTN} onClick={() => navigate(`/versus/${held.code}`)}>
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
                                    An XI each out of all {WORLD_CUP_YEARS.length} World Cups,
                                    then one match. Your career, album and perks stay out of
                                    it: eleven players against eleven.
                                </p>
                            )}

                            <BigChoice
                                name="When you play it"
                                value={pace}
                                onPick={setPace}
                                options={[
                                    {
                                        value: 'async' as const,
                                        label: 'In your own time',
                                        sub: 'Challenge one person by link. Neither of you has to be here.',
                                    },
                                    {
                                        value: 'live' as const,
                                        label: 'Together, now',
                                        sub: 'Two to eight people in the room at once, on a clock.',
                                    },
                                ]}
                            />

                            <div className="mt-3">
                                {!duel && (
                                    <Setting label="Who is playing" answer={whoAnswer}>
                                        <Chips
                                            label="How many of you"
                                            value={size}
                                            onPick={setSize}
                                            options={SIZES}
                                        />
                                        <Chips
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
                                                    sub: 'Listed for anyone signed in. It still has a code.',
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
                                        <Chips
                                            label="How much each"
                                            value={budget}
                                            onPick={setBudget}
                                            options={BUDGETS}
                                        />
                                    ) : (
                                        <Chips
                                            label="Re-rolls each"
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
                                                label="The numbers"
                                                value={showRatings ? 'on' : 'off'}
                                                onPick={(v) => setShowRatings(v === 'on')}
                                                options={[
                                                    { value: 'on' as const, label: 'Ratings on' },
                                                    {
                                                        value: 'off' as const,
                                                        label: 'Ratings hidden',
                                                        sub: 'Pick on the name and the year, and the numbers come back at the whistle. A house rule, not a lock: the Squads tab shows every rating, so agree not to.',
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
                                                    label="How long the whole draft gets"
                                                    value={draftSeconds}
                                                    onPick={setDraftSeconds}
                                                    options={DRAFTS}
                                                />
                                            ) : (
                                                <Chips
                                                    label="How long a pick gets"
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
                                    The versus server here has not been rebuilt for duels yet,
                                    so a challenge cannot be sent. Everything else about versus
                                    works; play "Together, now" until it is updated.
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
                                {duel ? 'Send a challenge' : 'Open a room'}
                            </button>
                            {duel && (
                                <p className="mt-2 text-[12px] leading-snug text-muted">
                                    You get a link to send. Whoever opens it takes it on, and
                                    you each build whenever you get to it.
                                </p>
                            )}
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

                    <section className="order-2">
                        <SectionHead title="Join with a code" />
                        <form className={`${CARD} flex flex-wrap items-center gap-3 p-4`} onSubmit={join}>
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
                                        <DuelLine key={d.code} row={d} watched={watched} go={navigate} />
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    <section className="order-3">
                        <SectionHead
                            title="Rooms open now"
                            count={
                                lobby && lobby.length > 0 ? (
                                    // Short, because the heading above it already says
                                    // what is being counted and the three of them have to
                                    // share one line with Refresh at 390px.
                                    <LiveCount>{lobby.filter(lobbyJoinable).length} free</LiveCount>
                                ) : lobby ? (
                                    <HeadCount>none</HeadCount>
                                ) : undefined
                            }
                            end={<RefreshButton onClick={refreshLobby} />}
                        />
                        <div className={`${CARD} p-4`}>
                            {lobby === null ? (
                                <RoomNote>Looking.</RoomNote>
                            ) : lobby.length === 0 ? (
                                // THE HALF OF THIS FEATURE THAT DEPENDS ON OTHER PEOPLE is
                                // also the half that looks broken when nobody is playing. So
                                // an empty list says so in the room's own voice and puts both
                                // answers next to it, rather than rendering an empty table and
                                // leaving the reader to wonder whether it loaded.
                                <RoomNote>
                                    Nobody has a public room open just now. Open one with
                                    "Anybody" and it appears here for everyone signed in, or
                                    send a challenge and play it whenever you both get to it.
                                </RoomNote>
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
                                                        {lobbyLine(r)} &middot; {agoLine(r.openedAt, at)}
                                                    </div>
                                                </div>
                                                {/* THE SEATS, BETWEEN THE NAME AND THE WAY IN.
                                                    The row said "2 of 4 seats left" in words
                                                    and led with nothing; drawn and placed here
                                                    the list gets three columns that line up. */}
                                                <SeatPips size={r.size} seated={r.seated} bots={r.bots} />
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

                    {inPlay.length > 0 && (
                        <section className="order-5">
                            <SectionHead
                                title="On now"
                                count={<HeadCount>{inPlay.length}</HeadCount>}
                            />
                            <div className={`${CARD} p-4`}>
                                <ul>
                                    {inPlay.map((d) => (
                                        <DuelLine key={d.code} row={d} watched={watched} go={navigate} />
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    {played.length > 0 && (
                        <section className="order-6">
                            <SectionHead
                                title="Your results"
                                count={<HeadCount>{played.length}</HeadCount>}
                            />
                            <div className={`${CARD} p-4`}>
                                <ul>
                                    {results.map((d) => (
                                        <DuelLine
                                            key={d.code}
                                            row={d}
                                            watched={watched}
                                            // NO CODE ON A FINISHED ONE. A code is how you
                                            // reach a room, and a room that has been played
                                            // is not going anywhere.
                                            code={false}
                                            go={navigate}
                                        />
                                    ))}
                                </ul>
                                {played.length > RESULTS_SHOWN && !allResults && (
                                    <button
                                        type="button"
                                        className="mt-2.5 text-[12px] font-semibold text-pitch-ink hover:underline"
                                        onClick={() => setAllResults(true)}
                                    >
                                        All {played.length} results
                                    </button>
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </>
    );
}
