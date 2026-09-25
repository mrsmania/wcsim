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
import { xiStrength } from './match';
import type { MatchEvent, ShootoutResult, Strength } from './match';
import type {
    DuelRow,
    InviteRoom,
    LobbyRoom,
    MemberView,
    MyRoom,
    RoomPlays,
    RoomStatusWire,
    RoomView,
    TieView,
} from './pvpWire';

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
 * A practice opponent is always ready, because there is nobody to press it. That is a fact
 * about the SEAT and it is deliberately not the whole answer to "does this room start on
 * its own" - see `startsItself`, which is what the countdown actually reads.
 */
export const everybodyReady = (view: RoomView): boolean =>
    view.status === 'lobby' &&
    view.members.length >= view.size &&
    view.members.every((m) => m.ready);

/**
 * Does this room arm its own kick-off, or does the host have to press Start?
 *
 * A ROOM WITH A PRACTICE OPPONENT IN IT DOES NOT START ITSELF (2026-09-25, asked for).
 * A bot is ready the moment it is created, so filling the last chair used to BE the
 * kick-off: the host tapped "2 opponents" and the three-second count began under them,
 * with no chance to look at what they had just made. That is the one place in the lobby
 * where the same tap both fills the room and starts it, and it reads as the room running
 * away rather than as a countdown.
 *
 * A HUMAN PRESSING READY IS A DECISION TO PLAY; A BOT BEING READY IS ONLY THE ABSENCE OF
 * ANYBODY TO ASK. The derived countdown works because every client can see the same ready
 * marks and agree (P48), and it is worth having precisely when the room is waiting on
 * PEOPLE - which is exactly what a room of bots is not. So the automatic half stands down
 * when a bot is seated and the host's Start is the only way in, which it already is for a
 * room where somebody has not pressed Ready.
 *
 * It does NOT make the room unstartable: `pressed` in the lobby arms the identical count,
 * so the host still gets the three seconds rather than the draft appearing under everybody.
 */
export const startsItself = (view: RoomView): boolean =>
    everybodyReady(view) && botsIn(view).length === 0;

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
    // NOBODY HAS TAKEN IT UP YET, which is the ordinary first state of every challenge and
    // was being read as `theirs` - so the list said "The match is being played" over a duel
    // whose link had not been opened. The `sent` branch below it had the right sentence and
    // had become unreachable: it tests a room that is DRAFTING with one seat filled, which
    // is the pre-P54 shape, where a duel opened straight into its challenger's draft. Since
    // a duel waits in a lobby until both seats are filled and both players are ready, the
    // state moved and the test did not follow it.
    if (row.status === 'lobby' && (row.seated ?? 2) < 2) return 'sent';
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
            // Taken up, and not started: both of you are in the lobby and one of you has
            // not pressed Ready. It cannot say which, since the row carries no readiness -
            // but "the match is being played" is the one thing that is certainly false.
            if (row.status === 'lobby') {
                return `${row.opponentName || 'They'} took it up. Ready when you both are`;
            }
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
        ? `The match against ${row.opponentName || 'your opponent'} has been played`
        : row.yourPicks >= XI_SLOTS
          ? 'Your XI is ready to send'
          : 'Your move, pick your XI';

/**
 * What a duel PLAYS, for the row's second line and for the challenge screen.
 *
 * THE LOBBY ROW'S OWN SENTENCE (`playsLine`), minus what a duel has not got: no clock at
 * either scale (P51) and no practice opponents. It used to be written out here as "Roll for
 * your XI, one man from each squad", which named the same method in words the lobby does not
 * use and then said nothing about the two things the host actually chose - so the same room
 * read one way on the public list and another on your own.
 *
 * `rerolls` and `showRatings` arrive only from a referee built after 2026-09-24, and an
 * older row simply says "Roll for your XI". That is the same silence the whole-draft clock
 * already keeps and it is the reason this half could ship first.
 */
export function duelRules(
    row: Pick<DuelRow, 'method' | 'budget' | 'rerolls' | 'showRatings'>,
): string {
    // THE FOUR FIELDS ARE NAMED, NEVER PASSED THROUGH, and the invitation check caught
    // exactly that the moment this was written as `playsLine(row)`: `inviteRules` hands a
    // duel an `InviteRoom`, which carries the `pickSeconds` a duel stores and never reads
    // (`tickDuel`), so the row satisfied the narrow parameter type and the builder then
    // found a clock on it. The one rule of this function is what a duel has NOT got, so it
    // cannot take a wider object's word for it.
    return playsLine({
        method: row.method,
        budget: row.budget,
        rerolls: row.rerolls,
        showRatings: row.showRatings,
    });
}

