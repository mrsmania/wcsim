// Characterization checks for the cards on levers that are not the rating averages.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, groupRec, koRec, runFor, xiFor } from './harness';
import { ALL_PLAYERS, SQUADS } from '../../src/data/squads';
import { boonById } from '../../src/domain/boons';
import { INITIAL_CAREER, applyRunResult } from '../../src/domain/career';
import { xiOf } from '../../src/domain/effects';
import {
  type RunOutcome,
  type RunState,
  beginRun,
  chooseBoon,
  playGroupStage,
  playKnockoutRound,
  resolveChoice,
} from '../../src/domain/run';
import { bestEleven, userGroupTeam } from '../../src/domain/tournament';

export function cardsChecks(): void {
  // --- The item 29 cards: the levers that are not the rating averages -----------
  // Each of these is a claim the balance table above cannot check, because the table only
  // measures attack and defence. These are those claims.

  // The shootout-only lever: `userGroupTeam` takes its penalty bonus as arguments SEPARATE
  // from the chemistry and difficulty deltas, precisely so it cannot reach `strength` and
  // move a scoreline. Ice Veins was the card built on it and was deleted 2026-08-23; the
  // seam is deliberately kept (a shootout card or perk is the obvious next user - see
  // `docs/perk-ideas.md`), so it is asserted on its own rather than through a card. Without
  // this the whole lever would be untested the moment its only caller went.
  {
    const xi = xiFor();
    const plain = userGroupTeam(xi, 0, 0);
    const iced = userGroupTeam(xi, 0, 0, 8, 5);
    let ok =
      JSON.stringify(plain.strength) === JSON.stringify(iced.strength) &&
      JSON.stringify(plain.scorers) === JSON.stringify(iced.scorers);
    // The top five takers are lifted by exactly 8, and nobody else is touched.
    for (let i = 0; i < plain.penTakers.length; i++) {
      const want = plain.penTakers[i].elo + (i < 5 ? 8 : 0);
      if (iced.penTakers[i].elo !== want) ok = false;
    }
    check('run: a penalty bonus lifts the shootout and leaves strength and scorers alone', () => ok);
  }

  // Kind Draw keeps the weaker of two opponents, and - the part that could silently rot -
  // leaves the run and the TREE agreeing on who is next. They are read by different code
  // paths (`run.nextOpponent` by the tie, `bracket` by everything drawn on screen and by
  // the splice `advanceBracket` does by id), so a card that moved one and not the other
  // would play a team the tree does not show.
  {
    let ok = true, redrawn = 0, seen = 0;
    for (let i = 0; i < 60; i++) {
      let run = playGroupStage(runFor(i));
      let guard = 0;
      while (run.phase !== 'ended' && guard++ < 12) {
        if (run.phase === 'boon') {
          if (run.bracket && run.nextOpponent) {
            seen++;
            const before = run.nextOpponent;
            const after = chooseBoon(run, 'kind-draw').next;
            const opp = after.nextOpponent!;
            // Never worse off: the card keeps the weaker, so the opponent can only soften.
            if (opp.strength.overall > before.strength.overall) ok = false;
            if (opp.id !== before.id) redrawn++;
            // The tree names the same team the run does.
            const game = after.bracket!.rounds[after.koRound]?.[0];
            if (!game || game.awayId !== opp.id) ok = false;
            if (!after.bracket!.teams[opp.id]) ok = false;
            // And the tree is otherwise untouched: same rounds, same games, same count.
            if (after.bracket!.rounds.length !== run.bracket.rounds.length) ok = false;
            if (after.bracket!.rounds[after.koRound].length !== run.bracket.rounds[after.koRound].length) ok = false;
          }
          run = chooseBoon(run, (run.offer ?? [])[0]?.id ?? '').next;
        } else if (run.phase === 'match') run = playKnockoutRound(run);
        else break;
      }
    }
    // Sampled, so it has to have sampled something: with no tie observed every assertion above
    // is skipped and this reads as a pass. The count is in the check NAME, and names only print
    // on failure, so a run that quietly stopped reaching knockout stops would look identical to
    // a healthy one.
    if (!seen) ok = false;
    check(`kind-draw: never a stronger opponent, and the tree agrees (${redrawn}/${seen} redrawn)`, () => ok);
  }

  // Prime Years walks `personId` to each player's best tournament. Two things matter beyond
  // "the XI got better": the slot each player fills has to survive (or the formation and the
  // chemistry "in position" count are wrong), and EVERY upgraded player has to land in
  // `boostedIds` - a card that swaps eleven and records one would let ten handed players bank
  // stickers they did not draft, which is the exact hole boostedIds exists to close.
  // The sample squad is named, not indexed, and the arrival count is asserted. Both are
  // load-bearing: this check ran on SQUADS[0] and 66 of the 296 squads have no player whose
  // best tournament is a different one, so `arrived` came out empty and the tagging loop below
  // iterated ZERO times. It was vacuous for as long as SQUADS[0] happened to be such a squad -
  // proved by reintroducing the one-arrival bug, which the whole suite then failed to notice.
  // Adding 1986 moved Argentina into slot 0 and made it vacuous again, so an index is not a
  // fixture here; bra-1990 upgrades 6 of its 11 and is referred to by id.
  {
    const sample = SQUADS.find((s) => s.id === 'bra-1990')!;
    const xi = bestEleven(sample.players);
    const run = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    const after = chooseBoon(run, 'prime-years').next;
    let ok = after.roster!.length === 11;
    // Never worse, and the same people throughout.
    for (let i = 0; i < 11; i++) {
      if (after.roster![i].elo < run.roster![i].elo) ok = false;
      if (after.roster![i].personId !== run.roster![i].personId) ok = false;
      // The slot's role is preserved, so a swapped-in version plays where the old one did.
      if (after.roster![i].positions[0] !== run.roster![i].positions[0]) ok = false;
    }
    // No duplicate person, which is the invariant every roster card must keep.
    if (new Set(after.roster!.map((p) => p.personId)).size !== 11) ok = false;
    // Every arrival is tagged, not just the first.
    const arrived = after.roster!.filter((p, i) => p.id !== run.roster![i].id).map((p) => p.id);
    // No arrivals means the loop below proves nothing. Assert the sample actually exercises
    // the card, or a dataset change silently turns this back into a green tick over nothing.
    if (!arrived.length) ok = false;
    for (const id of arrived) if (!after.boostedIds.includes(id)) ok = false;
    check(`prime-years: same people, best versions, slots kept, all ${arrived.length} tagged`, () => ok);
  }

  // In Form names whoever the RUN chose, and does nothing before a goal is scored.
  {
    const xi = xiFor();
    const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    // No goals yet: the card is a legal no-op rather than a throw or a random pick.
    const cold = chooseBoon(base, 'in-form').next;
    let ok = (cold.effects ?? []).filter((e) => e.source === 'in-form').length === 0;
    // With goals, it lands on the leader and nobody else.
    const scorer = xi[5];
    const withGoals = { ...base, tally: { apps: {}, goals: { [scorer.id]: 3, [xi[2].id]: 1 } } };
    const hot = chooseBoon(withGoals, 'in-form').next;
    const eff = (hot.effects ?? []).filter((e) => e.source === 'in-form');
    if (eff.length !== 1 || eff[0].delta !== 12) ok = false;
    if (eff[0].target.ids.join(',') !== scorer.id) ok = false;
    check('in-form: no-op before a goal, then exactly the leading scorer', () => ok);
  }

  // Old Guard reaches into the CAREER, and must do nothing on a career that has never scored.
  {
    const xi = xiFor(1);
    const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    let ok = chooseBoon(base, 'old-guard').next.roster!.every((p, i) => p.id === base.roster![i].id);
    // With a top scorer, he joins - once, without duplicating a person already there.
    const legend = ALL_PLAYERS.find((p) => p.elo >= 93 && !xi.some((x) => x.personId === p.personId))!;
    const withCareer = { ...base, careerTopScorerId: legend.id };
    const after = chooseBoon(withCareer, 'old-guard').next;
    if (!after.roster!.some((p) => p.personId === legend.personId)) ok = false;
    if (new Set(after.roster!.map((p) => p.personId)).size !== 11) ok = false;
    if (!after.boostedIds.includes(after.roster!.find((p) => p.personId === legend.personId)!.id)) ok = false;
    // Already in the XI: no-op rather than a duplicate.
    const dupe = { ...base, careerTopScorerId: xi[0].id };
    if (chooseBoon(dupe, 'old-guard').next.roster!.length !== 11) ok = false;
    check('old-guard: nothing on a fresh career, one arrival on an old one, never a duplicate', () => ok);
  }

  // The Armband is the first card that asks a question, so picking it must NOT commit the
  // stop. It parks on the run - which is what makes a reload land back on the question rather
  // than lose the card - and only the answer moves the run on.
  {
    const xi = xiFor();
    const run = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    const parked = chooseBoon(run, 'armband').next;
    let ok =
      parked.pendingChoice?.boonId === 'armband' &&
      parked.phase === 'boon' &&
      // Nothing applied yet.
      (parked.effects ?? []).filter((e) => e.source === 'armband').length === 0;
    // A player not in the XI is refused rather than half-applied.
    if (resolveChoice(parked, 'not-a-player').next.pendingChoice === undefined) ok = false;
    // The answer commits: +6 to the captain, +1 to the other ten, and the stop is left.
    const captain = xi[7];
    const done = resolveChoice(parked, captain.id).next;
    const eff = (done.effects ?? []).filter((e) => e.source === 'armband');
    if (done.phase !== 'match' || done.pendingChoice !== undefined) ok = false;
    if (eff.length !== 2) ok = false;
    else {
      const big = eff.find((e) => e.delta === 6);
      const rest = eff.find((e) => e.delta === 1);
      if (!big || !rest) ok = false;
      else if (big.target.ids.join(',') !== captain.id) ok = false;
      else if (rest.target.ids.length !== 10 || rest.target.ids.includes(captain.id)) ok = false;
    }
    check('armband: parks the stop, refuses a stranger, then +6 the captain and +1 the rest', () => ok);
  }

  // Away Days and Man-Marking weaken the OPPONENT, and the pair has to stay a pair: one
  // touches their defence and one their attack, neither touches the user, and the tree shows
  // the same numbers the tie will be played on.
  {
    let ok = true, seen = 0;
    for (let i = 0; i < 40 && seen < 20; i++) {
      let run = playGroupStage(runFor(i));
      let guard = 0;
      while (run.phase !== 'ended' && guard++ < 12) {
        if (run.phase === 'boon' && run.nextOpponent && run.bracket) {
          seen++;
          const before = run.nextOpponent.strength;
          const beforeXi = run.xi.map((p) => p.elo).join(',');
          for (const [id, dAtk, dDef] of [
            ['away-days', 0, -5],
            ['man-marking', -5, 0],
          ] as const) {
            const after = chooseBoon(run, id).next;
            const st = after.nextOpponent!.strength;
            if (st.attack !== before.attack + dAtk) ok = false;
            if (st.defense !== before.defense + dDef) ok = false;
            // Overall moves by the share of the XI actually touched, never by the raw delta
            // and never not at all.
            if (st.overall >= before.overall) ok = false;
            if (st.overall < before.overall - 5) ok = false;
            // The user is untouched: this is a card about them, not about you.
            if (after.xi.map((p) => p.elo).join(',') !== beforeXi) ok = false;
            // And what the tree shows is what the tie will be played on.
            const shown = after.bracket!.teams[after.nextOpponent!.id];
            if (!shown || shown.strength.attack !== st.attack || shown.strength.defense !== st.defense) ok = false;
          }
          run = chooseBoon(run, (run.offer ?? [])[0]?.id ?? '').next;
        } else if (run.phase === 'match') run = playKnockoutRound(run);
        else if (run.phase === 'boon') run = chooseBoon(run, (run.offer ?? [])[0]?.id ?? '').next;
        else break;
      }
    }
    // Same reasoning as kind-draw above: no tie observed means nothing was asserted.
    if (!seen) ok = false;
    check(`away-days / man-marking: weaken one of their lines, none of yours (${seen} ties)`, () => ok);
  }

  // --- item 30, round 4 ---------------------------------------------------------
  // (Full-Backs was the third card of this round and was deleted 2026-08-23: every 3-4-3
  // and 3-5-2 plays three centre-backs and wide midfielders, so it did nothing at all in 6
  // of the 24 formations - a dead slot in every offer, for a paid rare.)

  // Loan Deal is the first TEMPORARY roster change in the game, so the two halves that could
  // each break silently are asserted together: he arrives (and is tagged, so a borrowed
  // player banks no sticker), and he GOES BACK when the round advances, with the player he
  // displaced restored to his own slot. Plus the guard the card exists to carry: their best
  // is not always an upgrade, and swapping backwards for a round is worse than doing nothing.
  {
    let ok = true, borrowed = 0, declined = 0, returned = 0;
    for (let i = 0; i < 40 && borrowed < 12; i++) {
      let run = playGroupStage(runFor(i));
      let guard = 0;
      while (run.phase !== 'ended' && guard++ < 12) {
        if (run.phase === 'boon' && run.nextOpponent) {
          const before = run.roster!;
          const after = chooseBoon(run, 'loan-deal').next;
          const inP = after.roster!.find((p, j) => p.id !== before[j].id);
          if (!inP) {
            // Declined: nothing moved, and nothing was recorded to undo.
            declined++;
            if (after.loan !== undefined) ok = false;
            if (after.roster!.some((p, j) => p.id !== before[j].id)) ok = false;
          } else {
            borrowed++;
            const slot = before.findIndex((p) => p.id !== after.roster![before.indexOf(p)]?.id);
            const out = before[slot];
            // A real upgrade, in the outgoing player's own slot, and tagged as handed over.
            if (inP.elo <= out.elo) ok = false;
            if (inP.positions[0] !== out.positions[0]) ok = false;
            if (!after.boostedIds.includes(inP.id)) ok = false;
            if (new Set(after.roster!.map((p) => p.personId)).size !== 11) ok = false;
            if (after.loan?.borrowedId !== inP.id || after.loan?.returning.id !== out.id) ok = false;
            if (after.loan?.untilRound !== after.koRound) ok = false;
            // He plays the tie, and then he goes home.
            const played = playKnockoutRound(after);
            if (played.phase !== 'ended') {
              returned++;
              if (played.loan !== undefined) ok = false;
              if (played.roster!.some((p) => p.id === inP.id)) ok = false;
              if (!played.roster!.some((p) => p.id === out.id)) ok = false;
              // Restored to the same slot, so the formation is the one it was.
              if (played.roster!.map((p) => p.positions[0]).join(',') !== before.map((p) => p.positions[0]).join(',')) ok = false;
              // And the derived XI agrees with the roster it was recomputed from.
              if (!played.xi.some((p) => p.id === out.id)) ok = false;
            }
          }
          run = chooseBoon(run, (run.offer ?? [])[0]?.id ?? '').next;
        } else if (run.phase === 'match') run = playKnockoutRound(run);
        else break;
      }
    }
    if (!borrowed || !returned) ok = false;
    check(`loan-deal: borrowed ${borrowed}, declined ${declined}, all ${returned} handed back on time`, () => ok);
  }

  // Underdog's Purse reads the RUN's history, which nothing else does. Two things: the group
  // is excluded for free (a group record carries no ratings), and the count is the number of
  // ties the DRAW made you the weaker side in, never the number of rounds played.
  {
    const xi = xiFor();
    const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    // Nothing yet: a legal no-op, like In Form before a goal.
    let ok = (chooseBoon(base, 'underdogs-purse').next.effects ?? []).filter((e) => e.source === 'underdogs-purse').length === 0;
    // A group record on its own is still nothing, ratings being what it does not carry.
    const grouped = { ...base, history: [groupRec({ groupPos: 2 })] };
    if ((chooseBoon(grouped, 'underdogs-purse').next.effects ?? []).some((e) => e.source === 'underdogs-purse')) ok = false;
    // Two ties as the underdog and one as the favourite pays for the two.
    const hist = [
      groupRec(),
      koRec(0, { userRating: 78, oppRating: 84 }),
      koRec(1, { userRating: 79, oppRating: 71 }),
      koRec(2, { userRating: 80, oppRating: 88 }),
    ];
    const eff = (chooseBoon({ ...base, history: hist }, 'underdogs-purse').next.effects ?? [])
      .filter((e) => e.source === 'underdogs-purse');
    if (eff.length !== 1 || eff[0].delta !== 4 || eff[0].target.ids.length !== 11) ok = false;
    check("underdogs-purse: nothing without an upset, then +2 for each one (never for the group)", () => ok);
  }

  // Siege Mentality counts goals conceded across BOTH stages - a knockout record's
  // `oppGoals` and a group record's three matchday scorelines - and must never count a
  // shootout, which is excluded by construction (kicks live in `pens`, never in a score).
  {
    const xi = xiFor();
    const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    // Nothing conceded is a legal no-op, not a zero-delta entry.
    let ok = (chooseBoon(base, 'siege-mentality').next.effects ?? []).every((e) => e.source !== 'siege-mentality');
    const hist = [
      // Two conceded in the group...
      groupRec({
        groupPos: 2,
        groupResults: [
          { code: 'BRA', name: 'Brazil', us: 1, them: 0 },
          { code: 'ITA', name: 'Italy', us: 2, them: 2 },
          { code: 'GER', name: 'Germany', us: 0, them: 0 },
        ],
      }),
      // ...one in a tie won on the night...
      koRec(0, { userGoals: 2, oppGoals: 1 }),
      // ...and one in a tie that went to penalties, where the kicks are not goals.
      koRec(1, {
        userGoals: 1,
        oppGoals: 1,
        decided: 'pens',
        pens: { kicks: [], home: 4, away: 3, homeWon: true },
      }),
    ];
    const eff = (chooseBoon({ ...base, history: hist }, 'siege-mentality').next.effects ?? [])
      .filter((e) => e.source === 'siege-mentality');
    if (eff.length !== 1 || eff[0].delta !== 4 || eff[0].target.ids.length !== 11) ok = false;
    check('siege-mentality: +1 a goal across both stages, and a shootout is not goals', () => ok);
  }

  // --- item 30, round 6: the three cards whose cost lands on the CAREER ---------

  // Sponsorship doubles the XP and leaves the wallet alone; Youth Development empties the
  // wallet and leaves the XP alone. Opposite halves of the same payout, so they are asserted
  // against each other and against a plain run.
  {
    const base = xiFor();
    const plain: RunState = { ...beginRun(base), phase: 'ended', outcome: 'sf', score: 60 };
    const p = applyRunResult(INITIAL_CAREER, plain);
    const spo = applyRunResult(INITIAL_CAREER, { ...plain, xpMult: 2 });
    const yth = applyRunResult(INITIAL_CAREER, { ...plain, youth: true });
    let ok =
      p.xpGained > 0 && p.prestigeGained > 0 &&
      spo.xpGained === p.xpGained * 2 && spo.prestigeGained === p.prestigeGained &&
      yth.xpGained === p.xpGained && yth.prestigeGained === 0;
    // Youth banks the boost it bought, exactly one, on `stats` where a signed-in save keeps it.
    if ((yth.career.stats.bonusStartBoosts ?? 0) !== 1) ok = false;
    if ((p.career.stats.bonusStartBoosts ?? 0) !== 0) ok = false;
    // And a grant, once spent, is dealt as a starter boost at kickoff.
    const owed = beginRun(base, { kickoff: { bonusStartBoosts: 2 } });
    if (owed.activeBoons.length !== 2) ok = false;
    // Commons only, for the reason Scout Network's are: a free legendary before kick-off
    // outweighs every choice the run itself offers.
    for (const id of owed.activeBoons) if (boonById(id)?.rarity !== 'common') ok = false;
    check('sponsorship / youth-development: opposite halves of the payout, and the boost is banked', () => ok);
  }

  // All or Nothing is Mortgage the Future with the failure narrowed to one round: every exit
  // but the FINAL pays what it would have, a cup pays triple, and a lost final pays nothing
  // at all - not even the floor of 1 Prestige.
  {
    const base = xiFor();
    const at = (outcome: RunOutcome, score: number, extra: Partial<RunState> = {}): RunState =>
      ({ ...beginRun(base), phase: 'ended', outcome, score, ...extra });
    const plainSf = applyRunResult(INITIAL_CAREER, at('sf', 60));
    const aonSf = applyRunResult(INITIAL_CAREER, at('sf', 60, { allOrNothing: true }));
    const plainCup = applyRunResult(INITIAL_CAREER, at('champion', 100));
    const aonCup = applyRunResult(INITIAL_CAREER, at('champion', 100, { allOrNothing: true }));
    const aonFinal = applyRunResult(INITIAL_CAREER, at('final', 80, { allOrNothing: true }));
    const plainFinal = applyRunResult(INITIAL_CAREER, at('final', 80));
    let ok =
      // Untouched anywhere but the final and the cup.
      aonSf.xpGained === plainSf.xpGained && aonSf.prestigeGained === plainSf.prestigeGained &&
      // Tripled on the cup - the Prestige as well as the XP. The scores here are multiples
      // of 5 so that tripling is exact on both sides of `round(earned / 5)`; on a score of
      // 37 a tripled run pays 22 against 3 x 7 = 21 and this would be a rounding assertion.
      aonCup.xpGained === plainCup.xpGained * 3 &&
      aonCup.prestigeGained === plainCup.prestigeGained * 3 &&
      // Nothing at all on a lost final, where a plain run would still have paid.
      aonFinal.xpGained === 0 && aonFinal.prestigeGained === 0 &&
      plainFinal.prestigeGained > 0;
    // Two bets both have to come in: Mortgage on a lost final still pays nothing.
    const both = applyRunResult(INITIAL_CAREER, at('final', 80, { allOrNothing: true, mortgaged: true }));
    if (both.xpGained !== 0 || both.prestigeGained !== 0) ok = false;
    // And the payout cards COMPOSE with Sponsorship, which multiplies whatever is left:
    // tripled and then doubled on a cup, still nothing on a lost final.
    const aonCupSpo = applyRunResult(INITIAL_CAREER, at('champion', 100, { allOrNothing: true, xpMult: 2 }));
    const aonFinalSpo = applyRunResult(INITIAL_CAREER, at('final', 80, { allOrNothing: true, xpMult: 2 }));
    if (aonCupSpo.xpGained !== plainCup.xpGained * 3 * 2) ok = false;
    if (aonFinalSpo.xpGained !== 0) ok = false;
    check('all-or-nothing: normal but for the last game, tripled on the cup, zero on a lost final', () => ok);
  }

  // Double Print sets the cup-pick count and nothing else. The banking side of it lives in
  // the album hook, which is React and so out of this harness's reach; what is asserted here
  // is that the run carries the number for it to read.
  {
    const run = { ...runFor(), phase: 'boon' as const, offer: [] };
    const after = chooseBoon(run, 'double-print').next;
    const ok =
      after.cupPicks === 2 &&
      (run.cupPicks ?? 1) === 1 &&
      // It is a run lever, so it must leave the XI exactly alone.
      after.xi.map((p) => p.elo).join(',') === run.xi.map((p) => p.elo).join(',');
    check('double-print: two cup picks, and no rating touched', () => ok);
  }

  // Mortgage the Future: nothing at all unless the cup is won - not even the floor of 1
  // Prestige every other run gets, which is what makes the card bite.
  {
    const career = INITIAL_CAREER;
    const base = xiFor();
    const lost: RunState = { ...beginRun(base), phase: 'ended', outcome: 'sf', score: 60, mortgaged: true };
    const won: RunState = { ...beginRun(base), phase: 'ended', outcome: 'champion', score: 100, mortgaged: true };
    const lostPlain: RunState = { ...lost, mortgaged: undefined };
    const wonPlain: RunState = { ...won, mortgaged: undefined };
    const a = applyRunResult(career, lost);
    const b = applyRunResult(career, won);
    const c = applyRunResult(career, lostPlain);
    const d = applyRunResult(career, wonPlain);
    const ok =
      a.xpGained === 0 && a.prestigeGained === 0 &&
      // A won run pays the FULL reward, not merely a positive one: the card's cost is the
      // risk it took, and it must not quietly shave the run that came in.
      b.xpGained === d.xpGained && b.prestigeGained === d.prestigeGained && b.xpGained > 0 &&
      c.prestigeGained > 0; // the same run unmortgaged still pays
    // The floor itself, which this check has always claimed in its name and never asserted:
    // the scores above are large enough that `round(earned / 5)` clears 1 on its own, so
    // deleting the `Math.max(1, ...)` passed. A score of 1 is where the floor is the only
    // thing paying, and where Mortgage taking it away is visible.
    const tinyPlain = applyRunResult(career, { ...lostPlain, score: 1 });
    const tinyMortgaged = applyRunResult(career, { ...lost, score: 1 });
    check(
      'mortgage-future: pays nothing unless the cup is won, floor included',
      () => ok && tinyPlain.prestigeGained === 1 && tinyMortgaged.prestigeGained === 0,
    );
  }

  // Second Wind and Sold Out Stadium are the first cards with a lifetime. The window is the
  // price, so a window that does not close (or a debt that never lands) is the card broken.
  {
    const xi = xiFor();
    const run = { ...beginRun(xi), phase: 'boon' as const, offer: [], koRound: 1 };
    const sw = chooseBoon(run, 'second-wind').next;
    const swEff = (sw.effects ?? []).filter((e) => e.source === 'second-wind');
    let ok = swEff.length === 1 && swEff[0].expiresAfter === 1 && swEff[0].appliesFrom === undefined;
    // Live this round, gone the next.
    const now = xiOf(sw.roster!, sw.effects!, 1).reduce((t, p) => t + p.elo, 0);
    const later = xiOf(sw.roster!, sw.effects!, 2).reduce((t, p) => t + p.elo, 0);
    const base = xi.reduce((t, p) => t + p.elo, 0);
    if (!(now > base && later === base)) ok = false;

    const so = chooseBoon(run, 'sold-out-stadium').next;
    const soEff = (so.effects ?? []).filter((e) => e.source === 'sold-out-stadium');
    // A bonus that ends with this round, and a debt that starts with the next and ends there.
    const bonus = soEff.find((e) => e.delta > 0);
    const debt = soEff.find((e) => e.delta < 0);
    if (!bonus || !debt) ok = false;
    else if (bonus.expiresAfter !== 1 || debt.appliesFrom !== 2 || debt.expiresAfter !== 2) ok = false;
    const t1 = xiOf(so.roster!, so.effects!, 1).reduce((t, p) => t + p.elo, 0);
    const t2 = xiOf(so.roster!, so.effects!, 2).reduce((t, p) => t + p.elo, 0);
    const t3 = xiOf(so.roster!, so.effects!, 3).reduce((t, p) => t + p.elo, 0);
    if (!(t1 > base && t2 < base && t3 === base)) ok = false;
    check('second-wind / sold-out-stadium: the window opens, closes, and the debt lands', () => ok);
  }

  // The Coin Toss is DERIVED, not rolled: picking it twice from the same run gives the same
  // face. Rolled at pick time it would be reload-scummable, which for a +8/-4 swing is the
  // whole card broken.
  {
    let ok = true;
    let heads = 0, total = 0;
    for (let i = 0; i < 40; i++) {
      const xi = xiFor(i);
      const run = { ...beginRun(xi), phase: 'boon' as const, offer: [], koRound: 1 };
      const a = chooseBoon(run, 'coin-toss').next;
      const b = chooseBoon(run, 'coin-toss').next;
      const da = (a.effects ?? []).find((e) => e.source === 'coin-toss')?.delta;
      const db = (b.effects ?? []).find((e) => e.source === 'coin-toss')?.delta;
      if (da !== db) ok = false;
      if (da === 8) heads++;
      total++;
    }
    // Both faces have to actually turn up, or it is a constant with extra steps.
    if (heads === 0 || heads === total) ok = false;
    check(`coin-toss: stable across replays, and both faces occur (${heads}/${total} heads)`, () => ok);
  }

}
