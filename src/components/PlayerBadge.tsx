import { X } from 'lucide-react';

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
    number?: number;
    /** Testing aid: when set, show a remove (x) control that clears this slot. */
    onRemove?: () => void;
}

/** Minimal pitch token: a circle with the jersey number (a face can replace it
 *  later) and the player's last name below. The same badge is used on desktop and
 *  mobile; the full player details live in the XI table beside the pitch. */
export default function PlayerBadge({ name, number, onRemove }: Props) {
    return (
        <div className="flex w-20 flex-col items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-linear-to-b from-[#dceae0] to-[#a7c8af] font-mono text-[15px] font-extrabold text-ink shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                {number}
            </span>
            <div className="relative mt-1.5 max-w-22 rounded-md bg-panel px-2 py-0.5 text-center shadow-soft">
                <div className="truncate text-[13px] font-extrabold leading-tight">{name}</div>
                {onRemove && <RemoveButton name={name} onRemove={onRemove} />}
            </div>
        </div>
    );
}
