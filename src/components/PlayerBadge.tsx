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
    photoUrl?: string;
    /** Render an empty "pick" slot (dashed + face, amber accent) instead of a player. */
    open?: boolean;
}

/** Compact vertical player badge (the Turf pitch badge). Self-contained: it carries
 *  no absolute positioning of its own, so a parent can place it freely. */
export default function PlayerBadge({ name, position, code, elo, year, photoUrl, open }: Props) {
    if (open) {
        return (
            <div className="flex w-[62px] flex-col items-center">
                <span className="grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-dashed border-amber bg-amber/10 text-2xl font-light leading-none text-amber">
                    +
                </span>
                <div className="mt-1.5 max-w-[64px] rounded-lg bg-panel px-2 py-0.5 text-center shadow-soft outline outline-2 outline-amber">
                    <div className="truncate text-[11px] font-extrabold leading-tight">
                        Pick a {position}
                    </div>
                    <div className="flex items-baseline justify-center">
                        <span className="text-[8px] font-extrabold uppercase tracking-wider text-amber">
                            {position}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-[62px] flex-col items-center">
            <span className="relative block h-[46px] w-[46px]">
                <FaceAvatar
                    photoUrl={photoUrl}
                    name={name}
                    className="h-full w-full border-[2.5px] border-white shadow-[0_6px_13px_rgba(0,0,0,0.3)]"
                />
                <Flag
                    round
                    code={code}
                    className="absolute -bottom-[3px] -left-[3px] h-[18px] w-[18px] border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                />
                <span className="absolute -top-[5px] -right-[8px] rounded-full border-[1.5px] border-white bg-pitch px-[5px] py-[3px] font-mono text-[10px] font-extrabold leading-none text-white shadow-[0_2px_5px_rgba(0,0,0,0.28)]">
                    {elo}
                </span>
            </span>
            <div className="mt-1.5 max-w-[64px] rounded-lg bg-panel px-2 py-0.5 text-center shadow-soft">
                <div className="truncate text-[11px] font-extrabold leading-tight">{name}</div>
                <div className="flex items-baseline justify-center gap-1">
                    <span className="text-[8px] font-extrabold uppercase tracking-wider text-pitch">
                        {position}
                    </span>
                    {year !== undefined && (
                        <span className="font-mono text-[8px] font-bold text-muted">{year}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
