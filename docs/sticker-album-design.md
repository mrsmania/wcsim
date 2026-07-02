# Sticker Album — Architecture Design

**Status:** Ready for implementation
**Source of truth:** `docs/sticker-album-spec.html`
**Date:** 2026-06-29
**Reconciled with codebase:** 2026-07-02 — tier counts re-verified against the current
dataset (still 39 Legendary / 12 Iconic / 2 Monumental = 53, all elo >= 90); code
references below updated to the current names (`bracket`, `RECORD_BRACKET_ROUND`,
`KnockoutScreen`, routing) and the real `FEATURES` shape. Visual comps for the required
pages live at `docs/redesign-2026/turf-flat/sticker-album.html`.

---

## 1. Data Model

### `AlbumState`

```ts
// src/state/albumStorage.ts (or src/data/types.ts for the type only)

export interface AlbumState {
  /** Schema version — increment when the shape changes to enable migrations. */
  version: 1;
  /** Player IDs that have been collected (one entry per unique player). */
  collected: string[];
  /**
   * Duplicate count per player ID. A key exists only when duplicates > 0.
   * Does not include the first copy (the "collected" entry); only extras.
   * Example: collected once = collected has the id, duplicates has no entry.
   *          collected three times = duplicates[id] = 2.
   */
  duplicates: Record<string, number>;
}
```

Total duplicate pool size = `Object.values(album.duplicates).reduce((s, n) => s + n, 0)`.

### `PendingStickers`

```ts
/**
 * Stickers accumulated during an active run. Held outside AlbumState so
 * mid-run state never contaminates the persisted album.
 */
export type PendingStickers = string[]; // player IDs (may contain duplicates if same player drafted twice via autofill edge case)
```

### localStorage Keys

| Key | Contents | Notes |
|-----|----------|-------|
| `wcsim_album_v1` | `AlbumState` JSON | Main collection; separate from game state |
| `wcsim_album_stats_v1` | `AlbumStats` JSON | Lightweight telemetry for trade-cost calibration |
| `wcsim:game:v1` | existing | The persisted `GameState` (`state/persist.ts`). Unchanged. The album keys are deliberately separate so clearing/resetting a run never touches the album (FR-7). |

```ts
export interface AlbumStats {
  runsPlayed: number;
  stickersEarned: number;   // new (non-duplicate) stickers earned from drafting
  tradesCompleted: number;
}
```

### `isCollectible(player)`

A player is collectible if and only if their `elo` falls within any tier range defined in `STICKER_TIERS`:

```ts
// Derived in domain/album.ts — see section 3
function isCollectible(player: Player): boolean {
  return tierOf(player) !== null;
}
```

Tier membership is checked at runtime from `STICKER_TIERS` in `config.ts`. No separate lookup table is needed; any change to the config constant automatically updates the collectible set.

---

## 2. New Config Additions (`src/config.ts`)

```ts
// The live FEATURES object today is { chemistry, removePlayers, teamRatings,
// squadBrowser }. Add stickerAlbum alongside the existing flags:
export const FEATURES = {
  chemistry: true,
  removePlayers: false,
  teamRatings: true,
  squadBrowser: true,
  stickerAlbum: true,   // ADD: gate the entire feature
} as const;

// ADD: tier elo thresholds (inclusive on both ends)
export const STICKER_TIERS = {
  legendary:  { min: 90, max: 92 },
  iconic:     { min: 93, max: 96 },
  monumental: { min: 97, max: 99 },
} as const;

export type StickerTier = keyof typeof STICKER_TIERS;

// ADD: trade-in cost in total duplicates (any tier/mix) per target tier
export const STICKER_TRADE_COST: Record<StickerTier, number> = {
  legendary:  10,
  iconic:     20,
  monumental: 50,
} as const;
```

`StickerTier` is the canonical tier union type used throughout the codebase.

---

