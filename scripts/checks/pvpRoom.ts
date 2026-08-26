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
import { roomPlayers, roomSquads, validateXi, type RoomRules } from '../../src/domain/pvp';
import type { Filled } from '../../src/domain/draft';
import { FORMATIONS_DATA, STYLES, getFormation } from '../../src/domain/formations';
import { verifyCaller } from '../../src/domain/pvpAuth';
import {
  PICK_GRACE_MS,
  PICK_SECONDS,
  createRoom,
  deadlineOf,
  formationOf,
  joinRoom,
  recoverFromOutage,
  reduceSize,
  remainingBudget,
  rerollDeal,
  startRoom,
  submitPick,
  tickRoom,
  xiComplete,
  type PickSeconds,
  type PvpRoom,
  type RoomSize,
} from '../../src/domain/pvpRoom';

const BUDGET: RoomRules = { method: 'budget', budget: 110, years: [] };
const ROLL: RoomRules = { method: 'roll', budget: 0, years: [] };
const T0 = 1_000_000;

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
  });
  for (let i = 1; i < size; i++) {
    room = joinRoom(room, { userId: `u${i}`, name: `P${i}`, budget: rules.budget }).room;
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
  const slot = f.slots.find((s) => !filled[s.id])!;
  const pool =
    room.rules.method === 'roll'
      ? roomPlayers(room.rules).filter((p) => p.squadId === room.deals[userId]?.slice(-1)[0])
      : roomPlayers(room.rules);
  // Skip anyone already in this XI: the cheapest man for two different slots is often
  // the SAME man, and a duplicate person is refused as illegal, so without this the
  // helper silently hands back picks that never land.
  const used = new Set(Object.values(filled).map((p) => p!.personId));
  const player = pool
    .filter((p) => p.positions.includes(slot.position) && !used.has(p.personId))
    .sort((a, b) => a.elo - b.elo)[0]!;
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
    const full = joinRoom(room, { userId: 'zz', name: 'Late', budget: 110 });
    const dupe = joinRoom(room, { userId: 'u0', name: 'Host again', budget: 110 });
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
    const room = startRoom(roomOf(2, BUDGET, seconds), 'u0', T0);
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
    // A retry that resends the ordinal already taken is a replay, not a second spent
    // window (P36). This is the flaky-mobile-link case.
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
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
    const room = startRoom(roomOf(2, BUDGET), 'u0', T0);
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
      let room = startRoom(roomOf(4, BUDGET), 'u0', T0);
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
    const room = startRoom(roomOf(2, BUDGET, 20), 'u0', T0);
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
}
