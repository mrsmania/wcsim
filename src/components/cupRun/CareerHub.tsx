import { ChevronDown, ChevronUp } from 'lucide-react';
import { PERKS, FINISH_LABEL, type CareerState } from '../../domain/career';

/** The career hub - full between runs, a slim collapsible strip during a run. The
 *  toggle only shows while a run is active (`showToggle`); `showBody` gates the
 *  progress + perk-shop body. */
export default function CareerHub({
  career,
  prog,
  hubOpen,
  onToggleHub,
  showBody,
  showToggle,
  onPurchase,
}: {
  career: CareerState;
  prog: { into: number; needed: number };
  hubOpen: boolean;
  onToggleHub: () => void;
  showBody: boolean;
  showToggle: boolean;
  onPurchase: (perkId: string) => void;
}) {
  return (
    <section className="mb-4 mt-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${showBody ? 'border-b border-line' : ''}`}>
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[17px] font-extrabold tracking-[-0.01em]">Cup Run</span>
          <span className="rounded-full bg-chalk px-2 py-0.5 font-mono text-[11px] font-semibold text-pitch-dark">
            Level {career.level}
          </span>
          <span className="rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#9a6512]">
            {career.prestige} Prestige
          </span>
        </div>
        {showToggle && (
          <button
            onClick={onToggleHub}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-pitch"
          >
            {hubOpen ? 'Hide hub' : 'Career hub'}
            {hubOpen ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}
          </button>
        )}
      </div>

      {showBody && (
        <>
          <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="bg-panel p-4">
              <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Progress
              </div>
              <div className="h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
                <div className="h-full bg-pitch" style={{ width: `${(prog.into / prog.needed) * 100}%` }} />
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted">
                {prog.into} / {prog.needed} XP to level {career.level + 1}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-px bg-line sm:w-[300px]">
              {(
                [
                  ['Runs', String(career.stats.runs)],
                  ['Cups', String(career.stats.cups)],
                  ['Best', career.stats.bestFinish ? FINISH_LABEL[career.stats.bestFinish] : '-'],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="bg-panel px-2 py-4 text-center">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {label}
                  </div>
                  <div className="mt-0.5 font-display text-[15px] font-extrabold leading-tight">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Perk shop */}
          <div className="border-t border-line p-4">
            <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Perks (spend Prestige - applies to future runs)
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {PERKS.map((perk) => {
                const owned = career.unlocked.includes(perk.id);
                const affordable = career.prestige >= perk.cost;
                return (
                  <div key={perk.id} className="rounded-md border border-line bg-panel p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[13.5px] font-extrabold">{perk.name}</span>
                      <span className="font-mono text-[11px] font-semibold text-amber">{perk.cost}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-muted">{perk.description}</p>
                    <button
                      disabled={owned || !affordable}
                      onClick={() => onPurchase(perk.id)}
                      className={[
                        'mt-2 w-full rounded-[5px] px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                        owned
                          ? 'cursor-default bg-pitch/10 text-pitch'
                          : affordable
                            ? 'bg-pitch text-white hover:bg-pitch-dark'
                            : 'cursor-not-allowed border border-line bg-panel text-muted/50',
                      ].join(' ')}
                    >
                      {owned ? 'Owned' : affordable ? 'Unlock' : `Need ${perk.cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
