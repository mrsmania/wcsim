import type { StickerTier } from '../config';
import { GOLD_INK, TIER_META } from './StickerCard';

/** A small tier-coloured disc marking a collectible player. Shared by the drawn-squad
 *  list, the transfer market, the line-up sheet, and the squad browser so the marker is
 *  identical everywhere. Callers gate on `FEATURES.stickerAlbum` and pass a non-null tier.
 *
 *  Two states, because "is collectible" and "you already have this one" are different
 *  facts and the second is the one you want while picking players:
 *    * a **star** - collectible, not in your album yet, so worth drafting for it
 *    * a **tick** - already collected
 *  Same disc, same tier colour, same size either way: only the glyph changes, so a list
 *  of rows does not reflow and the tier stays readable at 15px. Deliberately binary -
 *  holding duplicates reads the same as owning one, and the duplicate pool is already on
 *  the album screen. */
export default function CollectibleStar({
  tier,
  owned = false,
}: {
  tier: StickerTier;
  /** Whether this player's sticker is already in the album. */
  owned?: boolean;
}) {
  return (
    <span
      className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold leading-none"
      style={{
        background: TIER_META[tier].accent,
        color: tier === 'monumental' ? GOLD_INK : '#fff',
      }}
      title={`${owned ? 'In your album' : 'Collectible'} · ${TIER_META[tier].name}`}
    >
      {owned ? '✓' : '★'}
    </span>
  );
}