## 3. New Domain Module: `src/domain/album.ts`

Pure functions only. No React imports, no localStorage access.

### Function Signatures

```ts
import type { Player } from '../data/types';
import type { StickerTier, AlbumState } from '...'; // exact import paths TBD by implementer
```

#### `tierOf(player: Player): StickerTier | null`
Returns the tier name if the player's `elo` falls within a `STICKER_TIERS` range, or `null` if not collectible. Iterates over `Object.entries(STICKER_TIERS)`.

#### `isCollectible(player: Player): boolean`
Returns `tierOf(player) !== null`. Convenience wrapper used by draft sticker collection.

#### `collectiblePlayers(allPlayers: Player[]): Player[]`
Filters a flat player list to those where `isCollectible` is true. Used by `AlbumScreen` to build the display grid without importing squad data directly.

#### `applyRunStickers(album: AlbumState, pendingPlayerIds: string[], wonCup: boolean, cupPickPlayerId: string | null): AlbumState`
Merges pending stickers into the album at run-end.
- For each `pendingPlayerIds` entry: if not in `collected`, adds it; otherwise increments `duplicates[id]`.
- If `wonCup` is true and `cupPickPlayerId` is provided, applies that pick with the same collected/duplicate logic.
- Returns a new `AlbumState` (immutable update).
- Does not call `saveAlbum` -- that is the caller's responsibility.

#### `totalDuplicates(album: AlbumState): number`
Returns the sum of all values in `album.duplicates`. Used to check trade affordability.

#### `canAffordTrade(album: AlbumState, targetTier: StickerTier): boolean`
Returns `totalDuplicates(album) >= STICKER_TRADE_COST[targetTier]`.

#### `tradeOptions(album: AlbumState, targetTier: StickerTier, allPlayers: Player[]): Player[]`
Returns up to 3 randomly drawn uncollected players of `targetTier`.
- Filters `allPlayers` to those where `tierOf(p) === targetTier && !album.collected.includes(p.id)`.
- Shuffles and returns the first 3 (or fewer if fewer remain).
- Returns `[]` if none remain in that tier (caller hides the trade option).
- Uses `Math.random` internally (intentional -- matches existing sim pattern).

#### `executeTrade(album: AlbumState, targetTier: StickerTier, chosenPlayerId: string): AlbumState`
Executes a trade:
- Validates `canAffordTrade` (throws if not -- caller should gate on `canAffordTrade` first).
- Deducts `STICKER_TRADE_COST[targetTier]` from the duplicate pool (removes from cheapest/any until cost is met -- implementation note: simply subtract from total pool by decrementing per-player entries starting from arbitrary order; exact deduction order is not user-visible).
- Adds `chosenPlayerId` to `collected`.
- Returns new `AlbumState`.

#### `pendingNewStickers(album: AlbumState, pendingPlayerIds: string[]): string[]`
Returns the subset of `pendingPlayerIds` that are not yet in `album.collected`. Used by `RunEndStickerSummary` to decide whether to show the overlay (FR-8: show only if at least one new sticker earned) and which cards to highlight.

#### `albumStats(album: AlbumState, allPlayers: Player[]): { total: number; collected: number; byTier: Record<StickerTier, { total: number; collected: number }> }`
Computes completion counts for the summary header and per-tier display. Pure, stateless -- called on render.

---

## 4. State Integration

### Where `pendingStickers` lives

`pendingStickers` lives in `GameState` (the `useReducer` state), not in a separate hook or `AlbumState`. Reasons:

- The draft is already a reducer-managed phase machine. Tracking which collectible players were placed belongs to that machine.
- Keeping it in `GameState` means RESET clears pending stickers automatically (important: pending stickers must not survive a mid-run reset, per FR-2).
- Separation from `AlbumState` (which lives in localStorage) is maintained naturally: reducer state is ephemeral, localStorage state is persistent.

Add to `GameState`:

