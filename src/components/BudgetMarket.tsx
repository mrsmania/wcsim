import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List as ListIcon, Search, Star, Wallet, X } from 'lucide-react';
import type { Player } from '../data/types';
import { lastName } from '../data/format';
import { SQUAD_BY_ID } from '../data/squads';
import type { Formation, Slot } from '../domain/formations';
import { placedPlayers, type Filled } from '../domain/draft';
import { priceOf, pricerFor, xiSpend } from '../domain/pricing';
import { MARKET_PAGE, marketFacets, marketResults, type MarketSortKey } from '../domain/market';
import { autoFillBudget, playersByPosition } from '../domain/budget';
import { tierOf } from '../domain/album';
import { FEATURES } from '../config';
import Flag from './Flag';
import CollectibleStar from './CollectibleStar';
import StartOverButton from './StartOverButton';
import { CARD, Meter, btn } from './matchUi';


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
  // "Value" and "Price" said nothing about which END they started from, which is the one
  // thing you need from a sort when what you are after is a cheap player.
  { value: 'value', label: 'Best value' },
  { value: 'price', label: 'Cheapest' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'A-Z' },
];

const SELECT =
  'rounded-[5px] border border-line bg-panel py-1 pl-2 pr-1 font-mono text-[11px] font-semibold text-ink outline-none transition focus:border-pitch';

/** How close to the foot of the list counts as "reached it", in pixels. About four rows of
 *  lookahead, so the next page is in the DOM before the reader gets to where it goes. */
const GROW_AHEAD = 240;

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
  /** Fill every empty slot within budget (randomized). App dispatches AUTOFILL.
   *  Absent in a versus room, where ten picks in one tap would skip the clock (P41). */
  onAutoFill?: (filled: Filled, usedPersonIds: string[]) => void;
  /** Empty the XI but stay in the budget build. Absent in a room: the referee holds the
   *  XI and would not follow. */
  onClear?: () => void;
  /** Drop the XI and return to setup. Absent in a room: it runs the app's reset, which
   *  navigates out of the room the clock is running in. */
  onStartOver?: () => void;
  /** Player ids whose sticker is already in the album, so a collectible row can say
   *  "you have this one" rather than only "collectible". Empty when the album is off. */
  ownedStickerIds: Set<string>;
  /** Whether the album's marks appear at all: the tier star on a row and the Collectible
   *  filter. False in a versus room, where the album has no business being (P3, P8) - the
   *  discount does not apply, the sticker cannot be earned, and a star beside a name is
   *  then only a distraction that says "this player is rated 90 or more". */
  collectibles?: boolean;
}