/** A duel is two chairs, always: `readCreate` forces the size at the edge whatever a client
 *  asks for, so the row carries no size of its own to read. */
const DUEL_SEATS = 2;

/**
 * A duel's chairs, so its row can draw the bubbles a lobby row draws.
 *
 * `seated` IS READ THE WAY `duelTurn` READS IT, which is the whole reason this is a
 * function rather than two literals at the call site: a referee that predates the field
 * sends none, and both places have to take that as a duel with both seats filled, or a
 * challenge somebody is already building would show an empty chair beside it.
 *
 * It is what tells "nobody has followed the link yet" apart from "they are in": one solid
 * dot and one hollow, against two solid. That distinction used to be carried by the row's
 * sentence and is carried here now, which is what lets the sentence say what the room
 * PLAYS instead (`duelOpenLine`).
 */
export function duelSeats(row: Pick<DuelRow, 'seated'>): { size: number; seated: number } {
    return { size: DUEL_SEATS, seated: row.seated ?? DUEL_SEATS };
}

/**
 * An open challenge, on the list of rooms you have on.
 *
 * "WAITING." AND WHAT IT PLAYS, and nothing about how far anybody has got (2026-09-22,
 * owner's call). Every challenge on that list is by construction waiting on somebody who
 * is not the reader - the ones waiting on THEM are the section above it - so four
 * sentences that all mean "not your move" were four ways of saying one thing, in the
 * longest of them ("Sent. Waiting for somebody to take it up") twice over.
 *
 * WHAT IT PLAYS IS THE SAME SENTENCE THE LOBBY ROW GETS (`lobbyLine`), which is the point
 * of the rework: one list of rooms, each row saying what kind it is, what it plays and
 * how many chairs are taken, whether it is a cup somebody is sitting in or a challenge
 * spread over a week. It is shorter than the lobby's by what a duel does not have - no
 * clock (P51) and no practice opponents - and by nothing else since 2026-09-24, when the
 * row grew the two house rules a duel really has.
 *
 * WHAT IT GIVES UP is the difference between a challenge nobody has opened and one they
 * are building, and it gives it up to the seat bubbles rather than losing it: an
 * untaken challenge is one dot short (`duelSeats`).
 */
export function duelOpenLine(
    row: Pick<DuelRow, 'method' | 'budget' | 'rerolls' | 'showRatings'>,
): string {
    return `Waiting. ${duelRules(row)}`;
}

/**
 * What a duel's sending window has left, for whichever half of it the reader is on.
 *
 * A DEADLINE NOBODY IS TOLD ABOUT IS A TRAP, and that is the whole reason this exists. The
 * window (`DUEL_DRAFT_MS`) is what makes walking out of a duel cost the same whether or not
 * you press the button, and a player who is never shown it would meet it as a duel that
 * lost itself while they were not looking - which is a worse bug than the one the deadline
 * fixes. So both draft panels print it, and so does the wait after you have sent.
 *
 * IT READS THE OTHER WAY ROUND ONCE YOU HAVE SENT, and that half is the reassurance rather
 * than the warning: the same rule that can cost you the duel is what stops it hanging on
 * somebody who has stopped playing, so it is worth saying in those words.
 *
 * NULL WHEN THE SERVER HAS NOT MENTIONED ONE - a live room, a duel that is not drafting, or
 * a referee older than the deadline. A screen then says nothing, which is right: there is
 * no window to miss.
 */
export function sendWindowNote(view: RoomView, mine: boolean): string | null {
    const left = view.sendRemainingMs;
    if (left === null || left === undefined) return null;
    return mine
        ? `${sendWindowLeft(left)} left to send your team, or you lose the duel.`
        : `${sendWindowLeft(left)} left for them to send theirs, or the duel is yours.`;
}

/** The window as a phrase, always rounded DOWN, so it can never promise time that is not
 *  there. Coarse for `agoLine`'s reason as well: it is read off a poll, and an hours figure
 *  is what two days is actually good for. */
