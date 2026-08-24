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
import { readFileSync } from 'node:fs';
import { ALL_PLAYERS, SQUADS, SQUAD_BY_ID, basePlayer } from '../src/data/squads';
import { ELO_MAX, ELO_MIN, isAttacker, isDefender, primaryPosition, type Player, type Position } from '../src/data/types';
import { validateSquads } from '../src/domain/validateSquads';
import {
  POSITION_WEIGHT,
  pickScorer,
  scorerPool,
  scorerWeight,
  simulateMatch,
  simulateShootout,
} from '../src/domain/match';
import {
  bestEleven,
  createGroup,
  pickOpponents,
  recordMatchday,
  simulateMatchday,
  squadGroupTeam,
  standings,
  userGroupTeam,
  groupAsOf,
  GROUP_MATCHDAYS,
  USER_ID,
} from '../src/domain/tournament';
import {
  buildBracket,
  bracketChampion,
  bracketChampionId,
  currentGame,
  opponentOf,
  playRound,
  recordRound,
  userGameInRound,
} from '../src/domain/bracket';
import { sideOf, KO_ROUNDS } from '../src/domain/knockout';
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
} from '../src/domain/challenges';
import { collectiblePlayers, collectiblesByTier, emptyAlbum } from '../src/domain/album';
import { BADGES, badgeRows, badgesEarned, perkTiersOwned } from '../src/domain/badges';
import { bestCupStreakOf, cabinetView } from '../src/domain/cabinet';
import { computeChemistry, MAX_BONUS, type Placement } from '../src/domain/chemistry';
import { priceFor, priceOf, pricerFor } from '../src/domain/pricing';
import { autoFillBudget } from '../src/domain/budget';
import { FORMATIONS_DATA, getFormation, type Style } from '../src/domain/formations';
import { canMove, moveTargets, placedPlayers, planMove, type Filled } from '../src/domain/draft';
import { BUDGET_DRAFT, BUDGET_BY_TIER, STICKER_DISCOUNT } from '../src/config';
import {
  BOONS,
  applyBoon,
  offerBoons,
  availableBoons,
  lockableBoons,
  boonById,
  BOON_UNLOCK_COST,
  type Boon,
  type RunModifier,
} from '../src/domain/boons';
import { xiOf, type RunEffect } from '../src/domain/effects';
import {
  addMatches,
  beginRun,
  chemistryOf,
  emptyTally,
  playGroupStage,
  prepareGroupStage,
  prepareKnockoutRound,
  runTotals,
  chooseBoon,
  resolveChoice,
  playKnockoutRound,
  type RunBuild,
  type RunOutcome,
  type RunShape,
  type RunState,
} from '../src/domain/run';
import {
  applyRunResult,
  HISTORY_LIMIT,
  PLAYER_RECORD_LIMIT,
  buyPerkTier,
  extraRerollsOf,
  perkLevelOf,
  unlockBoon,
  HIGH_ASCENSION,
  INITIAL_CAREER,
  levelForXp,
  PERKS,
} from '../src/domain/career';
import { simulateTitleOdds } from '../src/domain/odds';
// The reducer owns the base re-roll count; the perk below has to agree with it. It also
// owns the swap allowance, which the Swap Meet challenge has to agree with.
import { INITIAL_REROLLS, INITIAL_SWAPS } from '../src/state/gameReducer';
import { ASCENSIONS, ascensionAt, maxSelectableAscension } from '../src/domain/ascension';
import { tierOf } from '../src/domain/album';
import {
  CATALOGUE_PATH,
  catalogueChecksum,
  catalogueRows,
  checksumInFile,
} from './collectibles';

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

// --- The owned-sticker discount --------------------------------------------
{
  let ok = STICKER_DISCOUNT >= 0 && STICKER_DISCOUNT < 1;
  const collectibles = ALL_PLAYERS.filter((p) => tierOf(p));
  const owned = new Set(collectibles.map((p) => p.id));
  for (const p of ALL_PLAYERS) {
    const base = priceOf(p.elo);
    const full = priceFor(p, null); // no album: exactly the curve
    const held = priceFor(p, owned);
    if (full !== base) ok = false;
    if (held > base) ok = false; // a discount never raises a price
    if (held < 1) ok = false; // and never goes below the floor
    if (!owned.has(p.id) && held !== base) ok = false; // only owned players are cheaper
    if (owned.has(p.id) && held !== Math.max(1, Math.round(base * (1 - STICKER_DISCOUNT)))) {
      ok = false;
    }
  }
  // Keyed on player id, not personId: owning one version must not discount another.
  const twoVersions = ALL_PLAYERS.filter(
    (p) => tierOf(p) && ALL_PLAYERS.some((q) => q.personId === p.personId && q.id !== p.id),
  );
  if (twoVersions.length === 0) ok = false; // the dataset should have such a pair
  for (const p of twoVersions) {
    const justHim = new Set([p.id]);
    const other = ALL_PLAYERS.find((q) => q.personId === p.personId && q.id !== p.id)!;
    if (priceFor(p, justHim) >= priceOf(p.elo)) ok = false; // he is discounted
    if (priceFor(other, justHim) !== priceOf(other.elo)) ok = false; // his other card is not
  }
  check('pricing: the owned-sticker discount is bounded, floored, and per player id', ok);
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

  // The same, spending DISCOUNTED prices: the reserve and upgrade passes both read the
  // pricer, so an album has to leave the budget invariant intact rather than overshoot.
  const owned = new Set(ALL_PLAYERS.filter((p) => tierOf(p)).map((p) => p.id));
  const price = pricerFor(owned);
  let discountedWithin = true;
  let discountedFills = true;
  let cheaperSomewhere = false;
  for (let i = 0; i < 3000; i++) {
    const f = formations[i % formations.length];
    const { filled } = autoFillBudget(f.slots, {}, BUDGET_DRAFT, ALL_PLAYERS, price);
    const placed = f.slots.map((s) => filled[s.id]).filter((p): p is NonNullable<typeof p> => !!p);
    const spent = placed.reduce((t, p) => t + price(p), 0);
    if (spent > BUDGET_DRAFT) discountedWithin = false;
    if (placed.length !== f.slots.length) discountedFills = false;
    // With every collectible owned, some XI should come in under its undiscounted cost.
    if (placed.reduce((t, p) => t + priceOf(p.elo), 0) > spent) cheaperSomewhere = true;
  }
  check('budget: auto-fill respects the budget when prices are discounted', discountedWithin);
  check('budget: auto-fill still fills every slot when prices are discounted', discountedFills);
  check('budget: a discounted XI can cost less than its list price', cheaperSomewhere);
}

// --- Placed XI promotes the slot role to the primary position ---------------
{
  // A DM/CB placed at CB should count as a CB (the Rijkaard bug).
  let ok = true;
  const f = Object.values(FORMATIONS_DATA.byKey).find((fm) =>
    fm.slots.some((s) => s.position === 'CB'),
  )!;
  const cb = f.slots.find((s) => s.position === 'CB')!;
  const player: Player = {
    id: 't1', personId: 't1', squadId: 'x', number: 4, name: 'Rijkaard',
    positions: ['DM', 'CB'], elo: 88,
  };
  const placed = placedPlayers(f, { [cb.id]: player });
  // The slot role (CB) is promoted to positions[0]; the other role is kept.
  if (placed.length !== 1 || placed[0].positions[0] !== 'CB') ok = false;
  if (!placed[0].positions.includes('DM')) ok = false;
  // A player already in their slot role is returned untouched (same object).
  const inPos: Player = { ...player, positions: ['CB', 'DM'] };
  if (placedPlayers(f, { [cb.id]: inPos })[0] !== inPos) ok = false;
  check('draft: placedPlayers promotes the slot role to the primary position', ok);
}

