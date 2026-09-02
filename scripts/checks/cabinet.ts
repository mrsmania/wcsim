// Characterization checks for the trophy cabinet, the badges and the run archive.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, playToEnd, runFor, xiFor } from './harness';
import { ALL_PLAYERS } from '../../src/data/squads';
import { collectiblePlayers, collectiblesByTier, emptyAlbum, tierOf } from '../../src/domain/album';
import { ASCENSIONS } from '../../src/domain/ascension';
import { BADGES, badgeRows, badgesEarned, perkTiersOwned } from '../../src/domain/badges';
import { lockableBoons } from '../../src/domain/boons';
import { bestCupStreakOf, cabinetView, finalsLostOf } from '../../src/domain/cabinet';
import {
  HISTORY_LIMIT,
  INITIAL_CAREER,
  PERKS,
  PLAYER_RECORD_LIMIT,
  applyRunResult,
} from '../../src/domain/career';
import { CHALLENGES, FAMILIES, challengeProgress } from '../../src/domain/challenges';
import { FORMATIONS_DATA } from '../../src/domain/formations';
import {
  type KoRecord,
  type RunOutcome,
  type RunState,
  addMatches,
  beginRun,
  chooseBoon,
  emptyTally,
  playGroupStage,
  prepareGroupStage,
  prepareKnockoutRound,
  runTotals,
} from '../../src/domain/run';

