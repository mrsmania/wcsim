// Characterization checks for the referee: the room state machine (domain/pvpRoom.ts) and
// the caller rule (domain/pvpAuth.ts). Wave 1 of docs/pvp-plan.md.
//
// The claim this file has to earn is "a room cannot stall". Every check that walks a room
// forward does so by advancing `now` and calling `tickRoom` - never by waiting - which is
// the whole reason the deadlines are stored data rather than timers, and it is what lets a
// twenty-second clock be tested in microseconds.
//
// Two checks the plan names in its own done-when are here: a LATE pick is refused, at both
// clock lengths; and a request bearing the anon key is refused.

import { check, withSeed } from './harness';
import type { Player, Position } from '../../src/data/types';
import {
  autoCompleteXi,
  pvpTeam,
  pvpPriceOf,
  roomPlayers,
  roomSquads,
  validateXi,
  type RoomRules,
} from '../../src/domain/pvp';
import { BOT_SPEND, botXi } from '../../src/domain/pvpBot';
import type { Filled } from '../../src/domain/draft';
// The client's own move search, so a fixture asks for a rearrangement the same way a
// player's board does rather than inventing one the referee would never be sent.
import { planMove } from '../../src/domain/draft';
import { FORMATIONS_DATA, STYLES, getFormation } from '../../src/domain/formations';
import { resolveKoTie } from '../../src/domain/knockout';
import { xiStrength } from '../../src/domain/match';
import { verifyCaller } from '../../src/domain/pvpAuth';
// The one thing this file reads out of the VIEW rules: the sentence that states the duel's
// sending window. It is checked here rather than beside its neighbours because a deadline
// and the only sentence that mentions it are worth failing together - a window nobody is
// told about would be a worse bug than the one the window fixes.
import { sendWindowNote } from '../../src/domain/pvpView';
import type { RoomView } from '../../src/domain/pvpWire';
import {
  botsIn,
  humansIn,
  setBots,
  DRAFT_SLACK_MS,
  DUEL_IDLE_MS,
  duelSendDeadlineOf,
  LOBBY_IDLE_MS,
  leaveRoom,
  PICK_GRACE_MS,
  PICK_SECONDS,
  ROOM_IDLE_MS,
  SEEN_GONE_MS,
  roomClosed,
  DEFAULT_DRAFT_SECONDS,
  createRoom,
  deadlineOf,
  declaresDone,
  draftDeadlineOf,
  draftDone,
  formationOf,
  joinRoom,
  recoverFromOutage,
  reduceSize,
  remainingBudget,
  removeMember,
  rerollDeal,
  setDone,
  setLineup,
  movePlayers,
  setXi,
  startRoom,
  submitPick,
  tickRoom,
  wholeDraft,
  xiComplete,
  type PickSeconds,
  type PvpRoom,
  type RoomSize,
} from '../../src/domain/pvpRoom';

const BUDGET: RoomRules = { method: 'budget', budget: 110, years: [] };
const ROLL: RoomRules = { method: 'roll', budget: 0, years: [] };
const T0 = 1_000_000;
/** What an unset member drafts into, so the live-room vacuity guard names it once. */
const DEFAULT_FORMATION_FOR_CHECK = '4-3-3';

/** "Everybody stopped pinging a while ago", expressed as the rule plus a margin rather than
 *  as a number. A fixture that hardcodes a duration is a fixture that fails when the rule it
 *  is testing changes, which is backwards: three of these were a flat two minutes and went
 *  red when the lobby window widened from ninety seconds to five minutes. */
const GONE = T0 + SEEN_GONE_MS + 60_000;

function roomOf(size: RoomSize, rules: RoomRules, pickSeconds: PickSeconds = 20): PvpRoom {
  let room = createRoom({
    id: 'r1',
    code: 'AB12CD',
    hostId: 'u0',
    hostName: 'Host',
    visibility: 'private',
    size,
    rules,
    pickSeconds,
    hostBudget: rules.budget,
    now: T0,
  });
  for (let i = 1; i < size; i++) {
    room = joinRoom(room, { userId: `u${i}`, name: `P${i}`, budget: rules.budget }, T0).room;
  }
  return room;
}

/** Walk a room to its end by advancing the clock, never by waiting. `step` is well under
 *  a pick window so nothing is skipped over. */
function runToEnd(room: PvpRoom, from = T0, step = 5000, limit = 4000): { room: PvpRoom; ticks: number } {
  let r = room;
  let now = from;
  let ticks = 0;
  for (; ticks < limit && r.status !== 'ended'; ticks++) {
    now += step;
    r = tickRoom(r, now);
  }
  return { room: r, ticks };
}

/** The first legal pick a member could make, for the checks that need a real one. */
function firstLegalPick(room: PvpRoom, userId: string) {
  const m = room.members.find((x) => x.userId === userId)!;
  const f = formationOf(m);
  const filled = room.xi[userId] ?? {};
  const pool =
    room.rules.method === 'roll'
      ? roomPlayers(room.rules).filter((p) => p.squadId === room.deals[userId]?.slice(-1)[0])
      : roomPlayers(room.rules);
  // Skip anyone already in this XI: the cheapest man for two different slots is often
  // the SAME man, and a duplicate person is refused as illegal, so without this the
  // helper silently hands back picks that never land.
  const used = new Set(Object.values(filled).map((p) => p!.personId));
  const canFill = (position: string) =>
    pool
      .filter((p) => p.positions.includes(position as never) && !used.has(p.personId))
      .sort((a, b) => a.elo - b.elo)[0];
  // A SLOT THE DEALT SQUAD CAN ACTUALLY FILL, not simply the first empty one. In a roll
  // room the pool is one squad, and 345 of the (squad, position) pairs in the dataset are
  // empty - most 1970s squads list no wide midfielder at all - so taking the first open
  // slot hands back a pick with no player in it about a third of the time.
  const slot = f.slots.filter((s) => !filled[s.id]).find((s) => !!canFill(s.position))!;
  const player = canFill(slot.position)!;
  return { ordinal: room.windows[userId]!.ordinal, slotId: slot.id, player };
}

