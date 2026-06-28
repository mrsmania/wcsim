import type { Player, Position, Squad } from '../data/types';
import { CATEGORY_ORDER, formatPositions, primaryCategory } from '../data/types';
import { isSelectable } from '../domain/draft';
import { RotateCcw } from 'lucide-react';
import { chipFor } from './positionStyle';
import Flag from './Flag';
import { FEATURES } from '../config';

export type RerollKind = 'team' | 'cup' | 'any';

interface Props {
    squad: Squad | null;
    rolling: boolean;
    rerollsLeft: number;
    canAnotherTeam: boolean;
    canAnotherCup: boolean;
    openPositions: Set<Position>;
    usedPersonIds: Set<string>;
    selectedPlayerId: string | null;
    onReroll: (kind: RerollKind) => void;
    onSelectPlayer: (playerId: string) => void;
}

function Header({ squad, scrambling }: { squad: Squad; scrambling: boolean }) {
    return (
        <div className="border-b-2 border-stone-900 pb-2">
            {/* The squad text cycles rapidly while rolling (that IS the scramble);
          on settle it does a one-shot blob pop. The divider stays put. */}
            <div
                className={`flex flex-wrap items-center gap-2 ${scrambling ? '' : 'animate-settle'}`}
            >
                <Flag code={squad.code} className="h-5 w-8" />
                <span className="text-2xl font-black leading-tight">{squad.nation}</span>
                <span className="text-lg font-bold text-red-600">· WC {squad.year}</span>
            </div>
        </div>
    );
}

function sortSquad(players: Player[]): Player[] {
    return [...players].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(primaryCategory(a)) -
                CATEGORY_ORDER.indexOf(primaryCategory(b)) || a.number - b.number,
    );
}

export default function SquadPanel({
    squad,
    rolling,
    rerollsLeft,
    canAnotherTeam,
    canAnotherCup,
    openPositions,
    usedPersonIds,
    selectedPlayerId,
    onReroll,
    onSelectPlayer,
}: Props) {
    if (!squad) {
        return <div className="text-stone-500">Drawing a squad…</div>;
    }

    if (rolling) {
        return (
            <div className="flex flex-col gap-4">
                <Header squad={squad} scrambling />
                <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                    Drawing a squad…
                </p>
            </div>
        );
    }

    const rerollDisabled = rerollsLeft <= 0;

    return (
        <div className="flex flex-col gap-3">
            <Header squad={squad} scrambling={false} />

            {/* Re-roll controls */}
            <div>
                <div className="text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                    AWFUL DRAW? ROLL AGAIN! · {rerollsLeft} LEFT
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    <RerollButton
                        label="Team"
                        hint="same WC"
                        disabled={rerollDisabled || !canAnotherTeam}
                        onClick={() => onReroll('team')}
                    />
                    <RerollButton
                        label="Cup"
                        hint="same nation"
                        disabled={rerollDisabled || !canAnotherCup}
                        onClick={() => onReroll('cup')}
                    />
                    <RerollButton
                        label="Roll"
                        hint="random"
                        disabled={rerollDisabled}
                        onClick={() => onReroll('any')}
                    />
                </div>
            </div>

            {/* Player list (scrolls; capped near the pitch height) */}
            <div>
                <div className="text-[11px] font-semibold tracking-[0.2em] text-stone-500">
                    PICK A PLAYER
                </div>
                <ul className="mt-1.5 flex max-h-[49vh] flex-col overflow-y-auto pr-1">
                    {sortSquad(squad.players).map((p) => {
                        const selectable = isSelectable(p, openPositions, usedPersonIds);
                        const used = usedPersonIds.has(p.personId);
                        const selected = p.id === selectedPlayerId;
                        return (
                            <li key={p.id}>
                                <button
                                    disabled={!selectable}
                                    onClick={() => onSelectPlayer(p.id)}
                                    className={[
                                        'flex w-full items-center gap-2 border-b border-stone-200 px-2 py-1.5 text-left transition',
                                        selected ? 'bg-red-100' : '',
                                        selectable
                                            ? 'cursor-pointer hover:bg-red-50'
                                            : 'cursor-not-allowed opacity-40',
                                    ].join(' ')}
                                >
                                    <span className="w-7 text-right font-mono text-xs text-stone-400">
                                        #{p.number}
                                    </span>
                                    <span
                                        className={`flex-1 truncate font-semibold ${used ? 'line-through' : ''}`}
                                    >
                                        {p.name}
                                    </span>
                                    {used && (
                                        <span className="rounded bg-stone-200 px-1 text-[9px] font-bold uppercase text-stone-500">
                                            used
                                        </span>
                                    )}
                                    <span
                                        className={`rounded px-1 text-[10px] font-bold ${chipFor(p.positions[0])}`}
                                        title={
                                            FEATURES.chemistry
                                                ? 'Underlined = natural position; only placing the player there earns positional chemistry'
                                                : undefined
                                        }
                                    >
                                        {FEATURES.chemistry ? (
                                            <>
                                                <span className="underline underline-offset-2">
                                                    {p.positions[0]}
                                                </span>
                                                {p.positions.length > 1
                                                    ? `/${p.positions.slice(1).join('/')}`
                                                    : ''}
                                            </>
                                        ) : (
                                            formatPositions(p.positions)
                                        )}
                                    </span>
                                    <span className="w-8 text-right font-mono font-black">
                                        {p.elo}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

function RerollButton({
    label,
    hint,
    disabled,
    onClick,
}: {
    label: string;
    hint: string;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={[
                'rounded border px-1 py-1.5 text-center text-xs font-bold uppercase tracking-wide transition',
                disabled
                    ? 'cursor-not-allowed border-stone-200 text-stone-300'
                    : 'cursor-pointer border-stone-400 hover:border-stone-900 hover:bg-stone-900 hover:text-white',
            ].join(' ')}
        >
            <div className="flex items-center justify-center gap-1">
                <RotateCcw size={12} strokeWidth={2.5} />
                {label}
            </div>
            <div className="text-[9px] font-medium normal-case tracking-normal opacity-70">
                {hint}
            </div>
        </button>
    );
}
