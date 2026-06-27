import { useState } from 'react';
import type { Formation } from '../domain/formations';
import { teamRating, type Filled } from '../domain/draft';

interface Props {
  formation: Formation;
  filled: Filled;
  onStart: () => void;
  onReset: () => void;
}

export default function CompletePanel({ formation, filled, onStart, onReset }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b-2 border-stone-900 pb-2">
        <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">COMPLETE</div>
        <h2 className="text-2xl font-black leading-tight">Your XI is set ⚽</h2>
        <div className="text-lg font-bold text-red-600">
          Formation {formation.name} · avg elo {teamRating(formation, filled)}
        </div>
      </div>

      <p className="text-sm text-stone-600">
        You'll be drawn into a group of 4. Play all three matchdays — finish in the top two to reach
        the knockouts.
      </p>

      <button
        onClick={onStart}
        className="rounded-xl bg-red-600 px-5 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-red-500 active:scale-[0.99]"
      >
        ⚽ Start the World Cup
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