export function pvpRoomChecks(): void {
  // --- The caller rule (P34) -----------------------------------------------
  {
    const now = T0;
    const exp = Math.floor((now + 60_000) / 1000);
    const user = verifyCaller({ role: 'authenticated', sub: 'u1', exp }, now);
    // The anon key is a real, correctly signed token. It is refused on its ROLE, which is
    // the check a naive implementation omits and the one that lets the internet in.
    const anon = verifyCaller({ role: 'anon', exp }, now);
    const stale = verifyCaller({ role: 'authenticated', sub: 'u1', exp: Math.floor((now - 1000) / 1000) }, now);
    const wrongAud = verifyCaller({ role: 'authenticated', sub: 'u1', exp, aud: 'other' }, now, 'mine');
    check(
      'referee: a signed-in account is accepted and reports its own id',
      () => user.ok && user.userId === 'u1',
      () => JSON.stringify(user),
    );
    check(
      'referee: a request bearing the ANON KEY is refused, on its role',
      () => !anon.ok && anon.faults.includes('not-authenticated') && anon.faults.includes('no-subject'),
      () => JSON.stringify(anon),
    );
    check(
      'referee: an expired token is refused, and a wrong audience is refused',
      () => !stale.ok && stale.faults.includes('expired') && !wrongAud.ok && wrongAud.faults.includes('wrong-audience'),
      () => `${JSON.stringify(stale)} / ${JSON.stringify(wrongAud)}`,
    );
  }

  // --- The lobby -----------------------------------------------------------
  {
    const room = roomOf(2, BUDGET);
    const full = joinRoom(room, { userId: 'zz', name: 'Late', budget: 110 }, T0);
    const dupe = joinRoom(room, { userId: 'u0', name: 'Host again', budget: 110 }, T0);
    check(
      'room: a full room refuses a joiner, and nobody joins twice',
      () => full.outcome === 'full' && dupe.outcome === 'already-in' && room.members.length === 2,
      () => `${full.outcome} / ${dupe.outcome}`,
    );
  }

  {
    // Ready is a signal, not a lock (P48): the host may start regardless, and a player who
    // chose nothing still gets a legal shape.
    const room = roomOf(2, BUDGET);
    const started = startRoom(room, 'u0', T0);
    const unready = started.members.find((m) => m.userId === 'u1')!;
    check(
      'room: the host can start on a player who never readied, and that player still gets a legal formation',
      () =>
        started.status === 'drafting' &&
        !unready.ready &&
        formationOf(unready).slots.length === 11,
      () => `status ${started.status}, ready ${unready.ready}, slots ${formationOf(unready).slots.length}`,
    );
    check(
      'room: a non-host cannot start the room',
      () => startRoom(room, 'u1', T0).status === 'lobby',
    );
  }

  {
    // A host may shrink a room that will not fill, never grow it (P7).
    let room = roomOf(8, BUDGET);
    room.members = room.members.slice(0, 3);
    const down = reduceSize(room, 'u0', 4);
    const up = reduceSize(down, 'u0', 8);
    const tooFar = reduceSize(down, 'u0', 2);
    check(
      'room: the host can shrink 8 to 4, cannot grow back, and cannot shrink below the people seated',
      () => down.size === 4 && up.size === 4 && tooFar.size === 4,
      () => `${down.size} / ${up.size} / ${tooFar.size}`,
    );
  }

  // --- The pick clock ------------------------------------------------------
  for (const seconds of PICK_SECONDS) {
    const room = startRoom(roomOf(2, ROLL, seconds), 'u0', T0);
    const w = room.windows['u0']!;
    const req = firstLegalPick(room, 'u0');
    const inTime = submitPick(room, 'u0', req, deadlineOf(room, w) - 1);
    const late = submitPick(room, 'u0', req, deadlineOf(room, w) + PICK_GRACE_MS + 1);
    const grace = submitPick(room, 'u0', req, deadlineOf(room, w) + PICK_GRACE_MS - 1);
    check(
      `room: at ${seconds}s a pick inside the window is taken, one past the grace is LATE, and one inside the grace is taken`,
      () => inTime.outcome === 'ok' && late.outcome === 'late' && grace.outcome === 'ok',
      () => `${inTime.outcome} / ${late.outcome} / ${grace.outcome}`,
    );
    check(
      `room: at ${seconds}s a late pick changes nothing`,
      () => Object.keys(late.room.xi['u0'] ?? {}).length === 0,
      () => JSON.stringify(Object.keys(late.room.xi['u0'] ?? {})),
    );
  }

  {
    // THE CLOCK LENGTH IS REALLY READ, pinned against a wall-clock instant rather than
    // against each room's own deadline.
    //
    // The loop above covers both lengths and is not vacuous, but it is RELATIVE: it asks
    // each room to honour `deadlineOf`, and both sides of that comparison read
    // `room.pickSeconds`, so a bug that quietly gave every room twenty seconds would keep
    // them agreeing and pass. It was worth checking, because the host could not choose the
    // thirty-second clock at all until wave 9 - the create form sent a flat twenty - so
    // until then nothing outside this file had ever exercised the second value.
    //
    // 25 seconds in is past a twenty-second window and its 750ms grace, and comfortably
    // inside a thirty-second one.
    const at = T0 + 25_000;
    const short = startRoom(roomOf(2, ROLL, 20), 'u0', T0);
    const long = startRoom(roomOf(2, ROLL, 30), 'u0', T0);
    const a = submitPick(short, 'u0', firstLegalPick(short, 'u0'), at);
    const b = submitPick(long, 'u0', firstLegalPick(long, 'u0'), at);
    check(
      'room: one instant is LATE on a 20s clock and in time on a 30s one, so the length is read',
      () =>
        a.outcome === 'late' &&
        b.outcome === 'ok' &&
        // Vacuity: the same pick is taken by both rooms early on, so the difference above
        // is the clock and not the pick being illegal in one of them.
        submitPick(short, 'u0', firstLegalPick(short, 'u0'), T0 + 1000).outcome === 'ok' &&
        submitPick(long, 'u0', firstLegalPick(long, 'u0'), T0 + 1000).outcome === 'ok',
      () => `20s ${a.outcome} / 30s ${b.outcome}`,
    );
  }

  {
    // A retry that resends the ordinal already taken is a replay, not a second spent
    // window (P36). This is the flaky-mobile-link case.
    const room = startRoom(roomOf(2, ROLL), 'u0', T0);
    const req = firstLegalPick(room, 'u0');
    const first = submitPick(room, 'u0', req, T0 + 1000);
    const retry = submitPick(first.room, 'u0', req, T0 + 1200);
    check(
      'room: re-sending a pick already taken is a replay, and does not spend a second window',
      () =>
        first.outcome === 'ok' &&
        retry.outcome === 'replay' &&
        Object.keys(retry.room.xi['u0'] ?? {}).length === 1 &&
        retry.room.windows['u0']!.ordinal === 2,
      () => `${first.outcome} / ${retry.outcome}`,
    );
  }

  {
    // An illegal pick is treated as no pick (P43): the window keeps running, nothing is
    // forfeited, and the player may try again inside it.
    const room = startRoom(roomOf(2, ROLL), 'u0', T0);
    const m = room.members[0]!;
    const f = formationOf(m);
    const outfield = f.slots.find((s) => s.position !== 'GK')!;
    const keeper = roomPlayers(BUDGET).find(
      (p) => p.positions.includes('GK') && !p.positions.includes(outfield.position),
    )!;
    const bad = submitPick(
      room,
      'u0',
      { ordinal: 1, slotId: outfield.id, player: keeper },
      T0 + 1000,
    );
    const good = submitPick(bad.room, 'u0', firstLegalPick(bad.room, 'u0'), T0 + 2000);
    check(
      'room: an illegal pick is refused without ending the window, and a legal one still lands inside it',
      () =>
        bad.outcome === 'illegal' &&
        bad.room.windows['u0']!.ordinal === 1 &&
        good.outcome === 'ok',
      () => `${bad.outcome} then ${good.outcome}`,
    );
  }

  {
    // A re-roll does not restart the clock, or re-rolling is a way to stall for ever.
    const room = startRoom(roomOf(2, ROLL), 'u0', T0);
    const before = room.windows['u0']!.openedAt;
    const after = rerollDeal(room, 'u0', T0 + 5000);
    check(
      'room: a re-roll deals another squad and does NOT restart the pick clock',
      () =>
        after.windows['u0']!.openedAt === before &&
        (after.deals['u0']?.length ?? 0) > (room.deals['u0']?.length ?? 0),
      () => `openedAt ${after.windows['u0']!.openedAt} vs ${before}; deals ${after.deals['u0']?.length}`,
    );
  }

  // --- Nobody can stall a room ---------------------------------------------
  {
    // The plan's promise, end to end: eight players, not one of whom does anything at all.
    withSeed(20260826, () => {
      const room = startRoom(roomOf(8, BUDGET), 'u0', T0);
      const { room: done, ticks } = runToEnd(room);
      const allLegal = done.members.every((m) =>
        validateXi(formationOf(m), done.xi[m.userId] ?? {}, done.rules).ok,
      );
      check(
        `room: eight players who do NOTHING still reach a champion, all with legal XIs (${ticks} sweeps)`,
        () => done.status === 'ended' && !!done.championId && allLegal,
        () => `status ${done.status}, champion ${done.championId}, legal ${allLegal}`,
      );
      check(
        'room: an eight-player room plays 7 ties, and everyone but the champion goes out exactly once',
        () =>
          done.ties.length === 7 &&
          done.members.filter((m) => m.outIn !== undefined).length === 7,
        () => `${done.ties.length} ties, ${done.members.filter((m) => m.outIn !== undefined).length} eliminated`,
      );
    });
  }

  {
    // The TREE, which is what wave 7's bracket screen draws: every later round is made of
    // the round before it, so a player on the tree can be followed from their first tie to
    // the trophy. Nothing in the room enforces this directly - `drawRound` shuffles the
    // survivors - so it is a property to assert rather than a line to read.
    withSeed(778899, () => {
      const room = startRoom(roomOf(8, BUDGET), 'u0', T0);
      const { room: done } = runToEnd(room);
      const inRound = (r: number) =>
        done.ties.filter((t) => t.round === r).flatMap((t) => [t.homeId, t.awayId]);
      const wonRound = (r: number) =>
        done.ties.filter((t) => t.round === r).map((t) => t.winnerId!);
      const feedsForward = [1, 2].every(
        (r) => inRound(r + 1).slice().sort().join() === wonRound(r).slice().sort().join(),
      );
      check(
        'room: each round of an eight-player bracket is made of exactly the winners of the one before it',
        () =>
          // Vacuity: there really are three rounds of 4, 2 and 1 games to check.
          [4, 2, 1].every((n, i) => done.ties.filter((t) => t.round === i + 1).length === n) &&
          feedsForward &&
          // And the champion is the winner of the last one.
          done.championId === wonRound(3)[0] &&
          // Every game index within a round is distinct, or a tree would draw two boxes
          // over each other.
          [1, 2, 3].every((r) => {
            const games = done.ties.filter((t) => t.round === r).map((t) => t.game);
            return new Set(games).size === games.length;
          }),
        () =>
          `rounds ${[1, 2, 3].map((r) => done.ties.filter((t) => t.round === r).length).join('/')}, feeds ${feedsForward}`,
      );
    });
  }

  {
    // The draw is random, not by seat (P47). The same eight seats, drawn many times, must
    // not always produce the same first-round pairing - which is what stops two people
    // sharing a code from arranging the tree by agreeing who joins first.
    const pairings = new Set<string>();
    withSeed(4242, () => {
      for (let i = 0; i < 60; i++) {
        const room = startRoom(roomOf(8, BUDGET), 'u0', T0);
        const { room: done } = runToEnd(room);
        const first = done.ties
          .filter((t) => t.round === 1)
          .map((t) => [t.homeId, t.awayId].sort().join('v'))
          .sort()
          .join(',');
        pairings.add(first);
      }
    });
    check(
      `room: the first-round draw is random, not seat order (${pairings.size} different draws over 60 rooms)`,
      () => pairings.size > 5,
      () => `only ${pairings.size} distinct draws`,
    );
  }

  {
    // Nothing is paired until EVERY draft is finished (P47). One player picking fast must
    // not get their tie played while somebody else is still drafting.
    withSeed(9, () => {
      let room = startRoom(roomOf(4, ROLL), 'u0', T0);
      // Three players complete their XIs by hand; the fourth does nothing.
      for (const id of ['u0', 'u1', 'u2']) {
        for (let i = 0; i < 11; i++) {
          const r = submitPick(room, id, firstLegalPick(room, id), T0 + 1000);
          room = r.room;
        }
      }
      const swept = tickRoom(room, T0 + 2000);
      check(
        'room: three finished drafts do not start a round while the fourth player is still drafting',
        () =>
          ['u0', 'u1', 'u2'].every((id) => xiComplete(room, room.members.find((m) => m.userId === id)!)) &&
          swept.status === 'drafting' &&
          swept.ties.length === 0,
        () => `status ${swept.status}, ties ${swept.ties.length}`,
      );
    });
  }

  // --- Surviving an outage (P45) -------------------------------------------
  {
    const room = startRoom(roomOf(2, ROLL, 20), 'u0', T0);
    // The referee dies 5s into the window and comes back 45s later. Without recovery the
    // first sweep is already past every deadline and auto-picks for everybody at once.
    const deathAt = T0 + 5000;
    const backAt = deathAt + 45_000;
    const naive = tickRoom(room, backAt);
    const recovered = tickRoom(recoverFromOutage(room, deathAt, backAt), backAt);
    check(
      'referee: WITHOUT outage recovery, returning from a 45s restart auto-picks for everyone at once',
      () => Object.keys(naive.xi['u0'] ?? {}).length > 0,
      () => `${Object.keys(naive.xi['u0'] ?? {}).length} slots filled`,
    );
    check(
      'referee: WITH it, an open window survives the restart and nobody is picked for',
      () =>
        Object.keys(recovered.xi['u0'] ?? {}).length === 0 &&
        recovered.windows['u0']!.ordinal === 1,
      () => `${Object.keys(recovered.xi['u0'] ?? {}).length} slots filled`,
    );
    check(
      'referee: a window reopens with the time it had LEFT, not a full one',
      () => {
        // Five seconds were used before the outage, so five seconds are still gone.
        const w = recoverFromOutage(room, deathAt, backAt).windows['u0']!;
        return backAt - w.openedAt === deathAt - T0;
      },
      () => `${backAt - recoverFromOutage(room, deathAt, backAt).windows['u0']!.openedAt}ms elapsed, expected ${deathAt - T0}`,
    );
    check(
      'referee: a window that had ALREADY run out before the crash is not resurrected by the recovery',
      () => {
        // Died 30s into a 20s window, so it was already over. It must come back expired,
        // for the sweeper to fill on its next pass - not handed back as time to think.
        const late = recoverFromOutage(room, T0 + 30_000, T0 + 80_000);
        const w = late.windows['u0']!;
        return T0 + 80_000 >= deadlineOf(late, w);
      },
      () => 'the expired window came back with time left on it',
    );
    check(
      'referee: repeated restarts preserve the remainder rather than accumulating it',
      () => {
        // Three crashes in a row, each 5s into what is left. The player should still have
        // had exactly 5s used in total, not 15.
        let r = recoverFromOutage(room, T0 + 5000, T0 + 20_000);
        r = recoverFromOutage(r, T0 + 20_000, T0 + 40_000);
        r = recoverFromOutage(r, T0 + 40_000, T0 + 60_000);
        return T0 + 60_000 - r.windows['u0']!.openedAt === 5000;
      },
      () => 'the used time drifted across restarts',
    );
    check(
      'referee: a heartbeat from the future (a clock that went backwards) changes nothing',
      () => recoverFromOutage(room, backAt + 60_000, backAt).windows['u0']!.openedAt === T0,
    );
  }

  // --- The budget, through a whole draft -----------------------------------
  {
    withSeed(31, () => {
      const tight: RoomRules = { ...BUDGET, budget: 11 };
      const room = startRoom(roomOf(2, tight), 'u0', T0);
      const { room: done } = runToEnd(room);
      const over = done.members.filter(
        (m) => validateXi(formationOf(m), done.xi[m.userId] ?? {}, tight).cost > m.budget,
      );
      check(
        'room: a whole auto-played draft at $1 a slot never overspends the budget',
        () => done.status === 'ended' && over.length === 0,
        () => `${over.length} members over budget`,
      );
      check(
        'room: remaining budget falls as slots fill, and never below zero',
        () => done.members.every((m) => remainingBudget(done, m.userId) >= 0),
        () => done.members.map((m) => remainingBudget(done, m.userId)).join(','),
      );
    });
  }

  // --- A roll room ---------------------------------------------------------
  {
    withSeed(77, () => {
      const room = startRoom(roomOf(2, ROLL), 'u0', T0);
      const { room: done } = runToEnd(room);
      const legal = done.members.every((m) =>
        validateXi(formationOf(m), done.xi[m.userId] ?? {}, ROLL, done.deals[m.userId]).ok,
      );
      check(
        'room: a roll room auto-plays to a champion, and every XI is from squads that player was dealt',
        () => done.status === 'ended' && legal,
        () => `status ${done.status}, legal ${legal}`,
      );
      check(
        'room: each player got their OWN deals, one at a time',
        () =>
          (done.deals['u0']?.length ?? 0) > 1 &&
          done.deals['u0']!.join(',') !== done.deals['u1']!.join(','),
        () => `u0 ${done.deals['u0']?.length}, u1 ${done.deals['u1']?.length}`,
      );
    });
  }

  {
    // A roll room in the NARROWEST pool a host can set: one tournament. This is where a
    // room could stall, and mutation testing is what found it - the dealt squad can have
    // nobody for any slot still open, and without a guarantee of progress the next sweep
    // faces the same squad for ever. Every single-cup roll room must still finish.
    const years = [...new Set(roomPlayers({ method: 'roll', budget: 0, years: [] }).map((p) => Number(p.squadId.slice(-4))))];
    let finished = 0;
    let attempted = 0;
    withSeed(555, () => {
      for (const year of years) {
        const rules: RoomRules = { method: 'roll', budget: 0, years: [year] };
        attempted++;
        const { room: done } = runToEnd(startRoom(roomOf(2, rules), 'u0', T0));
        if (done.status === 'ended' && done.members.every((m) => xiComplete(done, m))) finished++;
      }
    });
    check(
      `room: a roll room drawing from ONE tournament always finishes (${finished}/${attempted} cups)`,
      () => attempted > 5 && finished === attempted,
      () => `${finished} of ${attempted} finished`,
    );
  }

  {
    // The exact state a roll room gets stuck in, built from a REAL gap in the dataset:
    // 345 of the (squad, position) pairs have nobody at all, because most 1970s squads
    // list no wide midfielder. Fill everything except one such slot, deal that squad, and
    // the auto-pick has nothing to give. Mutation testing found this hole; it is
    // constructed rather than waited for, because a rare state nobody asserts is a rare
    // state nobody has checked.
    withSeed(808, () => {
      const room0 = startRoom(roomOf(2, ROLL), 'u0', T0);
      const m = room0.members.find((x) => x.userId === 'u0')!;
      const f = formationOf(m);
      // A squad, and a slot of this formation it cannot fill.
      let stuckSquad: string | null = null;
      let stuckSlot: string | null = null;
      for (const sq of roomSquads(ROLL)) {
        const slot = f.slots.find((sl) => !sq.players.some((p) => p.positions.includes(sl.position)));
        if (slot) {
          stuckSquad = sq.id;
          stuckSlot = slot.id;
          break;
        }
      }
      // Everything placed must come from that same squad, or the starting state is one
      // the referee would already refuse and the check would be testing its own setup.
      const squadPlayers = roomSquads(ROLL).find((sq) => sq.id === stuckSquad)!.players;
      const used = new Set<string>();
      const filled: Filled = {};
      for (const slot of f.slots) {
        if (slot.id === stuckSlot) continue;
        const p = squadPlayers.find(
          (c) => c.positions.includes(slot.position) && !used.has(c.personId),
        );
        if (!p) continue;
        used.add(p.personId);
        filled[slot.id] = p;
      }
      const room: PvpRoom = {
        ...room0,
        xi: { ...room0.xi, u0: filled },
        deals: { ...room0.deals, u0: [stuckSquad!] },
      };
      let r = room;
      for (let i = 0; i < 6 && !xiComplete(r, r.members.find((x) => x.userId === 'u0')!); i++) {
        r = tickRoom(r, T0 + 60_000 + i * 30_000);
      }
      const done = r.members.find((x) => x.userId === 'u0')!;
      check(
        'room: a roll room whose dealt squad cannot fill the last slot fills it anyway, rather than stalling',
        () => !!stuckSquad && !!stuckSlot && xiComplete(r, done),
        () => `${stuckSquad} cannot fill ${stuckSlot}; ended ${Object.keys(r.xi['u0'] ?? {}).length}/${f.slots.length}`,
      );
      check(
        'room: and the XI it produced is still one the referee accepts, because the squad it reached for was recorded as dealt',
        () => validateXi(f, r.xi['u0'] ?? {}, ROLL, r.deals['u0']).ok,
        () => validateXi(f, r.xi['u0'] ?? {}, ROLL, r.deals['u0']).faults.join(', '),
      );
    });
  }

  {
    // The property that keeps the stuck-room fallback dormant, asserted so that a future
    // tournament cannot quietly make it live. Every cup a host can pick as a one-cup roll
    // room must hold, somewhere among its squads, a player for every position any
    // formation asks for. It is a fact about the DATA rather than the code: 345 of the
    // (squad, position) pairs in the dataset are already empty, and it is only because no
    // whole CUP is short of a position that a single-cup roll room always converges.
    const years = [...new Set(roomSquads({ method: 'roll', budget: 0, years: [] }).map((sq) => sq.year))];
    const positions = new Set(
      FORMATIONS_DATA.names.flatMap((n) =>
        STYLES.flatMap((st) => getFormation(n, st)?.slots.map((sl) => sl.position) ?? []),
      ),
    );
    const gaps: string[] = [];
    for (const year of years) {
      const squads = roomSquads({ method: 'roll', budget: 0, years: [year] });
      for (const pos of positions) {
        if (!squads.some((sq) => sq.players.some((p) => p.positions.includes(pos)))) {
          gaps.push(`${year} has no ${pos}`);
        }
      }
    }
    check(
      `room: every one of the ${years.length} cups can fill all ${positions.size} positions, so a single-cup roll room always converges`,
      () => years.length > 5 && positions.size === 12 && gaps.length === 0,
      () => gaps.join('; '),
    );
  }

  {
    // AND THE SAME PROPERTY ONE LEVEL DOWN: every squad a room actually DEALS has somebody
    // in it for a slot that is still open.
    //
    // This is what the room offers INSTEAD of a per-pick Skip (roadmap item 44, closed by
    // decision 2026-09-03): a player never has to sit out a window they can do nothing with,
    // because the deal will not hand them a dead squad, and "I can do something here but I
    // do not fancy it" is what the re-rolls are for. That makes it load-bearing rather than
    // incidental - if a future change to `pickFrom` let a dead squad through, the escape
    // hatch it used to have has been deliberately taken away.
    //
    // The narrow pools are the point: with 416 squads the preference never has to work
    // hard, and a host may pick a single cup of sixteen.
    const pools: [string, number[]][] = [
      ['every cup', []],
      ['1970 only', [1970]],
      ['1974 only', [1974]],
      ['2026 only', [2026]],
    ];
    let dealsSeen = 0;
    let lastSlotDeals = 0;
    let dead = 0;
    /** How often a squad drawn with NO preference would have been dead. The discrimination
     *  guard: without it this check passes on a dataset where every squad fills every
     *  position, and would say nothing about `pickFrom` doing any work at all. */
    let deadIfBlind = 0;
    const examples: string[] = [];
    withSeed(4477, () => {
      for (const [label, years] of pools) {
        const rules: RoomRules = { method: 'roll', budget: 0, years };
        const squads = roomSquads(rules);
        /** How many squads in this pool hold anybody for a position. Used to fill the
         *  COMMON slots first, which deliberately leaves the rare ones open longest - the
         *  hard case, and the only one where the deal's preference has anything to do. A
         *  draft that fills slots in formation order never reaches it. */
        const supply = (pos: Position) =>
          squads.filter((sq) => sq.players.some((p) => p.positions.includes(pos))).length;
        for (let n = 0; n < 40; n++) {
          const name = FORMATIONS_DATA.names[n % FORMATIONS_DATA.names.length]!;
          const styles = FORMATIONS_DATA.stylesByName[name]!;
          let room = roomOf(2, rules);
          for (const m of room.members) {
            room = setLineup(room, m.userId, name, styles[n % styles.length]!, true);
          }
          room = startRoom(room, 'u0', T0);
          for (let i = 0; i < 11 && room.windows.u0; i++) {
            const me = room.members.find((m) => m.userId === 'u0')!;
            const f = formationOf(me);
            const filled = room.xi.u0 ?? {};
            const open = f.slots.filter((s) => !filled[s.id]);
            const used = new Set(Object.values(filled).map((p) => p!.personId));
            const fits = (sq: (typeof squads)[number]) =>
              sq.players.some(
                (p) =>
                  !used.has(p.personId) && open.some((s) => p.positions.includes(s.position)),
              );
            const dealtId = room.deals.u0?.[room.deals.u0.length - 1] ?? '';
            const dealtSquad = squads.find((sq) => sq.id === dealtId);
            dealsSeen++;
            if (open.length === 1) lastSlotDeals++;
            if (!dealtSquad || !fits(dealtSquad)) {
              dead++;
              if (examples.length < 4) {
                examples.push(`${label}: ${dealtId} with ${open.map((s) => s.position).join('/')} open`);
              }
              break;
            }
            if (!squads.every(fits)) deadIfBlind++;
            // The most COMMON open slot this squad can fill, so the rare ones are still
            // open at the end.
            const pool = roomPlayers(rules).filter((p) => p.squadId === dealtId);
            const target = open
              .filter((s) => pool.some((p) => p.positions.includes(s.position) && !used.has(p.personId)))
              .sort((a, b) => supply(b.position) - supply(a.position))[0]!;
            const player = pool.find(
              (p) => p.positions.includes(target.position) && !used.has(p.personId),
            )!;
            room = submitPick(
              room,
              'u0',
              { ordinal: room.windows.u0!.ordinal, slotId: target.id, player },
              T0 + i * 1000,
            ).room;
          }
        }
      }
    });
    check(
      `room: all ${dealsSeen} dealt squads had somebody for a slot still open, so no window is ever a dead one`,
      () =>
        dead === 0 &&
        // Vacuity: the sample is real, and it reaches the hardest case - one slot left,
        // where the squad has to hold that single position.
        dealsSeen > 1000 &&
        lastSlotDeals > 100 &&
        // Discrimination: an unfussy draw really would have handed out dead squads, so the
        // deal's preference is doing the work rather than the dataset making it free.
        deadIfBlind > 0,
      () =>
        dead
          ? examples.join('; ')
          : `${dealsSeen} deals, ${lastSlotDeals} at the last slot, ${deadIfBlind} would have been dead unpicked`,
    );
  }

  // --- The reveal window (P30) ---------------------------------------------
  {
    withSeed(1234, () => {
      const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
      const { room: done } = runToEnd(room);
      const tie = done.ties[0]!;
      check(
        'room: a tie carries the added time and a reveal window, both decided by the server',
        () =>
          !!tie.stoppage &&
          tie.stoppage.length === 2 &&
          (tie.revealMs ?? 0) > 0 &&
          (tie.revealFrom ?? 0) > 0,
        () => JSON.stringify({ stoppage: tie.stoppage, revealMs: tie.revealMs }),
      );
      check(
        'room: a tie that went to penalties reveals for longer than one that did not',
        () => {
          const lengths = new Map<string, number[]>();
          for (let i = 0; i < 40; i++) {
            const r = runToEnd(startRoom(roomOf(2, BUDGET), 'u0', T0)).room;
            for (const t of r.ties) {
              if (!t.result) continue;
              (lengths.get(t.result.decided) ?? lengths.set(t.result.decided, []).get(t.result.decided)!).push(t.revealMs ?? 0);
            }
          }
          const reg = lengths.get('reg') ?? [];
          const pens = lengths.get('pens') ?? [];
          if (!reg.length || !pens.length) return false;
          const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
          return avg(pens) > avg(reg);
        },
      );
    });
  }

  // --- P31's LIFECYCLE: a room nobody is in has to end -----------------------
  // The failure this exists against is not exotic and it is what kills the PUBLIC half of
  // the feature: closing a tab fires no reliable event, so a room whose host shut their
  // laptop sits in the lobby list at 3 of 8 for ever, and a list of dead rooms is
  // indistinguishable from a list nobody uses. Every rule here is evaluated by the same
  // stateless sweeper that runs the pick clock, so nothing is held in memory anywhere.
  {
    const lobby = roomOf(4, BUDGET);
    // Nobody has pinged since kickoff, and this is a minute past the rule for all four.
    // DERIVED, not a literal: these fixtures were written as a flat two minutes, which was
    // comfortably past a ninety-second rule and inside the five-minute one it became, so
    // widening the window turned three checks red for no reason but the number.
    const gone = tickRoom(lobby, GONE);
    check(
      'room: a lobby everybody has walked away from CLOSES, and closing is "ended with nobody having won"',
      () =>
        // Vacuity: the same room one second in is untouched, so this is the timeout and
        // not something that was always true.
        tickRoom(lobby, T0 + 1000) === lobby &&
        gone.status === 'ended' &&
        !gone.championId &&
        roomClosed(gone) &&
        // And a room that was actually WON is not "closed", or the screens would tell a
        // champion their room shut.
        !roomClosed({ status: 'ended', championId: 'u0' }),
      () => `${gone.status} / champion ${gone.championId ?? 'none'}`,
    );
  }

  {
    // A PHONE SCREEN LOCK IS NOT LEAVING, and this fixture IS the reported bug.
    //
    // 2026-08-27: a host opened a room of four on a phone, joined it from a laptop as the
    // second player, and the phone slept while he did. The liveness rule then took the seat
    // in the room he had opened himself - and being host is no protection, because the host
    // is promoted away rather than spared. A locked phone runs no JavaScript, so the ping
    // stops, and the LOBBY is the one phase whose entire activity is waiting for other
    // people to arrive: the rule was at its most aggressive in the situation it was least
    // entitled to judge.
    //
    // Two minutes is a screen lock plus a glance away. The window was ninety seconds, so
    // this check goes red against the old value.
    const lobby = roomOf(4, BUDGET);
    const after = tickRoom(lobby, T0 + 120_000);
    check(
      'room: a lobby seat survives two minutes of silence, because a sleeping phone is not a closed tab',
      () =>
        after.members.length === 4 &&
        after.status === 'lobby' &&
        after.hostId === 'u0' &&
        // Vacuity: the rule still bites eventually. Without this the check would pass just
        // as well if liveness had been deleted altogether.
        tickRoom(lobby, GONE).status === 'ended',
      () => `${after.members.length} members, status ${after.status}, host ${after.hostId}`,
    );
  }

  {
    // The host goes and the room does NOT die with them (P31): the next seat is promoted.
    // Their three friends are still here, which is the whole reason to promote rather than
    // close.
    const lobby = roomOf(4, BUDGET);
    const late = GONE;
    const stillHere: PvpRoom = {
      ...lobby,
      members: lobby.members.map((m) =>
        m.userId === 'u0' ? m : { ...m, lastSeen: late - 1000 },
      ),
    };
    const after = tickRoom(stillHere, late);
    check(
      'room: a lobby whose HOST went promotes the next seat and stays open',
      () =>
        // Vacuity: the host really was the one who left.
        stillHere.hostId === 'u0' &&
        after.status === 'lobby' &&
        after.hostId === 'u1' &&
        after.members.length === 3 &&
        !after.members.some((m) => m.userId === 'u0'),
      () => `host ${after.hostId}, ${after.members.length} left, status ${after.status}`,
    );
  }

  {
    // Dropping somebody leaves a SEAT GAP on purpose, and a newcomer must not reuse the
    // number: `pvp_members` has a unique index on (room, seat), so counting members would
    // hand out a seat somebody else still holds. Seats decide nothing (P47).
    const lobby = roomOf(4, BUDGET);
    const late = GONE;
    // u1 (seat 1) goes; the other three are here.
    const one: PvpRoom = {
      ...lobby,
      members: lobby.members.map((m) =>
        m.userId === 'u1' ? m : { ...m, lastSeen: late - 1000 },
      ),
    };
    const after = tickRoom(one, late);
    const joined = joinRoom(after, { userId: 'u9', name: 'New', budget: 110 }, late).room;
    const seats = joined.members.map((m) => m.seat);
    check(
      'room: a dropped member leaves a seat gap, and the next joiner takes a FREE number rather than the member count',
      () =>
        // Vacuity: there really is a gap (0, 2, 3) before the join.
        after.members.map((m) => m.seat).join() === '0,2,3' &&
        joined.members.length === 4 &&
        new Set(seats).size === seats.length &&
        Math.max(...seats) === 4,
      () => `seats ${seats.join(',')}`,
    );
  }

  {
    // A lobby nobody has TOUCHED for a quarter of an hour is not going to fill, even if
    // everybody in it is still pinging away.
    const lobby = roomOf(2, BUDGET);
    const late = T0 + LOBBY_IDLE_MS + 1000;
    const pinging: PvpRoom = {
      ...lobby,
      members: lobby.members.map((m) => ({ ...m, lastSeen: late })),
    };
    check(
      'room: a lobby untouched for fifteen minutes closes, however alive the people in it are',
      () =>
        // Vacuity: with the same pings a minute in, nothing happens.
        tickRoom({ ...pinging, touchedAt: late - 60_000 }, late).status === 'lobby' &&
        tickRoom(pinging, late).status === 'ended',
      () => tickRoom(pinging, late).status,
    );
  }

  {
    // And half an hour of nothing closes a room in ANY phase, which is the backstop under
    // all of the above.
    withSeed(31, () => {
      const drafting = startRoom(roomOf(2, BUDGET), 'u0', T0);
      const late = T0 + ROOM_IDLE_MS + 1000;
      const closed = tickRoom(drafting, late);
      check(
        'room: half an hour of nothing closes a room whatever phase it is in',
        () =>
          // Vacuity: at twenty-nine minutes it is NOT closed. It is not still drafting
          // either - the draft's own hard bound is four and a half minutes, so by then it
          // has been force-completed and is playing - and that is the point: this rule is
          // the backstop UNDER the others, so the thing to assert is that it had not
          // already fired.
          tickRoom(drafting, T0 + ROOM_IDLE_MS - 60_000).status !== 'ended' &&
          closed.status === 'ended' &&
          roomClosed(closed),
        () => closed.status,
      );
    });
  }

  {
    // The draft's HARD BOUND (P31). The per-window auto-pick already finishes a draft, so
    // this is the second answer for a room that somehow does not - and a room stuck in the
    // one phase built to be unstallable is the worst outcome available.
    withSeed(77, () => {
      // A ROLL room, because windows are what this freezes and a budget room has none
      // (P52): its one clock is `draftDeadlineOf`, which cannot be frozen and so cannot
      // leave the hard bound as the only thing left.
      const drafting = startRoom(roomOf(2, ROLL), 'u0', T0);
      // Frozen windows: opened in the far future, so no deadline can ever pass and the
      // ordinary one-slot-per-sweep path cannot fire at all. That is what leaves the hard
      // bound as the only thing that can move this room.
      const frozen: PvpRoom = {
        ...drafting,
        windows: Object.fromEntries(
          Object.entries(drafting.windows).map(([k, w]) => [
            k,
            w ? { ...w, openedAt: T0 + 1_000_000_000 } : w,
          ]),
        ),
      };
      const at = T0 + 11 * 20_000 + DRAFT_SLACK_MS + 1000;
      const forced = tickRoom(frozen, at);
      const legal = forced.members.every(
        (m) => validateXi(formationOf(m), forced.xi[m.userId] ?? {}, forced.rules).ok,
      );
      check(
        'room: past eleven windows plus slack a stuck draft is force-completed with legal XIs and the bracket is drawn',
        () =>
          // Vacuity: a sweep just before the bound leaves it drafting with nothing filled,
          // because the frozen windows mean the ordinary path does nothing.
          tickRoom(frozen, at - 5000).status === 'drafting' &&
          Object.keys(tickRoom(frozen, at - 5000).xi['u0'] ?? {}).length === 0 &&
          forced.status === 'round' &&
          forced.ties.length === 1 &&
          forced.members.every((m) => xiComplete(forced, m)) &&
          legal,
        () => `status ${forced.status}, ties ${forced.ties.length}, legal ${legal}`,
      );
    });
  }

  {
    // AND NOBODY IS DROPPED PAST THE START. A player who closes their laptop mid-draft has
    // their XI completed and it plays on without them: the alternative is one absent person
    // voiding a tournament seven other people are in.
    withSeed(78, () => {
      const drafting = startRoom(roomOf(4, BUDGET), 'u0', T0);
      const silent: PvpRoom = {
        ...drafting,
        members: drafting.members.map((m) => ({ ...m, lastSeen: T0 })),
      };
      const after = tickRoom(silent, GONE);
      check(
        'room: a player who goes silent mid-DRAFT keeps their seat, where the same silence in a lobby loses it',
        () =>
          after.members.length === 4 &&
          // Vacuity: the identical silence in a lobby does drop them.
          tickRoom({ ...silent, status: 'lobby' }, GONE).status === 'ended',
        () => `${after.members.length} members, status ${after.status}`,
      );
    });
  }

  // --- LEAVING, FOR REAL (the reported bug) ---------------------------------
  // It used to be a navigation and nothing else: the local pointer was cleared, the seat
  // was not, and `activeRoomOf` then refused the player their next room with "you are
  // already in a room" until the liveness sweep noticed ninety seconds later.
  {
    const lobby = roomOf(4, BUDGET);
    const gone = leaveRoom(lobby, 'u2', T0 + 1000);
    check(
      'room: leaving a LOBBY gives the seat up, and the seat is free for somebody else',
      () =>
        // Vacuity: they really were in it.
        lobby.members.some((m) => m.userId === 'u2') &&
        gone.status === 'lobby' &&
        gone.members.length === 3 &&
        !gone.members.some((m) => m.userId === 'u2') &&
        // And the room can be filled again, which is the point of freeing it.
        joinRoom(gone, { userId: 'u9', name: 'New', budget: 110 }, T0 + 2000).outcome === 'ok',
      () => `${gone.members.length} left: ${gone.members.map((m) => m.userId).join(',')}`,
    );
  }

  {
    // The host leaving is the same rule the liveness sweep keeps, and it has to be: a lobby
    // that promotes one way and closes the other is two rules wearing one name.
    const lobby = roomOf(4, BUDGET);
    const gone = leaveRoom(lobby, 'u0', T0 + 1000);
    // And the last person out closes it.
    let one = lobby;
    for (const id of ['u0', 'u1', 'u2']) one = leaveRoom(one, id, T0 + 1000);
    const empty = leaveRoom(one, 'u3', T0 + 2000);
    check(
      'room: the HOST leaving promotes the next seat, and the last person out closes the room',
      () =>
        lobby.hostId === 'u0' &&
        gone.status === 'lobby' &&
        gone.hostId === 'u1' &&
        // Vacuity: the intermediate room really did still have somebody in it.
        one.status === 'lobby' &&
        one.members.length === 1 &&
        empty.status === 'ended' &&
        roomClosed(empty),
      () => `host ${gone.hostId}; last ${empty.status}`,
    );
  }

  {
    // AND IT IS A NO-OP ONCE THE FOOTBALL HAS STARTED, by the same reasoning that stops the
    // liveness sweep dropping anybody past the lobby: an XI is in a bracket other people
    // are playing, so there is nothing to remove without voiding their tournament. Identity
    // is the test, because that is what tells the store there is nothing to write.
    withSeed(88, () => {
      const drafting = startRoom(roomOf(4, BUDGET), 'u0', T0);
      const { room: ended } = runToEnd(drafting);
      check(
        'room: leaving is a no-op once a room has started, and after it has finished',
        () =>
          // Vacuity: the identical call on the lobby it came from DOES remove them.
          leaveRoom(roomOf(4, BUDGET), 'u2', T0 + 1000).members.length === 3 &&
          leaveRoom(drafting, 'u2', T0 + 1000) === drafting &&
          leaveRoom(ended, 'u2', T0 + 1000) === ended &&
          // Somebody who was never in it changes nothing either.
          leaveRoom(roomOf(4, BUDGET), 'nobody', T0 + 1000) instanceof Object &&
          leaveRoom(roomOf(2, BUDGET), 'nobody', T0 + 1000).members.length === 2,
        () => `drafting ${leaveRoom(drafting, 'u2', T0 + 1000) === drafting}`,
      );
    });
  }

  removeChecks();
  duelLeaveChecks();
  botChecks();
}