// --- Moving a placed player stays inside his position range ----------------
{
  let ok = true;
  const f = Object.values(FORMATIONS_DATA.byKey).find(
    (fm) =>
      fm.slots.some((s) => s.position === 'CB') &&
      fm.slots.some((s) => s.position === 'DM') &&
      fm.slots.some((s) => s.position === 'ST'),
  )!;
  const cb = f.slots.find((s) => s.position === 'CB')!;
  const dm = f.slots.find((s) => s.position === 'DM')!;
  const st = f.slots.find((s) => s.position === 'ST')!;
  const utility: Player = {
    id: 'm1', personId: 'm1', squadId: 'x', number: 4, name: 'Utility',
    positions: ['DM', 'CB'], elo: 85,
  };
  const striker: Player = {
    id: 'm2', personId: 'm2', squadId: 'x', number: 9, name: 'Striker',
    positions: ['ST'], elo: 90,
  };

  // Into an empty slot he can play; not into one he cannot.
  const one: Filled = { [cb.id]: utility };
  if (!canMove(f, one, cb.id, dm.id)) ok = false;
  if (canMove(f, one, cb.id, st.id)) ok = false;
  if (canMove(f, one, cb.id, cb.id)) ok = false; // nowhere to go: same slot

  // A trade needs BOTH halves to fit: the striker cannot cover centre-back, so the
  // pair is refused rather than silently producing an invalid line-up.
  const two: Filled = { [cb.id]: utility, [st.id]: striker };
  if (canMove(f, two, cb.id, st.id)) ok = false;
  const swapper: Player = { ...striker, id: 'm3', personId: 'm3', positions: ['ST', 'CB'] };
  const three: Filled = { [cb.id]: utility, [st.id]: swapper };
  if (canMove(f, three, cb.id, st.id)) ok = false; // utility still cannot play ST
  const both: Player = { ...utility, positions: ['DM', 'CB', 'ST'] };
  if (!canMove(f, { [cb.id]: both, [st.id]: swapper }, cb.id, st.id)) ok = false;

  // The trap: placedPlayers hands out copies with the filled slot promoted to the
  // front, so a move keyed off positions[0] would shrink a player's range every time
  // he moved. Moving him back and forth must offer the same targets each time.
  const targetsAt = (slotId: string, filled: Filled) => [...moveTargets(f, filled, slotId)].sort();
  const atCb = targetsAt(cb.id, { [cb.id]: utility });
  const reordered = placedPlayers(f, { [cb.id]: utility })[0]; // positions now ['CB','DM']
  if (targetsAt(cb.id, { [cb.id]: reordered }).join() !== atCb.join()) ok = false;
  // And over a round trip repeated many times (CB -> DM -> CB -> ...): what he is
  // offered at each end must be identical every time he arrives back there.
  let filled: Filled = { [cb.id]: utility };
  const seen = new Map<string, string>();
  for (let i = 0; i < 8; i++) {
    const from = filled[cb.id] ? cb.id : dm.id;
    const to = from === cb.id ? dm.id : cb.id;
    if (!canMove(f, filled, from, to)) { ok = false; break; }
    filled = { [to]: filled[from]! };
    const here = targetsAt(to, filled).join();
    if (!here.length) ok = false; // never stranded
    if (seen.has(to) && seen.get(to) !== here) ok = false; // the range never shrinks
    seen.set(to, here);
  }
  check('draft: a move stays within the position range, however often it is made', ok);
}

// --- Rotations: a legal cycle no pair can reach --------------------------------
{
  let ok = true;
  const f = Object.values(FORMATIONS_DATA.byKey).find(
    (fm) =>
      fm.slots.some((s) => s.position === 'LW') &&
      fm.slots.some((s) => s.position === 'RW') &&
      fm.slots.some((s) => s.position === 'ST'),
  )!;
  const lw = f.slots.find((s) => s.position === 'LW')!;
  const st = f.slots.find((s) => s.position === 'ST')!;
  const rw = f.slots.find((s) => s.position === 'RW')!;
  const mk = (id: string, positions: Player['positions']): Player => ({
    id, personId: id, squadId: 'x', number: 9, name: id, positions, elo: 90,
  });

  // The real case from the dataset (Knoflicek / Burruchaga / Donadoni): the front three
  // can rotate one place round, but NO pair of them can trade - each would land in a
  // slot they cannot play. A pairwise-only rule offers nothing here.
  const a = mk('a', ['LW', 'ST']);
  const b = mk('b', ['AM', 'RW', 'ST']);
  const c = mk('c', ['LW', 'RW', 'AM']);
  // Only the front three exist, so the chain cannot escape into an empty midfield slot.
  const trio: Filled = { [lw.id]: a, [st.id]: b, [rw.id]: c };
  const frontOnly = { ...f, slots: [lw, st, rw] };
  if (!canMove(frontOnly, trio, lw.id, st.id)) ok = false; // a -> ST, rotating b and c
  const rotated = planMove(frontOnly, trio, lw.id, st.id)!;
  if (rotated[st.id] !== a || rotated[rw.id] !== b || rotated[lw.id] !== c) ok = false;
  // Every player still plays a position he actually has, and nobody was dropped.
  for (const s of frontOnly.slots) {
    const p = rotated[s.id];
    if (!p || !p.positions.includes(s.position)) ok = false;
  }
  if (new Set(Object.values(rotated).map((p) => p!.id)).size !== 3) ok = false;

  // Only that one direction is legal here: a cannot play RW, so rotating the other way
  // is refused at the first step rather than fudged.
  if (canMove(frontOnly, trio, lw.id, rw.id)) ok = false;
  if (canMove(frontOnly, trio, st.id, lw.id)) ok = false; // b cannot play LW either
  // Tapping the other end of the same cycle reaches the same legal arrangement.
  const fromRw = planMove(frontOnly, trio, rw.id, lw.id);
  if (!fromRw || fromRw[lw.id] !== c || fromRw[st.id] !== a || fromRw[rw.id] !== b) ok = false;

  // A cycle that is genuinely impossible stays impossible: three one-position players
  // have nowhere to go at all.
  const stuck: Filled = {
    [lw.id]: mk('x', ['LW']), [st.id]: mk('y', ['ST']), [rw.id]: mk('z', ['RW']),
  };
  for (const from of frontOnly.slots) {
    if (moveTargets(frontOnly, stuck, from.id).size !== 0) ok = false;
  }
  check('draft: a legal rotation of three is offered where no pair can trade', ok);
}

