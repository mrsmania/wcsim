import { X } from 'lucide-react';
import Flag from './Flag';

/** Small red "x" control shown on a placed badge to clear its slot (testing aid). */
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

/** A circular player face. Shows the photo when one is supplied, otherwise a CSS
 *  silhouette placeholder (the dataset has no photos). Reused by PlayerBadge and
 *  the drawn-squad rows so the placeholder stays identical everywhere. */
export function FaceAvatar({
    photoUrl,
    name,
    className = '',
}: {
    photoUrl?: string;
    name?: string;
    className?: string;
}) {
    return (
        <span
            className={`relative block shrink-0 overflow-hidden rounded-full bg-linear-to-b from-[#dceae0] to-[#a7c8af] ${className}`}
        >
            {photoUrl ? (
                <img src={photoUrl} alt={name ?? ''} className="h-full w-full object-cover" />
            ) : (
                <>
                    {/* head */}
                    <span className="absolute left-1/2 top-[23%] aspect-square w-[38%] -translate-x-1/2 rounded-full bg-ink/30" />
                    {/* shoulders */}
                    <span className="absolute left-1/2 bottom-[-5%] h-1/2 w-[72%] -translate-x-1/2 rounded-t-[46%] bg-ink/30" />
                </>
            )}
        </span>
    );
}

interface Props {
    name: string;
    position: string;
    code: string;
    elo: number;
    year?: number;
    number?: number;
    photoUrl?: string;
    /** Render an empty "pick" slot (dashed + face, amber accent) instead of a player. */
    open?: boolean;
    /** Minimal badge for the flat mobile pitch: jersey number + last name only. */
    compact?: boolean;
    /** Testing aid: when set, show a remove (x) control that clears this slot. */
    onRemove?: () => void;
}

/** Compact vertical player badge (the Turf pitch badge). Self-contained: it carries
 *  no absolute positioning of its own, so a parent can place it freely. */
export default function PlayerBadge({
    name,
    position,
    code,
    elo,
    year,
    number,
    photoUrl,
    open,
    compact,
    onRemove,
}: Props) {
    // Mobile pitch: a small pill with just the shirt number and surname; the full
    // details live in the players table beneath the pitch.
    if (compact && !open) {
        return (
            <span className="relative flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 shadow-soft">
                <span className="font-mono text-[11px] font-bold text-muted">{number}</span>
                <span className="max-w-22 truncate text-[13px] font-extrabold leading-none text-ink">
                    {name}
                </span>
                {onRemove && <RemoveButton name={name} onRemove={onRemove} />}
            </span>
        );
    }

    if (open) {
        return (
            <div className="flex w-22 flex-col items-center">
                <span className="grid h-14.5 w-14.5 place-items-center rounded-full border-2 border-dashed border-amber bg-amber/10 text-3xl font-light leading-none text-amber">
                    +
                </span>
                <div className="mt-1.5 max-w-23.5 rounded-lg bg-panel px-2 py-1 text-center shadow-soft outline outline-amber">
                    <div className="truncate text-[12px] font-extrabold leading-tight">
                        Pick a {position}
                    </div>
                    <div className="flex items-baseline justify-center">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber">
                            {position}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-22 flex-col items-center">
            <span className="relative block h-14.5 w-14.5">
                <FaceAvatar
                    photoUrl={photoUrl}
                    name={name}
                    className="h-full w-full border-[3px] border-white shadow-[0_6px_14px_rgba(0,0,0,0.32)]"
                />
                <Flag
                    round
                    code={code}
                    className="absolute bottom-4.5 -left-1.5 h-6 w-6 border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                />
                <span className="absolute -top-1.5 -right-2.25 rounded-full border-2 border-white bg-pitch px-1.5 py-0.5 font-mono text-[11px] font-extrabold leading-none text-white shadow-[0_2px_5px_rgba(0,0,0,0.28)]">
                    {elo}
                </span>
            </span>
            <div className="relative mt-1.5 max-w-23.5 rounded-lg bg-panel px-2 py-1 text-center shadow-soft">
                <div className="truncate text-[14px] font-extrabold leading-tight">{name}</div>
                <div className="flex items-baseline justify-center gap-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-pitch">
                        {position}
                    </span>
                    {year !== undefined && (
                        <span className="font-mono text-[11px] font-bold text-muted">{year}</span>
                    )}
                </div>
                {onRemove && <RemoveButton name={name} onRemove={onRemove} />}
            </div>
        </div>
    );
}
