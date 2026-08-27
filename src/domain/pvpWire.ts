// ---------------------------------------------------------------------------
// What a room looks like on the wire: the referee's answer, and the client's input.
//
// Wave 5 of docs/pvp-plan.md. Shared by both sides on purpose, exactly as
// `pvpVersion.ts` is: the referee builds a `RoomView` in `referee/src/view.ts` and the
// browser reads one in `state/pvp/referee.ts`, and a payload described twice is a payload
// the two sides can disagree about while both type-checking. It is types only - there is
// no code here to run - so moving it changed nothing the deployed referee does.
//
// WHAT IS DELIBERATELY NOT HERE: the rule about what a viewer may see. That lives in
// `referee/src/view.ts`, on the server, where it is enforced. This file only says what
// shape the answer has.
//
// IDS, NOT PLAYERS. An XI travels as slotId -> player id. The client already holds the
// whole dataset, and sending eleven full player objects per broadcast to every member of
// a room is a lot of bytes to say nothing new. The referee resolves an id in its own copy
// of the dataset, which is why the version handshake (P35) covers the dataset hash.
// ---------------------------------------------------------------------------

import type { MatchEvent, ShootoutResult } from './match';
import type { KoDecided } from './knockout';

/** Where a room has got to. Mirrors `PvpRoom.status`, restated here so the wire shape
 *  does not drag the whole state machine into a browser bundle. */
export type RoomStatusWire = 'lobby' | 'drafting' | 'round' | 'ended';

export interface MemberView {
  userId: string;
  seat: number;
  name: string;
  ready: boolean;
  outIn: number | null;
  /** How many slots they have filled. Everyone may see how far along everyone else is
   *  (plan section 4) - that is progress, not information about the team. */
  picked: number;
  /** Their own shape, and only ever their own: null for everybody else until the room
   *  starts, when it stops being a secret worth keeping. */
  formationName: string | null;
  style: string | null;
}

export interface TieView {
  round: number;
  game: number;
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  decided: KoDecided | null;
  events: MatchEvent[];
  pens: ShootoutResult | null;
  /** Added time per half, decided by the server (P30) so two people watching the same
   *  match see the same match. */
  stoppage: [number, number] | null;
  revealFrom: number | null;
  revealMs: number | null;
  winnerId: string | null;
}

export interface RoomView {
  code: string;
  visibility: 'public' | 'private';
  status: RoomStatusWire;
  hostId: string;
  size: number;
  round: number;
  championId: string | null;
  rules: { method: 'roll' | 'budget'; budget: number; years: readonly number[] };
  pickSeconds: number;
  showRatings: boolean;
  rerolls: number;
  members: MemberView[];
  /** The viewer's own draft. Null for somebody looking at a public lobby they have not
   *  joined. */
  you: {
    userId: string;
    /** slotId -> player id. */
    xi: Record<string, string>;
    dealt: string[];
    rerollsLeft: number;
    budgetLeft: number;
    /** REMAINING MILLISECONDS, never a deadline (plan section 5): a phone whose clock is
     *  two minutes fast would otherwise be shown a window that expired before it opened. */
    window: { ordinal: number; remainingMs: number } | null;
  } | null;
  /** Other players' XIs, once their tie has been played. */
  revealed: Record<string, Record<string, string>>;
  ties: TieView[];
  /** The server's own clock, so a client can tell how stale a payload it holds is. */
  at: number;
}
