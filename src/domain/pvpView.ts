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
import type { Filled } from './draft';
import type { Formation } from './formations';
import type { KoDecided } from './knockout';
import type { MatchEvent, ShootoutResult } from './match';
import type { MemberView, RoomView, TieView } from './pvpWire';

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
            return 'match on';
        case 'ended':
            return view.championId === me?.userId ? 'you won' : 'finished';
    }
}
