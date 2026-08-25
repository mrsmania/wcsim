// Characterization checks for the challenge catalogue and what it judges.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, koRec, playToEnd, runFor } from './harness';
import { INITIAL_SWAPS } from '../../src/config';
import { ALL_PLAYERS, SQUADS, basePlayer } from '../../src/data/squads';
import { type Player, type Position, primaryPosition } from '../../src/data/types';
import { emptyAlbum } from '../../src/domain/album';
import { ASCENSIONS } from '../../src/domain/ascension';
import { BOON_UNLOCK_COST, lockableBoons } from '../../src/domain/boons';
import {
  HIGH_ASCENSION,
  INITIAL_CAREER,
  PERKS,
  applyRunResult,
  buyPerkTier,
  levelForXp,
  unlockBoon,
} from '../../src/domain/career';
import {
  AWARD,
  AWARDS_ON,
  CHALLENGES,
  FAMILIES,
  challengeById,
  challengeProgress,
  completedIn,
  prestigeFor,
  viewOf,
} from '../../src/domain/challenges';
import { MAX_BONUS } from '../../src/domain/chemistry';
import { type Style, getFormation } from '../../src/domain/formations';
import {
  type BudgetBuild,
  type RunBuild,
  type RunOutcome,
  type RunShape,
  type RunState,
  beginRun,
  chemistryOf,
  playGroupStage,
} from '../../src/domain/run';
import { bestEleven } from '../../src/domain/tournament';

