// Characterization checks for the price curve, the owned-sticker discount and auto-fill.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, withSeed } from './harness';
import { BUDGET_DRAFT, STICKER_DISCOUNT } from '../../src/config';
import { ALL_PLAYERS } from '../../src/data/squads';
import { tierOf } from '../../src/domain/album';
import { autoFillBudget } from '../../src/domain/budget';
import { FORMATIONS_DATA } from '../../src/domain/formations';
import { priceFor, priceOf, pricerFor } from '../../src/domain/pricing';

export function pricingChecks(): void {
  // --- Budget draft pricing: monotonic, floored at 1 -------------------------
  {
    let ok = BUDGET_DRAFT > 0;
    for (let e = 60; e <= 99; e++) {
      if (priceOf(e) < 1) ok = false;
      if (e > 60 && priceOf(e) < priceOf(e - 1)) ok = false; // non-decreasing in rating
    }
    check('pricing: price is >= 1 and never decreases with rating', () => ok);
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
    check('pricing: the owned-sticker discount is bounded, floored, and per player id', () => ok);
  }

  // --- Budget auto-fill: within budget, no duplicate person, fills every slot ---
  // SEEDED. Two of the claims below are existence claims over random trials rather than
  // bounded properties - "every slot fills" and "some discounted XI comes in under list
  // price" - so a budget or price-curve tweak could make either fail intermittently, which
  // is exactly the failure mode the boon table was seeded to avoid (hygiene H95). The
  // invariants beside them (never overspend, never a duplicate person) hold for every input
  // and would be just as true unseeded; seeding the whole block keeps the sample one thing
  // rather than two.
  {
    withSeed(0x51ed270b, () => {
      const formations = Object.values(FORMATIONS_DATA.byKey);
      let withinBudget = true;
      let noDupes = true;
      let fillsAll = true;
      let usedMatches = true;
      // The formation and spend that broke each one, so a failure over 3,000 XIs names the
      // case rather than only the property (hygiene H93).
      const worst: Record<string, string> = {};
      for (let i = 0; i < 3000; i++) {
        const f = formations[i % formations.length];
        const { filled, usedPersonIds } = autoFillBudget(f.slots, {}, BUDGET_DRAFT);
        const placed = f.slots.map((s) => filled[s.id]).filter((p): p is NonNullable<typeof p> => !!p);
        const spent = placed.reduce((t, p) => t + priceOf(p.elo), 0);
        const where = `${f.name}/${f.style}`;
        if (spent > BUDGET_DRAFT) {
          withinBudget = false;
          worst.budget ??= `${where} spent ${spent} of ${BUDGET_DRAFT}`;
        }
        if (new Set(placed.map((p) => p.personId)).size !== placed.length) {
          noDupes = false;
          worst.dupes ??= where;
        }
        // Every position in the dataset is fillable within the budget, so a fresh XI fills.
        if (placed.length !== f.slots.length) {
          fillsAll = false;
          worst.fill ??= `${where} filled ${placed.length} of ${f.slots.length}`;
        }
        const usedFromPlaced = new Set(placed.map((p) => p.personId));
        if (
          usedPersonIds.length !== usedFromPlaced.size ||
          !usedPersonIds.every((id) => usedFromPlaced.has(id))
        ) {
          usedMatches = false; // reported personIds match the players actually placed
          worst.used ??= `${where} reported ${usedPersonIds.length} for ${usedFromPlaced.size} placed`;
        }
      }
      check('budget: auto-fill never exceeds the budget', () => withinBudget, () => worst.budget ?? '');
      check('budget: auto-fill never uses a personId twice', () => noDupes, () => worst.dupes ?? '');
      check(
        'budget: auto-fill fills every slot when the budget allows',
        () => fillsAll,
        () => worst.fill ?? '',
      );
      check(
        'budget: auto-fill reports exactly the placed personIds',
        () => usedMatches,
        () => worst.used ?? '',
      );

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
      check('budget: auto-fill respects the budget when prices are discounted', () => discountedWithin);
      check('budget: auto-fill still fills every slot when prices are discounted', () => discountedFills);
      check('budget: a discounted XI can cost less than its list price', () => cheaperSomewhere);
    });
  }

}
