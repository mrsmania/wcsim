import { Star, StarCheck } from 'lucide-react';
import type { StickerTier } from '../config';
import { GOLD_INK, TIER_META } from './StickerCard';

/** A small tier-coloured disc marking a collectible player. Shared by the drawn-squad
 *  list, the transfer market, the line-up sheet, and the squad browser so the marker is
 *  identical everywhere. Callers gate on `FEATURES.stickerAlbum` and pass a non-null tier.
 *
 *  Two states, because "is collectible" and "you already own this one" are different
 *  facts and the second is the one you want while picking players:
 *    * `Star` - collectible, not in your album yet, so worth drafting for it
 *    * `StarCheck` - already collected
 *  Same disc, same tier colour, same size either way: only the glyph changes, so a list
 *  of rows does not reflow and the tier stays readable.
 *
 *  **The geometry is load-bearing.** StarCheck differs from Star only by a small tick off
 *  the lower-right point, so it has to be drawn big enough for that tick to survive: at an
 *  18px disc with a 13px icon it reads, and at the 15px/9px this started as the two states
 *  were indistinguishable, which defeats the whole point of having two. Do not shrink it
 *  back without checking both states side by side at real size.
 *
 *  Deliberately binary - holding duplicates reads the same as owning one, and the
 *  duplicate pool is already on the album screen. */
export default function CollectibleStar({
  tier,
  owned = false,
}: {
  tier: StickerTier;
  /** Whether this player's sticker is already in the album. */
  owned?: boolean;
}) {
  const Glyph = owned ? StarCheck : Star;
  return (
    <span
      className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
      style={{
        background: TIER_META[tier].accent,
        color: tier === 'monumental' ? GOLD_INK : '#fff',
      }}
      title={`${owned ? 'In your album' : 'Collectible'} · ${TIER_META[tier].name}`}
    >
      <Glyph size={13} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}
