import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Player } from '../data/types';
import { ALL_PLAYERS, basePlayer } from '../data/squads';
import { isGroupFinished, userAdvanced } from '../domain/tournament';
import {
  albumStats,
  emptyAlbum,
  isCollectible,
  type AlbumState,
  type AlbumStatsView,
} from '../domain/album';
import { FEATURES, type StickerTier } from '../config';
import { INITIAL_SWAPS, type Action, type GameState } from '../state/gameReducer';
import { isSignedIn, store } from '../state/store';

/** How long starting a new run waits for the previous one's stickers to save. Long
 *  enough that the summary is always seen on a working server, short enough that a
 *  dead one is only a brief pause. */
const BANK_WAIT_MS = 4000;

/** Collectible ids among these players, judged on their DATASET rating (`basePlayer`):
 *  Cup Run boosts hand out modified copies, and a boost must not turn an 89 into a
 *  Legendary sticker. It would also be rejected server-side, since the catalogue is
 *  generated from base ratings - which is exactly the bug this fixes. */
function collectibleIdsOf(players: Player[]): string[] {
  return players.map(basePlayer).filter(isCollectible).map((p) => p.id);
}

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
  /** A Cup Run reported its end (CupRunScreen calls this once). `boostedIds` are the
   *  players a roster boost handed over, which earn nothing. */
  onCupRunEnd: (xi: Player[], wonCup: boolean, boostedIds: string[]) => void;
  /** Spend duplicates on a chosen sticker (album trade). */
  onTrade: (tier: StickerTier, playerId: string) => void;
  /** A new run is starting: drop any summary still pending from the last one. */
  onNewRun: () => void;
  /** A run's stickers are being saved. Starting another run waits on this, so the
   *  haul is always shown before the next run begins. Released after a few seconds
   *  regardless, so a slow or dead server cannot stop you playing. */
  banking: boolean;
  /** Whether wiping the album is offered at all. False while signed in: the collection
   *  is synced, `remoteStore.clearAlbum` refuses by design, and that refusal surfaces as
   *  the blocking unreachable screen (D9). Deleting the account is the account-level
   *  reset. */
  canResetAlbum: boolean;
  /** Wipe the album (collection + trade stats); leaves the game / career / run alone.
   *  A no-op unless `canResetAlbum`. */
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
  initialAlbum: AlbumState,
  allPlayers: Player[] = ALL_PLAYERS,
): StickerAlbumApi {
  const enabled = FEATURES.stickerAlbum;
  const { filled, stickersApplied, group, bracket, swapsLeft } = state;
  /** Collectible swaps spent this run, which the server validates against its cap. */
  const swapsUsed = INITIAL_SWAPS - swapsLeft;

  const [album, setAlbum] = useState<AlbumState>(() =>
    enabled ? initialAlbum : emptyAlbum(),
  );
  /** New (non-duplicate) ids earned this run -> shows the run-end summary. */
  const [newStickerIds, setNewStickerIds] = useState<string[] | null>(null);
  /** A bank is in flight, so the run-end effect must not start a second one. */
  const bankingRef = useRef(false);
  /** Bumped whenever a new run starts. Banking is a server round trip now, so its
   *  result can land after the player has already moved on - and a summary of the
   *  last run popping up mid-way through the next one is worse than not showing it.
   *  The album still updates; only the modal is dropped. This is the backstop: the
   *  usual case is that starting a run WAITS for the save (`banking` below), so the
   *  haul is seen first. */
  const runGenRef = useRef(0);
  /** True while a run's stickers are being saved. */
  const [banking, setBanking] = useState(false);
  const bankTimerRef = useRef<number | null>(null);
  /** A finished Cup Run's collectibles awaiting the sticker apply (its own path,
   *  since a Cup Run lives outside the reducer's group/bracket run-end). */
  const [cupRunSticker, setCupRunSticker] = useState<{ ids: string[]; wonCup: boolean } | null>(
    null,
  );

  // Collectibles in the final XI (derived, so autofill and swaps are handled for
  // free - no incremental pending log to keep in sync).
  const draftedCollectibleIds = useMemo(
    () => collectibleIdsOf(Object.values(filled).filter((p): p is Player => !!p)),
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
  // collectible ids from the final XI (the standard game passes the drafted XI's; a
  // Cup Run passes its own, minus anyone a roster boost handed it - see onCupRunEnd).
  // `markReducer` sets the once-per-run reducer guard, used only by the standard game
  // (a Cup Run guards itself).
  //
  // **How stickers are earned is `FEATURES.stickersOnCupWinOnly`** (added 2026-08-15).
  // On (the default) only a cup win banks: drafting a legend and going out in the group
  // used to bank them anyway, which made the album a record of who you had drafted
  // rather than what you had won. Off restores the old any-run behaviour.
  // Either way a losing run still reports in - so the run is recorded, `runs_played`
  // stays honest and the server-side active run is cleared - it just carries nothing.
  const applyStickers = useCallback(
    (collectibleIds: string[], wonCup: boolean, cupPickId: string | null, markReducer: boolean) => {
      // In flight already: the run-end effect can re-fire on a re-render, and the
      // reducer flag is now only set on success (below), so this ref is what stops a
      // second attempt overlapping the first.
      if (bankingRef.current) return;
      bankingRef.current = true;
      setBanking(true);
      // Never hold the player up for long: after this the run-start button unblocks and
      // the generation guard takes over for whatever lands late.
      if (bankTimerRef.current !== null) window.clearTimeout(bankTimerRef.current);
      bankTimerRef.current = window.setTimeout(() => setBanking(false), BANK_WAIT_MS);

      // A fresh id per bank. It was derived from the XI + outcome, which collided the
      // moment two runs ended the same way with the same collectibles - trivially so
      // for runs with none - and the server rightly refused the repeat as a duplicate.
      // The client's own once-per-run flags are the real guard; this key is what makes
      // a *retried* request idempotent server-side.
      const runKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const outcome = wonCup ? 'champion' : markReducer ? 'out' : 'run-end';
      const gen = runGenRef.current;
      // The rule, enforced in one place so no caller can bypass it.
      const earned = wonCup || !FEATURES.stickersOnCupWinOnly ? collectibleIds : [];

      void store
        .finishRun({ runKey, collectibleIds: earned, wonCup, cupPickId, swapsUsed, outcome })
        .then(({ album: next, newly }) => {
          setAlbum(next);
          // Only show the haul if this is still the run the player is looking at.
          if (runGenRef.current === gen) setNewStickerIds(newly);
          // Only now: a failure must leave the run bankable rather than silently
          // marking it done and losing the stickers.
          if (markReducer) dispatch({ type: 'MARK_STICKERS_APPLIED' });
        })
        .catch((err: unknown) => {
          console.error('banking this run failed', err);
        })
        .finally(() => {
          bankingRef.current = false;
          if (bankTimerRef.current !== null) {
            window.clearTimeout(bankTimerRef.current);
            bankTimerRef.current = null;
          }
          setBanking(false);
        });
    },
    [dispatch, swapsUsed],
  );

  // Bank stickers once when the run ends by loss/elimination. Cup wins wait for the
  // reward pick (pendingReward below), which then calls applyStickers.
  useEffect(() => {
    if (!enabled || stickersApplied || !runEnd || runEnd.wonCup) return;
    applyStickers(draftedCollectibleIds, false, null, true);
  }, [enabled, stickersApplied, runEnd, applyStickers, draftedCollectibleIds]);

  // A Cup Run reported its end (CupRunScreen calls this once). A loss banks
  // immediately; a cup win waits for the reward pick (pendingReward below).
  const onCupRunEnd = useCallback((xi: Player[], wonCup: boolean, boostedIds: string[]) => {
    // A player a boost handed you is not one you drafted, so he earns no sticker.
    // Legends Reunion and Wildcard Legend deal straight out of the 93+ pool, which
    // made a boost the cheapest route into the album - cheaper than winning with the
    // XI you actually built. The rest of the XI still counts, including a player an
    // earlier boost swapped OUT and left in `boostedIds`, since he is not in it.
    const gifted = new Set(boostedIds);
    const earnedBy = xi.filter((p) => !gifted.has(p.id));
    // Base ratings, not the boosted copies the run hands back (see `basePlayer`).
    setCupRunSticker({ ids: collectibleIdsOf(earnedBy), wonCup });
  }, []);
  useEffect(() => {
    if (!enabled || !cupRunSticker || cupRunSticker.wonCup) return;
    applyStickers(cupRunSticker.ids, false, null, false);
    setCupRunSticker(null);
  }, [enabled, cupRunSticker, applyStickers]);

  const onTrade = useCallback((tier: StickerTier, playerId: string) => {
    void store
      .trade(tier, playerId)
      .then(setAlbum)
      .catch((err: unknown) => console.error('trade failed', err));
  }, []);

  // Whether a reset is possible at all. An account's album is synced and
  // `remoteStore.clearAlbum` refuses on purpose, so the answer is no while signed in.
  // Read per render rather than subscribed to: signing in or out reloads the page.
  const canResetAlbum = enabled && !isSignedIn();

  // Manual album reset: wipe the stored album (collection + trade stats) and clear the
  // in-memory album. Leaves the game / career / run untouched.
  //
  // Two things here were bugs. The guard is not merely a hidden button: both callers (the
  // album screen's footer and a difficulty change) reached the store's refusal, and for an
  // account that refusal IS the blocking unreachable screen - so the app blamed the server
  // for a call it had never made. And the in-memory clear now waits for the write, because
  // doing it first left the UI showing an empty album while storage still held every
  // sticker, until a reload put it back.
  const onResetAlbum = useCallback(() => {
    if (!canResetAlbum) return;
    void store
      .clearAlbum()
      .then(() => setAlbum(emptyAlbum()))
      .catch((err: unknown) => console.error('resetting the album failed', err));
  }, [canResetAlbum]);

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

  const onNewRun = useCallback(() => {
    runGenRef.current += 1;
    setNewStickerIds(null);
    setCupRunSticker(null);
  }, []);

  return {
    enabled,
    album,
    summary,
    newStickerIds,
    onNewRun,
    banking,
    clearNewStickers: () => setNewStickerIds(null),
    pendingReward,
    onCupRunEnd,
    onTrade,
    canResetAlbum,
    onResetAlbum,
  };
}
