// The transfer market's queries: what to offer, in what order, and which filter options
// are worth showing. Pure functions over the dataset.
//
// All of it lived in `BudgetMarket.tsx` - the sort keys and their comparators, the facet
// derivation and the filter pipeline (hygiene H62). None of it is presentation: the panel
// keeps the dropdowns, the labels and the memo wiring, which are genuinely its business.

import type { Player } from '../data/types';
import { normalizeSearch } from '../data/format';
import { SQUAD_BY_ID } from '../data/squads';
import { PRICE_BASE } from './pricing';
import { tierOf } from './album';

/** How many rows the market shows at once. */
export const MAX_RESULTS = 60;

/** Ways to order the market list. */
export type MarketSortKey = 'rating' | 'value' | 'price' | 'newest' | 'name';

const yearOf = (p: Player) => SQUAD_BY_ID[p.squadId]?.year ?? 0;

/** The sort comparators, built around a price function.
 *
 *  The price function is a parameter and not an afterthought: "value" and "price" have to
 *  see what the player will ACTUALLY be charged, or a player whose sticker is already in
 *  the album sorts by a price he is not paying and the cheapest-first list lies.
 *
 *  Every comparator except `name` falls back to rating, so an equal-priced or
 *  equal-vintage pair still comes out best-first rather than in dataset order. */
export const marketSortCmp = (
  price: (p: Player) => number,
): Record<MarketSortKey, (a: Player, b: Player) => number> => {
  /** Rating gained per dollar (value hunting): higher = a better bargain. */
  const valuePerDollar = (p: Player) => (p.elo - PRICE_BASE) / price(p);
  return {
    rating: (a, b) => b.elo - a.elo,
    value: (a, b) => valuePerDollar(b) - valuePerDollar(a) || b.elo - a.elo,
    price: (a, b) => price(a) - price(b) || b.elo - a.elo,
    newest: (a, b) => yearOf(b) - yearOf(a) || b.elo - a.elo,
    name: (a, b) => a.name.localeCompare(b.name),
  };
};

/** The two dropdowns, which narrow EACH OTHER (roadmap 36). */
export interface MarketSelection {
  filterYear: 'all' | number;
  /** A squad CODE, not a nation name, so Soviet Union, Czechoslovakia, Yugoslavia and
   *  both German sides stay their own entries. */
  filterCode: 'all' | string;
}

/** One country option: the code is what is stored, the nation is what is shown. */
export interface MarketCountry {
  code: string;
  nation: string;
}

export interface MarketFacets {
  years: number[];
  countries: MarketCountry[];
}

/** The World Cups and countries worth offering, so a dropdown never offers an option that
 *  would empty the list.
 *
 *  **Each dropdown's options come from the candidates that pass every filter EXCEPT its
 *  own**, which is the whole of the cross-filtering rule and gives both halves of it at
 *  once: pick 1974 and the country list is the 16 nations that were there, pick Wales and
 *  the cup list is 2022 alone. It also makes the promise above true again - it used to hold
 *  one facet at a time only, and with 352 squads across 13 years and 81 nations two thirds
 *  of the year-plus-country pairs are empty by construction.
 *
 *  Deliberately NOT narrowed by the search box or the collectible / affordable toggles:
 *  what a run can afford changes with every purchase, and a country list that reshuffled as
 *  money was spent would be unpredictable.
 *
 *  Years newest-first, countries by nation name. */
export function marketFacets(candidates: readonly Player[], sel: MarketSelection): MarketFacets {
  const years = new Set<number>();
  const countries = new Map<string, string>();
  for (const p of candidates) {
    const sq = SQUAD_BY_ID[p.squadId];
    if (!sq) continue;
    if (sel.filterCode === 'all' || sq.code === sel.filterCode) years.add(sq.year);
    if (sel.filterYear === 'all' || sq.year === sel.filterYear) countries.set(sq.code, sq.nation);
  }
  return {
    years: [...years].sort((a, b) => b - a),
    countries: [...countries]
      .map(([code, nation]) => ({ code, nation }))
      .sort((a, b) => a.nation.localeCompare(b.nation)),
  };
}

/** Everything the market needs to decide what to list. */
export interface MarketQuery {
  /** Players eligible for the shopped position, from the active pool. */
  candidates: readonly Player[];
  /** The free-text box, raw. Normalised here, so the caller does not have to. */
  query: string;
  sort: MarketSortKey;
  filterYear: 'all' | number;
  filterCode: 'all' | string;
  collectiblesOnly: boolean;
  /** The most a row may cost, or null for no ceiling ("only what I can afford"). */
  maxPrice: number | null;
  /** What each player will actually be charged (see `marketSortCmp`). */
  price: (p: Player) => number;
}

export interface MarketResults {
  rows: Player[];
  /** How many players passed every other filter and failed only on the price ceiling.
   *  The panel's empty state has to say "nothing you can afford" rather than blaming the
   *  filters, and this is the only place that knows which of the two it was. */
  hiddenByPrice: number;
}

/** The rows to show: filter, then sort, then cap.
 *
 *  The cap goes LAST, which is the whole point of it being written down here: capping
 *  before the sort would show sixty arbitrary players sorted, rather than the sixty best by
 *  the chosen order. The price ceiling is part of the FILTER for the same reason - applied
 *  after the cap it would leave a screen of sixty rows with none of them buyable, which is
 *  exactly the state it exists to fix.
 *
 *  The search is diacritic-insensitive over name, nation, three-letter code and year, so
 *  "muller", "Müller", "GER" and "1990" all find something. */
export function marketResults(q: MarketQuery): MarketResults {
  const needle = normalizeSearch(q.query.trim());
  let hiddenByPrice = 0;
  const list = q.candidates.filter((p) => {
    const sq = SQUAD_BY_ID[p.squadId];
    if (q.filterYear !== 'all' && sq?.year !== q.filterYear) return false;
    if (q.filterCode !== 'all' && sq?.code !== q.filterCode) return false;
    if (q.collectiblesOnly && !tierOf(p)) return false;
    if (needle) {
      const hay = `${normalizeSearch(p.name)} ${normalizeSearch(sq?.nation ?? '')} ${(sq?.code ?? '').toLowerCase()} ${sq?.year ?? ''}`;
      if (!hay.includes(needle)) return false;
    }
    // Last, so the count below is "players this ceiling is hiding" rather than "players
    // some other filter would have hidden anyway".
    if (q.maxPrice !== null && q.price(p) > q.maxPrice) {
      hiddenByPrice++;
      return false;
    }
    return true;
  });
  return {
    rows: [...list].sort(marketSortCmp(q.price)[q.sort]).slice(0, MAX_RESULTS),
    hiddenByPrice,
  };
}
