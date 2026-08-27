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
  agoLine,
  gamesIn,
  lobbyJoinable,
  lobbyLine,
  seatsLine,
  meIn,
  playersOf,
  roomBracket,
  roomLine,
  roundLabel,
  roundsFor,
  shouldReveal,
  spectateTie,
  tieOf,
  viewerTie,
  xiFrom,
} from '../../src/domain/pvpView';
import type { LobbyRoom, RoomView, TieView } from '../../src/domain/pvpWire';
import { readFileSync, readdirSync } from 'node:fs';
import { STRENGTH_BANDS } from '../../src/domain/draft';
import { offersRatingSwitch, ratingBand, roomDisplay } from '../../src/domain/pvpView';
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

/** A room of four, one round in: both semi-finals played and revealing, the final undrawn.
 *  The two scorelines differ (2-1 and 0-3) so a bracket that printed the wrong game's
 *  score would show. */
function fourRoom(over: Partial<RoomView> = {}): RoomView {
  const semi = (game: number, homeId: string, awayId: string, hg: number, ag: number): TieView => ({
    ...fixtureTie(),
    round: 1,
    game,
    homeId,
    awayId,
    homeGoals: hg,
    awayGoals: ag,
    decided: 'reg',
    pens: null,
    winnerId: hg > ag ? homeId : awayId,
  });
  return fixtureRoom({
    size: 4,
    round: 1,
    members: [
      { userId: HOME, seat: 0, name: 'Alpha', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
      { userId: AWAY, seat: 1, name: 'Bravo', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
      { userId: 'u2', seat: 2, name: 'Carla', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
      { userId: 'u3', seat: 3, name: 'Dara', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
    ],
    ties: [semi(0, HOME, AWAY, 2, 1), semi(1, 'u2', 'u3', 0, 3)],
    ...over,
  });
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

  // --- The ratings switch: whose room, which phase (P5, P38, P40) ------------
  // Two rules, and each is a decision. The switch exists in ROLL rooms only, because a
  // budget room shows a price computed straight from the rating it would be hiding - that
  // was the accepted hole P14 recorded, and it is void because the two can no longer
  // co-occur. And the numbers COME BACK at the whistle, because the result is the whole
  // reward and, in a hidden room, the only way to learn whether you misjudged a player.
  {
    const roll = (over: Partial<RoomView>) =>
      fixtureRoom({ rules: { method: 'roll', budget: 0, years: [] }, ...over });
    const hidden = { showRatings: false };
    const phases = (['lobby', 'drafting', 'round'] as const).map(
      (status) => roomDisplay(roll({ ...hidden, status })).ratings,
    );
    check(
      'pvpView: a hidden-ratings roll room hides them until the whistle, and a budget room never does',
      () =>
        // Vacuity: the hidden case really is hidden, in every phase before the result.
        phases.every((shown) => shown === false) &&
        roomDisplay(roll({ ...hidden, status: 'ended' })).ratings &&
        roomDisplay(roll({ showRatings: true, status: 'drafting' })).ratings &&
        // A budget room shows them whatever the flag says: the price IS the rating, so
        // hiding one and showing the other hides nothing.
        roomDisplay(fixtureRoom({ ...hidden, status: 'drafting' })).ratings &&
        // ...and the host is not offered the switch there in the first place.
        offersRatingSwitch('roll') &&
        !offersRatingSwitch('budget'),
      () => `phases: ${phases.join(',')}`,
    );
  }

  // --- The word that replaces a hidden number --------------------------------
  // The thresholds are `STRENGTH_BANDS`, which the random-XI helper has used since long
  // before any of this - a second set of boundaries for the same scale would mean two
  // answers to "is 83 strong". This asserts the whole 60-to-99 range is covered with no
  // gap, that every band is reachable, and that the words only ever go up.
  {
    const scale = Array.from({ length: 40 }, (_, i) => 60 + i);
    const words = scale.map(ratingBand);
    const distinct = [...new Set(words)];
    // Where each word first appears, which must be strictly increasing: a band that
    // reappeared after another would mean the ramp is not monotone.
    const firstAt = distinct.map((w) => words.indexOf(w));
    check(
      `pvpView: every rating from 60 to 99 gets a band word, all ${Object.keys(STRENGTH_BANDS).length} are reachable, and they only go up`,
      () =>
        words.every((w) => w.length > 2) &&
        distinct.length === Object.keys(STRENGTH_BANDS).length &&
        firstAt.every((at, i) => i === 0 || at > firstAt[i - 1]!) &&
        // Each word occupies one contiguous run.
        distinct.every((w) => words.lastIndexOf(w) - words.indexOf(w) + 1 === words.filter((x) => x === w).length) &&
        // An empty line reads as a dash, exactly as the figure does, so a hidden strip
        // has the same shape as an open one.
        ratingBand(0) === '\u2013',
      () => distinct.join(' < '),
    );
  }

  // --- THE ROOM'S SCREENS CANNOT SHOW A RATING BY ACCIDENT -------------------
  // The done-when for this wave, and a structural claim rather than a behavioural one.
  // `BoxScore`, `XiTable` and `SquadPanel` all DEFAULT `ratings` to true, because the
  // single-player callers must read unchanged - which means a room that simply forgot to
  // pass it would show every number and look perfectly fine. So the two doors a room
  // renders rating-bearing UI through, `BuildSurface` and `VersusMatch`, require it, and
  // the versus screens never reach a rating chip directly.
  {
    const dir = 'src/components/versus';
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    const src = (f: string) => readFileSync(`${dir}/${f}`, 'utf8');
    const surface = readFileSync('src/components/BuildSurface.tsx', 'utf8');
    const match = src('VersusMatch.tsx');
    const required = (text: string) => /\n\s*ratings: boolean;/.test(text) && !/ratings\?: boolean;/.test(text);
    // A chip drawn straight into a versus screen would bypass both doors.
    const chips = files.filter((f) => /\bRatingChip\b/.test(src(f)));
    // And the decision has to come from the one place that knows the rules.
    const deciders = files.filter((f) => src(f).includes('roomDisplay'));
    check(
      `pvpView: the room's two doors into ratings require an answer, and its ${files.length} screens draw no chip of their own`,
      () =>
        files.length >= 7 &&
        required(surface) &&
        required(match) &&
        chips.length === 0 &&
        // RoomDraft decides for the draft, RoomScreen for the live match.
        deciders.length >= 2,
      () =>
        chips.length
          ? `RatingChip reached directly in: ${chips.join(', ')}`
          : `BuildSurface required=${required(surface)}, VersusMatch required=${required(match)}, deciders=${deciders.join(',')}`,
    );
  }

  // --- A ROOM OF MORE THAN TWO: the tree, and who watches what (P47, P24) ----
  // Wave 7. The referee has taken four and eight players since wave 3 and its own checks
  // cover the barrier and the random draw; what is new here is entirely a READING of the
  // room, so this is where it is asserted.
  {
    check(
      'pvpView: a room of 2, 4 and 8 plays 1, 2 and 3 rounds, and each round halves the field',
      () =>
        roundsFor(2) === 1 &&
        roundsFor(4) === 2 &&
        roundsFor(8) === 3 &&
        gamesIn(8, 1) === 4 &&
        gamesIn(8, 2) === 2 &&
        gamesIn(8, 3) === 1 &&
        gamesIn(4, 1) === 2 &&
        gamesIn(2, 1) === 1 &&
        // Counted BACK from the final, so the first round of a room of two IS the final
        // and the first round of a room of eight is a quarter-final.
        roundLabel(2, 1) === 'Final' &&
        roundLabel(4, 1) === 'Semi-final' &&
        roundLabel(4, 2) === 'Final' &&
        roundLabel(8, 1) === 'Quarter-final' &&
        roundLabel(8, 2) === 'Semi-final' &&
        roundLabel(8, 3) === 'Final',
      () => `${roundLabel(8, 1)} / ${roundLabel(8, 2)} / ${roundLabel(8, 3)}`,
    );
  }

  {
    // A room of four, one round in: the semi-finals are played and the final is not drawn.
    const room = fourRoom();
    const tree = roomBracket(room, room.at);
    check(
      'pvpView: the tree holds every round of the room, and one not yet drawn reads as empty seats',
      () =>
        tree.length === 2 &&
        tree[0]!.drawn &&
        tree[0]!.games.length === 2 &&
        // The final exists on the tree before anybody is in it, or the wait after the
        // draft would have nothing to show and the shape of the room would be a surprise.
        !tree[1]!.drawn &&
        tree[1]!.games.length === 1 &&
        tree[1]!.games[0]!.home.userId === null &&
        tree[1]!.games[0]!.home.name === '' &&
        tree[1]!.label === 'Final' &&
        // The viewer's own game is marked, and only theirs.
        tree[0]!.games.filter((g) => g.yours).length === 1 &&
        tree[0]!.games[0]!.yours &&
        tree[0]!.games[0]!.home.you,
      () => JSON.stringify(tree.map((r) => [r.label, r.drawn, r.games.length])),
    );
  }

  {
    // THE SPOILER RULE, and the reason it exists: every tie of a round is stamped at the
    // SAME instant and they run for different lengths, so a player watching their own
    // match would otherwise read the result of the tie they are about to be shown,
    // printed on the tree beside it.
    const room = fourRoom();
    const openWindow = room.at; // both reveals still running
    const closed = room.at + 60_000; // both windows long past
    const during = roomBracket(room, openWindow);
    const after = roomBracket(room, closed);
    const scores = (t: ReturnType<typeof roomBracket>) =>
      t[0]!.games.map((g) => `${g.home.goals ?? '-'}:${g.away.goals ?? '-'}`).join(',');
    check(
      'pvpView: a scoreline is held back until its OWN reveal window closes, and appears once it has',
      () =>
        // Vacuity in both directions: the fixture has results, and they really do come
        // out. Without this the check would pass on a bracket that never shows a score.
        during.every((r) => r.games.every((g) => g.home.goals === null && g.away.goals === null)) &&
        during[0]!.games.every((g) => g.live && !g.settled && g.home.won === null) &&
        scores(after) === '2:1,0:3' &&
        after[0]!.games.every((g) => g.settled && !g.live) &&
        // And who went through, which is the other half of the tree.
        after[0]!.games[0]!.home.won === true &&
        after[0]!.games[0]!.away.won === false &&
        after[0]!.games[1]!.away.won === true,
      () => `during ${scores(during)}, after ${scores(after)}`,
    );
  }

  {
    // A KNOCKED-OUT PLAYER WATCHES THE REST (P24), and the default is the game their own
    // conqueror is in - the one match in the round they have a reason to care about,
    // chosen without a control. A room of EIGHT is what makes that checkable: its second
    // round has two ties, so preferring the conqueror's is a different answer from taking
    // the first game, which in a room of four it would not be.
    const semi = (game: number, homeId: string, awayId: string): TieView => ({
      ...fixtureTie(),
      round: 2,
      game,
      homeId,
      awayId,
      decided: 'reg',
      pens: null,
      winnerId: homeId,
    });
    const room = fourRoom({
      size: 8,
      round: 2,
      members: [
        { userId: HOME, seat: 0, name: 'Alpha', ready: true, outIn: 1, picked: 11, formationName: '4-3-3', style: 'bal' },
        { userId: AWAY, seat: 1, name: 'Bravo', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
        { userId: 'u2', seat: 2, name: 'Carla', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
        { userId: 'u3', seat: 3, name: 'Dara', ready: true, outIn: null, picked: 11, formationName: '4-3-3', style: 'bal' },
      ],
      // Alpha lost their quarter-final to Bravo, who is in the SECOND semi.
      ties: [
        { ...fixtureTie(), round: 1, game: 0, homeId: AWAY, awayId: HOME, winnerId: AWAY, decided: 'reg', pens: null },
        semi(0, 'u2', 'u3'),
        semi(1, AWAY, 'u2'),
      ],
    });
    const watching = spectateTie(room);
    // Somebody still IN gets nothing to spectate: their own match is the screen.
    const stillIn = spectateTie({ ...room, you: { ...room.you!, userId: 'u3' } });
    // And a viewer whose conqueror also went out falls back to the first game rather than
    // to nothing, or the screen would be blank for them.
    const orphan = spectateTie({
      ...room,
      ties: room.ties.map((t) => (t.game === 1 && t.round === 2 ? { ...t, homeId: 'u9' } : t)),
    });
    check(
      'pvpView: a knocked-out player is shown the tie their own conqueror is in, a player still in is shown none, and an orphan gets the first game',
      () =>
        // Vacuity: the round really has two ties, and the conqueror's is NOT the first, so
        // "take game 0" would be a different answer.
        room.ties.filter((t) => t.round === 2).length === 2 &&
        !!watching &&
        watching.game === 1 &&
        (watching.homeId === AWAY || watching.awayId === AWAY) &&
        stillIn === null &&
        orphan?.game === 0,
      () =>
        `watching game ${watching?.game}, stillIn ${stillIn ? 'a tie' : 'null'}, orphan game ${orphan?.game}`,
    );
  }

  {
    // A spectated tie is turned round for its OWN home player, which is the identity: the
    // header comment claims nothing is relabelled, and that is what makes it safe to hand
    // two other people's match to a card written for "you and them".
    const tie = fixtureTie();
    const neutral = viewerTie(tie, tie.homeId);
    const flipped = viewerTie(tie, tie.awayId);
    check(
      'pvpView: turning a tie round for its own home player changes nothing, where turning it for the away player does',
      () =>
        neutral.yourGoals === tie.homeGoals &&
        neutral.theirGoals === tie.awayGoals &&
        neutral.events.map((e) => e.side).join() === tie.events.map((e) => e.side).join() &&
        neutral.pens?.home === tie.pens?.home &&
        // Vacuity: the flip is not a no-op for everybody, or this asserts nothing.
        flipped.yourGoals !== neutral.yourGoals,
      () => `${neutral.yourGoals}-${neutral.theirGoals} vs ${flipped.yourGoals}-${flipped.theirGoals}`,
    );
  }

  {
    // The chrome's strip is the ROOM's own sentence, and in a room of eight that means the
    // round rather than "match on". It is written once, here, and held on the pointer the
    // chrome reads - the chrome used to compose a second one out of a status and a count.
    const eight = fourRoom({ size: 8, round: 1 });
    check(
      'pvpView: the room strip names the round it is playing, and a room of two still reads as its final',
      () =>
        roomLine(eight) === 'quarter-final on' &&
        roomLine({ ...eight, round: 3 }) === 'final on' &&
        roomLine({ ...eight, size: 2, round: 1 }) === 'final on' &&
        roomLine({ ...eight, status: 'lobby', members: eight.members.slice(0, 2) }) ===
          'waiting, 2 of 8 in, 2 ready',
      () => roomLine(eight),
    );
  }

  // --- THE PUBLIC LOBBY LIST (P18) ------------------------------------------
  // Wave 8. A row is read by somebody who has never seen the room, so it says what the room
  // IS TO PLAY rather than what its columns are set to - the same rule the room settings
  // themselves are written under.
  {
    const budget: LobbyRoom = {
      code: 'AB12CD',
      size: 4,
      seated: 2,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
      rerolls: 3,
      showRatings: true,
      hostName: 'Ada',
      openedAt: 1_000_000,
    };
    const roll: LobbyRoom = { ...budget, method: 'roll', rerolls: 1, showRatings: false };
    check(
      'pvpView: a lobby row says what the room is to PLAY, and a hidden-ratings roll room says so',
      () =>
        lobbyLine(budget) === 'Buy an XI with $110, 20s a pick' &&
        // One re-roll is not "1 re-rolls", and the hidden-ratings note only appears when it
        // is true - which is the whole reason a budget room never carries it (P5).
        lobbyLine(roll) === 'Roll for your XI, 1 re-roll, 20s a pick, ratings hidden' &&
        lobbyLine({ ...roll, rerolls: 3, showRatings: true }) ===
          'Roll for your XI, 3 re-rolls, 20s a pick' &&
        !lobbyLine(budget).includes('ratings'),
      () => `${lobbyLine(budget)} | ${lobbyLine(roll)}`,
    );
    check(
      'pvpView: a row counts the seats LEFT, and a room that filled says Full rather than offering a join',
      () =>
        seatsLine(budget) === '2 of 4 seats left' &&
        seatsLine({ ...budget, seated: 3 }) === '1 of 4 seat left' &&
        seatsLine({ ...budget, seated: 4 }) === 'Full' &&
        // Vacuity in the direction that matters: the joinable test really does flip.
        lobbyJoinable(budget) &&
        !lobbyJoinable({ ...budget, seated: 4 }) &&
        !lobbyJoinable({ ...budget, seated: 5 }),
      () => `${seatsLine(budget)} / ${seatsLine({ ...budget, seated: 4 })}`,
    );
    check(
      'pvpView: an age is coarse on purpose, and a clock that has run backwards reads as just now',
      () =>
        agoLine(1_000_000, 1_000_000) === 'just now' &&
        agoLine(1_000_000, 1_000_000 + 59_000) === 'just now' &&
        agoLine(1_000_000, 1_000_000 + 61_000) === '1 minute ago' &&
        agoLine(1_000_000, 1_000_000 + 5 * 60_000) === '5 minutes ago' &&
        agoLine(1_000_000, 1_000_000 + 61 * 60_000) === '1 hour ago' &&
        agoLine(1_000_000, 1_000_000 + 3 * 3600_000) === '3 hours ago' &&
        // A phone whose clock is behind the server's must not read "-4 minutes ago".
        agoLine(1_000_000, 500_000) === 'just now',
      () => agoLine(1_000_000, 1_000_000 + 61_000),
    );
  }

  {
    // A room that CLOSED is not a room that finished, and the chrome's strip is one of the
    // two places a player is told either (P31).
    const room = fixtureRoom({ status: 'ended', championId: null, ties: [] });
    check(
      'pvpView: the strip tells a closed room from a finished one, and from a won one',
      () =>
        roomLine(room) === 'closed' &&
        // Vacuity both ways: with a champion it reads as a result, and with the viewer as
        // the champion it reads as a win.
        roomLine({ ...room, championId: AWAY }) === 'finished' &&
        roomLine({ ...room, championId: HOME }) === 'you won',
      () => roomLine(room),
    );
  }

  // --- THE BUTTONS ARE ONE SIZE (2026-08-27) --------------------------------
  // Every versus screen shipped using the outline button's IDENTITY-ONLY token bare, so
  // ten buttons had no padding and no text size - which reads as a mistake rather than as
  // a smaller button. The fix was to name the safe one the plain name: `SECONDARY_BTN` now
  // carries the same box as `PRIMARY_BTN`, and the deliberate choice is
  // `SECONDARY_BTN_BASE`, matching `PRIMARY_BTN_BASE`. These two assertions are what stop
  // it coming back, because nothing about a bare token LOOKS wrong in a diff.
  {
    const ui = readFileSync('src/components/matchUi.tsx', 'utf8');
    const box = 'inline-flex items-center justify-center gap-2 px-5 py-3 text-[13px]';
    check(
      'pvpView: the solid and outline buttons carry the same box, so the two line up side by side',
      () =>
        // Both sized tokens are built from the same literal, and each is the base plus it.
        new RegExp(`export const PRIMARY_BTN =\\s*\`${box.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\$\\{PRIMARY_BTN_BASE\\}\``).test(ui) &&
        new RegExp(`export const SECONDARY_BTN =\\s*\`${box.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\$\\{SECONDARY_BTN_BASE\\}\``).test(ui) &&
        // And the identity-only halves are still identity only: no layout in either.
        !/export const PRIMARY_BTN_BASE =\s*\n?\s*'[^']*\bp[xy]-/.test(ui) &&
        !/export const SECONDARY_BTN_BASE =\s*\n?\s*'[^']*\bp[xy]-/.test(ui),
      () => 'matchUi.tsx no longer builds PRIMARY_BTN and SECONDARY_BTN from the same box',
    );
  }

  {
    const dir = 'src/components/versus';
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    // A bare identity token is the defect. Reaching for it deliberately is fine - the
    // lobby list's row action wants a tighter box than the page-level one - so the rule is
    // that it must be accompanied by padding, not that it must not appear.
    const naked: string[] = [];
    for (const f of files) {
      // The import list mentions the token and has no box beside it, which is correct and
      // not a use, so the imports come off first.
      const src = readFileSync(`${dir}/${f}`, 'utf8').replace(/^import[\s\S]*?';$/gm, '');
      const parts = src.split('SECONDARY_BTN_BASE');
      for (let i = 1; i < parts.length; i++) {
        if (!/\bpy-[\d.[]/.test(parts[i - 1]!.slice(-220))) naked.push(`${f}#${i}`);
      }
    }
    // Vacuity: the scan has to be finding the real uses, or it proves nothing.
    const uses = files.reduce(
      (n, f) =>
        n +
        (readFileSync(`${dir}/${f}`, 'utf8')
          .replace(/^import[\s\S]*?';$/gm, '')
          .split('SECONDARY_BTN_BASE').length -
          1),
      0,
    );
    check(
      `pvpView: every deliberate use of the identity-only outline token brings its own box (${uses} of them)`,
      () => uses >= 1 && naked.length === 0,
      () => `no padding beside: ${naked.join(', ')}`,
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
