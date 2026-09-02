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
  duelRules,
  duelToOpen,
  duelTurn,
  everybodyReady,
  gamesIn,
  inviteText,
  inviteUrl,
  isDuel,
  leaveKind,
  seatsOf,
  lobbyJoinable,
  inviteNote,
  inviteRules,
  inviteState,
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
  walkover,
  xiFrom,
  xiStrengthFrom,
} from '../../src/domain/pvpView';
import type { DuelRow, InviteRoom, LobbyRoom, RoomView, TieView } from '../../src/domain/pvpWire';
import { readFileSync, readdirSync } from 'node:fs';
import { STRENGTH_BANDS } from '../../src/domain/draft';
import { offersRatingSwitch, ratingBand, roomDisplay } from '../../src/domain/pvpView';
import { ROOM_CONTROLS, SOLO_CONTROLS, roomControls } from '../../src/components/buildControls';
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
      'pvpView: a row says how many chairs the host filled with practice opponents, and none is silent',
      () =>
        // It changes what turning up MEANS - the room can start the moment you arrive, and
        // one of your ties may be against a seat rather than a person.
        lobbyLine({ ...budget, bots: 2 }) === 'Buy an XI with $110, 20s a pick, 2 practice opponents' &&
        lobbyLine({ ...budget, bots: 1 }) === 'Buy an XI with $110, 20s a pick, 1 practice opponent' &&
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
      rerolls: 3,
      showRatings: true,
      hostName: 'Ada',
      openedAt: 1_000_000,
    };
    const duel: InviteRoom = { ...live, pace: 'async', size: 2, seated: 1, method: 'roll' };
    check(
      'pvpView: an invitation to a duel does not promise the pick clock a duel has not got',
      () =>
        // A live room gets the public list's own sentence.
        inviteRules(live) === lobbyLine(live) &&
        inviteRules(live).includes('20s a pick') &&
        // A DUEL DOES NOT, and this is the trap the pace guards: a duel stores a
        // `pickSeconds` it never reads (`tickDuel`), so `lobbyLine` would tell a stranger
        // about a twenty-second window that does not exist in the mode they are joining.
        inviteRules(duel) === 'Roll for your XI, one man from each squad' &&
        !inviteRules(duel).includes('pick') &&
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
        roomLine(room) === 'closed' &&
        // Vacuity both ways: with a champion it reads as a result, and with the viewer as
        // the champion it reads as a win.
        roomLine({ ...room, championId: AWAY }) === 'finished' &&
        roomLine({ ...room, championId: HOME }) === 'you won',
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
  // served from `/wcsim/` on GitHub Pages and from `/` in the Docker image, and a link that
  // hardcoded either would be dead from the other.
  {
    check(
      'pvpView: an invite link lands on the room, under whichever base path this build is served from',
      () =>
        inviteUrl('https://x.github.io', '/wcsim/', 'AB12CD') ===
          'https://x.github.io/wcsim/versus/AB12CD' &&
        inviteUrl('https://play.example', '/', 'AB12CD') ===
          'https://play.example/versus/AB12CD' &&
        // A base without its trailing slash, and an origin with one, are both survivable:
        // the two come from different places (Vite, and the browser) and only one of them
        // promises a shape.
        inviteUrl('https://x.dev/', '/wcsim', 'AB12CD') === 'https://x.dev/wcsim/versus/AB12CD' &&
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
        duelAlertLine(row({ yourPicks: 11 }), 'your-move') === 'your XI is ready to send',
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
        duelAlertLine(mine, 'your-move') === 'your move, pick your XI' &&
        !/[0-9]/.test(duelAlertLine(mine, 'your-move')) &&
        // Built but not sent is a different instruction and is still said. It splits on the
        // count without printing it, so a stale reading falls back to the safer sentence.
        duelAlertLine(row({ yourPicks: 11 }), 'your-move') === 'your XI is ready to send' &&
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
        /if \(next\.you\) holdVersusRoom\(/.test(hook),
      () =>
        `lobby ${/isHost && !m\.bot/.test(lobby)}, retry ${/\{problem && !thrownOut &&/.test(screen)}, ` +
        `hold ${/if \(next\.you\) holdVersusRoom\(/.test(hook)}`,
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
        // come off the URL rather than being a prop somebody could stop passing.
        /const code = inRoom\?\.params\.code/.test(screen) &&
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

  // --- The four controls a room hides (P41), plus the three it turns off -----
  // A LIST rather than a flag, because the list is the decision: each entry breaks the
  // pick clock, or the referee, in its own way. This asserts the two sets are the same
  // shape and are opposites, so a control added to one and forgotten in the other shows
  // up here rather than as a button in a room that does nothing.
  {
    const solo = Object.entries(SOLO_CONTROLS).sort();
    const roomC = Object.entries(ROOM_CONTROLS).sort();
    // AND WHAT A WHOLE-DRAFT ROOM ADDS BACK (P52). Exactly two, and only because of how it
    // submits: the board goes over as a map, so a move and a removal are the same
    // instruction as a purchase. Everything else stays off for reasons that were never
    // about the clock.
    const whole = Object.entries(roomControls(true)).sort();
    check(
      'pvpView: a whole-draft room adds back the move and the remove, and nothing else',
      () =>
        whole.map(([k]) => k).join() === roomC.map(([k]) => k).join() &&
        whole.filter(([, v]) => v).map(([k]) => k).sort().join() === 'movePlayer,removePlayer' &&
        // A per-pick room is unchanged, which is the vacuity guard: a `roomControls` that
        // ignored its argument would pass the line above and fail this one.
        Object.values(roomControls(false)).every((v) => v === false),
      () => whole.filter(([, v]) => v).map(([k]) => k).join(),
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
}
