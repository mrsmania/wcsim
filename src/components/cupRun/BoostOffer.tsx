import type { Boon } from '../../domain/boons';
import type { GroupTeam } from '../../domain/tournament';
import Flag from '../Flag';
import { RARITY_COLOR } from './types';

/** The three-boost picker (rarity-topped cards) plus the "Next: opponent" line. Shared
 *  by the after-group screen (first boost) and the between-knockout-rounds boost phase.
 *  The next opponent shows flag + name + year so the year isn't lost. */
export default function BoostOffer({
  offer,
  nextOpponent,
  roundName,
  onPick,
  rerollsLeft = 0,
  onReroll,
}: {
  offer: Boon[];
  nextOpponent: GroupTeam | null;
  roundName: string;
  onPick: (b: Boon) => void;
  /** Physio Table perk: re-rolls of this offer still available in the run. */
  rerollsLeft?: number;
  onReroll?: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Pick a boost
          {onReroll && rerollsLeft > 0 && (
            <button
              type="button"
              onClick={onReroll}
              className="rounded-full border border-line px-2 py-0.5 text-[10px] tracking-[0.08em] text-muted transition hover:border-pitch hover:text-pitch"
            >
              Re-roll ({rerollsLeft})
            </button>
          )}
        </span>
        {nextOpponent && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            Next: <Flag code={nextOpponent.code} className="h-3 w-[18px]" />
            <b className="text-ink">{nextOpponent.name}</b>
            {nextOpponent.year != null && <span>{nextOpponent.year}</span>} in {roundName}
          </span>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {offer.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b)}
            className="flex flex-col gap-1.5 rounded-md border border-line bg-panel p-3 text-left transition hover:-translate-y-0.5 hover:border-pitch"
            style={{ borderTop: `3px solid ${RARITY_COLOR[b.rarity]}` }}
          >
            <span
              className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: RARITY_COLOR[b.rarity] }}
            >
              {b.rarity}
            </span>
            <span className="font-display text-[14px] font-extrabold leading-tight">{b.name}</span>
            <span className="text-[11.5px] leading-snug text-muted">{b.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
