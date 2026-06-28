import type { MatchSpeed } from '../domain/clock';

const OPTIONS: { value: MatchSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

/** Slow / Normal / Fast selector for match-simulation playback speed. */
export default function SpeedControl({
  speed,
  onSetSpeed,
}: {
  speed: MatchSpeed;
  onSetSpeed: (s: MatchSpeed) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white p-0.5">
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">Speed</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onSetSpeed(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition ${
            speed === o.value ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
