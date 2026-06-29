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
        <div className="font-bold">
            Chemistry, added to your XI's overall. Points add up (max +{MAX_BONUS}):
        </div>
        <ul className="space-y-1">
            <li>
                <span className="font-semibold">Same squad</span> — real teammates (same nation
                &amp; year): 2+ → +1, 4+ → +2, 7+ → +3, all 11 → +4
            </li>
            <li>
                <span className="font-semibold">Same nation</span> — across any years: 3+ → +1, 5+ →
                +2, 8+ → +3
            </li>
            <li>
                <span className="font-semibold">Same tournament</span> — one World Cup: 3+ → +1, 5+
                → +2, 8+ → +3
            </li>
            <li>
                <span className="font-semibold">Same continent</span> — one confederation: 6+ → +1,
                9+ → +2
            </li>
            <li>
                <span className="font-semibold">Same era</span> — all within 4 years: +1
            </li>
            <li>
                <span className="font-semibold">In position</span> — 10+ in their natural
                (underlined) role: +1
            </li>
        </ul>
        <div className="text-white/60">
            The largest group in each row counts. Add the rows up; the total is capped at +
            {MAX_BONUS}.
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

function Cell({ label, title, value }: { label: string; title: string; value: number }) {
    return (
        <div title={title} className="rounded-xl bg-pitch/5 px-1 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
            <div className="mt-0.5 font-mono text-xl font-extrabold leading-none">
                {value || '—'}
            </div>
        </div>
    );
}

export default function BoxScore({
    formation,
    filled,
    title = 'Team rating',
    showChemistry = false,
}: Props) {
    const placedPlayers = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
    const attack = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'FWD'));
    const midfield = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'MID'));
    const defense = avgElo(
        placedPlayers.filter((p) => ['GK', 'DEF'].includes(categoryOf(p.positions[0]))),
    );
    const overall = avgElo(placedPlayers);

    const chem = FEATURES.chemistry && showChemistry ? teamChemistry(formation, filled) : null;
    const donutPct = chem ? Math.round((chem.bonus / MAX_BONUS) * 100) : 0;
    const chemDescriptor =
        chem && chem.categories.length > 0
            ? chem.categories.map((c) => c.name).join(', ')
            : 'Build cohesion to earn a bonus';

    // Slots ordered back-to-front: GK, DEF, MID, FWD.
    const ordered = [...formation.slots].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
            CATEGORY_ORDER.indexOf(categoryOf(b.position)),
    );

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 shadow-soft">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                {title}
            </h2>

            {/* Overall hero */}
            <div className="flex items-center gap-3.5 rounded-2xl bg-gradient-to-br from-pitch to-pitch-dark p-3.5 text-white shadow-[0_10px_22px_rgba(12,111,57,0.28)]">
                <div className="font-mono text-[38px] font-extrabold leading-none">
                    {overall || '—'}
                </div>
                <div className="text-[11px] uppercase tracking-[0.1em] text-white/85">
                    Overall
                    <b className="mt-0.5 block text-sm font-bold normal-case tracking-normal text-white">
                        Your XI
                    </b>
                </div>
            </div>

            {/* Att / Mid / Def trio */}
            <div className="grid grid-cols-3 gap-2.5">
                <Cell label="Att" title="Attack" value={attack} />
                <Cell label="Mid" title="Midfield" value={midfield} />
                <Cell label="Def" title="Defense (incl. GK)" value={defense} />
            </div>

            {chem && (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3.5">
                    <div className="flex items-center gap-3.5">
                        <span
                            className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full"
                            style={{
                                background: `conic-gradient(var(--color-amber) 0 ${donutPct}%, var(--color-line) ${donutPct}% 100%)`,
                            }}
                        >
                            <span className="grid h-10 w-10 place-items-center rounded-full bg-white font-mono font-extrabold text-amber">
                                {chem.bonus > 0 ? `+${chem.bonus}` : '—'}
                            </span>
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                                <Sparkles size={13} strokeWidth={2.5} /> Chemistry
                                <Tooltip
                                    wide
                                    label={CHEMISTRY_RULES}
                                    className="cursor-help text-muted/70 transition hover:text-muted"
                                >
                                    <HelpCircle size={13} strokeWidth={2.5} />
                                </Tooltip>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted">
                                {chemDescriptor}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-baseline justify-between border-t border-line pt-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Effective overall
                        </span>
                        <span className="font-mono text-base font-extrabold">
                            {chem.placed > 0 ? overall + chem.bonus : '—'}
                        </span>
                    </div>

                    {chem.categories.length > 0 && (
                        <ul className="flex flex-col gap-0.5 border-t border-line pt-2.5">
                            {chem.categories.map((c) => (
                                <li
                                    key={c.key}
                                    className="flex items-baseline justify-between gap-2 text-[11px]"
                                >
                                    <span className="min-w-0 truncate">
                                        <span className="font-semibold text-ink">{c.name}</span>{' '}
                                        <span className="text-muted">{c.detail}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-pitch">+{c.points}</span>
                                </li>
                            ))}
                            <li className="mt-0.5 flex items-baseline justify-between gap-2 border-t border-line pt-1.5 text-[11px]">
                                <span className="font-semibold text-muted">
                                    {chem.capped
                                        ? `Total +${chem.rawTotal}, capped at +${MAX_BONUS}`
                                        : 'Total'}
                                </span>
                                <span className="shrink-0 font-mono font-extrabold text-pitch">
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
                            className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-b-0"
                        >
                            <span className="w-8 text-[11px] font-bold uppercase text-muted">
                                {slot.label}
                            </span>
                            <span
                                className={`flex-1 truncate ${player ? 'font-semibold' : 'text-muted'}`}
                            >
                                {player ? player.name : '—'}
                            </span>
                            {chem && sq && (
                                <span className="flex shrink-0 items-center gap-1 text-muted">
                                    <Flag code={sq.code} className="h-3 w-5" />
                                    <span className="w-7 font-mono text-[10px] tabular-nums">
                                        ’{String(sq.year).slice(2)}
                                    </span>
                                </span>
                            )}
                            <span className="w-7 text-right font-mono text-sm font-extrabold">
                                {player ? player.elo : '—'}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
