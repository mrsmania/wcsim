import { Check, Coins } from 'lucide-react';
import { shopItemById, type ShopStock } from '../../domain/nodes';
import Flag from '../Flag';
import type { GroupTeam } from '../../domain/tournament';

/**
 * The shop stop: spend Form on something you CHOOSE.
 *
 * That is the whole reason it sits beside the boost pick rather than replacing it. A boost
 * offer is free, random and powerful; the shop is paid, chosen and deliberately weaker per
 * point. The stock is dull on purpose - nothing here is a gamble, because the gamble is
 * what the other node already is.
 *
 * Several items can be bought if they are affordable, so the decision is a basket rather
 * than a single pick. The dearest item costs about a whole stop's wallet, which is the
 * trade the node exists to pose: one big thing, or two small certain ones.
 */
export default function ShopNode({
  stock,
  form,
  nextOpponent,
  roundName,
  onBuy,
  onLeave,
}: {
  stock: ShopStock;
  form: number;
  nextOpponent: GroupTeam | null;
  roundName: string;
  onBuy: (itemId: string) => void;
  onLeave: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
      <div className="mb-1 flex items-center gap-2">
        <Coins size={16} strokeWidth={2.4} className="text-amber-ink" />
        <h3 className="font-display text-[15px] font-extrabold uppercase tracking-[-0.01em]">
          The transfer desk
        </h3>
        <span className="ml-auto font-mono text-[12px] font-bold">
          <span className="text-muted">Form </span>
          <span className="text-amber-ink">{form}</span>
        </span>
      </div>
      <p className="mb-4 text-[12.5px] text-muted">
        Spend what the run has earned. Anything you keep is lost when the run ends.
      </p>

      <div className="flex flex-col gap-2">
        {stock.itemIds.map((id) => {
          const item = shopItemById(id);
          if (!item) return null;
          const bought = stock.purchased.includes(id);
          const afford = form >= item.cost;
          return (
            <button
              key={id}
              type="button"
              disabled={bought || !afford}
              onClick={() => onBuy(id)}
              className={`flex items-start gap-3 rounded-[5px] border px-3 py-2.5 text-left transition ${
                bought
                  ? 'border-pitch/45 bg-pitch/[0.07]'
                  : afford
                    ? 'border-line bg-ground hover:border-pitch hover:bg-pitch/[0.05]'
                    : 'cursor-not-allowed border-line bg-ground opacity-50'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{item.name}</span>
                <span className="block text-[12px] text-muted">{item.description}</span>
              </span>
              <span className="shrink-0 font-mono text-[12.5px] font-bold">
                {bought ? (
                  <span className="flex items-center gap-1 text-pitch">
                    <Check size={13} strokeWidth={3} /> bought
                  </span>
                ) : (
                  <span className={afford ? 'text-amber-ink' : 'text-muted'}>{item.cost}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onLeave}
          className="rounded-[5px] border-2 border-ink bg-ink px-4 py-2 font-display text-[12px] font-extrabold uppercase tracking-[0.06em] text-ground transition hover:opacity-90"
        >
          On to the {roundName}
        </button>
        {nextOpponent && (
          <span className="flex items-center gap-2 text-[12.5px] text-muted">
            Next: <Flag code={nextOpponent.code} className="h-3 w-[18px]" />
            <b className="text-ink">{nextOpponent.name}</b>
            <span className="font-mono text-[11px]">{nextOpponent.year}</span>
          </span>
        )}
      </div>
    </div>
  );
}
