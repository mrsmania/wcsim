import { REFEREE } from '../../config';
import type { DuelRow, InviteRoom, LobbyRoom, RoomView } from '../../domain/pvpWire';
import { localVersion, versionMismatch, type PvpVersion, type VersionMismatch } from '../../domain/pvpVersion';
import { nameKeyOf, normalizeName } from '../../domain/displayName';

// ---------------------------------------------------------------------------
// Talking to the referee.
//
// Wave 5 of docs/pvp-plan.md. Every write a room makes goes through here, and the
// referee is the only thing that may make one: the client posts an instruction and is
// answered with the room AS IT MAY SEE IT (`domain/pvpWire.ts`), which it then renders.
// Nothing here computes a room's state from a previous one.
//
// THE CALL CARRIES THE PLAYER'S OWN SESSION TOKEN, NEVER THE ANON KEY. In self-hosted
// Supabase the anon key is itself a JWT signed with the same secret and it ships in this
// bundle by design, so a referee that accepted it would take an instruction from any
// visitor with no account at all. It refuses it (P34, `domain/pvpAuth.ts`), and this side
// never sends it.
//
// THE AUTH LIBRARY IS IMPORTED DYNAMICALLY, every time, exactly as `bootStore` does it. A
// guest never downloads it, and versus is behind an account anyway - but a static import
// here would pull it towards whatever chunk this file lands in, and the whole point of
// that arrangement is that it lands in none.
// ---------------------------------------------------------------------------

/**
 * THE CONFIGURED URL ALREADY CARRIES THE ROUTE PREFIX, so nothing here repeats it.
 *
 * `VITE_REFEREE_URL` is `https://HOST/referee` (docs/nas-setup.md, step 6): the referee is
 * a route on the account server's own gateway rather than a second hostname (P46), and the
 * variable points at the route, not at the host. So a path here is `/version` and
 * `/v1/rooms/...`, and writing `/referee/v1/rooms` would ask the gateway for
 * `/referee/referee/v1/rooms`, which matches nothing.
 *
 * That was the first thing wrong with wave 5 in production: every call 404'd, the
 * handshake read that as "the referee is not answering", and the Versus screen said it was
 * updating. It is a check now (`scripts/checks/build.ts`), because nothing else can catch
 * it: the deployed referee answers perfectly and the client is asking the wrong door.
 */

/** How long a call may take before it is abandoned. Short on purpose: a pick is a hundred
 *  bytes and the clock is twenty seconds, so a request still in flight after this has
 *  already lost the window it was for. */
const TIMEOUT_MS = 8000;

/** A refusal the referee named. `code` is its own word for it (`late`, `room-full`,
 *  `no-display-name`), which is what lets a screen say something specific rather than
 *  "something went wrong". */
export class RefereeError extends Error {
    readonly status: number;
    readonly code: string;
    /** The referee's own extra word about the refusal, when it sent one: which token
     *  fault, which room setting. It is the difference between "the anon key was used"
     *  and "the session expired", which look identical from outside and need different
     *  fixes - and the reason `components/versus/refereeMessage.ts` never throws it away. */
    readonly detail?: string;
    /** The whole refusal body. A refused PICK carries the room with it, which is what
     *  lets the board reconcile rather than sit on a player the referee never took. */
    readonly payload: unknown;
    constructor(status: number, code: string, detail?: string, payload?: unknown) {
        super(detail ? `${code}: ${detail}` : code);
        this.name = 'RefereeError';
        this.status = status;
        this.code = code;
        this.detail = detail;
        this.payload = payload ?? null;
    }
}

async function bearer(): Promise<string> {
    const { supabase } = await import('../auth');
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RefereeError(401, 'signed-out');
    return token;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await bearer();
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${REFEREE.url}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: ctrl.signal,
        });
    } catch (err) {
        throw new RefereeError(0, 'unreachable', (err as Error).message);
    } finally {
        window.clearTimeout(timer);
    }
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
        const p = (payload ?? {}) as { error?: string; detail?: string };
        throw new RefereeError(res.status, p.error ?? `http-${res.status}`, p.detail, payload);
    }
    return payload as T;
}

// --- The handshake ---------------------------------------------------------

export interface Handshake {
    /** Null when the two agree. */
    mismatch: VersionMismatch | null;
    theirs: PvpVersion | null;
    /** The referee could not be reached at all, which is different from disagreeing. */
    unreachable: boolean;
}

/**
 * Ask the referee what it is, before letting anybody into a room (P35).
 *
 * Unauthenticated on purpose, on both sides: this is the question a client asks BEFORE it
 * has a working room to authenticate against, and a signed-out visitor is shown "versus is
 * updating" rather than an invitation to sign in to something broken.
 */
