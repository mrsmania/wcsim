/**
 * WP0 - domain characterization checks.
 *
 * A lightweight, committed stand-in for a test runner. It exercises the
 * deterministic-except-for-`Math.random` game core many times and asserts
 * invariants that must always hold, whatever the random draw. Run it with
 * `npm run checks` (bundled with esbuild and executed in node); it prints a
 * PASS/FAIL summary and exits non-zero if any invariant is violated.
 *
 * This is a safety net for the risky domain math (match sim, penalty shootout,
 * the knockout bracket, standings, chemistry) - not a UI or behaviour change.
 */
import { SQUADS, SQUAD_BY_ID } from '../src/data/squads';
import { primaryPosition } from '../src/data/types';
import { validateSquads } from '../src/domain/validateSquads';
import { simulateMatch, simulateShootout } from '../src/domain/match';
import {
  bestEleven,
  createGroup,
  pickOpponents,
  recordMatchday,
  simulateMatchday,
  squadGroupTeam,
  standings,
  userGroupTeam,
  GROUP_MATCHDAYS,
} from '../src/domain/tournament';
import {
  buildBracket,
  bracketChampionId,
  currentGame,
  opponentOf,
  playRound,
  recordRound,
} from '../src/domain/bracket';
import { sideOf, KO_ROUNDS } from '../src/domain/knockout';
import { computeChemistry, MAX_BONUS, type Placement } from '../src/domain/chemistry';
import { priceOf } from '../src/domain/pricing';
import { autoFillBudget } from '../src/domain/budget';
import { FORMATIONS_DATA } from '../src/domain/formations';
import { BUDGET_DRAFT, BUDGET_BY_TIER } from '../src/config';
import {
  BOONS,
  offerBoons,
  availableBoons,
  lockableBoons,
  BOON_UNLOCK_COST,
} from '../src/domain/boons';
import {
  beginRun,
  playGroupStage,
  chooseBoon,
  playKnockoutRound,
  type RunOutcome,
} from '../src/domain/run';
import {
  applyRunResult,
  buyPerkTier,
  perkLevelOf,
  unlockBoon,
  INITIAL_CAREER,
  levelForXp,
  PERKS,
} from '../src/domain/career';
import { simulateTitleOdds } from '../src/domain/odds';
import { ASCENSIONS, ascensionAt, maxSelectableAscension } from '../src/domain/ascension';

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failures.push(name);
}

// --- Dataset integrity -----------------------------------------------------
check('dataset: validateSquads reports no problems', validateSquads(SQUADS).length === 0);
check('dataset: SQUAD_BY_ID resolves every squad', SQUADS.every((s) => SQUAD_BY_ID[s.id] === s));

// --- Penalty shootout: always a decisive, self-consistent result -----------
{
  const a = squadGroupTeam(SQUADS[0]);
  const b = squadGroupTeam(SQUADS[1]);
  let ok = true;
  for (let i = 0; i < 20000 && ok; i++) {
    const r = simulateShootout({ penTakers: a.penTakers }, { penTakers: b.penTakers });
    const homeScored = r.kicks.filter((k) => k.side === 'home' && k.scored).length;
    const awayScored = r.kicks.filter((k) => k.side === 'away' && k.scored).length;
    if (r.home < 0 || r.away < 0) ok = false; // never a negative tally
    if (r.home === r.away) ok = false; // always separates the sides
    if (r.homeWon !== r.home > r.away) ok = false; // winner flag matches the tally
    if (r.home !== homeScored || r.away !== awayScored) ok = false; // kicks reconstruct the score
  }
  check('shootout: decisive, non-negative, and kicks reconstruct the score', ok);
}

// --- Match sim (G1 model): even teams score believable, reconstructable ----
{
  const t = squadGroupTeam(SQUADS[0]);
  const N = 20000;
  let goals = 0;
  let eventsOk = true;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch(sideOf(t), sideOf(t)); // same team both sides = no edge
    goals += r.homeGoals + r.awayGoals;
    const home = r.events.filter((e) => e.side === 'home').length;
    const away = r.events.filter((e) => e.side === 'away').length;
    if (home !== r.homeGoals || away !== r.awayGoals) eventsOk = false;
  }
  const meanPerSide = goals / (2 * N);
  check(
    `match: even-team mean goals/side in [0.8, 2.2] (got ${meanPerSide.toFixed(2)})`,
    meanPerSide > 0.8 && meanPerSide < 2.2,
  );
  check('match: goal events reconstruct the scoreline', eventsOk);
}