```ts
/**
 * Player IDs of collectible players drafted this run. Accumulated during
 * the draft phase; applied to the album at run-end (win or knockout).
 * Only populated when FEATURES.stickerAlbum is true.
 */
pendingStickers: string[];
```

Add to `initialState`: `pendingStickers: []`.

The `RESET` action already returns `initialState` (with `speed`/`auto` preserved), so `pendingStickers` is cleared automatically on reset.

### New Actions in the `Action` Union

```ts
// In gameReducer.ts Action union:

| {
    type: 'STICKER_COLLECT_PENDING';
    playerId: string;
    // Dispatched each time a collectible player is placed during the draft.
    // Reducer appends to pendingStickers.
  }

| {
    type: 'END_RUN_APPLY_STICKERS';
    wonCup: boolean;
    cupPickPlayerId: string | null;
    // Dispatched after the final match result screen (or elimination screen).
    // The reducer does NOT touch AlbumState directly -- App.tsx handles that
    // via albumStorage after dispatch, then navigates to the sticker summary.
  }

| {
    type: 'ALBUM_TRADE';
    targetTier: StickerTier;
    chosenPlayerId: string;
    // Dispatched from TradeModal. App.tsx calls executeTrade() and saveAlbum()
    // outside the reducer (album is not in GameState).
  }
```

Note: `ALBUM_TRADE` and cup-win pick do not need to live in `gameReducer` because `AlbumState` is not part of `GameState`. The reducer handles `pendingStickers` tracking only. Album mutations happen in `App.tsx` (or a custom hook) using the `albumStorage` module.

### Phase Transitions That Trigger Sticker Application

The knockout run is driven by `domain/bracket.ts`: the `RECORD_BRACKET_ROUND` action feeds
`recordRound`, which sets `bracket.outcome` to `'alive' | 'champion' | 'out'`. Sticker
application keys off that outcome (and off group-stage exit), detected in `App.tsx` after the
reducer updates.

1. **Knockout elimination** (`RECORD_BRACKET_ROUND` leaves `bracket.outcome === 'out'`): `App.tsx` dispatches `END_RUN_APPLY_STICKERS` with `wonCup: false`.
2. **Cup win** (`RECORD_BRACKET_ROUND` sets `bracket.outcome === 'champion'`): `App.tsx` shows `CupRewardPicker` first, then dispatches `END_RUN_APPLY_STICKERS` with `wonCup: true` and the chosen player ID.
3. **Group-stage elimination** also ends the run (spec + design Q3): `isGroupFinished(group) && !userAdvanced(group)` triggers sticker application and the `RunEndStickerSummary`, same as a knockout elimination.

The detection points already exist: `bracket.outcome` (surfaced in `KnockoutScreen` / `App.tsx`)
and the group exit via `isGroupFinished(group) && !userAdvanced(group)` (surfaced in
`TournamentScreen` / `App.tsx`).

---

## 5. localStorage Layer: `src/state/albumStorage.ts`

This is the only file that reads or writes `wcsim_album_v1` and `wcsim_album_stats_v1`.

```ts
export const ALBUM_KEY = 'wcsim_album_v1';
export const STATS_KEY = 'wcsim_album_stats_v1';

export function loadAlbum(): AlbumState
// Returns the stored album, or an empty default (version:1, collected:[], duplicates:{}).
// On JSON parse error or missing key, returns the default (never throws).

export function saveAlbum(album: AlbumState): void
// Serialises and writes album to ALBUM_KEY. Silently no-ops if localStorage is unavailable.

export function loadStats(): AlbumStats
// Returns stored stats, or { runsPlayed:0, stickersEarned:0, tradesCompleted:0 }.

export function saveStats(stats: AlbumStats): void
// Serialises and writes stats to STATS_KEY.

// Internal helper (not exported):
function emptyAlbum(): AlbumState { return { version: 1, collected: [], duplicates: {} }; }
```

