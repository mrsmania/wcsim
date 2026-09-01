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

/** How long the room has to actually start once the count runs out, before the lobby stops
 *  saying so and hands the host their Start button back. It is the answer to the one way
 *  this can hang: the client that sends the Start is the host's, so a host whose tab dies in
 *  the last second would otherwise leave everybody else waiting on a kick-off that is never
 *  coming. A few seconds is longer than a poll and a round trip. It used to be how long a
 *  full-screen "Kick-off" was held at zero; that screen is gone (nobody could read it - see
 *  `KickoffCountdown`), so the wait now happens on the lobby, which was always what this
 *  fell back to. */
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

/**
 * Is this answer newer than the newest one already on screen?
 *
 * A ROOM IS READ FROM SEVERAL PLACES AT ONCE and none of them is ordered against the
 * others: a poll every few seconds, a re-read every time the broadcast says the room
 * changed, and the answer to every command a player sends. They all describe the same room
 * and they all land whenever the network gets round to them, so the last one to ARRIVE is
 * not the last one to have been TRUE.
 *
 * The symptom that found this was reported as "changing my formation un-readies me", and
 * the mechanism is one request overtaking another: a poll that left before you pressed
 * Ready describes a room where you are not ready, and if it lands after the Ready answer it
 * puts that back. The next shape you pick then honestly reports what the screen says - not
 * ready - and the reset sticks. Nothing about it is specific to `ready`; it is every field
 * of every room, and it was simply most visible on the one the player had just changed.
 *
 * `RoomView.at` is the server's own clock, stamped when the payload was built, and it is
 * there for exactly this. Equal is accepted: two answers built in the same millisecond
 * describe the same room, so it does not matter which wins.
 */
export const answerIsFresh = (appliedAt: number | null, next: RoomView): boolean => {
    if (appliedAt === null || next.at >= appliedAt) return true;
    // A LONG WAY BEHIND IS A CLOCK, NOT AN OVERTAKE. Nothing in flight is a minute old - a
    // request that took that long has already timed out - so a stamp this far back means
    // the server's clock stepped backwards rather than that this answer is stale. Refusing
    // it would freeze the room until the clock caught up, which is a far worse failure than
    // the one render this costs.
    return appliedAt - next.at > CLOCK_STEP_MS;
};

/** Past this, a stamp behind the newest one is a clock correction rather than a slow
 *  request. Generous on purpose: it only has to be longer than any request can live. */
const CLOCK_STEP_MS = 60_000;

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
 * The referee opened something OTHER than the duel that was asked for.
 *
 * A REFEREE THAT PREDATES DUELS DOES NOT REFUSE ONE, which is the trap: `pace` is a field
 * it has never heard of, so it reads straight past it and opens an ordinary live room of
 * two - a 201, a code, and the wrong game. That is the worst shape a version skew can take,
 * because it looks exactly like success, and the player lands in a lobby with a Ready
 * button wondering what happened to their challenge. So the create path tests the ANSWER
 * rather than the status, and this is that test.
 *
 * IT TESTS THE STATUS TOO, and that second half has now pointed both ways, which is worth
 * keeping as the warning it is. A referee built on 2026-08-30 opens a duel straight into
 * its challenger's DRAFT; a duel is opened in a lobby again, because building before the
 * challenge was taken up let a challenger re-open the room until they liked their squad.
 * So the test is that a new duel arrives in a lobby, and the line that used to read
 * `=== 'lobby'` now reads `!== 'lobby'`. Both versions were right about their own day: what
 * makes it testable at all is that a duel is only ever created here, and a created duel has
 * exactly one shape.
 */
export const duelDowngraded = (asked: 'live' | 'async', view: RoomView): boolean =>
    asked === 'async' && (!isDuel(view) || view.status !== 'lobby');

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
    if (row.status !== 'drafting') return 'theirs';
    // SENDING IS WHAT ENDS YOUR HALF OF IT, not filling the eleventh slot: a duel has no
    // clock, so the XI stays yours until you say otherwise. Until then it is your move
    // whether you have picked nobody or all eleven.
    //
    // The two fallbacks are for a referee that predates the reshape and are its OLD reading
    // rather than a guess: there, finishing was filling the eleventh slot, and a duel that
    // was drafting at all had both seats taken.
    if (!(row.yourDone ?? row.yourPicks >= XI_SLOTS)) return 'yours';
    // Sent, and nobody has taken the challenge up. Waiting on a person rather than on a
    // draft, which is a different sentence and a different thing to do about it (send the
    // link to somebody else).
    return (row.seated ?? 2) < 2 ? 'sent' : 'theirs';
}

/** Slots in an XI. Every formation has eleven; a duel row counts picks against it. */
const XI_SLOTS = 11;