// --- Standings: internally consistent totals, correct ordering -------------
{
  let ok = true;
  for (let i = 0; i < 1000 && ok; i++) {
    const user = userGroupTeam(bestEleven(SQUADS[i % SQUADS.length].players));
    let group = createGroup(user, pickOpponents(3));
    for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
      group = recordMatchday(group, simulateMatchday(group, md));
    }
    const table = standings(group);
    if (table.length !== 4) ok = false;
    let gf = 0;
    let ga = 0;
    for (const s of table) {
      if (s.played !== s.won + s.drawn + s.lost) ok = false;
      if (s.points !== s.won * 3 + s.drawn) ok = false;
      if (s.gd !== s.gf - s.ga) ok = false;
      if (s.played !== 3) ok = false; // 4-team round robin
      gf += s.gf;
      ga += s.ga;
    }
    if (gf !== ga) ok = false; // every goal for is a goal against for someone
    for (let k = 1; k < table.length; k++) {
      const x = table[k - 1];
      const y = table[k];
      const ordered =
        x.points > y.points ||
        (x.points === y.points && (x.gd > y.gd || (x.gd === y.gd && x.gf >= y.gf)));
      if (!ordered) ok = false;
    }
  }
  check('standings: totals are consistent and the table is correctly ordered', ok);
}

// --- Bracket: always crowns one champion; co-qualifier only in the final ---
{
  let completesOk = true;
  let metCoQualifierEarly = false;
  for (let i = 0; i < 1000 && completesOk; i++) {
    const user = userGroupTeam(bestEleven(SQUADS[i % SQUADS.length].players));
    const coQualifier = squadGroupTeam(SQUADS[(i + 1) % SQUADS.length]);
    let b = buildBracket(user, coQualifier, [coQualifier.id]);
    let guard = 0;
    while (b.outcome === 'alive' && guard++ < 10) {
      const game = currentGame(b);
      if (game) {
        const opp = opponentOf(b, game);
        if (opp && opp.id === coQualifier.id && b.current !== KO_ROUNDS.length - 1) {
          metCoQualifierEarly = true;
        }
      }
      b = recordRound(b, playRound(b));
    }
    if (bracketChampionId(b) === null) completesOk = false; // a champion is always crowned
    if (b.rounds.length !== KO_ROUNDS.length) completesOk = false; // whole tree filled
  }
  check('bracket: always completes with exactly one champion', completesOk);
  check('bracket: the co-qualifier can only be met in the final', !metCoQualifierEarly);
}

// --- Chemistry: bonus is the (capped) sum of its parts ----------------------
{
  let ok = true;
  for (const squad of SQUADS) {
    const placements: Placement[] = bestEleven(squad.players).map((p) => ({
      player: p,
      slotPosition: primaryPosition(p),
    }));
    const rep = computeChemistry(placements);
    const sum = rep.categories.reduce((acc, c) => acc + c.points, 0);
    if (sum !== rep.rawTotal) ok = false;
    if (rep.bonus !== Math.min(MAX_BONUS, rep.rawTotal)) ok = false;
    if (rep.capped !== rep.rawTotal > MAX_BONUS) ok = false;
    if (rep.bonus < 0 || rep.bonus > MAX_BONUS) ok = false;
  }
  const empty = computeChemistry([]);
  if (empty.bonus !== 0 || empty.rawTotal !== 0) ok = false;
  check('chemistry: bonus equals the category sum, capped at MAX_BONUS', ok);
}

// --- Chemistry bonus reaches the sim (attack + defense, not just overall) ----
{
  const players = bestEleven(SQUADS[0].players);
  const base = userGroupTeam(players, 0).strength;
  const boosted = userGroupTeam(players, 5).strength;
  const reaches =
    boosted.attack === base.attack + 5 &&
    boosted.defense === base.defense + 5 &&
    boosted.overall === base.overall + 5;
  check('chemistry: the bonus lifts attack + defense (so it affects the match sim)', reaches);
}