/** A four-seat lobby with two chairs still empty, so a practice opponent can be seated in
 *  one: `roomOf` fills every seat, and `setBots` refuses a room with nowhere to put them. */
function halfFullLobby(): PvpRoom {
  const room = createRoom({
    id: 'r8',
    code: 'HALF01',
    hostId: 'u0',
    hostName: 'Host',
    visibility: 'private',
    size: 4,
    rules: BUDGET,
    pickSeconds: 20,
    hostBudget: BUDGET.budget,
    now: T0,
  });
  return joinRoom(room, { userId: 'u1', name: 'P1', budget: BUDGET.budget }, T0).room;
}

/** Predictable bot ids, so a fixture can find the seat it has just made. */
function botIds(): () => string {
  let n = 0;
  return () => `bot-${++n}`;
}

/** A duel with nobody in it but its host. */
const duelRoom = (): PvpRoom =>
  createRoom({
    id: 'r7',
    code: 'DU9001',
    hostId: 'u0',
    hostName: 'Host',
    visibility: 'private',
    size: 2,
    rules: BUDGET,
    pickSeconds: 20,
    hostBudget: BUDGET.budget,
    pace: 'async',
    now: T0,
  });

/**
 * THE HOST THROWING SOMEBODY OUT, and the one thing that makes it worth a button.
 *
 * A removal that did not stick would be indistinguishable from a working one for about two
 * seconds, which is the whole reason this needs checking at all: arriving at a room is
 * taking the seat, so the removed player's own screen re-joins on its next read. Every
 * assertion below is either "the seat went", which a screen would show correctly either
 * way, or "and they cannot come back", which is the half nothing else can see.
 */
