import { HelpCircle, Sparkles } from 'lucide-react';
import type { Player } from '../data/types';
import { CATEGORY_ORDER, categoryOf } from '../data/types';
import type { Formation } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { teamChemistry } from '../domain/chemistry';
import { FEATURES } from '../config';
import Tooltip from './Tooltip';

/** Full rules shown when hovering the chemistry "?" help icon. */
const CHEMISTRY_RULES = (
    <div className="space-y-1">
        <div className="font-bold">Chemistry — a boost to your XI's overall (max +6)</div>
        <ul className="list-disc space-y-0.5 pl-4 marker:text-stone-400">
            <li><span className="font-semibold">Same squad</span> — real teammates (same nation &amp; year). Strongest link.</li>
            <li><span className="font-semibold">Same nation</span> — countrymen across different cups.</li>
            <li><span className="font-semibold">Same tournament</span> — players from one World Cup.</li>
            <li><span className="font-semibold">Same continent</span> — players from one confederation.</li>
            <li><span className="font-semibold">Same era</span> — tournaments close together in time.</li>
            <li><span className="font-semibold">In position</span> — players in their natural (underlined) role.</li>
        </ul>
        <div className="text-stone-300">
            More links and tighter themes mean a bigger boost. Opponents are real national teams, so
            chemistry helps your mixed XI compete.
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

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div>
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-4 ${color}`} />
                    {label}
                </span>
                <span className="font-mono">{value || '—'}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full bg-stone-200">
                <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

export default function BoxScore({ formation, filled, title = 'Team Score', showChemistry = false }: Props) {
    const placed = formation.slots.filter((s) => filled[s.id]).length;
    const total = formation.slots.length;

    const placedPlayers = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
    const attack = avgElo(
        placedPlayers.filter((p) => ['MID', 'FWD'].includes(categoryOf(p.positions[0]))),
    );
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
            <div className="flex items-baseline justify-between border-b-2 border-stone-900 pb-2">
                <h2 className="text-sm font-black uppercase tracking-[0.15em]">{title}</h2>
                <span className="font-mono text-sm font-bold">
                    {placed}
                    <span className="text-stone-400">/{total}</span>
                </span>
            </div>

            <div className="flex flex-col gap-2">
                <StatBar label="Attack" value={attack} color="bg-red-600" />
                <StatBar label="Defense" value={defense} color="bg-stone-900" />
                <StatBar label="Overall" value={overall} color="bg-emerald-600" />
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
                    {chem.links.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-emerald-600/20 pt-1.5">
                            {chem.links.slice(0, 4).map((l) => (
                                <li
                                    key={l.dimension + l.label}
                                    className="flex items-center justify-between text-[11px]"
                                >
                                    <span className="truncate text-stone-600">{l.label}</span>
                                    <span className="ml-2 font-mono text-stone-400">
                                        +{Math.round(l.points)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <ul className="flex flex-col">
                {ordered.map((slot) => {
                    const player = filled[slot.id];
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
