import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List as ListIcon, Search, Star } from 'lucide-react';
import type { Player } from '../data/types';
import { lastName } from '../data/format';
import { SQUAD_BY_ID } from '../data/squads';
import type { Confederation } from '../data/confederations';
import type { Formation, Slot } from '../domain/formations';
import { placedPlayers, type Filled } from '../domain/draft';
import { priceOf, pricerFor, xiSpend } from '../domain/pricing';
import { marketFacets, marketResults, type MarketSortKey } from '../domain/market';
import { autoFillBudget, playersByPosition } from '../domain/budget';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import StartOverButton from './StartOverButton';
import { CARD, Meter } from './matchUi';


/** A market row's price: the struck-through full price when the album already holds this
 *  sticker, then what it actually costs. The struck-through half was character-identical
 *  between the grid and the list renderings; the wrapper's layout and the paid price's own
 *  type genuinely differ between them, so both are props rather than levelled - the
 *  grid/list split is a real design difference and is left alone. */
function MarketPrice({
  cost,
  className,
  priceClassName,
}: {
  cost: { discounted: boolean; full: number; price: number };
  className: string;
  priceClassName: string;
}) {
  return (
    <span className={className}>
      {/* Owned sticker: show what it would have cost, so the discount is visible rather
          than just a smaller number. */}
      {cost.discounted && (
        <span className="text-[9.5px] font-normal text-muted line-through">${cost.full}</span>
      )}
      <span className={priceClassName}>${cost.price}</span>
    </span>
  );
}

/** The market's sort options. The keys and their comparators live in domain/market; these
 *  are the words for them. */
const SORT_OPTIONS: { value: MarketSortKey; label: string }[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'value', label: 'Value' },
  { value: 'price', label: 'Price' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'A-Z' },
];

const SELECT =
  'rounded-[5px] border border-line bg-panel py-1 pl-2 pr-1 font-mono text-[11px] font-semibold text-ink outline-none transition focus:border-pitch';

interface Props {
  formation: Formation;
  filled: Filled;
  /** Total "$" to spend (BUDGET_BY_TIER, raised by the transfer-budget perk tier). */
  budget: number;
  /** The player pool (squad-pool setting); the market lists and prices only these. */
  poolPlayers: Player[];
  /** The empty slot currently being shopped for (drives the market's position),
   *  resolved by App (incl. the first-empty fallback); null once the XI is full. */
  targetSlot: Slot | null;
  /** The market player currently held (its eligible slots pulse on the pitch). */
  heldPlayer: Player | null;
  /** Hold / release a market player. */
  onHold: (player: Player) => void;
  /** Fill every empty slot within budget (randomized). App dispatches AUTOFILL. */
  onAutoFill: (filled: Filled, usedPersonIds: string[]) => void;
  /** Empty the XI but stay in the budget build. */
  onClear: () => void;
  /** Drop the XI and return to setup. */
  onStartOver: () => void;
  /** Player ids whose sticker is already in the album, so a collectible row can say
   *  "you have this one" rather than only "collectible". Empty when the album is off. */
  ownedStickerIds: Set<string>;
}

/** The transfer-market panel: the left column of the budget build (the player
 *  "source", mirroring the drawn-squad panel of the roll draft). The pitch + the
 *  ratings/line-up columns are shared with the roll draft and owned by App; placing
 *  and removing happen on the pitch, so this panel only shops + holds players.
 *  Browsable: sort (rating/value/price/newest/A-Z), filter by World Cup / region /
 *  collectible, and a list or grid view. */