No migration logic needed for v1. When a v2 schema is required, add a `migrate(raw: unknown): AlbumState` function inside this module.

`App.tsx` calls `loadAlbum()` once on mount (via `useState` initialiser, not `useEffect`, to avoid flicker). It passes `album` and `setAlbum` down to components or a context.

---

## 6. New Components

### `AlbumScreen` (`src/components/AlbumScreen.tsx`)
Full album view. Receives `album: AlbumState`, `allPlayers: Player[]`, `onTrade: (tier, playerId) => void`, `onClose: () => void`. Internally calls `albumStats()` for the counter. Renders sticker cards grouped by tier (Monumental first, then Iconic, then Legendary). Shows "Trade duplicates" buttons per tier when `canAffordTrade` is true. Opens `TradeModal` when a trade button is tapped. Shows a completion celebration state when `collected.length === total` (treatment TBD per spec 5.8).

### `StickerCard` (`src/components/StickerCard.tsx`)
Single sticker. Props: `player: Player`, `tier: StickerTier`, `collected: boolean`, `duplicateCount: number`. Collected: shows name, nation flag, rating, tier badge, duplicate count badge (`x3`) when `duplicateCount > 0`. Uncollected: shows name and nation only; player details are visually obscured (silhouette treatment via CSS, e.g. reduced opacity and blurred/greyed detail area). No player photo in v1.

**Image-ready (v2 switch is pathed).** Keep the text+flag markup as the *fallback* and layer an
optional image on top so real sticker art can be added later with zero data/schema change:

```tsx
// v1 today: text + flag only. v2 drops in images keyed by player.id, with fallback.
const artSrc = `${import.meta.env.BASE_URL}stickers/${player.id}.png`; // base-path aware
// render <img src={artSrc} onError={hideImg}/> over the text/flag face; if the file is
// absent (onError) or the feature is off, the existing text+flag card shows through.
```

Files live at `public/stickers/<player.id>.png` (same key the album uses), so populating art is a
pure content task. `AlbumState`, `config.ts`, and `domain/album.ts` are untouched by the switch.

### `RunEndStickerSummary` (`src/components/RunEndStickerSummary.tsx`)
Post-run overlay. Props: `newPlayerIds: string[]`, `allPlayers: Player[]`, `album: AlbumState`, `onClose: () => void`. Shown only when `newPlayerIds.length > 0` (FR-8). Displays "New stickers added" heading, lists newly earned sticker cards with highlight treatment. "View album" / "Done" button closes the overlay and returns to the setup screen.

### `CupRewardPicker` (`src/components/CupRewardPicker.tsx`)
Pick-your-prize screen shown after a cup win, before stickers are applied. Props: `album: AlbumState`, `allPlayers: Player[]`, `onPick: (playerId: string) => void`. Displays uncollected stickers from all tiers. If all stickers are already collected (FR-3 edge case), shows all players (since any pick would be a duplicate) with a note that it will become a duplicate. Calls `onPick` with the chosen player ID.

### `TradeModal` (`src/components/TradeModal.tsx`)
3-option pick UI. Props: `options: Player[]`, `targetTier: StickerTier`, `costDuplicates: number`, `onPick: (playerId: string) => void`, `onCancel: () => void`. Renders 1-3 `StickerCard` components (always uncollected). Player taps one to confirm the trade.

### Existing Components with Minor Changes