export async function handshake(): Promise<Handshake> {
    try {
        const res = await fetch(`${REFEREE.url}/version`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return { mismatch: null, theirs: null, unreachable: true };
        const theirs = (await res.json()) as PvpVersion;
        return { mismatch: versionMismatch(theirs), theirs, unreachable: false };
    } catch {
        return { mismatch: null, theirs: null, unreachable: true };
    }
}

/** What this build is, for the "versus is updating" screen to print beside theirs. */
export const clientVersion = localVersion;

/**
 * What an invitation points at, asked WITHOUT a session (`InviteRoom`).
 *
 * IT IS THE ONE CALL IN THIS FILE THAT DOES NOT GO THROUGH `call`, and that is the whole
 * point of it rather than an oversight: `call` fetches a bearer token first and throws
 * `signed-out` when there is none, and the entire audience for this read is somebody with no
 * account who has just followed a link. So it is shaped like `handshake` above, for the same
 * reason - it is a question asked before there is anything to authenticate with.
 *
 * NULL IS EVERY WAY IT CAN FAIL, AND THEY ALL MEAN ONE THING to the screen that asks: no
 * such room, a referee too old to have the route at all (`no-such-route`, and this is
 * exactly the skew a client shipping before a rebuild has), the referee unreachable, or the
 * read rate limited. All four leave the invitation screen with the code and nothing else,
 * which is what it showed before this existed - so there is one fallback rather than four
 * branches, and no probe is needed to choose between them.
 */
export async function readInvite(code: string): Promise<InviteRoom | null> {
    try {
        const res = await fetch(`${REFEREE.url}/v1/rooms/${encodeURIComponent(code)}/invite`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        return (await res.json()) as InviteRoom;
    } catch {
        return null;
    }
}

// --- The display name (P22) ------------------------------------------------

/** The name this account plays under, or null if it has never chosen one. */
export async function currentDisplayName(): Promise<string | null> {
    const { supabase } = await import('../auth');
    const client = supabase();
    const { data } = await client.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new RefereeError(401, 'signed-out');
    const { data: row, error } = await client
        .from('profiles')
        .select('display_name')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new RefereeError(0, 'profile-read', error.message);
    return (row as { display_name: string | null } | null)?.display_name ?? null;
}

/**
 * Claim a display name.
 *
 * The NAME and the KEY are computed here and both are sent, because the folded key is
 * what uniqueness is judged on (`domain/displayName.ts`) and Postgres cannot compute it:
 * the rule needs Unicode script properties. The function checks the half SQL can check
 * (present, 3 to 16) so skipping this client cannot store an empty key.
 */
export async function claimDisplayName(raw: string): Promise<string> {
    const { supabase } = await import('../auth');
    const name = normalizeName(raw);
    const { data, error } = await supabase().rpc('set_display_name', {
        p_name: name,
        p_key: nameKeyOf(name),
    });
    if (error) {
        // PT409 is the taken-name raise; anything else is a real failure.
        const taken = error.code === 'PT409' || /taken/i.test(error.message);
        throw new RefereeError(taken ? 409 : 400, taken ? 'name-taken' : 'name-refused', error.message);
    }
    return String(data ?? name);
}

// --- Rooms -----------------------------------------------------------------

export interface CreateRoomInput {
    visibility: 'public' | 'private';
    size: number;
    method: 'roll' | 'budget';
    budget: number;
    years: readonly number[];
    pickSeconds: number;
    /** How long a BUDGET room's whole draft gets (P52). Omitted means the default, which
     *  is also what a referee older than P52 does with it: nothing. */
    draftSeconds?: number;
    rerolls?: number;
    showRatings?: boolean;
    /** Live, or a duel played in both players' own time (P51). Omitted means live, which
     *  is what a referee that predates duels reads anyway. */
    pace?: 'live' | 'async';
}

export const createRoom = (input: CreateRoomInput): Promise<RoomView> =>
    call('POST', '/v1/rooms', input);

export const readRoom = (code: string): Promise<RoomView> =>
    call('GET', `/v1/rooms/${code}`);

/** The open public rooms (P18). It needs a session, because a room is account-only, but it
 *  deliberately does not need a seat - that is what makes a public room public. */
export const readLobby = (): Promise<{ rooms: LobbyRoom[] }> => call('GET', '/v1/lobby');

/**
 * Your duels: every one you are in, open and finished (P51).
 *
 * IT IS THE ONLY WAY A DUEL EVER REACHES ANYBODY. This game sends no mail and no push
 * notification, so a challenge arrives by the link its sender pastes into a message, and
 * everything after that - your move, their move, the result of a match played while you
 * were asleep - arrives by being on this list. Hence the Versus tab, and hence the strip
 * in the chrome, which is this list read down to its most urgent row.
 */
export const readDuels = (): Promise<{ duels: DuelRow[] }> => call('GET', '/v1/duels');

export const joinRoom = (code: string): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/join`);

export const setLineup = (
    code: string,
    formationName: string,
    style: string,
    ready: boolean,
): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/lineup`, { formationName, style, ready });

export const startRoom = (code: string): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/start`);

/**
 * Give up your seat.
 *
 * IT HAS TO BE SENT, not just navigated away from, and that was a reported bug: leaving
 * used to be local only, so the seat stayed taken and the next room was refused with
 * "you are already in a room" until the liveness sweep noticed ninety seconds later.
 *
 * Past the start it is a no-op on the server by design - your XI is in a bracket other
 * people are playing - so this is safe to call either way and the screen says which it is.
 */
export const leaveRoom = (code: string): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/leave`);