export function challengesChecks(): void {
  // --- Challenges: the catalogue is well-formed --------------------------------
  {
    const ids = new Set(CHALLENGES.map((c) => c.id));
    const ok =
      ids.size === CHALLENGES.length &&
      CHALLENGES.every((c) => !!c.name && !!c.description && !!AWARD[c.tier]) &&
      // Every family is represented, so the "one from every family" challenge is winnable.
      FAMILIES.every((f) => CHALLENGES.some((c) => c.family === f)) &&
      // House style: no em-dashes in player-facing copy.
      CHALLENGES.every((c) => !c.name.includes('\u2014') && !c.description.includes('\u2014'));
    check('challenges: ids are unique and every entry is complete and in a real family', () => ok);
  }

  // --- Challenges: every predicate is total, pure, and read-only ---------------
  // The catalogue runs at the one moment a run is banked. A predicate that throws would
  // take the reward with it, and one that mutates the run would corrupt what is saved, so
  // both are asserted rather than hoped for.
  {
    const runs: RunState[] = [];
    for (let i = 0; i < 12; i++) {
      // The pick rotates per run, so the sample is not twelve copies of the same choices.
      runs.push(playToEnd(playGroupStage(runFor(i * 7)), (offer) => offer[i % offer.length]));
    }
    let total = true;
    let pure = true;
    let readOnly = true;
    for (const run of runs) {
      const before = JSON.stringify(run);
      const view = viewOf({
        run,
        base: basePlayer,
        career: INITIAL_CAREER,
        album: emptyAlbum(),
        trades: 0,
      });
      for (const c of CHALLENGES) {
        let first: boolean | null = null;
        try {
          first = c.check(view);
          if (c.check(view) !== first) pure = false;
        } catch {
          total = false;
        }
        if (typeof first !== 'boolean') total = false;
        if (c.blocked && first) readOnly = false; // a blocked entry must never complete
      }
      if (JSON.stringify(run) !== before) readOnly = false;
    }
    check('challenges: every predicate returns a boolean and never throws', () => total);
    check('challenges: predicates are pure (same run, same answer, run untouched)', () => pure && readOnly);
  }

  // --- Challenges: the three traps ---------------------------------------------
  // Each of these was a real bug in this codebase before it was written down.
  {
    const brazil = SQUADS.find((s) => s.code === 'BRA')!;
    const xi = bestEleven(brazil.players);
    // A finished run to judge a challenge against. Named for what it builds: the file has
    // a second helper of the same shape further down that builds something else (H158).
    const wonCup = (over: Partial<RunState>): RunState => ({
      ...beginRun(xi),
      phase: 'ended',
      outcome: 'champion',
      score: 140,
      ...over,
    });
    const ctx = (run: RunState, career = INITIAL_CAREER) => ({
      run,
      base: basePlayer,
      career,
      album: emptyAlbum(),
      trades: 0,
    });

    // 1. Ratings are judged on the DATASET player, not the boosted copy in hand.
    const boostedXi = xi.map((p) => ({ ...p, elo: Math.min(99, p.elo + 8) }));
    const ratingOk =
      !completedIn(ctx(wonCup({ xi }))).includes('galacticos') ===
      !completedIn(ctx(wonCup({ xi: boostedXi }))).includes('galacticos');

    // 2. A roster boost must not break a themed run: the XI you PICKED is what counts.
    const foreign = SQUADS.find((s) => s.code === 'ITA')!.players[0];
    const handedOver = wonCup({ xi: [...xi.slice(1), foreign], boostedIds: [foreign.id] });
    const identityOk =
      completedIn(ctx(handedOver)).includes('samba') &&
      !completedIn(ctx(wonCup({ xi: [...xi.slice(1), foreign] }))).includes('samba');

    // 3. A shootout is not goals conceded: 0-0 on penalties keeps a clean sheet.
    const shootoutRun = wonCup({
      history: [0, 1, 2, 3].map((stage) =>
        koRec(stage, {
          userGoals: 0,
          oppGoals: 0,
          decided: 'pens',
          pens: { kicks: [], home: 4, away: 3, homeWon: true },
        }),
      ),
    });
    const wallOk = completedIn(ctx(shootoutRun)).includes('the-wall');

    check('challenges: ratings are judged on the dataset player, not the boosted copy', () => ratingOk);
    check('challenges: a roster boost cannot break a themed XI (identity ignores it)', () => identityOk);
    check('challenges: a shootout is not a goal conceded (The Wall survives penalties)', () => wallOk);
  }

  // --- Challenges: awarded once, paid into the career, counted to a fixed point --
  {
    const run = playToEnd(playGroupStage(runFor()));
    const input = { base: basePlayer, album: emptyAlbum(), trades: 0 };
    const first = applyRunResult(INITIAL_CAREER, run, input);
    const again = applyRunResult(first.career, run, input);
    const paid = prestigeFor(first.challengesCompleted);

    // A career one short of "complete 10 challenges" must tick it in the SAME run that
    // takes it past ten, not the next one (that is what the fixed-point loop is for).
    const nine = CHALLENGES.filter((c) => !c.blocked && c.id !== 'challenge-hunter')
      .slice(0, 9)
      .map((c) => c.id);
    const primed = applyRunResult(
      { ...INITIAL_CAREER, completedChallenges: nine },
      run,
      input,
    );
    const hunterOk =
      primed.career.completedChallenges.length >= 10 ===
      primed.career.completedChallenges.includes('challenge-hunter');

    const progress = challengeProgress(first.career.completedChallenges);
    const ok =
      first.challengePrestige === paid &&
      first.career.prestige === INITIAL_CAREER.prestige + first.prestigeGained + paid &&
      new Set(first.career.completedChallenges).size === first.career.completedChallenges.length &&
      // Nothing already held is ever completed (or paid for) a second time. Banking the same
      // run twice is not idempotent any more and must not be asserted to be: the career
      // counters see the second call as a second run, so a cup-winning run legitimately
      // completes Back to Back on the way through. What has to hold is that no id is paid
      // twice, and that the wallet only ever moves by what this call itself completed.
      !again.challengesCompleted.some((id) => first.challengesCompleted.includes(id)) &&
      new Set(again.career.completedChallenges).size === again.career.completedChallenges.length &&
      again.challengePrestige === (AWARDS_ON ? prestigeFor(again.challengesCompleted) : 0) &&
      // Nothing blocked is ever claimed, and the counter adds up.
      !first.challengesCompleted.some((id) => challengeById(id)?.blocked) &&
      progress.completed + progress.available + progress.blocked === progress.total &&
      progress.completed === first.career.completedChallenges.length;
    check('challenges: paid once, added to the wallet, and never re-awarded', () => ok);
    check('challenges: a completion counter ticks in the run that reaches it', () => hunterOk);
    check('challenges: applyRunResult with no context completes nothing', () => applyRunResult(INITIAL_CAREER, run).challengesCompleted.length === 0);

    // No entry may be unreachable on a career that has simply played before. The
    // catalogue arrived years of runs after the career counters did, so anything keyed to
    // an exact lifetime count (First Blood was `stats.cups === 1`) is already past it and
    // can never complete. A cup on a career with cups and no completions must take it.
    const veteran = applyRunResult(
      { ...INITIAL_CAREER, stats: { ...INITIAL_CAREER.stats, runs: 40, cups: 12 } },
      { ...run, outcome: 'champion' },
      input,
    );
    check(
      'challenges: a career that has played before is not locked out of First Blood',
      () => veteran.challengesCompleted.includes('first-blood'),
    );
  }

  // --- Challenges: the career counters, over hand-built run sequences ----------
  // The nine streak/lifetime entries cannot be reached by simulating one run, so the
  // sequences are built by hand: what matters is that a counter moves with the run that
  // satisfies it (not the next one), and that a broken streak really breaks.
  {
    const xi = bestEleven(SQUADS.find((s) => s.code === 'BRA')!.players);
    const input = { base: basePlayer, album: emptyAlbum(), trades: 0 };
    const finished = (outcome: RunOutcome, ascension = 0): RunState => ({
      ...beginRun(xi, { ascension: ascension }),
      phase: 'ended',
      outcome,
      score: 100,
    });
    /** Play a list of outcomes into a fresh career; keep every reward for inspection. */
    const sequence = (outcomes: RunOutcome[], ascension = 0) => {
      let career = INITIAL_CAREER;
      const rewards = outcomes.map((o) => {
        const r = applyRunResult(career, finished(o, ascension), input);
        career = r.career;
        return r;
      });
      return { career, rewards };
    };
    const got = (r: { challengesCompleted: string[] }, id: string) => r.challengesCompleted.includes(id);

    const cups = sequence(['champion', 'champion', 'champion']);
    const streakOk =
      cups.career.stats.cupStreak === 3 &&
      !got(cups.rewards[0], 'back-to-back') &&
      got(cups.rewards[1], 'back-to-back') &&
      got(cups.rewards[2], 'three-peat');

    // A group exit between two cups leaves the streak at one, so neither entry lands.
    const broken = sequence(['champion', 'group', 'champion']);
    const brokenOk =
      broken.career.stats.cupStreak === 1 &&
      !broken.rewards.some((r) => got(r, 'back-to-back') || got(r, 'three-peat'));

    // Nearly Man reads the run BEFORE this one, which is why prevOutcome exists.
    const nearly = sequence(['final', 'champion']);
    const nearlyOk =
      got(nearly.rewards[1], 'nearly-man') && !got(sequence(['sf', 'champion']).rewards[1], 'nearly-man');

    // Straight Up: the first cup at a tier is the one that unlocks the next, and a lost
    // final anywhere in the career rules it out for good.
    const straightOk =
      got(sequence(['champion']).rewards[0], 'straight-up') && !got(nearly.rewards[1], 'straight-up');

    // On a Roll counts finals reached, not cups won (the redefinition that stopped it
    // being Three-Peat under another name); Consistency counts semi-finals.
    const finals = sequence(['final', 'final', 'final']);
    const semis = sequence(['sf', 'sf', 'sf', 'sf', 'sf']);
    const streakShapeOk =
      !got(finals.rewards[1], 'on-a-roll') &&
      got(finals.rewards[2], 'on-a-roll') &&
      semis.career.stats.semiStreak === 5 &&
      got(semis.rewards[4], 'consistency') &&
      // A cup is a final reached and a semi reached, so it extends both.
      sequence(['final', 'champion']).career.stats.finalStreak === 2;

    const ten: RunOutcome[] = Array.from({ length: 10 }, () => 'group');
    const hard = sequence(ten, HIGH_ASCENSION);
    const hardOk =
      hard.career.stats.runsAtHighAscension === 10 &&
      got(hard.rewards[9], 'hard-habit') &&
      !got(hard.rewards[8], 'hard-habit') &&
      sequence(ten, HIGH_ASCENSION - 1).career.stats.runsAtHighAscension === 0;

    // Ladder Climb: one cup at every tier of the ladder, in order.
    let ladderCareer = INITIAL_CAREER;
    let ladderLast = applyRunResult(ladderCareer, finished('champion'), input);
    for (const a of ASCENSIONS) {
      ladderLast = applyRunResult(ladderCareer, finished('champion', a.tier), input);
      ladderCareer = ladderLast.career;
    }
    const ladderOk =
      got(ladderLast, 'ladder-climb') &&
      ASCENSIONS.every((a) => (ladderCareer.stats.cupsByAscension[a.tier] ?? 0) > 0);

    // Spendthrift's counter is the shop's, not the run's.
    const rich = { ...INITIAL_CAREER, xp: 20000, level: levelForXp(20000), prestige: 5000 };
    const perkTier = PERKS[0].tiers[0];
    const afterPerk = buyPerkTier(rich, PERKS[0].id);
    const lockable = lockableBoons()[0];
    const afterBoon = unlockBoon(afterPerk, lockable.id);
    const spendOk =
      afterPerk.stats.prestigeSpent === perkTier.cost &&
      afterPerk.prestige === rich.prestige - perkTier.cost &&
      afterBoon.stats.prestigeSpent === perkTier.cost + BOON_UNLOCK_COST[lockable.rarity] &&
      // A refused buy spends nothing, so it must not move the counter either.
      buyPerkTier(INITIAL_CAREER, PERKS[0].id).stats.prestigeSpent === 0;

    // No counter ever goes backwards, whatever the run did.
    let monotone = true;
    let career = INITIAL_CAREER;
    for (const o of ['group', 'r16', 'champion', 'final', 'sf', 'champion', 'champion', 'qf'] as RunOutcome[]) {
      const next = applyRunResult(career, finished(o, 1), input).career;
      const s = career.stats;
      const n = next.stats;
      if (
        n.runs < s.runs ||
        n.cups < s.cups ||
        n.runsAtHighAscension < s.runsAtHighAscension ||
        n.prestigeSpent < s.prestigeSpent ||
        n.cupFormations.length < s.cupFormations.length ||
        n.cupsByAscension.length < s.cupsByAscension.length ||
        (s.everLostFinal && !n.everLostFinal) ||
        next.completedChallenges.length < career.completedChallenges.length
      ) {
        monotone = false;
      }
      career = next;
    }

    check('challenges: cup streaks complete on the run that reaches them', () => streakOk);
    check('challenges: a losing run breaks the cup streak', () => brokenOk);
    check('challenges: Nearly Man reads the run before this one', () => nearlyOk);
    check('challenges: Straight Up needs a first cup at the tier and no lost final', () => straightOk);
    check('challenges: the final / semi-final streaks count runs reached, not cups', () => streakShapeOk);
    check('challenges: Ascension II+ runs and per-tier cups are counted', () => hardOk && ladderOk);
    check('challenges: Prestige spent is counted by the perk shop and boon unlocks', () => spendOk);
    check('challenges: no career counter ever goes backwards', () => monotone);
  }

  // --- Challenges: the kickoff record (shape, build, chemistry) ----------------
  // These read fields the run carries from the build page. All three are optional, so the
  // first thing asserted is that a run saved before they existed still judges cleanly and
  // simply completes none of them.
  {
    const xi = bestEleven(SQUADS.find((s) => s.code === 'BRA')!.players);
    /** A cup-winning run with the kickoff record blanked, then `over` applied. */
    const won = (over: Partial<RunState>): RunState => ({
      ...beginRun(xi),
      phase: 'ended',
      outcome: 'champion',
      score: 140,
      shape: undefined,
      build: undefined,
      chemistry: undefined,
      ...over,
    });
    const ids = (run: RunState) =>
      completedIn({ run, base: basePlayer, career: INITIAL_CAREER, album: emptyAlbum(), trades: 0 });

    /** A shape over a real formation, with every player in his natural position. */
    const shapeFor = (name: string, style: Style): RunShape => {
      const f = getFormation(name, style)!;
      const used = new Set<string>();
      return {
        formation: f.name,
        style: f.style,
        slots: f.slots.map((s) => {
          const p = ALL_PLAYERS.find((q) => primaryPosition(q) === s.position && !used.has(q.id))!;
          used.add(p.id);
          return { slotId: s.id, role: s.position, playerId: p.id };
        }),
      };
    };
    /** The same shape with `n` slots filled by someone whose natural role is different. */
    const misplace = (shape: RunShape, n: number): RunShape => {
      const used = new Set(shape.slots.map((s) => s.playerId));
      let done = 0;
      return {
        ...shape,
        slots: shape.slots.map((s) => {
          if (done >= n) return s;
          const p = ALL_PLAYERS.find((q) => primaryPosition(q) !== s.role && !used.has(q.id))!;
          used.add(p.id);
          done++;
          return { ...s, playerId: p.id };
        }),
      };
    };
    /** A bespoke shape: these players, in these roles, formation name irrelevant. */
    const rawShape = (players: Player[], roles: Position[]): RunShape => ({
      formation: '4-3-3',
      style: 'bal',
      slots: players.map((p, i) => ({ slotId: `s${i}`, role: roles[i], playerId: p.id })),
    });

    const legacy = ids(won({}));
    const legacyOk = !['back-five', 'all-out-attack', 'park-the-bus', 'out-of-position', 'textbook',
      'keepers-union', 'midfield-general', 'chemistry-set', 'thrifty', 'every-cent', 'bargain-hunter',
      'marquee-signing', 'market-master', 'roll-with-it', 'first-draw', 'swap-meet', 'bargain-bin',
    ].some((id) => legacy.includes(id));

    const backFive = ids(won({ shape: shapeFor('5-3-2', 'def') }));
    const flat = ids(won({ shape: shapeFor('4-3-3', 'bal') }));
    const shapeOk =
      backFive.includes('back-five') &&
      !flat.includes('back-five') &&
      backFive.includes('park-the-bus') &&
      !backFive.includes('all-out-attack') &&
      ids(won({ shape: shapeFor('4-3-3', 'off') })).includes('all-out-attack');

    // Natural position is the DATASET row's, never the run's copy: placing a player
    // promotes the slot role onto him, which is what these two compare against.
    const natural = shapeFor('4-3-3', 'bal');
    const positionOk =
      flat.includes('textbook') &&
      !flat.includes('out-of-position') &&
      ids(won({ shape: misplace(natural, 3) })).includes('out-of-position') &&
      !ids(won({ shape: misplace(natural, 3) })).includes('textbook') &&
      !ids(won({ shape: misplace(natural, 2) })).includes('out-of-position');

    // The keeper and the best player: built from real ratings, so the comparison is real.
    const OUTFIELD: Position[] = ['LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'];
    const keepers = ALL_PLAYERS.filter((p) => primaryPosition(p) === 'GK');
    const topGk = [...keepers].sort((a, b) => b.elo - a.elo)[0];
    const worstGk = [...keepers].sort((a, b) => a.elo - b.elo)[0];
    const weaker = ALL_PLAYERS.filter((p) => p.elo < topGk.elo && primaryPosition(p) !== 'GK').slice(0, 10);
    const keeperOk =
      ids(won({ shape: rawShape([topGk, ...weaker], ['GK', ...OUTFIELD]) })).includes('keepers-union') &&
      !ids(won({ shape: rawShape([worstGk, ...weaker], ['GK', ...OUTFIELD]) })).includes('keepers-union');

    const best = [...ALL_PLAYERS].sort((a, b) => b.elo - a.elo)[0];
    const rest = ALL_PLAYERS.filter((p) => p.elo < best.elo && p.id !== topGk.id).slice(0, 9);
    const inMid = rawShape([best, topGk, ...rest], ['CM', 'GK', ...OUTFIELD.slice(0, 9)]);
    const upFront = rawShape([best, topGk, ...rest], ['ST', 'GK', ...OUTFIELD.slice(0, 9)]);
    const generalOk =
      ids(won({ shape: inMid })).includes('midfield-general') &&
      !ids(won({ shape: upFront })).includes('midfield-general');

    // The build record. Prices are the discounted ones actually charged at kickoff.
    // `Partial<BudgetBuild>` rather than `Partial<RunBuild>`: the union means a partial of it
    // could widen `method`, which would make the literal describe neither variant.
    const buy = (over: Partial<Omit<BudgetBuild, 'method'>> = {}): BudgetBuild => ({
      method: 'budget', budget: 110, spent: 110, dearest: 20, discounted: 0, swapsUsed: 0, ...over,
    });
    const marketOk =
      ids(won({ build: buy({ spent: 90 }) })).includes('thrifty') &&
      !ids(won({ build: buy({ spent: 91 }) })).includes('thrifty') &&
      ids(won({ build: buy({}) })).includes('every-cent') &&
      !ids(won({ build: buy({ spent: 109 }) })).includes('every-cent') &&
      ids(won({ build: buy({ dearest: 12 }) })).includes('bargain-hunter') &&
      !ids(won({ build: buy({ dearest: 13 }) })).includes('bargain-hunter') &&
      ids(won({ build: buy({ dearest: 25 }) })).includes('marquee-signing') &&
      ids(won({ build: buy({ discounted: 5 }) })).includes('bargain-bin') &&
      !ids(won({ build: buy({ discounted: 4 }) })).includes('bargain-bin') &&
      ids(won({ build: buy({}), ascension: HIGH_ASCENSION })).includes('market-master') &&
      !ids(won({ build: buy({}), ascension: HIGH_ASCENSION - 1 })).includes('market-master');

    const rolled: RunBuild = { method: 'roll', rerollsUsed: 0, swapsUsed: 0 };
    const rollOk =
      ids(won({ build: rolled })).includes('roll-with-it') &&
      ids(won({ build: rolled })).includes('first-draw') &&
      !ids(won({ build: { ...rolled, rerollsUsed: 1 } })).includes('first-draw') &&
      // A bought XI is not a rolled one, and neither claims the other entries.
      !ids(won({ build: buy({}) })).includes('roll-with-it') &&
      !ids(won({ build: rolled })).includes('every-cent');

    // Swap Meet is "both swaps", so it has to track the reducer allowance.
    const swapOk =
      ids(won({ build: { ...rolled, swapsUsed: INITIAL_SWAPS } })).includes('swap-meet') &&
      !ids(won({ build: { ...rolled, swapsUsed: INITIAL_SWAPS - 1 } })).includes('swap-meet');

    const chemOk =
      ids(won({ chemistry: MAX_BONUS })).includes('chemistry-set') &&
      !ids(won({ chemistry: MAX_BONUS - 1 })).includes('chemistry-set') &&
      // Kickoff chemistry is recorded by beginRun, not recomputed at the end.
      beginRun(xi).chemistry === chemistryOf(xi);

    check('challenges: a run saved before the kickoff record completes none of it', () => legacyOk);
    check('challenges: the formation and style are judged from the kickoff shape', () => shapeOk);
    check('challenges: natural position comes from the dataset row, not the placed copy', () => positionOk);
    check('challenges: the keeper and the best player are judged by the slot they filled', () => keeperOk && generalOk);
    check('challenges: the budget figures are judged at the prices actually charged', () => marketOk);
    check('challenges: a rolled build and a bought build never claim each other', () => rollOk);
    check('challenges: Swap Meet tracks the reducer swap allowance', () => swapOk);
    check('challenges: chemistry is judged at kickoff', () => chemOk);
  }

}