**`App.tsx`:**
- Add `album: AlbumState` and `setAlbum` state (loaded from `albumStorage` on mount).
- Add `albumStats` update helper that also calls `saveStats`.
- Detect run-end conditions (already present via `bracket.outcome` and group-stage checks) and wire up `END_RUN_APPLY_STICKERS` dispatch + `applyRunStickers` + `saveAlbum` call.
- Routing: the app branches on `location.pathname` (`/`, `/group`, `/knockout`, `/squads/*`).
  Add an **`/album`** route rendering `AlbumScreen` (consistent with the existing route-per-screen
  architecture and `state/persist.ts`). Reach it from a home-screen entry point per D-3 (a button
  in `SetupPanel`/`CompletePanel`), navigating via `useNavigate`; `AlbumScreen`'s `onClose` becomes
  a `navigate(-1)` / `navigate('/')`. The `RunEndStickerSummary` and `CupRewardPicker` remain modal
  overlays layered over the current screen rather than routes (they are transient run-end steps).
- Conditionally render `RunEndStickerSummary` when `pendingNewStickers` is non-empty.
- Conditionally render `CupRewardPicker` when `bracket.outcome === 'champion'` and the cup pick is not yet made.

**`gameReducer.ts`:**
- Add `pendingStickers: string[]` to `GameState`.
- Handle `STICKER_COLLECT_PENDING`: append `action.playerId` to `state.pendingStickers`.
- `RESET` already returns `initialState` so pending stickers are cleared automatically; add `pendingStickers: []` to `initialState`.

**`SetupPanel.tsx`:**
- Add an "Album" button/section (receives `onOpenAlbum: () => void` and `albumSummary: { collected: number; total: number }` as props). Position and styling TBD by implementer.

**`TournamentScreen.tsx` (group) and `KnockoutScreen.tsx` (bracket):**
- The two run-end points now live on separate screens: group-stage exit is detected in
  `TournamentScreen` (`isGroupFinished && !userAdvanced`), and the cup win / knockout elimination in
  `KnockoutScreen` (`bracket.outcome`). Either screen signals the parent (`App.tsx`) to begin the
  sticker-application flow. The screens already take an `onReset` callback for "Draft a new XI"; add a
  sibling `onRunEnd` (or fold it into the existing end-of-run effect in `App.tsx` that watches
  `bracket.outcome` / the group result) so the summary + album-apply run once per run end.

---

## 7. Feature Flag Behaviour

When `FEATURES.stickerAlbum = false`:

- `App.tsx` does not render the album entry button, `AlbumScreen`, `RunEndStickerSummary`, or `CupRewardPicker`.
- `App.tsx` does not call `loadAlbum()`, `saveAlbum()`, or `saveStats()` -- no localStorage reads or writes for album keys.
- `STICKER_COLLECT_PENDING` actions are never dispatched (check `FEATURES.stickerAlbum` before dispatching in `handlePlace` and `AUTOFILL` path).
- `pendingStickers` remains `[]` throughout any run.
- `END_RUN_APPLY_STICKERS` is never dispatched.
- The domain functions in `album.ts` exist but are never called; tree-shaking removes them from the bundle.

The flag check should be a single guard in `App.tsx` and in the draft placement handler -- not scattered through domain logic.

---

## 8. Resolved Design Decisions

**Q1 -- Album state in `App.tsx` vs. context: prop-drill.**
Keep `AlbumState` in `App.tsx` and prop-drill. The existing codebase has no context; stay consistent with that pattern for v1.

**Q2 -- `collectiblePlayers` dataset source: always pass `allPlayers` as a parameter.**
`domain/album.ts` must stay pure and must not import from `data/squads.ts`. All domain functions that need the full player list receive it as a parameter (`allPlayers: Player[]`). The caller (`App.tsx`) derives the list from `SQUADS` once and passes it down.

**Q3 -- Group-stage elimination counts as a run end.**
A group-stage exit triggers `RunEndStickerSummary` and applies pending stickers, same as a knockout elimination.

**Q4 -- `AUTOFILL` must collect stickers.**
When `FEATURES.stickerAlbum` is true, autofilled players must have their stickers collected. Scan the placed players after `AUTOFILL` dispatch (in `App.tsx`) and dispatch `STICKER_COLLECT_PENDING` for each collectible player.

