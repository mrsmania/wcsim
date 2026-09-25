// Characterization checks for wave 5 of docs/pvp-plan.md: reading a room from where one
// player is sitting, and the four controls a room hides.
//
// Everything the versus SCREENS derive is in `domain/pvpView.ts` rather than inside a
// component, which is what lets it be checked here at all. The one thing worth reading
// before changing any of it is the tie flip: home and away are randomised per tie and
// cosmetic (P44), while every match component in this app is written as "you and them",
// so a tie is turned round for the viewer rather than five components being taught that a
// side is a parameter.

import { check, codeOnly } from './harness';
import { FEATURES } from '../../src/config';
import { screenOf } from '../../src/state/routes';
import { ALL_PLAYERS, SQUAD_BY_ID, datasetPlayer } from '../../src/data/squads';
import { categoryOf } from '../../src/data/types';
import { placedPlayers } from '../../src/domain/draft';
import { lineAverages } from '../../src/domain/match';
import { pvpTeam } from '../../src/domain/pvp';
import { getFormation } from '../../src/domain/formations';
import type { MatchEvent } from '../../src/domain/match';
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_ROOM_BUDGET,
  DRAFT_SECONDS,
  ROOM_BUDGETS,
} from '../../src/domain/pvpRoom';
import {
  KICKOFF_HOLD_SECONDS,
  KICKOFF_SECONDS,
  REVEAL_JOIN_MS,
  agoLine,
  answerIsFresh,
  duelAlert,
  duelAlertLine,
  duelDowngraded,
  duelLine,
  duelListed,
  duelOpenLine,
  duelRules,
  duelSeats,
  duelToOpen,
  duelTurn,
  everybodyReady,
  gamesIn,
  inviteText,
  inviteUrl,
  joinTarget,
  isDuel,
  leaveKind,
  seatsOf,
  lobbyJoinable,
  inviteNote,
  inviteRules,
  inviteState,
  lobbyLine,
  playsLine,
  seatCounts,
  seatsLine,
  meIn,
  playersOf,
  roomBracket,
  myRoomLine,
  roomLine,
  roomRules,
  roundLabel,
  roundsFor,
  shouldReveal,
  spectateTie,
  tieOf,
  viewerTie,
  walkover,
  xiFrom,
  xiStrengthFrom,
} from '../../src/domain/pvpView';
import type {
  DuelRow,
  InviteRoom,
  LobbyRoom,
  MyRoom,
  RoomView,
  TieView,
} from '../../src/domain/pvpWire';
import { readFileSync, readdirSync } from 'node:fs';
import { STRENGTH_BANDS } from '../../src/domain/draft';
import { offersRatingSwitch, ratingBand, roomDisplay } from '../../src/domain/pvpView';
import {
  ROOM_CONTROLS,
  SOLO_CONTROLS,
  roomControls,
  type BuildControls,
} from '../../src/components/buildControls';
import { duelsChanged, onDuelsChanged } from '../../src/state/pvp/duels';
import { botName } from '../../src/domain/pvpBot';
import { NAME_MAX, validateName } from '../../src/domain/displayName';

/** A name being taken apart in a versus screen: the shape of the bracket bug below.
 *  Module scope so the pattern is written once and read in the check that uses it. */