function removeChecks(): void {
  {
    const lobby = roomOf(4, BUDGET);
    const gone = removeMember(lobby, 'u0', 'u2', T0 + 1000);
    const backAgain = joinRoom(gone, { userId: 'u2', name: 'P2', budget: 110 }, T0 + 2000);
    const somebodyElse = joinRoom(gone, { userId: 'u9', name: 'New', budget: 110 }, T0 + 2000);
    check(
      'room: the host removes a member, the seat frees, and THEY cannot walk back in',
      () =>
        // Vacuity: they were in it, and the seat really is free afterwards - so the
        // refusal below is about the person rather than about a full room.
        lobby.members.some((m) => m.userId === 'u2') &&
        gone.status === 'lobby' &&
        gone.members.length === 3 &&
        !gone.members.some((m) => m.userId === 'u2') &&
        gone.removed.includes('u2') &&
        // The half that matters. And it is not a refusal of everybody: the chair the
        // removal freed is still a chair.
        backAgain.outcome === 'removed' &&
        backAgain.room === gone &&
        somebodyElse.outcome === 'ok',
      () => `${backAgain.outcome} / ${somebodyElse.outcome} / removed ${gone.removed.join(',')}`,
    );
  }

  {
    // REFUSED BEFORE THE SEAT COUNT IS EVEN LOOKED AT, which is not the claim above: there
    // the chair was free. A removed player must get the same answer whether or not somebody
    // has since taken the seat, or the refusal would come and go as other people arrive and
    // leave - and "the room is full" is a thing to wait out rather than a decision somebody
    // made about you.
    const gone = removeMember(roomOf(4, BUDGET), 'u0', 'u2', T0 + 1000);
    const refilled = joinRoom(gone, { userId: 'u9', name: 'New', budget: 110 }, T0 + 2000).room;
    const asRemoved = joinRoom(refilled, { userId: 'u2', name: 'P2', budget: 110 }, T0 + 3000);
    check(
      'room: a removed player is refused for being removed, not for the room being full',
      () =>
        // Vacuity: the room really is full again, so `full` is what the seat count alone
        // would answer - which is exactly what this rules out.
        refilled.members.length === refilled.size &&
        joinRoom(refilled, { userId: 'u8', name: 'Late', budget: 110 }, T0 + 3000).outcome ===
          'full' &&
        asRemoved.outcome === 'removed',
      () => `${asRemoved.outcome}`,
    );
  }

  {
    // THE FIVE THINGS IT WILL NOT DO. Identity is the test, because that is exactly what
    // tells the store there is nothing to write - and a "removal" that quietly wrote a room
    // it had not changed would still stamp `touched_at` and hold a lobby open.
    const lobby = roomOf(4, BUDGET);
    const withBot = setBots(halfFullLobby(), 'u0', 1, T0, botIds());
    const bot = withBot.members.find((m) => m.bot);
    withSeed(91, () => {
      const drafting = startRoom(roomOf(4, BUDGET), 'u0', T0);
      const { room: ended } = runToEnd(drafting);
      check(
        'room: a removal is the HOST making it, in a LOBBY, about somebody else who is a PERSON',
        () =>
          // Vacuity: the one call that IS allowed changes the room.
          removeMember(lobby, 'u0', 'u2', T0 + 1000) !== lobby &&
          // Not by anybody else, including the person being removed.
          removeMember(lobby, 'u1', 'u2', T0 + 1000) === lobby &&
          removeMember(lobby, 'u2', 'u2', T0 + 1000) === lobby &&
          // Not the host, to themselves: leaving already means something (the room closes,
          // or the next seat is promoted) and this must not be a second name for it.
          removeMember(lobby, 'u0', 'u0', T0 + 1000) === lobby &&
          // Not somebody who is not in it.
          removeMember(lobby, 'u0', 'nobody', T0 + 1000) === lobby &&
          // Not a practice opponent: that is a COUNT the host chooses, and taking one out
          // from underneath it would leave the chips disagreeing with the room.
          !!bot &&
          removeMember(withBot, 'u0', bot.userId, T0 + 1000) === withBot &&
          // And not once the football has started, for the reason the liveness sweep stops
          // at the lobby: the round is drawn by pairing the survivors.
          removeMember(drafting, 'u0', 'u2', T0 + 1000) === drafting &&
          removeMember(ended, 'u0', 'u2', T0 + 1000) === ended,
        () => `bot ${bot?.userId ?? 'none'}`,
      );
    });
  }

  {
    // A DUEL IS A ROOM, so its host may say "not you" to whoever opened the link - and only
    // while it is still a lobby, which in a duel is exactly the window before anything is
    // dealt. Past that the room is drafting and the only way out is the forfeit, which is
    // the rule that stops a challenger re-rolling their squad by walking away.
    const duel = duelRoom();
    const taken = joinRoom(duel, { userId: 'u1', name: 'Bruno', budget: BUDGET.budget }, T0 + 500)
      .room;
    const sent = removeMember(taken, 'u0', 'u1', T0 + 1000);
    const drafting = tickRoom(
      setLineup(setLineup(taken, 'u0', '4-3-3', 'bal', true), 'u1', '4-4-2', 'bal', true),
      T0 + 1000,
    );
    check(
      'room: a duel host can remove the challenger in the lobby, and not once it is drafting',
      () =>
        // Vacuity: somebody really had taken it up.
        taken.members.length === 2 &&
        sent.status === 'lobby' &&
        sent.members.length === 1 &&
        sent.removed.includes('u1') &&
        // The link works again for anybody else, and never again for them - which is the
        // difference between removing somebody and calling the challenge off.
        joinRoom(sent, { userId: 'u5', name: 'Carla', budget: BUDGET.budget }, T0 + 2000)
          .outcome === 'ok' &&
        joinRoom(sent, { userId: 'u1', name: 'Bruno', budget: BUDGET.budget }, T0 + 2000)
          .outcome === 'removed' &&
        // Vacuity for the second half: the duel really did start.
        drafting.status === 'drafting' &&
        removeMember(drafting, 'u0', 'u1', T0 + 2000) === drafting,
      () => `${sent.status}/${sent.members.length}, drafting ${drafting.status}`,
    );
  }
}

/**
 * Getting out of a duel, and what it costs.
 *
 * THERE ARE TWO ANSWERS AND WHETHER ANYTHING HAS BEEN DEALT DECIDES WHICH. In the lobby it
 * is free at both ends: no squad has been dealt and no player bought, so neither of them
 * has seen a thing. Once the draft is under way, leaving is a FORFEIT at either end - the
 * room ends there and then and the player who stayed has won it.
 *
 * THE FORFEIT IS WHAT MAKES THE LOBBY WORTH HAVING. A duel waits in a lobby so that nothing
 * is seen before both players are committed; if walking out afterwards were free, a
 * challenger could look at the squad they were dealt, leave, and open another until they
 * liked one - which is the free re-roll every counted allowance in this game exists to
 * prevent. THE LINE SITS AT THE DEAL rather than at the seat count (2026-09-02, asked for
 * from the game): a seat is taken before anybody has been shown anything, so charging a
 * loss for leaving a lobby charged for the wrong thing, and the exploit above needs a squad
 * on the screen to be worth anything at all.
 *
 * The vacuity guard for the whole block is the LIVE room: every claim below is made against
 * the identical call on a live room of two, which must still be the no-op it has always
 * been.
 */
