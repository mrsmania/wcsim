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
import type { Player } from '../../src/data/types';
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
import { FORMATIONS_DATA, STYLES, getFormation } from '../../src/domain/formations';
import { resolveKoTie } from '../../src/domain/knockout';
import { xiStrength } from '../../src/domain/match';
import { verifyCaller } from '../../src/domain/pvpAuth';
import {
  botsIn,
  humansIn,
  setBots,
  DRAFT_SLACK_MS,
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
  draftDeadlineOf,
  draftDone,
  formationOf,
  joinRoom,
  recoverFromOutage,
  reduceSize,
  remainingBudget,
  rerollDeal,
  setDone,
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

  botChecks();
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
}
