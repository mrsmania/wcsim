import Flag from './Flag';

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
            className={`relative block shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-[#dceae0] to-[#a7c8af] ${className}`}
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
}

/** Compact vertical player badge (the Turf pitch badge). Self-contained: it carries
 *  no absolute positioning of its own, so a parent can place it freely. */
export default function PlayerBadge({ name, position, code, elo, year, number, photoUrl, open, compact }: Props) {
    // Mobile pitch: a small pill with just the shirt number and surname; the full
    // details live in the players table beneath the pitch.
    if (compact && !open) {
        return (
            <span className="flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 shadow-soft">
                <span className="font-mono text-[11px] font-bold text-muted">{number}</span>
                <span className="max-w-[88px] truncate text-[13px] font-extrabold leading-none text-ink">
                    {name}
                </span>
            </span>
        );
    }

    if (open) {
        return (
            <div className="flex w-[88px] flex-col items-center">
                <span className="grid h-[58px] w-[58px] place-items-center rounded-full border-2 border-dashed border-amber bg-amber/10 text-3xl font-light leading-none text-amber">
                    +
                </span>
                <div className="mt-1.5 max-w-[94px] rounded-lg bg-panel px-2 py-1 text-center shadow-soft outline outline-2 outline-amber">
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
        <div className="flex w-[88px] flex-col items-center">
            <span className="relative block h-[58px] w-[58px]">
                <FaceAvatar
                    photoUrl={photoUrl}
                    name={name}
                    className="h-full w-full border-[3px] border-white shadow-[0_6px_14px_rgba(0,0,0,0.32)]"
                />
                <Flag
                    round
                    code={code}
                    className="absolute -bottom-[3px] -left-[3px] h-[24px] w-[24px] border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                />
                <span className="absolute -top-[6px] -right-[9px] rounded-full border-2 border-white bg-pitch px-1.5 py-0.5 font-mono text-[11px] font-extrabold leading-none text-white shadow-[0_2px_5px_rgba(0,0,0,0.28)]">
                    {elo}
                </span>
            </span>
            <div className="mt-1.5 max-w-[94px] rounded-lg bg-panel px-2 py-1 text-center shadow-soft">
                <div className="truncate text-[12px] font-extrabold leading-tight">{name}</div>
                <div className="flex items-baseline justify-center gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-pitch">
                        {position}
                    </span>
                    {year !== undefined && (
                        <span className="font-mono text-[10px] font-bold text-muted">{year}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
