import { HelpCircle } from 'lucide-react';
import type { Formation } from '../domain/formations';
import { lineAverages } from '../domain/match';
import { placedPlayers, type Filled } from '../domain/draft';
import { ratingBand } from '../domain/pvpView';
import { CHEM_TIERS, ERA_SPAN_YEARS, FIT_MIN, MAX_BONUS, teamChemistry } from '../domain/chemistry';
import { FEATURES } from '../config';
import Tooltip from './Tooltip';
import { CARD, MONO_CAP } from './matchUi';

/** Full rules shown when hovering the chemistry "?" help icon. Category names and
 *  point tiers match exactly what the breakdown below shows. */
/** The numbers in one tooltip row, read from the scorer's own tier table so the explanation
 *  cannot drift from the rule. "all 11" rather than "11+" for a full XI, which is what the
 *  hand-written copy said. */
const tierText = (key: keyof typeof CHEM_TIERS) =>
    CHEM_TIERS[key]
        .map(([size, points]) => `${size === 11 ? 'all 11' : `${size}+`} \u2192 +${points}`)
        .join(', ');
const CHEMISTRY_RULES = (
    <div className="space-y-1.5">
        <div className="font-bold">
            Chemistry, added to your XI's overall. Points add up (max +{MAX_BONUS}):
        </div>
        <ul className="space-y-1">
            <li>
                <span className="font-semibold">Same squad</span> - real teammates (same nation
                &amp; year): {tierText('squad')}
            </li>
            <li>
                <span className="font-semibold">Same nation</span> - across any years:{' '}
                {tierText('nation')}
            </li>
            <li>
                <span className="font-semibold">Same tournament</span> - one World Cup:{' '}
                {tierText('tournament')}
            </li>
            <li>
                <span className="font-semibold">Same continent</span> - one confederation:{' '}
                {tierText('continent')}
            </li>
            <li>
                <span className="font-semibold">Same era</span> - all within {ERA_SPAN_YEARS}{' '}
                years: +1
            </li>
            <li>
                <span className="font-semibold">In position</span> - {FIT_MIN}+ in their natural
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
    /** Whether the three cells show their FIGURES. False in a hidden-ratings versus room
     *  (P5): the strip keeps its shape and its three cells and shows a word instead, so a
     *  hidden room reads like an open one rather than like a broken one. */
    ratings?: boolean;
    /** Whether the chemistry card is shown at all. It is OFF in a versus room (P25) and
     *  that is a matter of truth rather than of clutter: `pvpTeam` takes no chemistry
     *  argument, so a room's match is played on the plain eleven ratings, and a card
     *  promising an effective overall four points higher would be describing a bonus the
     *  simulator never receives. */
    chemistry?: boolean;
}

/** One scoreboard cell in the ratings strip. The Ovr cell is the deep-green hero.
 *
 *  With `band` it prints a word rather than the figure, at a smaller size because
 *  "Elite" at 30px does not fit the cell the way "86" does. */
function Cell({
    label,
    value,
    band,
    ovr = false,
}: {
    label: string;
    value: number;
    band?: string;
    ovr?: boolean;
}) {
    return (
        <div className={`border-r border-line px-3 py-3.5 last:border-r-0 ${ovr ? 'bg-pitch-dark' : 'bg-panel'}`}>
            <div
                className={`font-mono text-[10px] font-semibold uppercase tracking-[0.16em] ${ovr ? 'text-white/70' : 'text-muted'}`}
            >
                {label}
            </div>
            <div
                className={`mt-1.5 font-mono font-bold leading-none ${band ? 'text-xl' : 'text-3xl'} ${value ? (ovr ? 'text-white' : 'text-ink') : 'text-line'}`}
            >
                {band ?? (value || '–')}
            </div>
        </div>
    );
}

/** The right-column readout: a 3-cell ratings strip (Ovr/Att/Def) and, below it, the
 *  chemistry card (donut + effective overall + the per-category breakdown). Both render
 *  as siblings so the surrounding stack spaces them. */
export default function BoxScore({ formation, filled, ratings = true, chemistry = true }: Props) {
    const placed = placedPlayers(formation, filled);
    // The simulator's own groups (Att is MID+FWD, Def is GK+DEF), so these are the
    // numbers a run is played on - which is why there is no Mid cell to add: midfielders
    // are inside Att. `lineAverages` differs from `xiStrength` in one way only, the empty
    // line, and its docstring beside it says why (hygiene H144, audit decision D7).
    const { overall, attack, defense } = lineAverages(placed);

    // Undefined keeps the figure; a word replaces it. One helper so the three cells
    // cannot disagree about which room they are in.
    const band = (v: number) => (ratings ? undefined : ratingBand(v));

    const chem = FEATURES.chemistry && chemistry ? teamChemistry(formation, filled) : null;
    const donutPct = chem ? Math.round((chem.bonus / MAX_BONUS) * 100) : 0;

    return (
        <>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-line shadow-hard">
                <Cell label="Ovr" value={overall} band={band(overall)} ovr />
                <Cell label="Att" value={attack} band={band(attack)} />
                <Cell label="Def" value={defense} band={band(defense)} />
            </div>

            {chem && (
                <div className={`${CARD} p-4`}>
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
                                    {c.name} <b className="font-bold text-pitch-ink">+{c.points}</b>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
