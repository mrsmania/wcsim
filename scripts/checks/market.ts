// Characterization checks for the transfer market.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { normalizeSearch } from '../../src/data/format';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../../src/data/squads';
import { tierOf } from '../../src/domain/album';
import { playersByPosition } from '../../src/domain/budget';
import { MAX_RESULTS, marketFacets, marketResults } from '../../src/domain/market';
import { pricerFor } from '../../src/domain/pricing';

export function marketChecks(): void {
  // --- The transfer market: the price ceiling, and the two dropdowns that narrow each other ---
  // domain/market had no coverage at all before roadmap 36 added a filter to it. Three of the
  // four assertions below guard a trap the item names by hand.
  {
    const price = pricerFor(null);
    const byPos = playersByPosition(ALL_PLAYERS);
    const anyQuery = {
      query: '',
      sort: 'rating' as const,
      filterYear: 'all' as const,
      filterCode: 'all' as const,
      collectiblesOnly: false,
      maxPrice: null as number | null,
      price,
    };

    // 1. The ceiling is part of the FILTER, so it lands before the cap. Applied after it,
    // the screen would hold sixty rows with none of them buyable - which is the state the
    // toggle exists to fix, and the state the market shipped in.
    {
      let ok = true;
      let anyPositionWasAllUnaffordable = false;
      for (const pos of ['GK', 'CB', 'ST'] as const) {
        const cands = byPos[pos] ?? [];
        const ceiling = 10;
        const affordable = cands.filter((p) => price(p) <= ceiling);
        const capped = marketResults({ ...anyQuery, candidates: cands, maxPrice: ceiling });
        // A full screen of rows, every one of them buyable, headed by the best the money
        // actually buys. That last clause is the whole feature: "the best I can afford".
        if (capped.rows.length !== Math.min(MAX_RESULTS, affordable.length)) ok = false;
        if (capped.rows.some((p) => price(p) > ceiling)) ok = false;
        if (capped.rows[0].elo !== Math.max(...affordable.map((p) => p.elo))) ok = false;
        if (capped.hiddenByPrice !== cands.length - affordable.length) ok = false;
        // And without it, the same query at the same money is the broken list.
        const open = marketResults({ ...anyQuery, candidates: cands });
        if (open.hiddenByPrice !== 0) ok = false;
        if (!open.rows.some((p) => price(p) <= ceiling)) anyPositionWasAllUnaffordable = true;
      }
      check('market: the price ceiling filters before the 60-row cap, best-affordable first', () => ok);
      check(
        'market: without it, a rating-sorted screen at $10 holds nothing buyable',
        () => anyPositionWasAllUnaffordable,
      );
    }

    // 2. Every option a dropdown offers yields at least one row, walked in BOTH orders. This
    // is the property cross-filtering exists to restore: 352 squads across 13 years and 81
    // nations means two thirds of the year-plus-country pairs are empty by construction, so
    // before it a dropdown offered options that emptied the list.
    {
      let ok = true;
      let pairs = 0;
      let collapsedYearFacet = 0;
      for (const pos of ['GK', 'ST', 'LM'] as const) {
        const candidates = byPos[pos] ?? [];
        const open = marketFacets(candidates, { filterYear: 'all', filterCode: 'all' });
        if (open.years.length === 0 || open.countries.length === 0) ok = false;

        // Cup first, then the countries it offers.
        for (const filterYear of open.years) {
          const f = marketFacets(candidates, { filterYear, filterCode: 'all' });
          if (f.countries.length === 0) ok = false;
          for (const c of f.countries) {
            const sel = { filterYear, filterCode: c.code };
            if (marketResults({ ...anyQuery, ...sel, candidates }).rows.length === 0) ok = false;
            // A facet never drops the option that is currently selected on it, or the panel
            // would hide a filter the player can then neither see nor clear.
            const narrowed = marketFacets(candidates, sel);
            if (!narrowed.years.includes(filterYear)) ok = false;
            if (!narrowed.countries.some((x) => x.code === c.code)) ok = false;
            pairs++;
          }
        }

        // Country first, then the cups it offers.
        for (const c of open.countries) {
          const f = marketFacets(candidates, { filterYear: 'all', filterCode: c.code });
          if (f.years.length === 0) ok = false;
          if (f.years.length === 1) collapsedYearFacet++;
          for (const filterYear of f.years) {
            const sel = { filterYear, filterCode: c.code };
            if (marketResults({ ...anyQuery, ...sel, candidates }).rows.length === 0) ok = false;
          }
        }
      }
      check(`market: every option a dropdown offers yields rows, both orders (${pairs} pairs)`, () => ok);
      // The trap the render rule exists for is real and common: 24 of the 81 nations played
      // exactly one World Cup, so picking one collapses the cup facet to a single year.
      check(
        `market: picking a country can collapse the cup facet to one option ` +
          `(${collapsedYearFacet} of them)`,
        () => collapsedYearFacet > 0,
      );
    }

    // 3. The filters compose rather than override each other, and the search still reads the
    // fields it always did.
    {
      let ok = true;
      const candidates = byPos.ST ?? [];
      // Seeded off a real collectible so the composition cannot come out empty and assert
      // nothing: the ceiling is that player's own price, so he is always one of the rows.
      const seed = candidates.find((p) => tierOf(p))!;
      const sq = SQUAD_BY_ID[seed.squadId]!;
      const ceiling = price(seed);
      const composed = marketResults({
        ...anyQuery,
        candidates,
        filterYear: sq.year,
        filterCode: sq.code,
        collectiblesOnly: true,
        maxPrice: ceiling,
      });
      if (!composed.rows.some((p) => p.id === seed.id)) ok = false;
      for (const p of composed.rows) {
        const s2 = SQUAD_BY_ID[p.squadId];
        if (s2?.year !== sq.year || s2.code !== sq.code) ok = false;
        if (!tierOf(p)) ok = false;
        if (price(p) > ceiling) ok = false;
      }
      // hiddenByPrice counts what the CEILING hid, not what the other filters hid, which is
      // the difference between "you are out of money" and "your filters are too narrow".
      const overCeiling = candidates.filter(
        (p) =>
          SQUAD_BY_ID[p.squadId]?.year === sq.year &&
          SQUAD_BY_ID[p.squadId]?.code === sq.code &&
          tierOf(p) &&
          price(p) > ceiling,
      ).length;
      if (composed.hiddenByPrice !== overCeiling) ok = false;
      // Diacritic-insensitive, over name / nation / code / year, unchanged by the rework.
      // "brazil" finds Brazilians AND Alan Brazil (Scotland 1982): the haystack is the name
      // and the nation both, so asserting every hit is Brazilian would be asserting a bug.
      const byNation = marketResults({ ...anyQuery, candidates, query: 'brazil' });
      if (byNation.rows.length === 0) ok = false;
      if (!byNation.rows.some((p) => SQUAD_BY_ID[p.squadId]?.nation === 'Brazil')) ok = false;
      if (!byNation.rows.some((p) => normalizeSearch(p.name).includes('brazil'))) ok = false;
      for (const p of byNation.rows) {
        const s2 = SQUAD_BY_ID[p.squadId];
        const hit =
          normalizeSearch(p.name).includes('brazil') ||
          normalizeSearch(s2?.nation ?? '').includes('brazil');
        if (!hit) ok = false;
      }
      const byYear = marketResults({ ...anyQuery, candidates, query: '1990' });
      if (byYear.rows.length === 0) ok = false;
      if (byYear.rows.some((p) => SQUAD_BY_ID[p.squadId]?.year !== 1990)) ok = false;
      check('market: the filters compose, and the search still reads name/nation/code/year', () => ok);
    }
  }

}
