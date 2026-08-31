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

import type { PvpRoom } from '../../src/domain/pvpRoom';
import { deadlineOf, draftDeadlineOf, draftSecondsOf, wholeDraft } from '../../src/domain/pvpRoom';
// The payload's SHAPE is shared with the client (`src/domain/pvpWire.ts`), so the two
// sides cannot describe it differently while both type-checking. The RULE about what a
// viewer may see stays here, where it is enforced.
import type { RoomView } from '../../src/domain/pvpWire';
export type { MemberView, RoomView, TieView } from '../../src/domain/pvpWire';

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
  const deadline = draftDeadlineOf(room);
  const me = room.members.find((m) => m.userId === viewerId);
  const w = viewerId ? room.windows[viewerId] : undefined;

  return {
    code: room.code,
    visibility: room.visibility,
    pace: room.pace,
    status: room.status,
    hostId: room.hostId,
    size: room.size,
    // The whole draft's clock (P52), and ONLY from a budget room: a roll room sends the
    // pick windows it has always sent, and a client that gets neither is talking to a
    // referee older than this, which is exactly what it is meant to conclude.
    draft: wholeDraft(room)
      ? {
          totalMs: draftSecondsOf(room) * 1000,
          remainingMs: deadline === null ? null : Math.max(0, deadline - now),
        }
      : null,
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
      done: m.done,
      outIn: m.outIn ?? null,
      picked: Object.values(room.xi[m.userId] ?? {}).filter(Boolean).length,
      formationName: m.userId === viewerId || room.status !== 'lobby' ? m.formationName : null,
      style: m.userId === viewerId || room.status !== 'lobby' ? m.style : null,
      // A practice opponent's shape is hidden in the lobby exactly as a person's is, by the
      // two lines above: it is decided when the host seats it, and a room that showed it
      // would let the last human to choose counter it (P19). Nothing about a bot is a
      // secret except the same thing everybody's is.
      bot: !!m.bot,
    })),
    you: me
      ? {
          userId: me.userId,
          xi: idsOf(room.xi[me.userId]),
          dealt: [...(room.deals[me.userId] ?? [])],
          rerollsLeft: rerollsLeft(me.userId),
          budgetLeft: budgetLeft(me.userId),
          // A DUEL SENDS NO TIME LEFT, because there is none to send: its window counts
          // the picks and deals the squads and never expires. Null rather than a large
          // number, so a screen draws no clock instead of a wrong one.
          window: w
            ? {
                ordinal: w.ordinal,
                remainingMs:
                  room.pace === 'async' ? null : Math.max(0, deadlineOf(room, w) - now),
              }
            : null,
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
