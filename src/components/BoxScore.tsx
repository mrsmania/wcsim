import { HelpCircle, Sparkles } from 'lucide-react';
import type { Player } from '../data/types';
import { categoryOf, CATEGORY_ORDER, lastName } from '../data/types';
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
    /** Show the chemistry readout (user XI only; also gated by FEATURES.chemistry). */
    showChemistry?: boolean;
}

function avgElo(players: Player[]): number {
    if (players.length === 0) return 0;
    return Math.round(players.reduce((s, p) => s + p.elo, 0) / players.length);
}

function Cell({ label, title, value }: { label: string; title: string; value: number }) {
    return (
        <div
            title={title}
            className="flex flex-1 flex-col items-center justify-center rounded-xl bg-pitch/5 px-2 py-2"
        >
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
            <div className="font-mono text-xl font-extrabold leading-none">{value || '—'}</div>
        </div>
    );
}

/** Compact team-rating bar shown above the pitch: overall, att/mid/def and the
 *  chemistry readout in one row, with the per-category breakdown below. */
export default function BoxScore({ formation, filled, showChemistry = false }: Props) {
    const placedPlayers = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
    const attack = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'FWD'));
    const midfield = avgElo(placedPlayers.filter((p) => categoryOf(p.positions[0]) === 'MID'));
    const defense = avgElo(
        placedPlayers.filter((p) => ['GK', 'DEF'].includes(categoryOf(p.positions[0]))),
    );
    const overall = avgElo(placedPlayers);

    const chem = FEATURES.chemistry && showChemistry ? teamChemistry(formation, filled) : null;
    const donutPct = chem ? Math.round((chem.bonus / MAX_BONUS) * 100) : 0;

    // Slots ordered back-to-front for the mobile table (GK, DEF, MID, FWD).
    const ordered = [...formation.slots].sort(
        (a, b) =>
            CATEGORY_ORDER.indexOf(categoryOf(a.position)) -
            CATEGORY_ORDER.indexOf(categoryOf(b.position)),
    );

    return (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-3 shadow-soft">
            <div className="flex flex-wrap items-stretch gap-2.5">
                {/* Overall hero */}
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-pitch to-pitch-dark px-4 py-2.5 text-white shadow-[0_8px_18px_rgba(12,111,57,0.26)]">
                    <div className="font-mono text-[34px] font-extrabold leading-none">
                        {overall || '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-white/85">
                        Overall
                        <b className="mt-0.5 block text-sm font-bold normal-case tracking-normal text-white">
                            Your XI
                        </b>
                    </div>
                </div>

                {/* Att / Mid / Def */}
                <div className="flex flex-1 gap-2.5">
                    <Cell label="Att" title="Attack" value={attack} />
                    <Cell label="Mid" title="Midfield" value={midfield} />
                    <Cell label="Def" title="Defense (incl. GK)" value={defense} />
                </div>

                {/* Chemistry */}
                {chem && (
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2">
                        <span
                            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full"
                            style={{
                                background: `conic-gradient(var(--color-amber) 0 ${donutPct}%, var(--color-line) ${donutPct}% 100%)`,
                            }}
                        >
                            <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white font-mono font-extrabold text-amber">
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
                            <div className="mt-1 text-xs text-muted">
                                Effective overall{' '}
                                <b className="font-mono text-sm font-extrabold text-ink">
                                    {chem.placed > 0 ? overall + chem.bonus : '—'}
                                </b>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Per-category breakdown (kept visible: the points add up to the bonus). */}
            {chem && chem.categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5 text-[11px]">
                    {chem.categories.map((c) => (
                        <span
                            key={c.key}
                            className="rounded-full bg-pitch/8 px-2 py-0.5"
                            title={c.detail}
                        >
                            <span className="font-semibold text-ink">{c.name}</span>{' '}
                            <span className="font-mono text-pitch">+{c.points}</span>
                        </span>
                    ))}
                    <span className="ml-auto font-mono font-extrabold text-pitch">
                        {chem.capped ? `+${chem.rawTotal} capped +${chem.bonus}` : `Total +${chem.bonus}`}
                    </span>
                </div>
            )}

            {/* Mobile only: the full XI with details (on desktop these live on the
          pitch badges, which mobile keeps minimal). Position, last name, flag +
          year, elo. */}
            <ul className="flex flex-col border-t border-line lg:hidden">
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
                            <span
                                className={`flex-1 truncate ${player ? 'font-bold' : 'text-muted'}`}
                            >
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
        </div>
    );
}
