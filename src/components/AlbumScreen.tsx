import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Player } from '../data/types';
import { STICKER_TRADE_COST, type StickerTier } from '../config';
import {
    albumStats,
    canAffordTrade,
    collectiblePlayers,
    tierOf,
    totalDuplicates,
    tradeOptions,
    type AlbumState,
} from '../domain/album';
import StickerCard, { TIER_META } from './StickerCard';
import TradeModal from './TradeModal';
import Overlay from './Overlay';

interface Props {
    album: AlbumState;
    allPlayers: Player[];
    onTrade: (tier: StickerTier, playerId: string) => void;
    onClose: () => void;
}

const TIER_ORDER: StickerTier[] = ['monumental', 'iconic', 'legendary'];

export default function AlbumScreen({ album, allPlayers, onTrade, onClose }: Props) {
    const [trade, setTrade] = useState<{ tier: StickerTier; options: Player[] } | null>(null);
    // A collected sticker enlarged to full size in a lightbox (click to open).
    const [expanded, setExpanded] = useState<{ player: Player; tier: StickerTier } | null>(null);

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

    const openTrade = (tier: StickerTier) =>
        setTrade({ tier, options: tradeOptions(album, tier, allPlayers) });

    return (
        <div className="mx-auto max-w-[1000px]">
            <button
                onClick={onClose}
                className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch"
            >
                <ArrowLeft
                    size={13}
                    strokeWidth={2.5}
                    className="transition group-hover:-translate-x-0.5"
                />
                Back to game
            </button>

            <div className="mb-[18px] mt-1">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                    Your collection
                </div>
                <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
                    The Sticker Album
                </h2>
            </div>

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
                        borderColor: '#c99a3a',
                        background: 'linear-gradient(135deg,#f0cf8a,#c99a3a)',
                        color: '#3a2a06',
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
                                        onClick={() => setExpanded({ player: p, tier })}
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

            {expanded && (
                <Overlay
                    onClose={() => setExpanded(null)}
                    ariaLabel={`${expanded.player.name} sticker`}
                    bare
                >
                    <div className="w-[600px] max-w-[calc(100vw-3rem)]">
                        <StickerCard
                            player={expanded.player}
                            tier={expanded.tier}
                            collected
                            duplicateCount={album.duplicates[expanded.player.id] ?? 0}
                        />
                    </div>
                </Overlay>
            )}
        </div>
    );
}
