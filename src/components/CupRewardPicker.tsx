import { Trophy } from 'lucide-react';
import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import { cupRewardPool, tierOf } from '../domain/album';
import StickerCard from './StickerCard';
import Overlay from './Overlay';

interface Props {
  album: AlbumState;
  allPlayers: Player[];
  onPick: (playerId: string) => void;
  /** Which pick this is and how many the run earned (Double Print grants two). Both
   *  default to one, which is every run that did not take that card. */
  remaining?: number;
  total?: number;
  /** Already picked this run, so a second pick cannot repeat the first. */
  taken?: string[];
}

/** Shown after a cup win (FR-3 / D-1): pick any one uncollected sticker from any
 *  tier. If everything is already collected, the pick becomes a duplicate. */
export default function CupRewardPicker({
  album,
  allPlayers,
  onPick,
  remaining = 1,
  total = 1,
  taken = [],
}: Props) {
  // The rule itself is `cupRewardPool` in domain/album.ts, which is where it belongs: it
  // decides what the album can gain for a cup win. What is left here is the copy, which
  // needs to know whether the pool is uncollected cards or a deliberate duplicate.
  const pool = cupRewardPool(album, allPlayers, taken);
  // "Nothing pickable is uncollected", which is exactly the condition that made
  // `cupRewardPool` fall back to offering duplicates. Written against the pool it
  // returned rather than recomputed from scratch, and equivalent in all three cases
  // including an empty pool.
  const allDone = !pool.some((p) => !album.collected.includes(p.id) && !taken.includes(p.id));

  return (
    <Overlay onClose={() => { /* not dismissible: a pick is required */ }} ariaLabel="Pick your prize">
      <div className="mb-4 flex items-center gap-3.5 rounded-md bg-pitch-dark p-4 text-white">
        <Trophy size={26} className="shrink-0 text-amber" strokeWidth={2} />
        <div>
          <div className="font-display text-lg font-black leading-none">World Champions</div>
          <div className="mt-1 text-[12px] text-white/80">
            Pick any one {allDone ? '' : 'uncollected '}Legendary or Iconic sticker.
            {total > 1 && (
              <span className="ml-1 font-semibold text-amber">
                Pick {total - remaining + 1} of {total}.
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {pool.map((p) => (
          <StickerCard
            key={p.id}
            player={p}
            tier={tierOf(p)!}
            collected
            onPick={() => onPick(p.id)}
          />
        ))}
      </div>
      {allDone && (
        <p className="mt-4 text-xs italic text-muted">
          You have collected every Legendary and Iconic sticker, so your pick will add a duplicate to the trade pool.
        </p>
      )}
    </Overlay>
  );
}
