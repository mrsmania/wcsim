import { useMemo } from 'react';
import type { Player } from '../data/types';
import { collectibleCards, type CollectibleCard } from '../domain/album';
import { tierRank } from '../config';
import StickerCard from './StickerCard';
import Overlay from './Overlay';
import { PRIMARY_BTN, btn } from './matchUi';

interface Props {
  /** Ids of genuinely new (non-duplicate) stickers earned this run. */
  newPlayerIds: string[];
  allPlayers: Player[];
  onClose: () => void;
  /** Go to the album (Play/Squads-style navigation handled by the parent). */
  onViewAlbum: () => void;
}

/** Post-run overlay (spec 5.7 / FR-8): shows the stickers just added, highlighted.
 *  The parent only renders this when `newPlayerIds` is non-empty. */
export default function RunEndStickerSummary({ newPlayerIds, allPlayers, onClose, onViewAlbum }: Props) {
  // Cards rather than players, so the tier travels with each one instead of being
  // recomputed and asserted at every use (hygiene H149).
  const cards = useMemo(() => {
    const byId = new Map(collectibleCards(allPlayers).map((c) => [c.player.id, c]));
    return newPlayerIds
      .map((id) => byId.get(id))
      .filter((c): c is CollectibleCard => !!c)
      .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || b.player.elo - a.player.elo);
  }, [newPlayerIds, allPlayers]);

  return (
    <Overlay onClose={onClose} ariaLabel="New stickers added">
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-pitch-ink">
        Run complete
      </div>
      {/* The count is IN the heading, and the line under it is gone (authenticity pass
          A11). The heading read "New stickers added" and the line under it read "3 new
          stickers added to your album this run", which is the heading again with a figure
          in it - so the figure moved up and the restatement went. Where they went is
          answered by the "View album" button rather than by a sentence. */}
      <h3 className="mb-4 mt-1 font-display text-2xl font-black leading-tight tracking-[-0.02em]">
        {cards.length} new sticker{cards.length === 1 ? '' : 's'}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {cards.map((c) => (
          <StickerCard key={c.player.id} player={c.player} tier={c.tier} collected isNew />
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2.5">
        <button onClick={onClose} className={btn('secondary')}>
          Done
        </button>
        <button onClick={onViewAlbum} className={PRIMARY_BTN}>
          View album
        </button>
      </div>
    </Overlay>
  );
}