// --- Budget draft pricing: monotonic, floored at 1 -------------------------
{
  let ok = BUDGET_DRAFT > 0;
  for (let e = 60; e <= 99; e++) {
    if (priceOf(e) < 1) ok = false;
    if (e > 60 && priceOf(e) < priceOf(e - 1)) ok = false; // non-decreasing in rating
  }
  check('pricing: price is >= 1 and never decreases with rating', ok);
}

// --- Budget auto-fill: within budget, no duplicate person, fills every slot ---
{
  const formations = Object.values(FORMATIONS_DATA.byKey);
  let withinBudget = true;
  let noDupes = true;
  let fillsAll = true;
  let usedMatches = true;
  for (let i = 0; i < 3000; i++) {
    const f = formations[i % formations.length];
    const { filled, usedPersonIds } = autoFillBudget(f.slots, {}, BUDGET_DRAFT);
    const placed = f.slots.map((s) => filled[s.id]).filter((p): p is NonNullable<typeof p> => !!p);
    const spent = placed.reduce((t, p) => t + priceOf(p.elo), 0);
    if (spent > BUDGET_DRAFT) withinBudget = false; // never overspends
    if (new Set(placed.map((p) => p.personId)).size !== placed.length) noDupes = false;
    // Every position in the dataset is fillable within the budget, so a fresh XI fills.
    if (placed.length !== f.slots.length) fillsAll = false;
    const usedFromPlaced = new Set(placed.map((p) => p.personId));
    if (
      usedPersonIds.length !== usedFromPlaced.size ||
      !usedPersonIds.every((id) => usedFromPlaced.has(id))
    ) {
      usedMatches = false; // reported personIds match the players actually placed
    }
  }
  check('budget: auto-fill never exceeds the budget', withinBudget);
  check('budget: auto-fill never uses a personId twice', noDupes);
  check('budget: auto-fill fills every slot when the budget allows', fillsAll);
  check('budget: auto-fill reports exactly the placed personIds', usedMatches);
}

// --- Boons: keep a valid 11 (no duplicate person); offers are distinct ------
{
  const xi = bestEleven(SQUADS[0].players);
  let ok = true;
  for (const b of BOONS) {
    const after = b.apply(xi, { opponentSquadId: SQUADS[1].id });
    if (after.length !== xi.length) ok = false; // roster boons swap, never grow/shrink
    if (new Set(after.map((p) => p.personId)).size !== after.length) ok = false; // no dupes
  }
  const pool = availableBoons([]);
  const offer = offerBoons(pool, 3);
  if (offer.length !== 3 || new Set(offer.map((b) => b.id)).size !== 3) ok = false;
  // Offers only ever contain boons from the given pool, and n clamps to the pool size.
  if (offer.some((b) => !pool.some((p) => p.id === b.id))) ok = false;
  if (offerBoons(pool, pool.length + 5).length !== pool.length) ok = false;
  check('boons: every boon keeps 11 distinct players; offers are distinct + in pool', ok);
}

// --- Boon availability + unlock economy ------------------------------------
{
  let ok = true;
  // Starters are always available; locked boons are not until unlocked.
  const starters = availableBoons([]);
  if (!starters.length || starters.some((b) => !b.starter)) ok = false;
  const locked = lockableBoons();
  if (locked.some((b) => b.starter)) ok = false;
  const sample = locked[0];
  if (availableBoons([]).some((b) => b.id === sample.id)) ok = false;
  if (!availableBoons([sample.id]).some((b) => b.id === sample.id)) ok = false;

  // Unlock economy: no unlock with 0 prestige; a starter is never buyable; unlock (and
  // deduct) when affordable; no re-buy of the same boon.
  const cost = BOON_UNLOCK_COST[sample.rarity];
  if (unlockBoon(INITIAL_CAREER, sample.id).unlockedBoons.length !== 0) ok = false;
  const starterId = starters[0].id;
  const starterBuy = unlockBoon({ ...INITIAL_CAREER, prestige: 999 }, starterId);
  if (starterBuy.unlockedBoons.length !== 0 || starterBuy.prestige !== 999) ok = false;
  const bought = unlockBoon({ ...INITIAL_CAREER, prestige: cost }, sample.id);
  if (!bought.unlockedBoons.includes(sample.id) || bought.prestige !== 0) ok = false;
  if (unlockBoon(bought, sample.id).unlockedBoons.length !== 1) ok = false;

  // Rarity weighting: over many single draws from the full pool, commons out-appear
  // legendaries (they are weighted 6:1).
  const full = availableBoons(locked.map((b) => b.id));
  let commons = 0;
  let legendaries = 0;
  for (let i = 0; i < 4000; i++) {
    const r = offerBoons(full, 1)[0].rarity;
    if (r === 'common') commons++;
    else if (r === 'legendary') legendaries++;
  }
  if (!(commons > legendaries)) ok = false;
  check('boons: availability, unlock economy, and rarity-weighted offers hold', ok);
}

