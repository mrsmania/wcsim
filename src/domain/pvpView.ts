// ---------------------------------------------------------------------------
// Reading a room from where one player is sitting.
//
// Wave 5 of docs/pvp-plan.md. Pure, framework-free and checkable: every derivation the
// versus screens make about a `RoomView` is here rather than inside a component, for the
// same reason the rest of `domain/` is.
//
// THE ONE THING WORTH KNOWING. A tie is stored HOME AND AWAY, and home is randomised per
// tie and purely cosmetic (P44, measured: the home side wins 50.1% over 200,000
// shootouts). Every match component in this app is written the other way round - a
// scoreline is "you" and "them", `USER_SIDE` is a constant, and the goal feed styles the
// user's side. So rather than teach five components that a side is a parameter, one
// function turns a tie round so the VIEWER is always home. It is a relabelling of stored
// data and nothing about the result changes: the same eleven players scored the same
// goals in the same minutes.
// ---------------------------------------------------------------------------

import type { Player } from '../data/types';
import { datasetPlayer } from '../data/squads';
import { STRENGTH_BANDS } from './draft';
import { roomClosed } from './pvpRoom';
import type { Filled } from './draft';
import type { Formation } from './formations';
import type { KoDecided } from './knockout';
import type { MatchEvent, ShootoutResult } from './match';
import type { DuelRow, LobbyRoom, MemberView, RoomView, TieView } from './pvpWire';

/** How long after the server stamped a reveal a client will still start playing it from
 *  the beginning. Past that it has missed too much, and the settled card is the honest
 *  thing to show: the round advances when the server's window closes whoever is watching
 *  (P30), so a late playback would be cut off part-way through.
 *
 *  Four seconds rather than one, and the number is the POLL: a room whose Realtime is
 *  absent or down learns about the kick-off on its next read, which is up to two seconds
 *  plus the round trip after the stamp. A client that reveals a beat late finishes a beat
 *  before the window closes, because the server's window is the playback plus its own
 *  hold; a client that refuses to reveal shows a result nobody watched. */
export const REVEAL_JOIN_MS = 4000;

/** You, in this room. Null while looking at a lobby you have not joined. */
export function meIn(view: RoomView): MemberView | null {
    const id = view.you?.userId;
    return id ? (view.members.find((m) => m.userId === id) ?? null) : null;
}

/** Everybody else, in seat order. */
export function othersIn(view: RoomView): MemberView[] {
    const id = view.you?.userId;
    return view.members.filter((m) => m.userId !== id);
}

export const memberOf = (view: RoomView, userId: string): MemberView | null =>
    view.members.find((m) => m.userId === userId) ?? null;

/** The people in the room, as opposed to the chairs the host filled with practice
 *  opponents. The lobby counts these when it says how full the room is: a bot yields its
 *  seat to anybody who turns up (`joinRoom`), so counting one as taken would be a lie in
 *  the direction that turns people away. */
export const peopleIn = (view: RoomView): MemberView[] => view.members.filter((m) => !m.bot);

/** The practice opponents (`domain/pvpBot.ts`), newest seat last. */
export const botsIn = (view: RoomView): MemberView[] => view.members.filter((m) => m.bot);

/**
 * Every chair in the room, in seat order, with the ones nobody is sitting in as nulls.
 *
 * A LOBBY IS MOSTLY ABOUT WHO IS NOT THERE YET, which a list of the people present cannot
 * say: "2 of 4 here" is a count, and four rows with two of them empty is the room. It also
 * makes the practice opponents legible as what they are - a way to fill exactly those
 * rows - rather than as two extra names that appeared from nowhere.
 *
 * Seats are padded rather than indexed by `seat`, because a seat number is a label with
 * gaps in it: somebody dropped by the liveness sweep leaves theirs behind for ever (P47,
 * and `pvp_members` has a unique index that makes renumbering unsafe), so seat 5 in a room
 * of four is perfectly ordinary.
 */
export function seatsOf(view: RoomView): (MemberView | null)[] {
    const taken = [...view.members].sort((a, b) => a.seat - b.seat);
    const empty = Math.max(0, view.size - taken.length);
    return [...taken, ...Array.from({ length: empty }, () => null)];
}

// --- Kick-off (the countdown) ----------------------------------------------

