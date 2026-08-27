import { REFEREE } from '../../config';
import type { RoomView } from '../../domain/pvpWire';
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
    rerolls?: number;
    showRatings?: boolean;
}

export const createRoom = (input: CreateRoomInput): Promise<RoomView> =>
    call('POST', '/v1/rooms', input);

export const readRoom = (code: string): Promise<RoomView> =>
    call('GET', `/v1/rooms/${code}`);

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

/** Play with fewer people than the room was opened for (P7). The host only, downwards
 *  only, and no byes are ever created: a room of eight that will not fill becomes a room
 *  of four or two and plays a full bracket, rather than sitting in a lobby for ever. */
export const resizeRoom = (code: string, size: number): Promise<RoomView> =>
    call('POST', `/v1/rooms/${code}/size`, { size });

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
