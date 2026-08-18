import { Check, Star } from 'lucide-react';
import type { StickerTier } from '../config';
import { GOLD_INK, TIER_META } from './StickerCard';

/** A small tier-coloured disc marking a collectible player. Shared by the drawn-squad
 *  list, the transfer market, the line-up sheet, and the squad browser so the marker is
 *  identical everywhere. Callers gate on `FEATURES.stickerAlbum` and pass a non-null tier.
 *
 *  Two states, because "is collectible" and "you already own this one" are different
 *  facts and the second is the one you want while picking players:
 *    * `Star` - collectible, not in your album yet, so worth drafting for it
 *    * `Check` - already collected
 *  Same disc, same tier colour, same size either way: only the glyph changes, so a list
 *  of rows does not reflow and the tier stays readable.
 *
 *  **Keep the two glyphs different SHAPES.** This first tried lucide's `StarCheck` for the
 *  owned state, which differs from `Star` only by a small tick off the lower-right point:
 *  at badge size the two states were indistinguishable, and it took an 18px disc to make
 *  the tick survive at all. A plain check reads instantly at 15px, which is why the disc
 *  could go back to matching every other list. Anything star-shaped for "owned" brings the
 *  problem back.
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
  const Glyph = owned ? Check : Star;
  return (
    <span
      className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full"
      style={{
        background: TIER_META[tier].accent,
        color: tier === 'monumental' ? GOLD_INK : '#fff',
      }}
      title={`${owned ? 'In your album' : 'Collectible'} · ${TIER_META[tier].name}`}
    >
      <Glyph size={11} strokeWidth={2.75} aria-hidden="true" />
    </span>
  );
}
