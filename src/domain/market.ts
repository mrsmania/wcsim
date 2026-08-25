// The transfer market's queries: what to offer, in what order, and which filter options
// are worth showing. Pure functions over the dataset.
//
// All of it lived in `BudgetMarket.tsx` - the sort keys and their comparators, the facet
// derivation and the filter pipeline (hygiene H62). None of it is presentation: the panel
// keeps the dropdowns, the labels and the two `useMemo` dep arrays, which are genuinely its
// business.

import type { Player } from '../data/types';
import { normalizeSearch } from '../data/format';
import { SQUAD_BY_ID } from '../data/squads';
import { CONFEDERATION, type Confederation } from '../data/confederations';
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

/** The World Cups and confederations actually present among these candidates, so the
 *  filter dropdowns never offer an option that would empty the list. Years newest-first,
 *  regions alphabetical. */
export function marketFacets(candidates: Player[]): {
  years: number[];
  regions: Confederation[];
} {
  const years = new Set<number>();
  const regions = new Set<Confederation>();
  for (const p of candidates) {
    const sq = SQUAD_BY_ID[p.squadId];
    if (sq?.year) years.add(sq.year);
    const r = sq ? CONFEDERATION[sq.code] : undefined;
    if (r) regions.add(r);
  }
  return {
    years: [...years].sort((a, b) => b - a),
    regions: [...regions].sort(),
  };
}

/** Everything the market needs to decide what to list. */
export interface MarketQuery {
  /** Players eligible for the shopped position, from the active pool. */
  candidates: Player[];
  /** The free-text box, raw. Normalised here, so the caller does not have to. */
  query: string;
  sort: MarketSortKey;
  filterYear: 'all' | number;
  filterRegion: 'all' | Confederation;
  collectiblesOnly: boolean;
  /** What each player will actually be charged (see `marketSortCmp`). */
  price: (p: Player) => number;
}

/** The rows to show: filter, then sort, then cap.
 *
 *  The cap goes LAST, which is the whole point of it being written down here: capping
 *  before the sort would show sixty arbitrary players sorted, rather than the sixty best by
 *  the chosen order.
 *
 *  The search is diacritic-insensitive over name, nation, three-letter code and year, so
 *  "muller", "Müller", "GER" and "1990" all find something. */
export function marketResults(q: MarketQuery): Player[] {
  const needle = normalizeSearch(q.query.trim());
  const list = q.candidates.filter((p) => {
    const sq = SQUAD_BY_ID[p.squadId];
    if (q.filterYear !== 'all' && sq?.year !== q.filterYear) return false;
    if (q.filterRegion !== 'all' && (sq ? CONFEDERATION[sq.code] : undefined) !== q.filterRegion)
      return false;
    if (q.collectiblesOnly && !tierOf(p)) return false;
    if (needle) {
      const hay = `${normalizeSearch(p.name)} ${normalizeSearch(sq?.nation ?? '')} ${(sq?.code ?? '').toLowerCase()} ${sq?.year ?? ''}`;
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  return [...list].sort(marketSortCmp(q.price)[q.sort]).slice(0, MAX_RESULTS);
}
