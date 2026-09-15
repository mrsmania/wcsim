import type { Player } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES, type StickerTier } from '../config';
import Flag from './Flag';
import { onStickerArtError, stickerArtSrc, tierTopStrip, TIER_META } from './stickerTheme';


/** How much of the card art is shown, measured from the TOP of the image. 1 = the whole
 *  picture, 0.5 = the upper half only.
 *
 *  RATIFIED 2026-09-06, and it needed ratifying because it arrived by accident: it landed
 *  in `ed0449e`, a commit about the missing-artwork silhouette, which never mentions it,
 *  and it carried the comment "LOCAL EXPERIMENT (do not ship)" for twelve days while being
 *  live on the site the whole time.
 *
 *  WHY 0.65 IS THE RIGHT NUMBER, measured over all 115 drawings rather than judged by eye.
 *  The art is drawn to one template: the top of the head sits between 0% and 4.7% of the
 *  image height on every card (a spread of 4.7 points across the whole set), and every
 *  drawing runs to 99.3%, so all of them fill the canvas. A fixed crop from the top is
 *  therefore safe here in a way it would not be for art composed freely - nothing is
 *  beheaded, and 0.65 lands at the waistband on essentially every card.
 *
 *  WHAT IT COSTS, so nobody has to rediscover it. The drawings are not full-body: they are
 *  cut at mid-thigh by the edge of the 400x600 canvas. Shown whole, a card is a figure
 *  amputated above the knee standing in a large empty area of plain shorts, which is why
 *  uncropped looks worse rather than more generous. Two things do go: a GOALKEEPER'S GLOVES
 *  sit at 70-85% and are lost, so Neuer, Buffon, Casillas, Kahn and the rest are a coloured
 *  long-sleeve shirt and nothing else; and the shorts number goes, which is redundant with
 *  the shirt number. No face, crest, sleeve, armband or shirt number is near the line.
 *
 *  The lightbox depends on this. `AlbumScreen` opens a card to the FULL picture, and that
 *  is only worth a gesture while the grid shows a crop. Take the crop out and opening a
 *  card reveals nothing, so the two move together. */
export const ART_VISIBLE_FRACTION = 0.65;

/** Intrinsic size of every built sticker (`scripts/build-sticker-art.py` writes 400px
 *  wide, and all of them are 2:3 portraits). */
const ART_W = 400;
const ART_H = 600;

/** One sticker image, cropped to `ART_VISIBLE_FRACTION` of its height from the top.
 *  The box carries the visible aspect ratio and clips; the image itself is drawn at full
 *  card width.
 *
 *  THE SCALE-UP THIS COMMENT USED TO CLAIM IS MEASURED AGAINST THE VERSION BEFORE LAST,
 *  and saying so matters because it changes what "revert" would mean. Against the same
 *  code at `ART_VISIBLE_FRACTION = 1` this is a plain window onto the identical rendered
 *  size: the image is 192x288 either way at a 192px column, and only the box shrinks, to
 *  192x187. The scale-up is real against what came BEFORE the constant existed, which
 *  letterboxed the 2:3 art inside a SQUARE (`aspect-square object-contain`, so 128x192 with
 *  32px of dead space each side). So setting the constant to 1 does not restore the old
 *  card, it produces a third framing that has never shipped.
 *
 *  A file that is missing or will not decode swaps to `STICKER_PLACEHOLDER_SRC`, so the box
 *  keeps its space and the grid does not reflow around the gap. That silhouette is drawn
 *  with the head high enough to survive this crop, which is one more thing tied to it. */
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

