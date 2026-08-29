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
  /** A practice opponent the host seated rather than a person (`domain/pvpBot.ts`). The
   *  screens mark the seat; nothing else has to care, because a bot is a member in every
   *  other way. Absent from a referee that predates them, hence the `?? false` on read. */
  bot?: boolean;
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

/**
 * One room on the public lobby list (P18).
 *
 * Deliberately NOT a `RoomView`. A listing is read by people who are not in the room, so it
 * carries what somebody needs to decide whether to join - what kind of draft, how much
 * money, how fast the clock, how many seats are left, whether the numbers are hidden - and
 * nothing else. No members, no XIs, no picks: the moment a listing carries a member row it
 * is carrying a formation, and P19 puts formations out of a lobby's reach precisely so the
 * last person to choose cannot counter everyone.
 */
export interface LobbyRoom {
  code: string;
  size: number;
  /** PEOPLE seated. `size - seated` is what the row actually says, and a chair the host
   *  filled with a practice opponent is not one of them: a newcomer takes a bot's seat
   *  rather than being refused (`joinRoom`), so counting bots here would print "Full" over
   *  a room anybody can walk into. */
  seated: number;
  /** How many practice opponents are holding the other chairs, so the row can say what
   *  turning up would mean. Absent from a referee that predates them: read it as `?? 0`. */
  bots?: number;
  method: 'roll' | 'budget';
  budget: number;
  pickSeconds: number;
  rerolls: number;
  showRatings: boolean;
  /** The host's display name, which is the only thing on the row that is a person. */
  hostName: string;
  /** When it opened, for "3 minutes ago" and for the ordering. */
  openedAt: number;
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
