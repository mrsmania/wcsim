import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Player } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES, STICKER_TRADE_COST, type StickerTier } from '../config';
import {
    albumStats,
    canAffordTrade,
    collectiblePlayers,
    tierOf,
    totalDuplicates,
    tradeOptions,
    type AlbumState,
} from '../domain/album';
import StickerCard, { GOLD_ACCENT, GOLD_FOIL, GOLD_INK, TIER_META } from './StickerCard';
import TradeModal from './TradeModal';
import Overlay from './Overlay';
import Flag from './Flag';
import { StageCrumb, StageHeader } from './matchUi';
import ConfirmAction from './ConfirmAction';

interface Props {
    album: AlbumState;
    allPlayers: Player[];
    onTrade: (tier: StickerTier, playerId: string) => void;
    /** Wipe the whole album (collection + trade stats) back to empty. */
    onReset: () => void;
    onClose: () => void;
}

// The album's display order (Monumental first), derived from TIER_META so there is
// one source of tier ordering.
const TIER_ORDER = (Object.keys(TIER_META) as StickerTier[]).sort(
    (a, b) => TIER_META[a].order - TIER_META[b].order,
);

export default function AlbumScreen({ album, allPlayers, onTrade, onReset, onClose }: Props) {
    const [trade, setTrade] = useState<{ tier: StickerTier; options: Player[] } | null>(null);
    // A collected sticker enlarged to full size in a lightbox (click to open). Held as
    // an index into `collectedList` so the arrows can step through the collection.
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const stats = useMemo(() => albumStats(album, allPlayers), [album, allPlayers]);
    const dupes = totalDuplicates(album);
    const pct = stats.total > 0 ? Math.round((stats.collected / stats.total) * 100) : 0;
    const complete = stats.total > 0 && stats.collected === stats.total;

    // Collectibles grouped by tier, each sorted rating-desc then name.
    const byTier = useMemo(() => {
        const groups: Record<StickerTier, Player[]> = { monumental: [], iconic: [], legendary: [] };
        for (const p of collectiblePlayers(allPlayers)) groups[tierOf(p)!].push(p);
        for (const t of TIER_ORDER) {
            groups[t].sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
        }
        return groups;
    }, [allPlayers]);

    const collectedSet = useMemo(() => new Set(album.collected), [album.collected]);

    // The collected stickers as a flat, ordered sequence (album display order: tier
    // order, rating-desc within each) - the sequence the lightbox arrows step through.
    const collectedList = useMemo(() => {
        const list: { player: Player; tier: StickerTier }[] = [];
        for (const t of TIER_ORDER) {
            for (const p of byTier[t]) {
                if (collectedSet.has(p.id)) list.push({ player: p, tier: t });
            }
        }
        return list;
    }, [byTier, collectedSet]);

    // player id -> position in `collectedList`, so a card click opens the right index.
    const indexById = useMemo(() => {
        const m = new Map<string, number>();
        collectedList.forEach((e, i) => m.set(e.player.id, i));
        return m;
    }, [collectedList]);

    const openTrade = (tier: StickerTier) =>
        setTrade({ tier, options: tradeOptions(album, tier, allPlayers) });

    return (
        <div className="mx-auto max-w-[1000px]">
            <StageHeader
                eyebrow="Your collection"
                title="The Sticker Album"
                crumb={<StageCrumb dir="back" label="Back to game" onClick={onClose} />}
            />

            {/* Completion counter + duplicate pool */}
            <section className="grid grid-cols-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard sm:grid-cols-[minmax(0,1fr)_210px]">
                <div className="p-[22px]">
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                        Collected
                    </div>
                    <div className="mb-3 mt-1.5 font-display font-black leading-none tracking-[-0.02em]">
                        <span className="text-[44px]">{stats.collected}</span>
                        <span className="text-[18px] font-extrabold text-muted">
                            {' '}
                            / {stats.total}
                        </span>
                    </div>
                    <div className="h-[9px] overflow-hidden rounded-full border border-line bg-chalk">
                        <div className="h-full bg-pitch" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
                        {TIER_ORDER.map((t) => (
                            <span
                                key={t}
                                className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted"
                            >
                                <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{ background: TIER_META[t].accent }}
                                />
                                {TIER_META[t].name}{' '}
                                <b className="text-ink">
                                    {stats.byTier[t].collected}/{stats.byTier[t].total}
                                </b>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="border-t border-line bg-chalk p-[22px] sm:border-l sm:border-t-0">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Duplicates
                    </div>
                    <div className="mt-1 font-mono text-[38px] font-bold leading-none">{dupes}</div>
                    <div className="mt-1.5 text-[11.5px] leading-snug text-muted">
                        Trade any mix for a new sticker of your choice.
                    </div>
                </div>
            </section>

            {complete && (
                <div
                    className="mt-6 rounded-lg border p-6 text-center shadow-hard"
                    style={{
                        borderColor: GOLD_ACCENT,
                        background: GOLD_FOIL,
                        color: GOLD_INK,
                    }}
                >
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]">
                        &#9733; Album complete &#9733;
                    </div>
                    <h3 className="mt-1.5 font-display text-3xl font-black tracking-[-0.02em]">
                        All {stats.total} collected
                    </h3>
                    <p className="mt-1 text-[13.5px]">
                        Every Legendary, Iconic and Monumental sticker. A full house.
                    </p>
                </div>
            )}

            {TIER_ORDER.map((tier) => {
                const players = byTier[tier];
                if (players.length === 0) return null;
                const meta = TIER_META[tier];
                const afford = canAffordTrade(album, tier);
                const cost = STICKER_TRADE_COST[tier];
                const anyUncollected = players.some((p) => !collectedSet.has(p.id));
                return (
                    <section key={tier} className="mt-8">
                        <div className="mb-4 flex items-center gap-2.5 border-b-2 border-ink pb-2.5">
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ background: meta.accent }}
                            />
                            <h3 className="font-display text-[19px] font-extrabold tracking-[-0.01em]">
                                {meta.name}
                            </h3>
                            <span className="font-mono text-[12px] font-bold text-muted">
                                {stats.byTier[tier].collected} / {stats.byTier[tier].total}
                            </span>
                            <span className="flex-1" />
                            {afford && anyUncollected ? (
                                <button
                                    onClick={() => openTrade(tier)}
                                    className="rounded-[5px] border px-3 py-2 font-display text-[11px] font-extrabold uppercase tracking-[0.04em] transition hover:text-white"
                                    style={{ borderColor: meta.accent, color: meta.accent }}
                                    onMouseEnter={(e) =>
                                        (e.currentTarget.style.background = meta.accent)
                                    }
                                    onMouseLeave={(e) =>
                                        (e.currentTarget.style.background = 'transparent')
                                    }
                                >
                                    Trade {cost} &rarr; {meta.name}
                                </button>
                            ) : anyUncollected ? (
                                <span className="font-mono text-[11px] text-muted">
                                    Trade cost {cost}
                                    {dupes < cost ? ` · need ${cost - dupes} more` : ''}
                                </span>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {players.map((p) => {
                                const isCollected = collectedSet.has(p.id);
                                const card = (
                                    <StickerCard
                                        player={p}
                                        tier={tier}
                                        collected={isCollected}
                                        duplicateCount={album.duplicates[p.id] ?? 0}
                                    />
                                );
                                // A collected sticker is clickable and enlarges to full size.
                                return isCollected ? (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setExpandedIndex(indexById.get(p.id) ?? null)}
                                        aria-label={`Enlarge ${p.name} sticker`}
                                        className="block w-full cursor-pointer rounded-md border-0 bg-transparent p-0 text-left transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2"
                                    >
                                        {card}
                                    </button>
                                ) : (
                                    <div key={p.id}>{card}</div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}

            {/* Manual reset (destructive; inline confirm). Clears the collection +
                trade stats from browser storage. Tucked at the foot, out of the way. */}
            <div className="mt-12 flex justify-center border-t border-line pt-6">
                <ConfirmAction
                    prompt="Reset the whole album? This clears every sticker and can't be undone."
                    confirmLabel="Yes, reset album"
                    onConfirm={onReset}
                    triggerLabel="Reset album"
                    triggerClassName="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-loss"
                    rowClassName="flex flex-wrap items-center justify-center gap-2.5 text-center"
                />
            </div>

            {trade && (
                <TradeModal
                    targetTier={trade.tier}
                    costDuplicates={STICKER_TRADE_COST[trade.tier]}
                    options={trade.options}
                    onPick={(playerId) => {
                        onTrade(trade.tier, playerId);
                        setTrade(null);
                    }}
                    onCancel={() => setTrade(null)}
                />
            )}

            {expandedIndex !== null && collectedList[expandedIndex] && (
                <StickerLightbox
                    items={collectedList}
                    index={expandedIndex}
                    duplicates={album.duplicates}
                    onIndex={setExpandedIndex}
                    onClose={() => setExpandedIndex(null)}
                />
            )}
        </div>
    );
}

/** A collected sticker enlarged to full size in a modal, with prev/next navigation
 *  across the whole collection. One card: the modal panel itself. The sticker is its
 *  content (big image + details), not a nested card - so no card-in-card. Arrows,
 *  the left/right arrow keys, and a horizontal swipe all step through `items`. */
function StickerLightbox({
    items,
    index,
    duplicates,
    onIndex,
    onClose,
}: {
    items: { player: Player; tier: StickerTier }[];
    index: number;
    duplicates: Record<string, number>;
    onIndex: (i: number) => void;
    onClose: () => void;
}) {
    const { player, tier } = items[index];
    const count = items.length;
    const sq = SQUAD_BY_ID[player.squadId];
    const meta = TIER_META[tier];
    const duplicateCount = duplicates[player.id] ?? 0;

    // Step by `delta`, wrapping around the collection.
    const go = (delta: number) => onIndex((index + delta + count) % count);

    // Left/right arrow keys step through the collection (Escape is handled by Overlay).
    useEffect(() => {
        if (count < 2) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                go(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                go(1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, count]);

    // Touch swipe (mobile): a horizontal drag past the threshold steps prev/next.
    const touchStartX = useRef<number | null>(null);

    return (
        <Overlay
            onClose={onClose}
            ariaLabel={`${player.name} sticker`}
            backdropClassName="bg-black/80"
        >
            <div
                className="-mx-6 -mt-6 mb-4 h-1.5 rounded-t-lg"
                style={{ background: meta.accent }}
            />
            <div
                className="flex flex-col items-center text-center"
                onTouchStart={(e) => {
                    touchStartX.current = e.changedTouches[0].clientX;
                }}
                onTouchEnd={(e) => {
                    if (touchStartX.current === null) return;
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    touchStartX.current = null;
                    if (count > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
                }}
            >
                <div className="mb-1 flex w-full items-center justify-between pr-8">
                    <span
                        className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                        style={{ color: meta.accent }}
                    >
                        {meta.name}
                    </span>
                    {duplicateCount > 0 && (
                        <span className="rounded-full bg-amber px-2 py-0.5 font-mono text-[11px] font-bold leading-none text-white">
                            &times;{duplicateCount}
                        </span>
                    )}
                </div>
                {FEATURES.stickerImages && (
                    <img
                        key={player.id}
                        src={`${import.meta.env.BASE_URL}stickers/${player.id}.png`}
                        alt=""
                        className="mb-3 aspect-square w-full max-w-[440px] object-contain"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                )}
                <Flag code={sq?.code ?? ''} className="h-6 w-9" />
                <div className="mt-2 font-display text-2xl font-extrabold leading-tight">
                    {player.name}
                </div>
                <div className="font-mono text-[13px] text-muted">
                    {sq?.nation}
                    {sq?.year ? ` · ${sq.year}` : ''}
                </div>
                <div
                    className="mt-3 inline-flex items-baseline gap-2 rounded-md px-4 py-2"
                    style={{ background: meta.strip, color: meta.stripText }}
                >
                    <span className="font-mono text-3xl font-bold leading-none">
                        {player.elo}
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                        Rating
                    </span>
                </div>
                {count > 1 && (
                    <div className="mt-3 font-mono text-[11px] text-muted">
                        {index + 1} / {count}
                    </div>
                )}
            </div>

            {/* Prev/next arrows, sat just OUTSIDE the 640px panel (fixed, so they
                escape the panel's overflow). Hidden below ~800px, where there is no
                room beside the panel - swipe covers touch devices there. */}
            {count > 1 && (
                <>
                    <button
                        type="button"
                        onClick={() => go(-1)}
                        aria-label="Previous sticker"
                        className="fixed top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white min-[800px]:grid"
                        style={{ right: 'calc(50% + 320px + 16px)' }}
                    >
                        <ChevronLeft size={32} strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        onClick={() => go(1)}
                        aria-label="Next sticker"
                        className="fixed top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white min-[800px]:grid"
                        style={{ left: 'calc(50% + 320px + 16px)' }}
                    >
                        <ChevronRight size={32} strokeWidth={2.5} />
                    </button>
                </>
            )}
        </Overlay>
    );
}