**Q5 -- Album key is `player.id`; same person across tournaments = different stickers.**
Messi 2006 (`arg-2006-10`) and Messi 2022 (`arg-2022-10`) are distinct collectible cards. This is the intended Panini-style behaviour.

**Q6 -- Post-cup UI order: cup-pick then sticker-summary.**
Use a UI-phase enum in `App.tsx`: `'playing' | 'cup-pick' | 'sticker-summary' | 'album'`. Order after cup win: match result screen closes -> `CupRewardPicker` (album blocked during pick) -> `RunEndStickerSummary` -> setup screen.

**Q7 -- Duplicate deduction order: arbitrary.**
`executeTrade` decrements per-player duplicate entries in arbitrary iteration order until the cost is met. The exact order is not user-visible.

---

## 9. Draft Integration (v1.2 additions)

Two draft-screen features surfaced during design review. Both are gated behind
`FEATURES.stickerAlbum` (the swap mechanic can also stand alone, but ships with the album).
Comps: `docs/redesign-2026/turf-flat/draft-stickers.html`.

### 9.1 Collectible visibility in the draft (FR-9)

Purely presentational; no new state. `SquadPanel` already renders each drawn player's row
(number, name, positions, elo). Add a tier marker derived at render time:

```ts
import { tierOf } from '../domain/album'; // pure; returns StickerTier | null
const tier = FEATURES.stickerAlbum ? tierOf(player) : null; // null => no marker
```

- When `tier` is non-null, render a small tier-coloured "collectible" chip on the row (reuse the
  album's tier accents). Optionally add a "not yet in your album" hint by checking
  `!album.collected.includes(player.id)` (album is already in `App.tsx`; pass a `collectedIds:
  Set<string>` down, or omit for v1 and mark all collectibles the same).
- Show a one-line call-out above the roster when the drawn squad contains at least one collectible
  (`squad.players.some(p => tierOf(p))`), e.g. "Collectible available: Lionel Messi - Monumental".
- No effect on eligibility or draft logic; it only draws attention.

### 9.2 Swap an already-placed player (FR-10)

Lets the user replace a placed player with an eligible player from the current roll (matching the
slot's role), so a collectible can be brought in even when its position was already filled. This
generalises the existing `removePlayers` testing aid (`REMOVE_PLAYER`) into a first-class,
one-step swap.

**Reducer.** Add one action; keep it pure and self-contained (mirrors `PLACE_PLAYER`):

```ts
| { type: 'SWAP_PLAYER'; slotId: string; playerId: string }
// From the currentSquad, the player replacing whoever occupies slotId. Reducer:
//  - guard: slot exists, player is in currentSquad, canPlace(player, slot, filledWithoutOccupant)
//  - free the outgoing occupant's personId from usedPersonIds
//  - set filled[slotId] = incoming; add incoming.personId to usedPersonIds
//  - clear currentSquad + selectedPlayerId (like PLACE_PLAYER); phase stays 'complete'/'draft'
```

Because the outgoing player leaves the XI, their sticker must NOT be counted at run-end: derive
`pendingStickers` from the *final* `filled` XI at run-end (recommended) rather than trusting the
incremental `STICKER_COLLECT_PENDING` log, OR remove the outgoing id from `pendingStickers` in the
`SWAP_PLAYER` handler. The final-XI derivation is simpler and swap-proof: at run-end, walk
`Object.values(filled)`, keep the collectibles, and merge those into the album (autofill and swap
both fall out for free). Adjust FR-2/Q4 accordingly.

**UI.** Each placed slot gets a "swap" affordance (the pitch badge already supports a remove `x`
behind `removePlayers`; add a swap icon next to it). Tapping it enters a swap intent for that slot:
the `SquadPanel` highlights players in the current roll eligible for the slot's role; picking one
dispatches `SWAP_PLAYER`. A collectible in the roll whose positions are all filled shows a
"Swap in" call-to-action pointing at the matching filled slot(s).
