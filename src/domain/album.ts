import type { Player, Position } from '../data/types';
import {
    STICKER_TIERS,
    STICKER_TIER_ORDER,
    STICKER_TRADE_COST,
    tierRank,
    type StickerTier,
} from '../config';
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
    for (const tier of STICKER_TIER_ORDER) {
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

/** The filled slots a held collectible could swap into, given who is already used. The
 *  per-slot half of the swap rule, derived on top of `canSwapInto` in the pitch before
 *  (hygiene H58). Empty when there is no incoming player.
 *
 *  Slots, not a boolean: the board lights each eligible slot individually. */
export function swapTargetSlots(
    incoming: Player | null,
    slots: { id: string; position: Position }[],
    filled: Record<string, Player | null | undefined>,
    usedPersonIds: Set<string>,
): Set<string> {
    const out = new Set<string>();
    if (!incoming) return out;
    for (const s of slots) {
        const occupant = filled[s.id];
        if (occupant && canSwapInto(incoming, occupant, s.position, usedPersonIds)) out.add(s.id);
    }
    return out;
}

/** Which of `candidates` can be swapped in at all: a collectible with at least one filled
 *  slot it could take. The SET-level half of the same rule, derived in `App` before.
 *
 *  Note what stays the caller's business: whether any swaps remain, and where
 *  `usedPersonIds` comes from. App reads it from reducer state and the board derives it
 *  from `filled`, and the two are not interchangeable - passing the wrong one shifts the
 *  rule rather than tidying it. */
export function swapEligibleIds(
    candidates: Player[],
    slots: { id: string; position: Position }[],
    filled: Record<string, Player | null | undefined>,
    usedPersonIds: Set<string>,
): Set<string> {
    const ids = new Set<string>();
    for (const p of candidates) {
        if (swapTargetSlots(p, slots, filled, usedPersonIds).size > 0) ids.add(p.id);
    }
    return ids;
}

/** Every collectible player in a flat list (the caller passes the dataset in, so
 *  this module stays pure and free of a `data/squads` import). */
export function collectiblePlayers(allPlayers: Player[]): Player[] {
    return allPlayers.filter(isCollectible);
}

/** A collectible and its tier, together. `isCollectible` computes the tier and throws it
 *  away, so every caller of `collectiblePlayers` wrote `tierOf(p)!` to get it back - and two
 *  of them did it twice inside one comparator, recomputing the tier four times per
 *  comparison as well as asserting it (hygiene H149). */
export interface CollectibleCard {
    player: Player;
    tier: StickerTier;
}

/** Every collectible, carrying the tier that made it one. Prefer this over
 *  `collectiblePlayers` wherever the tier is wanted: it cannot be null here, so nothing
 *  needs asserting. */
export function collectibleCards(allPlayers: Player[]): CollectibleCard[] {
    const out: CollectibleCard[] = [];
    for (const player of allPlayers) {
        const tier = tierOf(player);
        if (tier) out.push({ player, tier });
    }
    return out;
}

/** The collectibles grouped by tier, each sorted rating-desc then by name - the order
 *  the album grid and the cabinet's tier strips both read in. Here rather than in a
 *  component because "which tier is a player in" is already this module's job and every
 *  caller was otherwise re-deriving the tier it had just proved.
 *  (`AlbumScreen` still hand-rolls its own copy; folding it in is hygiene item H45.) */
export function collectiblesByTier(allPlayers: Player[]): Record<StickerTier, Player[]> {
    const groups: Record<StickerTier, Player[]> = { monumental: [], iconic: [], legendary: [] };
    for (const p of allPlayers) {
        const tier = tierOf(p);
        if (tier) groups[tier].push(p);
    }
    for (const list of Object.values(groups)) {
        list.sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
    }
    return groups;
}

/** What a cup win may pick from, best tier first then rating-desc (album spec FR-3 / D-1).
 *  This is the rule that decides what the album can gain for winning, and it was living
 *  inside the overlay that renders it (hygiene H142).
 *
 *  Three things about it, all load-bearing:
 *   - **Monumental is excluded FIRST**, so the fallback pool below is Monumental-free too.
 *     The top tier is earned by drafting the player or by trading, never as a free reward.
 *   - `taken` is what this same win has already picked, so Double Print's second pick
 *     cannot repeat its first and bank a duplicate for a card that promised two stickers.
 *   - When nothing pickable is left uncollected the pool falls back to the WHOLE pickable
 *     set, so the pick becomes a deliberate duplicate rather than an empty screen. That
 *     fallback is the reason migration 0012 dropped the server's already-collected check:
 *     the picker draws from the player's selected World Cups, so a finished 2022 pool
 *     legally offers duplicates while uncollected 1990 cards still exist. Do not
 *     reintroduce an exhaustion test on either side of the wire.
 *
 *  Returns CARDS, not bare players: the picker renders each with its tier, and handing back
 *  players made it recover the tier with an assertion (hygiene H149). */
export function cupRewardPool(
    album: AlbumState,
    allPlayers: Player[],
    taken: string[] = [],
): CollectibleCard[] {
    const pickable = collectibleCards(allPlayers).filter((c) => c.tier !== 'monumental');
    const uncollected = pickable.filter(
        (c) => !album.collected.includes(c.player.id) && !taken.includes(c.player.id),
    );
    const pool = uncollected.length
        ? uncollected
        : pickable.filter((c) => !taken.includes(c.player.id));
    return pool
        .slice()
        .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.player.elo - a.player.elo);
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
    const byTier: Record<StickerTier, { total: number; collected: number }> = {
        legendary: { total: 0, collected: 0 },
        iconic: { total: 0, collected: 0 },
        monumental: { total: 0, collected: 0 },
    };
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
