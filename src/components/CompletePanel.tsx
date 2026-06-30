import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Formation } from '../domain/formations';
import { teamRating, type Filled } from '../domain/draft';
import { teamChemistry } from '../domain/chemistry';
import { FEATURES } from '../config';

interface Props {
  formation: Formation;
  filled: Filled;
  onStart: () => void;
  onReset: () => void;
}

export default function CompletePanel({ formation, filled, onStart, onReset }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const base = teamRating(formation, filled);
  const chem = FEATURES.chemistry ? teamChemistry(formation, filled) : null;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-4 shadow-hard">
      <div className="border-b border-line pb-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted">Complete</div>
        <h2 className="font-display text-2xl font-extrabold leading-tight">Your XI is set ⚽</h2>
        <div className="text-lg font-bold text-pitch">
          Formation {formation.name} · avg rating {base}
          {chem && chem.bonus > 0 && (
            <span className="text-amber"> · chem +{chem.bonus} → {base + chem.bonus}</span>
          )}
        </div>
      </div>


      <p className="text-sm text-muted">
        You'll be drawn into a group of 4. Play all three matchdays, finish in the top two to reach
        the knockouts.
      </p>

      <button
        onClick={onStart}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-pitch px-6 py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-soft transition hover:bg-pitch-dark active:scale-[0.99]"
      >
        Start the World Cup
        <ArrowRight size={18} strokeWidth={2.5} />
      </button>

      {confirmReset ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Discard your XI?</span>
          <button
            onClick={onReset}
            className="rounded-lg bg-loss px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:opacity-90"
          >
            Yes, reset
          </button>
          <button
            onClick={() => setConfirmReset(false)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:border-pitch hover:text-pitch"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmReset(true)}
          className="self-start rounded-lg border border-line px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-pitch hover:text-pitch"
        >
          Start over
        </button>
      )}
    </div>
  );
}
