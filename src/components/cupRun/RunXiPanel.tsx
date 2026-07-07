import { primaryPosition, type Player } from '../../data/types';
import { SQUAD_BY_ID } from '../../data/squads';
import { boonById } from '../../domain/boons';
import Flag from '../Flag';
import { pct, RARITY_COLOR } from './types';

/** The left column of an active run: the XI list, the ratings strip (Title odds +
 *  Ovr/Att/Def), and the active-boost chips, with roster-boost players tagged. */
export default function RunXiPanel({
  xi,
  score,
  activeBoons,
  boostedIds,
  odds,
  str,
}: {
  xi: Player[];
  score: number;
  activeBoons: string[];
  boostedIds: Set<string>;
  odds: number;
  str: { attack: number; defense: number; overall: number };
}) {
  return (
    <section className="self-start overflow-hidden rounded-md border border-line bg-panel shadow-hard">
      <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
        <span className="font-display text-base font-extrabold uppercase tracking-[-0.01em]">
          Your XI
        </span>
        <span className="font-mono text-[11px] font-semibold text-muted">
          Score <span className="text-ink">{score}</span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-px border-b border-line bg-line text-center">
        {(
          [
            ['Title', pct(odds), true],
            ['Ovr', str.overall, false],
            ['Att', str.attack, false],
            ['Def', str.defense, false],
          ] as const
        ).map(([label, val, hero]) => (
          <div key={label} className={hero ? 'bg-pitch-dark py-2 text-white' : 'bg-panel py-2'}>
            <div
              className={`font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${hero ? 'text-white/70' : 'text-muted'}`}
            >
              {label}
            </div>
            <div className="font-mono text-[17px] font-bold leading-tight">{val}</div>
          </div>
        ))}
      </div>
      <ul>
        {xi.map((p) => {
          const sq = SQUAD_BY_ID[p.squadId];
          return (
            <li
              key={p.id}
              className="flex items-center gap-2 border-b border-line px-4 py-1.5 last:border-b-0"
            >
              <span className="w-7 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-pitch">
                {primaryPosition(p)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
              {boostedIds.has(p.id) && (
                <span className="shrink-0 rounded-[3px] bg-amber px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.04em] text-white">
                  Boost
                </span>
              )}
              {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
              <span className="w-6 shrink-0 text-right font-mono text-[14px] font-bold">{p.elo}</span>
            </li>
          );
        })}
      </ul>
      {activeBoons.length > 0 && (
        <div className="border-t border-line p-3">
          <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
            Active boosts
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeBoons.map((id, i) => {
              const b = boonById(id);
              if (!b) return null;
              return (
                <span
                  key={`${id}-${i}`}
                  className="rounded-[4px] border border-l-[3px] border-line bg-panel px-2 py-1 text-[11px] font-semibold"
                  style={{ borderLeftColor: RARITY_COLOR[b.rarity] }}
                >
                  {b.name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