/**
 * Was this room won because somebody walked out of it?
 *
 * A CHAMPION WITH NO TIE UNDERNEATH IS THE ENCODING, and it is one a room that actually
 * played can never be in: a duel that finishes normally has its match, and every other way
 * a room ends without playing leaves no champion at all (`roomClosed`). So it needs no
 * field of its own on the wire, no column and no migration - see `forfeitDuel`.
 *
 * It is what the result screen reads to say who walked rather than printing a scoreline it
 * has not got, and `pvp_records` counts a walkover by the same test at the other end.
 */
export const walkover = (view: Pick<RoomView, 'status' | 'championId' | 'ties'>): boolean =>
    view.status === 'ended' && !!view.championId && view.ties.length === 0;

/**
 * Does this duel belong on the list at all?
 *
 * A DUEL THAT ENDED WITHOUT AN OUTCOME IS NOT A GAME THAT WAS PLAYED, and printing it under
 * "Played" says the opposite. There are two ways to get one and neither is worth a row: a
 * challenge nobody took up and the sender called off, and one nobody touched for a week. A
 * walkover is the opposite case and stays, because somebody lost it (`walkover`): the row
 * is the whole record of that from the player's side.
 *
 * `won` is the test rather than the status, because it is exactly "this duel has an
 * outcome" - a played match sets it from the winner and a walkover from the room's champion.
 * It also degrades the right way against a referee that has not been rebuilt: an unplayed
 * duel there reports no winner either, so it drops off the list rather than lying about it.
 */
export const duelListed = (row: DuelRow): boolean =>
    row.status !== 'ended' || row.won === true || row.won === false;

/** One duel row, in words: what is waiting, or how it went. Written from the caller's side,
 *  because that is the only side they are reading it from. */
export function duelLine(row: DuelRow): string {
    switch (duelTurn(row)) {
        case 'sent':
            return 'Sent. Waiting for somebody to take it up';
        case 'yours':
            return row.yourPicks >= XI_SLOTS
                ? 'Your XI is ready to send'
                : `Your move, ${row.yourPicks} of ${XI_SLOTS} picked`;
        case 'theirs':
            return row.status === 'drafting'
                ? `${row.opponentName || 'They'} are building, ${row.theirPicks} of ${XI_SLOTS} picked`
                : 'The match is being played';
        case 'done': {
            // Nobody played it, and somebody lost it anyway: the row has to say which of
            // those two it was, or a walkover reads as a defeat with the score missing.
            if (row.walkover) return row.won ? 'They walked away, you win' : 'You walked away';
            if (row.yourGoals === null || row.yourGoals === undefined) return 'Closed unplayed';
            const score = `${row.yourGoals}-${row.theirGoals}`;
            return row.won ? `You won ${score}` : row.won === false ? `You lost ${score}` : score;
        }
    }
}

/**
 * What, if anything, this duel wants from the reader.
 *
 * IT IS THE WHOLE REASON THE CHROME CARRIES A STRIP FOR DUELS. A live room is a thing you
 * are AT, so holding one is itself the signal; a duel is a thing you are IN, spread over
 * days, and the only two states worth interrupting somebody for are "your team is not sent"
 * and "the match has been played and you have not seen it". Everything else is a row on a
 * list, which is where it stays.
 *
 * `watched` is LOCAL, and it has to be: whether you have sat through the reveal is a fact
 * about this browser, not about the room, and the server has no business recording it. A
 * new device therefore replays a result once, which is the right way round - it is the
 * match, and watching it again costs nothing.
 */
export type DuelAlert = 'watch' | 'your-move' | null;

export function duelAlert(row: DuelRow, watched: ReadonlySet<string>): DuelAlert {
    // A result nobody has watched outranks a draft nobody has finished: the match is over
    // and the reader does not know how it went, which is the more surprising of the two.
    if (row.status === 'ended' && row.yourGoals !== null && row.yourGoals !== undefined) {
        return watched.has(row.code) ? null : 'watch';
    }
    return duelTurn(row) === 'yours' ? 'your-move' : null;
}

/** The one duel to put in the chrome, or null. Results first, then drafts, then whichever
 *  moved most recently - the list arrives newest first, so the first hit of each kind is
 *  already the right one. */
export function duelToOpen(
    rows: readonly DuelRow[],
    watched: ReadonlySet<string>,
): { row: DuelRow; alert: Exclude<DuelAlert, null> } | null {
    const hit = (want: DuelAlert) => rows.find((r) => duelAlert(r, watched) === want);
    const result = hit('watch');
    if (result) return { row: result, alert: 'watch' };
    const move = hit('your-move');
    return move ? { row: move, alert: 'your-move' } : null;
}