/** How long the room counts down before the draft starts. Three, because it is a beat to
 *  look up at the screen and not a wait: everybody in the room has already said they are
 *  ready, and the pick clock starts the moment it reaches zero. */
export const KICKOFF_SECONDS = 3;

/** How long the count waits at zero before giving up and showing the lobby again. It is
 *  the answer to the one way this can hang: the client that sends the Start is the host's,
 *  so a host whose tab dies in the last second would otherwise leave everybody else on a
 *  screen that never changes. A few seconds is longer than a poll and a round trip, and
 *  what it falls back to - the lobby, with its Start button - is the honest state. */
export const KICKOFF_HOLD_SECONDS = 5;

/**
 * Is this room about to start on its own?
 *
 * IT IS DERIVED, WHICH IS THE ONLY REASON THE COUNTDOWN CAN BE SHARED. Every client sees
 * the same members and the same ready marks, so each one reaches this answer within a poll
 * of the others and counts down on its own - no instruction, no new server route, and
 * nothing to deploy. What the HOST'S client does at zero is send the Start the host would
 * otherwise have pressed.
 *
 * A practice opponent is always ready (there is nobody to press it), so a host who filled
 * the empty chairs starts the moment they are ready themselves - which is the whole point
 * of having filled them.
 */
export const everybodyReady = (view: RoomView): boolean =>
    view.status === 'lobby' &&
    view.members.length >= view.size &&
    view.members.every((m) => m.ready);

// --- Duels: a game nobody has to be present for (P51) -----------------------

/**
 * Is this room a duel?
 *
 * Read through a helper rather than off the field, because the field is ABSENT from a
 * referee that predates duels and every screen would otherwise have to remember that a
 * missing pace means live. Getting that backwards would draw a live room without its clock.
 */
export const isDuel = (view: RoomView): boolean => view.pace === 'async';

/**
 * The referee opened a ROOM when a DUEL was asked for.
 *
 * A REFEREE THAT PREDATES DUELS DOES NOT REFUSE ONE, which is the trap: `pace` is a field
 * it has never heard of, so it reads straight past it and opens an ordinary live room of
 * two - a 201, a code, and the wrong game. That is the worst shape a version skew can take,
 * because it looks exactly like success, and the player lands in a lobby with a Ready
 * button wondering what happened to their challenge. So the create path tests the ANSWER
 * rather than the status, and this is that test.
 */
export const duelDowngraded = (asked: 'live' | 'async', view: RoomView): boolean =>
    asked === 'async' && !isDuel(view);

/** A challenge addressed to this viewer that they have not answered yet: the one state
 *  where somebody is looking at a room they are not in and did not ask for. */
export const isChallengeToMe = (view: RoomView): boolean =>
    isDuel(view) && view.status === 'lobby' && !!view.invitedName && !meIn(view);

/**
 * Whose move it is, from the caller's side of a duel row.
 *
 * IT IS THE WHOLE POINT OF THE LIST. A duel spans days, so the question somebody opens this
 * page with is never "what is the score" - it is "is there anything for me to do", and a
 * list that answers that in one word is worth more than one that reports a status. The four
 * answers are the four things a duel can be waiting for, and only one of them is you.
 */
export type DuelTurn = 'yours' | 'theirs' | 'sent' | 'done';

export function duelTurn(row: DuelRow): DuelTurn {
    if (row.status === 'ended') return 'done';
    // Nobody has accepted yet, so it is theirs to answer - unless it was sent TO you, in
    // which case answering it is your move.
    if (row.status === 'lobby') return row.yours ? 'sent' : 'yours';
    if (row.status !== 'drafting') return 'theirs';
    return row.yourPicks < XI_SLOTS ? 'yours' : 'theirs';
}

/** Slots in an XI. Every formation has eleven; a duel row counts picks against it. */
const XI_SLOTS = 11;

/** One duel row, in words: what is waiting, or how it went. Written from the caller's side,
 *  because that is the only side they are reading it from. */
