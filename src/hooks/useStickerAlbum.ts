import { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react';
import type { Player } from '../data/types';
import { ALL_PLAYERS } from '../data/squads';
import { isGroupFinished, userAdvanced } from '../domain/tournament';
import {
  albumStats,
  applyRunStickers,
  emptyAlbum,
  executeTrade,
  isCollectible,
  pendingNewStickers,
  type AlbumState,
  type AlbumStatsView,
} from '../domain/album';
import { FEATURES, type StickerTier } from '../config';
import type { Action, GameState } from '../state/gameReducer';
import { loadAlbum, saveAlbum, loadStats, saveStats, clearAlbum } from '../state/albumStorage';

/** A normalized cup-win reward awaiting the player's pick. The standard game and the
 *  Cup Run both funnel into this one shape (ids to bank + an onPick that applies them
 *  with the right once-per-run guard), so a single CupRewardPicker render serves both. */
export interface PendingReward {
  onPick: (playerId: string) => void;
}

export interface StickerAlbumApi {
  /** Whether the album feature is on (FEATURES.stickerAlbum). */
  enabled: boolean;
  /** The current collection (in memory, mirrored to its own localStorage key). */
  album: AlbumState;
  /** Completion counts for the header / album summary card (null when off). */
  summary: AlbumStatsView | null;
  /** New (non-duplicate) ids earned this run -> drives the run-end summary. */
  newStickerIds: string[] | null;
  clearNewStickers: () => void;
  /** The pending cup-win reward pick (null when there is none), shared by both modes. */
  pendingReward: PendingReward | null;
  /** A Cup Run reported its end (CupRunScreen calls this once). */
  onCupRunEnd: (xi: Player[], wonCup: boolean) => void;
  /** Spend duplicates on a chosen sticker (album trade). */
  onTrade: (tier: StickerTier, playerId: string) => void;
  /** Wipe the album (collection + trade stats); leaves the game / career / run alone. */
  onResetAlbum: () => void;
}

/**
 * Owns the entire sticker-album lifecycle that used to live inline in App: the album
 * useState, the run-end apply (banking the final XI's collectibles once per run), the
 * bank-on-loss effects for BOTH the standard game and the Cup Run, and the trade /
 * reset handlers. It normalizes the two cup-win flows into a single `pendingReward`
 * so App renders one CupRewardPicker.
 *
 * Once-per-run guards are preserved exactly: the standard game gates on the reducer's
 * `stickersApplied` flag (set via MARK_STICKERS_APPLIED), and the Cup Run guards itself
 * (RunState.stickersApplied, so it only calls back once). A cup win banks only after the
 * reward is picked; a loss banks immediately (then the summary shows).
 */
export function useStickerAlbum(
  state: GameState,
  dispatch: Dispatch<Action>,
  allPlayers: Player[] = ALL_PLAYERS,
): StickerAlbumApi {
  const enabled = FEATURES.stickerAlbum;
  const { filled, stickersApplied, group, bracket } = state;

  const [album, setAlbum] = useState<AlbumState>(() =>
    enabled ? loadAlbum() : emptyAlbum(),
  );
  /** New (non-duplicate) ids earned this run -> shows the run-end summary. */
  const [newStickerIds, setNewStickerIds] = useState<string[] | null>(null);
  /** A finished Cup Run's collectibles awaiting the sticker apply (its own path,
   *  since a Cup Run lives outside the reducer's group/bracket run-end). */
  const [cupRunSticker, setCupRunSticker] = useState<{ ids: string[]; wonCup: boolean } | null>(
    null,
  );

  // Collectibles in the final XI (derived, so autofill and swaps are handled for
  // free - no incremental pending log to keep in sync).
  const draftedCollectibleIds = useMemo(
    () =>
      Object.values(filled)
        .filter((p): p is Player => !!p)
        .filter(isCollectible)
        .map((p) => p.id),
    [filled],
  );

  // The run's terminal state (persistent): group elimination, or the bracket end.
  const runEnd = useMemo<{ wonCup: boolean } | null>(() => {
    if (!enabled) return null;
    if (bracket) {
      if (bracket.outcome === 'champion') return { wonCup: true };
      if (bracket.outcome === 'out') return { wonCup: false };
      return null;
    }
    if (group && isGroupFinished(group) && !userAdvanced(group)) return { wonCup: false };
    return null;
  }, [enabled, bracket, group]);

  // Merge a finished run's collectibles into the album. `collectibleIds` are the
  // collectible ids from the final XI (the standard game passes the drafted XI's;
  // a Cup Run passes its own, boons included). `markReducer` sets the once-per-run
  // reducer guard, used only by the standard game (a Cup Run guards itself).
  const applyStickers = useCallback(
    (collectibleIds: string[], wonCup: boolean, cupPickId: string | null, markReducer: boolean) => {
      const ids = cupPickId ? [...collectibleIds, cupPickId] : collectibleIds;
      const newly = pendingNewStickers(album, ids);
      const next = applyRunStickers(album, collectibleIds, wonCup, cupPickId);
      setAlbum(next);
      saveAlbum(next);
      const stats = loadStats();
      saveStats({
        runsPlayed: stats.runsPlayed + 1,
        stickersEarned: stats.stickersEarned + newly.length,
        tradesCompleted: stats.tradesCompleted,
      });
      if (markReducer) dispatch({ type: 'MARK_STICKERS_APPLIED' });
      setNewStickerIds(newly);
    },
    [album, dispatch],
  );

  // Bank stickers once when the run ends by loss/elimination. Cup wins wait for the
  // reward pick (pendingReward below), which then calls applyStickers.
  useEffect(() => {
    if (!enabled || stickersApplied || !runEnd || runEnd.wonCup) return;
    applyStickers(draftedCollectibleIds, false, null, true);
  }, [enabled, stickersApplied, runEnd, applyStickers, draftedCollectibleIds]);

  // A Cup Run reported its end (CupRunScreen calls this once). A loss banks
  // immediately; a cup win waits for the reward pick (pendingReward below).
  const onCupRunEnd = useCallback((xi: Player[], wonCup: boolean) => {
    setCupRunSticker({ ids: xi.filter(isCollectible).map((p) => p.id), wonCup });
  }, []);
  useEffect(() => {
    if (!enabled || !cupRunSticker || cupRunSticker.wonCup) return;
    applyStickers(cupRunSticker.ids, false, null, false);
    setCupRunSticker(null);
  }, [enabled, cupRunSticker, applyStickers]);

  const onTrade = useCallback(
    (tier: StickerTier, playerId: string) => {
      const next = executeTrade(album, tier, playerId);
      setAlbum(next);
      saveAlbum(next);
      const stats = loadStats();
      saveStats({ ...stats, tradesCompleted: stats.tradesCompleted + 1 });
    },
    [album],
  );

  // Manual album reset: wipe the album's localStorage (collection + trade stats) and
  // clear the in-memory album. Leaves the game / career / run untouched.
  const onResetAlbum = useCallback(() => {
    clearAlbum();
    setAlbum(emptyAlbum());
  }, []);

  // Normalize the two cup-win flows into one pending reward (standard game first,
  // then the Cup Run), so App renders a single CupRewardPicker. Each keeps its own
  // once-per-run guard: the standard game marks the reducer flag; the Cup Run clears
  // its transient carrier (its RunState.stickersApplied already blocks a re-report).
  const pendingReward = useMemo<PendingReward | null>(() => {
    if (!enabled) return null;
    if (runEnd?.wonCup && !stickersApplied) {
      return { onPick: (playerId) => applyStickers(draftedCollectibleIds, true, playerId, true) };
    }
    if (cupRunSticker?.wonCup) {
      return {
        onPick: (playerId) => {
          applyStickers(cupRunSticker.ids, true, playerId, false);
          setCupRunSticker(null);
        },
      };
    }
    return null;
  }, [enabled, runEnd, stickersApplied, cupRunSticker, applyStickers, draftedCollectibleIds]);

  const summary = useMemo(
    () => (enabled ? albumStats(album, allPlayers) : null),
    [enabled, album, allPlayers],
  );

  return {
    enabled,
    album,
    summary,
    newStickerIds,
    clearNewStickers: () => setNewStickerIds(null),
    pendingReward,
    onCupRunEnd,
    onTrade,
    onResetAlbum,
  };
}
