import { ArrowLeftRight, Move, RotateCw, X } from 'lucide-react';

/** Small red "x" control shown on a placed badge to clear its slot (testing aid).
 *
 *  It is a SIBLING of the badge's own control, never a child of it: a `<button>` inside a
 *  `<button>` is invalid HTML, and React said so on every render of the build page. It is
 *  anchored to the badge column rather than to the name label it used to sit inside, so
 *  for a short name it now sits a few pixels further right - a fixed corner rather than
 *  one that slides with the length of the name. */
function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
    return (
        <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={(e) => {
                e.stopPropagation();
                onRemove();
            }}
            className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-loss text-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] transition hover:bg-loss/85"
        >
            <X size={11} strokeWidth={3} />
        </button>
    );
}

interface Props {
    name: string;
    number?: number;
    /** Testing aid: when set, show a remove (x) control that clears this slot. */
    onRemove?: () => void;
    /** When true, mark this placed badge as a swap target (amber ring + swap glyph)
     *  because the selected player can be swapped into this slot. */
    swap?: boolean;
    /** A swap target that is really a ROTATION: taking this slot shifts three or more
     *  players round, so the glyph says so rather than promising a straight trade. */
    rotate?: boolean;
    /** This player is the one being moved: lifted out of the line-up until a
     *  destination is picked (or the move is cancelled). */
    moving?: boolean;
    /** The badge's own gesture - pick this player up, swap into his slot, take his spot.
     *  When set the badge body becomes a real `<button>`; when not, it is inert markup.
     *  It lives here rather than on a wrapper in `Pitch` so that the remove "x" can be its
     *  sibling instead of its descendant (see `RemoveButton`). */
    onActivate?: () => void;
    /** What that gesture is, for assistive technology. Required in practice whenever
     *  `onActivate` is set, since the badge's visible text is only the surname. */
    activateLabel?: string;
}

/** Minimal pitch token: a circle with the jersey number (a face can replace it
 *  later) and the player's last name below. The same badge is used on desktop and
 *  mobile; the full player details live in the XI table beside the pitch. */
export default function PlayerBadge({
    name,
    number,
    onRemove,
    swap = false,
    rotate = false,
    moving = false,
    onActivate,
    activateLabel,
}: Props) {
    const body = (
        <>
            <span
                className={`relative grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-pitch-dark font-mono text-[15px] font-extrabold text-white shadow-[0_3px_8px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(255,255,255,0.35)] ${
                    swap ? 'ring-[3px] ring-amber' : ''
                } ${moving ? 'ring-[3px] ring-white ring-offset-2 ring-offset-pitch-dark/40' : ''}`}
            >
                {number}
                {moving && !swap && (
                    <span className="absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-white text-ink">
                        <Move size={10} strokeWidth={3} />
                    </span>
                )}
                {swap && (
                    <span className="absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-amber text-[#13211a]">
                        {rotate ? (
                            <RotateCw size={10} strokeWidth={3} />
                        ) : (
                            <ArrowLeftRight size={10} strokeWidth={3} />
                        )}
                    </span>
                )}
            </span>
            <div className="mt-1.5 max-w-22 rounded-md bg-panel px-2 py-0.5 text-center shadow-soft">
                <div className="truncate text-[13px] font-extrabold leading-tight">{name}</div>
            </div>
        </>
    );

    return (
        <div className="relative flex w-20 flex-col items-center">
            {onActivate ? (
                <button
                    type="button"
                    onClick={onActivate}
                    aria-label={activateLabel}
                    className="flex w-full flex-col items-center"
                >
                    {body}
                </button>
            ) : (
                <div className="flex w-full flex-col items-center">{body}</div>
            )}
            {onRemove && <RemoveButton name={name} onRemove={onRemove} />}
        </div>
    );
}