function duelLeaveChecks(): void {
  /** A duel in its lobby, with `others` people having taken it up. */
  const duelWith = (others: number, rules: RoomRules = BUDGET): PvpRoom => {
    let room = createRoom({
      id: 'dl1',
      code: 'DUEL01',
      hostId: 'u0',
      hostName: 'Host',
      visibility: 'private',
      size: 2,
      rules,
      pickSeconds: 20,
      hostBudget: rules.method === 'budget' ? rules.budget : 0,
      pace: 'async',
      now: T0,
    });
    for (let i = 1; i <= others; i++) {
      const joined = joinRoom(
        room,
        { userId: `u${i}`, name: `P${i}`, budget: rules.method === 'budget' ? rules.budget : 0 },
        T0 + i * 1000,
      );
      room = joined.room;
    }
    return room;
  };

  /** The same duel, both players ready and so drafting - which is the only way a duel ever
   *  reaches a draft: nobody presses Start, the server does it when both are ready. */
  const startedDuel = (rules: RoomRules = BUDGET): PvpRoom => {
    let room = duelWith(1, rules);
    for (const m of room.members) room = setLineup(room, m.userId, '4-3-3', 'bal', true);
    return tickRoom(room, T0 + 2000);
  };

  /** The cheapest legal XI for one member, submitted as a board - which in a budget room is
   *  the one instruction there is (P52). */
  const fillBoard = (r: PvpRoom, who: string, at: number): PvpRoom => {
    const m = r.members.find((x) => x.userId === who)!;
    const filled: Filled = {};
    for (const slot of formationOf(m).slots) {
      const used = new Set(Object.values(filled).map((p) => p!.personId));
      const spent = Object.values(filled).reduce((t, p) => t + pvpPriceOf(p!), 0);
      filled[slot.id] = roomPlayers(r.rules)
        .filter(
          (p) =>
            p.positions.includes(slot.position) &&
            !used.has(p.personId) &&
            pvpPriceOf(p) <= m.budget - spent,
        )
        .sort((a, b) => a.elo - b.elo)[0]!;
    }
    return setXi(r, who, filled, at).room;
  };

  {
    // NOTHING IS DEALT UNTIL BOTH ARE READY, which is the rule the whole change rests on:
    // a challenger alone in their lobby has no squad to look at, so there is nothing to
    // reject by re-opening the challenge.
    const alone = duelWith(0);
    const aloneReady = tickRoom(setLineup(alone, 'u0', '4-3-3', 'bal', true), T0 + 1000);
    const taken = duelWith(1);
    const oneReady = tickRoom(setLineup(taken, 'u0', '4-3-3', 'bal', true), T0 + 2000);
    const both = startedDuel(ROLL);
    check(
      'duel: it waits in a lobby, and deals nothing until both players are in and ready',
      () =>
        alone.status === 'lobby' &&
        !alone.startedAt &&
        // Ready on your own: recorded, and it starts nothing.
        aloneReady.status === 'lobby' &&
        aloneReady.members[0]!.ready === true &&
        // Both seats taken and only one ready: still nothing.
        oneReady.status === 'lobby' &&
        !oneReady.deals.u0 &&
        !oneReady.windows.u0 &&
        // And with both ready it starts itself, with no Start from anybody.
        both.status === 'drafting' &&
        !!both.startedAt &&
        (both.deals.u0?.length ?? 0) === 1 &&
        (both.deals.u1?.length ?? 0) === 1 &&
        !!both.windows.u0 &&
        !!both.windows.u1,
      () =>
        `alone ${aloneReady.status}, one ready ${oneReady.status}, both ${both.status}, ` +
        `dealt ${both.deals.u0?.length ?? 0}`,
    );
  }

  {
    // AN UNANSWERED CHALLENGE IS CALLED OFF FOR NOTHING, and one whose DRAFT is under way
    // is FORFEITED - by whichever of the two walks out. The two are the same button, and
    // whether a squad has been dealt is the whole of the difference.
    const off = leaveRoom(duelWith(0), 'u0', T0 + 5000);
    const started = startedDuel();
    const creatorLeft = leaveRoom(started, 'u0', T0 + 5000);
    const guestLeft = leaveRoom(started, 'u1', T0 + 5000);
    // Nobody walks into a finished game and takes the chair that looks empty.
    const retaken = joinRoom(guestLeft, { userId: 'u2', name: 'Cleo', budget: BUDGET.budget }, T0 + 6000);
    // Vacuity, and the rule this is deliberately NOT: the same call on a live room that has
    // started changes nothing at all, because an XI in a bracket cannot be withdrawn.
    const live = withSeed(31, () => startRoom(roomOf(2, BUDGET), 'u0', T0));
    check(
      'duel: calling off an unanswered one costs nothing, and leaving one being drafted loses it',
      () =>
        // Closed, with no champion: nothing was played and nobody lost anything.
        roomClosed(off) &&
        // Vacuity: it really had been taken up, by somebody who is still in it.
        started.members.length === 2 &&
        // The creator walking out: ended, NOT closed, and the other player has won it.
        creatorLeft.status === 'ended' &&
        !roomClosed(creatorLeft) &&
        creatorLeft.championId === 'u1' &&
        // The other way round, and it is the same rule rather than a mirror of it.
        guestLeft.status === 'ended' &&
        guestLeft.championId === 'u0' &&
        // BOTH PLAYERS STAY IN THE ROOM. A seat given up in a lobby takes its member row
        // with it because the chair is being offered to somebody else; here the game is
        // over, and a room the loser is not in is one they cannot read the result of.
        creatorLeft.members.length === 2 &&
        guestLeft.members.length === 2 &&
        retaken.outcome === 'started' &&
        // And the live room in the same phase is untouched, by identity.
        leaveRoom(live, 'u0', T0 + 5000) === live,
      () =>
        `off ${off.status}, creator ${creatorLeft.status}/${creatorLeft.championId}, ` +
        `guest ${guestLeft.status}/${guestLeft.championId}, retaken ${retaken.outcome}`,
    );
  }

  {
    // AND LEAVING A TAKEN-UP LOBBY IS FREE, AT BOTH ENDS (2026-09-02, asked for from the
    // game: taking the seat "is directly counted as a loss, that's too early"). It is, by a
    // whole phase - nothing is dealt until both players are ready, so in the lobby neither
    // of them has seen anything worth rejecting, and the two free endings are the ordinary
    // ones rather than a special case: the person who opened it takes the challenge away
    // with them, and anybody else hands the seat back.
    const taken = duelWith(1);
    const hostLeft = leaveRoom(taken, 'u0', T0 + 5000);
    const guestGone = leaveRoom(taken, 'u1', T0 + 5000);
    check(
      'duel: leaving a taken-up lobby costs nothing, at either end',
      () =>
        // Vacuity: the seat really was taken, and nothing really had been dealt.
        taken.status === 'lobby' &&
        taken.members.length === taken.size &&
        !taken.deals.u0 &&
        !taken.deals.u1 &&
        // The creator: closed, with no champion, so nobody has lost anything.
        roomClosed(hostLeft) &&
        // The other player: a seat handed back, so the challenge waits again and the link
        // works for whoever opens it next - which is what every other lobby does.
        guestGone.status === 'lobby' &&
        guestGone.members.length === 1 &&
        !guestGone.championId &&
        joinRoom(guestGone, { userId: 'u4', name: 'Dina', budget: BUDGET.budget }, T0 + 6000)
          .outcome === 'ok' &&
        // THE DISCRIMINATION, which is the whole of the change: the identical call one
        // phase later DOES cost the duel, so a build that went back to reading the seat
        // count fails here rather than merely reading oddly.
        leaveRoom(startedDuel(), 'u1', T0 + 5000).championId === 'u0',
      () =>
        `host ${hostLeft.status}/${hostLeft.championId}, ` +
        `guest ${guestGone.status}/${guestGone.members.length}`,
    );
  }

  {
    // A FORFEIT KEEPS BOTH BOARDS, which is the half that would be a quiet bug the other
    // way: the loser's XI, pick log, dealt squads and window are all keyed on them, and a
    // room that dropped the player who walked would be one they could not open to see what
    // happened. It is the opposite property to the one `withoutMembers` guarantees, and
    // both are worth pinning because the two endings sit next to each other.
    const rolled = startedDuel(ROLL);
    const picked = submitPick(rolled, 'u1', firstLegalPick(rolled, 'u1'), T0 + 4000).room;
    const gone = leaveRoom(picked, 'u1', T0 + 5000);
    check(
      'duel: a forfeit ends the room and keeps both players in it, with their drafts',
      () =>
        // Vacuity: there really was a draft to keep.
        Object.keys(picked.xi.u1 ?? {}).length === 1 &&
        Object.keys(picked.picks.u1 ?? {}).length === 1 &&
        (picked.deals.u1?.length ?? 0) >= 1 &&
        // Ended and lost, with nothing thrown away.
        gone.status === 'ended' &&
        gone.championId === 'u0' &&
        gone.members.some((m) => m.userId === 'u1') &&
        Object.keys(gone.xi.u1 ?? {}).length === 1 &&
        Object.keys(gone.picks.u1 ?? {}).length === 1 &&
        // The winner's own draft is untouched too.
        (gone.deals.u0?.length ?? 0) >= 1,
      () => `${gone.status}/${gone.championId}, members ${gone.members.length}`,
    );
  }

  {
    // AND NEITHER OF THEM WORKS ONCE THE MATCH HAS BEEN PLAYED. A result that can be
    // deleted is not a result - the same reason a rematch is a new duel rather than a
    // reopened one - so both sides are refused by identity from the moment the football
    // happens.
    withSeed(77, () => {
      const both = startedDuel();
      const built = fillBoard(fillBoard(both, 'u0', T0 + 8000), 'u1', T0 + 8500);
      const sent = setDone(setDone(built, 'u0', true, T0 + 9000), 'u1', true, T0 + 9000);
      const played = tickRoom(sent, T0 + 9000);
      const ended = tickRoom(played, T0 + 9000 + 10 * 60_000);
      check(
        'duel: once the match is played, neither the creator nor the other player can undo it',
        () =>
          // Vacuity: the same two calls on the draft it came from DO both end the room.
          leaveRoom(both, 'u0', T0 + 5000).status === 'ended' &&
          leaveRoom(both, 'u1', T0 + 5000).status === 'ended' &&
          // Played, and now nothing moves.
          played.status === 'round' &&
          leaveRoom(played, 'u0', T0 + 9500) === played &&
          leaveRoom(played, 'u1', T0 + 9500) === played &&
          ended.status === 'ended' &&
          !roomClosed(ended) &&
          leaveRoom(ended, 'u0', T0 + 9500) === ended,
        () => `played ${played.status}, ended ${ended.status}`,
      );
    });
  }

  {
    // A WEEK OF SILENCE OVER A DRAFT IS THE FORFEIT NOBODY PRESSED, which is the whole of
    // the 2026-09-01 report: "I can leave the draw without catching a loss". Leaving a duel
    // deliberately always cost it - and only if you pressed the button, where every other
    // way out of a screen sends nothing at all, so the room simply stopped and `DUEL_IDLE_MS`
    // later CLOSED itself with no result for anybody.
    //
    // Three endings, and they are three rules rather than one with cases: one player late
    // loses it, both late closes it with nobody winning, and both teams in plays the
    // football however late the sweep is.
    const started = startedDuel();
    const by = duelSendDeadlineOf(started)!;
    const onlyMine = setDone(fillBoard(started, 'u0', T0 + 3000), 'u0', true, T0 + 3000);
    const justBefore = tickRoom(onlyMine, by - 1000);
    const justAfter = tickRoom(onlyMine, by + 1000);
    const neither = tickRoom(started, by + 1000);
    // Both teams in, and the sweep arriving a week late. The declaration is what the
    // helper tests first, so the bound can never confiscate a duel both players finished.
    const bothSent = withSeed(41, () => {
      const built = fillBoard(fillBoard(started, 'u0', T0 + 3000), 'u1', T0 + 3500);
      const sent = setDone(setDone(built, 'u0', true, T0 + 4000), 'u1', true, T0 + 4000);
      return tickRoom(sent, by + 1000);
    });
    check(
      'duel: a week of silence mid-draft loses it for whoever never sent, and only them',
      () =>
        // Vacuity: it is the room's own week, measured from when anything last happened.
        by === started.touchedAt + DUEL_IDLE_MS &&
        duelSendDeadlineOf({ ...started, touchedAt: T0 + 500_000 }) ===
          T0 + 500_000 + DUEL_IDLE_MS &&
        // Vacuity: one team really was sent, and the room really was still drafting.
        started.status === 'drafting' &&
        draftDone(onlyMine, onlyMine.members.find((m) => m.userId === 'u0')!) &&
        !draftDone(onlyMine, onlyMine.members.find((m) => m.userId === 'u1')!) &&
        // It does not fire early: a second short of the week is an ordinary draft.
        justBefore.status === 'drafting' &&
        // And past it, the player who never sent has lost it - the same encoding a
        // walked-out duel uses, a champion with no match under it (migration 0024).
        justAfter.status === 'ended' &&
        justAfter.championId === 'u0' &&
        !roomClosed(justAfter) &&
        !justAfter.ties.length &&
        // NEITHER OF THEM SENT ANYTHING, so neither has won anything: closed, no champion,
        // and `duelListed` keeps a room in that state off the played list.
        neither.status === 'ended' &&
        roomClosed(neither) &&
        // Both sent, and the sweep a week late: the match is played, not confiscated.
        bothSent.status === 'round',
      () =>
        `before ${justBefore.status}, after ${justAfter.status}/${justAfter.championId}, ` +
        `neither ${neither.status}/${neither.championId}, both ${bothSent.status}`,
    );
  }

  {
    // AND IT IS A DRAFT'S RULE ALONE. A live room has four deadlines of its own (P31) and
    // needs none of this; a challenge nobody ever took up has nobody to be late, so the
    // week closes it with no result exactly as it always did.
    const live = withSeed(53, () => startRoom(roomOf(2, BUDGET), 'u0', T0));
    const unanswered = duelWith(0);
    const ignored = tickRoom(unanswered, T0 + DUEL_IDLE_MS + 1000);
    check(
      'duel: the sending window is a drafting duel and nothing else',
      () =>
        // Vacuity: the live room really is in the same phase, and a duel really has one.
        live.status === 'drafting' &&
        duelSendDeadlineOf(startedDuel()) !== null &&
        duelSendDeadlineOf(live) === null &&
        duelSendDeadlineOf(unanswered) === null &&
        // A challenge nobody answered: closed, and nobody has lost anything by it.
        roomClosed(ignored),
      () => `live ${duelSendDeadlineOf(live)}, unanswered ${roomClosed(ignored)}`,
    );
  }

  {
    // AND THE PLAYERS ARE TOLD. A bound nobody is shown would take a duel off somebody
    // while they were not looking, which is the same complaint in reverse. The sentence
    // rounds DOWN, so it can never promise time that is not there, and it reads the other
    // way round once you have sent - there it is the reassurance rather than the warning.
    const view = (sendRemainingMs: number | null | undefined): RoomView =>
      ({ sendRemainingMs }) as RoomView;
    check(
      'duel: the sending window is stated, rounded down, and from both ends',
      () =>
        sendWindowNote(view(DUEL_IDLE_MS), true) ===
          '7 days left to send your team, or you lose the duel.' &&
        sendWindowNote(view(DUEL_IDLE_MS), false) ===
          '7 days left for them to send theirs, or the duel is yours.' &&
        // Rounded down at every step: 47 hours is one day, 90 minutes is one hour.
        sendWindowNote(view(47 * 3_600_000), true)?.startsWith('1 day ') === true &&
        sendWindowNote(view(90 * 60_000), true)?.startsWith('1 hour ') === true &&
        sendWindowNote(view(59 * 60_000), true)?.startsWith('Less than an hour ') === true &&
        // Nothing to say when there is no window: a live room, or a referee older than it.
        sendWindowNote(view(null), true) === null &&
        sendWindowNote(view(undefined), true) === null,
      () => `${sendWindowNote(view(DUEL_IDLE_MS), true)}`,
    );
  }

  {
    // AND NOTHING MAY QUIETLY REWIND THE WEEK. A duel loses nothing to an outage - its
    // windows count the picks and have no deadline for a restart to have eaten - but
    // `recoverFromOutage` used to hand back a CLONE anyway, and a clone is what the sweeper
    // reads as "this room changed": it wrote the room and stamped `touched_at`, which is
    // the very stamp the week is measured from. So every sweeper restart handed the player
    // who had walked away another seven days, silently and for ever.
    const duel = startedDuel();
    // A ROLL room for the guard: a whole-draft room has no windows to hand back.
    const live = withSeed(53, () => startRoom(roomOf(2, ROLL), 'u0', T0));
    check(
      'duel: an outage recovery leaves a duel alone, so a restart cannot rewind its week',
      () =>
        // BY IDENTITY, which is the only thing the sweeper looks at.
        recoverFromOutage(duel, T0 + 5000, T0 + 50_000) === duel &&
        // Vacuity, and it is the whole check: the same call on a LIVE room in the same
        // phase does hand time back, so this is a rule about the pace and not a no-op.
        live.status === 'drafting' &&
        recoverFromOutage(live, T0 + 5000, T0 + 50_000) !== live &&
        recoverFromOutage(live, T0 + 5000, T0 + 50_000).windows.u0!.openedAt === T0 + 45_000,
      () => `duel ${recoverFromOutage(duel, T0 + 5000, T0 + 50_000) === duel}`,
    );
  }
}
/**
 * The bot rules (`domain/pvpBot.ts`, roadmap item 45).
 *
 * TWO CLAIMS ARE WORTH MORE THAN THE REST OF THIS BLOCK PUT TOGETHER, and both are
 * measurements rather than assertions about the code:
 *
 *   * A PRACTICE OPPONENT IS NOT THE AUTO-PICK. The expired-window fallback is random by
 *     decision (P21), so a bot that drafted like one would be a free win in every round it
 *     appeared - which is worse than the empty room it exists to fix. The tie is played,
 *     both ways, thousands of times.
 *   * IT DOES NOT SPEND EVERYTHING EITHER. `BOT_SPEND` is the whole handicap and it is
 *     easy to lose: any change that stops the search reserving it leaves the strongest XI
 *     the money can buy sitting in every room, and nothing else would notice.
 *
 * The rest is the lifecycle, and every one of those was a way for a bot to break a rule
 * P31 states about people: holding a lobby open after everybody left, being promoted to
 * host, being swept out for silence, or keeping a person from taking a seat.
 */
