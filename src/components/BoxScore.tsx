import type { Player } from '../data/types';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';

interface Props {
  formation: Formation;
  filled: Filled;
}

function avgElo(players: Player[]): number {
  if (players.length === 0) return 0;
  return Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length);
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-4 ${color}`} />
          {label}
        </span>
        <span className="font-mono">{value || '—'}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full bg-stone-200">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function BoxScore({ formation, filled }: Props) {
  const placed = formation.slots.filter((s) => filled[s.id]).length;
  const total = formation.slots.length;

  const placedPlayers = formation.slots
    .map((s) => filled[s.id])
    .filter((p): p is Player => !!p);
  const attack = avgElo(placedPlayers.filter((p) => ['MID', 'FWD'].includes(categoryOf(p.positions[0]))));
  const defense = avgElo(placedPlayers.filter((p) => ['GK', 'DEF'].includes(categoryOf(p.positions[0]))));

  // Slots ordered back-to-front: GK, DEF, MID, FWD.
  const ordered = [...formation.slots].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(categoryOf(a.position)) - CATEGORY_ORDER.indexOf(categoryOf(b.position)),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between border-b-2 border-stone-900 pb-2">
        <h2 className="text-sm font-black uppercase tracking-[0.15em]">Box Score</h2>
        <span className="font-mono text-sm font-bold">
          {placed}
          <span className="text-stone-400">/{total}</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <StatBar label="Attack" value={attack} color="bg-red-600" />
        <StatBar label="Defense" value={defense} color="bg-stone-900" />
      </div>

      <ul className="flex flex-col">
        {ordered.map((slot) => {
          const player = filled[slot.id];
          return (
            <li
              key={slot.id}
              className="flex items-center gap-2 border-b border-stone-200 py-1.5 text-sm"
            >
              <span className="w-8 text-[11px] font-bold uppercase text-stone-500">{slot.label}</span>
              <span className={`flex-1 truncate ${player ? 'font-semibold' : 'text-stone-400'}`}>
                {player ? player.name : '—'}
              </span>
              <span className="w-7 text-right font-mono text-sm font-black">
                {player ? player.elo : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