// --- Cup Run: always ends with a valid outcome, score, and 11 players -------
{
  const EXPECT: Record<RunOutcome, number> = {
    group: 10,
    r16: 25,
    qf: 45,
    sf: 70,
    final: 95,
    champion: 140,
  };
  let ok = true;
  for (let i = 0; i < 300 && ok; i++) {
    let r = playGroupStage(beginRun(bestEleven(SQUADS[i % SQUADS.length].players)));
    let guard = 0;
    while (r.phase !== 'ended' && guard++ < 20) {
      if (r.phase === 'boon' && r.offer) r = chooseBoon(r, r.offer[0].id).next;
      else if (r.phase === 'match') r = playKnockoutRound(r);
      else break;
    }
    if (r.phase !== 'ended' || !r.outcome) ok = false;
    else if (r.score !== EXPECT[r.outcome] || r.xi.length !== 11) ok = false;
  }
  check('run: every Cup Run ends with a valid outcome, score, and 11 players', ok);
}

// --- Career: run rewards + perk purchases account correctly -----------------
{
  let run = playGroupStage(beginRun(bestEleven(SQUADS[0].players)));
  let guard = 0;
  while (run.phase !== 'ended' && guard++ < 20) {
    if (run.phase === 'boon' && run.offer) run = chooseBoon(run, run.offer[0].id).next;
    else if (run.phase === 'match') run = playKnockoutRound(run);
    else break;
  }
  const res = applyRunResult(INITIAL_CAREER, run);
  let ok =
    res.career.stats.runs === INITIAL_CAREER.stats.runs + 1 &&
    res.xpGained === run.score &&
    res.career.xp === INITIAL_CAREER.xp + run.score &&
    res.prestigeGained >= 1 &&
    res.career.level === levelForXp(res.career.xp) &&
    (run.outcome === 'champion') === (res.career.stats.cups === INITIAL_CAREER.stats.cups + 1);
  check('career: run rewards accrue and account correctly', ok);
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
  check('career: tiered perks respect cost, level gate, and max tier', ok);
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
  // Each perk tier is a bigger ask than the last (cost up, level gate non-decreasing).
  for (let i = 1; i < track.tiers.length; i++) {
    if (track.tiers[i].cost <= track.tiers[i - 1].cost) ok = false;
    if (track.tiers[i].levelReq < track.tiers[i - 1].levelReq) ok = false;
  }
  check('budget: career budget ladder is well-formed and matches its perk track', ok);
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
  const base = beginRun(bestEleven(SQUADS[0].players));
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
    let r = playGroupStage(beginRun(bestEleven(SQUADS[t % SQUADS.length].players), {}, [], t));
    let guard = 0;
    while (r.phase !== 'ended' && guard++ < 20) {
      if (r.phase === 'boon' && r.offer) r = chooseBoon(r, r.offer[0].id).next;
      else if (r.phase === 'match') r = playKnockoutRound(r);
      else break;
    }
    if (r.phase !== 'ended' || !r.outcome || r.xi.length !== 11 || r.ascension !== t) ok = false;
  }
  check('ascension: reward scaling, unlock bookkeeping, and selection gates hold', ok);
}

// --- Title odds: a valid probability distribution ---------------------------
{
  const o = simulateTitleOdds(bestEleven(SQUADS[0].players), 300);
  const distSum = Object.values(o.distribution).reduce((a, b) => a + b, 0);
  const ok =
    Math.abs(distSum - 1) < 1e-9 &&
    o.champion >= 0 &&
    o.advanced <= 1 &&
    o.champion <= o.finalist + 1e-9 &&
    o.finalist <= o.advanced + 1e-9;
  check('odds: distribution sums to 1 and champion <= finalist <= advanced', ok);
}

// --- Summary ---------------------------------------------------------------
console.log('WP0 characterization checks');
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll characterization checks passed.');
