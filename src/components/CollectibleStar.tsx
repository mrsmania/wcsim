import type { StickerTier } from '../config';
import { TIER_META } from './StickerCard';

/** A small tier-coloured star marking a collectible player. Shared by the drawn-squad
 *  list, the line-up sheet, and the squad browser so the marker is identical
 *  everywhere. Callers gate on `FEATURES.stickerAlbum` and pass a non-null tier. */
export default function CollectibleStar({ tier }: { tier: StickerTier }) {
  return (
    <span
      className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold leading-none"
      style={{
        background: TIER_META[tier].accent,
        color: tier === 'monumental' ? '#3a2a06' : '#fff',
      }}
      title={`Collectible · ${TIER_META[tier].name}`}
    >
      &#9733;
    </span>
  );
}