export function duelLine(row: DuelRow): string {
    switch (duelTurn(row)) {
        case 'sent':
            return row.opponentName
                ? `Waiting for ${row.opponentName} to accept`
                : 'Waiting for somebody to take it up';
        case 'yours':
            return row.status === 'lobby'
                ? 'Challenged you'
                : `Your move, ${row.yourPicks} of ${XI_SLOTS} picked`;
        case 'theirs':
            return row.status === 'drafting'
                ? `Their move, ${row.theirPicks} of ${XI_SLOTS} picked`
                : 'The match is being played';
        case 'done': {
            if (row.yourGoals === null || row.yourGoals === undefined) return 'Closed unplayed';
            const score = `${row.yourGoals}-${row.theirGoals}`;
            return row.won ? `You won ${score}` : row.won === false ? `You lost ${score}` : score;
        }
    }
}

/** What a duel PLAYS, for the row's second line and for the challenge screen. The same
 *  sentence a lobby row gets, minus the clock: a duel has none. */
export function duelRules(row: Pick<DuelRow, 'method' | 'budget'>): string {
    return row.method === 'budget'
        ? `Buy an XI with $${row.budget}`
        : 'Roll for your XI, one man from each squad';
}

// --- Inviting somebody (the code, and the link) ----------------------------

/**
 * The link that puts somebody in this room.
 *
 * IT IS A LINK RATHER THAN JUST THE CODE because the code is a thing you read out and a
 * link is a thing you send, and sending is what actually happens: a room is opened and then
 * pasted into a message. Arriving on it takes the seat with no further step (`RoomScreen`),
 * so the whole invitation is one tap at both ends.
 *
 * `base` is Vite's, which is `/wcsim/` on GitHub Pages and `/` in dev, so the link works
 * from wherever the build is actually served rather than from wherever it was written. The
 * two arguments are passed in rather than read off `window` here, because this file is
 * `domain/`: it is checked, and a check has no window.
 */
export function inviteUrl(origin: string, base: string, code: string): string {
    const path = base.endsWith('/') ? base : `${base}/`;
    return `${origin.replace(/\/+$/, '')}${path}versus/${code}`;
}

/** What a share sheet sends: a sentence, then the link. The code is in the sentence too,
 *  because a message can be read aloud and a link cannot. */
export const inviteText = (code: string, url: string): string =>
    `Play me at Mondialino. Room ${code}: ${url}`;

/** The tie the viewer is playing in a given round, or null. */
export function tieOf(view: RoomView, round: number, userId: string): TieView | null {
    return (
        view.ties.find(
            (t) => t.round === round && (t.homeId === userId || t.awayId === userId),
        ) ?? null
    );
}

/** A tie turned round so the viewer is the home side. See the header. */
export interface ViewerTie {
    /** The other player's account id. */
    opponentId: string;
    /** Goals, from where the viewer is sitting. Null while the tie has not been played. */
    yourGoals: number | null;
    theirGoals: number | null;
    decided: KoDecided | null;
    /** Goal events with the viewer's side relabelled 'home'. */
    events: MatchEvent[];
    pens: ShootoutResult | null;
    stoppage: [number, number] | null;
    /** True when the viewer won it, false when they lost, null while it is undecided. */
    won: boolean | null;
    revealFrom: number | null;
    revealMs: number | null;
}

const flipSide = (s: 'home' | 'away'): 'home' | 'away' => (s === 'home' ? 'away' : 'home');

export function viewerTie(tie: TieView, viewerId: string): ViewerTie {
    const atHome = tie.homeId === viewerId;
    const events = atHome
        ? tie.events
        : tie.events.map((e) => ({ ...e, side: flipSide(e.side) }));
    const pens: ShootoutResult | null = !tie.pens
        ? null
        : atHome
          ? tie.pens
          : {
                kicks: tie.pens.kicks.map((k) => ({ ...k, side: flipSide(k.side) })),
                home: tie.pens.away,
                away: tie.pens.home,
                homeWon: !tie.pens.homeWon,
            };
    return {
        opponentId: atHome ? tie.awayId : tie.homeId,
        yourGoals: atHome ? tie.homeGoals : tie.awayGoals,
        theirGoals: atHome ? tie.awayGoals : tie.homeGoals,
        decided: tie.decided,
        events,
        pens,
        stoppage: tie.stoppage,
        won: tie.winnerId ? tie.winnerId === viewerId : null,
        revealFrom: tie.revealFrom,
        revealMs: tie.revealMs,
    };
}

/** Whether this client should play the reveal rather than show the settled card. Judged
 *  on the SERVER's clock at both ends (`view.at` against `tie.revealFrom`), never on the
 *  browser's: the two are not the same clock and the difference is not small enough to
 *  ignore on a phone. */
