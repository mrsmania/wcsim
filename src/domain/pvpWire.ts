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
  /** They have said they are through (P52). A whole-draft room's only: everywhere else
   *  filling the eleventh slot says it. Absent from a referee that predates it. */
  done?: boolean;
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

/** Live, or a duel in both players' own time. Mirrors `PvpRoom.pace`, restated here so the
 *  wire shape does not drag the state machine into a browser bundle. */
export type RoomPaceWire = 'live' | 'async';

/**
 * One duel on the caller's list (P51).
 *
 * IT IS NOT A `RoomView` AND NOT A `LobbyRoom`, for the reason both of those exist
 * separately: a list is read by somebody deciding what to open, so it carries the other
 * person's name, how far each side has got and how it finished - and nothing about either
 * XI. How far each side has got is counted on the SERVER, because counting it here would
 * mean handing the client the draft, which is the one thing a listing must not do.
 */
export interface DuelRow {
  code: string;
  /** The other player. Empty until somebody has taken the challenge up: a duel is opened
   *  with a link and nobody's name on it, so there is no opponent to print until one
   *  arrives. */
  opponentName: string;
  /** True when the caller is the one who sent it. */
  yours: boolean;
  status: RoomStatusWire;
  /** How many people are in it: what tells "nobody has taken this up" apart from "they are
   *  building their team". A duel with one seat filled is its ordinary early state - it is a
   *  link waiting to be opened - and the pick counts cannot say so on their own.
   *
   *  Absent from a referee that predates the field, where a duel could not be read this way
   *  at all. `duelTurn` reads it as two, which is what such a room becomes the moment
   *  anything happens in it. */
  seated?: number;
  method: 'roll' | 'budget';
  budget: number;
  /** How many of the eleven each side has picked. */
  yourPicks: number;
  theirPicks: number;
  /** Whether each side has SENT their XI, which in a duel is the only thing that finishes
   *  a draft: eleven picked is not eleven sent.
   *
   *  Absent from a referee that predates the reshape, where filling the eleventh slot WAS
   *  finishing - so `duelTurn` falls back to exactly that reading rather than to a guess,
   *  and an old row goes on saying what it always said. */
  yourDone?: boolean;
  theirDone?: boolean;
  /** Set once it is decided: the goals from the caller's side, and whether they won. A
   *  walkover has a winner and no goals, which is what `walkover` below is for. */
  yourGoals?: number | null;
  theirGoals?: number | null;
  won?: boolean | null;
  /** Nobody played it: one of the two walked out after the challenge had been taken up, so
   *  it is a win and a loss with no scoreline (`forfeitDuel`). `won` says which side of it
   *  the caller is on.
   *
   *  Absent from a referee that predates the forfeit, where leaving simply closed the room -
   *  and there `won` is unset too, so the row falls off the list rather than claiming a
   *  result it has not got. */
  walkover?: boolean;
  openedAt: number;
  /** When anything last happened, which is what the list sorts on: a duel somebody has
   *  just moved in is the one you want at the top. */
  touchedAt: number;
}

export interface RoomView {
  code: string;
  visibility: 'public' | 'private';
  /** Absent from a referee that predates duels, which reads as `live`. */
  pace?: RoomPaceWire;
  status: RoomStatusWire;
  hostId: string;
  size: number;
  /**
   * The whole draft's clock (P52), sent by a budget room and by nothing else.
   *
   * ABSENT MEANS THE SERVER HAS NEVER HEARD OF IT, which is the only way a client can
   * tell: `PVP_PROTOCOL` was not bumped, so a budget room from an older referee arrives
   * with eleven pick windows and no `draft` at all, and the screens fall back to the
   * per-pick draft they have always drawn. `remainingMs` is null in a duel, where nothing
   * is counting.
   */
  draft?: { totalMs: number; remainingMs: number | null } | null;
  /**
   * How long is left to SEND a team in this DUEL, in milliseconds, or null when nothing is
   * counting (`DUEL_DRAFT_MS`).
   *
   * IT IS NOT THE `draft` BLOCK ABOVE. That one is the whole-draft clock a budget room
   * runs, and a roll duel has none at all - a screen branches on its presence to tell the
   * two draft shapes apart, so a duel's outer bound put there would draw the wrong one.
   * This is a date the screen prints ("two days left to send it"), not a bar it fills.
   *
   * Absent from a referee that predates the deadline, where a duel's draft really did run
   * for ever: a screen reads that as nothing to say rather than as a window about to shut.
   */
  sendRemainingMs?: number | null;
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
     *  two minutes fast would otherwise be shown a window that expired before it opened.
     *
     *  NULL IN A DUEL, where the window still counts the picks and deals the squads but has
     *  no deadline at all. Null rather than a very large number, so a screen that forgot to
     *  ask draws no clock instead of a wrong one. */
    window: { ordinal: number; remainingMs: number | null } | null;
  } | null;
  /** Other players' XIs, once their tie has been played. */
  revealed: Record<string, Record<string, string>>;
  ties: TieView[];
  /** The server's own clock, so a client can tell how stale a payload it holds is. */
  at: number;
}
