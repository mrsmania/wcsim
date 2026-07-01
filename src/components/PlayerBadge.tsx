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
            <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-pitch-dark font-mono text-[15px] font-extrabold text-white shadow-[0_3px_8px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(255,255,255,0.35)]">
                {number}
            </span>
            <div className="relative mt-1.5 max-w-22 rounded-md bg-panel px-2 py-0.5 text-center shadow-soft">
                <div className="truncate text-[13px] font-extrabold leading-tight">{name}</div>
                {onRemove && <RemoveButton name={name} onRemove={onRemove} />}
            </div>
        </div>
    );
}