/** Play with fewer people than the room was opened for (P7). The host only, downwards
 *  only, and no byes are ever created: a room of eight that will not fill becomes a room
 *  of four or two and plays a full bracket, rather than sitting in a lobby for ever. */
export const resizeRoom = (code: string, size: number): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/size`, { size });

/**
 * How many practice opponents sit in this room (`domain/pvpBot.ts`).
 *
 * A TARGET rather than "add one", so a tap that arrives twice over a flaky link fills the
 * room once - the same idempotence the pick ordinal has (P36). The host only, and only
 * into seats nobody is sitting in: the referee refuses anything else by answering with the
 * room unchanged, exactly as it does for a resize it will not make.
 */
export const setRoomBots = (code: string, count: number): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/bots`, { count });

/** What the referee said about a submitted board (P52). `closed` is every reason the room
 *  is not taking one - the clock ran out, or you have said you are through - because to a
 *  player they are the same sentence and the room comes back saying which. */
export interface BoardAnswer {
    outcome: 'ok' | 'illegal' | 'closed';
    room: RoomView;
}

/**
 * Send the whole XI (P52), which is how a budget room drafts.
 *
 * ONE INSTRUCTION FOR THREE GESTURES. Buying a player, moving one to another of his roles
 * and taking one back out are all "here is my team now", so the referee needs no separate
 * command for any of them - which is exactly what P42 said and what the pick protocol
 * could not express. It is also idempotent by construction, where a pick needs an ordinal
 * to get there: the same map sent twice is the same map.
 */
export async function postXi(code: string, xi: Record<string, string>): Promise<BoardAnswer> {
    try {
        return await call<BoardAnswer>('POST', `/v1/rooms/${code}/xi`, { xi });
    } catch (err) {
        // A refused board travels WITH the room, exactly as a refused pick does, so the
        // screen reconciles rather than showing a red line about it.
        const room = roomInside(err);
        if (room) {
            const code_ = (err as RefereeError).code;
            return { outcome: code_ === 'draft-closed' ? 'closed' : 'illegal', room };
        }
        throw err;
    }
}

/** "I am through", and taking it back (P52). */
export const postDone = (code: string, done: boolean): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/done`, { done });

/** What the referee said about a pick. `late` and `illegal` are distinct because they
 *  mean different things to a player: one is "the clock beat you", the other is "that was
 *  not a legal move". Either way the room comes back, so the board reconciles. */
export interface PickAnswer {
    outcome: 'ok' | 'replay' | 'late' | 'illegal' | 'no-window';
    room: RoomView;
}

export async function submitPick(
    code: string,
    ordinal: number,
    slotId: string,
    playerId: string,
): Promise<PickAnswer> {
    try {
        return await call<PickAnswer>('POST', `/v1/rooms/${code}/pick`, {
            ordinal,
            slotId,
            playerId,
        });
    } catch (err) {
        // A refused pick is not an error to show: the room travels WITH the refusal, so
        // the board can reconcile and the screen can say the clock beat you. Only a
        // refusal with no room in it is a genuine failure.
        const room = roomInside(err);
        if (room) return { outcome: (err as RefereeError).code as PickAnswer['outcome'], room };
        throw err;
    }
}

/** The room a refusal carried, if it carried one. */
function roomInside(err: unknown): RoomView | null {
    if (!(err instanceof RefereeError)) return null;
    const body = err.payload as { room?: RoomView } | null;
    return body?.room ?? null;
}

export const rerollDeal = (code: string): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/reroll`);

/** Liveness (P31). A member unseen for ninety seconds is dropped from a lobby, so this is
 *  sent on a timer while a room is held - a closed tab fires no reliable event, which is
 *  why leaving has to be observed rather than announced. */
export const seen = (code: string): Promise<{ ok: true }> =>
    call('POST', `/v1/rooms/${code}/seen`);
