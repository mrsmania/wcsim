import { HelpCircle, Sparkles } from 'lucide-react';
import type { Player } from '../data/types';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { teamChemistry, MAX_BONUS } from '../domain/chemistry';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES } from '../config';
import Tooltip from './Tooltip';
import Flag from './Flag';

/** Full rules shown when hovering the chemistry "?" help icon. Category names and
 *  point tiers match exactly what the breakdown below shows. */
const CHEMISTRY_RULES = (
    <div className="space-y-1.5">
        <div className="font-bold">Chemistry — added to your XI's overall. Points add up (max +{MAX_BONUS}):</div>
        <ul className="space-y-1">
            <li><span className="font-semibold">Same squad</span> — real teammates (same nation &amp; year): 2+ → +1, 4+ → +2, 7+ → +3, all 11 → +4</li>
            <li><span className="font-semibold">Same nation</span> — across any years: 3+ → +1, 5+ → +2, 8+ → +3</li>
            <li><span className="font-semibold">Same tournament</span> — one World Cup: 3+ → +1, 5+ → +2, 8+ → +3</li>
            <li><span className="font-semibold">Same continent</span> — one confederation: 6+ → +1, 9+ → +2</li>
            <li><span className="font-semibold">Same era</span> — all within 4 years: +1</li>
            <li><span className="font-semibold">In position</span> — 10+ in their natural (underlined) role: +1</li>
        </ul>
        <div className="text-stone-300">
            The largest group in each row counts. Add the rows up; the total is capped at +{MAX_BONUS}.
        </div>
    </div>
);

interface Props {
    formation: Formation;
    filled: Filled;
    title?: string;
    /** Show the chemistry readout (user XI only; also gated by FEATURES.chemistry). */
    showChemistry?: boolean;
}

function avgElo(players: Player[]): number {
    if (players.length === 0) return 0;
    return Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length);
}

function Square({
    label,
    title,
    value,
    className,
}: {
    label: string;
    title: string;
    value: number;
    className: string;
}) {
    return (
        <div
            title={title}
            className={`flex aspect-square flex-col items-center justify-center rounded-md text-white ${className}`}
        >
            <span className="font-mono text-xl font-black leading-none">{value || '—'}</span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-90">{label}</span>
        </div>
    );
}

export default function BoxScore({ formation, filled, title = 'Team Score', showChemistry = false }: Props) {
    const placedPlayers = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
    const attack = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'FWD'));
    const midfield = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'MID'));
    const defense = avgElo(
        placedPlayers.filter((p) => ['GK', 'DEF'].includes(categoryOf(p.positions[0]))),
    );
    const overall = avgElo(placedPlayers);

    const chem = FEATURES.chemistry && showChemistry ? teamChemistry(formation, filled) : null;

    // Slots ordered back-to-front: GK, DEF, MID, FWD.
    const ordered = [...formation.slots].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
            CATEGORY_ORDER.indexOf(categoryOf(b.position)),
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="border-b-2 border-stone-900 pb-2">
                <h2 className="text-sm font-black uppercase tracking-[0.15em]">{title}</h2>
            </div>

            <div className="grid grid-cols-4 gap-2">
                <Square label="Att" title="Attack" value={attack} className="bg-red-600" />
                <Square label="Mid" title="Midfield" value={midfield} className="bg-amber-500" />
                <Square label="Def" title="Defense (incl. GK)" value={defense} className="bg-stone-900" />
                <Square label="Ovr" title="Overall" value={overall} className="bg-emerald-600" />
            </div>

            {chem && (
                <div className="rounded-md border border-emerald-600/30 bg-emerald-600/[0.06] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                            <Sparkles size={13} strokeWidth={2.5} /> Chemistry
                            <Tooltip
                                wide
                                label={CHEMISTRY_RULES}
                                className="cursor-help text-emerald-700/60 transition hover:text-emerald-800"
                            >
                                <HelpCircle size={13} strokeWidth={2.5} />
                            </Tooltip>
                        </span>
                        <span className="font-mono text-sm font-black text-emerald-700">
                            {chem.bonus > 0 ? `+${chem.bonus}` : '—'}
                        </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                            Effective overall
                        </span>
                        <span className="font-mono text-base font-black">
                            {chem.placed > 0 ? overall + chem.bonus : '—'}
                        </span>
                    </div>
                    {chem.categories.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-emerald-600/20 pt-1.5">
                            {chem.categories.map((c) => (
                                <li
                                    key={c.key}
                                    className="flex items-baseline justify-between gap-2 text-[11px]"
                                >
                                    <span className="min-w-0 truncate">
                                        <span className="font-semibold text-stone-700">{c.name}</span>{' '}
                                        <span className="text-stone-400">{c.detail}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-emerald-700">
                                        +{c.points}
                                    </span>
                                </li>
                            ))}
                            <li className="mt-0.5 flex items-baseline justify-between gap-2 border-t border-emerald-600/20 pt-1 text-[11px]">
                                <span className="font-semibold text-stone-500">
                                    {chem.capped
                                        ? `Total +${chem.rawTotal}, capped at +${MAX_BONUS}`
                                        : 'Total'}
                                </span>
                                <span className="shrink-0 font-mono font-black text-emerald-700">
                                    +{chem.bonus}
                                </span>
                            </li>
                        </ul>
                    )}
                </div>
            )}

            <ul className="flex flex-col">
                {ordered.map((slot) => {
                    const player = filled[slot.id];
                    const sq = player ? SQUAD_BY_ID[player.squadId] : null;
                    return (
                        <li
                            key={slot.id}
                            className="flex items-center gap-2 border-b border-stone-200 py-1.5 text-sm"
                        >
                            <span className="w-8 text-[11px] font-bold uppercase text-stone-500">
                                {slot.label}
                            </span>
                            <span
                                className={`flex-1 truncate ${player ? 'font-semibold' : 'text-stone-400'}`}
                            >
                                {player ? player.name : '—'}
                            </span>
                            {chem && sq && (
                                <span className="flex shrink-0 items-center gap-1 text-stone-400">
                                    <Flag code={sq.code} className="h-3 w-5" />
                                    <span className="w-7 font-mono text-[10px] tabular-nums">
                                        ’{String(sq.year).slice(2)}
                                    </span>
                                </span>
                            )}
                            <span className="w-7 text-right font-mono text-sm font-black">
                                {player ? player.elo : '—'}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