/** The empty counterpart of `StickerArt`: the same box at the same aspect ratio, holding
 *  a large "?" where the drawing goes.
 *
 *  IT EXISTS TO MAKE THE TWO CARDS THE SAME HEIGHT. An uncollected card used to render no
 *  art block at all, so it stood about 190px shorter than its neighbours and the album's
 *  grid came out ragged - rows of tall cards with stubby ones wedged among them, which
 *  reads as a layout fault rather than as a collection with gaps in it. The aspect ratio
 *  is computed from the same three constants `StickerArt` uses, so the two cannot drift:
 *  change the crop and both boxes move together.
 *
 *  `bg-faint` is the app's "unearned surface" token, the one the honours ledger already
 *  uses for an entry nobody has earned, so the slot reads as empty without being a hole. */
function MissingArt({ className = '' }: { className?: string }) {
    return (
        <div
            className={`grid w-full place-items-center overflow-hidden bg-faint ${className}`}
            style={{ aspectRatio: `${ART_W} / ${ART_H * ART_VISIBLE_FRACTION}` }}
            aria-hidden="true"
        >
            <span className="font-display text-[64px] font-bold leading-none text-dim/45">?</span>
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
                {/* The tier's INK, not its accent. An 8.5px bold word painted the raw
                    surface colour measures 2.57 on panel for the gold and 2.49 for the
                    amber, and the `-ink` tokens are the fix the boost library already
                    made for the identical label at 9px. A class rather than an inline
                    colour, because an `-ink` token flips between the themes. */}
                <span
                    className={`font-mono text-[8.5px] font-bold ${
                        collected ? meta.ink : 'text-muted'
                    }`}
                >
                    {meta.name}
                </span>
                {collected && duplicateCount > 0 ? (
                    <span className="rounded-full border border-amber/40 bg-amber/[0.16] px-1.5 py-px font-mono text-[10px] font-bold leading-none text-amber-ink">
                        &times;{duplicateCount}
                    </span>
                ) : !collected ? (
                    <span className="font-mono text-[11px] leading-none text-muted">&#9671;</span>
                ) : null}
            </div>
            <div className="flex flex-1 flex-col items-center gap-1.5 px-3 pb-3 pt-2 text-center">
                {FEATURES.stickerImages &&
                    (collected ? (
                        <StickerArt id={player.id} className="mb-1" />
                    ) : (
                        // Gated on the same flag as the real art rather than rendered
                        // unconditionally: with the images off a collected card has no
                        // picture, so an empty one with a box would be the TALLER of the
                        // two and the raggedness would simply change sides.
                        <MissingArt className="mb-1" />
                    ))}
                <Flag
                    code={code}
                    className={`h-5 w-[30px] ${collected ? '' : 'opacity-40 grayscale'}`}
                />
                <div
                    className={`font-display text-[13.5px] font-bold leading-tight ${
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
            {/* THE BAND IS THE TIER'S ON BOTH CARDS, and only the FIGURE is withheld.
                It used to be unfilled with a bare "?" floating in it, which was a third
                thing telling the reader something the big "?" above and the greyed flag
                and name already say - and it left the one row that carries the tier's
                colour missing from most of the album. "??" reads as a number that is
                being kept from you, where "?" reads as a shrug. */}
            <div
                className="flex items-baseline justify-center gap-1.5 px-2.5 py-1.5"
                style={{ background: meta.strip, color: meta.stripText }}
            >
                <span className="font-mono text-[22px] font-bold leading-none">
                    {collected ? player.elo : '??'}
                </span>
                <span className="font-mono text-[8px] font-semibold opacity-80">Rating</span>
            </div>
        </>
    );

    // ONE FRAME FOR BOTH STATES. The empty card used to wear a dashed border over
    // `bg-ground/60` with no shadow, so a gap in the album read as a dotted outline of a
    // card rather than as a card you have not filled - and against the tifo shadow on its
    // neighbours it sat visually behind the grid. What says "not collected" is the
    // content: the "?" where the picture goes, the "??" where the rating goes, the greyed
    // flag and the quiet name.
    const cls = 'flex flex-col overflow-hidden rounded-md border border-line bg-panel shadow-hard';
    const style: React.CSSProperties = {
        ...tierTopStrip(tier),
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