export function cabinetChecks(): void {
  // --- Trophy cabinet + badges (item 06) -------------------------------------
  // The cabinet records nothing: every figure is derived from a CareerState / AlbumState
  // that already existed. So what is worth asserting is that the derivation stays honest
  // against the states it will actually meet - an untouched career, a save written before
  // any of this existed, and a maxed-out one.
  {
    // A career from before the counters landed: the three optional arrays are absent, and
    // the cabinet must still render rather than throwing on a spread of undefined.
    const stale = {
      ...INITIAL_CAREER,
      stats: {
        ...INITIAL_CAREER.stats,
        cupsByAscension: undefined as unknown as number[],
        cupFormations: undefined as unknown as string[],
      },
    };
    const empty = cabinetView(INITIAL_CAREER, emptyAlbum(), ALL_PLAYERS);
    const staleView = cabinetView(stale, emptyAlbum(), ALL_PLAYERS);

    check(
      'cabinet: a fresh career has an empty shelf, a full ladder and no best tier',
      () => empty.shelf.length === 0 &&
        empty.ladder.length === ASCENSIONS.length &&
        empty.headline.bestCupAscension === null &&
        !empty.complete,
    );
    check(
      'cabinet: a save written before the career counters still renders',
      () => staleView.shelf.length === 0 &&
        staleView.ladder.every((r) => r.cups === 0) &&
        staleView.formations.every((f) => !f.won),
    );

    // One trophy per cup, at the tier it was won at, for every distribution the ladder
    // allows. Built by playing the real reward path so the counters are the ones the game
    // writes rather than ones hand-set here.
    let shelfOk = true;
    let ladderOk = true;
    let career = INITIAL_CAREER;
    for (const a of ASCENSIONS) {
      // Level the career up enough to select the tier, then win there twice.
      career = { ...career, level: 99, ascension: a.tier };
      for (let i = 0; i < 2; i++) {
        const run: RunState = {
          ...runFor(0, { perkLevels: career.perkLevels, unlockedBoons: career.unlockedBoons, ascension: a.tier }),
          phase: 'ended',
          outcome: 'champion',
          score: 140,
        };
        career = applyRunResult(career, run).career;
      }
      const v = cabinetView(career, emptyAlbum(), ALL_PLAYERS);
      if (v.shelf.length !== career.stats.cups) shelfOk = false;
      if (v.shelf.filter((c) => c.tier === a.tier).length !== 2) shelfOk = false;
      // Every cup on the shelf carries the label of the tier it was won at, and its
      // "n of m" is within range.
      if (v.shelf.some((c) => c.label !== ASCENSIONS[c.tier].label)) shelfOk = false;
      if (v.shelf.some((c) => c.nth < 1 || c.nth > c.ofTier)) shelfOk = false;
      // Selectable implies unlocked, and both are downward-closed: a gap in the ladder
      // would mean a tier you could pick with a lower one you could not.
      const sel = v.ladder.map((r) => r.selectable);
      const unl = v.ladder.map((r) => r.unlocked);
      if (v.ladder.some((r) => r.selectable && !r.unlocked)) ladderOk = false;
      for (let i = 1; i < sel.length; i++) {
        if (sel[i] && !sel[i - 1]) ladderOk = false;
        if (unl[i] && !unl[i - 1]) ladderOk = false;
      }
      if (v.ladder[0].cups === 0) ladderOk = false; // Base was won first, above
    }
    check('cabinet: the shelf is one trophy per cup, at the tier it was won at', () => shelfOk);
    check('cabinet: selectable implies unlocked, and both are downward-closed', () => ladderOk);

    // The record the counters do NOT keep. `cupStreak` resets on any lesser finish, so a
    // career that once won three in a row and then went out still has to report 3 - which
    // it can only do by reading the honours it holds.
    const streaky = {
      ...INITIAL_CAREER,
      stats: { ...INITIAL_CAREER.stats, cups: 3, cupStreak: 0 },
      completedChallenges: ['first-blood', 'back-to-back', 'three-peat'],
    };
    check(
      'cabinet: the best cup streak survives the counter being reset',
      () => bestCupStreakOf(streaky) === 3 &&
        bestCupStreakOf({ ...streaky, completedChallenges: ['back-to-back'] }) === 2 &&
        // Never below 1 once a cup exists, and never above the live counter.
        bestCupStreakOf({ ...streaky, completedChallenges: [] }) === 1 &&
        bestCupStreakOf(INITIAL_CAREER) === 0 &&
        bestCupStreakOf({
          ...INITIAL_CAREER,
          stats: { ...INITIAL_CAREER.stats, cups: 5, cupStreak: 5 },
        }) === 5,
    );

    // Badges: earned is DERIVED from the fraction, so the two can never disagree, and
    // `have` is clamped so no badge reads past complete.
    const albumFull = {
      ...emptyAlbum(),
      collected: collectiblePlayers(ALL_PLAYERS).map((p) => p.id),
    };
    const maxed = {
      ...INITIAL_CAREER,
      level: 99,
      prestige: 0,
      perkLevels: Object.fromEntries(PERKS.map((pk) => [pk.id, pk.tiers.length])),
      unlockedBoons: lockableBoons().map((b) => b.id),
      ascension: ASCENSIONS.length - 1,
      completedChallenges: CHALLENGES.map((c) => c.id),
      stats: {
        ...INITIAL_CAREER.stats,
        cups: 12,
        prestigeSpent: 5000,
        cupsByAscension: ASCENSIONS.map(() => 2),
        cupFormations: [...FORMATIONS_DATA.names],
      },
    };
    const emptyRows = badgeRows({ career: INITIAL_CAREER, album: { collected: 0, total: 81 } });
    const fullRows = badgeRows({ career: maxed, album: { collected: 81, total: 81 } });
    const consistent = [...emptyRows, ...fullRows].every(
      (r) => r.done === (r.have >= r.need) && r.have <= r.need && r.have >= 0,
    );
    check(
      'badges: earned is derived from the fraction, and nothing reads past complete',
      () => consistent && BADGES.length > 0,
    );
    check(
      'badges: a fresh career has earned none and a maxed one has earned every badge',
      () => badgesEarned(emptyRows) === 0 && badgesEarned(fullRows) === fullRows.length,
    );
    // Distinct ids, and no badge phrased as a single-run goal (that is a challenge).
    check(
      'badges: ids are unique',
      () => new Set(BADGES.map((b) => b.id)).size === BADGES.length,
    );
    // An over-claiming save (a perk tier that no longer exists) cannot read as more than
    // the tracks hold - the same clamp `extraRerollsOf` applies.
    const overclaim = {
      ...INITIAL_CAREER,
      perkLevels: Object.fromEntries(PERKS.map((pk) => [pk.id, pk.tiers.length + 5])),
    };
    const perkTotal = PERKS.reduce((n, pk) => n + pk.tiers.length, 0);
    check(
      'badges: an over-claiming save is clamped to the tiers that exist',
      () => perkTiersOwned(overclaim) === perkTotal && perkTiersOwned(INITIAL_CAREER) === 0,
    );
    // The complete state means complete: honours, badges and album all full.
    const done = cabinetView(maxed, albumFull, ALL_PLAYERS);
    check(
      'cabinet: the complete state needs every honour, every badge and every sticker',
      () => done.complete &&
        !cabinetView(maxed, emptyAlbum(), ALL_PLAYERS).complete &&
        done.honours.completed === done.honours.total &&
        done.album.collected === done.album.total,
    );
  }

  // --- Challenge and album groupings the cabinet reads ------------------------
  {
    const someIds = CHALLENGES.filter((_, i) => i % 3 === 0).map((c) => c.id);
    const prog = challengeProgress(someIds);
    const famTotal = FAMILIES.reduce((n, f) => n + prog.byFamily[f].total, 0);
    const famDone = FAMILIES.reduce((n, f) => n + prog.byFamily[f].completed, 0);
    const perFamilyOk = FAMILIES.every(
      (f) =>
        prog.byFamily[f].total === CHALLENGES.filter((c) => c.family === f).length &&
        prog.byFamily[f].completed ===
          CHALLENGES.filter((c) => c.family === f && someIds.includes(c.id)).length,
    );
    check(
      'challenges: byFamily reconciles with the catalogue and with the totals',
      () => perFamilyOk && famTotal === prog.total && famDone === prog.completed,
    );

    // The tier grouping partitions the collectibles exactly: every collectible in one
    // list, nothing else in any of them, each sorted rating-desc.
    const byTier = collectiblesByTier(ALL_PLAYERS);
    const flat = [...byTier.monumental, ...byTier.iconic, ...byTier.legendary];
    const collectible = collectiblePlayers(ALL_PLAYERS);
    const sortedOk = Object.values(byTier).every((list) =>
      list.every((p, i) => i === 0 || list[i - 1].elo >= p.elo),
    );
    const tieredOk = (Object.keys(byTier) as (keyof typeof byTier)[]).every((t) =>
      byTier[t].every((p) => tierOf(p) === t),
    );
    check(
      'album: collectiblesByTier partitions the collectibles, rating-desc',
      () => flat.length === collectible.length &&
        new Set(flat.map((p) => p.id)).size === collectible.length &&
        tieredOk &&
        sortedOk,
    );
  }

  // --- The run archive and the player records (item 06, option D) -------------
  // The only RECORDED part of the cabinet, so the assertions here are about the
  // recording: that a tally accumulates over the matches actually played, that shootout
  // kicks never reach it, that the archive stays capped and newest-first, and that a save
  // written before any of it still banks.
  {
    // A whole run, played through the real prepare* path so the tally is built the way
    // the game builds it (not hand-set here).
    const xi = xiFor();
    let run: RunState = beginRun(xi);
    let guard = 0;
    const prepared = prepareGroupStage(run);
    run = prepared?.next ?? run;
    // Group: three matches, so every one of the eleven has three appearances.
    const groupApps = xi.every((p) => (run.tally?.apps[p.id] ?? 0) === 3);
    // Goals only ever go to players who were on the pitch, and never more than were
    // scored: the tally is not inventing scorers.
    const groupGoals = Object.values(run.tally?.goals ?? {}).reduce((a, b) => a + b, 0);
    const groupScored = (prepared?.userMatches ?? []).reduce((n, m) => n + m.result.homeGoals, 0);
    const groupIdsKnown = Object.keys(run.tally?.goals ?? {}).every((id) =>
      xi.some((p) => p.id === id),
    );
    check(
      'tally: the group stage records three appearances each and only real scorers',
      () => groupApps && groupGoals === groupScored && groupIdsKnown,
    );

    // Play the run out. Appearances must equal matches played at every step, which is the
    // invariant that catches a branch of prepareKnockoutRound forgetting to carry it.
    let matches = 3;
    let appsTrackMatches = true;
    while (run.phase !== 'ended' && guard++ < 12) {
      if (run.phase === 'boon' && run.offer?.length) {
        run = chooseBoon(run, run.offer[0].id).next;
        continue;
      }
      const ko = prepareKnockoutRound(run);
      if (!ko) break;
      run = ko.next;
      matches++;
      // Only players still in the XI gain the appearance, so compare against the XI that
      // played rather than the original eleven (a roster boost may have changed it).
      const maxApps = Math.max(...Object.values(run.tally?.apps ?? { x: 0 }));
      if (maxApps !== matches) appsTrackMatches = false;
    }
    check('tally: appearances track the matches actually played', () => appsTrackMatches);

    // Shootout kicks are not goals. Find a run that went to penalties and assert its
    // scored-in-open-play total matches the tally, ignoring the shootout entirely.
    let pensSeen = 0;
    let pensOk = true;
    // Kicks CONVERTED by the user across the whole sample, not per run: a shootout lost
    // 0-3 converts none, so requiring every sampled run to have scored one made this
    // assertion fail on an unlucky draw rather than on a real defect. What has to hold per
    // run is only that the tally ignores the shootout.
    let penKicksSeen = 0;
    for (let i = 0; i < 400 && pensSeen < 12; i++) {
      const r = playToEnd(playGroupStage(runFor(i)), 0, 12);
      const shootouts = r.history.filter((h): h is KoRecord => h.stage !== 'group' && !!h.pens);
      if (!shootouts.length) continue;
      pensSeen++;
      const tallied = Object.values(r.tally?.goals ?? {}).reduce((a, b) => a + b, 0);
      // Every goal the run's own records show, from the scorelines, excluding shootouts.
      const scored = runTotals(r).goalsFor;
      penKicksSeen += shootouts.reduce((n, h) => n + (h.pens?.home ?? 0), 0);
      if (tallied !== scored) pensOk = false;
    }
    check(
      'tally: a shootout adds kicks to the scoreline but no goals to a scorer',
      () => pensSeen > 0 && penKicksSeen > 0 && pensOk,
    );

    // addMatches directly: an unknown scorer name is dropped rather than guessed, and the
    // opponent's goals are never counted.
    const t = addMatches(emptyTally(), xi, [
      {
        events: [
          { minute: 10, side: 'home', scorer: xi[0].name },
          { minute: 20, side: 'home', scorer: 'Unknown' },
          { minute: 30, side: 'away', scorer: xi[1].name },
        ],
      },
    ]);
    check(
      'tally: unknown scorers are dropped and the opponent scores nothing',
      () => t.goals[xi[0].id] === 1 &&
        t.goals[xi[1].id] === undefined &&
        Object.values(t.goals).reduce((a, b) => a + b, 0) === 1 &&
        xi.every((p) => t.apps[p.id] === 1),
    );

    // The archive: newest first, capped, and the counters it carries agree with the run.
    let career = INITIAL_CAREER;
    // A finished run with a chosen score and finish, for the archive rows below.
    const finished = (score: number, outcome: RunOutcome): RunState => ({
      ...beginRun(xi),
      phase: 'ended',
      outcome,
      score,
    });
    const banked = applyRunResult(career, { ...run, phase: 'ended', outcome: 'champion', score: 140 }, undefined, 1000);
    const first = banked.career.stats.history?.[0];
    const tot = runTotals(run);
    check(
      'archive: a banked run writes one dated row that agrees with the run',
      () => banked.career.stats.history?.length === 1 &&
        first?.at === 1000 &&
        first?.outcome === 'champion' &&
        first?.score === 140 &&
        first?.xp === banked.xpGained &&
        first?.prestige === banked.prestigeGained &&
        first?.goalsFor === tot.goalsFor &&
        first?.goalsAgainst === tot.goalsAgainst &&
        first?.roundsWon === tot.roundsWon,
    );

    career = INITIAL_CAREER;
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
      career = applyRunResult(career, finished(10 + i, 'group'), undefined, i + 1).career;
    }
    const hist = career.stats.history ?? [];
    check(
      'archive: newest first, capped, and the cap drops the oldest',
      () => hist.length === HISTORY_LIMIT &&
        hist[0].score === 10 + HISTORY_LIMIT + 24 &&
        hist[0].at === HISTORY_LIMIT + 25 &&
        hist.every((h, i) => i === 0 || (hist[i - 1].at ?? 0) > (h.at ?? 0)),
    );
    check(
      'archive: a run banked with no clock carries no date rather than a fake one',
      () => applyRunResult(INITIAL_CAREER, finished(10, 'group')).career.stats.history?.[0].at === undefined,
    );

    // Player records: additive across runs, one run counted per run, and a save from
    // before the tally existed banks without touching them.
    const twice = applyRunResult(
      applyRunResult(INITIAL_CAREER, run, undefined, 1).career,
      run,
      undefined,
      2,
    ).career;
    const rec = twice.stats.players ?? {};
    const anyId = Object.keys(rec)[0];
    const appsInRun = run.tally?.apps[anyId] ?? 0;
    check(
      'records: appearances and goals add up across runs, and runs count once each',
      () => !!anyId && rec[anyId].apps === appsInRun * 2 && rec[anyId].runs === 2,
    );
    const legacy: RunState = { ...run, tally: undefined };
    const legacyBank = applyRunResult(INITIAL_CAREER, legacy, undefined, 1).career;
    check(
      'records: a run persisted before the tally existed banks and records no players',
      () => legacyBank.stats.players === undefined && legacyBank.stats.history?.length === 1,
    );

    // The cap keeps this run's players even when it is already full of others.
    const stuffed = {
      ...INITIAL_CAREER,
      stats: {
        ...INITIAL_CAREER.stats,
        players: Object.fromEntries(
          Array.from({ length: PLAYER_RECORD_LIMIT }, (_, i) => [
            `filler-${i}`,
            { apps: 99, goals: 0, runs: 1 },
          ]),
        ),
      },
    };
    const capped = applyRunResult(stuffed, run, undefined, 1).career.stats.players ?? {};
    const kept = Object.keys(run.tally?.apps ?? {}).every((id) => !!capped[id]);
    check(
      'records: at the cap, the players of the run just banked are never the ones dropped',
      () => Object.keys(capped).length === PLAYER_RECORD_LIMIT && kept,
    );

    // Titles: a cup credits every player who PLAYED in the run that won it, and a lesser
    // finish credits nobody. The two runs are the same run with the outcome swapped, so
    // nothing but the outcome can be doing the work, and the guard is that the fixture
    // fielded a full XI: "no player gained a title" is trivially true of a run that
    // recorded no players, which is the failure this is meant to catch. At least eleven
    // rather than exactly eleven, because this run took its boosts and a roster boost
    // brings a twelfth player in - who is credited too, which is the point.
    const played = Object.keys(run.tally?.apps ?? {});
    const asCup = (r: RunState, outcome: RunOutcome): RunState => ({ ...r, phase: 'ended', outcome });
    const cupOnce = applyRunResult(INITIAL_CAREER, asCup(run, 'champion'), undefined, 1).career;
    const exited = applyRunResult(INITIAL_CAREER, asCup(run, 'group'), undefined, 1).career;
    check(
      'titles: a cup credits every player who played in it, a group exit credits none',
      () => played.length >= 11 &&
        played.every((id) => (cupOnce.stats.players?.[id]?.cups ?? 0) === 1) &&
        played.every((id) => (exited.stats.players?.[id]?.cups ?? 0) === 0),
    );
    // Two cups add up and the losing run between them adds nothing, which is the same
    // additive rule appearances follow - a title board that counted runs would read 3.
    const threeRuns = [
      asCup(run, 'champion'),
      asCup(run, 'sf'),
      asCup(run, 'champion'),
    ].reduce((c, r, i) => applyRunResult(c, r, undefined, i + 1).career, INITIAL_CAREER);
    check(
      'titles: cups add up across runs and a lesser finish in between adds none',
      () => played.every((id) => threeRuns.stats.players?.[id]?.cups === 2) &&
        played.every((id) => threeRuns.stats.players?.[id]?.runs === 3) &&
        threeRuns.stats.cups === 2 &&
        threeRuns.stats.cupsRecorded === 2,
    );
    // The coverage counter, which is the only thing the board cannot derive: a cup won by
    // a run with no tally (any run persisted before the tally existed) counts as a cup and
    // NOT as one the board holds names for, so the screen can say "0 of 1" rather than
    // showing an empty board over a full shelf.
    const cupNoNames = applyRunResult(
      INITIAL_CAREER,
      { ...asCup(run, 'champion'), tally: undefined },
      undefined,
      1,
    ).career;
    check(
      'titles: a cup the records hold no line-up for counts as a cup and not as covered',
      () => cupNoNames.stats.cups === 1 &&
        (cupNoNames.stats.cupsRecorded ?? 0) === 0 &&
        cupOnce.stats.cupsRecorded === 1,
    );
    // Finals lost is a COUNT, and it used to be a yes/no printed against the label "Finals
    // lost". The counter is exact from the run it started at; the floor is what a career
    // older than it can still prove. Both halves are asserted, and so is the vacuity
    // guard - a career that has never lost one must read 0, or a function that simply
    // returned the flag would pass everything above it.
    const lostFinals = [asCup(run, 'final'), asCup(run, 'champion'), asCup(run, 'final')].reduce(
      (c, r, i) => applyRunResult(c, r, undefined, i + 1).career,
      INITIAL_CAREER,
    );
    const oldFlagOnly = {
      ...INITIAL_CAREER,
      stats: { ...INITIAL_CAREER.stats, everLostFinal: true },
    };
    const oldArchive = {
      ...oldFlagOnly,
      stats: {
        ...oldFlagOnly.stats,
        history: (['final', 'group', 'final', 'final'] as RunOutcome[]).map((outcome) => ({
          outcome,
          ascension: 0,
          score: 0,
          xp: 0,
          prestige: 0,
          roundsWon: 0,
          goalsFor: 0,
          goalsAgainst: 0,
        })),
      },
    };
    check(
      'records: finals lost is a count, floored by whatever an older career can prove',
      () => lostFinals.stats.finalsLost === 2 &&
        finalsLostOf(lostFinals) === 2 &&
        // The flag alone proves one; the archive proves three; neither can lower a count.
        finalsLostOf(oldFlagOnly) === 1 &&
        finalsLostOf(oldArchive) === 3 &&
        finalsLostOf({ ...oldArchive, stats: { ...oldArchive.stats, finalsLost: 7 } }) === 7 &&
        finalsLostOf(INITIAL_CAREER) === 0 &&
        cabinetView(lostFinals, emptyAlbum(), ALL_PLAYERS).records.finalsLost === 2,
    );
    // At the cap, a title-holder outranks a player with far more appearances and no cup.
    // A cup is the one fact no other column can imply, so it sorts ahead of the two it
    // used to sort behind; the filler is deliberately given 99 appearances, which is what
    // used to decide this.
    const withTitle = {
      ...INITIAL_CAREER,
      stats: {
        ...INITIAL_CAREER.stats,
        players: {
          ...Object.fromEntries(
            Array.from({ length: PLAYER_RECORD_LIMIT }, (_, i) => [
              `filler-${i}`,
              { apps: 99, goals: 0, runs: 1 },
            ]),
          ),
          'old-champion': { apps: 1, goals: 0, runs: 1, cups: 1 },
        },
      },
    };
    const pruned = applyRunResult(withTitle, asCup(run, 'sf'), undefined, 1).career.stats.players ?? {};
    check(
      'titles: at the cap a title-holder is kept ahead of a player with more appearances',
      () => Object.keys(pruned).length === PLAYER_RECORD_LIMIT &&
        !!pruned['old-champion'] &&
        Object.keys(pruned).filter((id) => id.startsWith('filler-')).length < PLAYER_RECORD_LIMIT,
    );
    // And the board itself: ranked by cups, holders only, capped at ten, with the
    // coverage counter carried through to the screen.
    const cupView = cabinetView(threeRuns, emptyAlbum(), ALL_PLAYERS);
    const titlesOrdered = cupView.topTitles.every(
      (r, i) =>
        (r.record.cups ?? 0) > 0 &&
        (i === 0 || (cupView.topTitles[i - 1].record.cups ?? 0) >= (r.record.cups ?? 0)),
    );
    // Holders ONLY, and this needs a fixture the run cannot give: every player of a
    // one-run career has the same cups, so a board that had lost its filter would look
    // identical. Three holders among a dozen tracked players is what tells them apart -
    // the nine without a cup are on the Most used board, which is the guard that they
    // were there to be wrongly listed.
    const mixed = {
      ...INITIAL_CAREER,
      stats: {
        ...INITIAL_CAREER.stats,
        cups: 3,
        cupsRecorded: 3,
        players: Object.fromEntries(
          ALL_PLAYERS.slice(0, 12).map((p, i) => [
            p.id,
            { apps: 20 - i, goals: 0, runs: 4, ...(i < 3 ? { cups: 3 - i } : {}) },
          ]),
        ),
      },
    };
    const mixedView = cabinetView(mixed, emptyAlbum(), ALL_PLAYERS);
    check(
      'cabinet: the titles board is ranked by cups, holders only, and says what it covers',
      () => cupView.topTitles.length === 10 &&
        titlesOrdered &&
        cupView.cupsRecorded === 2 &&
        cupView.headline.cups === 2 &&
        cabinetView(cupNoNames, emptyAlbum(), ALL_PLAYERS).topTitles.length === 0 &&
        mixedView.topTitles.length === 3 &&
        mixedView.topUsed.length === 10 &&
        mixedView.topTitles.map((r) => r.record.cups).join() === '3,2,1',
    );

    // And the cabinet's two leaderboards read them in order, top ten only.
    const view = cabinetView(twice, emptyAlbum(), ALL_PLAYERS);
    const usedOrdered = view.topUsed.every(
      (r, i) => i === 0 || view.topUsed[i - 1].record.apps >= r.record.apps,
    );
    const scorersOrdered = view.topScorers.every(
      (r, i) =>
        r.record.goals > 0 && (i === 0 || view.topScorers[i - 1].record.goals >= r.record.goals),
    );
    check(
      'cabinet: the leaderboards are ranked, capped at ten, and scorers all have a goal',
      () => view.topUsed.length <= 10 &&
        view.topScorers.length <= 10 &&
        usedOrdered &&
        scorersOrdered &&
        view.playersTracked === Object.keys(rec).length &&
        view.history.length === 2,
    );
  }

}
