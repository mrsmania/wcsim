// What the referee needs from a database, as an interface.
//
// Wave 3 of docs/pvp-plan.md. It is an interface rather than a module of queries for one
// reason that pays for itself immediately: `api.ts` and `sweeper.ts` are then testable
// without Postgres, so `npm run checks` drives whole rooms - a draft, an expiry, an outage,
// a tie - through the referee's real handlers against an in-memory store. The Postgres
// implementation is `pgStore.ts` and the mapping it uses is checked separately by round
// trip (`rows.ts`).
//
// THE SHAPE IS `mutate`, NOT `read` THEN `write`, and that is the whole design. Every
// command is load, apply a pure transition, save - and all three have to be one
// transaction under a row lock, or two picks arriving together both read the same room and
// the second overwrites the first. Handing callers a `mutate` makes the locking impossible
// to forget; handing them `read` and `save` makes it impossible to see.

import type { PvpRoom } from '../../src/domain/pvpRoom';
import type { LobbyRoom } from '../../src/domain/pvpWire';

/** One line of the lobby list, as the store hands it over. The wire shape is shared with
 *  the client (`src/domain/pvpWire.ts`), so the two sides cannot describe it differently. */
export type LobbyRow = LobbyRoom;

/** What a transition is told besides the room itself. */
export interface MutateContext {
  /** When the sweeper last looked at this room, or null if it never has. P45's recovery
   *  reads it; see `outage.ts` for why it is not applied on every sweep. */
  sweptAt: number | null;
}

export interface Mutation<T> {
  room: PvpRoom;
  result: T;
  /** Set when the transition changed nothing that needs writing, so an idle sweep over
   *  twenty rooms is twenty reads and no writes. */
  unchanged?: boolean;
}

export interface CreateInput {
  code: string;
  hostId: string;
  visibility: 'public' | 'private';
  size: number;
  method: 'roll' | 'budget';
  budget: number;
  years: number[];
  showRatings: boolean;
  rerolls: number;
  pickSeconds: number;
}

export interface RoomStore {
  /** Insert a lobby with its host seated. Throws on a code collision so the caller can
   *  try another one; the unique index is the arbiter, never a prior read. */
  create(input: CreateInput, now: number): Promise<PvpRoom>;

  /** The room as it stands. For reads only - a command must go through `mutate`. */
  read(code: string): Promise<PvpRoom | null>;

  /**
   * Load, transform, save, under a row lock. Returns null when there is no such room.
   *
   * The transform is synchronous and pure by contract: it is one of the `domain/pvpRoom`
   * transitions, and doing anything asynchronous inside a held row lock is how a request
   * that hangs takes a room with it.
   */
  mutate<T>(
    code: string,
    now: number,
    fn: (room: PvpRoom, ctx: MutateContext) => Mutation<T>,
  ): Promise<Mutation<T> | null>;

  /** Codes of the rooms a sweep should look at.
   *
   *  IT INCLUDES LOBBIES, and that is not an optimisation to reverse: P31's liveness is
   *  evaluated by the same sweeper as the pick clock, so a lobby the sweeper never visits
   *  is a lobby whose host can close their laptop and leave the room sitting at 3 of 8 for
   *  ever - which is exactly the state that makes a public lobby list worthless. */
  liveCodes(): Promise<string[]>;

  /** The open public rooms, newest first, for the lobby list (P18). Read-only and cheap:
   *  it answers off `pvp_rooms` plus a member count, never the whole room, because a
   *  listing has no business carrying anybody's XI. */
  publicLobbies(limit: number): Promise<LobbyRow[]>;

  /** The code of the room this account already holds a seat in, if any (P39: one active
   *  room per account, so one person on a phone and a laptop cannot take two seats). */
  activeRoomOf(userId: string): Promise<string | null>;

  /** The display name on the account, or null when they have not claimed one. A room
   *  cannot show strangers an email address, so this gates entry rather than defaulting. */
  displayName(userId: string): Promise<string | null>;

  /** P31's liveness. Closing a tab fires no reliable event, so being here has to be
   *  observed rather than announced. */
  seen(code: string, userId: string, now: number): Promise<void>;
}
