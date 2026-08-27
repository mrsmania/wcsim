import { primaryPosition, type Player } from '../../data/types';
import { SQUAD_BY_ID } from '../../data/squads';
import { boonById } from '../../domain/boons';
import Flag from '../Flag';
import { btn } from '../matchUi';

/**
 * The answer step for a card that asks a question at pick time - today only The Armband.
 *
 * Every other card in the pool commits on the click: you take it and it happens. This one
 * parks on the run (`RunState.pendingChoice`) and waits, which is why the run stays in the
 * `boon` phase and this replaces the offer rather than sitting over it. A reload lands back
 * here rather than losing the card.
 *
 * There is no cancel. Backing out would let a player look at what the card would do to each
 * player and then take a different card instead, which is the offer re-rolled for free.
 */
export default function CaptainPicker({
  boonId,
  xi,
  onChoose,
}: {
  boonId: string;
  xi: Player[];
  onChoose: (playerId: string) => void;
}) {
  const boon = boonById(boonId);
  const ranked = [...xi].sort((a, b) => b.elo - a.elo);

  return (
    <div>
      <div className="mb-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {boon?.name ?? 'Choose a player'}
        </span>
        <p className="mt-1 text-[13px] text-muted">{boon?.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ranked.map((p) => {
          const sq = SQUAD_BY_ID[p.squadId];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChoose(p.id)}
              className={`w-full justify-start text-left ${btn('secondary', 'md')}`}
            >
              <span className="w-8 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                {primaryPosition(p)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
              {sq && <Flag code={sq.code} className="h-3 w-[18px] shrink-0" />}
              <span className="shrink-0 font-mono text-[12.5px] font-bold">{p.elo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
