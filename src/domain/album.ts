import type { Player, Position } from '../data/types';
import { STICKER_TIERS, STICKER_TRADE_COST, type StickerTier } from '../config';
import { shuffled } from './random';

/**
 * The persisted sticker collection. Kept deliberately flat (collected ids + a
 * duplicate count per id) so it is trivial to sync to a backend later. Stored in
 * localStorage under its own key, independent of the game state (FR-7). Bump
 * `version` and add a migration in `state/albumStorage.ts` on a schema change.
 */
export interface AlbumState {
    version: 1;
    /** Player ids collected (one entry per unique sticker). */
    collected: string[];
    /** Extra copies beyond the first, per player id. A key exists only when > 0. */
    duplicates: Record<string, number>;
}

/** An empty album (also the default returned when nothing is stored). */
export function emptyAlbum(): AlbumState {
    return { version: 1, collected: [], duplicates: {} };
}

/** The tier a player belongs to by elo, or null if they are not collectible. The
 *  single source of collectibility (FR-1): change `STICKER_TIERS` and everything
 *  downstream (markers, album grid, totals) follows. */
export function tierOf(player: Player): StickerTier | null {
    for (const tier of Object.keys(STICKER_TIERS) as StickerTier[]) {
        const { min, max } = STICKER_TIERS[tier];
        if (player.elo >= min && player.elo <= max) return tier;
    }
    return null;
}

export function isCollectible(player: Player): boolean {
    return tierOf(player) !== null;
}

/**
 * The sticker-swap eligibility rule (the single source, shared by the reducer, the
 * App swap-eligible memo, and the pitch's swap targets). A collectible `incoming`
 * may swap into a filled slot when its role fits the slot AND either the occupant is
 * the SAME person as a different card (upgrade a version in place - a different id,
 * not a no-op) or the occupant is a DIFFERENT person and `incoming` isn't already in
 * the XI (`usedPersonIds` holds the personIds currently placed). Callers keep their
 * own swapsLeft / flag / occupant-present gating; this is only the predicate.
 */
export function canSwapInto(
    incoming: Player,
    occupant: Player,
    slotPosition: Position,
    usedPersonIds: Set<string>,
): boolean {
    if (!isCollectible(incoming)) return false;
    if (!incoming.positions.includes(slotPosition)) return false;
    return occupant.personId === incoming.personId
        ? occupant.id !== incoming.id
        : !usedPersonIds.has(incoming.personId);
}

/** Every collectible player in a flat list (the caller passes the dataset in, so
 *  this module stays pure and free of a `data/squads` import). */
export function collectiblePlayers(allPlayers: Player[]): Player[] {
    return allPlayers.filter(isCollectible);
}

/** Add one copy of a player id to an album (immutably): first copy -> collected,
 *  otherwise bump the duplicate counter. */
function addCopy(album: AlbumState, id: string): AlbumState {
    if (!album.collected.includes(id)) {
        return { ...album, collected: [...album.collected, id] };
    }
    return {
        ...album,
        duplicates: { ...album.duplicates, [id]: (album.duplicates[id] ?? 0) + 1 },
    };
}

/**
 * Merge a finished run's collectibles into the album (immutable). `draftedIds` are
 * the collectible player ids from the final XI (derived by the caller, so swaps and
 * autofill are handled for free). On a cup win, `cupPickId` is also applied.
 * Does not persist - the caller saves.
 */
export function applyRunStickers(
    album: AlbumState,
    draftedIds: string[],
    wonCup: boolean,
    cupPickId: string | null,
): AlbumState {
    let next = album;
    for (const id of draftedIds) next = addCopy(next, id);
    if (wonCup && cupPickId) next = addCopy(next, cupPickId);
    return next;
}

/** Total duplicates in the pool (any tier), the currency for trades. */
export function totalDuplicates(album: AlbumState): number {
    return Object.values(album.duplicates).reduce((sum, n) => sum + n, 0);
}

export function canAffordTrade(album: AlbumState, targetTier: StickerTier): boolean {
    return totalDuplicates(album) >= STICKER_TRADE_COST[targetTier];
}

/** Up to 3 randomly-drawn uncollected players of the target tier (fewer if fewer
 *  remain, [] if none). The trade UI always offers uncollected options (no risk of
 *  a duplicate). Uses Math.random intentionally, matching the sim. */
export function tradeOptions(
    album: AlbumState,
    targetTier: StickerTier,
    allPlayers: Player[],
): Player[] {
    const pool = allPlayers.filter(
        (p) => tierOf(p) === targetTier && !album.collected.includes(p.id),
    );
    return shuffled(pool).slice(0, 3);
}

/**
 * Execute a trade (immutable): spend `STICKER_TRADE_COST[targetTier]` duplicates
 * from the pool (any mix; deduction order is arbitrary and not user-visible) and
 * collect `chosenPlayerId`. Throws if the album cannot afford it (callers gate on
 * `canAffordTrade` first).
 */
export function executeTrade(
    album: AlbumState,
    targetTier: StickerTier,
    chosenPlayerId: string,
): AlbumState {
    const cost = STICKER_TRADE_COST[targetTier];
    if (totalDuplicates(album) < cost) {
        throw new Error(`executeTrade: cannot afford ${targetTier} (needs ${cost})`);
    }
    const duplicates: Record<string, number> = { ...album.duplicates };
    let remaining = cost;
    for (const id of Object.keys(duplicates)) {
        if (remaining <= 0) break;
        const take = Math.min(duplicates[id], remaining);
        duplicates[id] -= take;
        remaining -= take;
        if (duplicates[id] <= 0) delete duplicates[id];
    }
    const collected = album.collected.includes(chosenPlayerId)
        ? album.collected
        : [...album.collected, chosenPlayerId];
    return { ...album, collected, duplicates };
}

/** The subset of ids not yet in the album (the genuinely new stickers). Drives the
 *  run-end summary (shown only when this is non-empty, FR-8). */
export function pendingNewStickers(album: AlbumState, ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (album.collected.includes(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

export interface AlbumStatsView {
    total: number;
    collected: number;
    byTier: Record<StickerTier, { total: number; collected: number }>;
}

/** Completion counts for the header and per-tier display. Pure; called on render. */
export function albumStats(album: AlbumState, allPlayers: Player[]): AlbumStatsView {
    const collectedSet = new Set(album.collected);
    const byTier = {
        legendary: { total: 0, collected: 0 },
        iconic: { total: 0, collected: 0 },
        monumental: { total: 0, collected: 0 },
    } as Record<StickerTier, { total: number; collected: number }>;
    let total = 0;
    let collected = 0;
    for (const p of allPlayers) {
        const tier = tierOf(p);
        if (!tier) continue;
        total++;
        byTier[tier].total++;
        if (collectedSet.has(p.id)) {
            collected++;
            byTier[tier].collected++;
        }
    }
    return { total, collected, byTier };
}