function sendWindowLeft(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 1) return 'Less than an hour';
    if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
}

/**
 * What leaving THIS room, as THIS viewer, actually does.
 *
 * FOUR THINGS WEAR ONE BUTTON, and the screen has to say which before somebody presses it:
 * giving a seat up in a lobby, calling off a challenge of your own, FORFEITING a duel whose
 * draft is under way, and walking away from a tournament your XI keeps playing in. They are
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
    const you = view.you;
    if (!you) return 'away';
    if (isDuel(view) && (view.status === 'lobby' || view.status === 'drafting')) {
        // THE THREE ANSWERS IN `leaveDuel`'S OWN ORDER, which is what keeps the button and
        // the referee saying the same thing rather than merely agreeing today.
        //
        // Nobody opposite: there is nothing to forfeit to and nobody to hand the seat to,
        // so the challenge simply stops existing. A DRAFT UNDER WAY IS THE COMMITMENT, NOT
        // THE SEAT (2026-09-02): squads are dealt and the market opens the moment it
        // starts, so from then on walking out abandons a game rather than withdrawing an
        // offer, at either end. And in the lobby nothing has been shown to anybody yet, so
        // leaving is free - which free thing it is depending on whose challenge it is: the
        // person who opened it calls it off and the link dies with it, and anybody else is
        // simply handing a seat back.
        if (view.members.length < view.size) return 'calloff';
        if (view.status === 'drafting') return 'forfeit';
        return you.userId === view.hostId ? 'calloff' : 'seat';
    }
    if (view.status === 'lobby') return 'seat';
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
 * IT PUTS THE CODE IN A QUERY ON THE HOME PAGE RATHER THAN IN THE PATH, and that is the
 * whole reason this function is more than string concatenation. It used to build
 * `<origin><base>versus/<code>`, which is the app's real route and reads far better, and it
 * previewed as NOTHING in every chat client. GitHub Pages only knows about the files it was
 * given, so it answers any deeper address with its 404 file: `scripts/copy-404.mjs` makes
 * that file a copy of the app, so a person sees the game and never notices, but the "no
 * such page" STATUS rides along with it, and a link preview crawler stops reading the
 * moment it sees one. Measured against the live site on 2026-09-07: `/` answered 200 while
 * `/versus/ABCDEF`, `/career` and `/album` all answered 404 with the Open Graph tags
 * sitting in the body, unread. So the share card that A9 built was invisible on the one
 * kind of link this game sends by design.
 *
 * `<base>?join=<code>` is the same page the host is happy to serve, verified 200 with the
 * tags intact, and `joinTarget` below turns it back into the route at boot. Two things this
 * deliberately does not attempt: the preview is still the generic game card, since a static
 * host cannot make a different picture per room; and every OTHER deep link in the game
 * still previews as nothing, which is a hosting problem rather than a code one and was
 * ruled out as a fix by the owner.
 *
 * `base` is Vite's, which is `/` since the site moved to its own domain and serves from
 * the root, and can be a subpath for a differently hosted build. It and `origin` are
 * passed in rather than read off `window`, because this file is `domain/`: it is checked,
 * and a check has no window.
 */
export function inviteUrl(origin: string, base: string, code: string): string {
    const path = base.endsWith('/') ? base : `${base}/`;
    return `${origin.replace(/\/+$/, '')}${path}?join=${code}`;
}

/**
 * The route an arriving invitation means, or null when there is no invitation in the URL.
 *
 * The other half of `inviteUrl`: the link lands on the home page carrying the code, and
 * this is what makes it a room again. `main.tsx` calls it before the first render and
 * rewrites history, so nothing downstream ever sees the query form: the router, the tab
 * bar, `screenOf`, `VersusScreen`'s `useMatch('/versus/:code')` and the seat-taking on
 * arrival all work exactly as they did when the link itself was a path.
 *
 * IT VALIDATES RATHER THAN TRUSTING, because the value is a query parameter and anybody can
 * type one. The shape is the one `screenOf` accepts, four to twelve letters and digits, so
 * a target this returns is always a real route; junk returns null and the visitor simply
 * gets the front page. Uppercasing first means a code that lost its case somewhere in a
 * chat client still works, which is also why `VersusScreen` uppercases its own parameter.
 *
 * `history.replaceState` rather than a push, at the call site: the home page carrying a
 * `?join=` is a doormat rather than a place, and leaving it in the back stack would send
 * anybody pressing Back to an address that immediately forwards them into the room again.
 */
