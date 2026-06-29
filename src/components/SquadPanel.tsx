import type { Player, Position, Squad } from '../data/types';
import { CATEGORY_ORDER, formatPositions, primaryCategory } from '../data/types';
import { isSelectable } from '../domain/draft';
import { FaceAvatar } from './PlayerBadge';
import Flag from './Flag';
import Tooltip from './Tooltip';
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
        <div className="px-1 pt-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                Drawn squad
            </div>
            {/* The squad text cycles rapidly while rolling (that IS the scramble);
          on settle it does a one-shot blob pop. */}
            <div
                className={`mt-1 flex flex-wrap items-center gap-2 text-base font-extrabold ${scrambling ? '' : 'animate-settle'}`}
            >
                <Flag code={squad.code} className="h-4 w-6" />
                <span className="leading-tight">{squad.nation}</span>
                <span className="text-xs font-semibold text-muted">{squad.year}</span>
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
        return <div className="text-muted">Drawing a squad…</div>;
    }

    if (rolling) {
        return (
            <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-3 shadow-soft">
                <Header squad={squad} scrambling />
                <p className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
                    Drawing a squad…
                </p>
            </div>
        );
    }

    const rerollDisabled = rerollsLeft <= 0;

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel pt-3 shadow-soft">
            <Header squad={squad} scrambling={false} />

            {/* Player list (scrolls; capped near the pitch height) */}
            <ul className="flex max-h-[49vh] flex-col gap-1.5 overflow-y-auto px-3">
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
                                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition',
                                    selectable
                                        ? 'cursor-pointer border-pitch bg-white shadow-[0_6px_16px_rgba(19,146,76,0.14)] hover:bg-pitch/5'
                                        : 'cursor-not-allowed border-transparent bg-pitch/5 opacity-40',
                                    selected ? 'ring-2 ring-pitch ring-offset-1' : '',
                                ].join(' ')}
                            >
                                <FaceAvatar
                                    name={p.name}
                                    className="h-[34px] w-[34px] border-2 border-white shadow-[0_2px_6px_rgba(21,36,27,0.16)]"
                                />
                                <span className="min-w-0 flex-1">
                                    <span
                                        className={`block truncate text-sm font-bold ${used ? 'line-through' : ''}`}
                                    >
                                        {p.name}
                                    </span>
                                    {FEATURES.chemistry ? (
                                        <Tooltip
                                            className="block text-[11px] text-muted"
                                            label="Underlined = natural position; only placing the player there earns positional chemistry"
                                        >
                                            <span className="underline underline-offset-2">
                                                {p.positions[0]}
                                            </span>
                                            {p.positions.length > 1
                                                ? ` · ${p.positions.slice(1).join(' · ')}`
                                                : ''}
                                            {used ? ' · already drafted' : ''}
                                        </Tooltip>
                                    ) : (
                                        <span className="block text-[11px] text-muted">
                                            {formatPositions(p.positions)}
                                            {used ? ' · already drafted' : ''}
                                        </span>
                                    )}
                                </span>
                                {selectable && (
                                    <span className="shrink-0 rounded-full bg-pitch/12 px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.06em] text-pitch">
                                        Pick
                                    </span>
                                )}
                                <span className="shrink-0 font-mono text-[15px] font-extrabold">
                                    {p.elo}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Re-roll controls */}
            <div className="grid grid-cols-2 gap-2 px-3 pb-3.5">
                <RerollButton
                    label="Another team"
                    disabled={rerollDisabled || !canAnotherTeam}
                    onClick={() => onReroll('team')}
                />
                <RerollButton
                    label="Another cup"
                    disabled={rerollDisabled || !canAnotherCup}
                    onClick={() => onReroll('cup')}
                />
                <RerollButton
                    label="Re-roll anything"
                    wide
                    disabled={rerollDisabled}
                    onClick={() => onReroll('any')}
                />
                <div className="col-span-2 text-center text-[11px] text-muted">
                    {rerollsLeft} re-rolls left
                </div>
            </div>
        </div>
    );
}

function RerollButton({
    label,
    wide = false,
    disabled,
    onClick,
}: {
    label: string;
    wide?: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={[
                'rounded-xl px-2 py-2.5 text-center text-[12.5px] font-bold transition',
                wide ? 'col-span-2' : '',
                disabled
                    ? wide
                        ? 'cursor-not-allowed bg-pitch/30 text-white'
                        : 'cursor-not-allowed border border-line bg-white text-muted/40'
                    : wide
                      ? 'bg-pitch text-white shadow-[0_6px_16px_rgba(19,146,76,0.25)] hover:bg-pitch-dark'
                      : 'border border-line bg-white hover:border-pitch hover:text-pitch',
            ].join(' ')}
        >
            {label}
        </button>
    );
}
