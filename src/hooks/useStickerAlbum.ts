import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../data/types';
import { ALL_PLAYERS, basePlayer } from '../data/squads';
import {
  albumStats,
  emptyAlbum,
  isCollectible,
  type AlbumState,
  type AlbumStatsView,
} from '../domain/album';
import { FEATURES, type StickerTier } from '../config';
import { INITIAL_SWAPS, type GameState } from '../state/gameReducer';
import { isSignedIn, store } from '../state/store';

/** How long starting a new run waits for the previous one's stickers to save. Long
 *  enough that the summary is always seen on a working server, short enough that a
 *  dead one is only a brief pause. */
const BANK_WAIT_MS = 4000;

/** How many collectible ids `finish_run` accepts for one run (migration 0010). Exceeding it
 *  raises, and the raise rolls the whole bank back - which for a signed-in player is the
 *  blocking unreachable screen, so the client stays under it rather than finding out. */
const BANK_CAP = 12;

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
  /** How many picks are still to be made. 1 normally; 2 with the Double Print boost, and
   *  it counts down as they are taken so the picker can say which one this is. */
  remaining: number;
  /** How many the run is owed in total, so the picker can render "1 of 2". */
  total: number;
  /** Picked already on this win, so the picker cannot offer the same card twice. */
  taken: string[];
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
  onCupRunEnd: (xi: Player[], wonCup: boolean, boostedIds: string[], cupPicks?: number) => void;
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
 * bank-on-loss effect, the cup-win `pendingReward` App renders as the CupRewardPicker,
 * and the trade / reset handlers.
 *
 * The once-per-run guard belongs to the run itself (RunState.stickersApplied, so
 * CupRunScreen only calls back once). A cup win banks only after the reward is picked;
 * a loss banks immediately (then the summary shows).
 */
