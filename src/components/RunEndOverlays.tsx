import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import type { PendingReward } from '../hooks/useStickerAlbum';
import CupRewardPicker from './CupRewardPicker';
import RunEndStickerSummary from './RunEndStickerSummary';

interface Props {
  album: AlbumState;
  allPlayers: Player[];
  /** The cup-win reward pick, when one is pending (blocks until picked). */
  pendingReward: PendingReward | null;
  /** The new stickers earned this run, when any (shown after the pick / a loss). */
  newStickerIds: string[] | null;
  onCloseSummary: () => void;
  onViewAlbum: () => void;
}

/**
 * The run-end sticker overlays (global, layered over any screen). A cup win shows the
 * reward picker first (blocks until picked), then the summary; a loss banks in the
 * hook, so only the summary shows (when at least one new sticker was earned). Both the
 * standard game and the Cup Run funnel through the same normalized `pendingReward`, so
 * there is one picker render for both.
 */
export default function RunEndOverlays({
  album,
  allPlayers,
  pendingReward,
  newStickerIds,
  onCloseSummary,
  onViewAlbum,
}: Props) {
  return (
    <>
      {pendingReward && (
        <CupRewardPicker album={album} allPlayers={allPlayers} onPick={pendingReward.onPick} />
      )}
      {newStickerIds && newStickerIds.length > 0 && (
        <RunEndStickerSummary
          newPlayerIds={newStickerIds}
          allPlayers={allPlayers}
          onClose={onCloseSummary}
          onViewAlbum={onViewAlbum}
        />
      )}
    </>
  );
}
