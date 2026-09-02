import { RefereeError } from '../../state/pvp/referee';

// ---------------------------------------------------------------------------
// Turning the referee's refusal into a sentence, and NEVER throwing its words away.
//
// The referee answers a refusal with its own name for it (`no-display-name`, `late`,
// `bad-room`) and, for the ones a deployment gets wrong, a `detail` naming the fault -
// `bad-signature`, `wrong-audience`, `expired`. Its own docstring says why: "the faults
// are returned because they are how a deployment is debugged", since "the anon key was
// used" and "the session expired" look identical from outside and need different fixes.
//
// The first version of the versus screens threw all of that away and said "the referee
// would not open a room just now", which is the least useful sentence available: it is
// true of a wrong JWT secret, a name the referee cannot read, a full room and a database
// error alike. So every screen goes through here, and anything without a sentence of its
// own still shows the referee's own words rather than a shrug.
//
// Pure, so `npm run checks` can hold this list against the refusals `referee/src/api.ts`
// actually returns.
// ---------------------------------------------------------------------------

/** A sentence for the player, and the referee's own words underneath it. */
export interface RefereeMessage {
    /** What to say. Always populated. */
    text: string;
    /** The referee's own code and detail, for a bug report. Null when there is nothing to
     *  add - a refusal whose sentence already says everything. */
    raw: string | null;
    /** True when this is something the OWNER has to fix rather than the player: the two
     *  sides disagree about a secret, or the referee cannot read what it needs. */
    deployment: boolean;
    /** A room code the refusal is ABOUT rather than the one that was asked for: only
     *  `already-in-a-room` sets it, and it is there so the screen can offer a way back to
     *  the room holding the seat. Being told "you are already in a room" with no route to
     *  it is a dead end, and it is the shape of the bug that made this necessary. */
    room: string | null;
}

/** The faults the referee reports for a token it would not act on. Named here so the
 *  three that mean "the deployment is wrong" get a different sentence from the three that
 *  mean "sign in again". */
const TOKEN_FAULTS: Record<string, { text: string; deployment: boolean }> = {
    'bad-signature': {
        text: 'This site and the versus server disagree about the sign-in secret, so the server will not accept your session. Nothing you can do from here.',
        deployment: true,
    },
    'wrong-algorithm': {
        text: 'The versus server refused the shape of your session token. Nothing you can do from here.',
        deployment: true,
    },
    'wrong-audience': {
        text: 'The versus server expects sessions from a different sign-in setup than this site uses. Nothing you can do from here.',
        deployment: true,
    },
    expired: {
        text: 'Your sign-in has expired. Reload the page and try again.',
        deployment: false,
    },
    missing: { text: 'You are not signed in any more. Sign in and try again.', deployment: false },
    malformed: { text: 'You are not signed in any more. Sign in and try again.', deployment: false },
    'not-authenticated': {
        text: 'The versus server did not accept your sign-in. Reload the page and try again.',
        deployment: false,
    },
    'no-subject': {
        text: 'The versus server did not accept your sign-in. Reload the page and try again.',
        deployment: false,
    },
};

