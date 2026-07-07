import { HelpCircle } from 'lucide-react';
import type { Player } from '../data/types';
import { categoryOf, DEF_CATS } from '../data/types';
import type { Formation } from '../domain/formations';
import { placedPlayers, type Filled } from '../domain/draft';
import { teamChemistry, MAX_BONUS } from '../domain/chemistry';
import { FEATURES } from '../config';
import Tooltip from './Tooltip';
import { MONO_CAP } from './matchUi';

/** Full rules shown when hovering the chemistry "?" help icon. Category names and
 *  point tiers match exactly what the breakdown below shows. */
const CHEMISTRY_RULES = (
    <div className="space-y-1.5">
        <div className="font-bold">
            Chemistry, added to your XI's overall. Points add up (max +{MAX_BONUS}):
        </div>
        <ul className="space-y-1">
            <li>
                <span className="font-semibold">Same squad</span> - real teammates (same nation
                &amp; year): 2+ &rarr; +1, 4+ &rarr; +2, 7+ &rarr; +3, all 11 &rarr; +4
            </li>
            <li>
                <span className="font-semibold">Same nation</span> - across any years: 3+ &rarr; +1,
                5+ &rarr; +2, 8+ &rarr; +3
            </li>
            <li>
                <span className="font-semibold">Same tournament</span> - one World Cup: 3+ &rarr; +1,
                5+ &rarr; +2, 8+ &rarr; +3
            </li>
            <li>
                <span className="font-semibold">Same continent</span> - one confederation: 6+ &rarr;
                +1, 9+ &rarr; +2
            </li>
            <li>
                <span className="font-semibold">Same era</span> - all within 4 years: +1
            </li>
            <li>
                <span className="font-semibold">In position</span> - 10+ in their natural
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

/** One scoreboard cell in the ratings strip. The Ovr cell is the deep-green hero. */
function Cell({ label, value, ovr = false }: { label: string; value: number; ovr?: boolean }) {
    return (
        <div className={`border-r border-line px-3 py-3.5 last:border-r-0 ${ovr ? 'bg-pitch-dark' : 'bg-panel'}`}>
            <div
                className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${ovr ? 'text-white/70' : 'text-muted'}`}
            >
                {label}
            </div>
            <div
                className={`mt-1.5 font-mono text-3xl font-bold leading-none ${value ? (ovr ? 'text-white' : 'text-ink') : 'text-line'}`}
            >
                {value || '–'}
            </div>
        </div>
    );
}

/** The right-column readout: a 4-cell ratings strip (Ovr/Att/Mid/Def) and, below
 *  it, the chemistry card (donut + effective overall + the per-category breakdown).
 *  Both render as siblings so the surrounding stack spaces them. */
export default function BoxScore({ formation, filled, showChemistry = false }: Props) {
    const placed = placedPlayers(formation, filled);
    const attack = avgElo(placed.filter((p) => categoryOf(p.positions[0]) === 'FWD'));
    const midfield = avgElo(placed.filter((p) => categoryOf(p.positions[0]) === 'MID'));
    const defense = avgElo(placed.filter((p) => DEF_CATS.includes(categoryOf(p.positions[0]))));
    const overall = avgElo(placed);

    const chem = FEATURES.chemistry && showChemistry ? teamChemistry(formation, filled) : null;
    const donutPct = chem ? Math.round((chem.bonus / MAX_BONUS) * 100) : 0;

    return (
        <>
            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-line shadow-hard">
                <Cell label="Ovr" value={overall} ovr />
                <Cell label="Att" value={attack} />
                <Cell label="Mid" value={midfield} />
                <Cell label="Def" value={defense} />
            </div>

            {chem && (
                <div className="rounded-md border border-line bg-panel p-4 shadow-hard">
                    <div className="flex items-center gap-3.5">
                        <span
                            className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full"
                            style={{
                                background: `conic-gradient(var(--color-amber) 0 ${donutPct}%, var(--color-chalk) ${donutPct}% 100%)`,
                            }}
                        >
                            <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-panel font-mono text-base font-bold text-amber">
                                {chem.bonus > 0 ? `+${chem.bonus}` : '–'}
                            </span>
                        </span>
                        <div className="min-w-0">
                            <div className={`flex items-center gap-1.5 ${MONO_CAP}`}>
                                Chemistry bonus
                                <Tooltip
                                    wide
                                    label={CHEMISTRY_RULES}
                                    className="cursor-help text-muted/70 transition hover:text-muted"
                                >
                                    <HelpCircle size={13} strokeWidth={2.5} />
                                </Tooltip>
                            </div>
                            <div className="mt-0.5 font-display text-lg font-extrabold leading-tight">
                                Effective overall{' '}
                                <span className="text-amber">
                                    {chem.placed > 0 ? overall + chem.bonus : '–'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {chem.categories.length > 0 && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-line pt-3.5">
                            {chem.categories.map((c) => (
                                <span
                                    key={c.key}
                                    className="rounded-[3px] border border-line px-2 py-1 font-mono text-[11px] font-semibold text-muted"
                                    title={c.detail}
                                >
                                    {c.name} <b className="font-bold text-pitch">+{c.points}</b>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
