import type { Player, Position, Squad } from '../data/types';
import { CATEGORY_ORDER, primaryCategory } from '../data/types';
import { formatPositions } from '../data/format';
import { isSelectable } from '../domain/draft';
import { tierOf } from '../domain/album';
import { RotateCcw } from 'lucide-react';
import Flag from './Flag';
import Tooltip from './Tooltip';
import { TIER_META } from './StickerCard';
import { FEATURES } from '../config';

export type RerollKind = 'team' | 'cup' | 'any';

interface Props {
    squad: Squad | null;
    rolling: boolean;
    rerollsLeft: number;
    canAnotherTeam: boolean;
    canAnotherCup: boolean;
    openPositions: Set<Position>;
    /** Positions with a filled slot: a player eligible for one can be selected to
     *  swap in, even with no open slot (sticker album). Empty when the album is off. */
    filledPositions: Set<Position>;
    usedPersonIds: Set<string>;
    selectedPlayerId: string | null;
    onReroll: (kind: RerollKind) => void;
    onSelectPlayer: (playerId: string) => void;
}

function Header({ squad, scrambling }: { squad: Squad; scrambling: boolean }) {
    return (
        <div className="px-3 pt-1">
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
    filledPositions,
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
            <div className="flex flex-col gap-4 rounded-md border border-line bg-panel p-3 shadow-hard">
                <Header squad={squad} scrambling />
                <p className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
                    Drawing a squad…
                </p>
            </div>
        );
    }

    const rerollDisabled = rerollsLeft <= 0;

    return (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-panel pt-3 shadow-hard">
            <Header squad={squad} scrambling={false} />

            {FEATURES.stickerAlbum &&
                (() => {
                    const colls = squad.players.filter((p) => tierOf(p));
                    if (colls.length === 0) return null;
                    return (
                        <div className="mx-3 flex items-start gap-2 rounded-md border border-amber/60 bg-amber/10 px-2.5 py-2 text-[11px] leading-snug">
                            <span className="shrink-0 text-amber">&#9733;</span>
                            <span className="text-muted">
                                <b className="text-ink">
                                    {colls.length} collectible{colls.length > 1 ? 's' : ''}
                                </b>{' '}
                                in this squad: {colls.map((p) => p.name).join(', ')}
                            </span>
                        </div>
                    );
                })()}

            {/* Player list fills the panel and scrolls. Rows are split by dividers so
          each reads as a tappable line: number, name, positions, elo. */}
            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-line max-h-[40vh]">
                {sortSquad(squad.players).map((p) => {
                    const selectable = isSelectable(p, openPositions, usedPersonIds);
                    const used = usedPersonIds.has(p.personId);
                    // Also selectable if the player can swap into a filled slot they fit
                    // (their position may have no open slot). filledPositions is empty
                    // when the album is off, so behaviour is unchanged there.
                    const swappable = !used && p.positions.some((pos) => filledPositions.has(pos));
                    const interactive = selectable || swappable;
                    const selected = p.id === selectedPlayerId;
                    const tier = FEATURES.stickerAlbum ? tierOf(p) : null;
                    return (
                        <li key={p.id} className="border-b border-line last:border-b-0">
                            <button
                                disabled={!interactive}
                                onClick={() => onSelectPlayer(p.id)}
                                className={[
                                    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition',
                                    interactive
                                        ? 'cursor-pointer hover:bg-pitch/5'
                                        : 'cursor-not-allowed opacity-40',
                                    selected ? 'bg-pitch/10' : '',
                                ].join(' ')}
                            >
                                <span className="w-5 shrink-0 text-center font-mono text-xs text-muted">
                                    {p.number}
                                </span>
                                <span
                                    className={`min-w-0 flex-1 truncate text-sm font-bold ${used ? 'text-muted line-through' : ''}`}
                                >
                                    {p.name}
                                </span>
                                {tier && (
                                    <span
                                        className="shrink-0 grid h-[15px] w-[15px] place-items-center rounded-full font-mono text-[9px] font-bold leading-none"
                                        style={{
                                            background: TIER_META[tier].accent,
                                            color: tier === 'monumental' ? '#3a2a06' : '#fff',
                                        }}
                                        title={`Collectible · ${TIER_META[tier].name}`}
                                    >
                                        &#9733;
                                    </span>
                                )}
                                {FEATURES.chemistry ? (
                                    <Tooltip
                                        className="shrink-0 text-[11px] text-muted"
                                        label="Underlined = natural position; only placing the player there earns positional chemistry"
                                    >
                                        <span className="underline underline-offset-2">
                                            {p.positions[0]}
                                        </span>
                                        {p.positions.length > 1
                                            ? ` · ${p.positions.slice(1).join(' · ')}`
                                            : ''}
                                    </Tooltip>
                                ) : (
                                    <span className="shrink-0 text-[11px] text-muted">
                                        {formatPositions(p.positions)}
                                    </span>
                                )}
                                <span className="w-7 shrink-0 text-right font-mono text-[15px] font-extrabold">
                                    {p.elo}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Re-roll controls (one row of three) */}
            <div className="grid grid-cols-3 gap-2 px-3 pb-3.5">
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
                    label="Roll again"
                    primary
                    disabled={rerollDisabled}
                    onClick={() => onReroll('any')}
                />
                <div className="col-span-3 text-center text-[11px] text-muted">
                    {rerollsLeft} re-rolls left
                </div>
            </div>
        </div>
    );
}

function RerollButton({
    label,
    primary = false,
    disabled,
    onClick,
}: {
    label: string;
    primary?: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={[
                'flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2.5 text-center text-[11px] font-bold leading-tight transition',
                disabled
                    ? primary
                        ? 'cursor-not-allowed bg-pitch/30 text-white'
                        : 'cursor-not-allowed border border-line bg-white text-muted/40'
                    : primary
                      ? 'bg-pitch text-white shadow-[0_6px_16px_rgba(19,146,76,0.25)] hover:bg-pitch-dark'
                      : 'border border-line bg-white hover:border-pitch hover:text-pitch',
            ].join(' ')}
        >
            <RotateCcw size={15} strokeWidth={2.5} />
            {label}
        </button>
    );
}