export function shouldReveal(tie: TieView, serverNow: number): boolean {
    if (tie.revealFrom === null || tie.decided === null) return false;
    return serverNow - tie.revealFrom <= REVEAL_JOIN_MS;
}

/** Resolve a slot map of player IDS against the dataset (the wire carries ids, not
 *  players). An id this build does not hold is dropped rather than faked, which is what
 *  the version handshake exists to make impossible in the first place. */
export function xiFrom(formation: Formation, ids: Record<string, string>): Filled {
    const out: Filled = {};
    for (const slot of formation.slots) {
        const id = ids[slot.id];
        const p = id ? datasetPlayer(id) : undefined;
        if (p) out[slot.id] = p;
    }
    return out;
}

/** The players of a slot map, in slot order. */
export function playersOf(formation: Formation, filled: Filled): Player[] {
    return formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
}

/** How a room reads in one line, for the chrome's strip. Written as a sentence about the
 *  GAME rather than about the room's status field: "drafting, 4 of 11" is what a player
 *  needs to decide whether to go back. */
export function roomLine(view: RoomView): string {
    const me = meIn(view);
    switch (view.status) {
        case 'lobby': {
            const ready = view.members.filter((m) => m.ready).length;
            return `waiting, ${view.members.length} of ${view.size} in, ${ready} ready`;
        }
        case 'drafting':
            return `drafting, ${me?.picked ?? 0} of 11 picked`;
        case 'round':
            // Named rather than "match on": in a room of eight the round is half of what
            // a player wants to know from the strip, and the label is derivable.
            return `${roundLabel(view.size, view.round).toLowerCase()} on`;
        case 'ended':
            // A room that CLOSED (nobody there, or nobody touching it) is not a room that
            // finished, and the strip is the one place a player might be told either.
            return view.championId === me?.userId
                ? 'you won'
                : roomClosed(view)
                  ? 'closed'
                  : 'finished';
    }
}


// --- What a room shows of the numbers (P5, P38, P40) -----------------------

/** The presentation decisions a room makes, as data rather than as four booleans read off
 *  `view` in four components. */
export interface RoomDisplay {
    /** Whether ratings appear at all: the chips on a match card, the figures in the
     *  ratings strip, the column in the line-up sheet, the number on a squad row. */
    ratings: boolean;
}

/**
 * Whether this viewer sees the numbers.
 *
 * TWO RULES, and both are decisions rather than details.
 *
 * The switch exists in ROLL ROOMS ONLY (P5). A budget room computes a price straight from
 * a rating, so hiding the rating while showing the price hides nothing - that was P14, and
 * it is void because the two can no longer co-occur. This function therefore ignores
 * `showRatings` for a budget room rather than trusting it; the referee already forces it
 * true there, and two sides agreeing is worth more than one side being careful.
 *
 * And THE NUMBERS COME BACK AT THE WHISTLE (P38), whatever the room was played under. The
 * result is the whole reward, since nothing else is at stake, and in a hidden-ratings room
 * it is also the only way to learn whether you misjudged a player or the dice fell badly -
 * which is the question the switch exists to make interesting.
 */
export function roomDisplay(view: RoomView): RoomDisplay {
    if (view.rules.method === 'budget') return { ratings: true };
    return { ratings: view.showRatings || view.status === 'ended' };
}

/** Whether the host is offered the ratings switch at all (P5). A budget room is not. */
export const offersRatingSwitch = (method: 'roll' | 'budget'): boolean => method === 'roll';

/**
 * A rating as a word, for the strip when the numbers are hidden.
 *
 * The thresholds are `STRENGTH_BANDS`, which the random-XI helper has used since long
 * before any of this: inventing a second set of boundaries for the same 60-to-99 scale
 * would mean two answers in the codebase to "is 83 strong". Only the labels are new,
 * because "very-strong" is a key and not something to show a player.
 */
const BAND_LABEL: Record<keyof typeof STRENGTH_BANDS, string> = {
    weak: 'Modest',
    medium: 'Fair',
    strong: 'Strong',
    'very-strong': 'Elite',
};

/** Weakest first, so the first band whose `max` the value is under is the answer. */
const BANDS = (Object.keys(STRENGTH_BANDS) as (keyof typeof STRENGTH_BANDS)[]).sort(
    (a, b) => STRENGTH_BANDS[a].min - STRENGTH_BANDS[b].min,
);

