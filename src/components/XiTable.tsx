import { categoryOf, CATEGORY_ORDER, lastName } from '../data/types';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { SQUAD_BY_ID } from '../data/squads';
import Flag from './Flag';

/** The placed XI as a details table: position, last name, flag + year, elo,
 *  ordered back to front (GK, DEF, MID, FWD). Shown beside the pitch on desktop
 *  and below it on mobile, so the pitch badges themselves can stay minimal. */
export default function XiTable({ formation, filled }: { formation: Formation; filled: Filled }) {
    const ordered = [...formation.slots].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
            CATEGORY_ORDER.indexOf(categoryOf(b.position)),
    );

    return (
        <ul className="flex flex-col rounded-md border border-line bg-panel px-3 shadow-hard">
            {ordered.map((slot) => {
                const player = filled[slot.id];
                const sq = player ? SQUAD_BY_ID[player.squadId] : null;
                return (
                    <li
                        key={slot.id}
                        className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-b-0"
                    >
                        <span className="w-8 shrink-0 text-[11px] font-bold uppercase text-muted">
                            {slot.label}
                        </span>
                        <span className={`flex-1 truncate ${player ? 'font-bold' : 'text-muted'}`}>
                            {player ? lastName(player.name) : '—'}
                        </span>
                        <span className="flex w-[60px] shrink-0 items-center gap-1.5 text-muted">
                            {sq && (
                                <>
                                    <Flag code={sq.code} className="h-3.5 w-5" />
                                    <span className="font-mono text-[11px] tabular-nums">
                                        {sq.year}
                                    </span>
                                </>
                            )}
                        </span>
                        <span className="w-7 shrink-0 text-right font-mono text-sm font-extrabold">
                            {player ? player.elo : '—'}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
