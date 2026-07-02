import { useMemo } from 'react';
import type { Player } from '../data/types';
import { tierOf } from '../domain/album';
import { TIER_META } from './StickerCard';
import StickerCard from './StickerCard';
import Overlay from './Overlay';
import { PRIMARY_BTN, SECONDARY_BTN } from './matchUi';

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
  const cards = useMemo(() => {
    const byId = new Map(allPlayers.map((p) => [p.id, p] as const));
    return newPlayerIds
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p && tierOf(p) !== null)
      .sort((a, b) => TIER_META[tierOf(a)!].order - TIER_META[tierOf(b)!].order || b.elo - a.elo);
  }, [newPlayerIds, allPlayers]);

  return (
    <Overlay onClose={onClose} ariaLabel="New stickers added">
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-pitch">
        Run complete
      </div>
      <h3 className="mt-1 font-display text-2xl font-black leading-tight tracking-[-0.02em]">
        New stickers added
      </h3>
      <p className="mb-4 mt-1.5 text-[13.5px] text-muted">
        <b className="text-ink">
          {cards.length} new sticker{cards.length === 1 ? '' : 's'}
        </b>{' '}
        added to your album this run.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {cards.map((p) => (
          <StickerCard key={p.id} player={p} tier={tierOf(p)!} collected isNew />
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2.5">
        <button onClick={onClose} className={`px-4 py-2.5 text-[13px] ${SECONDARY_BTN}`}>
          Done
        </button>
        <button onClick={onViewAlbum} className={PRIMARY_BTN}>
          View album
        </button>
      </div>
    </Overlay>
  );
}