/** The band a rating falls in, or a dash for a line with nobody in it - which is what the
 *  strip shows for a number too, so a hidden room reads the same shape as an open one. */
export function ratingBand(value: number): string {
    if (!value) return '\u2013';
    for (const key of BANDS) {
        if (value < STRENGTH_BANDS[key].max) return BAND_LABEL[key];
    }
    return BAND_LABEL[BANDS[BANDS.length - 1]!];
}


// --- The bracket, and who watches what (P47, P24) --------------------------

/** How many rounds a room of this size plays: one for two people, three for eight. */
export const roundsFor = (size: number): number => Math.max(1, Math.round(Math.log2(size)));

/** How many games a given round holds, in a room of this size. */
export const gamesIn = (size: number, round: number): number =>
    Math.max(1, size / 2 ** round);

/**
 * What a round is called, counted BACK from the final.
 *
 * The same three words the rest of the game uses (`KO_ROUNDS` in domain/knockout.ts), but
 * derived rather than indexed, because a room's first round is a quarter-final in a room
 * of eight and the final itself in a room of two. Beyond eight there is nothing to name,
 * and the referee does not take a bigger room.
 */
export function roundLabel(size: number, round: number): string {
    const left = roundsFor(size) - round;
    return left <= 0 ? 'Final' : left === 1 ? 'Semi-final' : 'Quarter-final';
}

/** One side of one game on the room's bracket. A null `userId` is a seat the draw has
 *  not reached yet. */
export interface BracketSeat {
    userId: string | null;
    /** The player's name, or a placeholder for an undrawn seat. */
    name: string;
    you: boolean;
    /** Their goals, or null while the game has not finished revealing. */
    goals: number | null;
    /** True when they went through, false when they went out, null while unsettled. */
    won: boolean | null;
}

export interface BracketGame {
    round: number;
    game: number;
    home: BracketSeat;
    away: BracketSeat;
    /** The reveal window has closed, so the scoreline is public. */
    settled: boolean;
    /** It is being played right now: paired, but the window is still open. */
    live: boolean;
    /** The viewer is one of the two. */
    yours: boolean;
}

export interface BracketRound {
    round: number;
    label: string;
    games: BracketGame[];
    /** False while this round has not been drawn, which is every round after the current
     *  one: the draw sets the whole first round in one go (P47) and each later round is
     *  drawn from its survivors when the one before it closes. */
    drawn: boolean;
}

const EMPTY_SEAT: BracketSeat = { userId: null, name: '', you: false, goals: null, won: null };

/**
 * The room's whole bracket, from the viewer's side.
 *
 * ONE RULE IS WORTH STATING: A SCORELINE APPEARS ONLY ONCE ITS REVEAL WINDOW HAS CLOSED.
 * Every tie of a round is stamped at the same instant (`revealFrom`) and they run for
 * different lengths, so a player watching their own match would otherwise read the result
 * of the tie they are about to be shown, printed on the tree beside it. It is the same
 * rule the single-player bracket keeps, where the user's own scores stay hidden until the
 * round is played, and it is judged on the SERVER's clock at both ends for the reason
 * `shouldReveal` is.
 */
export function roomBracket(view: RoomView, serverNow: number): BracketRound[] {
    const you = view.you?.userId ?? null;
    const nameOf = (id: string): string =>
        view.members.find((m) => m.userId === id)?.name ?? 'Someone';

    const out: BracketRound[] = [];
    for (let round = 1; round <= roundsFor(view.size); round++) {
        const ties = view.ties
            .filter((t) => t.round === round)
            .slice()
            .sort((a, b) => a.game - b.game);
        const games: BracketGame[] = [];
        for (let game = 0; game < gamesIn(view.size, round); game++) {
            const t = ties.find((x) => x.game === game);
            if (!t) {
                games.push({
                    round,
                    game,
                    home: EMPTY_SEAT,
                    away: EMPTY_SEAT,
                    settled: false,
                    live: false,
                    yours: false,
                });
                continue;
            }
            const settled =
                t.decided !== null && serverNow >= (t.revealFrom ?? 0) + (t.revealMs ?? 0);
            const seat = (id: string, goals: number | null): BracketSeat => ({
                userId: id,
                name: nameOf(id),
                you: id === you,
                goals: settled ? goals : null,
                won: settled && t.winnerId ? t.winnerId === id : null,
            });
            games.push({
                round,
                game,
                home: seat(t.homeId, t.homeGoals),
                away: seat(t.awayId, t.awayGoals),
                settled,
                live: !settled,
                yours: !!you && (t.homeId === you || t.awayId === you),
            });
        }
        out.push({ round, label: roundLabel(view.size, round), games, drawn: ties.length > 0 });
    }
    return out;
}