function botChecks(): void {
  /** Predictable ids, in the shape the database wants. */
  const botIds = (): (() => string) => {
    let n = 0;
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  };

  /** A lobby of `size` with `humans` people in it and nothing else. */
  function lobbyOf(size: RoomSize, rules: RoomRules, humans: number): PvpRoom {
    let room = createRoom({
      id: 'r1',
      code: 'BOT123',
      hostId: 'u0',
      hostName: 'Host',
      visibility: 'private',
      size,
      rules,
      pickSeconds: 20,
      hostBudget: rules.budget,
      now: T0,
    });
    for (let i = 1; i < humans; i++) {
      room = joinRoom(room, { userId: `u${i}`, name: `P${i}`, budget: rules.budget }, T0).room;
    }
    return room;
  }

  // --- The team it turns up with -------------------------------------------
  {
    withSeed(4401, () => {
      const legal: boolean[] = [];
      const spends: number[] = [];
      for (let i = 0; i < 12; i++) {
        for (const rules of [BUDGET, ROLL]) {
          const lobby = setBots(lobbyOf(2, rules, 1), 'u0', 1, T0, botIds());
          const started = startRoom(lobby, 'u0', T0);
          const bot = botsIn(started)[0]!;
          const xi = started.xi[bot.userId] ?? {};
          const verdict = validateXi(formationOf(bot), xi, rules);
          legal.push(verdict.ok);
          if (rules.method === 'budget') spends.push(verdict.cost / rules.budget);
        }
      }
      const worst = Math.min(...spends);
      const most = Math.max(...spends);
      const mean = spends.reduce((a, b) => a + b, 0) / spends.length;
      console.log(
        `  practice opponents: budget spent ${(mean * 100).toFixed(1)}% of the room's money ` +
          `(${(worst * 100).toFixed(1)} to ${(most * 100).toFixed(1)}), cap ${BOT_SPEND * 100}%`,
      );
      check(
        `bot: all ${legal.length} teams are legal and complete under the room's own rules`,
        // Vacuity: it built some, in both kinds of room, and `validateXi` is the same
        // judgement a submitted XI gets - an incomplete one fails on `empty-slot`.
        () => legal.length === 24 && legal.every(Boolean),
        () => `${legal.filter((x) => !x).length} of ${legal.length} refused`,
      );
      check(
        'bot: a budget bot spends nearly all of BOT_SPEND, and never a dollar past it',
        () =>
          spends.length === 12 &&
          // THE HANDICAP IS THE CONSTANT ITSELF, so it is asserted rather than only read:
          // measuring the spend against `BOT_SPEND` alone cannot notice `BOT_SPEND` being
          // set to 1, which is the one edit that turns every practice opponent into the
          // strongest XI the money can buy.
          BOT_SPEND < 1 &&
          BOT_SPEND >= 0.85 &&
          most <= BOT_SPEND &&
          // Nearly all of it: the bisection lands under the cap and the leftover pass
          // spends what is left, so anything much below this means one of the two stopped
          // working and nothing else would say so.
          worst >= BOT_SPEND - 0.06,
        () => `spent ${(worst * 100).toFixed(1)}% to ${(most * 100).toFixed(1)}%`,
      );
    });
  }

  // --- Not cannon fodder, and not unbeatable either -------------------------
  {
    withSeed(4402, () => {
      const f = getFormation('4-3-3', 'bal')!;
      const rules = BUDGET;
      let botWins = 0;
      let overBot = 0;
      let overAuto = 0;
      const TIES = 240;
      for (let i = 0; i < TIES; i++) {
        const bot = botXi(rules, f);
        // The expired-window fallback: what a player who does nothing at all ends up with
        // (P21, deliberately random). This is the thing a bot must not be.
        const idle = autoCompleteXi(f, {}, rules, { remaining: rules.budget });
        const side = (filled: Filled, id: string) =>
          pvpTeam({
            id,
            name: id,
            code: id.slice(0, 3).toUpperCase(),
            players: f.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p),
          });
        const result = resolveKoTie(side(bot, 'bot'), side(idle, 'idle'));
        if (result.homeWon) botWins++;
        overBot += xiStrength(
          f.slots.map((s) => bot[s.id]).filter((p): p is Player => !!p),
        ).overall;
        overAuto += xiStrength(
          f.slots.map((s) => idle[s.id]).filter((p): p is Player => !!p),
        ).overall;
      }
      const rate = botWins / TIES;
      console.log(
        `  practice opponents: beat the expired-window XI ${(rate * 100).toFixed(1)}% of ` +
          `${TIES} ties, rated ${(overBot / TIES).toFixed(1)} against ${(overAuto / TIES).toFixed(1)}`,
      );
      check(
        'bot: a practice opponent beats the XI an expired clock would build, decisively',
        // A ceiling as well as a floor. The floor is the point of the feature; the ceiling
        // is the reason `BOT_SPEND` exists, and a bot winning every single tie would mean
        // the handicap had stopped being applied rather than that the search got better.
        () => rate > 0.75 && rate < 1,
        () => `${(rate * 100).toFixed(1)}% of ${TIES}`,
      );
    });
  }

  // --- A bot never keeps a person out ---------------------------------------
  {
    const full = setBots(lobbyOf(4, BUDGET, 2), 'u0', 2, T0, botIds());
    const joined = joinRoom(full, { userId: 'u9', name: 'Late', budget: 110 }, T0 + 1000);
    // And when there is no bot to give up a chair, a full room is still full.
    const people = roomOf(4, BUDGET);
    check(
      'bot: somebody arriving at a full room takes a BOT’s seat, never a person’s',
      () =>
        // Vacuity: the room really was full, and of four seats two were bots.
        full.members.length === 4 &&
        botsIn(full).length === 2 &&
        joined.outcome === 'ok' &&
        joined.room.members.length === 4 &&
        botsIn(joined.room).length === 1 &&
        humansIn(joined.room).length === 3 &&
        // Nobody who was already sitting there moved.
        ['u0', 'u1'].every((id) => joined.room.members.some((m) => m.userId === id)) &&
        joinRoom(people, { userId: 'u9', name: 'Late', budget: 110 }, T0).outcome === 'full',
      () => `${joined.outcome}, ${botsIn(joined.room).length} bots left`,
    );
  }

  // --- Who may ask for them, and how many -----------------------------------
  {
    const lobby = lobbyOf(4, BUDGET, 2);
    const two = setBots(lobby, 'u0', 2, T0, botIds());
    check(
      'bot: only the host seats them, only into free chairs, and a repeated request is a no-op',
      () =>
        two.members.length === 4 &&
        // Not a guest's to ask for.
        setBots(lobby, 'u1', 2, T0, botIds()) === lobby &&
        // Never more than the empty chairs, and never a negative number of them.
        setBots(lobby, 'u0', 3, T0, botIds()) === lobby &&
        setBots(lobby, 'u0', -1, T0, botIds()) === lobby &&
        // Idempotent: the same target twice changes nothing, which is what makes it safe
        // to send again on a flaky link (P36's reasoning, applied to a second command).
        setBots(two, 'u0', 2, T0, botIds()).members.length === 4 &&
        // And it steps back down, newest chair first.
        botsIn(setBots(two, 'u0', 1, T0, botIds())).length === 1 &&
        botsIn(setBots(two, 'u0', 0, T0, botIds())).length === 0 &&
        // Not once the football has started.
        setBots(startRoom(two, 'u0', T0), 'u0', 0, T0, botIds()).members.length === 4,
      () => `${two.members.length} seated, ${botsIn(two).length} of them bots`,
    );
  }

  // --- The lifecycle rules a bot must not break -----------------------------
  {
    const lobby = setBots(lobbyOf(4, BUDGET, 2), 'u0', 2, T0, botIds());
    // Everybody's phone slept. A bot has no phone, so the sweep must not take it - and
    // must not leave the room open on the strength of it either.
    const swept = tickRoom(lobby, GONE);
    // The host alone goes: the other person is still here, so the room lives on with them.
    const hostGone = leaveRoom(lobby, 'u0', T0 + 1000);
    // Both people go: four seats are still filled and the room is over anyway.
    const empty = leaveRoom(hostGone, 'u1', T0 + 2000);
    check(
      'bot: a bot cannot be swept out, cannot become host, and cannot hold a room open',
      () =>
        // A LOBBY WITH NOBODY IN IT IS OVER, however many chairs are filled. Without this
        // a host who walked away would leave a room of three robots listed as joinable
        // until `LOBBY_IDLE_MS`.
        roomClosed(swept) &&
        roomClosed(empty) &&
        // Vacuity: with a person still there the same rule keeps the room AND the bots.
        hostGone.status === 'lobby' &&
        hostGone.hostId === 'u1' &&
        botsIn(hostGone).length === 2 &&
        // The promotion skipped both bots even though one holds an earlier seat than
        // nobody - a bot cannot press Start, so a room it hosted could never begin.
        !hostGone.members.find((m) => m.userId === hostGone.hostId)?.bot,
      () => `swept ${swept.status}, host ${hostGone.hostId}, empty ${empty.status}`,
    );
  }

  // --- A room that is mostly practice still plays ---------------------------
  {
    withSeed(4403, () => {
      const lobby = setBots(lobbyOf(4, BUDGET, 1), 'u0', 3, T0, botIds());
      const started = startRoom(lobby, 'u0', T0);
      const { room: done } = runToEnd(started);
      const champion = done.members.find((m) => m.userId === done.championId);
      check(
        'bot: one person and three practice opponents play a whole room out to a champion',
        () =>
          // The bots are ready to play the moment the room starts, so the only thing the
          // room is waiting for is the person - which in a budget room means the person
          // saying they are through, or the draft's one clock running out (P52).
          botsIn(started).every((m) => draftDone(started, m) && xiComplete(started, m)) &&
          !draftDone(started, started.members.find((m) => m.userId === 'u0')!) &&
          done.status === 'ended' &&
          !roomClosed(done) &&
          !!champion &&
          // Two rounds, four seats, three of them beaten.
          done.ties.length === 3 &&
          done.members.filter((m) => m.outIn !== undefined).length === 3,
        () => `${done.status}, champion ${champion?.name ?? 'none'}, ${done.ties.length} ties`,
      );
    });
  }

  // --- A duel's shape, which had no control at all --------------------------
  //
  // FOR ONE DAY A DUEL HAD NO LOBBY, and the only formation control lives on one: neither
  // side of any duel could choose a shape, and both played 4-3-3 balanced. Reported from
  // the game 2026-08-30. A duel waits in a lobby again - for a different reason, to stop
  // anything being dealt before both players are committed - so the fix is that the control
  // has somewhere to live rather than that the gate was widened. This pins the gate at both
  // ends, because the tempting repair was to let a shape change mid-draft, which would
  // orphan a board that is already built on the old slots.
  {
    const duel = createRoom({
      id: 'r9',
      code: 'DU0001',
      hostId: 'u0',
      hostName: 'Host',
      visibility: 'private',
      size: 2,
      rules: BUDGET,
      pickSeconds: 20,
      hostBudget: BUDGET.budget,
      pace: 'async',
      now: T0,
    });
    const shaped = setLineup(duel, 'u0', '3-5-2', 'off', true);
    // Both in and both ready, which is the only thing that starts a duel's draft.
    const joined = joinRoom(shaped, { userId: 'u1', name: 'Bruno', budget: BUDGET.budget }, T0 + 500).room;
    const drafting = tickRoom(setLineup(joined, 'u1', '4-4-2', 'bal', true), T0 + 1000);
    const late = setLineup(drafting, 'u0', '4-4-2', 'bal', true);
    check(
      "draft: a duel's shape is chosen in its lobby, and it is settled once the draft starts",
      () =>
        // It waits in a lobby, which is where the control is.
        duel.status === 'lobby' &&
        shaped.members.find((m) => m.userId === 'u0')?.formationName === '3-5-2' &&
        shaped.members.find((m) => m.userId === 'u0')?.style === 'off' &&
        // Each player's own choice is carried into the draft, separately.
        drafting.status === 'drafting' &&
        drafting.members.find((m) => m.userId === 'u0')?.formationName === '3-5-2' &&
        drafting.members.find((m) => m.userId === 'u1')?.formationName === '4-4-2' &&
        // And once it has started it is refused, so a change can never orphan a board.
        late.members.find((m) => m.userId === 'u0')?.formationName === '3-5-2' &&
        // Vacuity: a LIVE room reads exactly the same way, which is the point - there is
        // one rule now rather than one per pace.
        setLineup(startRoom(roomOf(2, BUDGET), 'u0', T0), 'u0', '3-5-2', 'off', true).members.find(
          (m) => m.userId === 'u0',
        )?.formationName === DEFAULT_FORMATION_FOR_CHECK,
      () =>
        `${duel.status}, shaped ${shaped.members.find((m) => m.userId === 'u0')?.formationName}, late ${late.members.find((m) => m.userId === 'u0')?.formationName}`,
    );
  }

  // --- One clock over the whole draft (P52) --------------------------------
  //
  // A BUDGET ROOM DOES NOT RUN A PICK CLOCK, and the reason is the money rather than the
  // pace: buying an XI is one decision about one pool, so the eleventh pick is what decides
  // whether the first was affordable, and a per-pick window makes that unplayable because
  // there is no going back. So the room gets one clock, the board is submitted as a map,
  // and a player may buy, move and sell inside it until they say they are through.

  {
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
    const rolled = startRoom(roomOf(2, ROLL), 'u0', T0);
    check(
      'draft: a budget room opens ONE clock and no pick windows; a roll room is unchanged',
      () =>
        wholeDraft(room) &&
        !wholeDraft(rolled) &&
        room.members.every((m) => !room.windows[m.userId]) &&
        draftDeadlineOf(room) === T0 + DEFAULT_DRAFT_SECONDS * 1000 &&
        // Vacuity, and it is the contrast the whole change is: a roll room still opens a
        // window per player and has no whole-draft deadline at all.
        rolled.members.every((m) => !!rolled.windows[m.userId]) &&
        draftDeadlineOf(rolled) === null,
      () =>
        `budget windows ${Object.values(room.windows).filter(Boolean).length}, deadline ${draftDeadlineOf(room)}`,
    );
  }

  {
    // Buy, move, sell - three gestures, one instruction, because the board is a map.
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
    const me = room.members.find((m) => m.userId === 'u0')!;
    const f = formationOf(me);
    // A player who can fill two of this formation's slots, so a MOVE is expressible at all.
    const two = f.slots.filter((s, i, all) => all.findIndex((x) => x.position === s.position) === i);
    const pair = (() => {
      for (const a of two) {
        for (const b of two) {
          if (a.id === b.id) continue;
          const p = roomPlayers(room.rules).find(
            (x) => x.positions.includes(a.position) && x.positions.includes(b.position),
          );
          if (p) return { a, b, p };
        }
      }
      return null;
    })()!;

    const bought = setXi(room, 'u0', { [pair.a.id]: pair.p }, T0 + 1000);
    const moved = setXi(bought.room, 'u0', { [pair.b.id]: pair.p }, T0 + 2000);
    const sold = setXi(moved.room, 'u0', {}, T0 + 3000);
    check(
      'draft: buying, moving and selling are all the same instruction - the board',
      () =>
        bought.outcome === 'ok' &&
        bought.room.xi.u0![pair.a.id]?.id === pair.p.id &&
        // A MOVE. The same man, a different slot, and the pick log follows him rather than
        // leaving a record behind on a slot that is now empty - which is what `pgStore`
        // deletes for, and would be a player the room thinks is still there.
        moved.outcome === 'ok' &&
        !moved.room.xi.u0![pair.a.id] &&
        moved.room.xi.u0![pair.b.id]?.id === pair.p.id &&
        !moved.room.picks.u0![pair.a.id] &&
        !!moved.room.picks.u0![pair.b.id] &&
        // And a sale empties both.
        sold.outcome === 'ok' &&
        Object.keys(sold.room.xi.u0!).length === 0 &&
        Object.keys(sold.room.picks.u0!).length === 0,
      () =>
        `${bought.outcome}/${moved.outcome}/${sold.outcome}, slots ${Object.keys(moved.room.xi.u0 ?? {}).join()}`,
    );

    // A slot that did not change keeps its record, which is what stops every keystroke
    // restamping when the player arrived and whether the clock put him there.
    const again = setXi(bought.room, 'u0', { [pair.a.id]: pair.p }, T0 + 9000);
    check(
      'draft: a slot that did not change keeps its pick record, landing time and all',
      () =>
        again.outcome === 'ok' &&
        again.room.picks.u0![pair.a.id]!.landedAt === bought.room.picks.u0![pair.a.id]!.landedAt &&
        // Vacuity: the one that DID change got a new time.
        moved.room.picks.u0![pair.b.id]!.landedAt === T0 + 2000,
      () => `${again.room.picks.u0?.[pair.a.id]?.landedAt} vs ${bought.room.picks.u0?.[pair.a.id]?.landedAt}`,
    );
  }

  // --- Moving a placed player in a PER-PICK room (P42) ---------------------
  //
  // The instruction a roll room was missing, and what makes it safe to take outside the
  // pick protocol is one rule: a submission must be a PERMUTATION of the board already
  // there. Two of the checks below are that rule refusing the ways it can be broken,
  // because without it a "move" is a second, unmetered way to pick - a roll room's dealt
  // squads ACCUMULATE, so `validateXi` alone would happily take an XI rebuilt out of
  // eleven men from eleven earlier squads that were never picked.
  withSeed(101, () => {
    // A real draft rather than a board assembled by hand: half of what is tested here is
    // the PICK LOG, and a hand-built XI has none.
    const drafted = (stop: number): PvpRoom => {
      let room = startRoom(roomOf(2, ROLL), 'u0', T0);
      let at = T0;
      for (let i = 0; i < stop && room.windows.u0; i++) {
        at += 1000;
        room = submitPick(room, 'u0', firstLegalPick(room, 'u0'), at).room;
      }
      return room;
    };
    /** Any legal rearrangement of this board, found the way the client finds one. */
    const someMove = (room: PvpRoom, who: string) => {
      const m = room.members.find((x) => x.userId === who)!;
      const f = formationOf(m);
      const filled = room.xi[who] ?? {};
      for (const a of f.slots) {
        if (!filled[a.id]) continue;
        for (const b of f.slots) {
          if (a.id === b.id) continue;
          const moved = planMove(f, filled, a.id, b.id);
          if (moved) return { f, filled, from: a.id, to: b.id, moved };
        }
      }
      return null;
    };
    /** Who is on a board, whatever slot each of them is standing in. */
    const roster = (x: Filled) =>
      Object.values(x)
        .filter((p): p is Player => !!p)
        .map((p) => p.id)
        .sort()
        .join(',');

    const full = drafted(11);
    const plan = someMove(full, 'u0')!;
    const moved = movePlayers(full, 'u0', plan.moved);

    check(
      'versus: a per-pick room takes a MOVE - the same eleven people, standing somewhere else',
      () =>
        moved.outcome === 'ok' &&
        moved.room.xi.u0![plan.to]?.id === plan.filled[plan.from]?.id &&
        roster(moved.room.xi.u0!) === roster(plan.filled) &&
        // Vacuity, and it needs both halves: a board that did not change at all would
        // satisfy the roster test trivially, and the arrangement is the whole gesture.
        Object.entries(plan.filled).some(([s, p]) => moved.room.xi.u0![s]?.id !== p!.id),
      () => `${moved.outcome}, ${plan.from} -> ${plan.to}`,
    );

    {
      // THE PICK RECORD FOLLOWS THE PLAYER, which is the half nothing on screen can show.
      // A record says how that man came into the team, `automatic` included, and
      // `pvp_matches.loser_auto_picks` is one of the three facts a ladder needs to tell a
      // real win from a farmed one - so re-stamping on a move would launder an auto-pick
      // into a chosen one, silently, as often as the player liked.
      //
      // The flag is set on the fixture rather than waited for: the sweeper fills a slot
      // for every member at once, and steering it onto the one player this board can move
      // is a great deal of machinery to reach a state one assignment describes exactly.
      const laundered = structuredClone(full);
      laundered.picks.u0![plan.from]!.automatic = true;
      const after = movePlayers(laundered, 'u0', plan.moved);
      const was = new Map(
        Object.entries(laundered.xi.u0!).map(([s, p]) => [p!.id, laundered.picks.u0![s]!]),
      );
      const has = new Map(
        Object.entries(after.room.xi.u0!).map(([s, p]) => [p!.id, after.room.picks.u0![s]!]),
      );
      check(
        'versus: a move carries each pick record with its PLAYER, so an automatic pick cannot be laundered',
        () =>
          after.outcome === 'ok' &&
          was.size === has.size &&
          [...was].every(([id, rec]) => {
            const kept = has.get(id);
            return (
              !!kept &&
              kept.automatic === rec.automatic &&
              kept.landedAt === rec.landedAt &&
              kept.ordinal === rec.ordinal
            );
          }) &&
          // Vacuity: there IS an automatic record in the sample and it belongs to the man
          // who moved, so this cannot pass on a board with nothing to launder.
          has.get(plan.filled[plan.from]!.id)?.automatic === true,
        () => `${after.outcome}, ${was.size} before / ${has.size} after`,
      );
    }

    {
      // THE PERMUTATION RULE, failing both ways it can. The added player is drawn from an
      // EARLIER dealt squad on purpose: that is the real attack, and it is the one a check
      // against a random stranger would miss, because `validateXi`'s `undealt` test would
      // wave him straight through.
      const earlier = full.deals.u0!.slice(0, -1);
      const already = new Set(Object.values(plan.filled).map((p) => p!.personId));
      const fromPos = plan.f.slots.find((s) => s.id === plan.from)!.position;
      const intruder = roomPlayers(ROLL).find(
        (p) =>
          earlier.includes(p.squadId) && !already.has(p.personId) && p.positions.includes(fromPos),
      )!;
      const added = movePlayers(full, 'u0', { ...plan.filled, [plan.from]: intruder });
      const dropped: Filled = { ...plan.filled };
      delete dropped[plan.from];
      const short = movePlayers(full, 'u0', dropped);
      check(
        'versus: a move may not add a player or drop one - it is a permutation, never a pick',
        () =>
          added.outcome === 'illegal' &&
          short.outcome === 'illegal' &&
          // Vacuity: the intruder is a legal player from a squad this player really was
          // dealt and who really can play that slot, so nothing but the permutation rule
          // is refusing him.
          earlier.includes(intruder.squadId) &&
          intruder.positions.includes(fromPos),
        () => `${added.outcome} / ${short.outcome}, intruder ${intruder?.id}`,
      );
    }

    {
      // The rules still apply to the arrangement itself: the same eleven men, one of them
      // standing somewhere he cannot play.
      const gk = plan.f.slots.find((s) => s.position === 'GK')!;
      const out = plan.f.slots.find((s) => s.position !== 'GK' && !!plan.filled[s.id])!;
      const swapped: Filled = {
        ...plan.filled,
        [gk.id]: plan.filled[out.id]!,
        [out.id]: plan.filled[gk.id]!,
      };
      const bad = movePlayers(full, 'u0', swapped);
      check(
        'versus: a move that puts a man where he cannot play is refused',
        () =>
          bad.outcome === 'illegal' &&
          // Vacuity: it is ELIGIBILITY that refused this one and not the permutation rule,
          // because the same eleven people are on the board.
          roster(swapped) === roster(plan.filled),
        () => bad.outcome,
      );
    }

    {
      // IT SPENDS NO WINDOW, which is what makes it something other than a pick. Checked
      // MID-DRAFT, where there is a window to spend: on the full board above there is none
      // left, and "the ordinal did not move" is true of a room that never had one.
      const part = drafted(6);
      const mid = someMove(part, 'u0')!;
      const after = movePlayers(part, 'u0', mid.moved);
      check(
        'versus: a move spends no pick window, and no squad is dealt for it',
        () =>
          after.outcome === 'ok' &&
          !!part.windows.u0 &&
          after.room.windows.u0!.ordinal === part.windows.u0!.ordinal &&
          after.room.windows.u0!.openedAt === part.windows.u0!.openedAt &&
          after.room.deals.u0!.length === part.deals.u0!.length,
        () =>
          `${after.outcome}, ordinal ${part.windows.u0?.ordinal} -> ${after.room.windows.u0?.ordinal}`,
      );
    }

    {
      // The two states that are not a draft you may still rearrange. A whole-draft room is
      // refused because it HAS this already, through `setXi` (P52), and two instructions
      // for one gesture is two sets of rules to keep in step.
      const budgetRoom = startRoom(roomOf(2, BUDGET), 'u0', T0);
      const wholeRoom = movePlayers(budgetRoom, 'u0', {});
      let drawn = full;
      for (let i = 0; i < 60 && drawn.status === 'drafting'; i++) {
        drawn = tickRoom(drawn, T0 + 20_000 + i * 25_000);
      }
      const afterDraw = movePlayers(drawn, 'u0', plan.moved);
      check(
        'versus: a whole-draft room and a room that has drawn both refuse a move',
        () =>
          wholeRoom.outcome === 'closed' &&
          afterDraw.outcome === 'closed' &&
          // Vacuity: the first really is a whole-draft room and the second really did
          // leave the draft behind.
          wholeDraft(budgetRoom) &&
          drawn.status !== 'drafting',
        () => `${wholeRoom.outcome} / ${afterDraw.outcome} at ${drawn.status}`,
      );
    }
  });

  // A SENT TEAM IS THE TEAM THAT PLAYS. A duel's match goes off the moment the second XI
  // lands, so rearranging after the send would be changing a team that may already be on
  // the pitch - which is why `setXi` refuses one too.
  withSeed(101, () => {
    let duel = createRoom({
      id: 'r44',
      code: 'DUEL44',
      hostId: 'u0',
      hostName: 'Host',
      visibility: 'private',
      size: 2,
      rules: ROLL,
      pickSeconds: 20,
      hostBudget: 0,
      pace: 'async',
      now: T0,
    });
    duel = joinRoom(duel, { userId: 'u1', name: 'P1', budget: 0 }, T0).room;
    // Both ready is the only way a duel ever reaches a draft: nobody presses Start.
    for (const m of duel.members) duel = setLineup(duel, m.userId, '4-3-3', 'bal', true);
    duel = tickRoom(duel, T0 + 2000);
    let at = T0 + 2000;
    for (let i = 0; i < 11 && duel.windows.u0; i++) {
      at += 1000;
      duel = submitPick(duel, 'u0', firstLegalPick(duel, 'u0'), at).room;
    }
    const me = duel.members.find((m) => m.userId === 'u0')!;
    const f = formationOf(me);
    const filled = duel.xi.u0 ?? {};
    let plan: Filled | null = null;
    for (const a of f.slots) {
      if (!filled[a.id] || plan) continue;
      for (const b of f.slots) {
        if (a.id === b.id) continue;
        const moved = planMove(f, filled, a.id, b.id);
        if (moved) {
          plan = moved;
          break;
        }
      }
    }
    const before = movePlayers(duel, 'u0', plan!);
    const sent = setDone(duel, 'u0', true, at + 1000);
    const after = movePlayers(sent, 'u0', plan!);
    check(
      'versus: a duel that has been SENT cannot be rearranged, and before the send it can',
      () =>
        !!plan &&
        // Vacuity: the same submission is legal a moment earlier, so it is the SEND that
        // refuses it and not anything about the board.
        before.outcome === 'ok' &&
        sent.members.find((m) => m.userId === 'u0')?.done === true &&
        after.outcome === 'closed',
      () => `${before.outcome} then ${after.outcome}`,
    );
  });

  {
    // Nothing trusts the board any more than it trusts a pick. An XI over the budget is
    // refused whole, and so is one with the same person twice.
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
    const me = room.members.find((m) => m.userId === 'u0')!;
    const f = formationOf(me);
    const dearest = (position: string) =>
      roomPlayers(room.rules)
        .filter((p) => p.positions.includes(position as never))
        .sort((a, b) => b.elo - a.elo)[0]!;
    const rich: Filled = {};
    for (const slot of f.slots) rich[slot.id] = dearest(slot.position);
    const over = setXi(room, 'u0', rich, T0 + 1000);

    const one = roomPlayers(room.rules).find((p) => p.positions.length >= 2)!;
    const slotsFor = f.slots.filter((s) => one.positions.includes(s.position)).slice(0, 2);
    const twice: Filled = { [slotsFor[0]!.id]: one, [slotsFor[1]!.id]: one };
    const dup = slotsFor.length === 2 ? setXi(room, 'u0', twice, T0 + 1000) : null;
    check(
      'draft: a board over the budget or holding one man twice is refused whole',
      () =>
        over.outcome === 'illegal' &&
        Object.keys(over.room.xi.u0 ?? {}).length === 0 &&
        (!dup || dup.outcome === 'illegal') &&
        // Vacuity: the same eleven slots ARE fillable inside the budget, so the refusal is
        // about the money and not about the formation.
        (() => {
          const cheap: Filled = {};
          for (const slot of f.slots) {
            const used = new Set(Object.values(cheap).map((p) => p!.personId));
            cheap[slot.id] = roomPlayers(room.rules)
              .filter((p) => p.positions.includes(slot.position) && !used.has(p.personId))
              .sort((a, b) => a.elo - b.elo)[0]!;
          }
          return setXi(room, 'u0', cheap, T0 + 1000).outcome === 'ok';
        })(),
      () => `${over.outcome} / ${dup?.outcome ?? 'n/a'}`,
    );
  }

  {
    // "Go ahead when all players are through", and what "through" has to mean here.
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
    const fill = (r: PvpRoom, who: string): PvpRoom => {
      const m = r.members.find((x) => x.userId === who)!;
      const f = formationOf(m);
      const filled: Filled = {};
      for (const slot of f.slots) {
        const used = new Set(Object.values(filled).map((p) => p!.personId));
        const spent = Object.values(filled).reduce((t, p) => t + pvpPriceOf(p!), 0);
        filled[slot.id] = roomPlayers(r.rules)
          .filter(
            (p) =>
              p.positions.includes(slot.position) &&
              !used.has(p.personId) &&
              pvpPriceOf(p) <= m.budget - spent,
          )
          .sort((a, b) => a.elo - b.elo)[0]!;
      }
      return setXi(r, who, filled, T0 + 1000).room;
    };
    const both = fill(fill(room, 'u0'), 'u1');
    // A COMPLETE XI IS NOT A FINISHED ONE. This is the rule that makes moving and selling
    // usable by the person who fills their last slot last, and without it the two features
    // this change is for would cancel each other out.
    const stillOpen = tickRoom(both, T0 + 2000);
    const first = setDone(both, 'u0', true, T0 + 3000);
    const halfWay = tickRoom(first, T0 + 3500);
    const second = setDone(first, 'u1', true, T0 + 4000);
    const drawn = tickRoom(second, T0 + 4500);
    // And it is reversible while the draft is open.
    const back = setDone(first, 'u0', false, T0 + 3600);
    check(
      'draft: a full XI does not end the draft - saying you are through does, and it is reversible',
      () =>
        both.members.every((m) => xiComplete(both, m)) &&
        stillOpen.status === 'drafting' &&
        halfWay.status === 'drafting' &&
        drawn.status === 'round' &&
        drawn.ties.length === 1 &&
        back.members.find((m) => m.userId === 'u0')!.done !== true &&
        // Nobody can declare an empty team finished, so "everybody is done" can never mean
        // "everybody gave up".
        setDone(room, 'u0', true, T0 + 1000).members.find((m) => m.userId === 'u0')!.done !==
          true,
      () => `${stillOpen.status} / ${halfWay.status} / ${drawn.status}`,
    );

    // And the board is closed to somebody who has declared - they take it back first.
    const after = setXi(first, 'u0', {}, T0 + 3100);
    check(
      'draft: a player who has said they are through cannot quietly change their XI',
      () =>
        after.outcome === 'closed' &&
        Object.keys(after.room.xi.u0 ?? {}).length === 11 &&
        // Vacuity: the same submission from the player who has NOT declared is taken.
        setXi(first, 'u1', {}, T0 + 3100).outcome === 'ok',
      () => after.outcome,
    );
  }

  {
    // The clock running out, which is the other way a whole draft ends.
    withSeed(5211, () => {
      const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
      const deadline = draftDeadlineOf(room)!;
      const before = tickRoom(room, deadline - 1000);
      const after = tickRoom(room, deadline + PICK_GRACE_MS + 1000);
      const legal = after.members.every(
        (m) => validateXi(formationOf(m), after.xi[m.userId] ?? {}, after.rules).ok,
      );
      check(
        'draft: at zero every empty slot is filled and the room draws, with legal XIs',
        () =>
          // Nothing at all happens until the clock runs out: there are no windows to
          // expire, so an untouched budget draft sits exactly where it was.
          before.status === 'drafting' &&
          before.members.every((m) => Object.keys(before.xi[m.userId] ?? {}).length === 0) &&
          after.status === 'round' &&
          after.members.every((m) => xiComplete(after, m)) &&
          legal &&
          // Filled BY THE CLOCK, and recorded as such: `pvp_matches.loser_auto_picks` is
          // one of the three facts a ladder needs to tell a real win from a farmed one.
          Object.values(after.picks.u0 ?? {}).every((p) => p.automatic),
        () => `${before.status} -> ${after.status}, legal ${legal}`,
      );
    });
  }

  // --- A duel's draft, which nobody starts by hand --------------------------
  //
  // THE TWO RULES THIS ADDS, and they only bite together. A duel has no host sitting at a
  // Start button - that is the mode - so the SERVER starts its draft, on the two conditions
  // a live room's countdown arms on: the room is full and everybody is ready. And once it
  // is drafting, the door is shut like any other room's: there is nothing to be late for,
  // because nothing was dealt before both players were in.
  //
  // WHY IT WAITS AT ALL is the part worth keeping. A duel briefly drafted from the moment
  // it was created, and that made re-opening a challenge a free re-roll: the challenger
  // could look at the squad they were dealt and call it off. Nothing is dealt before both
  // are committed, and leaving after that costs the duel (`duelLeaveChecks`).
  //
  // IT IS CHECKED ON A ROLL ROOM ON PURPOSE. The referee's own end-to-end duel is a budget
  // one, where declaring done was already the rule (P52); a roll duel is the case where
  // "eleven picked" used to mean "finished", so it is the one the send button changed.
  {
    const duelOf = (): PvpRoom =>
      createRoom({
        id: 'd1',
        code: 'DU12CD',
        hostId: 'u0',
        hostName: 'Host',
        visibility: 'private',
        size: 2,
        rules: ROLL,
        pickSeconds: 20,
        hostBudget: 0,
        pace: 'async',
        now: T0,
      });

    const fresh = duelOf();
    const readyAlone = tickRoom(setLineup(fresh, 'u0', '4-3-3', 'bal', true), T0 + 1000);
    // Somebody takes it up a day later and is ready; that is what opens both drafts.
    const joined = joinRoom(readyAlone, { userId: 'u1', name: 'Bruno', budget: 0 }, T0 + 60_000);
    const half = tickRoom(joined.room, T0 + 61_000);
    const drafting = tickRoom(setLineup(half, 'u1', '4-3-3', 'bal', true), T0 + 62_000);
    // Two seats, both taken: the third person is too late.
    const third = joinRoom(drafting, { userId: 'u2', name: 'Cleo', budget: 0 }, T0 + 63_000);
    // And the live pace still shuts its door the moment it starts, which is the vacuity
    // guard: without it this check would pass on a state machine that let anybody walk
    // into any draft.
    const liveStarted = startRoom(roomOf(2, ROLL), 'u0', T0);
    const gatecrash = joinRoom(liveStarted, { userId: 'u9', name: 'Late', budget: 0 }, T0 + 1000);

    check(
      'duel: nobody starts its draft by hand, and nothing is dealt until both are in and ready',
      () =>
        // A lobby, and being ready alone in it starts nothing at all.
        fresh.status === 'lobby' &&
        !fresh.startedAt &&
        readyAlone.status === 'lobby' &&
        !readyAlone.deals.u0 &&
        // Somebody is opposite and only one of them is ready: still nothing.
        joined.outcome === 'ok' &&
        half.status === 'lobby' &&
        !half.deals.u0 &&
        // AND THE HOST CANNOT FORCE IT. P48 lets a live room's host start over somebody
        // who has not pressed Ready, which is right when everybody is sitting there and
        // would here deal a squad to a player who has not chosen a shape or agreed to
        // play - and who then could not leave without losing the duel.
        startRoom(half, 'u0', T0 + 61_500) === half &&
        // Vacuity: the same call on a full LIVE lobby does start it.
        startRoom(roomOf(2, ROLL), 'u0', T0).status === 'drafting' &&
        // Both ready, and it opens both drafts at once with a squad each.
        drafting.status === 'drafting' &&
        drafting.startedAt === T0 + 62_000 &&
        (drafting.deals.u0?.length ?? 0) === 1 &&
        (drafting.deals.u1?.length ?? 0) === 1 &&
        !!drafting.windows.u0 &&
        !!drafting.windows.u1 &&
        third.outcome === 'started' &&
        gatecrash.outcome === 'started',
      () =>
        `${fresh.status}, ready alone ${readyAlone.status}, half ${half.status}, ` +
        `drafting ${drafting.status}, third ${third.outcome}`,
    );

    // Eleven picks each, hours apart, with a sweep between each: nothing may expire, and
    // eleven picked is not eleven SENT.
    const draftOut = (from: PvpRoom, who: string, start: number): { room: PvpRoom; at: number } => {
      let room = from;
      let at = start;
      for (let i = 0; i < 11; i++) {
        at += 3 * 60 * 60_000;
        if (!room.windows[who]) break;
        room = submitPick(room, who, firstLegalPick(room, who), at).room;
        room = tickRoom(room, at);
      }
      return { room, at };
    };
    const one = draftOut(drafting, 'u0', T0 + 62_000);
    const full = one.room;
    const sent = tickRoom(setDone(full, 'u0', true, one.at), one.at);
    const two = draftOut(sent, 'u1', one.at + 4 * 24 * 60 * 60_000);
    const both = two.room;
    const waiting = tickRoom(both, two.at);
    const played = tickRoom(setDone(both, 'u1', true, two.at), two.at);

    check(
      'duel: eleven picked is not eleven sent, and the match goes when the second XI is',
      () =>
        // ELEVEN PICKED IS NOT FINISHED HERE. This is the whole of the send button: before
        // it, `draftDone` read a full XI as a finished one, so the eleventh pick would have
        // ended the draft under its owner - with no clock anywhere to have warned them.
        xiComplete(full, full.members[0]!) &&
        !draftDone(full, full.members[0]!) &&
        declaresDone(full) &&
        // One XI sent, days of sweeps, and nothing plays: the other player is still out.
        sent.status === 'drafting' &&
        sent.ties.length === 0 &&
        // Eleven picked by the second player and not sent leaves it waiting...
        xiComplete(both, both.members[1]!) &&
        waiting.status === 'drafting' &&
        waiting.ties.length === 0 &&
        // ...and sending it plays the match, days after the first XI went in.
        played.status === 'round' &&
        played.ties.length === 1,
      () =>
        `${Object.keys(full.xi.u0 ?? {}).length} picked, done ${draftDone(full, full.members[0]!)}, ` +
        `waiting ${waiting.status}, played ${played.status}`,
    );
  }
}
