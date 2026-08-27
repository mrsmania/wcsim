// Characterization checks for wave 5 of docs/pvp-plan.md: reading a room from where one
// player is sitting, and the four controls a room hides.
//
// Everything the versus SCREENS derive is in `domain/pvpView.ts` rather than inside a
// component, which is what lets it be checked here at all. The one thing worth reading
// before changing any of it is the tie flip: home and away are randomised per tie and
// cosmetic (P44), while every match component in this app is written as "you and them",
// so a tie is turned round for the viewer rather than five components being taught that a
// side is a parameter.

import { check } from './harness';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../../src/data/squads';
import { getFormation } from '../../src/domain/formations';
import type { MatchEvent } from '../../src/domain/match';
import {
  REVEAL_JOIN_MS,
  meIn,
  playersOf,
  roomLine,
  shouldReveal,
  tieOf,
  viewerTie,
  xiFrom,
} from '../../src/domain/pvpView';
import type { RoomView, TieView } from '../../src/domain/pvpWire';
import { ROOM_CONTROLS, SOLO_CONTROLS } from '../../src/components/buildControls';

const HOME = 'user-home';
const AWAY = 'user-away';

/** A tie with goals at BOTH ends and a shootout, which is what makes the flip checkable:
 *  a tie whose goals are all one side cannot tell a relabelling from a no-op. */
function fixtureTie(): TieView {
  const events: MatchEvent[] = [
    { minute: 12, side: 'home', scorer: 'A' },
    { minute: 40, side: 'away', scorer: 'B' },
    { minute: 77, side: 'home', scorer: 'C' },
  ];
  return {
    round: 1,
    game: 0,
    homeId: HOME,
    awayId: AWAY,
    homeGoals: 2,
    awayGoals: 1,
    decided: 'pens',
    events,
    pens: {
      kicks: [
        { side: 'home', taker: 'A', scored: true },
        { side: 'away', taker: 'B', scored: false },
      ],
      home: 3,
      away: 2,
      homeWon: true,
    },
    stoppage: [2, 4],
    revealFrom: 1_000_000,
    revealMs: 20_000,
    winnerId: HOME,
  };
}

