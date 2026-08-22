import { AlertTriangle, Flame } from 'lucide-react';
import { eventById } from '../../domain/nodes';
import { optionCost } from '../../domain/run';
import Flag from '../Flag';
import type { GroupTeam } from '../../domain/tournament';

/**
 * The event stop: a themed either/or, and where the curses live.
 *
 * Every card carries a way out - an option that changes nothing - because an event with no
 * decline is a boost pick wearing a costume. A curse option is over-band power with a real
 * cost attached, drawn hotter so the trade is visible before it is taken rather than after.
 *
 * An option that costs Form is disabled when it cannot be paid for, so the player is never
 * offered a trade they cannot make.
 */
export default function EventNode({
  eventId,
  form,
  nextOpponent,
  roundName,
  onChoose,
}: {
  eventId: string;
  form: number;
  nextOpponent: GroupTeam | null;
  roundName: string;
  onChoose: (optionId: string) => void;
}) {
  const card = eventById(eventId);
  if (!card) return null;

  return (
    <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle size={16} strokeWidth={2.4} className="text-amber-ink" />
        <h3 className="font-display text-[15px] font-extrabold uppercase tracking-[-0.01em]">
          {card.title}
        </h3>
        <span className="ml-auto font-mono text-[12px] font-bold">
          <span className="text-muted">Form </span>
          <span className="text-amber-ink">{form}</span>
        </span>
      </div>
      <p className="mb-4 text-[13px] text-muted">{card.body}</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {card.options.map((o) => {
          const cost = optionCost(o.effects);
          const afford = form >= cost;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!afford}
              onClick={() => onChoose(o.id)}
              className={`rounded-[5px] border px-3 py-3 text-left transition ${
                !afford
                  ? 'cursor-not-allowed border-line bg-ground opacity-50'
                  : o.curse
                    ? 'border-loss/50 bg-loss/[0.06] hover:border-loss hover:bg-loss/[0.12]'
                    : 'border-line bg-ground hover:border-pitch hover:bg-pitch/[0.05]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {o.curse && <Flame size={12} strokeWidth={2.6} className="shrink-0 text-loss" />}
                <span className="text-[13px] font-semibold">{o.label}</span>
              </span>
              <span className="mt-1 block text-[12px] text-muted">{o.detail}</span>
              {cost > 0 && !afford && (
                <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-loss">
                  needs {cost} form
                </span>
              )}
            </button>
          );
        })}
      </div>

      {nextOpponent && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
          Then the {roundName}: <Flag code={nextOpponent.code} className="h-3 w-[18px]" />
          <b className="text-ink">{nextOpponent.name}</b>
          <span className="font-mono text-[11px]">{nextOpponent.year}</span>
        </p>
      )}
    </div>
  );
}