/**
 * The strip's sentence for a duel that wants something. Short: it shares a line with the
 * code and a "Go" on a phone.
 *
 * IT CARRIES NO PICK COUNT, and that is a decision rather than an omission (reported from
 * the game: the number sat still while the board underneath it filled up). The strip is fed
 * by the chrome's own slow poll of the duels list - thirty seconds, because it is a
 * background check on a game played over days - while the board you are picking on is
 * answered by the referee on the tap itself. So the two disagree by up to half a minute.
 *
 * The fix is to drop the number rather than to chase it, because THE COUNT IS UNRELIABLE
 * EXACTLY WHERE IT IS REDUNDANT: the only way it moves is you picking, and while you are
 * picking the draft screen is printing the same figure live one line below. Everywhere the
 * strip is genuinely useful - somewhere else in the app entirely - a count would be
 * accurate and would be saying nothing that "your move" does not. Re-reading the list after
 * every pick to keep it honest would buy a round trip per tap for a restated counter, which
 * is what took the sub-lines off the tabs and the count off the route crumb.
 *
 * The two sentences still SPLIT on the count, which is a different thing from printing it:
 * "built but not sent" is a different instruction from "not built", worth saying when it is
 * fresh, and a stale reading falls back to the more conservative of the two.
 */
export const duelAlertLine = (row: DuelRow, alert: Exclude<DuelAlert, null>): string =>
    alert === 'watch'
        ? `the match against ${row.opponentName || 'your opponent'} has been played`
        : row.yourPicks >= XI_SLOTS
          ? 'your XI is ready to send'
          : 'your move, pick your XI';

/** What a duel PLAYS, for the row's second line and for the challenge screen. The same
 *  sentence a lobby row gets, minus the clock: a duel has none. */
export function duelRules(row: Pick<DuelRow, 'method' | 'budget'>): string {
    return row.method === 'budget'
        ? `Buy an XI with $${row.budget}`
        : 'Roll for your XI, one man from each squad';
}

/**
 * What leaving THIS room, as THIS viewer, actually does.
 *
 * FOUR THINGS WEAR ONE BUTTON, and the screen has to say which before somebody presses it:
 * giving a seat up in a lobby, calling off a challenge nobody has taken up, FORFEITING a
 * duel somebody has, and walking away from a tournament your XI keeps playing in. They are
 * as different as an answer can be, and the third one is the one that costs something: it
 * ends the game there and then and hands the other player the win.
 *
 * IT IS DERIVED HERE RATHER THAN IN THE SCREEN because it is the referee's rule
 * (`leaveRoom` in `domain/pvpRoom.ts`) read from the other end, and the two have to agree:
 * a button promising to call a duel off that the referee then ignores is worse than no
 * button, since it looks like it worked. `npm run checks` holds the pair together.
 *
 * `away` is the one that changes nothing on the server, and it is deliberately not hidden:
 * leaving the screen is still what the player wants, and the copy is what tells them their
 * team plays on.
 */
export type LeaveKind = 'seat' | 'calloff' | 'forfeit' | 'away';

export function leaveKind(view: RoomView): LeaveKind {
    // Somebody who is not in the room cannot give anything up. A public lobby can be looked
    // at without joining, and `you` is null for exactly that viewer.
    const mine = !!view.you;
    if (isDuel(view) && mine && (view.status === 'lobby' || view.status === 'drafting')) {
        // ONCE SOMEBODY HAS TAKEN IT UP, LEAVING IS LOSING IT, whichever end you are at:
        // accepting is what sets both drafts going, so from then on walking out abandons a
        // game rather than withdrawing an offer. Before that there is only the person who
        // opened it, and calling it off costs nothing.
        return view.members.length >= view.size ? 'forfeit' : 'calloff';
    }
    if (view.status === 'lobby' && mine) return 'seat';
    return 'away';
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

/**
 * What a share sheet sends ALONGSIDE the link, never including it.
 *
 * `navigator.share` takes the sentence and the link as two fields and most targets paste
 * both, so a sentence ending in the address puts it in the message TWICE. The link belongs
 * in `url`, where an app can also make a preview card of it; this is only the human half.
 * The code is in it because a message gets read aloud and a link cannot.
 */
export const inviteText = (code: string): string => `Play me at Mondialino. Room ${code}.`;

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
            // A duel that nobody has taken up is DRAFTING with one player in it, which is
            // its ordinary early state rather than a half-started room. Saying "drafting,
            // 11 of 11 picked" there would read as a room about to play a match.
            return isDuel(view) && view.members.length < view.size
                ? 'waiting for somebody to take it up'
                : `drafting, ${me?.picked ?? 0} of 11 picked`;
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