function fixtureRoom(over: Partial<RoomView> = {}): RoomView {
  return {
    code: 'RM0001',
    visibility: 'private',
    status: 'round',
    hostId: HOME,
    size: 2,
    round: 1,
    championId: null,
    rules: { method: 'budget', budget: 110, years: [] },
    pickSeconds: 20,
    showRatings: true,
    rerolls: 0,
    members: [
      { userId: HOME, seat: 0, name: 'Alpha', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
      { userId: AWAY, seat: 1, name: 'Bravo', ready: true, outIn: null, picked: 7, formationName: '4-3-3', style: 'bal' },
    ],
    you: { userId: HOME, xi: {}, dealt: [], rerollsLeft: 0, budgetLeft: 4, window: null },
    revealed: {},
    ties: [fixtureTie()],
    at: 1_000_000,
    ...over,
  };
}

export function pvpViewChecks(): void {
  // --- The flip is a relabelling, and nothing else ---------------------------
  // The home side wins 50.1% of shootouts (P44), so which end a player was drawn at
  // decides nothing - but every scoreline, every goal in the feed and every kick in the
  // shootout has to read from where they are sitting, or the loser is shown as the winner.
  {
    const tie = fixtureTie();
    const home = viewerTie(tie, HOME);
    const away = viewerTie(tie, AWAY);
    const sides = (e: { side: string }[]) => e.map((x) => x.side).join(',');
    check(
      'pvpView: a tie turned round for the away player swaps every side, both scores and the shootout',
      () =>
        // Vacuity: the fixture really does have goals at both ends and a shootout, or a
        // no-op would pass this.
        new Set(tie.events.map((e) => e.side)).size === 2 &&
        !!tie.pens &&
        // The home player sees the stored tie as it is.
        home.yourGoals === 2 &&
        home.theirGoals === 1 &&
        sides(home.events) === 'home,away,home' &&
        home.won === true &&
        home.opponentId === AWAY &&
        // The away player sees the same match from the other end.
        away.yourGoals === 1 &&
        away.theirGoals === 2 &&
        sides(away.events) === 'away,home,away' &&
        away.pens?.home === 2 &&
        away.pens?.away === 3 &&
        away.pens?.homeWon === false &&
        sides(away.pens.kicks) === 'away,home' &&
        away.won === false &&
        away.opponentId === HOME &&
        // What is NOT the viewer's is untouched: the added time is the server's fact
        // about the match, not about who is watching it.
        home.stoppage?.join() === '2,4' &&
        away.stoppage?.join() === '2,4',
      () => `home ${home.yourGoals}-${home.theirGoals}, away ${away.yourGoals}-${away.theirGoals}`,
    );

    // Turning it round twice is the identity, which is the property that makes it a
    // relabelling rather than a rewrite.
    const back = viewerTie(
      { ...tie, homeId: AWAY, awayId: HOME, events: away.events, pens: away.pens, homeGoals: away.yourGoals, awayGoals: away.theirGoals },
      HOME,
    );
    check(
      'pvpView: turning a tie round twice gives the stored tie back',
      () =>
        back.yourGoals === tie.homeGoals &&
        back.theirGoals === tie.awayGoals &&
        back.events.map((e) => e.side).join() === tie.events.map((e) => e.side).join(),
    );
  }

  // --- Reveal or show the result --------------------------------------------
  // A room whose Realtime is down learns about a kick-off on its next poll, so a client
  // that refuses to reveal anything it did not see stamped shows a result nobody watched.
  // One that reveals whenever it arrives plays a reveal the server cuts off part way.
  {
    const tie = fixtureTie();
    check(
      'pvpView: a reveal is joined at the stamp and not long after, and never without a result',
      () =>
        shouldReveal(tie, tie.revealFrom!) &&
        shouldReveal(tie, tie.revealFrom! + REVEAL_JOIN_MS) &&
        !shouldReveal(tie, tie.revealFrom! + REVEAL_JOIN_MS + 1) &&
        !shouldReveal({ ...tie, decided: null }, tie.revealFrom!) &&
        !shouldReveal({ ...tie, revealFrom: null }, 0),
    );
  }

  // --- Ids on the wire, players in the browser -------------------------------
  // An XI travels as slot -> player id, so this is where it becomes an XI again. An id
  // this build does not hold is DROPPED rather than faked, which the version handshake
  // exists to make impossible in the first place.
  {
    const f = getFormation('4-3-3', 'bal')!;
    const eleven = Object.fromEntries(f.slots.map((s, i) => [s.id, ALL_PLAYERS[i]!.id]));
    const withGhost = { ...eleven, [f.slots[3]!.id]: 'no-such-player-9999' };
    const full = xiFrom(f, eleven);
    const holed = xiFrom(f, withGhost);
    check(
      'pvpView: an XI of ids resolves in slot order, and an id this build lacks is dropped',
      () =>
        playersOf(f, full).length === 11 &&
        playersOf(f, full)[0]!.id === ALL_PLAYERS[0]!.id &&
        Object.keys(holed).length === 10 &&
        !holed[f.slots[3]!.id] &&
        // Vacuity: the ghost id really is absent from the dataset.
        !SQUAD_BY_ID['no-such-squad'] &&
        ALL_PLAYERS.every((p) => p.id !== 'no-such-player-9999'),
    );
  }

  // --- Who is who, and what the chrome says ----------------------------------
  {
    const room = fixtureRoom();
    check(
      'pvpView: the viewer is found, their tie is found, and the strip reads as a sentence',
      () =>
        meIn(room)?.name === 'Alpha' &&
        tieOf(room, 1, AWAY)?.homeId === HOME &&
        tieOf(room, 2, HOME) === null &&
        roomLine({ ...room, status: 'drafting' }) === 'drafting, 11 of 11 picked' &&
        roomLine({ ...room, status: 'lobby' }) === 'waiting, 2 of 2 in, 2 ready' &&
        roomLine({ ...room, status: 'ended', championId: HOME }) === 'you won',
      () => roomLine(room),
    );
  }

  // --- The four controls a room hides (P41), plus the three it turns off -----
  // A LIST rather than a flag, because the list is the decision: each entry breaks the
  // pick clock, or the referee, in its own way. This asserts the two sets are the same
  // shape and are opposites, so a control added to one and forgotten in the other shows
  // up here rather than as a button in a room that does nothing.
  {
    const solo = Object.entries(SOLO_CONTROLS).sort();
    const roomC = Object.entries(ROOM_CONTROLS).sort();
    check(
      `pvpView: all ${solo.length} build controls are on for the app and off in a room`,
      () =>
        solo.length >= 7 &&
        solo.map(([k]) => k).join() === roomC.map(([k]) => k).join() &&
        solo.every(([, v]) => v === true) &&
        roomC.every(([, v]) => v === false),
      () => `solo ${JSON.stringify(SOLO_CONTROLS)}; room ${JSON.stringify(ROOM_CONTROLS)}`,
    );
  }
}