export default function BudgetMarket({
  formation,
  filled,
  budget,
  poolPlayers,
  targetSlot,
  heldPlayer,
  onHold,
  onAutoFill,
  onClear,
  onStartOver,
  ownedStickerIds,
}: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketSortKey>('rating');
  const [filterYear, setFilterYear] = useState<'all' | number>('all');
  const [filterRegion, setFilterRegion] = useState<'all' | Confederation>('all');
  const [collectiblesOnly, setCollectiblesOnly] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const position = targetSlot?.position;

  // The year/region facets are position-specific, so reset them when the shopped
  // position changes (sort / collectible / view are kept - they are not).
  useEffect(() => {
    setFilterYear('all');
    setFilterRegion('all');
  }, [position]);

  // Players eligible for each position, highest-rated first, from the active pool.
  const byPosition = useMemo(() => playersByPosition(poolPlayers), [poolPlayers]);
  const candidates = position ? (byPosition[position] ?? []) : [];

  // The filter dropdowns' options. Keyed on [position, byPosition] rather than on
  // `candidates`, which is derived from them and is a fresh array every render.
  const facets = useMemo(
    () => marketFacets(candidates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, byPosition],
  );

  // What things cost for THIS album: a player whose sticker is already collected is
  // discounted (STICKER_DISCOUNT). One pricer, used by the rows, the totals, the sorts
  // and the auto-fill spender, so every number on the panel agrees.
  const price = pricerFor(ownedStickerIds);

  const slots = formation.slots;
  const placed = placedPlayers(formation, filled);
  const used = new Set(placed.map((p) => p.personId));
  const spent = xiSpend(placed, ownedStickerIds);
  const remaining = budget - spent;
  const emptySlots = slots.filter((s) => !filled[s.id]);

  // Deliberately omits `candidates` (derived from the two deps above it) and `price`
  // (a fresh closure every render, over an unchanged album). Both suppressions predate
  // the extraction and are carried across as they were.
  const results = useMemo(
    () =>
      position
        ? marketResults({
            candidates,
            query,
            sort,
            filterYear,
            filterRegion,
            collectiblesOnly,
            price,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, byPosition, query, sort, filterYear, filterRegion, collectiblesOnly],
  );

  // Fill every empty slot and spend most of the budget, differently each time (the
  // randomized fill lives in domain/budget). Hands the result to App to commit.
  const autoFill = () => {
    const { filled: next, usedPersonIds } = autoFillBudget(
      slots,
      filled,
      remaining,
      poolPlayers,
      price,
    );
    onAutoFill(next, usedPersonIds);
  };

  // Per-player display state, shared by the list rows and the grid cards.
  const cell = (p: Player) => {
    const sq = SQUAD_BY_ID[p.squadId];
    const full = priceOf(p.elo);
    const cost = price(p);
    const affordable = cost <= remaining;
    const selectable = !used.has(p.personId) && affordable;
    return {
      sq,
      price: cost,
      /** The undiscounted price, shown struck through when it differs (owned sticker). */
      full,
      discounted: cost < full,
      affordable,
      selectable,
      held: p.id === heldPlayer?.id,
      tier: FEATURES.stickerAlbum ? tierOf(p) : null,
      owned: ownedStickerIds.has(p.id),
    };
  };

  return (
    <div className={`overflow-hidden ${CARD}`}>
      {/* Budget bar */}
      <div className="border-b border-line p-4">
        <div className="flex items-baseline justify-between font-mono text-[12px]">
          <span>
            Spent <b className="text-ink">${spent}</b> / ${budget}
          </span>
          <span className={remaining < 0 ? 'font-bold text-loss' : 'text-muted'}>
            ${remaining} left &middot; {placed.length}/{slots.length}
          </span>
        </div>
        <Meter
          className="mt-2"
          pct={(spent / budget) * 100}
          height={8}
          fill={remaining < 0 ? 'bg-loss' : 'bg-pitch'}
        />
        <div className="mt-3 flex gap-2">
          {emptySlots.length > 0 && (
            <button
              onClick={autoFill}
              className="rounded-[5px] border border-line bg-panel px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink transition hover:border-pitch hover:text-pitch"
            >
              Auto-fill &amp; spend
            </button>
          )}
          {placed.length > 0 && (
            <button
              onClick={onClear}
              className="rounded-[5px] border border-line bg-panel px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-muted transition hover:border-loss hover:text-loss"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {position ? (
        <div className="p-3">
          {/* Buying + view toggle */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Buying: <b className="text-ink">{targetSlot!.label}</b> ({position})
            </span>
            <div className="flex overflow-hidden rounded-[5px] border border-line">
              {(
                [
                  ['list', ListIcon],
                  ['grid', LayoutGrid],
                ] as const
              ).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-label={`${v} view`}
                  aria-pressed={view === v}
                  className={`grid h-[26px] w-[28px] place-items-center border-l border-line transition first:border-l-0 ${
                    view === v ? 'bg-ink text-ground' : 'bg-panel text-muted hover:text-ink'
                  }`}
                >
                  <Icon size={13} strokeWidth={2.5} />
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-2">
            <Search
              size={13}
              strokeWidth={2.5}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players…"
              className="w-full rounded-[5px] border border-line bg-panel py-1.5 pl-8 pr-2 text-[13px] outline-none transition placeholder:text-muted/70 focus:border-pitch"
            />
          </div>

          {/* Sort + filters */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as MarketSortKey)}
              className={SELECT}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
            {facets.years.length > 1 && (
              <select
                aria-label="Filter by World Cup"
                value={filterYear}
                onChange={(e) =>
                  setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className={SELECT}
              >
                <option value="all">Any cup</option>
                {facets.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            {facets.regions.length > 1 && (
              <select
                aria-label="Filter by region"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value as 'all' | Confederation)}
                className={SELECT}
              >
                <option value="all">Any region</option>
                {facets.regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {FEATURES.stickerAlbum && (
              <button
                onClick={() => setCollectiblesOnly((v) => !v)}
                aria-pressed={collectiblesOnly}
                className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 font-mono text-[11px] font-semibold transition ${
                  collectiblesOnly
                    ? 'border-amber bg-amber/10 text-amber-ink'
                    : 'border-line bg-panel text-muted hover:border-amber'
                }`}
              >
                <Star size={11} strokeWidth={2.5} className={collectiblesOnly ? 'fill-current' : ''} />
                Collectible
              </button>
            )}
          </div>

          <p className="mb-1.5 mt-2 min-h-[14px] px-1 font-mono text-[10px] text-amber">
            {heldPlayer ? `Tap a highlighted slot to place ${lastName(heldPlayer.name)}.` : ''}
          </p>

          {results.length === 0 ? (
            <p className="px-2 py-6 text-center font-mono text-[12px] text-muted">
              No {position} matches those filters.
            </p>
          ) : view === 'grid' ? (
            <div className="grid max-h-[52vh] grid-cols-2 gap-1.5 overflow-y-auto">
              {results.map((p) => {
                const c = cell(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => c.selectable && onHold(p)}
                    disabled={!c.selectable}
                    className={[
                      'flex flex-col gap-1 rounded-md border p-2 text-left transition',
                      c.held
                        ? 'border-pitch bg-pitch/10 ring-1 ring-pitch'
                        : c.selectable
                          ? 'border-line hover:border-pitch'
                          : 'cursor-not-allowed border-line opacity-45',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.sq && <Flag code={c.sq.code} className="h-3 w-[18px]" />}
                      <span className="font-mono text-[9.5px] text-muted tabular-nums">
                        {c.sq?.year}
                      </span>
                      {c.tier && (
                        <span className="ml-auto">
                          <CollectibleStar tier={c.tier} owned={c.owned} />
                        </span>
                      )}
                    </div>
                    <span className="truncate text-[12.5px] font-semibold leading-tight">
                      {p.name}
                    </span>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <span className="font-mono text-[14px] font-bold tabular-nums">{p.elo}</span>
                      <MarketPrice
                        cost={c}
                        className="flex items-baseline gap-1 font-mono text-[11px] font-semibold tabular-nums"
                        priceClassName={c.affordable ? 'text-pitch' : 'text-loss'}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className="max-h-[52vh] overflow-y-auto">
              {results.map((p) => {
                const c = cell(p);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => c.selectable && onHold(p)}
                      disabled={!c.selectable}
                      className={[
                        'flex w-full items-center gap-2 rounded-[5px] px-2 py-2 text-left transition',
                        c.held
                          ? 'bg-pitch/10 ring-1 ring-pitch'
                          : c.selectable
                            ? 'hover:bg-pitch/5'
                            : 'cursor-not-allowed opacity-45',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{p.name}</span>
                        {c.tier && <CollectibleStar tier={c.tier} owned={c.owned} />}
                      </span>
                      {c.sq && <Flag code={c.sq.code} className="h-3 w-[18px]" />}
                      <span className="w-7 text-right font-mono text-[10px] text-muted tabular-nums">
                        {c.sq?.year}
                      </span>
                      <span className="w-6 text-right font-mono text-[13px] font-bold tabular-nums">
                        {p.elo}
                      </span>
                      <MarketPrice
                        cost={c}
                        className="flex w-[52px] items-baseline justify-end gap-1 font-mono tabular-nums"
                        priceClassName={`text-[12px] font-semibold ${c.affordable ? 'text-ink' : 'text-loss'}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="p-6 text-center font-mono text-[12px] text-muted">XI complete.</div>
      )}

      <div className="border-t border-line px-4 pb-4 pt-1">
        <StartOverButton onReset={onStartOver} />
      </div>
    </div>
  );
}
