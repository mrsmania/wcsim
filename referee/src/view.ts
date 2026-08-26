// What one player is allowed to see of a room.
//
// Wave 3 of docs/pvp-plan.md. The client reads most of the room straight out of Postgres
// under the policies in migration 0016; this is the same rule stated once more, for the
// broadcast payload and for the referee's own `GET`, because a broadcast is not a table
// read and no policy is evaluated over it (P33 chose Broadcast partly for that reason -
// there is no change stream for a policy to be wrong about - and the price is that the
// referee must apply the rule itself).
//
// THREE THINGS ARE HIDDEN, and each is hidden for a different reason:
//
//   * ANOTHER PLAYER'S FORMATION AND STYLE. Chosen in the lobby (P19) precisely because
//     they shape all eleven picks, so a lobby that showed them would let the last person to
//     choose counter everyone else. This is why migration 0016 puts them in their own table
//     rather than on the member row: row-level security is row-level, and you cannot hide
//     two columns of a row somebody may read.
//   * ANOTHER PLAYER'S DEALS. A roll room's draft is blind in both directions.
//   * ANOTHER PLAYER'S XI, until the tie they play in has been simulated. After that it is
//     open, which is deliberate: the result screen shows both XIs side by side with the
//     ratings revealed (P38), and with one XI per room per player (P15) that means a
//     survivor's team is public to the room from round two. The ratings switch protects the
//     DRAFT, and nothing more.
//
// The clock is sent as REMAINING MILLISECONDS, never as a deadline (plan section 5). A
// phone whose clock is two minutes fast would otherwise be shown a window that expired
// before it opened.

import type { PvpRoom, RoomStatus } from '../../src/domain/pvpRoom';
import { deadlineOf } from '../../src/domain/pvpRoom';

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
  decided: string | null;
  events: unknown[];
  pens: unknown;
  stoppage: [number, number] | null;
  revealFrom: number | null;
  revealMs: number | null;
  winnerId: string | null;
}

export interface RoomView {
  code: string;
  visibility: 'public' | 'private';
  status: RoomStatus;
  hostId: string;
  size: number;
  round: number;
  championId: string | null;
  rules: { method: 'roll' | 'budget'; budget: number; years: readonly number[] };
  pickSeconds: number;
  showRatings: boolean;
  rerolls: number;
  members: MemberView[];
  /** The viewer's own draft. */
  you: {
    userId: string;
    /** slotId -> player id. Ids, not player objects: the client already holds the dataset,
     *  and sending eleven full players per broadcast to every member of an eight-player
     *  room is a lot of bytes to say nothing new. */
    xi: Record<string, string>;
    dealt: string[];
    rerollsLeft: number;
    budgetLeft: number;
    window: { ordinal: number; remainingMs: number } | null;
  } | null;
  /** Other players' XIs, once their tie has been played. */
  revealed: Record<string, Record<string, string>>;
  ties: TieView[];
  /** The server's own clock, so a client can tell how stale a payload it is holding is. */
  at: number;
}

const idsOf = (xi: Record<string, { id: string } | undefined> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(xi ?? {})
      .filter(([, p]) => !!p)
      .map(([slot, p]) => [slot, p!.id]),
  );

/** Whose XI is open: anybody who has played a tie. Read off the ties rather than off a
 *  status, so it says the same thing the database policy `pvp_tie_played` says. */
function playedIds(room: PvpRoom): Set<string> {
  const out = new Set<string>();
  for (const t of room.ties) {
    if (!t.result) continue;
    out.add(t.homeId);
    out.add(t.awayId);
  }
  return out;
}

export function roomView(
  room: PvpRoom,
  viewerId: string | null,
  now: number,
  budgetLeft: (userId: string) => number,
  rerollsLeft: (userId: string) => number,
): RoomView {
  const played = playedIds(room);
  const me = room.members.find((m) => m.userId === viewerId);
  const w = viewerId ? room.windows[viewerId] : undefined;

  return {
    code: room.code,
    visibility: room.visibility,
    status: room.status,
    hostId: room.hostId,
    size: room.size,
    round: room.round,
    championId: room.championId ?? null,
    rules: room.rules,
    pickSeconds: room.pickSeconds,
    showRatings: room.showRatings,
    rerolls: room.rerolls,
    members: room.members.map((m) => ({
      userId: m.userId,
      seat: m.seat,
      name: m.name,
      ready: m.ready,
      outIn: m.outIn ?? null,
      picked: Object.values(room.xi[m.userId] ?? {}).filter(Boolean).length,
      formationName: m.userId === viewerId || room.status !== 'lobby' ? m.formationName : null,
      style: m.userId === viewerId || room.status !== 'lobby' ? m.style : null,
    })),
    you: me
      ? {
          userId: me.userId,
          xi: idsOf(room.xi[me.userId]),
          dealt: [...(room.deals[me.userId] ?? [])],
          rerollsLeft: rerollsLeft(me.userId),
          budgetLeft: budgetLeft(me.userId),
          window: w ? { ordinal: w.ordinal, remainingMs: Math.max(0, deadlineOf(room, w) - now) } : null,
        }
      : null,
    revealed: Object.fromEntries(
      [...played].filter((id) => id !== viewerId).map((id) => [id, idsOf(room.xi[id])]),
    ),
    ties: room.ties.map((t) => ({
      round: t.round,
      game: t.game,
      homeId: t.homeId,
      awayId: t.awayId,
      homeGoals: t.result?.homeGoals ?? null,
      awayGoals: t.result?.awayGoals ?? null,
      decided: t.result?.decided ?? null,
      events: t.result?.events ?? [],
      pens: t.result?.pens ?? null,
      stoppage: t.stoppage ?? null,
      revealFrom: t.revealFrom ?? null,
      revealMs: t.revealMs ?? null,
      winnerId: t.winnerId ?? null,
    })),
    at: now,
  };
}
