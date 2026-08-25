// Characterization checks for the career: rewards, perks, budgets and Ascension.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, groupRec, koRec, playToEnd, runFor } from './harness';
import { BUDGET_BY_TIER, INITIAL_REROLLS } from '../../src/config';
import { SQUADS } from '../../src/data/squads';
import {
  ASCENSIONS,
  ascensionAt,
  maxSelectableAscension,
  selectedAscension,
} from '../../src/domain/ascension';
import { BOONS, type Boon, type RunModifier, boonById } from '../../src/domain/boons';
import {
  type CareerState,
  INITIAL_CAREER,
  PERKS,
  applyRunResult,
  boonUnlockState,
  budgetOf,
  buyPerkTier,
  extraRerollsOf,
  levelForXp,
  perkLevelOf,
  perkPurchaseState,
  rememberAscension,
  startRunCareer,
  unlockBoon,
} from '../../src/domain/career';
import { PRICE_BASE, priceFor, priceOf, xiSpend } from '../../src/domain/pricing';
import {
  BASE_OFFER_SIZE,
  type RunOutcome,
  type RunState,
  isRoundRecord,
  playGroupStage,
} from '../../src/domain/run';
import { bestEleven } from '../../src/domain/tournament';

export function careerChecks(): void {
  // --- Perk tracks: every one of the six is well-formed ------------------------
  // The "each tier costs more and gates no lower" loop was written out for TWO tracks and
  // the other four were never checked at all (hygiene H96). One loop over `PERKS` is fewer
  // lines and three times the coverage - the point being that it might surface a real
  // violation in a track nobody was looking at.
  {
    const wrong: string[] = [];
    for (const track of PERKS) {
      if (!track.tiers.length) wrong.push(`${track.id} has no tiers`);
      for (let i = 0; i < track.tiers.length; i++) {
        const t = track.tiers[i]!;
        if (t.cost <= 0) wrong.push(`${track.id} tier ${i + 1} costs ${t.cost}`);
        if (t.levelReq < 1) wrong.push(`${track.id} tier ${i + 1} gates at level ${t.levelReq}`);
        if (!t.description.trim()) wrong.push(`${track.id} tier ${i + 1} has no description`);
        if (i === 0) continue;
        const prev = track.tiers[i - 1]!;
        // A bigger ask than the last, in both currencies: Prestige strictly up, the level
        // gate never down.
        if (t.cost <= prev.cost) {
          wrong.push(`${track.id} tier ${i + 1} costs ${t.cost}, tier ${i} costs ${prev.cost}`);
        }
        if (t.levelReq < prev.levelReq) {
          wrong.push(
            `${track.id} tier ${i + 1} gates at ${t.levelReq}, tier ${i} at ${prev.levelReq}`,
          );
        }
      }
    }
    check(
      `career: all ${PERKS.length} perk tracks are well-formed (${PERKS.reduce((n, p) => n + p.tiers.length, 0)} tiers)`,
      () => wrong.length === 0,
      () => wrong.join('; '),
    );
  }

  // --- Career: run rewards + perk purchases account correctly -----------------
  // The four PAYOUT cards rewrite what a run pays, so a check asserting the PLAIN payout
  // has to keep them out of the boosts its run takes. Blind `offer[0]` is what made this
  // one fail about one run in four (roadmap 31): Sponsorship doubles the XP and is a free
  // common starter, so it is in every fresh career's pool, while the assertion below says
  // the XP is the run's own score. Each of the four has its own check up under "item 30,
  // round 6" - this one is about the PLAIN payout, which is why it has to exclude them.
  const PAYOUT_MODS: RunModifier['what'][] = ['mortgage', 'xpMult', 'youth', 'allOrNothing'];
  const paysDifferently = (b: Boon) =>
    b.effects.some((e) => e.kind === 'run' && PAYOUT_MODS.includes(e.mod.what));

  /** A run played to the end taking only boosts that leave the payout rules alone, so what
   *  it pays is the plain reward. Prefers a card from the real offer and falls back to a
   *  known-plain starter, which cannot go wrong even if every card offered pays
   *  differently (asserted below, so the fallback cannot rot into a payout card either). */
  const PIN_BOON = 'veteran-core';
  const plainRun = (() => {
    let run = playGroupStage(runFor());
    // A payout card would change the very figures this run exists to measure, so every
    // stop takes a plain one.
    return playToEnd(run, (offer) => offer.find((b) => !paysDifferently(b)) ?? boonById(PIN_BOON)!);
  })();

  {
    const res = applyRunResult(INITIAL_CAREER, plainRun);
    const ok =
      res.career.stats.runs === INITIAL_CAREER.stats.runs + 1 &&
      res.xpGained === plainRun.score &&
      res.career.xp === INITIAL_CAREER.xp + plainRun.score &&
      res.prestigeGained >= 1 &&
      res.career.level === levelForXp(res.career.xp) &&
      (plainRun.outcome === 'champion') ===
        (res.career.stats.cups === INITIAL_CAREER.stats.cups + 1);
    check('career: run rewards accrue and account correctly', () => ok);
    check(
      'career: the boost the reward check pins to leaves the payout rules alone',
      () => !paysDifferently(boonById(PIN_BOON)!),
    );
  }

  // --- Career: tiered perks respect cost, level gate, and max tier -------------
  {
    const perk = PERKS.find((p) => p.tiers.length >= 2)!; // a multi-tier track
    const t1 = perk.tiers[0];
    const t2 = perk.tiers[1];
    let ok = true;
    // No buy with 0 prestige.
    if (perkLevelOf(buyPerkTier(INITIAL_CAREER, perk.id), perk.id) !== 0) ok = false;
    // Buy tier 1 when affordable and at/above its level requirement (deducts cost).
    const c1 = buyPerkTier({ ...INITIAL_CAREER, prestige: t1.cost, level: t1.levelReq }, perk.id);
    if (perkLevelOf(c1, perk.id) !== 1 || c1.prestige !== 0) ok = false;
    // Level gate: tier 2 refused below its levelReq, even with the Prestige.
    const under = buyPerkTier({ ...c1, prestige: t2.cost, level: t2.levelReq - 1 }, perk.id);
    if (perkLevelOf(under, perk.id) !== 1) ok = false;
    // Tier 2 allowed once the level requirement is met.
    const c2 = buyPerkTier({ ...c1, prestige: t2.cost, level: t2.levelReq }, perk.id);
    if (perkLevelOf(c2, perk.id) !== 2 || c2.prestige !== 0) ok = false;
    // Never exceeds the track's max tier, however rich / high-level.
    let maxed = c2;
    for (let i = 0; i < 5; i++) maxed = buyPerkTier({ ...maxed, prestige: 9999, level: 99 }, perk.id);
    if (perkLevelOf(maxed, perk.id) !== perk.tiers.length) ok = false;
    check('career: tiered perks respect cost, level gate, and max tier', () => ok);
  }

  // --- Budget: career ladder is well-formed and matches the perk track ---------
  {
    let ok = true;
    const track = PERKS.find((p) => p.id === 'transfer-budget')!;
    // One budget per owned tier, plus the base (tier 0).
    if (BUDGET_BY_TIER.length !== track.tiers.length + 1) ok = false;
    // Budgets strictly increase up the ladder.
    for (let i = 1; i < BUDGET_BY_TIER.length; i++) {
      if (BUDGET_BY_TIER[i] <= BUDGET_BY_TIER[i - 1]) ok = false;
    }
    // (Tier well-formedness is checked for every track, once, at the top of this file.)
    // The FIGURE the shop copy promises is the budget that tier actually hands out. Same
    // seam the Extra Re-roll check guards below, and the same failure if it drifts: the
    // dollars live in config.ts and the sentence lives here, so adding a tier to one and
    // not the other reads as a shop that lies rather than as a broken build.
    for (let i = 0; i < track.tiers.length; i++) {
      if (!track.tiers[i].description.includes(`$${BUDGET_BY_TIER[i + 1]}`)) ok = false;
    }
    check('budget: career budget ladder is well-formed and matches its perk track', () => ok);
  }

  // --- Career: the three OTHER perk tracks whose copy promises a number ---------
  // The budget and re-roll checks above guard their sentences against the arithmetic. These
  // three did not, for no reason other than nobody having written it: Extra Choice promises
  // "4 / 5 team boosts offered each round" against BASE_OFFER_SIZE + tier, and Deep Squad and
  // Scout Network promise a delta and a count that ARE the tier. Same failure mode as the two
  // that were guarded - a shop that lies rather than a broken build.
  {
    let ok = true;
    const boonTrack = PERKS.find((p) => p.id === 'extra-boon')!;
    for (let tier = 1; tier <= boonTrack.tiers.length; tier++) {
      if (!boonTrack.tiers[tier - 1].description.includes(String(BASE_OFFER_SIZE + tier))) ok = false;
    }
    // Deep Squad's "+1 / +2 to your entire XI" and Scout Network's "1 / 2 common team
    // boost(s)": in both the number in the sentence is the tier itself.
    for (const id of ['deep-squad', 'scout']) {
      const track = PERKS.find((p) => p.id === id)!;
      for (let tier = 1; tier <= track.tiers.length; tier++) {
        if (!track.tiers[tier - 1].description.includes(String(tier))) ok = false;
      }
    }
    check('career: the Extra Choice / Deep Squad / Scout Network copy matches the numbers', () => ok);
  }

  // --- History records: the union's guard accepts every real record and rejects junk ------
  // `RoundRecord` is a discriminated union (hygiene H70), so its consumers now read fields
  // without a `??` fallback - about forty of which were unreachable and are gone. That is only
  // safe if a malformed save cannot reach them, and `runStorage` cannot validate history per
  // field, so `isRoundRecord` is the gate. It has to be right in both directions.
  {
    let ok = true;
    // Every record a real run writes must pass. Walk runs to completion and check each one.
    let groupSeen = 0;
    let koSeen = 0;
    let pensSeen = 0;
    for (let i = 0; i < 40; i++) {
      let r: RunState | null = playGroupStage(
        runFor(i * 11),
      );
      if (r) r = playToEnd(r);
      for (const rec of r?.history ?? []) {
        if (!isRoundRecord(rec)) ok = false;
        // A round trip through JSON is what actually happens on a reload.
        if (!isRoundRecord(JSON.parse(JSON.stringify(rec)))) ok = false;
        if (rec.stage === 'group') groupSeen++;
        else {
          koSeen++;
          if (rec.pens) pensSeen++;
        }
      }
    }
    // It must have seen both variants, and a shootout, or it is passing on too little.
    if (groupSeen === 0 || koSeen === 0 || pensSeen === 0) ok = false;

    // And junk must be rejected. Each of these is a record with exactly one thing wrong.
    const bad: unknown[] = [
      null,
      'group',
      {},
      { stage: 'group' },
      { stage: 'group', won: true }, // no position
      { stage: 'group', won: true, groupPos: 1, groupSize: 4 }, // no results array
      { ...groupRec(), groupResults: 'nope' },
      { ...groupRec(), won: 'yes' },
      { stage: 0 }, // a knockout record with nothing on it
      { ...koRec(0), events: undefined },
      { ...koRec(0), oppName: undefined },
      { ...koRec(0), decided: 4 },
      { ...koRec(0), userGoals: '2' },
      { stage: null, won: true },
    ];
    for (const b of bad) if (isRoundRecord(b)) ok = false;
    // The two well-formed ones must still pass, so the guard is not simply refusing everything.
    if (!isRoundRecord(groupRec()) || !isRoundRecord(koRec(0))) ok = false;

    check(
      `run history: isRoundRecord accepts every real record ` +
        `(${groupSeen} group, ${koSeen} knockout, ${pensSeen} with a shootout) and rejects ${bad.length} malformed shapes`,
      () => ok,
    );
  }

  // --- Career: budgetOf and the Youth Development grant --------------------------------
  // Both used to live in a component or in App, where the harness could not reach them
  // (hygiene H146). `budgetOf` is what actually hands the transfer market its money - the
  // existing checks could assert that the dollar ladder rises and that the shop copy is
  // honest, but not the lookup in between. `startRunCareer` carries the "a banked boost is
  // dealt exactly once" invariant, which CLAUDE.md calls load-bearing and which used to be
  // enforced by the shape of an `if`.
  {
    let ok = true;
    // Every tier of the transfer-budget track maps to the ladder, in order.
    const track = PERKS.find((p) => p.id === 'transfer-budget')!;
    for (let tier = 0; tier <= track.tiers.length; tier++) {
      const c: CareerState = { ...INITIAL_CAREER, perkLevels: { 'transfer-budget': tier } };
      if (budgetOf(c) !== BUDGET_BY_TIER[Math.min(tier, BUDGET_BY_TIER.length - 1)]) ok = false;
    }
    // A career with no perks gets the base budget, and one claiming a tier past the end of
    // the ladder is clamped rather than handed `undefined` dollars.
    if (budgetOf(INITIAL_CAREER) !== BUDGET_BY_TIER[0]) ok = false;
    const overflow: CareerState = { ...INITIAL_CAREER, perkLevels: { 'transfer-budget': 99 } };
    if (budgetOf(overflow) !== BUDGET_BY_TIER[BUDGET_BY_TIER.length - 1]) ok = false;

    // The grant: owed is read before the clear, the counter is emptied, and a second start
    // is owed nothing. The write is skipped by IDENTITY when neither input changed.
    const owing: CareerState = {
      ...INITIAL_CAREER,
      lastAscension: 0,
      stats: { ...INITIAL_CAREER.stats, bonusStartBoosts: 2 },
    };
    const first = startRunCareer(owing, 0);
    if (first.owed !== 2) ok = false;
    if ((first.career.stats.bonusStartBoosts ?? 0) !== 0) ok = false;
    const second = startRunCareer(first.career, 0);
    if (second.owed !== 0 || second.career !== first.career) ok = false;
    // Changing only the tier still writes, and does not invent a grant.
    const tierOnly = startRunCareer(INITIAL_CAREER, 3);
    if (tierOnly.owed !== 0 || tierOnly.career === INITIAL_CAREER) ok = false;
    if (tierOnly.career.lastAscension !== 3) ok = false;
    // Nothing to do at all: same career object back, so the caller can skip the save.
    if (startRunCareer(tierOnly.career, 3).career !== tierOnly.career) ok = false;
    check('career: budgetOf matches the ladder (clamped), and a banked boost is dealt once', () => ok);
  }

  // --- Career: picking an Ascension tier must NOT spend a start-boost grant ------------
  // The Ascension picker moved to the complete panel (roadmap 36 follow-up), and moving it
  // surfaced a live bug: it was wired to `startRunCareer`, which clears
  // `bonusStartBoosts` and RETURNS what it owes. A picker has no run to deal a grant to, so
  // it dropped the return value and the grant with it - and the picker is a control you can
  // touch as often as you like before any run exists.
  {
    let ok = true;
    const owing: CareerState = {
      ...INITIAL_CAREER,
      lastAscension: 0,
      stats: { ...INITIAL_CAREER.stats, bonusStartBoosts: 2 },
    };
    // Picking records the tier and leaves the grant alone, however many times it is touched.
    let picked = owing;
    for (const tier of [3, 1, 5, 2]) picked = rememberAscension(picked, tier);
    if (picked.lastAscension !== 2) ok = false;
    if ((picked.stats.bonusStartBoosts ?? 0) !== 2) ok = false;
    // The kickoff is still the one and only place it is dealt, and it is dealt in full.
    const kicked = startRunCareer(picked, 2);
    if (kicked.owed !== 2) ok = false;
    if ((kicked.career.stats.bonusStartBoosts ?? 0) !== 0) ok = false;
    // Nothing else on the career moves, and an unchanged tier comes back by identity so the
    // caller can skip the save.
    const { lastAscension: _a, stats: _s, ...restBefore } = owing;
    const { lastAscension: _b, stats: _t, ...restAfter } = picked;
    if (JSON.stringify(restBefore) !== JSON.stringify(restAfter)) ok = false;
    if (rememberAscension(picked, 2) !== picked) ok = false;
    check('career: picking an Ascension tier records it without spending a banked boost', () => ok);
  }

  // --- Career: the shop's advice agrees with what the shop will actually do -----------
  // `perkPurchaseState` and `boonUnlockState` exist so the button a player presses and the
  // function that refuses them are one rule (hygiene H65). That is only worth anything if
  // the two are asserted to agree, so: for a spread of careers, whenever the state says
  // `canBuy`, buying must change the career, and whenever it does not, buying must be a
  // no-op. The `reason` ordering is checked too, because a tier that is BOTH unaffordable
  // and level-gated has to say "reach level N" - telling a player to earn Prestige they
  // already have is the specific bug the precedence exists to avoid.
  {
    let ok = true;
    const careers: CareerState[] = [];
    // A fresh career, a rich low-level one (level-gated but flush), a high-level poor one,
    // and a maxed-out one.
    const base = INITIAL_CAREER;
    careers.push(base);
    careers.push({ ...base, prestige: 99999 });
    careers.push({ ...base, level: 99 });
    careers.push({ ...base, level: 99, prestige: 99999 });
    for (const c of careers) {
      for (const perk of PERKS) {
        const st = perkPurchaseState(c, perk.id);
        const after = buyPerkTier(c, perk.id);
        const changed = after !== c;
        if (changed !== st.canBuy) ok = false;
        // The label's precedence: level before price.
        if (st.next && !st.levelOk && st.reason !== 'level') ok = false;
        if (st.next && st.levelOk && !st.affordable && st.reason !== 'prestige') ok = false;
        if (!st.next && st.reason !== 'maxed') ok = false;
        // A maxed track has no next tier and cannot be bought.
        if (!st.next && changed) ok = false;
      }
      for (const b of BOONS) {
        const st = boonUnlockState(c, b.id);
        const after = unlockBoon(c, b.id);
        if ((after !== c) !== st.canBuy) ok = false;
        if (b.starter && !st.inPool) ok = false;
      }
    }
    // And the level gate really does bite: a flush level-1 career must be refused at least
    // one tier for level alone, or this check is passing on nothing.
    const flush = { ...base, prestige: 99999 };
    const levelBlocked = PERKS.filter((p) => perkPurchaseState(flush, p.id).reason === 'level');
    if (levelBlocked.length === 0) ok = false;
    check(
      `career: the shop state agrees with buyPerkTier / unlockBoon ` +
        `(${levelBlocked.length} tracks level-gated for a flush level-1 career)`,
      () => ok,
    );
  }

  // --- Pricing + Ascension: the two derivations that had three and two copies -------
  {
    let ok = true;
    // xiSpend is what the market's budget bar, the line-up sheet's total and the run's build
    // record all now read, so it has to agree with summing priceFor by hand - which is what
    // those three were each doing separately.
    const xi = bestEleven(SQUADS.find((s) => s.id === 'bra-1990')!.players);
    const byHand = xi.reduce((n, p) => n + priceFor(p, null), 0);
    if (xiSpend(xi, null) !== byHand) ok = false;
    // The owned-sticker discount reaches it: owning every card makes the same XI cheaper.
    const owned = new Set(xi.map((p) => p.id));
    if (!(xiSpend(xi, owned) < byHand)) ok = false;
    // The market's "value" sort measures rating above PRICE_BASE, which must be the same
    // floor the curve uses: priceOf(PRICE_BASE) is the minimum price, not something above it.
    if (priceOf(PRICE_BASE) !== 1) ok = false;
    // selectedAscension is the tier a run is actually played at, and the CLAMP is the point:
    // a stale saved tier cannot start a run above the ceiling.
    const lowLevel = { ascension: 5, level: 1, lastAscension: 5 };
    if (selectedAscension(lowLevel) !== maxSelectableAscension(5, 1)) ok = false;
    if (selectedAscension({ ascension: 0, level: 1 }) !== 0) ok = false;
    // An explicit override is clamped the same way.
    if (selectedAscension(lowLevel, 5) !== maxSelectableAscension(5, 1)) ok = false;
    check('pricing/ascension: xiSpend and selectedAscension are the single definitions', () => ok);
  }

  // --- Career: the Extra Re-roll perk feeds the roll draft starting count ------
  {
    let ok = true;
    const track = PERKS.find((p) => p.id === 'extra-reroll')!;
    // The owned tier IS the number of extra re-rolls, so what the shop promises ("a 4th",
    // "a 5th") has to match INITIAL_REROLLS + tier. This is the seam the perk crosses: the
    // reducer knows nothing about the career, so App reads the perk and passes the number
    // in on START_DRAFT. If either side moves, these two stop agreeing.
    if (extraRerollsOf(INITIAL_CAREER) !== 0) ok = false;
    for (let tier = 1; tier <= track.tiers.length; tier++) {
      const career = { ...INITIAL_CAREER, perkLevels: { 'extra-reroll': tier } };
      if (extraRerollsOf(career) !== tier) ok = false;
      // The ordinal the description promises is the resulting total.
      if (!track.tiers[tier - 1].description.includes(String(INITIAL_REROLLS + tier))) ok = false;
    }
    // A save claiming a tier that does not exist cannot mint re-rolls.
    const bogus = { ...INITIAL_CAREER, perkLevels: { 'extra-reroll': 99 } };
    if (extraRerollsOf(bogus) !== track.tiers.length) ok = false;
    check('career: Extra Re-roll perk matches the starting re-roll count', () => ok);
  }

  // --- Ascension: reward scaling, unlock bookkeeping, selection gates ---------
  {
    let ok = true;
    // Reward multiplier is monotonic non-decreasing up the ladder.
    for (let t = 1; t < ASCENSIONS.length; t++) {
      if (ASCENSIONS[t].rewardMult < ASCENSIONS[t - 1].rewardMult) ok = false;
    }
    // Selection gate: bounded by the unlocked ceiling AND the per-tier level requirement.
    if (maxSelectableAscension(0, 99) !== 0) ok = false; // nothing unlocked -> only Base
    if (maxSelectableAscension(5, 1) !== 0) ok = false; // level 1 gates everything above Base
    if (maxSelectableAscension(5, 99) !== ASCENSIONS.length - 1) ok = false; // all unlocked, high level
    if (maxSelectableAscension(2, 6) !== 2) ok = false; // ceiling 2, meets tier-2 level req
    if (maxSelectableAscension(2, 5) !== 1) ok = false; // below tier-2 level req -> capped at 1

    // Reward scaling + cup unlock bookkeeping (build a full RunState, then override).
    const base = runFor();
    const champ = { ...base, score: 140, outcome: 'champion' as RunOutcome, ascension: 2 };
    const rc = applyRunResult(INITIAL_CAREER, champ);
    const m2 = ascensionAt(2).rewardMult;
    if (rc.xpGained !== Math.round(140 * m2)) ok = false;
    if (rc.prestigeGained !== Math.max(1, Math.round((140 * m2) / 5))) ok = false;
    if (rc.career.ascension !== 3) ok = false; // won at 2 -> unlock ceiling 3
    if (rc.career.stats.bestCupAscension !== 2) ok = false;

    // A non-cup finish still scales its reward but never raises the unlock ceiling / best.
    const lost = { ...base, score: 25, outcome: 'r16' as RunOutcome, ascension: 2 };
    const rl = applyRunResult(INITIAL_CAREER, lost);
    if (rl.xpGained !== Math.round(25 * m2)) ok = false;
    if (rl.career.ascension !== INITIAL_CAREER.ascension) ok = false;
    if (rl.career.stats.bestCupAscension !== 0) ok = false;

    // A full run at every tier terminates validly and carries its tier through.
    for (let t = 0; t < ASCENSIONS.length && ok; t++) {
      let r = playGroupStage(runFor(t, { ascension: t }));
      r = playToEnd(r);
      if (r.phase !== 'ended' || !r.outcome || r.xi.length !== 11 || r.ascension !== t) ok = false;
    }
    check('ascension: reward scaling, unlock bookkeeping, and selection gates hold', () => ok);
  }

}
