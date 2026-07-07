import type { Player } from '../data/types';
import type { StickerTier } from '../config';
import { TIER_META } from './StickerCard';
import StickerCard from './StickerCard';
import Overlay from './Overlay';
import { SECONDARY_BTN } from './matchUi';

interface Props {
  targetTier: StickerTier;
  costDuplicates: number;
  /** Up to 3 uncollected options of the target tier (FR-5: fewer if fewer remain). */
  options: Player[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
}

/** The trade "mini-draft": pick one of up to three uncollected stickers of the
 *  target tier in exchange for duplicates from the pool. */
export default function TradeModal({ targetTier, costDuplicates, options, onPick, onCancel }: Props) {
  const meta = TIER_META[targetTier];
  return (
    <Overlay onClose={onCancel} ariaLabel="Trade duplicates">
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-pitch">
        Trade duplicates
      </div>
      <h3 className="mt-1 font-display text-2xl font-black leading-tight tracking-[-0.02em]">
        Choose one {meta.name} sticker
      </h3>
      <p className="mb-4 mt-1.5 text-[13.5px] text-muted">
        Spend <b className="text-ink">{costDuplicates} duplicates</b> (any mix). The options are
        always uncollected, so no risk of a duplicate.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((p) => (
          <StickerCard
            key={p.id}
            player={p}
            tier={targetTier}
            collected
            onPick={() => onPick(p.id)}
          />
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={onCancel} className={`px-4 py-2.5 text-[13px] ${SECONDARY_BTN}`}>
          Cancel
        </button>
      </div>
    </Overlay>
  );
}