/** The transfer-market panel: the left column of the budget build (the player
 *  "source", mirroring the drawn-squad panel of the roll draft). The pitch + the
 *  ratings/line-up columns are shared with the roll draft and owned by App; placing
 *  and removing happen on the pitch, so this panel only shops + holds players.
 *  Browsable: sort (rating/value/price/newest/A-Z), filter by World Cup / country /
 *  collectible / affordable, and a list or grid view. */
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
  collectibles = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketSortKey>('rating');
  const [filterYear, setFilterYear] = useState<'all' | number>('all');
  const [filterCode, setFilterCode] = useState<'all' | string>('all');
  const [collectiblesOnly, setCollectiblesOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const position = targetSlot?.position;

  // **NOTHING RESETS WHEN THE SHOPPED POSITION CHANGES.** Buying a player advances the
  // target to the next empty slot, and the cup and country filters used to be cleared on
  // that move - so a squad built out of, say, Italy 1982 had to be re-filtered eleven
  // times, once per purchase, and it read as the panel forgetting what it had been told.
  // The reason it was there was real and is answered elsewhere: a pair that had players at
  // left wing can have none in goal, so `marketFacets` keeps a selected option even when it
  // matches nobody, and the empty state offers to clear the lot (see `anyFilter` below).
  // Empty is a legitimate answer to a filter you set on purpose.

  // Players eligible for each position, highest-rated first, from the active pool.
  const byPosition = useMemo(() => playersByPosition(poolPlayers), [poolPlayers]);
  const candidates = position ? (byPosition[position] ?? []) : [];

  // The rating band's own scale is the WHOLE pool's, not the shopped position's, so the
  // track does not silently rescale under a band you set - a "70 to 80" that becomes "70 to
  // 78" on the next slot is a filter nobody asked for. Read off the pool because that is
  // what the year-pool setting narrows.
  const [eloFloor, eloCeil] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of poolPlayers) {
      if (p.elo < lo) lo = p.elo;
      if (p.elo > hi) hi = p.elo;
    }
    return Number.isFinite(lo) ? [lo, hi] : [0, 0];
  }, [poolPlayers]);
  const [ratingLo, setRatingLo] = useState(eloFloor);
  const [ratingHi, setRatingHi] = useState(eloCeil);
  // Changing the year pool moves the scale, and a band left outside it would filter
  // everything out with both handles apparently at the ends. Widen back to the new scale.
  useEffect(() => {
    setRatingLo(eloFloor);
    setRatingHi(eloCeil);
  }, [eloFloor, eloCeil]);
  const ratingNarrowed = ratingLo > eloFloor || ratingHi < eloCeil;
  // Null rather than the full span, so an untouched band costs the filter nothing and reads
  // as "no opinion" everywhere downstream. Memoized for the same reason `price` is: it is a
  // real dependency of the results memo, and rebuilt every render it could not be one.
  const rating = useMemo(
    () => (ratingNarrowed ? { min: ratingLo, max: ratingHi } : null),
    [ratingNarrowed, ratingLo, ratingHi],
  );
  // Dragging a handle past its partner PUSHES it rather than stopping, which is the same
  // behaviour the player index's range has. Each handler knows which handle moved, so
  // neither has to guess from the focused element.
  const dragLo = (v: number) => {
    setRatingLo(v);
    if (v > ratingHi) setRatingHi(v);
  };
  const dragHi = (v: number) => {
    setRatingHi(v);
    if (v < ratingLo) setRatingLo(v);
  };

  // The filter dropdowns' options. Keyed on [position, byPosition] rather than on
  // `candidates`, which is derived from them and is a fresh array every render; the two
  // selections are real deps, since each dropdown is narrowed by the other one.
  const facets = useMemo(
    () => marketFacets(candidates, { filterYear, filterCode }),
    [position, byPosition, filterYear, filterCode],
  );

  // What things cost for THIS album: a player whose sticker is already collected is
  // discounted (STICKER_DISCOUNT). One pricer, used by the rows, the totals, the sorts
  // and the auto-fill spender, so every number on the panel agrees.
  //
  // Memoized so it can be a real dependency of the results memo below. It used to be
  // rebuilt every render, which meant the results memo could not depend on it and instead
  // suppressed the lint on a hand-maintained list - so the price SORT closed over one
  // album while the row prices read another. Latent rather than broken (banking only
  // happens at run end), but it is one album change away from the sort and the prices
  // disagreeing (hygiene H78).
  const price = useMemo(() => pricerFor(ownedStickerIds), [ownedStickerIds]);

  const slots = formation.slots;
  const placed = placedPlayers(formation, filled);
  const used = new Set(placed.map((p) => p.personId));
  const spent = xiSpend(placed, ownedStickerIds);
  const remaining = budget - spent;
  const emptySlots = slots.filter((s) => !filled[s.id]);

  // The price ceiling of the "Affordable" toggle. Null when it is off, so the results memo
  // does not re-run on every purchase unless the toggle is actually on.
  const maxPrice = affordableOnly ? remaining : null;

  // `candidates` is still omitted deliberately: it is derived from the two deps in front
  // of it and is a fresh array every render. `price` is a real dependency now.
  const { rows, hiddenByPrice } = useMemo(
    () =>
      position
        ? marketResults({
            candidates,
            query,
            sort,
            filterYear,
            filterCode,
            collectiblesOnly,
            rating,
            maxPrice,
            price,
          })
        : { rows: [], hiddenByPrice: 0 },
    // Same reasoning as `facets` above: keyed on [position, byPosition] rather than on
    // the `candidates` they derive, which is a fresh array every render.
    [
      position,
      byPosition,
      query,
      sort,
      filterYear,
      filterCode,
      collectiblesOnly,
      rating,
      maxPrice,
      price,
    ],
  );

  // A dropdown is shown when there is a choice to make in it, OR when it holds an active
  // selection: cross-filtering can collapse a facet to one option (24 of the 81 nations
  // played exactly one World Cup), and hiding the control then would strand a filter the
  // player can neither see nor clear.
  const showYearFilter = facets.years.length > 1 || filterYear !== 'all';
  const showCountryFilter = facets.countries.length > 1 || filterCode !== 'all';

  // Filters outlive a purchase now, so there has to be one gesture that drops the lot -
  // five controls to walk back individually is how a filter ends up left on by accident,
  // and it is also the answer an empty list needs. The SORT and the view are not filters
  // and are not touched: they say how to read the answer, not which answer.
  const anyFilter =
    query !== '' ||
    filterYear !== 'all' ||
    filterCode !== 'all' ||
    collectiblesOnly ||
    affordableOnly ||
    ratingNarrowed;
  const clearFilters = () => {
    setQuery('');
    setFilterYear('all');
    setFilterCode('all');
    setCollectiblesOnly(false);
    setAffordableOnly(false);
    setRatingLo(eloFloor);
    setRatingHi(eloCeil);
  };

  // How much of the answer is on screen. `marketResults` hands over every player that
  // matched - up to 2,257 of them for a centre-back - and putting that many rows in the DOM
  // would cost a phone dearly for a list nobody reads to the end, so the panel renders a
  // window onto it and grows the window by a page each time the reader reaches the foot.
  const [shown, setShown] = useState(MARKET_PAGE);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visible = rows.slice(0, shown);

  // A new question is a new list: back to one page, and back to the top of it. Keyed on the
  // QUERY and not on `rows`, because buying a player moves `remaining` - so with the
  // Affordable toggle on the list changes under you, and throwing away the scroll position
  // every time money is spent would be the wrong reading of "the list changed".
  useEffect(() => {
    setShown(MARKET_PAGE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [position, query, sort, filterYear, filterCode, collectiblesOnly, affordableOnly, rating]);

  // Grow when the scroll reaches the last `GROW_AHEAD` pixels of the box.
  //
  // **This was an IntersectionObserver on the foot of the list and that does not work here**,
  // which is worth writing down because the observer is the obvious tool and it fails
  // quietly. Even given the scroll container as its `root`, the spec clips the target
  // against every ancestor clip rect up to the VIEWPORT - and this panel's 52vh box is
  // routinely taller than the screen from where it starts, so the foot sat fully inside its
  // root, reported no intersection, and the list stopped growing (measured in the real app
  // at 420x900: stuck at 180 of 784 with the foot at y=908 of a 900px viewport). A scroll
  // position cannot be clipped by anything.
  const maybeGrow = () => {
    const box = scrollRef.current;
    if (!box || box.clientHeight === 0) return;
    if (box.scrollTop + box.clientHeight < box.scrollHeight - GROW_AHEAD) return;
    setShown((s) => (s < rows.length ? s + MARKET_PAGE : s));
  };

  // Asked again after every render that changed the list, which covers the two cases a
  // scroll handler alone cannot: a page that does not fill the box (no scroll event is ever
  // coming) and a grown list whose foot is still under the reader's thumb.
  useEffect(maybeGrow);

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
    onAutoFill?.(next, usedPersonIds);
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
      tier: FEATURES.stickerAlbum && collectibles ? tierOf(p) : null,
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
          {onAutoFill && emptySlots.length > 0 && (
            <button
              onClick={autoFill}
              className={btn('quiet', 'sm')}
            >
              Auto-fill &amp; spend
            </button>
          )}
          {onClear && placed.length > 0 && (
            <button
              onClick={onClear}
              className={`${btn('quiet', 'sm')} hover:!border-loss hover:!text-loss`}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {targetSlot ? (
        <div className="p-3">
          {/* Buying + view toggle */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {/* The guard above tests `targetSlot`, not the `position` derived from it -
                  a derived value discards the narrowing and left this asserting what the
                  guard had already proved (hygiene H21). */}
              Buying: <b className="text-ink">{targetSlot.label}</b> ({targetSlot.position})
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
            {showYearFilter && (
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
            {showCountryFilter && (
              <select
                aria-label="Filter by country"
                value={filterCode}
                onChange={(e) => setFilterCode(e.target.value)}
                className={SELECT}
              >
                <option value="all">Any country</option>
                {facets.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nation}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setAffordableOnly((v) => !v)}
              aria-pressed={affordableOnly}
              className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 font-mono text-[11px] font-semibold transition ${
                affordableOnly
                  ? 'border-pitch bg-pitch/10 text-pitch-ink'
                  : 'border-line bg-panel text-muted hover:border-pitch'
              }`}
            >
              <Wallet size={11} strokeWidth={2.5} />
              Affordable
            </button>
            {FEATURES.stickerAlbum && collectibles && (
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
            {/* "Clear filters", not "Clear": the budget bar above has a Clear that empties
                the XI, and two buttons of that name on one panel is a trap. */}
            {anyFilter && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-panel px-2 py-1 font-mono text-[11px] font-semibold text-muted transition hover:border-loss hover:text-loss"
              >
                <X size={11} strokeWidth={2.5} />
                Clear filters
              </button>
            )}
          </div>

          {/* The rating band. The other filters shop by identity (who, from where, from
              when) or by money; this is the only one that shops by STRENGTH, which is the
              direct way to ask for a squad of a given level rather than inferring it from
              a price. Hidden only if the pool somehow holds one rating. */}
          {eloCeil > eloFloor && (
            <div className="mt-2 flex items-center gap-2 px-1">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Rating
              </span>
              <div className="mkt-rng">
                <div className="mkt-track" />
                <div
                  className="mkt-fill"
                  style={{
                    left: `${((ratingLo - eloFloor) / (eloCeil - eloFloor)) * 100}%`,
                    width: `${((ratingHi - ratingLo) / (eloCeil - eloFloor)) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  aria-label="Lowest rating"
                  min={eloFloor}
                  max={eloCeil}
                  value={ratingLo}
                  onChange={(e) => dragLo(Number(e.target.value))}
                  // Both handles sitting near the right end would leave the one painted
                  // last swallowing every drag, and the low one could then never be pulled
                  // back down. In the upper half of the track it goes on top instead.
                  style={{ zIndex: ratingLo > (eloFloor + eloCeil) / 2 ? 4 : 2 }}
                />
                <input
                  type="range"
                  aria-label="Highest rating"
                  min={eloFloor}
                  max={eloCeil}
                  value={ratingHi}
                  onChange={(e) => dragHi(Number(e.target.value))}
                  style={{ zIndex: 3 }}
                />
              </div>
              <span
                className={`w-[44px] text-right font-mono text-[11px] font-semibold tabular-nums ${
                  ratingNarrowed ? 'text-pitch-ink' : 'text-muted'
                }`}
              >
                {ratingLo}-{ratingHi}
              </span>
            </div>
          )}

          {/* One reserved line, two jobs. Holding a player is the urgent one and takes it.
              Otherwise it says how deep the list is, which is the thing the panel used to
              keep to itself: capped at sixty rows it read as a shortlist of about twenty,
              and there was nothing on screen to say the other 724 existed. The count has to
              live ABOVE the list - at the foot it is only ever seen once the pool runs out,
              since reaching the foot is what loads the next page. */}
          <p
            className={`mb-1.5 mt-2 min-h-[14px] px-1 font-mono text-[10px] ${
              heldPlayer ? 'text-amber' : 'text-muted'
            }`}
          >
            {heldPlayer
              ? `Tap a highlighted slot to place ${lastName(heldPlayer.name)}.`
              : rows.length > MARKET_PAGE
                ? visible.length < rows.length
                  ? `${visible.length} of ${rows.length} ${position} · scroll for more`
                  : `All ${rows.length} ${position} shown`
                : ''}
          </p>

          {rows.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="font-mono text-[12px] text-muted">
                {/* The price ceiling and the filters are different reasons for an empty
                    list, and blaming the filters when the answer is "you are out of money"
                    sends the player off adjusting the wrong control. */}
                {hiddenByPrice > 0
                  ? `No ${position} you can afford with $${remaining} left.`
                  : `No ${position} matches those filters.`}
              </p>
              {/* An empty list is reachable by design now that filters survive a purchase:
                  a cup and country that had a left winger can have no keeper at all. That
                  is a fair answer to the question, and this is the way back out of it. */}
              {anyFilter && (
                <button onClick={clearFilters} className={`${btn('quiet', 'sm')} mt-3`}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            // ONE scroll container around both views, so the foot-of-the-list observer
            // and the scroll-to-top have a single box to work with rather than one each.
            <div ref={scrollRef} onScroll={maybeGrow} className="max-h-[52vh] overflow-y-auto">
              {view === 'grid' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {visible.map((p) => {
                    const c = cell(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => c.selectable && onHold(p)}
                        disabled={!c.selectable}
                        className={[
                          'flex flex-col gap-1 rounded-md border p-2 text-left transition',
                          // No ring: the grid scrolls too, so its outer columns clipped the
                          // ring exactly as the list rows did. The border is inside the box
                          // and was already carrying the state, so the ring only ever added
                          // the artefact.
                          c.held
                            ? 'border-pitch bg-pitch/15'
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
                            priceClassName={c.affordable ? 'text-pitch-ink' : 'text-loss'}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <ul>
                  {visible.map((p) => {
                    const c = cell(p);
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => c.selectable && onHold(p)}
                          disabled={!c.selectable}
                          className={[
                            // Selected is a FULL-WIDTH band: no side stroke, and the top and
                            // bottom rules are borders (inside the box) rather than a ring
                            // (outside it). A ring is a box-shadow, the list scrolls, and a
                            // box-shadow is not scrollable overflow - so its left and right
                            // edges were clipped at the padding box with no way to reach them.
                            // The transparent border on every other row keeps the height even.
                            'flex w-full items-center gap-1 border-y px-2 py-1.5 text-left transition',
                            c.held
                              ? 'border-pitch bg-pitch/20'
                              : c.selectable
                                ? 'border-transparent hover:bg-pitch/5'
                                : 'cursor-not-allowed border-transparent opacity-45',
                          ].join(' ')}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold">{p.name}</span>
                            {c.tier && <CollectibleStar tier={c.tier} owned={c.owned} />}
                          </span>
                          {/* Flag over year, in the flag's own 18px. The year used to hold a
                              28px column of its own next to it, and the names needed it more:
                              most of them were truncated past recognising. */}
                          <span className="flex w-[18px] shrink-0 flex-col items-center gap-px">
                            {c.sq && <Flag code={c.sq.code} className="h-3 w-[18px]" />}
                            <span className="font-mono text-[8.5px] leading-none text-muted tabular-nums">
                              {c.sq?.year}
                            </span>
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
          )}
        </div>
      ) : (
        <div className="p-6 text-center font-mono text-[12px] text-muted">XI complete.</div>
      )}

      {onStartOver && (
        <div className="border-t border-line px-4 pb-4 pt-1">
          <StartOverButton onReset={onStartOver} />
        </div>
      )}
    </div>
  );
}
