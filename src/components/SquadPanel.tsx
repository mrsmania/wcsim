import type { Player, Position, Squad } from '../data/types';
import { CATEGORY_ORDER, primaryCategory } from '../data/types';
import { formatPositions } from '../data/format';
import { isSelectable, type RerollKind } from '../domain/draft';
import { tierOf } from '../domain/album';
import { RotateCcw } from 'lucide-react';
import Flag from './Flag';
import Tooltip from './Tooltip';
import CollectibleStar from './CollectibleStar';
import StartOverButton from './StartOverButton';
import { FEATURES } from '../config';
import { btn, CARD } from './matchUi';

interface Props {
    squad: Squad | null;
    rolling: boolean;
    rerollsLeft: number;
    canAnotherTeam: boolean;
    canAnotherCup: boolean;
    openPositions: Set<Position>;
    /** Ids of drawn-squad players that can be swapped into a filled slot (collectible,
     *  swaps remaining, occupant rules met - computed in App). Empty when off. */
    swapEligibleIds: Set<string>;
    /** Remaining collectible swaps this run; shown in the footer. */
    swapsLeft: number;
    /** Player ids whose sticker is already in the album, so the marker can say so
     *  rather than only "collectible". Empty when the album is off. */
    ownedStickerIds: Set<string>;
    usedPersonIds: Set<string>;
    selectedPlayerId: string | null;
    /** Whether each row shows its rating. False in a hidden-ratings versus room (P5). */
    ratings?: boolean;
    /** Whether the natural position is underlined with its chemistry note. False in a
     *  versus room, where chemistry is off entirely (P25): the underline promises a bonus
     *  the simulator never receives there. */
    chemistry?: boolean;
    /** Whether the album's marks appear: the tier star per row and the "collectibles in
     *  this squad" call-out. False in a room, where the album has no business being. */
    collectibles?: boolean;
    /** Which re-rolls are offered. The single-player draft has all three; a versus room
     *  has ONE, because the referee deals the next squad and takes no argument saying
     *  which kind - a button that cannot fire is worse than no button (plan section 3). */
    rerollKinds?: readonly RerollKind[];
    onReroll: (kind: RerollKind) => void;
    onSelectPlayer: (playerId: string) => void;
    /** Drop the whole XI and return to setup (rendered inside the box footer). Absent in
     *  a versus room, where it would run the app's reset and navigate out mid-draft. */
    onReset?: () => void;
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

/** The three re-roll kinds, in the order the single-player panel has always shown them. */
const ALL_REROLLS: readonly RerollKind[] = ['team', 'cup', 'any'];

const REROLL_LABEL: Record<RerollKind, string> = {
    team: 'Another team',
    cup: 'Another cup',
    any: 'Roll again',
};

/** Written out per count rather than interpolated: Tailwind emits utilities from the
 *  classes it can SEE in the source, so `grid-cols-${n}` would emit nothing. */
const REROLL_GRID: Record<number, string> = {
    1: 'grid grid-cols-1 gap-2',
    2: 'grid grid-cols-2 gap-2',
    3: 'grid grid-cols-3 gap-2',
};

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
    swapEligibleIds,
    swapsLeft,
    ownedStickerIds,
    usedPersonIds,
    selectedPlayerId,
    ratings = true,
    chemistry = true,
    collectibles = true,
    rerollKinds = ALL_REROLLS,
    onReroll,
    onSelectPlayer,
    onReset,
}: Props) {
    if (!squad) {
        return <div className="text-muted">Drawing a squad…</div>;
    }

    if (rolling) {
        return (
            <div className={`flex flex-col gap-4 ${CARD} p-3`}>
                <Header squad={squad} scrambling />
                <p className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">
                    Drawing a squad…
                </p>
            </div>
        );
    }

    const rerollDisabled = rerollsLeft <= 0;
    // Which of the offered kinds have anything to draw from. `any` always does.
    const CAN: Record<RerollKind, boolean> = {
        team: canAnotherTeam,
        cup: canAnotherCup,
        any: true,
    };

    return (
        <div className={`flex flex-col gap-3 ${CARD} pt-3`}>
            <Header squad={squad} scrambling={false} />

            {FEATURES.stickerAlbum &&
                collectibles &&
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
                                {FEATURES.stickersOnCupWinOnly
                                    ? '. Win the cup with them and the stickers are yours.'
                                    : ''}
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
                    const tier = FEATURES.stickerAlbum && collectibles ? tierOf(p) : null;
                    // A collectible that can swap into a filled slot (App computed the
                    // occupant rules). This is why a used person's better version is
                    // still pickable - to upgrade themselves in place.
                    const swappable = swapEligibleIds.has(p.id);
                    const interactive = selectable || swappable;
                    const selected = p.id === selectedPlayerId;
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
                                    className={`min-w-0 flex-1 truncate text-sm font-bold ${used && !swappable ? 'text-muted line-through' : ''}`}
                                >
                                    {p.name}
                                </span>
                                {tier && <CollectibleStar tier={tier} owned={ownedStickerIds.has(p.id)} />}
                                {FEATURES.chemistry && chemistry ? (
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
                                {ratings && (
                                    <span className="w-7 shrink-0 text-right font-mono text-[15px] font-extrabold">
                                        {p.elo}
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Re-roll controls (one row of three), the count, then Start over */}
            <div className="px-3 pb-3.5">
                <div className={REROLL_GRID[rerollKinds.length] ?? 'grid grid-cols-3 gap-2'}>
                    {rerollKinds.map((kind) => (
                        <RerollButton
                            key={kind}
                            label={REROLL_LABEL[kind]}
                            primary={kind === 'any'}
                            disabled={rerollDisabled || !CAN[kind]}
                            onClick={() => onReroll(kind)}
                        />
                    ))}
                </div>
                <div className="mt-2 text-center text-[11px] text-muted">
                    {rerollsLeft} re-roll{rerollsLeft === 1 ? '' : 's'} left
                    {FEATURES.stickerAlbum && collectibles && (
                        <>
                            {' '}
                            &middot; {swapsLeft} collectible swap{swapsLeft === 1 ? '' : 's'} left
                        </>
                    )}
                </div>
                {onReset && <StartOverButton onReset={onReset} />}
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
    // The two designs at row size, and nothing of their own. They used to carry a 12px
    // radius, a soft green glow and a stacked icon-over-label layout that appeared nowhere
    // else in the app, plus their own two disabled states - `btn` already dims a disabled
    // button, which is what those were reproducing by hand. `leading-tight` stays because
    // the labels are two words in a third of a narrow column and wrap on purpose.
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={`${btn(primary ? 'primary' : 'secondary', 'compact')} w-full leading-tight`}
        >
            <RotateCcw size={15} strokeWidth={2.5} className="shrink-0" />
            {label}
        </button>
    );
}