/** The round the viewer went out in, or null while they are still in it. */
export function outIn(view: RoomView): number | null {
    return meIn(view)?.outIn ?? null;
}

/**
 * The tie a viewer who is NOT playing this round should watch (P24).
 *
 * A knocked-out player stays and watches the rest, and the default is the tie their own
 * conqueror is in: it is the one game in the round they have a reason to care about, and
 * picking it needs no control. Failing that (their conqueror went out too), the first
 * game of the round. Null when the viewer is playing this round themselves, which is the
 * ordinary case and is handled by their own match.
 */
export function spectateTie(view: RoomView): TieView | null {
    const you = view.you?.userId;
    if (!you) return null;
    const live = view.ties
        .filter((t) => t.round === view.round)
        .slice()
        .sort((a, b) => a.game - b.game);
    if (!live.length || live.some((t) => t.homeId === you || t.awayId === you)) return null;
    const beatenBy = view.ties.find(
        (t) => (t.homeId === you || t.awayId === you) && t.winnerId && t.winnerId !== you,
    )?.winnerId;
    const theirs = beatenBy
        ? live.find((t) => t.homeId === beatenBy || t.awayId === beatenBy)
        : undefined;
    return theirs ?? live[0]!;
}


// --- The public lobby list (P18) -------------------------------------------

/**
 * A lobby row, in words.
 *
 * The same rule the room settings are written under (plan section 8): a row says what the
 * room IS TO PLAY, not what its columns are set to. "Buy an XI with $110" is a sentence
 * somebody can act on; "budget: 110" is not, and the person reading this list has by
 * definition never seen the room.
 *
 * It is here rather than inside the component for the reason the rest of this file is: it
 * is a derivation, and a derivation can be checked.
 */
export function lobbyLine(room: LobbyRoom): string {
    const clock = `${room.pickSeconds}s a pick`;
    // The practice opponents, when there are any: it changes what turning up means, since
    // the room can start the moment you arrive and one of your ties may be against a seat
    // rather than a person. Taken as zero from a referee that predates them.
    const bots = room.bots ?? 0;
    const practice = bots ? `, ${bots} practice opponent${bots === 1 ? '' : 's'}` : '';
    if (room.method === 'budget') return `Buy an XI with $${room.budget}, ${clock}${practice}`;
    const rr = room.rerolls === 1 ? '1 re-roll' : `${room.rerolls} re-rolls`;
    const hidden = room.showRatings ? '' : ', ratings hidden';
    return `Roll for your XI, ${rr}, ${clock}${hidden}${practice}`;
}

/** How many seats are still open, and how that reads. A row whose room filled while you
 *  were looking at it says so rather than offering a Join that cannot work. */
export function seatsLine(room: LobbyRoom): string {
    const left = Math.max(0, room.size - room.seated);
    if (left <= 0) return 'Full';
    return `${left} of ${room.size} seat${left === 1 ? '' : 's'} left`;
}

/** Whether a row can still be joined. */
export const lobbyJoinable = (room: LobbyRoom): boolean => room.seated < room.size;

/**
 * How long ago something happened, in the coarsest honest unit.
 *
 * Coarse on purpose: a lobby row updates on a poll, so a seconds-precise age would tick
 * visibly out of date between reads and invite the reader to trust it. Minutes are what
 * the number is actually good for.
 *
 * A NEGATIVE AGE NEEDS NO CLAMP, and there was one here until a mutation test showed it did
 * nothing: the times come from two different clocks (the room's stamp is the server's, the
 * reading is the browser's), so a phone running slow can be asked about the future - and
 * every negative gap floors to something under a minute and falls out as "just now"
 * already. Guarding it twice reads as though the second guard were doing something.
 */
export function agoLine(at: number, now: number): string {
    const mins = Math.floor((now - at) / 60_000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}
