import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
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
    <div className="flex flex-col gap-4">
      <div className="border-b-2 border-stone-900 pb-2">
        <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">COMPLETE</div>
        <h2 className="text-2xl font-black leading-tight">Your XI is set ⚽</h2>
        <div className="text-lg font-bold text-red-600">
          Formation {formation.name} · avg elo {base}
          {chem && chem.bonus > 0 && (
            <span className="text-emerald-700"> · chem +{chem.bonus} → {base + chem.bonus}</span>
          )}
        </div>
      </div>

      {chem && chem.links.length > 0 && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-600/[0.06] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
            <Sparkles size={13} strokeWidth={2.5} /> Chemistry breakdown
          </div>
          <ul className="flex flex-col gap-1">
            {chem.links.map((l) => (
              <li key={l.dimension + l.label} className="flex items-center justify-between text-xs">
                <span className="text-stone-600">{l.label}</span>
                <span className="ml-2 font-mono font-semibold text-stone-500">+{Math.round(l.points)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-emerald-600/20 pt-1.5 text-[11px] text-stone-500">
            {chem.bonus > 0
              ? `Cohesion lifts your overall by +${chem.bonus} in matches.`
              : 'Not enough links yet for a rating bonus — a more connected XI scores higher.'}
          </div>
        </div>
      )}

      <p className="text-sm text-stone-600">
        You'll be drawn into a group of 4. Play all three matchdays — finish in the top two to reach
        the knockouts.
      </p>

      <button
        onClick={onStart}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
      >
        Start the World Cup
        <ArrowRight size={18} strokeWidth={2.5} />
      </button>

      {confirmReset ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-stone-600">Discard your XI?</span>
          <button
            onClick={onReset}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-red-500"
          >
            Yes, reset
          </button>
          <button
            onClick={() => setConfirmReset(false)}
            className="rounded border border-stone-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:border-stone-900"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmReset(true)}
          className="self-start rounded border border-stone-400 px-4 py-2 text-sm font-bold uppercase tracking-wide transition hover:border-stone-900 hover:bg-stone-900 hover:text-white"
        >
          Start over
        </button>
      )}
    </div>
  );
}