export function joinTarget(search: string, base: string): string | null {
    const raw = new URLSearchParams(search).get('join');
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return null;
    const path = base.endsWith('/') ? base : `${base}/`;
    return `${path}versus/${code}`;
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
        view.ties.find((t) => t.round === round && (t.homeId === userId || t.awayId === userId)) ??
        null
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
    const events = atHome ? tie.events : tie.events.map((e) => ({ ...e, side: flipSide(e.side) }));
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

/** The three figures one member's XI was PLAYED on: Ovr, and the two group averages the
 *  simulator reads (Att is MID+FWD, Def is GK+DEF). The result screen shows them for both
 *  teams, which in a hidden-ratings room is the first time anybody sees either number.
 *
 *  It is deliberately NOT the build page's own reading, and the difference is not
 *  cosmetic. There, `placedPlayers` promotes the filled slot to the front of a player's
 *  positions, so a centre-back played at holding midfield counts towards the attack. A
 *  room never promotes anything: every pick is resolved in the referee's own dataset (the
 *  rule that nothing trusts a submitted player), so `pvpTeam` groups that same man by his
 *  dataset role and the tie is decided with him in the defence. The screen has to agree
 *  with the match it is reporting rather than with the other screen, so this is
 *  `xiStrength` over the dataset players, exactly as `pvpTeam` reads them. */
export function xiStrengthFrom(formation: Formation, ids: Record<string, string>): Strength {
    return xiStrength(playersOf(formation, xiFrom(formation, ids)));
}

/** How a room reads in one line, for the chrome's strip. Written as a sentence about the
 *  GAME rather than about the room's status field: "drafting, 4 of 11" is what a player
 *  needs to decide whether to go back. */
export function roomLine(view: RoomView): string {
    const me = meIn(view);
    return roomLineOf({
        status: view.status,
        size: view.size,
        seated: view.members.length,
        ready: view.members.filter((m) => m.ready).length,
        yourPicks: me?.picked ?? 0,
        round: view.round,
        duel: isDuel(view),
        // A room that CLOSED (nobody there, or nobody touching it) is not a room that
        // finished, and the strip is the one place a player might be told either.
        won: view.championId === me?.userId,
        closed: roomClosed(view),
    });
}

/**
 * The same sentence about a room you are in, from a LIST row rather than from the room.
 *
 * IT SHARES A CORE WITH `roomLine` RATHER THAN RESTATING IT (2026-09-22, roadmap item 67).
 * The versus page draws one row per open room and the two sources feed it from opposite
 * ends: a `RoomView` while this tab holds the room, and a `MyRoom` off the referee for a room
 * opened on another device. Two functions writing "drafting, 4 of 11 picked" is two places
 * for it to drift, and the drift would be invisible - each source renders a perfectly good
 * row, and they simply disagree about the same room depending on where you are reading it.
 *
 * AN ENDED ROOM IS NOT ON THE LIST, so the two fields that only an ended room needs are
 * optional here and a `MyRoom` never carries them. `roomLineOf` still answers for one,
 * because the CHROME's strip is a `RoomView` and P31 can end a room under somebody.
 */
export function myRoomLine(room: MyRoom): string {
    const state = roomLineOf({
        status: room.status,
        size: room.size,
        seated: room.seated,
        ready: room.ready,
        yourPicks: room.yourPicks,
        round: room.round,
        // A live room and never a duel: `myLiveRooms` filters on the pace, and a duel of
        // yours is on the same list already, as a duel, with its own line.
        duel: false,
        // The row draws the chairs, so the sentence does not count them (2026-09-24).
        drawsSeats: true,
    });
    // AND WHAT IT PLAYS, in the same two-sentence shape a challenge row has ("Waiting. Roll
    // for your XI, 3 re-rolls"): where the room has got to, then what it is. Absent from a
    // referee too old to say, and then the row is its state alone, which is what this list
    // showed until now.
    return room.plays ? `${state}. ${playsLine(room.plays)}` : state;
}

/** The counts a room's one-line description is written from, which is all either source has
 *  in common: a `RoomView` holds members and XIs, a `MyRoom` holds totals. */
interface RoomFacts {
    status: RoomStatusWire;
    size: number;
    seated: number;
    ready: number;
    yourPicks: number;
    round: number;
    duel: boolean;
    /** Ended rooms only; see `myRoomLine`. */
    won?: boolean;
    closed?: boolean;
    /**
     * Does the surface reading this draw the CHAIRS beside it?
     *
     * THE ONE THING THE TWO READERS DIFFER ON, and it is a fact about the surface rather
     * than about the room, which is why it is a flag here and not a second sentence
     * somewhere else. The versus page's row draws the seat bubbles, so "2 of 4 in" beside
     * them is the same count twice; the chrome's strip is one line under the tabs with no
     * bubbles anywhere, so it is the only place that count is said at all.
     */
    drawsSeats?: boolean;
}

function roomLineOf(f: RoomFacts): string {
    switch (f.status) {
        case 'lobby': {
            // How many have pressed Ready is NOT in the bubbles - a chair says somebody is
            // there, not that they are waiting on nobody - so it is the half that stays
            // wherever the seats are drawn. Zero gets words rather than a figure, since
            // "0 ready" is a way of writing "nobody" that nobody writes.
            const ready = f.ready === 0 ? 'nobody ready yet' : `${f.ready} ready`;
            const seats = f.drawsSeats ? '' : `, ${f.seated} of ${f.size} in`;
            return `Waiting${seats}, ${ready}`;
        }
        case 'drafting':
            // A duel that nobody has taken up is DRAFTING with one player in it, which is
            // its ordinary early state rather than a half-started room. Saying "drafting,
            // 11 of 11 picked" there would read as a room about to play a match.
            return f.duel && f.seated < f.size
                ? 'Waiting for somebody to take it up'
                : `Drafting, ${f.yourPicks} of 11 picked`;
        case 'round':
            // Named rather than "match on": in a room of eight the round is half of what
            // a player wants to know from the strip, and the label is derivable.
            return `${roundLabel(f.size, f.round)} on`;
        case 'ended':
            return f.won ? 'You won' : f.closed ? 'Closed' : 'Finished';
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
export const gamesIn = (size: number, round: number): number => Math.max(1, size / 2 ** round);

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
 *
 * THE CLOCK IS THE ONE THE ROOM ACTUALLY RUNS, and for a long time it was not. This printed
 * `pickSeconds` whatever the method, so a buying room was advertised as "20s a pick" - and a
 * buying room opens no pick window at all, running one clock over the whole draft instead
 * (P52). The figure was not merely imprecise, it described a mechanism that room does not
 * have, to the one reader who has never seen inside it.
 *
 * A ROOM THAT CANNOT SAY SAYS NOTHING. `draftSeconds` reaches the row only from a referee
 * built after it, and the tempting fallback - print `pickSeconds`, which is always there -
 * is exactly the bug. So a buying room from an older server names its money and its
 * practice opponents and stops, which is true, where the old line was confident and wrong.
 */
export function lobbyLine(room: LobbyRoom): string {
    return playsLine(room);
}

/**
 * WHAT A ROOM PLAYS, IN ONE SENTENCE, wherever it is read (2026-09-24, asked for: harmonise
 * the lobby rows and the open rooms).
 *
 * THERE ARE THREE SURFACES AND THEY WERE THREE SENTENCES. A public lobby row said "Roll for
 * your XI, 3 re-rolls, 20s a pick"; a challenge on your own list said "Roll for your XI, one
 * man from each squad", which names the same method in different words and then stops
 * before the two things a player actually chose; and an invitation reused one or the other.
 * So the same room read three ways depending where you met it.
 *
 * EVERY PART IS OPTIONAL BECAUSE EVERY PART IS GENUINELY ABSENT SOMEWHERE, and that is what
 * makes one builder right rather than a lowest common denominator:
 * - a DUEL has no clock at all (P51) and no practice opponents, so it prints neither;
 * - a BUDGET room runs its clock over the whole draft and opens no pick window (P52), which
 *   is why the pick clock is read in the roll branch only - printing it on a buying row is
 *   the bug of 2026-09-15, a mechanism that room does not have told to the one reader who
 *   cannot see inside it;
 * - a row from an older referee carries no re-roll count or ratings flag, so it says less
 *   rather than guessing, exactly as the whole-draft clock already does.
 */
export function playsLine(room: RoomPlays): string {
    // The practice opponents, when there are any: it changes what turning up means, since
    // the room can start the moment you arrive and one of your ties may be against a seat
    // rather than a person. Taken as zero from a referee that predates them.
    const bots = room.bots ?? 0;
    const practice = bots ? `, ${bots} practice opponent${bots === 1 ? '' : 's'}` : '';
    if (room.method === 'budget') {
        const whole = draftLengthLine(room.draftSeconds);
        return `Buy an XI with $${room.budget}${whole ? `, ${whole}` : ''}${practice}`;
    }
    const rr =
        room.rerolls === undefined
            ? ''
            : `, ${room.rerolls === 1 ? '1 re-roll' : `${room.rerolls} re-rolls`}`;
    const clock = room.pickSeconds ? `, ${room.pickSeconds}s a pick` : '';
    // `=== false` rather than `!showRatings`, since an absent flag is "not sent" and a room
    // that hides them is the rarer half: silence must not read as the house rule being on.
    const hidden = room.showRatings === false ? ', ratings hidden' : '';
    return `Roll for your XI${rr}${clock}${hidden}${practice}`;
}

/**
 * The whole draft's clock in minutes, for a row that has one.
 *
 * MINUTES BECAUSE THE THREE LENGTHS ARE WHOLE ONES (180 / 300 / 480 is 3, 5 and 8), and
 * because the figure answers "how long an evening is this" rather than a countdown - the
 * countdown is `DraftClock`'s job, inside the room, in seconds. A length that is not a whole
 * number of minutes would round here, which is fine for the same reason: nobody joins a room
 * on the strength of thirty seconds either way.
 *
 * Null when the row does not carry one, which is the whole point: see `lobbyLine`.
 */
export function draftLengthLine(draftSeconds: number | undefined): string | null {
    if (!draftSeconds || draftSeconds <= 0) return null;
    return `${Math.round(draftSeconds / 60)} min to draft`;
}

/**
 * THE HOUSE RULES, ONE FACT A LINE (2026-09-25, asked for: in a versus room the rules were
 * way too long, and should read as bullets).
 *
 * IT IS THE SAME FACTS AS `playsLine` AND IT IS DELIBERATELY NOT THAT FUNCTION, because the
 * reader is a different one. That sentence is a ROW in a list of rooms somebody is choosing
 * between, where one line is all there is; this is read by a player already sitting in the
 * room, about to be dealt a squad, who is scanning for the one fact they came for - so each
 * gets a line of its own and nothing has to be read to the end. A `RoomView` also carries
 * two things a lobby row does not: the size the bracket will be, and whether the
 * whole-draft clock is really there.
 *
 * THE CLOCK IS THE PART THAT GOES WRONG QUIETLY, AND IT HAD. The paragraph this replaces
 * printed `pickSeconds` whatever the room played, so a BUYING room advertised a per-pick
 * window it never opens (P52) and a DUEL advertised a clock it has none of at all (P51) -
 * the same bug the public lobby row was fixed for on 2026-09-15, one screen in. So the
 * clock is decided by what the room actually CARRIES rather than by its method: a duel says
 * there is no clock, a budget room reads its own whole-draft block, a roll room reads the
 * pick window. A budget room from a referee too old to send that block says NOTHING, since
 * the always-present `pickSeconds` is exactly the wrong fallback.
 *
 * The ratings switch is not here: it is the one house rule that changes how the draft is
 * PLAYED rather than how long it takes, so the lobby gives it its own emphasis.
 */
export function roomRules(view: RoomView): string[] {
    const roll = view.rules.method === 'roll';
    const out: string[] = [
        roll ? 'Roll squads, one man from each' : `Buy an XI with $${view.rules.budget}`,
    ];
    if (roll) {
        out.push(
            view.rerolls === 0
                ? 'No re-rolls'
                : `${view.rerolls === 1 ? '1 re-roll' : `${view.rerolls} re-rolls`} each`,
        );
    }
    const clock = isDuel(view)
        ? 'Build in your own time'
        : roll
          ? `${view.pickSeconds}s a pick`
          : draftLengthLine(view.draft ? view.draft.totalMs / 1000 : undefined);
    if (clock) out.push(clock);
    const rounds = roundsFor(view.size);
    out.push(rounds > 1 ? `${rounds} knockout rounds` : 'One match');
    return out;
}

/**
 * A room's chairs, split by what is in them.
 *
 * DRAWN RATHER THAN COUNTED IN WORDS since 2026-09-15: the lobby row shows one dot a chair,
 * which is what lets three columns of a list line up and be read down rather than along.
 * The split is here rather than in the component for the reason the rest of this file is:
 * it is a derivation, and a derivation can be checked - and this one has three ways to go
 * wrong quietly (a bot count larger than the empty chairs, a `seated` larger than the room,
 * and the pluralisation).
 *
 * A PRACTICE OPPONENT IS NEITHER A PERSON NOR A FREE CHAIR, which is the whole reason there
 * are three numbers and not two. It is genuinely taken - the room can start with it in - and
 * it still yields to anybody who turns up (`joinRoom`), so folding it into either of the
 * others tells the reader something false about what walking in would mean.
 *
 * Both counts are clamped, because they come off a wire: `seated` and `bots` are counted by
 * two independent subqueries on the server, so a row read between two writes can carry a
 * pair that does not fit its own room, and a negative `Array.from` length would throw in the
 * middle of a list.
 */
export function seatCounts(room: Pick<LobbyRoom, 'size' | 'seated' | 'bots'>): {
    people: number;
    practice: number;
    free: number;
    /** The same thing as a sentence, which is what a screen reader gets instead of dots. */
    label: string;
} {
    const people = Math.max(0, Math.min(room.size, room.seated));
    const practice = Math.max(0, Math.min(room.size - people, room.bots ?? 0));
    const free = Math.max(0, room.size - people - practice);
    const label = [
        `${people} ${people === 1 ? 'person' : 'people'}`,
        practice ? `${practice} practice opponent${practice === 1 ? '' : 's'}` : '',
        free ? `${free} seat${free === 1 ? '' : 's'} free` : 'full',
    ]
        .filter(Boolean)
        .join(', ');
    return { people, practice, free, label };
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
 * What an invitation is an invitation TO, for the screen a link lands on when nobody is
 * signed in (`InviteRoom`).
 *
 * IT IS THE TWO SENTENCES THE OTHER LISTS ALREADY WRITE, chosen by the pace. A live room
 * gets `lobbyLine`, which is the sentence somebody scanning the public list reads; a duel
 * gets `duelRules`, which is the same sentence with the clock taken out - and taking it out
 * is not a nicety, since a duel stores a `pickSeconds` it never reads (`tickDuel`), so
 * `lobbyLine` would promise a stranger a twenty-second clock that does not exist.
 */
export function inviteRules(room: InviteRoom): string {
    return room.pace === 'async' ? duelRules(room) : lobbyLine(room);
}

/** Where an invited room has got to, from outside it. */
export type InviteState = 'open' | 'full' | 'started' | 'over';

export function inviteState(room: InviteRoom): InviteState {
    if (room.status === 'ended') return 'over';
    if (room.status !== 'lobby') return 'started';
    return lobbyJoinable(room) ? 'open' : 'full';
}

/**
 * What that state means to the person holding the link.
 *
 * IT NEVER PROMISES THE SEAT WILL STILL BE THERE. What this screen shows is a snapshot read
 * once, and the sign-in that follows it takes a minute and a mail client - so "the seat is
 * yours" is written as what is true now rather than as a reservation, and every path through
 * signing in still ends at `RoomScreen`, which takes the seat or says why it could not. A
 * screen that guaranteed a seat would be lying about the one thing it cannot check.
 *
 * A DUEL AND A ROOM READ DIFFERENTLY at every state, which is why this is not `seatsLine`
 * with a full stop: a duel has exactly two chairs and one of them is the person who sent the
 * link, so "1 of 2 seats left" is a true sentence that says nothing, where "nobody has taken
 * this up yet" is the whole of what a challenger is waiting to hear.
 */
export function inviteNote(room: InviteRoom): string {
    const duel = room.pace === 'async';
    switch (inviteState(room)) {
        case 'open':
            return duel
                ? 'Nobody has taken this one up yet, so the seat is there for you.'
                : `${seatsLine(room)}, as of now.`;
        case 'full':
            return duel
                ? 'Somebody has already taken this one up.'
                : 'Every seat is taken at the moment.';
        case 'started':
            return duel ? 'This one is already under way.' : 'It has already started.';
        default:
            return 'This one is over.';
    }
}

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
