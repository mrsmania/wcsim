import { Trophy } from 'lucide-react';
import type { Player } from '../data/types';
import type { AlbumState } from '../domain/album';
import { collectiblePlayers, tierOf } from '../domain/album';
import { TIER_META } from './StickerCard';
import StickerCard from './StickerCard';
import Overlay from './Overlay';

interface Props {
  album: AlbumState;
  allPlayers: Player[];
  onPick: (playerId: string) => void;
}

/** Shown after a cup win (FR-3 / D-1): pick any one uncollected sticker from any
 *  tier. If everything is already collected, the pick becomes a duplicate. */
export default function CupRewardPicker({ album, allPlayers, onPick }: Props) {
  // The cup reward can pick any tier EXCEPT Monumental - the top tier is earned only
  // by drafting the player or trading, never as a free win reward.
  const pickable = collectiblePlayers(allPlayers).filter((p) => tierOf(p) !== 'monumental');
  const uncollected = pickable.filter((p) => !album.collected.includes(p.id));
  const allDone = uncollected.length === 0;
  const pool = (allDone ? pickable : uncollected)
    .slice()
    .sort((a, b) => TIER_META[tierOf(a)!].order - TIER_META[tierOf(b)!].order || b.elo - a.elo);

  return (
    <Overlay onClose={() => { /* not dismissible: a pick is required */ }} ariaLabel="Pick your prize">
      <div className="mb-4 flex items-center gap-3.5 rounded-md bg-pitch-dark p-4 text-white">
        <Trophy size={26} className="shrink-0 text-amber" strokeWidth={2} />
        <div>
          <div className="font-display text-lg font-black leading-none">World Champions</div>
          <div className="mt-1 text-[12px] text-white/80">
            Pick any one {allDone ? '' : 'uncollected '}Legendary or Iconic sticker.
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