export function useStickerAlbum(
  state: GameState,
  initialAlbum: AlbumState,
  allPlayers: Player[] = ALL_PLAYERS,
): StickerAlbumApi {
  const enabled = FEATURES.stickerAlbum;
  const { swapsLeft } = state;
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
  /** A finished Cup Run's collectibles awaiting the sticker apply. */
  const [cupRunSticker, setCupRunSticker] = useState<{ ids: string[]; wonCup: boolean; picks?: number } | null>(
    null,
  );

  // Merge a finished run's collectibles into the album. `collectibleIds` are the
  // collectible ids from the run's final XI, minus anyone a roster boost handed it
  // (see onCupRunEnd). The run guards itself against a second bank
  // (RunState.stickersApplied), so there is no flag to set here.
  //
  // **How stickers are earned is `FEATURES.stickersOnCupWinOnly`** (added 2026-08-15).
  // On (the default) only a cup win banks: drafting a legend and going out in the group
  // used to bank them anyway, which made the album a record of who you had drafted
  // rather than what you had won. Off restores the old any-run behaviour.
  // Either way a losing run still reports in - so the run is recorded, `runs_played`
  // stays honest and the server-side active run is cleared - it just carries nothing.
  const applyStickers = useCallback(
    (collectibleIds: string[], wonCup: boolean, cupPickIds: string[]) => {
      // In flight already: the run-end effect can re-fire on a re-render, so this ref
      // is what stops a second attempt overlapping the first.
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
      const outcome = wonCup ? 'champion' : 'run-end';
      const gen = runGenRef.current;
      // The rule, enforced in one place so no caller can bypass it.
      const earned = wonCup || !FEATURES.stickersOnCupWinOnly ? collectibleIds : [];
      // `finish_run` takes ONE cup pick, so a second (Double Print) rides along in the
      // collectible list - which is what `remoteStore` already does when the server
      // refuses a duplicate pick, so the path is proven.
      //
      // The server caps a run at BANK_CAP ids and rolls the whole bank back over it,
      // which for a signed-in player is the blocking unreachable screen. Eleven
      // collectibles in one XI is out of reach (the market cannot afford it and the
      // rolled draft has too few re-rolls), so this trim is a backstop rather than a
      // behaviour - but a silent refusal would be so much worse than a dropped extra
      // pick that it is worth the four lines.
      const [firstPick, ...extraPicks] = cupPickIds;
      const room = Math.max(0, BANK_CAP - earned.length - (firstPick ? 1 : 0));
      const withExtras = [...earned, ...extraPicks.slice(0, room)];

      void store
        .finishRun({
          runKey,
          collectibleIds: withExtras,
          wonCup,
          cupPickId: firstPick ?? null,
          swapsUsed,
          outcome,
        })
        .then(({ album: next, newly }) => {
          setAlbum(next);
          // Only show the haul if this is still the run the player is looking at.
          if (runGenRef.current === gen) setNewStickerIds(newly);
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
    [swapsUsed],
  );

  // A Cup Run reported its end (CupRunScreen calls this once). A loss banks
  // immediately; a cup win waits for the reward pick (pendingReward below).
  const onCupRunEnd = useCallback((xi: Player[], wonCup: boolean, boostedIds: string[], cupPicks = 1) => {
    // A player a boost handed you is not one you drafted, so he earns no sticker.
    // Legends Reunion and Wildcard Legend deal straight out of the 93+ pool, which
    // made a boost the cheapest route into the album - cheaper than winning with the
    // XI you actually built. The rest of the XI still counts, including a player an
    // earlier boost swapped OUT and left in `boostedIds`, since he is not in it.
    const gifted = new Set(boostedIds);
    const earnedBy = xi.filter((p) => !gifted.has(p.id));
    // Base ratings, not the boosted copies the run hands back (see `basePlayer`).
    setCupRunSticker({ ids: collectibleIdsOf(earnedBy), wonCup, picks: Math.max(1, cupPicks) });
  }, []);
  useEffect(() => {
    if (!enabled || !cupRunSticker || cupRunSticker.wonCup) return;
    applyStickers(cupRunSticker.ids, false, []);
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
  // Two things here were bugs. The guard is not merely a hidden button: the caller used to
  // reach the store's refusal, and for an account that refusal IS the blocking unreachable
  // screen - so the app blamed the server for a call it had never made. And the in-memory
  // clear now waits for the write, because doing it first left the UI showing an empty
  // album while storage still held every sticker, until a reload put it back.
  const onResetAlbum = useCallback(() => {
    if (!canResetAlbum) return;
    void store
      .clearAlbum()
      .then(() => setAlbum(emptyAlbum()))
      .catch((err: unknown) => console.error('resetting the album failed', err));
  }, [canResetAlbum]);

  // A cup win's pending reward, which App renders as the CupRewardPicker. Clearing the
  // transient carrier is the once-per-run guard here (the run's own
  // RunState.stickersApplied already blocks a re-report).
  // Picks taken so far on the pending cup reward. Held here rather than on the carrier so
  // the picker can be re-rendered without losing them.
  const [cupPicked, setCupPicked] = useState<string[]>([]);
  const pendingReward = useMemo<PendingReward | null>(() => {
    if (!enabled || !cupRunSticker?.wonCup) return null;
    const total = cupRunSticker.picks ?? 1;
    return {
      total,
      remaining: total - cupPicked.length,
      taken: cupPicked,
      onPick: (playerId) => {
        const picks = [...cupPicked, playerId];
        // Bank only once every pick the run earned has been made.
        if (picks.length < total) {
          setCupPicked(picks);
          return;
        }
        applyStickers(cupRunSticker.ids, true, picks);
        setCupPicked([]);
        setCupRunSticker(null);
      },
    };
  }, [enabled, cupRunSticker, cupPicked, applyStickers]);

  const summary = useMemo(
    () => (enabled ? albumStats(album, allPlayers) : null),
    [enabled, album, allPlayers],
  );

  const onNewRun = useCallback(() => {
    runGenRef.current += 1;
    setNewStickerIds(null);
    setCupRunSticker(null);
    setCupPicked([]);
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