const SPLIT_A_NAME = /\bname\b[^\n]*\.\bsplit\b/;

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
        roomLine({ ...room, status: 'drafting' }) === 'Drafting, 11 of 11 picked' &&
        roomLine({ ...room, status: 'lobby' }) === 'Waiting, 2 of 2 in, 2 ready' &&
        roomLine({ ...room, status: 'ended', championId: HOME }) === 'You won',
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

  // --- THE BOARD MAKES NO RECOMMENDATION A ROOM DOES NOT BACK ----------------
  // The held player's natural slot pulses amber and every other slot he can fill pulses
  // white, which is the single-player board telling you where the chemistry point and the
  // Textbook honour are. A room awards neither (P25), so there the two collapse into one
  // amber and every eligible slot pulses alike.
  //
  // Source-level for the same reason the ratings check above is: `Pitch` defaults the flag
  // to true so the single-player caller reads unchanged, so a room that stopped passing it
  // would paint the two colours again and look perfectly fine. Three lines carry it - the
  // control, the wiring, and the one place the colour is decided.
  {
    const pitch = readFileSync('src/components/Pitch.tsx', 'utf8');
    const surface = readFileSync('src/components/BuildSurface.tsx', 'utf8');
    // White survives in exactly one place: the constant, and the ternary that may or may
    // not reach for it. A third mention is an arm that paints white whatever the room says.
    const whites = (pitch.match(/SLOT_WHITE/g) ?? []).length;
    check(
      'pvpView: a room pulses one colour, because it pays nothing for a natural position',
      () =>
        /const SLOT_OTHER = naturalHint \? SLOT_WHITE : SLOT_AMBER;/.test(pitch) &&
        whites === 2 &&
        /naturalHint=\{controls\.naturalHint\}/.test(surface) &&
        // The two sets say which way round it goes, and the app is the vacuity guard: a
        // control that was false in both would pass every line above.
        SOLO_CONTROLS.naturalHint &&
        !ROOM_CONTROLS.naturalHint &&
        !roomControls(true).naturalHint,
      () =>
        `Pitch mentions SLOT_WHITE ${whites} time(s); BuildSurface wires it ` +
        `${/naturalHint=\{controls\.naturalHint\}/.test(surface)}`,
    );
  }

  // --- THE LINE-UP SHEET CARRIES NO ALBUM MARK IN A ROOM ---------------------
  // A room awards no sticker and prices nothing off the album (P3, P8), so the tier star
  // and the tier-coloured accent down a row are pointing at a collection this game cannot
  // add to. `SquadPanel` and `BudgetMarket` have taken the switch since wave 5; the sheet
  // that lists the finished XI had not, so both the draft's own line-up and the result
  // screen's two XIs went on marking collectibles.
  //
  // Source-level, and for the same reason as the two checks above: `XiTable` defaults the
  // flag to true so the single-player callers read unchanged, which means a room that
  // simply stopped passing it would show every star and look perfectly fine.
  {
    const dir = 'src/components/versus';
    const table = readFileSync('src/components/XiTable.tsx', 'utf8');
    const surface = readFileSync('src/components/BuildSurface.tsx', 'utf8');
    const result = readFileSync(`${dir}/RoomResult.tsx`, 'utf8');
    // One gate, on the one thing both marks are drawn from.
    const gated = /FEATURES\.stickerAlbum && collectibles \? tierOf\(player\) : null/.test(table);
    // Read the CALL, not the file: `collectibles={controls.collectibles}` is also how the
    // market and the drawn-squad panel take it, so a whole-file grep would go on passing
    // with the sheet's own line deleted.
    const callIn = (text: string) => /<XiTable\b[\s\S]*?\/>/.exec(text)?.[0] ?? '';
    const inBuild = callIn(surface);
    const inResult = callIn(result);
    // And no versus screen reaches a star or a tier of its own, either.
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    const marked = files.filter((f) =>
      /\bCollectibleStar\b|\btierOf\b/.test(readFileSync(`${dir}/${f}`, 'utf8')),
    );
    check(
      'pvpView: the line-up sheet drops the album marks in a room, and keeps them in the game',
      () =>
        gated &&
        // Both calls found, or the two tests under them are vacuously true of an empty string.
        inBuild !== '' &&
        inResult !== '' &&
        inBuild.includes('collectibles={controls.collectibles}') &&
        inResult.includes('collectibles={false}') &&
        marked.length === 0 &&
        // Which way round, with the app as the vacuity guard: a control that was false in
        // both would satisfy every line above and take the stars out of the album's own game.
        SOLO_CONTROLS.collectibles &&
        !ROOM_CONTROLS.collectibles &&
        !roomControls(true).collectibles,
      () =>
        marked.length
          ? `a collectible mark is drawn straight into: ${marked.join(', ')}`
          : `XiTable gated=${gated}, BuildSurface wires it ` +
            `${inBuild.includes('collectibles={controls.collectibles}')}, ` +
            `RoomResult off=${inResult.includes('collectibles={false}')}`,
    );
  }

  // --- THE RESULT PRINTS THE FIGURES THE TIE WAS PLAYED ON -------------------
  // The result screen shows Ovr / Att / Def over both XIs, which in a hidden-ratings room
  // is the first time either player sees a number at all. The trap is that the app has TWO
  // readings of those three figures and they disagree: the build page promotes the filled
  // slot to the front of a player's positions (`placedPlayers`), so a centre-back played at
  // holding midfield counts towards the attack, while a room resolves every pick in the
  // dataset and never promotes, so `pvpTeam` groups that man by his dataset role and the
  // tie is decided with him in the DEFENCE. Reusing the build page's derivation here would
  // print an Att the match was not played on, which is exactly the lie decision D7 fixed on
  // the other screen.
  {
    const f = getFormation('4-3-3', 'def')!;
    // Pinned by id: Piazza is a centre-back who can hold midfield, so the two readings of
    // this XI cannot agree - which is what makes the claim below testable.
    const swing = datasetPlayer('bra-1970-3')!;
    const dm = f.slots.find((s) => s.position === 'DM')!;
    const ids: Record<string, string> = {};
    let i = 0;
    for (const slot of f.slots) {
      if (slot.id === dm.id) {
        ids[slot.id] = swing.id;
        continue;
      }
      while (ALL_PLAYERS[i]!.id === swing.id) i += 1;
      ids[slot.id] = ALL_PLAYERS[i++]!.id;
    }
    const filled = xiFrom(f, ids);
    const shown = xiStrengthFrom(f, ids);
    // What the referee's own sim reads off the same slot map.
    const played = pvpTeam({
      id: HOME,
      name: 'Alpha',
      code: 'ALP',
      players: playersOf(f, filled),
    }).strength;
    // And the build page's reading of it, which is the one this must NOT be.
    const promoted = lineAverages(placedPlayers(f, filled));
    check(
      "pvpView: the result's three figures are the simulator's own, not the board's promoted ones",
      () =>
        // Vacuity: a full XI, and a swing player who really does cross the two groups.
        Object.keys(filled).length === 11 &&
        categoryOf(swing.positions[0]!) === 'DEF' &&
        swing.positions.includes('DM') &&
        shown.overall === played.overall &&
        shown.attack === played.attack &&
        shown.defense === played.defense &&
        // Discrimination: the promoted reading moves both group averages on this XI, so a
        // screen that reused it would be caught here rather than in a browser.
        promoted.attack !== played.attack &&
        promoted.defense !== played.defense &&
        promoted.overall === played.overall,
      () =>
        `shown ${JSON.stringify(shown)} played ${JSON.stringify(played)} ` +
        `promoted ${JSON.stringify(promoted)}`,
    );

    // And both teams get one. Source-level, because one component draws a team's column
    // and the screen renders it twice: a strip inside `XiOf` is two strips on the page, and
    // a strip moved out of it would be one - which no fixture can see.
    const result = readFileSync('src/components/versus/RoomResult.tsx', 'utf8');
    const strip = /<RatingStrip\b[\s\S]*?\/>/.exec(result)?.[0] ?? '';
    const columns = (result.match(/<XiOf\b/g) ?? []).length;
    check(
      'pvpView: the result screen gives each team a ratings strip, on the figures its match used',
      () =>
        strip !== '' &&
        strip.includes('xiStrengthFrom(') &&
        // The switch is named at the call site, as it is for the sheet beside it.
        /\bratings\b/.test(strip) &&
        (result.match(/<RatingStrip\b/g) ?? []).length === 1 &&
        columns === 2,
      () => `strip=${strip.replace(/\s+/g, ' ')} columns=${columns}`,
    );
  }

  // --- WINNING THE ROOM RAINS THE CUP-WIN CONFETTI, ONCE ---------------------
  // The same rain the single-player cup win uses, and the same rule behind it: winning is
  // a MOMENT, while `status: 'ended'` is a property a room keeps for ever. So the gate is
  // the TRANSITION into the result - which is one rule covering both ways a winner reaches
  // it, the live room going from `round` to `ended` under them and a duel opened days
  // later playing its reveal first - and a second look starts on the result and stays
  // there, so nothing falls.
  //
  // SOURCE-LEVEL, because nothing behavioural can see it: a version that rained off the
  // status alone shows exactly the same screen with exactly the same confetti on it the
  // first time, and only differs on the second look. The two mutations worth guarding are
  // therefore raining off the status, and treating the first thing a mount sees as a
  // transition (which would rain on the loading render of every revisit).
  {
    const screen = readFileSync('src/components/versus/RoomScreen.tsx', 'utf8');
    const cupRun = readFileSync('src/components/CupRunScreen.tsx', 'utf8');
    const render = /\{celebrating && <Confetti \/>\}/.test(screen);
    check(
      'pvpView: the room winner gets the cup-win rain, on the transition into the result',
      () =>
        // The SHARED component, so the room's celebration cannot drift from the game's.
        /import Confetti from '\.\.\/Confetti'/.test(screen) &&
        render &&
        // Gated on having won, and on the result actually being the thing on screen -
        // never on the status, which an ended room carries for ever.
        /setCelebrating\(showingResult && wonRoom\)/.test(screen) &&
        /const wonRoom = [^;]*view\.championId === view\.you\.userId/.test(screen) &&
        // The first thing a mount sees is not a transition, and neither is no room at all:
        // without both of these a revisit rains on the render after the read lands.
        /if \(!view\) return;[^]{0,200}before === undefined \|\| before === showingResult/.test(
          screen,
        ) &&
        // A walkover is a win with no football under it, and is left flat on purpose.
        /showingResult =[^;]*!walkover\(view\)/.test(screen) &&
        // Vacuity, in both directions: the single-player screen really does rain the same
        // component under the same name, so this is the game's own celebration rather than
        // a string that happens to match; and the room's own render was found at all.
        /import Confetti from '\.\/Confetti'/.test(cupRun) &&
        /\{celebrating && <Confetti \/>\}/.test(cupRun),
      () => `render=${render}`,
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

  // --- A NAME IN THE TREE IS THE WHOLE NAME ----------------------------------
  // Reported from a room of four with two practice opponents in it: the bracket, the
  // winner box and the pot each read `The`, because the cells printed the FIRST WORD of a
  // name and `The Reserves` and `The Academy` share one. Nothing needed shortening in the
  // first place - a display name is capped at NAME_MAX and every practice-opponent name is
  // inside that too - so the cells truncate in CSS, where an ellipsis at least says a name
  // was cut.
  //
  // The vacuity guard is the inverted one and it is the point of the check: the names are
  // asserted to be AMBIGUOUS by first word, so a build that went back to shortening them
  // that way is naming two different opponents the same thing rather than merely looking
  // untidy. A future set of bot names that happened to start with distinct words would
  // fail here and should be re-thought, not re-worded.
  {
    // Every name a practice opponent can play under, in the order `botName` hands them
    // out, plus the numbered fallback that follows the curated list.
    const bots: string[] = [];
    for (let i = 0; i < 40; i++) {
      const next = botName(bots);
      bots.push(next);
      if (/^Practice XI /.test(next)) break;
    }
    const firstWord = (n: string) => n.split(/\s+/)[0] ?? n;
    const dir = 'src/components/versus';
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
    const src = (f: string) => readFileSync(`${dir}/${f}`, 'utf8');
    const tree = src('RoomBracket.tsx');
    const css = readFileSync('src/index.css', 'utf8');
    // Nothing that draws a room may take a name apart. Source-level because no fixture can
    // see it: a shortened name renders perfectly, it just names the wrong nobody.
    const splitters = files.filter((f) => SPLIT_A_NAME.test(src(f)));
    check(
      `pvpView: a room prints a name whole, and the ${bots.length - 1} practice-opponent names need it`,
      () =>
        // A room of eight can need seven of them, so the curated list is not a token one.
        bots.length - 1 >= 7 &&
        new Set(bots).size === bots.length &&
        // Every one of them is a name the screens are already built to hold: legal, and
        // inside the bound a person's own name is held to.
        bots.every((n) => validateName(n).ok && [...n].length <= NAME_MAX) &&
        // THE INVERTED GUARD: by first word they are not distinct, which is the bug.
        new Set(bots.map(firstWord)).size < bots.length &&
        // And the tree renders the name itself, truncating rather than amputating. The
        // truncation is the cup bracket's own `.bkt-nm` rule, so both halves are asserted:
        // grepping the screen for the word `truncate` alone would pass on the pot's chips
        // while a seat printed a name in full and let it push the box open.
        /\{seat\.name\}/.test(tree) &&
        /bkt-nm/.test(tree) &&
        /\.bkt-nm\s*\{[^}]*text-overflow:\s*ellipsis/.test(css) &&
        splitters.length === 0,
      () =>
        `${bots.length} names, ${new Set(bots.map(firstWord)).size} distinct first words` +
        (splitters.length ? `, split in ${splitters.join(', ')}` : ''),
    );
  }

  {
    // A ROOM'S TREE IS THE CUP RUN'S TREE, down to the stylesheet. Source-level because
    // nothing behavioural can see a design: a room that went back to drawing its own
    // columns of cards would render perfectly and simply look like a different game on a
    // screen reached from the same tab bar as the one it copies.
    //
    // The two figures the cup's tree fixes for a 16-team draw - how tall it stands, and
    // how narrow it may get before it scrolls - are variables now, with the cup's own
    // numbers as the fallbacks, so a room of four can be shorter without moving the Cup
    // Run at all. Both halves are asserted, since a room sizing itself by overwriting
    // those literals is the change that would quietly resize the cup's.
    const tree = readFileSync('src/components/versus/RoomBracket.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');
    const shared = [
      'bkt-wrap',
      'bkt-wide',
      'bkt-narrow',
      'bkt-match',
      'bkt-seed',
      'bkt-pair',
      'bkt-mtree',
      'bkt-cup',
    ];
    // As a whole class rather than as a substring: `bkt-cup` is inside `bkt-cup-lbl`, so
    // a room that dropped the champion node and kept its label would pass a plain
    // `includes`, which is the shape of every mutation worth catching here.
    const whole = (s: string, c: string) => new RegExp(`${c}(?![\\w-])`).test(s);
    const missing = shared.filter((c) => !whole(tree, c) || !whole(css, `\\.${c}`));
    check(
      'pvpView: a room draws the cup bracket itself, and sizes it without moving the cup',
      () =>
        missing.length === 0 &&
        // The room's own two sizes...
        /\.bkt-of-4\s*\{[^}]*--bkt-h/.test(css) &&
        /\.bkt-of-8\s*\{[^}]*--bkt-h/.test(css) &&
        /bkt-of-4/.test(tree) &&
        /bkt-of-8/.test(tree) &&
        // ...over the cup's own, which are still what a tree with nothing to say gets.
        /min-width:\s*var\(--bkt-w,\s*840px\)/.test(css) &&
        /height:\s*var\(--bkt-h,\s*560px\)/.test(css),
      () => (missing.length ? `not shared: ${missing.join(', ')}` : 'the sizing moved'),
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
        roomLine(eight) === 'Quarter-final on' &&
        roomLine({ ...eight, round: 3 }) === 'Final on' &&
        roomLine({ ...eight, size: 2, round: 1 }) === 'Final on' &&
        roomLine({ ...eight, status: 'lobby', members: eight.members.slice(0, 2) }) ===
          'Waiting, 2 of 8 in, 2 ready',
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
      draftSeconds: 300,
      rerolls: 3,
      showRatings: true,
      hostName: 'Ada',
      openedAt: 1_000_000,
    };
    const roll: LobbyRoom = { ...budget, method: 'roll', rerolls: 1, showRatings: false };
    check(
      'pvpView: a lobby row says what the room is to PLAY, and a hidden-ratings roll room says so',
      () =>
        lobbyLine(budget) === 'Buy an XI with $110, 5 min to draft' &&
        // One re-roll is not "1 re-rolls", and the hidden-ratings note only appears when it
        // is true - which is the whole reason a budget room never carries it (P5).
        lobbyLine(roll) === 'Roll for your XI, 1 re-roll, 20s a pick, ratings hidden' &&
        lobbyLine({ ...roll, rerolls: 3, showRatings: true }) ===
          'Roll for your XI, 3 re-rolls, 20s a pick',
      () => `${lobbyLine(budget)} | ${lobbyLine(roll)}`,
    );
    // --- THE CLOCK ON THE ROW IS THE ONE THE ROOM RUNS -----------------------
    // This was wrong for as long as the whole-draft change has been live (P52). The row
    // printed `pickSeconds` whatever the method, so a BUYING room - which opens no pick
    // window at all - was advertised to strangers as "20s a pick". Not merely an imprecise
    // number: a mechanism that room does not have, told to the one reader who cannot see
    // inside it.
    //
    // THE FALLBACK IS SILENCE, NOT THE OLD FIGURE, which is the half worth pinning. A
    // referee built before the field sends none, and `pickSeconds` is always there and
    // always tempting - reaching for it is exactly the bug coming back.
    check(
      'pvpView: a buying room prints the WHOLE-DRAFT clock, and never a per-pick one',
      () => {
        const older: LobbyRoom = { ...budget, draftSeconds: undefined };
        return (
          // Every length the referee takes, in whole minutes, because the question is how
          // long an evening this is rather than a countdown.
          lobbyLine({ ...budget, draftSeconds: 180 }) === 'Buy an XI with $110, 3 min to draft' &&
          lobbyLine({ ...budget, draftSeconds: 480 }) === 'Buy an XI with $110, 8 min to draft' &&
          // No pick window is ever named on a buying row, at any length...
          DRAFT_SECONDS.every((d) => !lobbyLine({ ...budget, draftSeconds: d }).includes('a pick')) &&
          // ...and a row with no draft length names no clock at all rather than that one.
          lobbyLine(older) === 'Buy an XI with $110' &&
          !lobbyLine(older).includes('pick') &&
          lobbyLine({ ...older, bots: 2 }) === 'Buy an XI with $110, 2 practice opponents' &&
          // The discrimination guard: a ROLLING row still prints its pick clock, which is
          // the clock that room does run. Without this, deleting the clock entirely passes.
          lobbyLine({ ...roll, showRatings: true }).includes('20s a pick') &&
          !lobbyLine({ ...roll, showRatings: true }).includes('to draft')
        );
      },
      () =>
        `${lobbyLine(budget)} | older: ${lobbyLine({ ...budget, draftSeconds: undefined })}`,
    );
    // --- THE SAME RULE ONE SCREEN IN: the lobby's own bullets -----------------
    //
    // The panel a player reads just before they are dealt a squad had the identical bug, in
    // a paragraph rather than on a row: it printed `pickSeconds` whatever the room played,
    // so a BUYING room promised a per-pick window it never opens (P52) and a DUEL promised a
    // clock it has none of at all (P51). Nothing behavioural can see it - every one of those
    // was a perfectly good screen saying something untrue - so the facts are a derivation and
    // this is what holds them.
    //
    // THE FALLBACK IS SILENCE AGAIN, for the same reason: `view.pickSeconds` is always there
    // and always tempting, and reaching for it on a budget room is exactly the bug coming
    // back.
    check(
      'pvpView: a room states its rules one fact a line, and never a clock it does not run',
      () => {
        const buy = fixtureRoom({ status: 'lobby', size: 4, draft: { totalMs: 300_000, remainingMs: null } });
        const rollRoom = fixtureRoom({
          status: 'lobby',
          size: 8,
          rules: { method: 'roll', budget: 0, years: [] },
          rerolls: 3,
          draft: null,
        });
        const duel = fixtureRoom({
          status: 'lobby',
          pace: 'async',
          size: 2,
          rules: { method: 'roll', budget: 0, years: [] },
          rerolls: 1,
        });
        const older = fixtureRoom({ status: 'lobby', size: 4, draft: null });
        return (
          // Every bullet is short enough to be one, which is the whole request: nothing
          // here is a sentence to be read to the end.
          [buy, rollRoom, duel, older]
            .flatMap(roomRules)
            .every((r) => r.length <= 34 && !r.includes('. ')) &&
          // THE FACTS AND THEIR ORDER, up to and including the bracket. Sliced rather
          // than joined whole on purpose: what the lobby chooses to say AFTER them is a
          // copy decision somebody may take either way, and pinning it here would make
          // this check fail for a reason that has nothing to do with what it guards.
          roomRules(buy).slice(0, 3).join(' | ') ===
            'Buy an XI with $110 | 5 min to draft | 2 knockout rounds' &&
          // A roll room names its re-rolls and its pick window, and one is not "1 re-rolls".
          roomRules(rollRoom).slice(0, 4).join(' | ') ===
            'Roll squads, one man from each | 3 re-rolls each | 20s a pick | 3 knockout rounds' &&
          roomRules(duel).includes('1 re-roll each') &&
          roomRules({ ...rollRoom, rerolls: 0 }).includes('No re-rolls') &&
          // THE CLOCK, three ways. A buying room never names a pick window...
          !roomRules(buy).some((r) => r.includes('a pick')) &&
          // ...a duel names no clock at all, at either scale...
          !roomRules(duel).some((r) => r.includes('a pick') || r.includes('to draft')) &&
          roomRules(duel).includes('Build in your own time') &&
          // ...and a buying room from a referee too old to send the block says nothing
          // rather than falling back to the figure that is always there.
          !roomRules(older).some((r) => r.includes('a pick') || r.includes('to draft')) &&
          // The room's own size decides the bracket, and two people play one match.
          roomRules(duel).includes('One match') &&
          // Discrimination: a ROLLING live room does still print the clock it runs, or
          // deleting every clock would satisfy the three claims above.
          roomRules(rollRoom).includes('20s a pick')
        );
      },
      () => roomRules(fixtureRoom({ status: 'lobby' })).join(' | '),
    );
    // The lobby renders them AS BULLETS and keeps no copy of the facts, which is the half
    // of the request no assertion about strings can see.
    {
      const lobby = codeOnly(readFileSync('src/components/versus/RoomLobby.tsx', 'utf8'));
      check(
        'pvpView: the lobby draws the rules as a bullet list off `roomRules`, with no prose copy of them',
        () =>
          /roomRules\(view\)\.map/.test(lobby) &&
          lobby.includes('list-disc') &&
          // Vacuity: it is the rules block being read, and the ratings house rule is still
          // the emphasised last bullet rather than having gone with the paragraph.
          lobby.includes('The rules') &&
          /!view\.showRatings/.test(lobby) &&
          lobby.includes('text-amber-ink') &&
          // And none of the facts is written out here any more - the paragraph named the
          // clock and the rounds itself, which is how it came to name the wrong clock.
          !lobby.includes('seconds a pick') &&
          !/roundsFor\(/.test(lobby),
        () => `${/roomRules\(view\)\.map/.test(lobby)} / ${lobby.includes('list-disc')}`,
      );
    }
    check(
      'pvpView: a row says how many chairs the host filled with practice opponents, and none is silent',
      () =>
        // It changes what turning up MEANS - the room can start the moment you arrive, and
        // one of your ties may be against a seat rather than a person.
        lobbyLine({ ...budget, bots: 2 }) ===
          'Buy an XI with $110, 5 min to draft, 2 practice opponents' &&
        lobbyLine({ ...budget, bots: 1 }) ===
          'Buy an XI with $110, 5 min to draft, 1 practice opponent' &&
        lobbyLine({ ...roll, bots: 1 }).endsWith(', 1 practice opponent') &&
        // Zero says nothing, and so does a referee too old to have sent the field at all -
        // which is the state the deployment is actually in until the container is rebuilt.
        lobbyLine({ ...budget, bots: 0 }) === lobbyLine(budget) &&
        !lobbyLine(budget).includes('practice'),
      () => lobbyLine({ ...budget, bots: 2 }),
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

  // --- WHAT AN INVITATION SAYS BEFORE ANYBODY SIGNS IN ----------------------
  //
  // A room is account-only (P17), so a link lands on a sign-in screen - and for as long as
  // that screen could not read the room, the most motivated arrival in the product was
  // shown a six-character code and a paragraph of general pitch. These are the two
  // sentences it shows now, both built out of the ones the lists already write.
  {
    const live: InviteRoom = {
      code: 'AB12CD',
      pace: 'live',
      status: 'lobby',
      size: 4,
      seated: 2,
      method: 'budget',
      budget: 110,
      pickSeconds: 20,
      draftSeconds: 300,
      rerolls: 3,
      showRatings: true,
      hostName: 'Ada',
      openedAt: 1_000_000,
    };
    const duel: InviteRoom = { ...live, pace: 'async', size: 2, seated: 1, method: 'roll' };
    check(
      'pvpView: an invitation to a duel does not promise the pick clock a duel has not got',
      () =>
        // A live room gets the public list's own sentence, whichever clock that room runs.
        inviteRules(live) === lobbyLine(live) &&
        inviteRules(live).includes('5 min to draft') &&
        // The pick clock is a ROLLING room's, here as everywhere. This line used to read
        // `live` for it and passed only because `lobbyLine` printed a pick window over a
        // buying room - the very bug being closed - so it would have gone on asserting the
        // wrong sentence about the most motivated reader in the product.
        inviteRules({ ...live, method: 'roll' }).includes('20s a pick') &&
        !inviteRules(live).includes('a pick') &&
        // A DUEL DOES NOT, and this is the trap the pace guards: a duel stores a
        // `pickSeconds` it never reads (`tickDuel`), so `lobbyLine` would tell a stranger
        // about a twenty-second window that does not exist in the mode they are joining.
        //
        // IT SAYS EVERYTHING ELSE THE LOBBY ROW SAYS (2026-09-24): the same opening words
        // and the same re-roll count, since those are real in a duel - it is the clock and
        // the practice opponents that are not. It used to read "one man from each squad",
        // which named the method in words the public list does not use and then stopped.
        inviteRules(duel) === 'Roll for your XI, 3 re-rolls' &&
        inviteRules({ ...duel, showRatings: false }) === 'Roll for your XI, 3 re-rolls, ratings hidden' &&
        inviteRules({ ...duel, method: 'budget' }) === 'Buy an XI with $110' &&
        !inviteRules(duel).includes('pick') &&
        // And it is the LOBBY's own sentence minus those two, rather than a second one
        // that happens to agree today: the live room with the same settings differs by
        // exactly the clock.
        lobbyLine({ ...live, method: 'roll' }) === `${inviteRules(duel)}, 20s a pick` &&
        // Vacuity: the two really are different sentences for the same room settings.
        inviteRules({ ...live, method: 'roll' }) !== inviteRules({ ...duel, method: 'roll' }),
      () => `${inviteRules(live)} | ${inviteRules(duel)}`,
    );
    check(
      'pvpView: an invitation says where the room has got to, and a duel and a room read differently at every state',
      () =>
        inviteState(live) === 'open' &&
        inviteState({ ...live, seated: 4 }) === 'full' &&
        inviteState({ ...live, status: 'drafting' }) === 'started' &&
        inviteState({ ...live, status: 'ended' }) === 'over' &&
        // An ENDED room is over however many seats it has free, which is the ordering the
        // state function depends on: a finished room's members have not gone anywhere.
        inviteState({ ...live, status: 'ended', seated: 0 }) === 'over' &&
        // A duel's own reading. "1 of 2 seats left" is true and says nothing; whether
        // anybody has taken the challenge up is the whole of what its sender is waiting on.
        inviteNote(duel).includes('Nobody has taken this one up') &&
        inviteNote({ ...duel, seated: 2 }).includes('already taken this one up') &&
        inviteNote(live).startsWith('2 of 4 seats left') &&
        inviteNote({ ...live, seated: 4 }) === 'Every seat is taken at the moment.' &&
        // Vacuity, the direction that matters: the same state does NOT produce the same
        // sentence for the two paces, or the branch would be decorative.
        inviteNote(duel) !== inviteNote({ ...live, size: 2, seated: 1 }) &&
        inviteNote({ ...duel, status: 'ended' }) === inviteNote({ ...live, status: 'ended' }),
      () => `${inviteNote(live)} | ${inviteNote(duel)}`,
    );

    // THE READ IS UNAUTHENTICATED, WHICH IS THE ONE THING NO FIXTURE CAN SEE. Every other
    // call in `state/pvp/referee.ts` fetches a session token first and throws `signed-out`
    // when there is none - which is every visitor this screen exists for. A `readInvite`
    // "tidied up" to go through `call` would type-check, pass everything above, and show
    // the bare code to every person who ever followed a link.
    {
      const client = readFileSync('src/state/pvp/referee.ts', 'utf8');
      const screen = readFileSync('src/components/versus/VersusScreen.tsx', 'utf8');
      const body = client.slice(client.indexOf('export async function readInvite'));
      const fn = body.slice(0, body.indexOf('\n}'));
      check(
        'pvpView: the invitation is read without a session, and the signed-out screen is what reads it',
        () =>
          // It fetches for itself, exactly as the version handshake does, and never
          // through the helper that demands a token.
          /fetch\(`\$\{REFEREE\.url\}\/v1\/rooms\//.test(fn) &&
          // `call<T>(` as well as `call(`, since the tidy-up this guards against is a
          // typed one: `call<InviteRoom>('GET', ...)` reads like every other line in that
          // file and is exactly the edit that breaks this screen.
          !/\bcall[<(]/.test(fn) &&
          !fn.includes('bearer(') &&
          // Every failure is one answer: the screen falls back to the code alone, which is
          // also how this client behaves against a referee too old to have the route.
          /return null/.test(fn) &&
          // Vacuity, three ways: the scan found a real function, the helper it must not use
          // does exist and does demand a token, and the screen wires the pair up.
          fn.length > 120 &&
          /async function call<T>/.test(client) &&
          /const token = await bearer\(\)/.test(client) &&
          screen.includes('readInvite') &&
          screen.includes('inviteRules') &&
          screen.includes('inviteNote'),
        () => `${fn.length} chars; call ${/\bcall[<(]/.test(fn)}; screen ${screen.includes('readInvite')}`,
      );
    }
  }

  {
    // A room that CLOSED is not a room that finished, and the chrome's strip is one of the
    // two places a player is told either (P31).
    const room = fixtureRoom({ status: 'ended', championId: null, ties: [] });
    check(
      'pvpView: the strip tells a closed room from a finished one, and from a won one',
      () =>
        roomLine(room) === 'Closed' &&
        // Vacuity both ways: with a champion it reads as a result, and with the viewer as
        // the champion it reads as a win.
        roomLine({ ...room, championId: AWAY }) === 'Finished' &&
        roomLine({ ...room, championId: HOME }) === 'You won',
      () => roomLine(room),
    );
  }

  // --- The whole room, and the kick-off ------------------------------------
  //
  // A LOBBY IS MOSTLY ABOUT WHO IS NOT THERE YET, and the countdown is the one thing in
  // this feature that happens on several screens at once without anybody being told to do
  // it: it is DERIVED from the room every client already holds, which is what lets it need
  // no server route and nothing deployed.
  {
    const seat = (userId: string, n: number, ready: boolean, bot = false) => ({
      userId,
      seat: n,
      name: userId,
      ready,
      outIn: null,
      picked: 0,
      formationName: '4-3-3',
      style: 'bal',
      bot,
    });
    const room = (members: ReturnType<typeof seat>[], size = 4): RoomView =>
      fixtureRoom({ size, members, status: 'lobby' });
    const two = room([seat('a', 0, true), seat('b', 1, false)]);
    const rows = seatsOf(two);
    check(
      'pvpView: every chair in the room is a row, and the ones nobody is in are empty',
      () =>
        rows.length === 4 &&
        rows.filter((r) => r === null).length === 2 &&
        // In seat order, and the people first: an empty chair is not somebody's place
        // being held, it is the end of the list.
        rows[0]?.userId === 'a' &&
        rows[1]?.userId === 'b' &&
        rows[2] === null &&
        // A seat NUMBER has gaps in it - the liveness sweep leaves one behind - so the
        // padding counts rows rather than indexing by seat.
        seatsOf(room([seat('a', 7, true)])).length === 4 &&
        // A full room has no empty rows at all, which is the vacuity guard in the other
        // direction: a function that always padded would fail here.
        seatsOf(room([seat('a', 0, true), seat('b', 1, true)], 2)).every((r) => r !== null),
      () => JSON.stringify(rows.map((r) => r?.userId ?? null)),
    );
    check(
      'pvpView: a room starts itself only when every seat is taken AND everybody is ready',
      () =>
        // Not full: two of four.
        !everybodyReady(two) &&
        // Full but somebody is still choosing (P48 keeps the host's Start for exactly this).
        !everybodyReady(
          room([seat('a', 0, true), seat('b', 1, true), seat('c', 2, true), seat('d', 3, false)]),
        ) &&
        // Full and all ready.
        everybodyReady(
          room([seat('a', 0, true), seat('b', 1, true), seat('c', 2, true), seat('d', 3, true)]),
        ) &&
        // A PRACTICE OPPONENT IS ALWAYS READY, so a host who filled the chairs starts the
        // moment they are ready themselves - which is the whole point of having filled them.
        everybodyReady(
          room([seat('a', 0, true), seat('b', 1, true, true), seat('c', 2, true, true), seat('d', 3, true, true)]),
        ) &&
        // And never once the football has started: the draft is not something to count
        // down to twice.
        !everybodyReady({
          ...room([seat('a', 0, true), seat('b', 1, true)], 2),
          status: 'drafting',
        }) &&
        // The count is a beat, not a wait, and the hold at zero is longer than a poll plus
        // a round trip - it is what stops a dead host tab leaving everybody on that screen.
        KICKOFF_SECONDS >= 2 &&
        KICKOFF_SECONDS <= 5 &&
        KICKOFF_HOLD_SECONDS > KICKOFF_SECONDS - 2,
      () => `${KICKOFF_SECONDS}s then ${KICKOFF_HOLD_SECONDS}s`,
    );
  }

  // --- The pick clock is a proportion, so it needs the window ---------------
  // It was a big numeral until 2026-08-30 and it is a draining bar now, which changed what
  // it depends on: a number needs only the time left, a BAR needs the length of the window
  // it is a fraction of. The host chooses twenty or thirty (P20), so a hardcoded twenty
  // here would draw a thirty-second window as full for its first ten seconds - and a
  // literal agrees with nothing and disagrees with nothing either, which is exactly how
  // P20 went unbuilt for three waves. Source-level because there is nothing to run.
  {
    const clock = readFileSync('src/components/versus/versusUi.tsx', 'utf8');
    const draft = readFileSync('src/components/versus/RoomDraft.tsx', 'utf8');
    const props = /export function PickClock\(\{[^}]*\}: \{([^]*?)\n\}\) \{/.exec(clock)?.[1] ?? '';
    check(
      'pvpView: the pick clock draws a bar against the ROOM\'s window length, never a literal',
      () =>
        // It takes the window, and it is required rather than defaulted.
        /\n\s*windowMs: number;/.test(props) &&
        !/windowMs\?/.test(props) &&
        // And the one caller feeds it the room's own figure.
        /windowMs=\{view\.pickSeconds \* 1000\}/.test(draft) &&
        // Vacuity: the scan really did find the component's props, and the bar it draws.
        props.includes('remainingMs') &&
        clock.includes('role="progressbar"'),
      () => `props found: ${props.length > 0}, caller wires it: ${/windowMs=/.test(draft)}`,
    );
  }

  // --- The invitation ------------------------------------------------------
  // A room is opened and then PASTED INTO A MESSAGE, so the link is the invitation and the
  // code is what you say out loud. The base path is the thing to get wrong: this build is
  // served from `/` on its own domain and can be a subpath elsewhere, and a link that
  // hardcoded either would be dead from the other.
  //
  // THE CODE TRAVELS AS A QUERY ON THE HOME PAGE, not as a path, and that is what these
  // assertions are really guarding. The path form is the app's own route and reads better,
  // and it previewed as nothing in every chat client, because GitHub Pages answers a deeper
  // address with a 404 status even while serving the app from its 404 file. The reasoning
  // is in `inviteUrl`'s header. A "tidy-up" back to the route form would look like an
  // improvement, break no test that existed before this, and silently un-fix it.
  {
    check(
      'pvpView: an invite link lands on the home page with the code in a query, under whichever base path this build is served from',
      () =>
        inviteUrl('https://x.github.io', '/wcsim/', 'AB12CD') ===
          'https://x.github.io/wcsim/?join=AB12CD' &&
        inviteUrl('https://play.example', '/', 'AB12CD') ===
          'https://play.example/?join=AB12CD' &&
        // A base without its trailing slash, and an origin with one, are both survivable:
        // the two come from different places (Vite, and the browser) and only one of them
        // promises a shape.
        inviteUrl('https://x.dev/', '/wcsim', 'AB12CD') === 'https://x.dev/wcsim/?join=AB12CD' &&
        // THE POINT: nothing beyond the base sits in the path. This is the assertion that
        // fails if anybody puts the route back into the link, and it reads the parsed URL
        // rather than the string, so it cannot be satisfied by a query that merely happens
        // to contain the word.
        new URL(inviteUrl('https://x.dev', '/', 'AB12CD')).pathname === '/' &&
        new URL(inviteUrl('https://x.dev', '/wcsim/', 'AB12CD')).pathname === '/wcsim/' &&
        // The text carries the code, because a message gets read aloud and a link does not.
        inviteText('AB12CD').includes('AB12CD') &&
        // AND IT CARRIES NO LINK AT ALL. `navigator.share` takes the sentence and the link
        // as two fields and most targets paste both, so a sentence ending in the address
        // sends it twice. The guard against a vacuous test here is the second line: the
        // link this is checked against has to be a real one, or "does not contain it" is
        // true of anything.
        inviteUrl('https://x.dev', '/', 'AB12CD').startsWith('https://') &&
        !inviteText('AB12CD').includes(inviteUrl('https://x.dev', '/', 'AB12CD')) &&
        !/https?:/.test(inviteText('AB12CD')),
      () => `${inviteUrl('https://x.github.io', '/wcsim/', 'AB12CD')} | ${inviteText('AB12CD')}`,
    );
  }

  // --- The invitation, read back at the other end --------------------------
  // `inviteUrl` and `joinTarget` are two halves of one thing and neither is worth checking
  // alone: the link is only right if the boot can turn it back into a route, and that route
  // is only right if `screenOf` agrees it is a room. So this walks the whole way round,
  // from the link a lobby hands you to the screen the app decides to show.
  {
    const roundTrip = (origin: string, base: string, code: string) =>
      joinTarget(new URL(inviteUrl(origin, base, code)).search, base);

    check(
      'pvpView: the link a lobby hands out is read back as the room route, under either base path',
      () =>
        roundTrip('https://play.example', '/', 'AB12CD') === '/versus/AB12CD' &&
        roundTrip('https://x.github.io', '/wcsim/', 'AB12CD') === '/wcsim/versus/AB12CD' &&
        roundTrip('https://x.dev/', '/wcsim', 'AB12CD') === '/wcsim/versus/AB12CD',
      () => String(roundTrip('https://play.example', '/', 'AB12CD')),
    );

    // The end of the round trip has to be a real route, which is the property that actually
    // matters and the one nothing else asserts: a target `screenOf` does not call a room
    // would land the arriving guest on the front page with their invitation spent. The flag
    // is read the way the route table reads it, since with no referee configured
    // `/versus/...` is legitimately not a route at all.
    check(
      'pvpView: the route an invitation resolves to is one the app calls a versus room',
      () => screenOf('/versus/AB12CD') === (FEATURES.pvp ? 'versus' : 'unknown'),
      () => screenOf('/versus/AB12CD'),
    );

    // A query parameter is typed by anybody, so the reader validates rather than trusting.
    // Junk has to come back as no route at all, or a value like `../../x` would be handed
    // straight to `history.replaceState`.
    const junk = [
      '',
      '?join=',
      '?join=AB',
      '?join=THISCODEISWAYTOOLONG',
      '?join=../../x',
      '?join=AB 12',
      '?other=AB12CD',
    ];
    check(
      `pvpView: ${junk.length} malformed or absent join parameters resolve to no route at all`,
      () => junk.every((q) => joinTarget(q, '/') === null),
      () => junk.map((q) => `${q || '(empty)'} -> ${joinTarget(q, '/')}`).join(' | '),
    );

    // THE VACUITY GUARD for the block above, and it is not decoration: every assertion
    // there would pass a `joinTarget` that returned null for absolutely everything, which
    // would leave every invitation in the game landing on the front page. So a real code
    // has to survive, and case has to be forgiving, because a code can lose its case
    // passing through a chat client - which is why `VersusScreen` uppercases its own
    // parameter too. A trailing tracking parameter has to survive as well, since a chat
    // client is entitled to add one.
    check(
      'pvpView: a real code survives the reader, in either case and beside another parameter',
      () =>
        joinTarget('?join=AB12CD', '/') === '/versus/AB12CD' &&
        joinTarget('?join=ab12cd', '/') === '/versus/AB12CD' &&
        joinTarget('?join=AB12CD&utm=x', '/') === '/versus/AB12CD',
      () => String(joinTarget('?join=ab12cd', '/')),
    );
  }

  // --- Reading a duel (P51) ------------------------------------------------
  // A DUEL SPANS DAYS, so the question somebody opens the page with is never "what is the
  // score" - it is "is there anything for me to do". `duelTurn` is that answer in one word,
  // and it is the only reason the list is worth having, so the four states it can return
  // are worth pinning here rather than reading off a screen.
  //
  // THE TRAP IS THAT ELEVEN PICKED IS NOT ELEVEN SENT (2026-08-31). A duel's draft ends
  // when its players SAY it does, so a full XI nobody has sent is still that player's move
  // - and reading the pick counts alone, as this used to, puts "waiting for them" on the
  // one screen that is waiting for you.
  {
    const row = (over: Partial<DuelRow> = {}): DuelRow => ({
      code: 'DU0001',
      opponentName: 'Bravo',
      yours: true,
      status: 'drafting',
      seated: 2,
      method: 'budget',
      budget: 110,
      yourPicks: 0,
      theirPicks: 0,
      yourDone: false,
      theirDone: false,
      openedAt: 1_000,
      touchedAt: 1_000,
      ...over,
    });
    const turns = [
      // Nobody has taken it up: sent, and waiting on a person rather than on a draft.
      duelTurn(row({ seated: 1, yourPicks: 11, yourDone: true })),
      // Not sent yet, however far along it is. Both of these used to read "theirs".
      duelTurn(row({ yourPicks: 4 })),
      duelTurn(row({ yourPicks: 11 })),
      // Sent, and they are still building.
      duelTurn(row({ yourPicks: 11, yourDone: true, theirPicks: 4 })),
      duelTurn(row({ status: 'round', yourDone: true, theirDone: true })),
      duelTurn(row({ status: 'ended', yourGoals: 2, theirGoals: 1, won: true })),
    ];
    check(
      'pvpView: a duel row says whose move it is, and a full XI is not a sent one',
      () =>
        turns.join() === 'sent,yours,yours,theirs,theirs,done' &&
        // The words follow the turn rather than the status, which is what makes the list
        // scannable: one line, from the reader's own side.
        duelLine(row({ seated: 1, yourPicks: 11, yourDone: true })) ===
          'Sent. Waiting for somebody to take it up' &&
        duelLine(row({ yourPicks: 4 })).includes('Your move') &&
        duelLine(row({ yourPicks: 11 })) === 'Your XI is ready to send' &&
        duelLine(row({ status: 'ended', yourGoals: 2, theirGoals: 1, won: true })) ===
          'You won 2-1' &&
        // A duel that ended without a match says so rather than printing a score it has not
        // got: withdrawing and the week are both ordinary endings.
        duelLine(row({ status: 'ended' })) === 'Closed unplayed' &&
        // And what it PLAYS, which is the row's second line.
        duelRules({ method: 'budget', budget: 110 }).includes('$110') &&
        duelRules({ method: 'roll', budget: 0 }).includes('Roll'),
      () => turns.join(),
    );

    // --- WHAT IS ON THE LIST AT ALL, AND WHAT IS NOT ------------------------
    //
    // A DUEL THAT ENDED WITHOUT AN OUTCOME IS NOT A GAME THAT WAS PLAYED, and it was being
    // filed under "Played" - which is simply untrue of a challenge nobody took up and its
    // sender called off, or one nobody touched for a week. A WALKOVER is the opposite case
    // and has to stay: somebody lost that one, and the row is the whole record of it from
    // their side.
    {
      const home = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
      check(
        'pvpView: an unplayed duel is off the list, and a walkover is not',
        () =>
          // Anything still running, whatever it has or has not got on it.
          duelListed(row({ status: 'lobby' })) &&
          duelListed(row({ status: 'drafting' })) &&
          duelListed(row({ status: 'round' })) &&
          // A played result, from either side.
          duelListed(row({ status: 'ended', yourGoals: 2, theirGoals: 1, won: true })) &&
          duelListed(row({ status: 'ended', yourGoals: 0, theirGoals: 1, won: false })) &&
          // A walkover: a winner, a loser, and no football.
          duelListed(row({ status: 'ended', walkover: true, won: false })) &&
          // And the two that are not games: called off, and left for a week.
          !duelListed(row({ status: 'ended' })) &&
          !duelListed(row({ status: 'ended', won: null })) &&
          // The words follow, so a walkover is not read as a defeat with the score missing.
          duelLine(row({ status: 'ended', walkover: true, won: false })) === 'You walked away' &&
          duelLine(row({ status: 'ended', walkover: true, won: true })) ===
            'They walked away, you win' &&
          // The screen actually applies it: a filter defined and never called would pass
          // every assertion above and change nothing at all.
          /\.filter\(duelListed\)/.test(home),
        () =>
          `closed ${duelListed(row({ status: 'ended' }))}, ` +
          `walkover ${duelListed(row({ status: 'ended', walkover: true, won: false }))}, ` +
          `applied ${/\.filter\(duelListed\)/.test(home)}`,
      );
    }

    // --- A CHAMPION WITH NO TIE UNDER IT ------------------------------------
    //
    // The encoding a walkover has instead of a column: a room that was WON, with no match
    // beneath it, which a duel that actually played can never be. It is read at both ends -
    // by the result screen, to say who walked instead of printing a scoreline it has not
    // got, and by `pvp_records`, to count the loss.
    {
      const ended = (over: Partial<RoomView>): RoomView =>
        fixtureRoom({ pace: 'async', status: 'ended', ...over });
      const tie = fixtureRoom({ status: 'round' }).ties[0]!;
      check(
        'pvpView: a walkover is a champion with no match under it, and nothing else is',
        () =>
          walkover(ended({ championId: HOME, ties: [] })) &&
          // A duel that played has its tie, so it is a result rather than a walkover...
          !walkover(ended({ championId: HOME, ties: [tie] })) &&
          // ...and a room that closed has no champion, which is the other encoding
          // (`roomClosed`) and must not be confused with this one.
          !walkover(ended({ championId: null, ties: [] })) &&
          // Nothing that has not finished is one, however empty it looks.
          !walkover(fixtureRoom({ status: 'lobby', championId: null, ties: [] })),
        () =>
          `${walkover(ended({ championId: HOME, ties: [] }))} / ` +
          `${walkover(ended({ championId: HOME, ties: [tie] }))}`,
      );
    }

    // A ROW FROM THE REFEREE THAT IS DEPLOYED RIGHT NOW has none of the three fields the
    // reading above is built on, because the client ships by pushing to `main` and the
    // server is rebuilt by hand. It must read the way it always did rather than reading as
    // "your move" for ever in the chrome's strip: there, finishing WAS filling the eleventh
    // slot, and a duel that was drafting at all had both seats taken.
    {
      const legacy = (over: Partial<DuelRow> = {}): DuelRow => {
        const r = row({ status: 'drafting', ...over });
        delete r.seated;
        delete r.yourDone;
        delete r.theirDone;
        return r;
      };
      check(
        'pvpView: a duel row from a referee that predates the reshape reads the way it used to',
        () =>
          duelTurn(legacy({ yourPicks: 4 })) === 'yours' &&
          duelTurn(legacy({ yourPicks: 11, theirPicks: 4 })) === 'theirs' &&
          // Vacuity, and the whole reason this exists: the SAME row carrying the new fields
          // says the opposite, which is the reading that would otherwise be applied to it.
          duelTurn(row({ status: 'drafting', yourPicks: 11, yourDone: false })) === 'yours',
        () => `${duelTurn(legacy({ yourPicks: 11, theirPicks: 4 }))}`,
      );
    }

    // WHAT THE CHROME INTERRUPTS SOMEBODY FOR, which is two things and not four: a team
    // that is not sent, and a match that has been played and not watched. The second
    // outranks the first, and it is the one that needs a LOCAL fact - whether this browser
    // has sat through the reveal - because the server has no business recording that.
    const none: ReadonlySet<string> = new Set();
    const seen: ReadonlySet<string> = new Set(['DU0001']);
    const finished = row({ status: 'ended', yourGoals: 2, theirGoals: 1, won: true });
    const mine = row({ yourPicks: 4 });
    const theirs = row({ yourPicks: 11, yourDone: true, theirPicks: 2 });
    check(
      'pvpView: the chrome is offered a result to watch first, a draft second, and nothing else',
      () =>
        duelAlert(finished, none) === 'watch' &&
        // Watched once and it stops asking, which is the whole reason the set exists.
        duelAlert(finished, seen) === null &&
        duelAlert(mine, none) === 'your-move' &&
        duelAlert(theirs, none) === null &&
        // A duel that closed without a match has nothing to watch.
        duelAlert(row({ status: 'ended' }), none) === null &&
        // The result wins over the draft, whatever order the list arrives in.
        duelToOpen([mine, finished], none)?.alert === 'watch' &&
        duelToOpen([finished, mine], none)?.alert === 'watch' &&
        duelToOpen([theirs, mine], none)?.row.code === mine.code &&
        duelToOpen([theirs], none) === null &&
        // And the sentence names the thing rather than the state.
        duelAlertLine(finished, 'watch').includes('Bravo') &&
        duelAlertLine(row({ yourPicks: 11 }), 'your-move') === 'Your XI is ready to send',
      () => `${duelAlert(finished, none)} / ${duelAlert(mine, none)}`,
    );

    // AND THE STRIP COUNTS NOTHING, which was reported from the game: it is fed by the
    // chrome's thirty-second poll while the board is answered on the tap, so a figure there
    // sits still while the XI fills up underneath it. The count is unreliable exactly where
    // it is redundant - picking is the only thing that moves it, and the draft screen is
    // printing it live one line below - so it goes rather than being chased.
    //
    // THE LIST ROW IS THE VACUITY GUARD, and it is not decoration: "the strip has no
    // number" is trivially true of a build that dropped every count everywhere, which is
    // the other way to be wrong about the same thing. The versus page is where the figure
    // lives, and it is still there.
    check(
      'pvpView: the chrome strip says a duel wants you and does not count the picks',
      () =>
        duelAlertLine(mine, 'your-move') === 'Your move, pick your XI' &&
        !/[0-9]/.test(duelAlertLine(mine, 'your-move')) &&
        // Built but not sent is a different instruction and is still said. It splits on the
        // count without printing it, so a stale reading falls back to the safer sentence.
        duelAlertLine(row({ yourPicks: 11 }), 'your-move') === 'Your XI is ready to send' &&
        duelLine(mine).includes('4 of 11'),
      () => `${duelAlertLine(mine, 'your-move')} / ${duelLine(mine)}`,
    );

    // A REFEREE OLDER THAN DUELS DOES NOT REFUSE ONE, and that is what makes this worth a
    // check rather than a comment: `pace` is a field it has never heard of, so it reads
    // past it and opens an ordinary live room of two - a 201, a code, and the wrong game.
    // The create path therefore tests the ANSWER rather than the status, and both call
    // sites close the room they were handed instead of walking into it.
    {
        const old = fixtureRoom({ status: 'lobby' });
        delete (old as { pace?: string }).pace;
        const src = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
        const rematch = readFileSync('src/components/versus/DuelPanels.tsx', 'utf8');
        check(
            'pvpView: a duel answered with an ordinary room is caught, and the room is closed',
            () =>
                // A referee that predates duels sends no pace at all.
                duelDowngraded('async', old) &&
                !isDuel(old) &&
                isDuel(fixtureRoom({ pace: 'async' })) &&
                // And a CURRENT one opens the duel already drafting.
                duelDowngraded('async', fixtureRoom({ pace: 'async', status: 'drafting' })) &&
                // The second skew, and it points the other way now: a referee built on
                // 2026-08-30 opens a duel straight into its challenger's DRAFT, which is
                // the shape that let a challenger re-open the room until they liked their
                // squad. A duel is created in a lobby, so anything else is a downgrade.
                !duelDowngraded('async', fixtureRoom({ pace: 'async', status: 'lobby' })) &&
                // Asking for a live room is never downgraded, whatever comes back.
                !duelDowngraded('live', old) &&
                // Both call sites act on it, and both CLOSE the room rather than leaving
                // it holding this account's one live seat (P39) until the sweeper.
                /duelDowngraded\('async', room\)[^]{0,240}leaveRoom\(room\.code\)/.test(src) &&
                /duelDowngraded\('async', next\)[^]{0,240}leaveRoom\(next\.code\)/.test(rematch) &&
                // Vacuity: the scan really did read two files that create a duel.
                src.includes('pace,') &&
                rematch.includes("pace: 'async'"),
            () => `${duelDowngraded('async', old)} / ${/leaveRoom\(room\.code\)/.test(src)}`,
        );
    }

    // WITHDRAWING FROM A DUEL IS A FORFEIT, so its row leaves "On now" for a loss under
    // "Played" - and the reported bug was that it did not, until the page was reloaded.
    // It is a RACE rather than only a slow poll: leaving navigates without waiting for the
    // referee (`RoomScreen`, deliberately), so the versus page mounts and reads the list
    // alongside the forfeit and is answered, honestly, with the room as it still is. So
    // the signal fires when the referee ANSWERS and both readers of the list take it.
    //
    // CHECKED AS SOURCE, because nothing behavioural can see it: each of these files reads
    // a perfectly good list on its own beat, so a version that never re-reads agrees with
    // the server within ten seconds and looks right in every fixture.
    {
        const screen = readFileSync('src/components/versus/RoomScreen.tsx', 'utf8');
        const home = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
        const strip = readFileSync('src/hooks/useDuelAlert.ts', 'utf8');
        /** Fire it once with a subscriber, once without, and count what arrived. */
        const delivered = (): number => {
            let n = 0;
            const off = onDuelsChanged(() => {
                n += 1;
            });
            duelsChanged();
            off();
            duelsChanged();
            return n;
        };
        check(
            'pvpView: leaving tells the duels list, and only once the referee has answered',
            () =>
                // It reaches a subscriber, and stops the moment one lets go.
                delivered() === 1 &&
                // ON SETTLE, never on send. Signalling beside the request would re-read
                // the list in the same race the mount read is already losing.
                /\.leave\(\)[^]{0,160}\.finally\(duelsChanged\)/.test(screen) &&
                // Both readers take it: the versus page's two lists, and the chrome strip.
                /onDuelsChanged\(refreshLobby\)/.test(home) &&
                /onDuelsChanged\(ask\)/.test(strip) &&
                // Vacuity: these are the three files that matter, and the two readers do
                // still read the list on their own beat as well - a screen that had
                // stopped polling would pass the scans above and be worse.
                screen.includes('leaveKind') &&
                home.includes('readDuels()') &&
                strip.includes('readDuels()'),
            () => `${delivered()} / ${/\.finally\(duelsChanged\)/.test(screen)}`,
        );
    }
  }

  // --- THROWING SOMEBODY OUT: who is offered it, and what the player who went is told ---
  //
  // NOTHING BEHAVIOURAL CAN SEE ANY OF THIS. The state machine refuses every wrong removal
  // and the referee names the refused join, so a lobby that offered the button to everybody
  // would look perfectly correct: each tap comes back with the room unchanged, and the row
  // is still there. What would actually be wrong is what the screen SAYS - four people
  // holding a control that only one of them can use - and that is text.
  //
  // The removed player's own screen is the other half, and the more important one: arriving
  // at a room is taking the seat, so their client sends the join that gets refused, lands on
  // "Could not get in", and would sit there pressing a Try again that can only ever say no.
  {
    const lobby = readFileSync('src/components/versus/RoomLobby.tsx', 'utf8');
    const screen = readFileSync('src/components/versus/RoomScreen.tsx', 'utf8');
    const hook = readFileSync('src/hooks/useVersusRoom.ts', 'utf8');
    check(
      'versus: only the host is offered a removal, and the player who went gets a screen with no retry',
      () =>
        // The three exclusions, on one line in the lobby so they cannot drift apart: the
        // host makes it, never about themselves, and never about a practice opponent (which
        // is a COUNT, and the chips below the list are how it changes).
        /isHost && !m\.bot && m\.userId !== view\.hostId/.test(lobby) &&
        lobby.includes('<RemoveSeat') &&
        // Vacuity: the seat list really is what this is on, and the host-only controls
        // beside it are still host-only - so the scan is reading a live file rather than
        // matching a comment.
        lobby.includes('seatsOf(view)') &&
        /isHost && !duel && freeSeats > 0/.test(lobby) &&
        // The removed player's screen. The retry is suppressed by the refusal's own name,
        // and the title says what happened rather than that something went wrong.
        screen.includes("room.commandError?.code === 'removed-from-room'") &&
        /\{problem && !thrownOut &&/.test(screen) &&
        screen.includes("'You were removed'") &&
        // And the chrome lets go of the room, which nothing else does for it: the pointer
        // is refreshed by every answer carrying a seat, and they get no more of those.
        /'removed-from-room'\) holdVersusRoom\(null\)/.test(screen) &&
        // Which needs the hold itself to be seat-conditional, or a PUBLIC lobby stays
        // readable to them and the very next poll puts the pointer straight back.
        /if \(next\.you\)\s*\n?\s*holdVersusRoom\(/.test(hook),
      () =>
        `lobby ${/isHost && !m\.bot/.test(lobby)}, retry ${/\{problem && !thrownOut &&/.test(screen)}, ` +
        `hold ${/if \(next\.you\)\s*\n?\s*holdVersusRoom\(/.test(hook)}`,
    );
  }

  // --- The way out, and which of the four it is -----------------------------
  //
  // FOUR THINGS WEAR ONE BUTTON and one of them costs the game, so the screen has to say
  // which before it is pressed. The referee's rule is in `domain/pvpRoom.ts` and this is the
  // same rule read from the screen, so the two are asserted TOGETHER on real payloads in
  // `checks/referee.ts` as well; what is here is the mapping itself, including the cases a
  // duel does not reach.
  {
    const duel = (over: Partial<RoomView> = {}): RoomView =>
      fixtureRoom({ pace: 'async', status: 'drafting', ...over });
    const mine = { userId: HOME, xi: {}, dealt: [], rerollsLeft: 0, budgetLeft: 4, window: null };
    const theirs = { ...mine, userId: AWAY };
    const alone = [fixtureRoom().members[0]!];
    check(
      'pvpView: the way out of a room is one of four things, and a duel being drafted is the one that costs something',
      () =>
        // A duel whose DRAFT is under way: leaving is a FORFEIT at either end, because the
        // squads are dealt and the market is open, so there is a game to abandon.
        leaveKind(duel({ you: mine })) === 'forfeit' &&
        leaveKind(duel({ you: theirs })) === 'forfeit' &&
        // AND IN THE LOBBY IT IS FREE AT BOTH ENDS (2026-09-02), whether or not somebody
        // has taken the seat: nothing has been dealt there, so there is nothing anybody
        // could gain by rejecting it. Which free thing it is depends on whose challenge it
        // is - the person who opened it calls it off, and anybody else hands a seat back.
        leaveKind(duel({ status: 'lobby', you: mine, members: alone })) === 'calloff' &&
        leaveKind(duel({ status: 'lobby', you: mine })) === 'calloff' &&
        leaveKind(duel({ status: 'lobby', you: theirs })) === 'seat' &&
        // The discrimination that matters, stated as itself: the same viewer at the same
        // full seat count reads one thing in the lobby and the other in the draft, so a
        // build that went back to counting seats fails here rather than looking tidy.
        duel({ status: 'lobby' }).members.length === duel({ status: 'lobby' }).size &&
        leaveKind(duel({ status: 'lobby', you: mine })) !== leaveKind(duel({ you: mine })) &&
        // And with nobody opposite there is nothing to forfeit to and no seat to hand
        // back, at either status: the challenge stops existing, which is `leaveDuel`'s own
        // first guard read from this end.
        leaveKind(duel({ you: mine, members: alone })) === 'calloff' &&
        // A LIVE room is untouched: a lobby gives a seat up, and once it has started
        // leaving is only walking away.
        leaveKind(fixtureRoom({ status: 'lobby', you: mine })) === 'seat' &&
        leaveKind(fixtureRoom({ status: 'drafting', you: mine })) === 'away' &&
        leaveKind(fixtureRoom({ status: 'round', you: theirs })) === 'away' &&
        // And a duel whose match has been played: a result that can be deleted is not a
        // result, so there is nothing to call off by then.
        leaveKind(duel({ status: 'round', you: mine })) === 'away' &&
        leaveKind(duel({ status: 'ended', you: mine })) === 'away' &&
        // Somebody reading a public lobby they have not joined has no seat to give up.
        leaveKind(fixtureRoom({ status: 'lobby', you: null })) === 'away',
      () =>
        `${leaveKind(duel({ you: mine }))} / ${leaveKind(duel({ you: theirs }))} / ` +
        `${leaveKind(fixtureRoom({ status: 'lobby', you: mine }))}`,
    );
  }

  // --- A slow answer must not undo a fast one ------------------------------
  //
  // Reported as "changing my formation un-readies me", which is a real bug and is not about
  // formations at all. A room is read from three places that are not ordered against each
  // other - a poll, a re-read whenever the broadcast says something changed, and the answer
  // to every command - so the last answer to ARRIVE is not the last one to have been TRUE.
  // A poll that left before you pressed Ready describes a room where you are not ready, and
  // landing after the Ready answer it puts that back; the next shape you pick then honestly
  // reports what the screen says, and the reset sticks.
  {
    const at = (t: number, ready: boolean): RoomView =>
      fixtureRoom({
        status: 'lobby',
        at: t,
        members: [
          { userId: HOME, seat: 0, name: 'Alpha', ready, outIn: null, picked: 0, formationName: '4-3-3', style: 'bal' },
        ],
      });
    // The reported sequence, in order of ARRIVAL: a poll leaves, Ready is pressed and
    // answered, then the poll's older answer lands.
    const poll = at(1_000, false);
    const command = at(1_500, true);
    const hook = readFileSync('src/hooks/useVersusRoom.ts', 'utf8');
    check(
      'pvpView: an answer older than the one on screen is dropped, so a poll cannot undo a command',
      () =>
        answerIsFresh(null, poll) &&
        answerIsFresh(poll.at, command) &&
        // The one that matters: the poll arriving late is refused.
        !answerIsFresh(command.at, poll) &&
        // Equal is accepted - two answers built in the same millisecond describe the same
        // room, so refusing one would drop an update for nothing.
        answerIsFresh(command.at, at(1_500, false)) &&
        // And a stamp a long way behind is a server clock that stepped back, not a slow
        // request: nothing in flight is a minute old. Refusing it would freeze the room
        // until the clock caught up, which is worse than the one wrong render it costs.
        answerIsFresh(command.at, at(command.at - 120_000, false)) &&
        // And the hook actually asks, before it touches the view or the clock bases.
        /if \(!answerIsFresh\(appliedAt\.current, next\)\) return;/.test(hook) &&
        hook.indexOf('answerIsFresh(appliedAt.current') < hook.indexOf('setView(next)') &&
        // The mark is cleared when the room changes identity, or a referee whose clock
        // stepped back would have every later answer refused for ever.
        /appliedAt\.current = null;/.test(hook),
      () =>
        `fresh(none)=${answerIsFresh(null, poll)}, stale-after-command=${!answerIsFresh(command.at, poll)}`,
    );
  }

  // --- The money a room may be opened with ---------------------------------
  //
  // The rungs and the referee's accepted range are two different things on purpose - the
  // range says what is PLAYABLE, the rungs say what is OFFERED - and the failure they can
  // have together is silent from the outside: a rung outside the range is refused as
  // `bad-room`, which tells the host nothing about which of the six settings was wrong.
  {
    const form = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
    const api = readFileSync('referee/src/api.ts', 'utf8');
    check(
      'pvpView: every budget the form offers is one the referee will take, and the default is on the list',
      () =>
        ROOM_BUDGETS.every((b) => b >= BUDGET_MIN && b <= BUDGET_MAX) &&
        // Ascending, because the row is read as a ladder and a chip out of order reads as
        // a typo rather than as a choice.
        ROOM_BUDGETS.every((b, i) => i === 0 || b > ROOM_BUDGETS[i - 1]!) &&
        // A default that is not one of them leaves no chip lit at all.
        (ROOM_BUDGETS as readonly number[]).includes(DEFAULT_ROOM_BUDGET) &&
        // The form builds its options from the ladder rather than restating it, which is
        // what stops the two from drifting - the same rule the pick clock arrived at.
        /ROOM_BUDGETS\.map\(/.test(form) &&
        // And the referee checks the shared bounds rather than two literals of its own.
        /budget >= BUDGET_MIN && budget <= BUDGET_MAX/.test(api),
      () => `${ROOM_BUDGETS.join('/')}, default ${DEFAULT_ROOM_BUDGET}, range ${BUDGET_MIN}-${BUDGET_MAX}`,
    );
  }

  // --- The draft the CLIENT draws, and how it tells which (P52) -------------
  //
  // `PVP_PROTOCOL` was not bumped for this, so a budget room from an older referee arrives
  // with eleven pick windows and no `draft` block at all, and the screens have to fall
  // back to the per-pick draft they have always drawn. The whole of that decision is one
  // field being present, so it is worth pinning that the screen reads THAT and not the
  // room's method - which is the mistake that would look right and be wrong on every
  // deployed server until the next NAS visit.
  {
    const src = readFileSync('src/components/versus/RoomDraft.tsx', 'utf8');
    check(
      'pvpView: the draft screen decides by the answer, not by the room being a budget one',
      () =>
        // It reads the presence of the block the server sends.
        /const whole = !!view\.draft;/.test(src) &&
        // And never off the method, which an older referee would answer the same way.
        !/const whole = [^\n]*rules\.method/.test(src) &&
        // The board is posted, the declaration is sent, and the clock is drawn against the
        // room's own total - the same trap `PickClock` had, one size up.
        /room\s*\n?\s*\.setBoard\(/.test(src) &&
        src.includes('room.setDone(') &&
        /totalMs=\{view\.draft\?\.totalMs/.test(src),
      () =>
        `whole: ${/const whole = !!view\.draft;/.test(src)}, board: ${/room\s*\n?\s*\.setBoard\(/.test(src)}`,
    );
  }

  // --- One formation control, and the lobby is where it lives ---------------
  //
  // FOR ONE DAY A DUEL HAD NO LOBBY and so no way to choose a shape at all: both sides
  // played 4-3-3 balanced, unchangeably, and nothing said so. A duel waits in a lobby again,
  // so the control is back where it belongs - but it stays its own component rather than
  // going back inside the lobby, because the drift that hid it was silent: a screen where
  // the chips are simply absent looks like a screen that has no such setting.
  //
  // AND IT IS NOT IN THE DRAFT. A shape a board is already built on cannot change - the
  // slots ARE the formation - so a picker there would be offering a change the referee
  // refuses, which is the worst of the three possible states.
  {
    const picker = readFileSync('src/components/versus/ShapePicker.tsx', 'utf8');
    const lobby = readFileSync('src/components/versus/RoomLobby.tsx', 'utf8');
    const draft = readFileSync('src/components/versus/RoomDraft.tsx', 'utf8');
    check(
      'pvpView: the formation control is one component, in the lobby, and it shows the board',
      () =>
        // It is the real control: the shapes and the styles come off the domain's own lists.
        /FORMATIONS_DATA\.names\.map/.test(picker) &&
        /STYLES\.map/.test(picker) &&
        // AND THE BOARD, which is the single-player build's own `Pitch` and not a diagram
        // drawn for this screen - so the eleven circles slide to their new slots on a
        // change instead of a picture being swapped.
        /<Pitch/.test(picker) &&
        /from '\.\.\/Pitch'/.test(picker) &&
        // The lobby renders it and keeps no chip row of its own.
        /<ShapePicker/.test(lobby) &&
        !/FORMATIONS_DATA\.names\.map/.test(lobby) &&
        // And it posts, or the chips are decoration.
        /room\.ready\(/.test(lobby) &&
        // The draft has neither the component nor a copy of it.
        !/<ShapePicker/.test(draft) &&
        !/FORMATIONS_DATA\.names\.map/.test(draft),
      () =>
        `picker ${/FORMATIONS_DATA\.names\.map/.test(picker)}, board ${/<Pitch/.test(picker)}, ` +
        `lobby ${/<ShapePicker/.test(lobby)}, draft ${/<ShapePicker/.test(draft)}`,
    );
  }

  // --- An invitation followed by somebody with no account -------------------
  //
  // A room is account-only (P17), so a link somebody was sent lands on the SIGNED-OUT versus
  // screen, and that screen used to answer it with the general pitch for the mode and a
  // sentence pointing at the account button in the masthead: it never said the link had
  // worked, never said which room it was, and gave nothing to press.
  //
  // TWO CLAIMS, and the second is the one that will rot. First, an invitation is its own
  // screen: it branches on the code, prints it, and carries the sign-in button itself.
  // Second, SIGNING IN COMES BACK TO THE ROOM - and the whole of that promise is `App`
  // handing a sign-in over with a RELOAD, which lands on the URL the player is already on,
  // that URL being the room's own address. Turn the handover into a navigation and nothing
  // fails except the copy on this screen, quietly, for the one player who cannot see it.
  //
  // Source-level because nothing behavioural can see either half: a screen with no button
  // renders perfectly, and the reload is a browser call in a component that is not mounted
  // in the harness. Vacuity: the file really is the signed-out gate, and App really renders
  // it with a way to open the dialog.
  {
    const screen = readFileSync('src/components/versus/VersusScreen.tsx', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    check(
      'pvpView: an invitation says which room it is and signs you in back into it',
      () =>
        // Vacuity: this is the gate a signed-out visitor meets, and the code really does
        // come off the URL rather than being a prop somebody could stop passing. There are
        // TWO doors into the room screen since 2026-09-18 - the versus page and the Records
        // archive - so it comes off whichever one matched, and both are asserted: dropping
        // the archive's would send every match opened out of your own record to the front
        // page of versus, which renders perfectly and lights the wrong tab.
        /useMatch\('\/versus\/:code'\)/.test(screen) &&
        /useMatch\('\/records\/versus\/:code'\)/.test(screen) &&
        /const code = \(inRoom \?\? inRecordsRoom\)\?\.params\.code/.test(screen) &&
        /if \(!signedIn\) return <SignedOut code=\{code\}/.test(screen) &&
        // An invitation is its OWN screen: it branches on the code and prints it.
        /function SignedOut\(\{ code/.test(screen) &&
        /if \(!code\) \{/.test(screen) &&
        /<RoomCode code=\{code\} \/>/.test(screen) &&
        // And the way in is on it, in both shapes, rather than a sentence about the
        // masthead: two buttons, both opening the same dialog.
        (screen.match(/onClick=\{onOpenAccount\}/g) ?? []).length === 2 &&
        // App hands it that dialog...
        /<VersusScreen[^]{0,700}onOpenAccount=\{\(\) => setAccountOpen\(true\)\}/.test(app) &&
        // ...and hands a sign-in over with a RELOAD, which is what carries the player back
        // into the room: the overlay sits on the room's own URL, so that is where the
        // reload lands and `RoomScreen` takes the seat on arrival.
        /<AccountModal[^]{0,600}onAccountChanged=\{\(\) => window\.location\.reload\(\)\}/.test(app),
      () =>
        `code branch ${/if \(!code\) \{/.test(screen)}, buttons ${
          (screen.match(/onClick=\{onOpenAccount\}/g) ?? []).length
        }, reload ${/onAccountChanged=\{\(\) => window\.location\.reload\(\)\}/.test(app)}`,
    );
  }

  // --- What a room hides (P41), and the two it has since won back ------------
  // A LIST rather than a flag, because the list is the decision: each entry is off for its
  // own reason. This asserts the sets are the same shape and that each room turns on
  // exactly what it has earned, so a control added to one and forgotten in another shows
  // up here rather than as a button in a room that does nothing.
  {
    const solo = Object.entries(SOLO_CONTROLS).sort();
    const roomC = Object.entries(ROOM_CONTROLS).sort();
    const on = (c: BuildControls) =>
      Object.entries(c)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort()
        .join();
    // WHAT EACH KIND OF ROOM ADDS BACK, and the three answers are three different reasons.
    // A whole-draft room submits the board as a map (P52), so a move and a removal are the
    // same instruction as a purchase. A per-pick room gets the MOVE alone, through a route
    // that takes a rearranged board and nothing else - the removal beside it still cannot,
    // a spent pick having nothing to give back. And a room on a referee too old to have
    // that route gets neither, which is `canMove` and is the whole reason the gesture can
    // be shipped before the container is rebuilt.
    const whole = Object.entries(roomControls(true)).sort();
    check(
      'pvpView: a whole-draft room adds back the move and the remove, a per-pick room the move alone',
      () =>
        whole.map(([k]) => k).join() === roomC.map(([k]) => k).join() &&
        on(roomControls(true)) === 'movePlayer,removePlayer' &&
        on(roomControls(false)) === 'movePlayer' &&
        // The vacuity guard, and it has to be `canMove`: a `roomControls` that ignored its
        // SECOND argument would pass both lines above and fail these two.
        on(roomControls(false, false)) === '' &&
        on(roomControls(true, false)) === 'removePlayer',
      () => `whole ${on(roomControls(true))}, per-pick ${on(roomControls(false))}`,
    );

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

  // --- THE VERSUS PAGE'S OWN SHAPE (2026-09-15) -----------------------------
  //
  // The page was reworked on five criticisms, and three of the answers are things NOTHING
  // BEHAVIOURAL CAN SEE: which column a section is in, what order it takes on a phone, and
  // whether a finished match still prints a code. A build that got all three wrong renders
  // a perfectly good screen. So these read the source, and each one names the correction it
  // is holding. The drawing is docs/redesign-2026/turf-flat/versus-option-2.html.
  {
    const home = readFileSync('src/components/versus/VersusHome.tsx', 'utf8');
    const vrec = readFileSync('src/components/versus/VersusRecords.tsx', 'utf8');
    const ui = readFileSync('src/components/versus/versusUi.tsx', 'utf8');
    const uiCode = codeOnly(ui);
    const homeCode = codeOnly(home);
    const vrecCode = codeOnly(vrec);

    // (a) ON A PHONE THE LOBBY COMES BEFORE WHAT IS WAITING ON YOU. The owner's correction,
    // against the first sketch, which hoisted the alert to the top below the breakpoint. It
    // is expressible ONLY as these classes: both columns are `display: contents` there, so
    // the six sections are grid items of one grid and `order` is the whole of the phone's
    // reading order. Reordering the JSX changes the desktop and leaves the phone alone,
    // which is exactly the silent half.
    const orderOf = (title: string): number => {
      // The `order-N` on the <section> immediately before this heading.
      const at = home.indexOf(`title="${title}"`);
      if (at < 0) return -1;
      const before = home.lastIndexOf('<section className="order-', at);
      if (before < 0) return -1;
      return Number(home.slice(before + 26, home.indexOf('"', before + 26)));
    };
    const start = orderOf('Start a match');
    const join = orderOf('Join with a code');
    const lobby = orderOf('Lobby');
    const waiting = orderOf('Waiting on you');
    const inPlay = orderOf('Open rooms');
    check(
      'versus page: on a phone it is start, join, lobby, then your own matches',
      () =>
        // Every section was found, which is the vacuity guard: a renamed heading would
        // otherwise leave this comparing -1 against -1 and passing. It has earned its keep
        // twice now, on the lobby's rename and on the archive's move to Records.
        [start, join, lobby, waiting, inPlay].every((n) => n > 0) &&
        start < join &&
        join < lobby &&
        // The correction itself. The chrome carries a duel strip on every other screen in
        // the game, so somebody with a match waiting has been told before they got here.
        lobby < waiting &&
        waiting < inPlay &&
        // And the mechanism that makes any of it mean anything: both column wrappers stop
        // being boxes below the breakpoint, or `order` has nothing to sort.
        (home.match(/contents min-\[860px\]:block/g) ?? []).length === 2,
      () => `start ${start}, join ${join}, lobby ${lobby}, waiting ${waiting}, onNow ${inPlay}`,
    );

    // (b) THE SEATS SIT BETWEEN THE ROOM'S NAME AND THE WAY IN. Leading with them started
    // every row of the list with a different shape, which is the noise the owner named.
    // Source order in one <li> is the only place that lives.
    {
      const row = home.slice(
        home.indexOf('{lobby.map('),
        home.indexOf('</ul>', home.indexOf('{lobby.map(')),
      );
      const pips = row.indexOf('<SeatPips');
      const name = row.indexOf('{r.hostName');
      const seat = row.indexOf("'Take a seat'");
      check(
        'versus page: a lobby row reads name, then seats, then the way in',
        () =>
          name > 0 &&
          pips > 0 &&
          seat > 0 &&
          name < pips &&
          pips < seat &&
          // The words it replaced are gone: a row that drew the dots AND printed "2 of 4
          // seats left" would be saying the same thing twice, which is what the rework is
          // about.
          !row.includes('seatsLine'),
        () => `name@${name} pips@${pips} seat@${seat}`,
      );
    }

    // (c) A PLAYED MATCH CARRIES NO ROOM CODE. A code is how you reach a room and a
    // finished one is not going anywhere. An OPEN one keeps it and has to: until somebody
    // follows the link the opponent column reads "Nobody yet", so the code is the row's
    // only identity.
    //
    // THE TWO LISTS ARE ON TWO PAGES SINCE 2026-09-17, which is why this reads both of
    // them. The rule did not move with the archive and is the easiest thing of all to lose
    // in a move: the finished list is now the ONLY caller that passes the flag, so a
    // copy-paste that dropped it would print a dead code beside every result and nothing
    // else in the suite would notice.
    check(
      'versus page: a finished duel drops its room code, and an open one keeps it',
      () => {
        // Sliced between markers that occur once each: `{played.length >` is not one of
        // them, since the section guards itself on the same expression.
        const results = vrec.slice(
          vrec.indexOf('{played.map('),
          vrec.indexOf('</ul>', vrec.indexOf('{played.map(')),
        );
        const waitingList = home.slice(
          home.indexOf('{waiting.map('),
          home.indexOf('</section>', home.indexOf('{waiting.map(')),
        );
        return (
          results.length > 40 &&
          waitingList.length > 20 &&
          results.includes('code={false}') &&
          !waitingList.includes('code={false}') &&
          // And the row honours it rather than accepting a prop it ignores. It lives in
          // the shared atoms now, both pages drawing the identical row.
          ui.includes('{code && (') &&
          // What it PLAYS rides with an ALERT and nowhere else now (2026-09-22): a row
          // waiting on the reader leads with that and says what it plays after it, an
          // open one says only what it plays (`duelOpenLine`), and a result is the
          // result. Appending it to a finished row wrapped every alert onto a second
          // line to say nothing, which is the complaint this whole rework is about.
          ui.includes('{duelLine(row)} &middot; {duelRules(row)}') &&
          !ui.includes("{row.status !== 'ended' && <> &middot; {duelRules(row)}</>}")
        );
      },
      () => 'the finished list passes code={false}',
    );

    // (d) THE ARCHIVE IS ON RECORDS, AND ON RECORDS ONLY (2026-09-17).
    //
    // A LIST IN TWO PLACES is the failure this guards, and it is the one this codebase
    // keeps having to delete: the challenge overview that lived on the career hub, the
    // crumb that restated the tab, the front page's second door into versus. Moving a
    // section by copying it renders perfectly on both pages and is only wrong when you
    // notice you are reading the same thing twice.
    //
    // The versus page keeps the two lists you can ACT on, and a finished match you have
    // not watched is one of them: the score is what is being withheld, so watching it is
    // an action and filing it under a record would give it away in the same breath. What
    // moved is the watched half, and nothing else.
    //
    // IT READS COMMENT-STRIPPED SOURCE, and the first version of it did not and failed on
    // the paragraph explaining the move. That is the harness's own note about `codeOnly`
    // reached from a third direction: the better a change is documented, the likelier its
    // check is to match its own prose.
    check(
      'versus page: the played archive is on Records, and is not also on the versus page',
      () =>
        // The versus page partitions only into what is waiting and what is live. Nothing
        // on it may filter for a match that is over and seen.
        homeCode.includes('const waiting = listed.filter') &&
        homeCode.includes('const inPlay = listed.filter') &&
        !homeCode.includes('const played =') &&
        !homeCode.includes('Your results') &&
        // And Records holds exactly that half, on both tests. `watched` is the one that
        // would be quietly dropped, since without it the page looks right and merely
        // shows results a beat before their owner has seen them.
        vrecCode.includes("d.status === 'ended'") &&
        vrecCode.includes('watched.has(d.code)') &&
        // AND NO POINTER BACK TO IT, which is the owner's call of 2026-09-18 and reverses
        // what this line used to assert. It said where a watched match goes, which is a
        // fact about the other tab rather than about anything on this page, and the
        // Records tab is two inches up with its own segment named Versus. Asserted in the
        // negative rather than deleted, so re-adding it is a decision somebody takes here
        // rather than a paragraph that creeps back.
        !homeCode.includes("navigate('/records/versus')"),
      () => 'the versus page still lists finished matches, or still points at the archive',
    );

    // (f) ONE LIST FOR BOTH KINDS OF ROOM, AND NO STRIP ABOVE IT (2026-09-18).
    //
    // TWO ANSWERS TO "WHAT HAVE I GOT ON" is what this guards, and it is what was reported:
    // the list was fed by `myDuels`, which is `pace = 'async'`, so a cup the reader opened
    // themselves was on it nowhere - and a full-width card above both columns said "You are
    // in a room" about ONE room, whichever was last opened, so it either restated a row of
    // the list below it or advertised a room that list could never hold.
    //
    // NOTHING BEHAVIOURAL CAN SEE ANY OF IT. A build that kept the card renders perfectly
    // and simply says the same thing twice; a build that dropped the dedupe draws the held
    // duel as a second row labelled "Cup", which is only wrong to somebody reading it. So
    // this is source, comment-stripped, with the card's own words as the vacuity guard in
    // the negative and the list's two rows as the guard in the positive.
    check(
      'versus page: one list carries both kinds of room, labelled, and the strip is gone',
      () => {
        const open = homeCode.slice(
          homeCode.indexOf('{openCount > 0 &&'),
          homeCode.indexOf('</section>', homeCode.indexOf('{openCount > 0 &&')),
        );
        return (
          // The card, in the words that were on it. Not a substring of anything else here.
          !homeCode.includes('You are in a room') &&
          // Both kinds are in the one list, each with its label. The section really was
          // found, which is what stops the two `includes` below passing on an empty slice.
          open.length > 200 &&
          open.includes('<RoomLine') &&
          open.includes('<DuelLine') &&
          open.includes('kind="Cup"') &&
          open.includes('kind="Challenge"') &&
          // THE DEDUPE, which is the only way one room can appear twice: the pointer
          // follows whichever room was last opened, and a duel is already on the list.
          /!listed\.some\(\(d\) => d\.code === held\.code\)/.test(homeCode) &&
          // And the kind is read off the pointer rather than guessed, which is what makes
          // the label right before the duels list has even answered.
          /!held\.duel/.test(homeCode) &&
          // The row honours the label rather than taking a prop it ignores.
          ui.includes('{kind && (')
        );
      },
      () => 'the versus page still carries a room strip beside its list',
    );

    // (g) AN OPEN ROOM SAYS WHAT IT PLAYS AND DRAWS ITS CHAIRS (2026-09-22, owner's call).
    //
    // The list carries both kinds of room, so both rows have to read the same way: a tag
    // saying which it is, a name, what it PLAYS, the chairs, and the way in. A challenge was
    // instead saying how far each side had got - four sentences, every one of them meaning
    // "not your move", since a row with anything waiting on the reader is in the section
    // above this one.
    //
    // WHAT IT GIVES UP GOES TO THE BUBBLES rather than being lost: an untaken challenge is
    // one dot short of a taken one, which is the only distinction of the four that a reader
    // can do anything about (send the link to somebody else).
    {
      // A challenge as the referee now sends one: the two house rules it really has, and
      // no clock of either kind.
      const roll = { method: 'roll' as const, budget: 0, rerolls: 3, showRatings: true };
      const buy = { method: 'budget' as const, budget: 110, rerolls: 3, showRatings: true };
      // And one from a referee that predates them, which must say less rather than guess.
      const older = { method: 'roll' as const, budget: 0 };
      // A lobby row of each kind, to read the challenge's sentence against: "structured the
      // same way as the lobby section" is the request, and the two are written by two
      // different functions, so nothing but a comparison holds them together.
      const listed: LobbyRoom = {
        code: 'AB12CD',
        size: 4,
        seated: 2,
        method: 'roll',
        budget: 110,
        pickSeconds: 20,
        draftSeconds: 300,
        rerolls: 3,
        showRatings: true,
        hostName: 'Ada',
        openedAt: 1_000_000,
      };
      const open = homeCode.slice(
        homeCode.indexOf('{openCount > 0 &&'),
        homeCode.indexOf('</section>', homeCode.indexOf('{openCount > 0 &&')),
      );
      check(
        'versus page: an open challenge says Waiting, then what it plays, in the lobby row voice',
        () =>
          duelOpenLine(roll) === 'Waiting. Roll for your XI, 3 re-rolls' &&
          duelOpenLine(buy) === 'Waiting. Buy an XI with $110' &&
          duelOpenLine({ ...roll, showRatings: false }) ===
            'Waiting. Roll for your XI, 3 re-rolls, ratings hidden' &&
          // IT IS THE LOBBY ROW'S OWN SENTENCE, minus exactly what a duel has not got
          // (2026-09-24). Not "the same shape" - the same string, with the pick clock as
          // the only difference, so the two cannot drift while both look reasonable.
          lobbyLine(listed) === `${duelRules(roll)}, 20s a pick` &&
          lobbyLine({ ...listed, method: 'budget' }) === `${duelRules(buy)}, 5 min to draft` &&
          duelOpenLine(roll).endsWith(duelRules(roll)) &&
          // A row from an older referee names its method and stops, rather than reading a
          // missing re-roll count as none or a missing flag as ratings on.
          duelRules(older) === 'Roll for your XI' &&
          !duelRules(older).includes('re-roll') &&
          !duelRules(older).includes('ratings') &&
          // THE CHAIRS. Two, always, and `seated` read the way `duelTurn` reads it: a
          // referee that predates the field means both taken, or a challenge somebody is
          // already building would show an empty chair.
          seatCounts({ ...duelSeats({ seated: 1 }), bots: 0 }).free === 1 &&
          seatCounts({ ...duelSeats({ seated: 2 }), bots: 0 }).free === 0 &&
          seatCounts({ ...duelSeats({}), bots: 0 }).free === 0 &&
          // And the screens: the row prints it, on an open room and nowhere else, and the
          // live cup beside it draws the same bubbles off the pointer.
          ui.includes('duelOpenLine(row)') &&
          ui.includes('<SeatPips {...duelSeats(row)} />') &&
          /!alert && row\.status !== 'ended'/.test(ui) &&
          // The cup row takes the chairs as three counts rather than as the pointer's own
          // shape, because since 2026-09-22 there are two sources for them: the referee's
          // answer, and the pointer when the referee is too old to give one.
          ui.includes('seats={seats ? <SeatPips {...seats} /> : undefined}') &&
          /seats: { size: r\.size, seated: r\.seated, bots: r\.bots }/.test(homeCode) &&
          homeCode.includes('seats: held.seats') &&
          open.includes('seats={r.seats}') &&
          // Vacuity: the section really was found, and it is the one that draws both rows.
          open.length > 200 &&
          open.includes('<RoomLine') &&
          open.includes('<DuelLine'),
        () => `${duelOpenLine(roll)} / ${duelOpenLine(buy)}`,
      );

      // A ROW WITH NOBODY IN IT IS CALLED BY ITS CODE (2026-09-24, asked for). A title is
      // what the room IS called, and until somebody follows the link a challenge has no
      // other name - so "Nobody yet" was a STATUS standing in the title column, on the one
      // list where the row beside it is a cup titled with its code. Both rows draw the same
      // element now, and the dim code suffix goes when the title already is the code, or
      // the row prints the same six characters twice.
      //
      // Source, because nothing behavioural can see it: every version of this renders a
      // perfectly good row and they differ only in what a reader sees in one column.
      check(
        'versus page: an unanswered challenge is titled with its room code, once, as a cup is',
        () =>
          // Comment-stripped, or the paragraph explaining the change is what the first
          // assertion finds - the trap this file keeps meeting.
          !uiCode.includes('Nobody yet') &&
          // One element, and both rows reach for it.
          uiCode.includes('function CodeTitle(') &&
          (uiCode.match(/<CodeTitle /g) ?? []).length === 2 &&
          uiCode.includes('title={<CodeTitle code={code} />}') &&
          uiCode.includes(
            'title={row.opponentName ? row.opponentName : <CodeTitle code={row.code} />}',
          ) &&
          // The suffix is gated on there BEING a name to sit beside, as well as on the
          // list that wants codes at all.
          uiCode.includes('code={code && row.opponentName ? row.code : undefined}') &&
          // Vacuity: the row still prints a code somewhere for a challenge that HAS an
          // opponent, which is the case the suffix exists for.
          uiCode.includes('{code && ('),
        () => 'the challenge row no longer titles itself with the room code',
      );

      // AND THE LIVE CUP'S CHAIRS COME OFF THE POINTER, which is the only thing on this
      // side that knows about that room at all: the duels list is `pace = 'async'`, and
      // the referee has no route answering "which live room am I in". So the count is
      // taken where the members are, and the pointer's own no-op test has to include it -
      // a chair taken while the strip is up moves neither the status nor the sentence, so
      // without those three lines the dots would be written once and never again.
      const nav = codeOnly(readFileSync('src/nav/versusRoom.ts', 'utf8'));
      const hook = codeOnly(readFileSync('src/hooks/useVersusRoom.ts', 'utf8'));
      check(
        'versus page: a live room records its chairs, and a chair taken reaches the pointer',
        () =>
          /seated: peopleIn\(next\)\.length/.test(hook) &&
          /bots: botsIn\(next\)\.length/.test(hook) &&
          /size: next\.size/.test(hook) &&
          /next\?\.seats\?\.seated === held\?\.seats\?\.seated/.test(nav) &&
          /next\?\.seats\?\.bots === held\?\.seats\?\.bots/.test(nav) &&
          /next\?\.seats\?\.size === held\?\.seats\?\.size/.test(nav) &&
          // Three numbers or none, so a half-read pointer cannot draw a room with more
          // people in it than chairs.
          nav.includes("typeof s?.size === 'number'") &&
          // Vacuity: both files really are the ones that write and hold the pointer.
          hook.includes('holdVersusRoom({') &&
          nav.includes('export function holdVersusRoom'),
        () => 'the live room no longer records its chairs, or the pointer ignores a change',
      );
    }

    // (h) FOUR PEOPLE AND ANYBODY, for a cup (2026-09-22, owner's call).
    //
    // NOTHING BEHAVIOURAL CAN SEE A DEFAULT: every value the form can hold is a legal room,
    // so a build that opened two-player private rooms for ever works perfectly and simply
    // starves the half of the feature that depends on other people - the public list is the
    // only way somebody who was not sent a code ever finds a room.
    check(
      'versus page: a cup defaults to four people and to anybody',
      () =>
        /useState<'private' \| 'public'>\('public'\)/.test(homeCode) &&
        /const \[size, setSize\] = useState\(4\)/.test(homeCode) &&
        // The default has to be one of the chips, or none is lit at all.
        home.includes("{ value: 4, label: 'Four' }") &&
        // And neither reaches a duel, which is two and private whatever they say - the
        // form hides both chips for one and sends the forced values.
        /size: duel \? 2 : size/.test(homeCode) &&
        /visibility: duel \? 'private' : visibility/.test(homeCode),
      () => 'the create form no longer defaults a cup to four people, listed publicly',
    );

    // (h) A LIVE ROOM YOU ARE IN COMES OFF THE REFEREE (2026-09-22, roadmap item 67).
    //
    // The versus page's "Open rooms" carries both kinds, and until now the live half was
    // read from `sessionStorage` - right in the tab that opened the room and blank on every
    // other device. `readDuels` answers it now, so this holds the two halves of that: the
    // SENTENCE, which is written from a list row by the same core the chrome's strip uses,
    // and the WIRING, which is the rule about when the old pointer is still read.
    //
    // THE SENTENCES ARE ASSERTED AGAINST LITERALS, NOT AGAINST EACH OTHER. `myRoomLine` and
    // `roomLine` share `roomLineOf` now, so comparing the two would be tautological - the
    // trap this repo already met when three readings of a run's history were folded into
    // one. Both are measured against the words a reader actually sees instead, which is the
    // independent walk.
    {
      const row = (over: Partial<MyRoom> = {}): MyRoom => ({
        code: 'RM0001',
        status: 'lobby',
        size: 4,
        seated: 2,
        bots: 1,
        ready: 1,
        yourPicks: 0,
        round: 0,
        touchedAt: 1_000_000,
        // What it plays, which a referee built after 2026-09-24 sends. One practice
        // opponent, so the sentence's own bot clause is exercised here too.
        plays: {
          method: 'roll',
          budget: 0,
          rerolls: 3,
          showRatings: true,
          pickSeconds: 20,
          draftSeconds: 300,
          bots: 1,
        },
        ...over,
      });
      const lines = {
        lobby: myRoomLine(row()),
        drafting: myRoomLine(row({ status: 'drafting', yourPicks: 4 })),
        quarter: myRoomLine(row({ status: 'round', size: 8, round: 1 })),
        semi: myRoomLine(row({ status: 'round', size: 8, round: 2 })),
        final: myRoomLine(row({ status: 'round', size: 2, round: 1 })),
      };
      // The same words from the OTHER source, which is what the chrome's strip prints while
      // this tab holds the room. A reader meeting the same room twice has to meet the same
      // sentence.
      const view = fixtureRoom({
        status: 'drafting',
        size: 4,
        members: [
          { userId: HOME, seat: 0, name: 'Alpha', ready: true, outIn: null, picked: 4, formationName: '4-3-3', style: 'bal' },
          { userId: AWAY, seat: 1, name: 'Bravo', ready: false, outIn: null, picked: 0, formationName: '4-3-3', style: 'bal' },
        ],
      });
      check(
        'pvpView: a live room on the list reads as a challenge does: where it is, then what it plays',
        () =>
          // THE ROW IS TWO SENTENCES, the same shape a challenge row has ("Waiting. Roll
          // for your XI, 3 re-rolls"): where the room has got to, then what it is.
          lines.lobby ===
            'Waiting, 1 ready. Roll for your XI, 3 re-rolls, 20s a pick, 1 practice opponent' &&
          lines.drafting ===
            'Drafting, 4 of 11 picked. Roll for your XI, 3 re-rolls, 20s a pick, 1 practice opponent' &&
          // The round is NAMED, which is half of what a room of eight wants from the line.
          lines.quarter.startsWith('Quarter-final on. ') &&
          lines.semi.startsWith('Semi-final on. ') &&
          lines.final.startsWith('Final on. ') &&
          // AND WHAT IT PLAYS IS THE LOBBY ROW'S OWN SENTENCE, not a third one: a cup, a
          // challenge and a public room describe themselves in the same words.
          lines.lobby.endsWith(playsLine(row().plays!)) &&
          // THE ROW DOES NOT COUNT THE CHAIRS, because it draws them (2026-09-24). The
          // strip does count them, having no bubbles of its own, and that difference is
          // the ONLY one: it is a fact about the surface, carried as a flag on one builder
          // rather than as a second sentence somewhere else.
          !lines.lobby.includes('2 of 4 in') &&
          roomLine({ ...view, status: 'lobby' }) === 'Waiting, 2 of 4 in, 1 ready' &&
          // Nobody ready gets words rather than a nought.
          myRoomLine(row({ ready: 0 })).startsWith('Waiting, nobody ready yet.') &&
          // The view path, which is the strip's, says the state and nothing about what the
          // room plays: it is one line under the tabs on every screen in the game.
          roomLine(view) === 'Drafting, 4 of 11 picked' &&
          // AND THE ROUND NUMBER MEANS THE SAME THING ON BOTH, which is the one figure
          // that could drift silently: `viewOf` passes `room.round` straight through and
          // so does the list row, so a row that read some other field would name the wrong
          // round on one screen and the right one on the next.
          roomLine({ ...view, status: 'round', size: 8, round: 2 }) === 'Semi-final on' &&
          myRoomLine(row({ status: 'round', size: 8, round: 2 })).startsWith('Semi-final on') &&
          // A LIST ROW IS NEVER A DUEL, so the "nobody has taken it up" branch that a
          // half-empty duel takes must not reach a half-empty room: a cup of four with two
          // people in it is drafting, not waiting for somebody.
          myRoomLine(row({ status: 'drafting', seated: 2, size: 4, yourPicks: 0 })).startsWith(
            'Drafting, 0 of 11 picked',
          ) &&
          // A REFEREE TOO OLD TO SAY leaves the row at its state alone, which is what this
          // list showed until now - never a half sentence with a full stop at the end.
          myRoomLine(row({ plays: undefined })) === 'Waiting, 1 ready' &&
          !myRoomLine(row({ plays: undefined })).includes('.'),
        () => JSON.stringify(lines),
      );

      // AND EVERY ONE OF THEM IS A SENTENCE (2026-09-24, asked for: "respect the grammar
      // for the cups"). The cup's line was the only lower-case text on a list whose other
      // rows all open with a capital, because it was written for the middle of the chrome's
      // strip - "Versus AB12CD - drafting, 4 of 11 picked" - and then reused as a row of
      // its own. A property rather than five more literals: a state added later has to be
      // written the same way, and the two strip sentences are held to it too, or the chrome
      // capitalises one of its alternatives and not the other.
      const dRow = (over: Partial<DuelRow> = {}): DuelRow => ({
        code: 'DU0001',
        opponentName: 'Bravo',
        yours: true,
        status: 'drafting',
        seated: 2,
        method: 'roll',
        budget: 0,
        rerolls: 3,
        showRatings: true,
        yourPicks: 0,
        theirPicks: 0,
        openedAt: 1_000,
        touchedAt: 1_000,
        ...over,
      });
      const sentences = [
        ...Object.values(lines),
        roomLine({ ...view, status: 'ended', championId: HOME }),
        roomLine({ ...view, status: 'ended', championId: null, ties: [] }),
        duelAlertLine(dRow({ yourPicks: 4 }), 'your-move'),
        duelAlertLine(dRow({ yourPicks: 11 }), 'your-move'),
        duelAlertLine(dRow({}), 'watch'),
        duelOpenLine({ method: 'roll', budget: 0, rerolls: 3 }),
        duelLine(dRow({ status: 'ended', yourGoals: 2, theirGoals: 1, won: true })),
      ];
      check(
        'pvpView: every line a room or a challenge prints starts as a sentence does',
        () =>
          sentences.length >= 10 &&
          sentences.every((t) => t.length > 0 && t[0] === t[0]!.toUpperCase()) &&
          // Vacuity: lower case is reachable at all, so "every one is capitalised" is not
          // passing on a set of strings that start with a digit or a bracket.
          sentences.every((t) => /[a-z]/.test(t)),
        () => sentences.join(' | '),
      );
    }

    // AND WHEN THE PER-TAB POINTER IS STILL READ, which is the one thing nothing
    // behavioural can see: a build that preferred the pointer renders a perfectly good row
    // and is simply wrong on every device but the one that opened the room, and a build
    // that dropped the fallback renders nothing at all against a referee that has not been
    // rebuilt. Both are source reads, comment-stripped.
    check(
      'versus page: the live rooms come off the referee, and the pointer is only the fallback',
      () => {
        const ref = codeOnly(readFileSync('src/state/pvp/referee.ts', 'utf8'));
        return (
          // The answer carries them, and the key is OPTIONAL: absent is "this server
          // cannot say", which is what the fallback below is for, and `[]` is "you are in
          // no live room", which the page may believe.
          /rooms\?: MyRoom\[\]/.test(ref) &&
          homeCode.includes('setMyRooms(r.rooms)') &&
          // The server wins whenever it has spoken, including when it says nothing is on.
          /myRooms\s*\n?\s*\? myRooms\.map/.test(homeCode) &&
          // And the pointer is reached for only on the other branch of that same ternary.
          /:\s*held && !held\.duel/.test(homeCode) &&
          // Vacuity: the page still holds a pointer at all, since a check that the pointer
          // is not preferred is trivially true of a build that dropped it - and that would
          // be the worse bug for everybody until the container is rebuilt.
          homeCode.includes('useHeldVersusRoom()')
        );
      },
      () => 'the versus page reads the pointer ahead of the referee, or has lost one of them',
    );

    // (e) THE VERSUS SEGMENT NEEDS AN ACCOUNT AS WELL AS A REFEREE.
    //
    // One more condition than either segment beside it, and the asymmetry is the whole
    // point: the ledger and the cabinet are derived from the career and the album, so they
    // work for a guest and cannot fail. A room is account-only (P17), so for a guest this
    // one has no record to read and no duels to list, and it would render two empty cards
    // that look like a server fault.
    //
    // BOTH HALVES ARE INVISIBLE TO EVERYTHING ELSE. A build that showed the segment to a
    // guest renders a perfectly good page; a build that rendered the screen without
    // re-testing the account would only break for somebody who signed out while standing
    // on it, which is not a state any fixture reaches.
    check(
      'records: the versus segment needs a referee AND an account, at the tab and at the screen',
      () => {
        const app = readFileSync('src/App.tsx', 'utf8');
        return (
          // The segment in the control.
          app.includes('...(FEATURES.pvp && accountEmail') &&
          app.includes("to: '/records/versus'") &&
          // And the screen behind it, which is a SEPARATE test rather than the same one
          // reused: the route survives a sign-out, because it is just a URL.
          app.includes('{recordsVersus && accountEmail ? (') &&
          // Vacuity, and it is the load-bearing half: the two segments beside it must NOT
          // carry the account condition, or this is asserting a rule the whole control
          // follows rather than one this segment has on its own.
          app.includes('...(FEATURES.trophyCabinet') &&
          !app.includes('...(FEATURES.trophyCabinet && accountEmail')
        );
      },
      () => 'the versus segment is not gated on both',
    );

    // (g) OPENING A MATCH OUT OF YOUR OWN RECORD STAYS ON RECORDS (2026-09-18, reported:
    // "the nav node that is getting highlighted is still versus - but should remain with
    // records").
    //
    // The tab follows the URL, which is the rule `state/routes` exists to keep, so the fix
    // is the ADDRESS rather than the highlight: the archive opens the same room screen at
    // its own path. Three halves, and each fails differently - the row has to send you to
    // the Records door, the segment has to stay the lit one while you are there, and every
    // way back out of the room has to return to the archive rather than to the versus page.
    // Nothing behavioural can see any of it: a build with all three wrong renders a
    // perfectly good match report under a tab the reader did not choose.
    check(
      'records: a match opened from the archive keeps a Records address, and comes back to it',
      () => {
        const app = codeOnly(readFileSync('src/App.tsx', 'utf8'));
        const roomScreen = codeOnly(readFileSync('src/components/versus/RoomScreen.tsx', 'utf8'));
        return (
          // The archive's rows go to the Records door...
          vrecCode.includes('navigate(`/records/versus/${c}`)') &&
          // ...and the versus page's go to the versus one, which is the vacuity guard: a
          // build that sent BOTH to Records would satisfy a weaker claim and would strand
          // somebody opening a live duel off the versus page.
          homeCode.includes('navigate(`/versus/${c}`)') &&
          // A row says WHICH room and never where, or the two pages cannot differ at all.
          !ui.includes('go(`/versus/') &&
          // The segment stays the lit one while a match is open, so the Records tab stays
          // underlined and the ledger does not steal the highlight.
          app.includes("const recordsVersus = screen === 'records-versus' || recordsRoom") &&
          // And the way back lands in the archive rather than on the versus page.
          app.includes('backTo="/records/versus"') &&
          roomScreen.includes('navigate(backTo)') &&
          !roomScreen.includes("navigate('/versus')")
        );
      },
      () => 'a match opened from the archive does not stay under Records',
    );

    // (f) EXACTLY ONE SEGMENT OF RECORDS IS LIT, and this was a real bug caught by opening
    // the page rather than by anything here.
    //
    // The ledger is the FALLBACK of the three, so its active test has to be "neither of the
    // others", and it read `!recordsCabinet` - which was correct for as long as there were
    // two segments and lit Challenges AND Versus together the moment there was a third. It
    // is the shape a fourth segment would break again in exactly the same way, and no
    // fixture renders a segmented control, so it is read here.
    check(
      'records: the ledger segment is active only when neither other segment is',
      () => {
        const app = codeOnly(readFileSync('src/App.tsx', 'utf8'));
        return (
          app.includes('active: !recordsCabinet && !recordsVersus') &&
          // The other two are single tests, which is what makes the fallback the only one
          // that has to name its siblings.
          app.includes('active: recordsCabinet') &&
          app.includes('active: recordsVersus')
        );
      },
      () => 'the ledger segment does not exclude every other segment',
    );


    // AND THE PAGE HAS VISIBLE HEADINGS AT ALL, which was the fifth criticism. Every part
    // of it used to be marked with a 10px grey caption, so a reader scanning the page had
    // nothing at heading weight to land on.
    check(
      'versus page: every section is a real heading, not a mono caption',
      () =>
        (home.match(/<SectionHead/g) ?? []).length >= 5 &&
        // One `MONO_CAP` survives, on the held-room card, which is a card's own caption
        // rather than a section of the page. More than that and the captions are back.
        (home.match(/MONO_CAP/g) ?? []).length <= 2,
      () =>
        `${(home.match(/<SectionHead/g) ?? []).length} headings, ${(home.match(/MONO_CAP/g) ?? []).length} captions`,
    );
  }

  // --- A ROOM'S CHAIRS, SPLIT THREE WAYS ------------------------------------
  // A practice opponent is neither a person nor a free chair: it is genuinely taken and it
  // still yields to anybody who turns up, so folding it into either of the others tells the
  // reader something false about what walking in would mean.
  {
    const room = (size: number, seated: number, bots?: number) => ({ size, seated, bots });
    check(
      'pvpView: the seats always add up to the room, and a practice opponent is its own state',
      () => {
        const half = seatCounts(room(4, 2));
        const padded = seatCounts(room(8, 3, 2));
        const full = seatCounts(room(2, 2));
        return (
          half.people === 2 && half.practice === 0 && half.free === 2 &&
          padded.people === 3 && padded.practice === 2 && padded.free === 3 &&
          full.people === 2 && full.free === 0 &&
          // The property, over every shape the referee can send: the three always tile the
          // room exactly, so a row of dots is never short or long.
          [2, 4, 8].every((size) =>
            Array.from({ length: size + 1 }, (_, seated) =>
              Array.from({ length: size + 1 }, (_, bots) => seatCounts(room(size, seated, bots))),
            )
              .flat()
              .every((c) => c.people + c.practice + c.free === size),
          )
        );
      },
      () => JSON.stringify(seatCounts(room(8, 3, 2))),
    );
    check(
      'pvpView: a seat count that does not fit its own room is clamped rather than thrown',
      () =>
        // `seated` and `bots` are two independent subqueries on the server, so a row read
        // between two writes really can carry a pair that does not fit - and a negative
        // count reaches `Array.from({ length })`, which throws in the middle of a list.
        seatCounts(room(4, 9)).free === 0 &&
        seatCounts(room(4, 9)).people === 4 &&
        seatCounts(room(4, 2, 9)).practice === 2 &&
        // Nothing negative reaches `Array.from({ length })`, and the room still tiles.
        seatCounts(room(4, 9, 9)).people +
          seatCounts(room(4, 9, 9)).practice +
          seatCounts(room(4, 9, 9)).free ===
          4 &&
        [seatCounts(room(4, 9, 9)), seatCounts(room(2, -1, -1))].every(
          (c) => c.people >= 0 && c.practice >= 0 && c.free >= 0,
        ) &&
        seatCounts(room(2, -1)).people === 0,
      () => JSON.stringify(seatCounts(room(4, 9, 9))),
    );
    check(
      'pvpView: the seats have a sentence for anybody who cannot see the dots',
      () =>
        seatCounts(room(4, 2)).label === '2 people, 2 seats free' &&
        seatCounts(room(4, 1)).label === '1 person, 3 seats free' &&
        seatCounts(room(8, 3, 2)).label === '3 people, 2 practice opponents, 3 seats free' &&
        seatCounts(room(2, 1, 1)).label === '1 person, 1 practice opponent, full' &&
        // A full room says so rather than counting to zero.
        seatCounts(room(2, 2)).label === '2 people, full',
      () => seatCounts(room(8, 3, 2)).label,
    );
  }

}