/** Every refusal `referee/src/api.ts` can return, in the player's words. */
const CODES: Record<string, { text: string; deployment?: boolean }> = {
    unreachable: { text: 'Cannot reach the versus server. Versus is off until it answers; nothing else in the game is affected.' },
    'signed-out': { text: 'You are not signed in any more. Sign in and try again.' },
    'profile-read': { text: 'Could not read your account just now. Try again in a moment.' },
    'name-taken': { text: 'Somebody already plays under that name.' },
    'name-refused': { text: 'That name could not be saved.' },
    'no-display-name': {
        text: 'The versus server cannot see the name on your account, so it will not let you into a room. That is a server-side permission rather than anything you typed.',
        deployment: true,
    },
    // The detail is the code of the room holding the seat, so the sentence names it and
    // `room` carries it out to the screen.
    'already-in-a-room': { text: 'You are already in a room.' },
    'room-full': { text: 'That room is full.' },
    'room-started': { text: 'That room has already started.' },
    // THE ONE REFUSAL WITH NOTHING TO TRY. Arriving at a room is taking the seat, so a
    // removed player's own screen sends the join that gets this back - which means the
    // sentence has to say what happened, not what went wrong, or they would sit there
    // pressing Try again at a lobby that will never take them. `RoomScreen` offers no
    // retry for it, for the same reason.
    'removed-from-room': {
        text: 'The host removed you from that room. You cannot go back in, but you can open one of your own or join another.',
    },
    'bad-remove': { text: 'The versus server did not understand who to remove.' },
    // P52's two. A board is only refused for a reason the player can see on it, so the
    // sentence points at the board rather than at the server.
    'bad-xi': { text: 'The versus server would not read that team sheet.' },
    'draft-closed': {
        text: 'The draft is closed. Either the clock ran out or you have said you are done.',
    },
    'no-such-room': { text: 'No room with that code.' },
    // The one refusal nothing in the app currently shows: it can only come from the
    // unauthenticated invitation read (`referee/src/invites.ts`), and `readInvite` treats
    // every failure alike - the screen falls back to the code and says so. The sentence is
    // here anyway, because the mapping is checked against what the referee CAN say rather
    // than against what a screen happens to ask for today.
    'too-many': { text: 'Too many requests just now. Try again in a minute.' },
    'bad-room': { text: 'The versus server would not accept those room settings.' },
    'bad-formation': { text: 'The versus server would not accept that formation.' },
    'bad-size': { text: 'The versus server would not accept that room size.' },
    'bad-bots': { text: 'The versus server would not accept that many practice opponents.' },
    'bad-ordinal': { text: 'That pick arrived out of order. The board will catch up in a moment.' },
    'unknown-player': {
        text: 'The versus server has never heard of that player, which means it is carrying a different set of squads from this page.',
        deployment: true,
    },
    'no-code-available': { text: 'The versus server could not find a free room code. Try again.' },
    'no-such-route': {
        text: 'The versus server does not recognise what this page asked it for, so the two are on different versions.',
        deployment: true,
    },
    'referee-error': {
        text: 'The versus server hit an error of its own. Its log says what; nothing here can.',
        deployment: true,
    },
    late: { text: 'The clock beat that one.' },
    'no-window': { text: 'That pick window has closed.' },
    illegal: { text: 'The versus server would not take that pick.' },
    unauthorized: { text: 'The versus server did not accept your sign-in.' },
};

/** The codes this module claims to cover. Exported for the check that holds it against
 *  the refusals the referee actually returns. */
export const KNOWN_CODES: readonly string[] = Object.keys(CODES);

/**
 * What to show for a failed call.
 *
 * `what` is the thing being attempted, so one sentence can carry it: "could not open a
 * room" reads better than a bare code, and the code is underneath either way.
 */
export function refereeMessage(err: unknown, what: string): RefereeMessage {
    if (!(err instanceof RefereeError)) {
        return { text: `Could not ${what}.`, raw: null, deployment: false, room: null };
    }
    const detail = err.detail;
    // An `unauthorized` carries the reason in its detail, and the reasons split into two
    // very different instructions, so it is read first.
    if (err.code === 'unauthorized' && detail) {
        for (const fault of detail.split(',')) {
            const hit = TOKEN_FAULTS[fault.trim()];
            if (hit)
                return {
                    text: hit.text,
                    raw: rawOf(err),
                    deployment: hit.deployment,
                    room: null,
                };
        }
    }
    // The one refusal that is ABOUT another room. Naming it turns a dead end into a door:
    // the code is the detail, and the screen puts a button on it.
    const room = err.code === 'already-in-a-room' && detail ? detail.trim().toUpperCase() : null;
    const known = CODES[err.code];
    if (known) {
        return {
            text: room ? `You are already in room ${room}.` : known.text,
            raw: rawOf(err),
            deployment: known.deployment ?? false,
            room,
        };
    }
    return { text: `Could not ${what}.`, raw: rawOf(err), deployment: false, room: null };
}

/** The referee's own words, for a bug report: its code, and its detail when it sent one. */
function rawOf(err: RefereeError): string {
    const bits = [err.status ? `HTTP ${err.status}` : null, err.code, err.detail];
    return bits.filter(Boolean).join(' · ');
}
