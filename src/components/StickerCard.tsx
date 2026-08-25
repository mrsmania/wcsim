import type { Player } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES, type StickerTier } from '../config';
import Flag from './Flag';
import { onStickerArtError, stickerArtSrc, TIER_META } from './stickerTheme';


/** LOCAL EXPERIMENT (do not ship): how much of the card art is shown, measured from
 *  the TOP of the image. 1 = the whole picture, 0.5 = the upper half only. */
export const ART_VISIBLE_FRACTION = 0.65;

/** Intrinsic size of every built sticker (`scripts/build-sticker-art.py` writes 400px
 *  wide, and all of them are 2:3 portraits). */
const ART_W = 400;
const ART_H = 600;

/** One sticker image, cropped to `ART_VISIBLE_FRACTION` of its height from the top.
 *  The box carries the visible aspect ratio and clips; the image itself is drawn at
 *  full card width, so the crop is a scale-up rather than a window onto the old size.
 *  A file that is missing or will not decode swaps to `STICKER_PLACEHOLDER_SRC`, so the
 *  box keeps its space and the grid does not reflow around the gap. */
export function StickerArt({
    id,
    className = '',
    lazy = true,
}: {
    id: string;
    className?: string;
    lazy?: boolean;
}) {
    return (
        <div
            className={`w-full overflow-hidden ${className}`}
            style={{ aspectRatio: `${ART_W} / ${ART_H * ART_VISIBLE_FRACTION}` }}
        >
            <img
                src={stickerArtSrc(id)}
                alt=""
                // The album is a long grid: fetch what is on screen, not all 81 at once.
                loading={lazy ? 'lazy' : undefined}
                decoding="async"
                width={ART_W}
                height={ART_H}
                className="block w-full"
                onError={onStickerArtError}
            />
        </div>
    );
}

interface Props {
    player: Player;
    tier: StickerTier;
    collected: boolean;
    duplicateCount?: number;
    /** Highlight as freshly earned (run-end summary). */
    isNew?: boolean;
    /** When set, the card is a pickable button (cup reward / trade options). */
    onPick?: () => void;
}

export default function StickerCard({
    player,
    tier,
    collected,
    duplicateCount = 0,
    isNew = false,
    onPick,
}: Props) {
    const meta = TIER_META[tier];
    const squad = SQUAD_BY_ID[player.squadId];
    const nation = squad?.nation ?? '';
    const year = squad?.year;
    const code = squad?.code ?? '';

    const inner = (
        <>
            <div className="flex items-center justify-between px-2.5 pt-2">
                <span
                    className="font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted"
                    style={collected ? { color: meta.accent } : undefined}
                >
                    {meta.name}
                </span>
                {collected && duplicateCount > 0 ? (
                    <span className="rounded-full bg-amber px-1.5 py-px font-mono text-[10px] font-bold leading-none text-white">
                        &times;{duplicateCount}
                    </span>
                ) : !collected ? (
                    <span className="font-mono text-[11px] leading-none text-muted">&#9671;</span>
                ) : null}
            </div>
            <div className="flex flex-1 flex-col items-center gap-1.5 px-3 pb-3 pt-2 text-center">
                {FEATURES.stickerImages && collected && (
                    <StickerArt id={player.id} className="mb-1" />
                )}
                <Flag
                    code={code}
                    className={`h-5 w-[30px] ${collected ? '' : 'opacity-40 grayscale'}`}
                />
                <div
                    className={`font-display text-[13.5px] font-extrabold leading-tight ${
                        collected ? '' : 'text-muted'
                    }`}
                >
                    {player.name}
                </div>
                <div className="font-mono text-[10px] text-muted">
                    {nation}
                    {year ? ` · ${year}` : ''}
                </div>
            </div>
            <div
                className="flex items-baseline justify-center gap-1.5 px-2.5 py-1.5"
                style={collected ? { background: meta.strip, color: meta.stripText } : undefined}
            >
                {collected ? (
                    <>
                        <span className="font-mono text-[22px] font-bold leading-none">
                            {player.elo}
                        </span>
                        <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] opacity-80">
                            Rating
                        </span>
                    </>
                ) : (
                    <span className="font-mono text-[22px] font-bold leading-none text-muted/50">
                        ?
                    </span>
                )}
            </div>
        </>
    );

    const base = 'flex flex-col overflow-hidden rounded-md border';
    const cls = collected
        ? `${base} border-line bg-panel shadow-hard`
        : `${base} border-dashed border-line bg-ground/60`;
    const style: React.CSSProperties = {
        borderTop: `3px solid ${meta.accent}`,
        ...(isNew ? { outline: '2px solid #e4922b', outlineOffset: '2px' } : {}),
    };

    if (onPick) {
        return (
            <button
                type="button"
                onClick={onPick}
                className={`${cls} cursor-pointer text-left transition hover:-translate-y-0.5`}
                style={style}
            >
                {inner}
            </button>
        );
    }
    return (
        <div className={cls} style={style}>
            {inner}
        </div>
    );
}