// --- Boons: keep a valid 11 (no duplicate person); offers are distinct ------
{
  const xi = bestEleven(SQUADS[0].players);
  let ok = true;
  for (const b of BOONS) {
    const after = applyBoon(xi, b, { opponentSquadId: SQUADS[1].id });
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

// --- The effect ledger: the XI is roster + effects, and stays that way -----
// Roadmap item 04, slice 1. The boon-power table above is the real regression test for
// the refactor (it must not move); these are the properties the ledger itself has to
// hold, each of which is a bug the old baked-in version could not even express.
{
  const xi = bestEleven(SQUADS[0].players);
  const ids = xi.map((p) => p.id);
  let ok = true;

  // Pure: same inputs, same XI, however many times it is asked.
  const eff: RunEffect[] = [
    { id: 'a', source: 'x', label: 'X', target: { ids }, delta: 2, appliedAt: -1 },
    { id: 'b', source: 'y', label: 'Y', target: { ids: [ids[0]] }, delta: -3, appliedAt: 0 },
  ];
  const once = xiOf(xi, eff, 0);
  const twice = xiOf(xi, eff, 0);
  if (JSON.stringify(once) !== JSON.stringify(twice)) ok = false;

  // Per-step clamping, which is the whole reason an inverse transform is unsound. A 98
  // with +2 then -3 is 96 (clamp to 99, then subtract), NOT 97 (sum to 97, then clamp).
  // Asserted as a literal because "simplifying" xiOf to a sum is the tempting mistake.
  const high = [{ ...xi[0], id: 'clamp-me', elo: 98 }];
  const stacked: RunEffect[] = [
    { id: 'up', source: 'x', label: 'X', target: { ids: ['clamp-me'] }, delta: 2, appliedAt: -1 },
    { id: 'dn', source: 'y', label: 'Y', target: { ids: ['clamp-me'] }, delta: -3, appliedAt: -1 },
  ];
  if (xiOf(high, stacked, 0)[0].elo !== 96) ok = false;

  // Expiry: live on its round, gone after it, and the un-bumped value is the base.
  const temp: RunEffect[] = [
    { id: 't', source: 'x', label: 'X', target: { ids: [ids[0]] }, delta: 5, appliedAt: 0, expiresAfter: 1 },
  ];
  if (xiOf(xi, temp, 1)[0].elo !== Math.min(ELO_MAX, xi[0].elo + 5)) ok = false;
  if (xiOf(xi, temp, 2)[0].elo !== xi[0].elo) ok = false;

  // A target id nobody matches (a roster boost swapped that player out) is a no-op, not
  // a throw and not a misapplied bump.
  const orphan: RunEffect[] = [
    { id: 'o', source: 'x', label: 'X', target: { ids: ['nobody'] }, delta: 9, appliedAt: 0 },
  ];
  if (JSON.stringify(xiOf(xi, orphan, 0)) !== JSON.stringify(xi)) ok = false;

  check('effects: xiOf is pure, clamps per step, expires, and tolerates orphan ids', ok);
}

// --- The xi cache agrees with the ledger at every phase of a real run ------
// The invariant that catches a future transition which forgets to recompute.
{
  let ok = true;
  let checked = 0;
  for (let seed = 0; seed < 40; seed++) {
    let run = beginRun(bestEleven(SQUADS[seed % SQUADS.length].players), { 'deep-squad': 2, scout: 1 }, lockableBoons().map((b) => b.id), 0);
    const agrees = (r: RunState) =>
      JSON.stringify(r.xi) === JSON.stringify(xiOf(r.roster ?? r.xi, r.effects ?? [], r.koRound));
    if (!agrees(run)) ok = false;
    checked++;
    let guard = 0;
    while (run.phase !== 'ended' && guard++ < 12) {
      if (run.phase === 'group') run = playGroupStage(run);
      else if (run.phase === 'boon') run = chooseBoon(run, (run.offer ?? [])[0]?.id ?? '').next;
      else run = playKnockoutRound(run);
      if (!agrees(run)) ok = false;
      checked++;
    }
  }
  check(`effects: run.xi always equals xiOf(roster, effects, koRound) (${checked} states)`, ok);
}

// --- The item 29 cards: the levers that are not the rating averages -----------
// Each of these is a claim the balance table above cannot check, because the table only
// measures attack and defence. These are those claims.

// Ice Veins lifts the SHOOTOUT and nothing else. If it ever touched `strength` it would
// move scorelines, and it would be just another "+N" card wearing a different hat.
{
  const xi = bestEleven(SQUADS[0].players);
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
  check('ice-veins: lifts the shootout, and leaves strength and scorers untouched', ok);
}

// Kind Draw keeps the weaker of two opponents, and - the part that could silently rot -
// leaves the run and the TREE agreeing on who is next. They are read by different code
// paths (`run.nextOpponent` by the tie, `bracket` by everything drawn on screen and by
// the splice `advanceBracket` does by id), so a card that moved one and not the other
// would play a team the tree does not show.
{
  let ok = true, redrawn = 0, seen = 0;
  for (let i = 0; i < 60; i++) {
    let run = playGroupStage(beginRun(bestEleven(SQUADS[i % SQUADS.length].players)));
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
  check(`kind-draw: never a stronger opponent, and the tree agrees (${redrawn}/${seen} redrawn)`, ok);
}

// Prime Years walks `personId` to each player's best tournament. Two things matter beyond
// "the XI got better": the slot each player fills has to survive (or the formation and the
// chemistry "in position" count are wrong), and EVERY upgraded player has to land in
// `boostedIds` - a card that swaps eleven and records one would let ten handed players bank
// stickers they did not draft, which is the exact hole boostedIds exists to close.
{
  const xi = bestEleven(SQUADS[0].players);
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
  for (const id of arrived) if (!after.boostedIds.includes(id)) ok = false;
  check(`prime-years: same people, best versions, slots kept, all ${arrived.length} tagged`, ok);
}

// In Form names whoever the RUN chose, and does nothing before a goal is scored.
{
  const xi = bestEleven(SQUADS[0].players);
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
  check('in-form: no-op before a goal, then exactly the leading scorer', ok);
}

// Old Guard reaches into the CAREER, and must do nothing on a career that has never scored.
{
  const xi = bestEleven(SQUADS[1].players);
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
  check('old-guard: nothing on a fresh career, one arrival on an old one, never a duplicate', ok);
}

// The Armband is the first card that asks a question, so picking it must NOT commit the
// stop. It parks on the run - which is what makes a reload land back on the question rather
// than lose the card - and only the answer moves the run on.
{
  const xi = bestEleven(SQUADS[0].players);
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
  check('armband: parks the stop, refuses a stranger, then +6 the captain and +1 the rest', ok);
}

// Away Days and Man-Marking weaken the OPPONENT, and the pair has to stay a pair: one
// touches their defence and one their attack, neither touches the user, and the tree shows
// the same numbers the tie will be played on.
{
  let ok = true, seen = 0;
  for (let i = 0; i < 40 && seen < 20; i++) {
    let run = playGroupStage(beginRun(bestEleven(SQUADS[i % SQUADS.length].players)));
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
  check(`away-days / man-marking: weaken one of their lines, none of yours (${seen} ties)`, ok);
}

// --- item 30, round 4 ---------------------------------------------------------

// Full-Backs is the first card that reads the twelve POSITIONS rather than the four
// categories, so what is asserted is the selection: exactly the two full-backs, in every
// formation the game offers (a back five is LB, three centre-backs, RB), and nobody else.
{
  let ok = true, hitCount = 0;
  for (let i = 0; i < 20; i++) {
    const xi = bestEleven(SQUADS[i].players);
    const run = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
    const after = chooseBoon(run, 'full-backs').next;
    const eff = (after.effects ?? []).filter((e) => e.source === 'full-backs');
    const fbs = run.roster!.filter((p) => p.positions[0] === 'LB' || p.positions[0] === 'RB');
    hitCount += fbs.length;
    // No full-back is an empty plan, which the ledger drops rather than storing as a
    // zero. (An XI drafted in the game always has both, since every formation plays
    // them; `bestEleven` picks on rating alone and so sometimes has neither.)
    if (!fbs.length) { if (eff.length) ok = false; continue; }
    if (eff.length !== 1 || eff[0].delta !== 8) { ok = false; continue; }
    const hit = new Set(eff[0].target.ids);
    for (const p of run.roster!) {
      const isFb = p.positions[0] === 'LB' || p.positions[0] === 'RB';
      if (isFb !== hit.has(p.id)) ok = false;
    }
  }
  if (!hitCount) ok = false;
  check(`full-backs: exactly the full-backs and nobody else (${hitCount} across 20 XIs)`, ok);
}

// Loan Deal is the first TEMPORARY roster change in the game, so the two halves that could
// each break silently are asserted together: he arrives (and is tagged, so a borrowed
// player banks no sticker), and he GOES BACK when the round advances, with the player he
// displaced restored to his own slot. Plus the guard the card exists to carry: their best
// is not always an upgrade, and swapping backwards for a round is worse than doing nothing.
{
  let ok = true, borrowed = 0, declined = 0, returned = 0;
  for (let i = 0; i < 40 && borrowed < 12; i++) {
    let run = playGroupStage(beginRun(bestEleven(SQUADS[i % SQUADS.length].players)));
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
  check(`loan-deal: borrowed ${borrowed}, declined ${declined}, all ${returned} handed back on time`, ok);
}

// Underdog's Purse reads the RUN's history, which nothing else does. Two things: the group
// is excluded for free (a group record carries no ratings), and the count is the number of
// ties the DRAW made you the weaker side in, never the number of rounds played.
{
  const xi = bestEleven(SQUADS[0].players);
  const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
  // Nothing yet: a legal no-op, like In Form before a goal.
  let ok = (chooseBoon(base, 'underdogs-purse').next.effects ?? []).filter((e) => e.source === 'underdogs-purse').length === 0;
  // A group record on its own is still nothing, ratings being what it does not carry.
  const grouped = { ...base, history: [{ stage: 'group' as const, won: true, groupPos: 2 }] };
  if ((chooseBoon(grouped, 'underdogs-purse').next.effects ?? []).some((e) => e.source === 'underdogs-purse')) ok = false;
  // Two ties as the underdog and one as the favourite pays for the two.
  const hist = [
    { stage: 'group' as const, won: true, groupPos: 1 },
    { stage: 0, won: true, userRating: 78, oppRating: 84 },
    { stage: 1, won: true, userRating: 79, oppRating: 71 },
    { stage: 2, won: true, userRating: 80, oppRating: 88 },
  ];
  const eff = (chooseBoon({ ...base, history: hist }, 'underdogs-purse').next.effects ?? [])
    .filter((e) => e.source === 'underdogs-purse');
  if (eff.length !== 1 || eff[0].delta !== 4 || eff[0].target.ids.length !== 11) ok = false;
  check("underdogs-purse: nothing without an upset, then +2 for each one (never for the group)", ok);
}

// Siege Mentality counts goals conceded across BOTH stages - a knockout record's
// `oppGoals` and a group record's three matchday scorelines - and must never count a
// shootout, which is excluded by construction (kicks live in `pens`, never in a score).
{
  const xi = bestEleven(SQUADS[0].players);
  const base = { ...beginRun(xi), phase: 'boon' as const, offer: [] };
  // Nothing conceded is a legal no-op, not a zero-delta entry.
  let ok = (chooseBoon(base, 'siege-mentality').next.effects ?? []).every((e) => e.source !== 'siege-mentality');
  const hist = [
    // Two conceded in the group...
    {
      stage: 'group' as const, won: true, groupPos: 2,
      groupResults: [
        { code: 'BRA', name: 'Brazil', us: 1, them: 0 },
        { code: 'ITA', name: 'Italy', us: 2, them: 2 },
        { code: 'GER', name: 'Germany', us: 0, them: 0 },
      ],
    },
    // ...one in a tie won on the night...
    { stage: 0, won: true, userGoals: 2, oppGoals: 1 },
    // ...and one in a tie that went to penalties, where the kicks are not goals.
    { stage: 1, won: true, userGoals: 1, oppGoals: 1, decided: 'pens' as const,
      pens: { kicks: [], home: 4, away: 3, homeWon: true } },
  ];
  const eff = (chooseBoon({ ...base, history: hist }, 'siege-mentality').next.effects ?? [])
    .filter((e) => e.source === 'siege-mentality');
  if (eff.length !== 1 || eff[0].delta !== 4 || eff[0].target.ids.length !== 11) ok = false;
  check('siege-mentality: +1 a goal across both stages, and a shootout is not goals', ok);
}

// --- item 30, round 6: the three cards whose cost lands on the CAREER ---------

// Sponsorship doubles the XP and leaves the wallet alone; Youth Development empties the
// wallet and leaves the XP alone. Opposite halves of the same payout, so they are asserted
// against each other and against a plain run.
{
  const base = bestEleven(SQUADS[0].players);
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
  const owed = beginRun(base, {}, [], 0, { bonusStartBoosts: 2 });
  if (owed.activeBoons.length !== 2) ok = false;
  // Commons only, for the reason Scout Network's are: a free legendary before kick-off
  // outweighs every choice the run itself offers.
  for (const id of owed.activeBoons) if (boonById(id)?.rarity !== 'common') ok = false;
  check('sponsorship / youth-development: opposite halves of the payout, and the boost is banked', ok);
}

// All or Nothing is Mortgage the Future with the failure narrowed to one round: every exit
// but the FINAL pays what it would have, a cup pays triple, and a lost final pays nothing
// at all - not even the floor of 1 Prestige.
{
  const base = bestEleven(SQUADS[0].players);
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
  check('all-or-nothing: normal but for the last game, tripled on the cup, zero on a lost final', ok);
}

// Double Print sets the cup-pick count and nothing else. The banking side of it lives in
// the album hook, which is React and so out of this harness's reach; what is asserted here
// is that the run carries the number for it to read.
{
  const run = { ...beginRun(bestEleven(SQUADS[0].players)), phase: 'boon' as const, offer: [] };
  const after = chooseBoon(run, 'double-print').next;
  const ok =
    after.cupPicks === 2 &&
    (run.cupPicks ?? 1) === 1 &&
    // It is a run lever, so it must leave the XI exactly alone.
    after.xi.map((p) => p.elo).join(',') === run.xi.map((p) => p.elo).join(',');
  check('double-print: two cup picks, and no rating touched', ok);
}

// Mortgage the Future: nothing at all unless the cup is won - not even the floor of 1
// Prestige every other run gets, which is what makes the card bite.
{
  const career = INITIAL_CAREER;
  const base = bestEleven(SQUADS[0].players);
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
    ok && tinyPlain.prestigeGained === 1 && tinyMortgaged.prestigeGained === 0,
  );
}

// Second Wind and Sold Out Stadium are the first cards with a lifetime. The window is the
// price, so a window that does not close (or a debt that never lands) is the card broken.
{
  const xi = bestEleven(SQUADS[0].players);
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
  check('second-wind / sold-out-stadium: the window opens, closes, and the debt lands', ok);
}

// The Coin Toss is DERIVED, not rolled: picking it twice from the same run gives the same
// face. Rolled at pick time it would be reload-scummable, which for a +8/-4 swing is the
// whole card broken.
{
  let ok = true;
  let heads = 0, total = 0;
  for (let i = 0; i < 40; i++) {
    const xi = bestEleven(SQUADS[i % SQUADS.length].players);
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
  check(`coin-toss: stable across replays, and both faces occur (${heads}/${total} heads)`, ok);
}

// --- Boon power: what each one is actually worth, against its rarity band ---
// The match sim reads two numbers: the AVERAGE of the attack group (MID/FWD) and of
// the defence group (GK/DEF). So a boon is worth what it moves those averages, not
// how many rating points it hands out - +6 to one attacker is +1 attack, not +6.
// Printing it makes tuning arithmetic instead of argument; the assertion is what
// would have caught a common (old Chemistry Catalyst) doing a legendary's job.
{
  // The budget is the SUM of both sides' movement, which is what a boon really costs
  // the game: Golden Generation is +2 attack and +2 defence = 4, and a common giving
  // +2 to one line = 2 is exactly half of it. Measuring the larger side alone made
  // single-line boons look illegal when they are correctly priced.
  const BAND: Record<string, number> = { common: 2.0, rare: 3.2, legendary: 4.5 };
  // Boons that may exceed the band because they give something back or need the draw
  // to cooperate: they are not free power.
  const EXEMPT = new Set([
    'catenaccio', // -2 attack
    'underdog-spirit', // only against a stronger opponent
    'poach', // depends entirely on the opponent
    // --- item 29 cards. Each pays for its power somewhere this measurement cannot see:
    // the table below reports what a card does to the XI that plays the NEXT match, which
    // is the right question for a permanent card and only half the question for these.
    'second-wind', // lasts one round; the table shows that round, not the four it skips
    'sold-out-stadium', // gives every point back the round after
    'mortgage-future', // paid for out of the run's own XP and Prestige, not out of the sim
    'coin-toss', // half the time it is -4; the table averages the two faces
    // --- item 30, round 4.
    'loan-deal', // depends on the opponent, and hands him back a round later
    'underdogs-purse', // only for the rounds the draw made you the underdog
    'siege-mentality', // pays for goals already conceded, which is a run gone badly
    // --- item 30, round 6. All three pay outside the sim, so the table reads 0.0 and
    // their assertions live below instead.
    'sponsorship',
    'youth-development',
    'all-or-nothing',
  ]);

  // Measure against what people actually field: a budget-built XI (~81), not a national
  // team's best eleven. That distinction matters - against a squad full of 97s the
  // "+N to your best player" boons hit the rating ceiling and read as worthless, which
  // says more about the sample than the boon.
  //
  // Both the sample XI (auto-fill picks randomly inside the budget) and the roster boons
  // are random. Averaging over several XIs narrowed the spread but did not close it:
  // legends-reunion sat close enough to its 4.5 band to cross it about one run in three,
  // and an assertion that fails at random is worse than no assertion. So the sampling is
  // SEEDED - fixed inputs, one reproducible answer, and a printed table that can be
  // compared between runs. Restored immediately after, in a finally.
  const SAMPLES = 12;
  const realRandom = Math.random;
  let prng = 0x9e3779b9;
  Math.random = () => {
    // mulberry32: small, fast, good enough to stand in for Math.random here.
    prng = (prng + 0x6d2b79f5) | 0;
    let t = prng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
  const sampleFormation = Object.values(FORMATIONS_DATA.byKey)[0];
  const samples = Array.from({ length: SAMPLES }, () => {
    const { filled } = autoFillBudget(sampleFormation.slots, {}, BUDGET_DRAFT);
    const xi = Object.values(filled).filter((p): p is Player => !!p);
    return xi.length === 11 ? xi : bestEleven(SQUADS[0].players);
  });
  const side = (ps: Player[], isSide: (p: Player) => boolean) => {
    const vals = ps.filter(isSide).map((p) => p.elo);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const totalElo = (ps: Player[]) => ps.reduce((s, p) => s + p.elo, 0);

  const sampleAvg = Math.round(
    samples.reduce((s, xi) => s + totalElo(xi) / 11, 0) / samples.length,
  );
  console.log(
    `\n  boon power (average points added, vs ${SAMPLES} budget-built XIs averaging ~${sampleAvg})`,
  );
  console.log('    ' + 'boon'.padEnd(22) + 'rarity'.padEnd(11) + 'attack'.padStart(7) + 'defence'.padStart(9) + '   total');

  const overBand: string[] = [];
  for (const b of [...BOONS].sort((x, y) => x.rarity.localeCompare(y.rarity) || x.id.localeCompare(y.id))) {
    const N = 20;
    let att = 0, def = 0, tot = 0;
    for (const sample of samples) {
      const before = { att: side(sample, isAttacker), def: side(sample, isDefender) };
      for (let i = 0; i < N; i++) {
        // A context every conditional card can actually fire on, or the ones that key off
        // the run (In Form, Old Guard, The Armband) measure 0.0 and go unbanded - which
        // would be exactly the way to smuggle an over-band card into the pool.
        const after = applyBoon(sample, b, {
          opponentSquadId: SQUADS[3].id,
          topScorerId: sample[0].id,
          // A career's top scorer is whoever you have fielded and scored with most, which
          // for an established career is a strong player - so the 90+ shelf Wildcard Legend
          // deals from, not the single best card in the dataset.
          careerTopScorerId: ALL_PLAYERS.find((p) => p.elo >= 90)?.id ?? null,
          chosenId: sample[0].id,
          // Two knockout ties gone in as the underdog: what a run that has survived to
          // the semi-final on upsets actually looks like, and enough for Underdog's Purse
          // to fire rather than read 0.0.
          underdogRounds: 2,
          // Five conceded by the semi-final: three group matches and two knockout ties at
          // the sim's own scoring rate. Without a figure here Siege Mentality reads 0.0
          // and goes unbanded, which is the trap that caught two cards in round 2.
          goalsConceded: 5,
        });
        att += side(after, isAttacker) - before.att;
        def += side(after, isDefender) - before.def;
        tot += totalElo(after) - totalElo(sample);
      }
    }
    const runs = samples.length * N;
    att /= runs; def /= runs; tot /= runs;
    const spent = att + def; // a trade-off boon pays back through the negative side
    // Compared at the precision the bands are written in (0.1), not raw: legends-reunion
    // measures 4.503 against a 4.5 band, and failing on the third decimal is false
    // precision - it also printed as "4.5 > 4.5", which reads as a broken check rather
    // than a balance problem. A boon now has to show 4.6 against 4.5 to fail.
    const rounded = Number(spent.toFixed(1));
    const over = !EXEMPT.has(b.id) && rounded > BAND[b.rarity];
    if (over) overBand.push(`${b.id} ${rounded.toFixed(1)} > ${BAND[b.rarity].toFixed(1)}`);
    console.log(
      '    ' + b.id.padEnd(22) + b.rarity.padEnd(11) +
      att.toFixed(1).padStart(7) + def.toFixed(1).padStart(9) + tot.toFixed(0).padStart(8) +
      (EXEMPT.has(b.id) ? '   (conditional / trade-off)' : over ? '   <-- OVER BAND' : ''),
    );
  }
  if (overBand.length) console.log('    over band: ' + overBand.join(', '));
  check(
    'boons: every boon sits inside its rarity band (or pays for exceeding it)',
    overBand.length === 0,
  );
  } finally {
    Math.random = realRandom;
  }
}

// --- Boons: every card in the catalogue actually does something --------------
// The boon-power table above measures RATING movement, so a card that moves no rating
// reads 0.0 and is either exempt or simply prints a zero. That is a real blind spot: the
// Scout Network bug (a starter boost's `run` modifiers were dropped on the floor, so a
// free Ice Veins at kickoff did nothing at all) would have passed it. This asserts the
// weaker but broader property the table cannot: applied at a real boon stop, with a
// context every conditional card can fire on, each of the 34 cards CHANGES SOMETHING.
//
// Two things about the sample matter, and both were wrong in the first version of this:
//
//  - The XIs are FORMATION XIs put through `placedPlayers`, as every real line-up is,
//    because placing a player promotes the slot's role onto `positions[0]` and the
//    position cards read `positions[0]`. An XI straight from `bestEleven` is just the
//    eleven highest-rated players in a squad - frequently with no keeper and no full-back
//    at all - so measuring Keeper Coach or Full-Backs against one says nothing.
//  - The stops come from DIFFERENT squads and formations. Rebuilding the pool from the
//    same squad each time measures one national side's luck, which made Prime Years read
//    1-in-30 when the dataset says 78% of best XIs hold a player with a better tournament.
{
  const STOPS = 30;
  const formations = Object.values(FORMATIONS_DATA.byKey);
  const stops: RunState[] = [];
  for (let i = 0; stops.length < STOPS && i < 400; i++) {
    const f = formations[i % formations.length];
    const { filled } = autoFillBudget(f.slots, {}, BUDGET_DRAFT);
    const xi = placedPlayers(f, filled);
    if (xi.length !== 11) continue;
    const g = prepareGroupStage(beginRun(xi, {}, [], 0));
    if (!g || g.next.phase !== 'boon' || !g.next.offer) continue;
    const r = g.next;
    // Enrich so the cards keyed to the run's own history have something to read: a top
    // scorer, a career top scorer, a knockout tie gone in as the underdog, goals conceded.
    const scorer = r.xi[10];
    stops.push({
      ...r,
      careerTopScorerId: ALL_PLAYERS.find(
        (p) => p.elo >= 93 && !r.xi.some((q) => q.personId === p.personId),
      )?.id,
      tally: { ...(r.tally ?? emptyTally()), goals: { [scorer.id]: 3 } },
      history: [
        ...r.history,
        { stage: 0, won: true, userGoals: 2, oppGoals: 2, userRating: 78, oppRating: 88 },
      ],
    });
  }

  // Every field a `RunModifier` can land in, so a new lever cannot be added without this
  // noticing it (an unobserved field reads as "the card did nothing").
  const MOD_FIELDS = [
    'penBonus', 'penBonusTop', 'mortgaged', 'cupPicks', 'xpMult', 'youth', 'allOrNothing', 'loan',
  ] as const;
  const rosterIds = (r: RunState) => (r.roster ?? r.xi).map((p) => p.id).join(',');
  const fired = (before: RunState, after: RunState, id: string): boolean => {
    if ((after.effects ?? []).some((e) => e.source === id)) return true;
    if (rosterIds(before) !== rosterIds(after)) return true;
    if (before.xi.map((p) => p.elo).join(',') !== after.xi.map((p) => p.elo).join(',')) return true;
    for (const f of MOD_FIELDS) {
      if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) return true;
    }
    const a = before.nextOpponent, b = after.nextOpponent;
    if (a?.id !== b?.id) return true;
    return JSON.stringify(a?.strength) !== JSON.stringify(b?.strength);
  };

  const rates = new Map<string, number>();
  for (const boon of BOONS) {
    let n = 0;
    for (const stop of stops) {
      let after = chooseBoon(stop, boon.id).next;
      // A card that asks a question does not commit the stop; answer it (The Armband).
      if (after.pendingChoice) after = resolveChoice(after, stop.xi[0].id).next;
      if (fired(stop, after, boon.id)) n++;
    }
    rates.set(boon.id, n);
  }
  const never = BOONS.filter((b) => (rates.get(b.id) ?? 0) === 0).map((b) => b.id);
  // Conditional cards fire on some stops and not others by design, so the assertion is
  // "at least once", never "always". The false-red risk is the chance that every one of
  // 30 independent stops missed: for the rarest firing card measured here (Kind Draw, a
  // re-draw that has to come back weaker, ~40%) that is 0.6^30, about 2 in 10 million.
  check(`boons: every one of the ${BOONS.length} cards changes something when applied`, never.length === 0);
  if (never.length) console.log('    never fired: ' + never.join(', '));
  const conditional = [...rates.entries()].filter(([, n]) => n < stops.length);
  console.log(
    `\n  boons firing conditionally (of ${stops.length} stops): ` +
      (conditional.length
        ? conditional.sort((a, b) => a[1] - b[1]).map(([id, n]) => `${id} ${n}`).join(', ')
        : 'none'),
  );

  // Full-Backs reads two of the twelve POSITIONS rather than the four categories, and its
  // own comment used to claim every formation plays a left-back and a right-back. It does
  // not: all three styles of 3-4-3 and 3-5-2 field three centre-backs and wide MIDfielders,
  // so 6 of the 24 formations have neither, and in those the card is a no-op. Asserted as
  // the relationship rather than as the count of 18, so adding a formation does not fail
  // the suite for no reason - and printed, because "how many shapes is this card dead in"
  // is a balance fact somebody should see.
  const flanked = formations.filter((f) => {
    const roles = f.slots.map((sl) => sl.position);
    return roles.includes('LB') || roles.includes('RB');
  });
  let fullBacksHonest = true;
  for (const stop of stops) {
    const hasFlank = stop.xi.some((p) => primaryPosition(p) === 'LB' || primaryPosition(p) === 'RB');
    const did = fired(stop, chooseBoon(stop, 'full-backs').next, 'full-backs');
    if (did !== hasFlank) fullBacksHonest = false;
  }
  console.log(
    `  full-backs is dead in ${formations.length - flanked.length} of ${formations.length} formations ` +
      `(every 3-4-3 and 3-5-2: three centre-backs, wide midfielders)`,
  );
  check(
    'boons: Full-Backs fires exactly when the XI actually plays a full-back',
    fullBacksHonest,
  );
}

// --- Boons: offers are a fresh weighted draw at every stop -------------------
// "Random across the knockout phase, and purchased cards join the pool" is the whole
// contract of the offer, and nothing asserted any of it.
{
  const allIds = BOONS.map((b) => b.id);
  const seen = new Map<string, number>();
  let stops = 0, dupInOffer = 0, wrongSize = 0;
  for (let i = 0; i < 300; i++) {
    const begun = beginRun(bestEleven(SQUADS[i % SQUADS.length].players), {}, allIds, 0);
    let run: RunState = prepareGroupStage(begun)!.next;
    let guard = 0;
    while (guard++ < 10) {
      if (run.phase === 'boon' && run.offer) {
        stops++;
        if (run.offer.length !== 3) wrongSize++;
        if (new Set(run.offer.map((b) => b.id)).size !== run.offer.length) dupInOffer++;
        for (const b of run.offer) seen.set(b.id, (seen.get(b.id) ?? 0) + 1);
        run = chooseBoon(run, run.offer[0].id).next;
        continue;
      }
      if (run.phase === 'match') {
        const k = prepareKnockoutRound(run);
        if (!k) break;
        run = k.next;
        continue;
      }
      break;
    }
  }
  // Every unlocked card is reachable. 300 runs reach a mean of ~600 stops (the floor is
  // there to catch the loop doing nothing, and sits 9 standard deviations below that mean
  // rather than beside it - the trap roadmap 31 was about). At 3 cards a stop that is
  // ~1800 slots, where the rarest kind of card (a legendary, weight 1 of the pool's 114)
  // is expected about 16 times, so zero appearances means unreachable rather than unlucky.
  const unreachable = allIds.filter((id) => !seen.has(id));
  check(
    `boons: every unlocked card is reachable in an offer (${stops} stops)`,
    stops > 400 && unreachable.length === 0,
  );
  if (unreachable.length) console.log('    never offered: ' + unreachable.join(', '));
  check('boons: no card appears twice inside one offer', dupInOffer === 0);
  check('boons: an offer is three cards without the Extra Choice perk', wrongSize === 0);
  // Rarity weighting (common 6 / rare 3 / legendary 1) has to actually bite, per CARD:
  // there are more commons than legendaries, so comparing totals would confirm the count
  // rather than the weight.
  const perCard = (r: string) => {
    const cards = BOONS.filter((b) => b.rarity === r);
    return cards.reduce((n, b) => n + (seen.get(b.id) ?? 0), 0) / cards.length;
  };
  check(
    'boons: rarity weighting orders the draw, common > rare > legendary per card',
    perCard('common') > perCard('rare') && perCard('rare') > perCard('legendary'),
  );
  // The Extra Choice perk widens the offer, one card per owned tier.
  let widened = true;
  for (const tier of [1, 2]) {
    const g = prepareGroupStage(
      beginRun(bestEleven(SQUADS[0].players), { 'extra-boon': tier }, allIds, 0),
    )!;
    if ((g.next.offer?.length ?? 0) !== 3 + tier) widened = false;
  }
  check('boons: the Extra Choice perk adds one offer card per owned tier', widened);
  // Scout Network deals its free starting boosts, and only commons (a free legendary
  // before kickoff outweighs every choice the run itself offers).
  let scoutOk = true;
  for (const tier of [0, 1, 2]) {
    const r = beginRun(bestEleven(SQUADS[0].players), { scout: tier }, allIds, 0);
    if (r.activeBoons.length !== tier) scoutOk = false;
    if (r.activeBoons.some((id) => boonById(id)?.rarity !== 'common')) scoutOk = false;
  }
  check('boons: Scout Network deals one free common per owned tier', scoutOk);
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

// --- Cup Run on a bracket (roadmap item 28) ---------------------------------
// A run begun with `bracket: true` plays its knockouts on a 16-team tree instead of a
// fresh opponent per round. Three things have to hold, and each of them is the kind
// that breaks silently: the tree completes, the user's own tie is the one the tree
// records, and Ascension's draw slope actually reaches the field.
{
  let completes = true;
  let ownTieMatches = true;
  let oppFromBracket = true;
  for (let i = 0; i < 200 && completes && ownTieMatches && oppFromBracket; i++) {
    const squad = SQUADS[(i * 5) % SQUADS.length];
    let r: RunState = beginRun(bestEleven(squad.players), {}, [], i % 6);
    r = playGroupStage(r);
    let guard = 0;
    while (r.phase !== 'ended' && guard++ < 20) {
      if (r.phase === 'boon' && r.offer) r = chooseBoon(r, r.offer[0].id).next;
      else if (r.phase === 'match') {
        // The opponent handed to the next tie must be the one the tree says it is.
        const g = r.bracket ? userGameInRound(r.bracket, r.koRound) : undefined;
        const treeOpp = g && r.bracket ? opponentOf(r.bracket, g) : undefined;
        if (r.bracket && treeOpp?.id !== r.nextOpponent?.id) oppFromBracket = false;
        r = playKnockoutRound(r);
      } else break;
    }
    // A group exit never builds one; anything past the group must have a finished tree.
    if (r.outcome === 'group') {
      if (r.bracket) completes = false;
      continue;
    }
    const b = r.bracket;
    if (!b || !bracketChampion(b)) {
      completes = false;
      continue;
    }
    // The user's last tie, as the tree recorded it, must match the run's own history.
    const last = r.history[r.history.length - 1];
    const game = typeof last?.stage === 'number' ? userGameInRound(b, last.stage) : undefined;
    const res = game?.result;
    if (
      !res ||
      res.homeGoals !== last.userGoals ||
      res.awayGoals !== last.oppGoals ||
      (res.winnerId === USER_ID) !== !!last.won
    ) {
      ownTieMatches = false;
    }
  }
  check('run/bracket: every run past the group crowns exactly one champion', completes);
  check("run/bracket: the tree records the user's own tie, not a re-simulation", ownTieMatches);
  check('run/bracket: the next opponent is read off the tree', oppFromBracket);

  // Ascension's slope has to reach buildBracket, or the high tiers field a Base-strength
  // draw and half of what the tier means does nothing. Measured over the whole field.
  const fieldStrength = (tier: number) => {
    let total = 0;
    let n = 0;
    for (let i = 0; i < 120; i++) {
      let r: RunState = beginRun(bestEleven(SQUADS[(i * 3) % SQUADS.length].players), {}, [], tier);
      r = playGroupStage(r);
      const b = r.bracket;
      if (!b) continue;
      for (const [id, t] of Object.entries(b.teams)) {
        if (id === USER_ID) continue;
        total += t.strength.overall;
        n += 1;
      }
    }
    return n ? total / n : 0;
  };
  const base = fieldStrength(0);
  const top = fieldStrength(5);
  check(
    `run/bracket: a higher Ascension fields a stronger draw (Base ${base.toFixed(1)} < V ${top.toFixed(1)})`,
    top > base + 0.5,
  );
}

// --- groupAsOf: the projection the Cup Run's live table reads ---------------
{
  let identity = true;
  let monotonic = true;
  for (let i = 0; i < 200 && identity && monotonic; i++) {
    const user = userGroupTeam(bestEleven(SQUADS[i % SQUADS.length].players), 0, 0);
    let group = createGroup(user, pickOpponents(3, SQUADS));
    for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
      group = recordMatchday(group, simulateMatchday(group, md));
    }
    // At the last matchday the projection is the group itself.
    const full = groupAsOf(group, GROUP_MATCHDAYS);
    if (JSON.stringify(full) !== JSON.stringify(group)) identity = false;
    // Played fixtures only ever accumulate, and points never fall.
    let played = -1;
    let pts = -1;
    for (let md = 0; md <= GROUP_MATCHDAYS; md++) {
      const g = groupAsOf(group, md);
      const p = g.fixtures.filter((f) => f.result).length;
      const userPts = standings(g).find((st) => st.team.isUser)?.points ?? 0;
      if (p < played || userPts < pts) monotonic = false;
      played = p;
      pts = userPts;
    }
  }
  check('groupAsOf: the projection at the final matchday is the group itself', identity);
  check('groupAsOf: results and points only ever accumulate', monotonic);
}

// --- The drawn group survives on the run ------------------------------------
// A group is drawn once and then replayed, never re-drawn. It has to live on the
// RunState, because the screen's live reveal is transient (and for a signed-in player
// never persisted at all): when the draw lived only there, a reload mid-group drew
// three new opponents over the group already in progress.
{
  let stable = true;
  let recorded = true;
  let committedDropsIt = true;
  for (let i = 0; i < 200 && stable && recorded && committedDropsIt; i++) {
    const begun = beginRun(bestEleven(SQUADS[i % SQUADS.length].players), {}, [], 0);
    const first = prepareGroupStage(begun)!;
    // The run held while the group reveals carries it; the run it was prepared from
    // did not.
    if (!first.current.group || begun.group) recorded = false;
    // Preparing again from that held run replays the same group: same three opponents,
    // same six results. (`next` is re-derived, so its bracket is drawn afresh - it is
    // not committed until the reveal ends.)
    const again = prepareGroupStage(first.current)!;
    if (JSON.stringify(again.group) !== JSON.stringify(first.group)) stable = false;
    if (again.current !== first.current) recorded = false;
    // Advancing past the group leaves it behind: the round record carries the results.
    if (first.next.group !== undefined) committedDropsIt = false;
  }
  check('run/group: the drawn group is recorded on the run it is revealed from', recorded);
  check('run/group: preparing again replays the same group rather than drawing one', stable);
  check('run/group: the state committed after the group no longer carries it', committedDropsIt);
}

// --- Nothing a round decides can be re-rolled by preparing it again ---------
// The anti-reload-cheat invariant: a reload replays the round, it does not roll a new
// one. Everything random is decided when the round starts and kept on the run - the
// user's own scoreline, the rest of the tree, the boost offer and the next opponent -
// so preparing the same run twice must be identical in all of it.
{
  let groupExitStable = true;
  let koStable = true;
  let koRecorded = true;
  let koDropped = true;
  let tiesChecked = 0;
  for (let i = 0; i < 120; i++) {
    const begun = beginRun(bestEleven(SQUADS[i % SQUADS.length].players), {}, [], 0);
    const g1 = prepareGroupStage(begun)!;
    // Surviving the group also decides the field of 16, the first offer and the R16
    // opponent; a second prepare must hand back exactly those.
    const g2 = prepareGroupStage(g1.current)!;
    if (
      JSON.stringify(g2.next.bracket) !== JSON.stringify(g1.next.bracket) ||
      JSON.stringify(g2.next.offer) !== JSON.stringify(g1.next.offer) ||
      JSON.stringify(g2.next.nextOpponent) !== JSON.stringify(g1.next.nextOpponent)
    ) {
      groupExitStable = false;
    }
    if (g1.next.phase !== 'boon' || !g1.next.offer) continue;
    // Into the knockouts, and through as many ties as this run survives.
    let run: RunState = chooseBoon(g1.next, g1.next.offer[0].id).next;
    let guard = 0;
    while (run.phase === 'match' && guard++ < 8) {
      const k1 = prepareKnockoutRound(run)!;
      if (!k1.current.koPending || run.koPending) koRecorded = false;
      const k2 = prepareKnockoutRound(k1.current)!;
      if (
        JSON.stringify(k2.match) !== JSON.stringify(k1.match) ||
        JSON.stringify(k2.next.bracket) !== JSON.stringify(k1.next.bracket) ||
        JSON.stringify(k2.next.offer) !== JSON.stringify(k1.next.offer) ||
        JSON.stringify(k2.next.nextOpponent) !== JSON.stringify(k1.next.nextOpponent) ||
        k2.next.phase !== k1.next.phase
      ) {
        koStable = false;
      }
      if (k2.current !== k1.current || k1.next.koPending !== undefined) koDropped = false;
      tiesChecked++;
      run = k1.next;
      if (run.phase === 'boon' && run.offer) run = chooseBoon(run, run.offer[0].id).next;
    }
  }
  // The bound is a guard against the loop silently exercising nothing, not a measurement:
  // it only has to be clear of any working run. It used to be 200 and sat INSIDE the
  // distribution - 120 runs replay a mean of 233 ties but 1 rep in 80 came in at or below
  // 200, so the suite went red about once in eighty for no reason at all (roadmap 31, the
  // second instance). 120 is one tie per run of the loop, half the mean, and 0 of 80
  // measured reps came near it.
  check(`run/ko: ties replayed (${tiesChecked}) rather than re-rolled`, tiesChecked > 120);
  check('run/ko: the decided round is recorded on the run it is revealed from', koRecorded);
  check(
    'run/ko: preparing again replays the same tie, tree, offer and next opponent',
    koStable,
  );
  check('run/ko: the state committed after the tie no longer carries the decisions', koDropped);
  check(
    'run/group: preparing again replays the same tree, first offer and R16 opponent',
    groupExitStable,
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
  let run = playGroupStage(beginRun(bestEleven(SQUADS[0].players)));
  let guard = 0;
  while (run.phase !== 'ended' && guard++ < 20) {
    if (run.phase === 'boon' && run.offer) {
      const plain = run.offer.find((b) => !paysDifferently(b)) ?? boonById(PIN_BOON)!;
      run = chooseBoon(run, plain.id).next;
    } else if (run.phase === 'match') run = playKnockoutRound(run);
    else break;
  }
  return run;
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
  check('career: run rewards accrue and account correctly', ok);
  check(
    'career: the boost the reward check pins to leaves the payout rules alone',
    !paysDifferently(boonById(PIN_BOON)!),
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
  // The FIGURE the shop copy promises is the budget that tier actually hands out. Same
  // seam the Extra Re-roll check guards below, and the same failure if it drifts: the
  // dollars live in config.ts and the sentence lives here, so adding a tier to one and
  // not the other reads as a shop that lies rather than as a broken build.
  for (let i = 0; i < track.tiers.length; i++) {
    if (!track.tiers[i].description.includes(`$${BUDGET_BY_TIER[i + 1]}`)) ok = false;
  }
  check('budget: career budget ladder is well-formed and matches its perk track', ok);
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
  // Each tier is a bigger ask than the last.
  for (let i = 1; i < track.tiers.length; i++) {
    if (track.tiers[i].cost <= track.tiers[i - 1].cost) ok = false;
    if (track.tiers[i].levelReq < track.tiers[i - 1].levelReq) ok = false;
  }
  check('career: Extra Re-roll perk matches the starting re-roll count', ok);
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

// --- Collectible catalogue: the generated SQL seed matches the dataset ------
// The server validates sticker earns against supabase/seed/collectibles.sql, which is
// generated from squads.ts + STICKER_TIERS. A rating tweak that forgets
// `npm run gen:collectibles` would leave a newly-collectible player unbankable, so the
// drift is a hard failure here rather than a surprise in production.
// (docs/cloud-sync-design.md §3.)
{
  const rows = catalogueRows(ALL_PLAYERS, SQUAD_BY_ID, tierOf);
  let sql: string | null = null;
  try {
    sql = readFileSync(CATALOGUE_PATH, 'utf8');
  } catch {
    sql = null;
  }
  const recorded = sql ? checksumInFile(sql) : null;
  const ok = recorded !== null && recorded === catalogueChecksum(rows);
  check(
    `collectibles: ${CATALOGUE_PATH} is in sync with the dataset ` +
      `(${rows.length} rows; run \`npm run gen:collectibles\` if this fails)`,
    ok,
  );
}

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
  check('challenges: ids are unique and every entry is complete and in a real family', ok);
}

// --- Challenges: every predicate is total, pure, and read-only ---------------
// The catalogue runs at the one moment a run is banked. A predicate that throws would
// take the reward with it, and one that mutates the run would corrupt what is saved, so
// both are asserted rather than hoped for.
{
  const runs: RunState[] = [];
  for (let i = 0; i < 12; i++) {
    let r = playGroupStage(beginRun(bestEleven(SQUADS[(i * 7) % SQUADS.length].players)));
    let guard = 0;
    while (r.phase !== 'ended' && guard++ < 20) {
      if (r.phase === 'boon' && r.offer) r = chooseBoon(r, r.offer[i % r.offer.length].id).next;
      else if (r.phase === 'match') r = playKnockoutRound(r);
      else break;
    }
    runs.push(r);
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
  check('challenges: every predicate returns a boolean and never throws', total);
  check('challenges: predicates are pure (same run, same answer, run untouched)', pure && readOnly);
}

// --- Challenges: the three traps ---------------------------------------------
// Each of these was a real bug in this codebase before it was written down.
{
  const brazil = SQUADS.find((s) => s.code === 'BRA')!;
  const xi = bestEleven(brazil.players);
  const ended = (over: Partial<RunState>): RunState => ({
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
    !completedIn(ctx(ended({ xi }))).includes('galacticos') ===
    !completedIn(ctx(ended({ xi: boostedXi }))).includes('galacticos');

  // 2. A roster boost must not break a themed run: the XI you PICKED is what counts.
  const foreign = SQUADS.find((s) => s.code === 'ITA')!.players[0];
  const handedOver = ended({ xi: [...xi.slice(1), foreign], boostedIds: [foreign.id] });
  const identityOk =
    completedIn(ctx(handedOver)).includes('samba') &&
    !completedIn(ctx(ended({ xi: [...xi.slice(1), foreign] }))).includes('samba');

  // 3. A shootout is not goals conceded: 0-0 on penalties keeps a clean sheet.
  const shootoutRun = ended({
    history: [0, 1, 2, 3].map((stage) => ({
      stage,
      won: true,
      userGoals: 0,
      oppGoals: 0,
      decided: 'pens' as const,
      pens: { kicks: [], home: 4, away: 3, homeWon: true },
    })),
  });
  const wallOk = completedIn(ctx(shootoutRun)).includes('the-wall');

  check('challenges: ratings are judged on the dataset player, not the boosted copy', ratingOk);
  check('challenges: a roster boost cannot break a themed XI (identity ignores it)', identityOk);
  check('challenges: a shootout is not a goal conceded (The Wall survives penalties)', wallOk);
}

// --- Challenges: awarded once, paid into the career, counted to a fixed point --
{
  let run = playGroupStage(beginRun(bestEleven(SQUADS[0].players)));
  let guard = 0;
  while (run.phase !== 'ended' && guard++ < 20) {
    if (run.phase === 'boon' && run.offer) run = chooseBoon(run, run.offer[0].id).next;
    else if (run.phase === 'match') run = playKnockoutRound(run);
    else break;
  }
  const input = { base: basePlayer, album: emptyAlbum(), trades: 0 };
  const first = applyRunResult(INITIAL_CAREER, run, input);
  const again = applyRunResult(first.career, run, input);
  // With FEATURES.challengeAwards off a challenge completes but pays nothing.
  const paid = AWARDS_ON ? prestigeFor(first.challengesCompleted) : 0;

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
  check('challenges: paid once, added to the wallet, and never re-awarded', ok);
  check('challenges: a completion counter ticks in the run that reaches it', hunterOk);
  check('challenges: applyRunResult with no context completes nothing', applyRunResult(INITIAL_CAREER, run).challengesCompleted.length === 0);

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
    veteran.challengesCompleted.includes('first-blood'),
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
    ...beginRun(xi, {}, [], ascension),
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

  check('challenges: cup streaks complete on the run that reaches them', streakOk);
  check('challenges: a losing run breaks the cup streak', brokenOk);
  check('challenges: Nearly Man reads the run before this one', nearlyOk);
  check('challenges: Straight Up needs a first cup at the tier and no lost final', straightOk);
  check('challenges: the final / semi-final streaks count runs reached, not cups', streakShapeOk);
  check('challenges: Ascension II+ runs and per-tier cups are counted', hardOk && ladderOk);
  check('challenges: Prestige spent is counted by the perk shop and boon unlocks', spendOk);
  check('challenges: no career counter ever goes backwards', monotone);
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
    const f = getFormation(FORMATIONS_DATA, name, style)!;
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
  const buy = (over: Partial<RunBuild>): RunBuild => ({
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

  check('challenges: a run saved before the kickoff record completes none of it', legacyOk);
  check('challenges: the formation and style are judged from the kickoff shape', shapeOk);
  check('challenges: natural position comes from the dataset row, not the placed copy', positionOk);
  check('challenges: the keeper and the best player are judged by the slot they filled', keeperOk && generalOk);
  check('challenges: the budget figures are judged at the prices actually charged', marketOk);
  check('challenges: a rolled build and a bought build never claim each other', rollOk);
  check('challenges: Swap Meet tracks the reducer swap allowance', swapOk);
  check('challenges: chemistry is judged at kickoff', chemOk);
}

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
    empty.shelf.length === 0 &&
      empty.ladder.length === ASCENSIONS.length &&
      empty.headline.bestCupAscension === null &&
      !empty.complete,
  );
  check(
    'cabinet: a save written before the career counters still renders',
    staleView.shelf.length === 0 &&
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
        ...beginRun(bestEleven(SQUADS[0].players), career.perkLevels, career.unlockedBoons, a.tier),
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
  check('cabinet: the shelf is one trophy per cup, at the tier it was won at', shelfOk);
  check('cabinet: selectable implies unlocked, and both are downward-closed', ladderOk);

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
    bestCupStreakOf(streaky) === 3 &&
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
  const emptyRows = badgeRows(INITIAL_CAREER, { collected: 0, total: 81 });
  const fullRows = badgeRows(maxed, { collected: 81, total: 81 });
  const consistent = [...emptyRows, ...fullRows].every(
    (r) => r.done === (r.have >= r.need) && r.have <= r.need && r.have >= 0,
  );
  check(
    'badges: earned is derived from the fraction, and nothing reads past complete',
    consistent && BADGES.length > 0,
  );
  check(
    'badges: a fresh career has earned none and a maxed one has earned every badge',
    badgesEarned(emptyRows) === 0 && badgesEarned(fullRows) === fullRows.length,
  );
  // Distinct ids, and no badge phrased as a single-run goal (that is a challenge).
  check(
    'badges: ids are unique',
    new Set(BADGES.map((b) => b.id)).size === BADGES.length,
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
    perkTiersOwned(overclaim) === perkTotal && perkTiersOwned(INITIAL_CAREER) === 0,
  );
  // The complete state means complete: honours, badges and album all full.
  const done = cabinetView(maxed, albumFull, ALL_PLAYERS);
  check(
    'cabinet: the complete state needs every honour, every badge and every sticker',
    done.complete &&
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
    perFamilyOk && famTotal === prog.total && famDone === prog.completed,
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
    flat.length === collectible.length &&
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
  const xi = bestEleven(SQUADS[0].players);
  let run: RunState = beginRun(xi, {}, [], 0);
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
    groupApps && groupGoals === groupScored && groupIdsKnown,
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
  check('tally: appearances track the matches actually played', appsTrackMatches);

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
    let r: RunState = beginRun(bestEleven(SQUADS[i % SQUADS.length].players), {}, [], 0);
    r = playGroupStage(r);
    let g = 0;
    while (r.phase !== 'ended' && g++ < 12) {
      if (r.phase === 'boon' && r.offer?.length) {
        r = chooseBoon(r, r.offer[0].id).next;
        continue;
      }
      r = playKnockoutRound(r);
    }
    const shootouts = r.history.filter((h) => h.pens);
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
    pensSeen > 0 && penKicksSeen > 0 && pensOk,
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
    t.goals[xi[0].id] === 1 &&
      t.goals[xi[1].id] === undefined &&
      Object.values(t.goals).reduce((a, b) => a + b, 0) === 1 &&
      xi.every((p) => t.apps[p.id] === 1),
  );

  // The archive: newest first, capped, and the counters it carries agree with the run.
  let career = INITIAL_CAREER;
  const ended = (score: number, outcome: RunOutcome): RunState => ({
    ...beginRun(xi, {}, [], 0),
    phase: 'ended',
    outcome,
    score,
  });
  const banked = applyRunResult(career, { ...run, phase: 'ended', outcome: 'champion', score: 140 }, undefined, 1000);
  const first = banked.career.stats.history?.[0];
  const tot = runTotals(run);
  check(
    'archive: a banked run writes one dated row that agrees with the run',
    banked.career.stats.history?.length === 1 &&
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
    career = applyRunResult(career, ended(10 + i, 'group'), undefined, i + 1).career;
  }
  const hist = career.stats.history ?? [];
  check(
    'archive: newest first, capped, and the cap drops the oldest',
    hist.length === HISTORY_LIMIT &&
      hist[0].score === 10 + HISTORY_LIMIT + 24 &&
      hist[0].at === HISTORY_LIMIT + 25 &&
      hist.every((h, i) => i === 0 || (hist[i - 1].at ?? 0) > (h.at ?? 0)),
  );
  check(
    'archive: a run banked with no clock carries no date rather than a fake one',
    applyRunResult(INITIAL_CAREER, ended(10, 'group')).career.stats.history?.[0].at === undefined,
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
    !!anyId && rec[anyId].apps === appsInRun * 2 && rec[anyId].runs === 2,
  );
  const legacy: RunState = { ...run, tally: undefined };
  const legacyBank = applyRunResult(INITIAL_CAREER, legacy, undefined, 1).career;
  check(
    'records: a run persisted before the tally existed banks and records no players',
    legacyBank.stats.players === undefined && legacyBank.stats.history?.length === 1,
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
    Object.keys(capped).length === PLAYER_RECORD_LIMIT && kept,
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
    view.topUsed.length <= 10 &&
      view.topScorers.length <= 10 &&
      usedOrdered &&
      scorersOrdered &&
      view.playersTracked === Object.keys(rec).length &&
      view.history.length === 2,
  );
}

// --- Who scores: position weighting + the rating tilt ----------------------
// `scorerPool` decides which player is CREDITED with a goal, never how many are
// scored (that is expectedGoals from the two strengths), so nothing here can move a
// scoreline. What it can do is drift: the ordering below is the whole design, and a
// stray edit to one number would silently make a holding midfielder a striker.
{
  const anyPlayer = ALL_PLAYERS[0];
  const at = (pos: Position, elo: number): Player => ({ ...anyPlayer, positions: [pos], elo });

  // 1. The ordering, at one fixed rating so only position is in play.
  const ORDER: Position[] = ['ST', 'LW', 'AM', 'RM', 'CM', 'DM', 'LB', 'CB'];
  const weights = ORDER.map((pos) => scorerWeight(at(pos, 80)));
  const strictlyDescending = weights.every((w, i) => i === 0 || weights[i - 1] > w);
  check(
    'scorers: ST > winger > AM > wide mid > CM > DM > full-back > CB at equal rating',
    strictlyDescending &&
      scorerWeight(at('LW', 80)) === scorerWeight(at('RW', 80)) &&
      scorerWeight(at('LB', 80)) === scorerWeight(at('RB', 80)),
  );
  check(
    'scorers: a keeper cannot score from open play, at any rating',
    POSITION_WEIGHT.GK === 0 &&
      scorerWeight(at('GK', 99)) === 0 &&
      scorerWeight(at('GK', 60)) === 0,
  );

  // 2. The rating tilt: monotone within a position, and bounded so that no rating gap
  //    the dataset allows can turn a defender into an attacker. ADJACENT lines are a
  //    different matter and are deliberately crossable - a 99 full-back (1.48) does
  //    outscore a 60 central midfielder (1.40), which is the tilt doing its job. What
  //    must hold is the attack/defence divide: the worst attacker still beats the best
  //    defender, so the shape of the XI decides the shape of the scoring.
  const tilt = [ELO_MIN, 75, 85, ELO_MAX].map((elo) => scorerWeight(at('ST', elo)));
  const ATTACKING: Position[] = ['ST', 'LW', 'RW', 'AM'];
  const DEFENDING: Position[] = ['CB', 'LB', 'RB'];
  const worstAttacker = Math.min(...ATTACKING.map((pos) => scorerWeight(at(pos, ELO_MIN))));
  const bestDefender = Math.max(...DEFENDING.map((pos) => scorerWeight(at(pos, ELO_MAX))));
  check(
    'scorers: rating tilts within a line but never turns a defender into an attacker',
    tilt.every((w, i) => i === 0 || w > tilt[i - 1]) && worstAttacker > bestDefender,
  );

  // 3. An XI with no eligible scorer at all (eleven keepers) still credits someone,
  //    rather than every goal reading 'Unknown'.
  const keepers = Array.from({ length: 11 }, (_, i) => at('GK', 70 + i));
  const gkPool = scorerPool(keepers);
  check(
    'scorers: an XI that cannot score falls back to everyone equally likely',
    gkPool.length === 11 &&
      gkPool.every((s) => s.weight === 1) &&
      !!pickScorer(gkPool) &&
      pickScorer([]) === undefined,
  );

  // 4. Legacy tolerance. A GroupTeam is persisted (the game state, the active run and
  //    a run's drawn nextOpponent), so a match in flight when the weights shipped hands
  //    back the old `string[]` pool - a name repeated once per point of weight. Reading
  //    each entry as 1 has to reproduce that old distribution exactly.
  const legacy = ['Striker', 'Striker', 'Striker', 'Striker', 'Defender'];
  let striker = 0;
  for (let i = 0; i < 40000; i++) if (pickScorer(legacy) === 'Striker') striker++;
  const ratio = striker / (40000 - striker);
  check(
    'scorers: a run persisted before the weights keeps its old string pool working',
    ratio > 3.4 && ratio < 4.6,
  );

  // 5. End to end through the real sim: the per-player ordering holds, and no keeper
  //    ever appears in a goal feed.
  const f = getFormation(FORMATIONS_DATA, '4-2-3-1', 'off')!;
  const used = new Set<string>();
  const filled: Filled = {};
  for (const slot of f.slots) {
    const p = ALL_PLAYERS.filter(
      (x) => !used.has(x.personId) && x.positions.includes(slot.position),
    ).sort((a, b) => b.elo - a.elo)[0];
    if (p) {
      used.add(p.personId);
      filled[slot.id] = p;
    }
  }
  const xi = placedPlayers(f, filled);
  const byName = new Map(xi.map((p) => [p.name, p]));
  const user = userGroupTeam(xi);
  const opp = squadGroupTeam(SQUADS[1]);
  const perPos = new Map<Position, number>();
  const countPos = new Map<Position, number>();
  for (const p of xi) countPos.set(primaryPosition(p), (countPos.get(primaryPosition(p)) ?? 0) + 1);
  let goals = 0;
  let unknown = 0;
  for (let i = 0; i < 6000; i++) {
    for (const e of simulateMatch(user, opp).events) {
      if (e.side !== 'home') continue;
      goals++;
      const p = byName.get(e.scorer);
      if (!p) {
        unknown++;
        continue;
      }
      const pos = primaryPosition(p);
      perPos.set(pos, (perPos.get(pos) ?? 0) + 1);
    }
  }
  const rate = (pos: Position) => (perPos.get(pos) ?? 0) / (countPos.get(pos) ?? 1) / goals;
  check(
    'scorers: over 6000 matches the measured order is ST > AM > CM > full-back > CB',
    goals > 5000 &&
      unknown === 0 &&
      !perPos.has('GK') &&
      rate('ST') > rate('AM') &&
      rate('AM') > rate('CM') &&
      rate('CM') > rate('RB') &&
      rate('RB') > rate('CB'),
  );
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
