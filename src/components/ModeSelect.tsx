import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, CircleDashed, Play, Swords, Trophy } from 'lucide-react';
import type { Player } from '../data/types';
import { FEATURES } from '../config';
import { collectiblePlayers, tierOf } from '../domain/album';
import { SQUAD_BY_ID } from '../data/squads';
import { TIER_META } from './StickerCard';

/** The landing launcher (route `/`): a marketing hero that sells the fantasy, then a
 *  3-beat "how it works" and a "chase the legends" showcase. Quick Run and Career Mode
 *  both lead to the same 3-column build page; the choice only decides what the single
 *  "Start Run" does and whether the run feeds a persistent career. Shown only when
 *  `FEATURES.careerMode` is on (with it off, `/` is the build page directly). */
interface Props {
    /** Target route for the "Quick Run" CTA (resumes an in-progress World Cup if there
     *  is one, else the quick-run build page). A real link, so middle/ctrl-click works. */
    quickTo: string;
    /** Target route for the "Career Mode" CTA (resumes an in-progress Cup Run, else the
     *  career build page). */
    careerTo: string;
    /** A World Cup in progress -> its route (resume), else null. */
    worldCupRoute: string | null;
    /** A Cup Run in progress -> offer to resume it, with a short round summary. */
    cupRunInProgress: boolean;
    cupRunSummary?: string;
    /** The active squad pool, for the rarest-stickers showcase. */
    allPlayers: Player[];
}

/** The all-time XI shown on the hero tactics board (a fixed marketing line-up, not a
 *  real squad): a 4-3-3 offensive, GK at the bottom, attacking up. `x`/`y` are percent
 *  positions on the board; `n` is the shirt number. */
const LINEUP: { n: number; name: string; x: number; y: number }[] = [
    { n: 1, name: 'Casillas', x: 50, y: 93 },
    { n: 3, name: 'Maldini', x: 15, y: 76 },
    { n: 13, name: 'Cannavaro', x: 38.5, y: 79 },
    { n: 4, name: 'Ramos', x: 61.5, y: 79 },
    { n: 16, name: 'Lahm', x: 85, y: 76 },
    { n: 6, name: 'Xavi', x: 34, y: 60 },
    { n: 8, name: 'Kroos', x: 66, y: 60 },
    { n: 5, name: 'Zidane', x: 50, y: 44 },
    { n: 7, name: 'Mbappé', x: 20, y: 29 },
    { n: 9, name: 'Ronaldo', x: 50, y: 23 },
    { n: 10, name: 'Messi', x: 80, y: 29 },
];

// The game's exact pitch greens (see Pitch.tsx): a green board in both themes.
const GRASS_BASE = '#1a7d45';
const GRASS_STRIPE = '#1f8a4d';

const CTA =
    'inline-flex items-center gap-2 rounded-lg px-[22px] py-[14px] font-display text-[14px] font-extrabold uppercase tracking-[0.04em] transition';

function ResumeButton({
    to,
    label,
    sub,
}: {
    to: string;
    label: string;
    sub: string;
}) {
    return (
        <Link
            to={to}
            className="inline-flex items-center gap-3 rounded-[10px] border border-white/20 bg-white/[0.08] py-[9px] pl-[9px] pr-[14px] text-left text-white transition hover:bg-white/[0.14]"
        >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-amber text-ink">
                <Play size={15} fill="currentColor" strokeWidth={0} />
            </span>
            <span className="min-w-0">
                <b className="block font-display text-[14px] font-extrabold leading-[1.1]">{label}</b>
                <small className="mt-[2px] block truncate font-mono text-[11px] text-white/70">{sub}</small>
            </span>
            <ChevronRight size={16} className="ml-0.5 shrink-0 text-white/60" />
        </Link>
    );
}

function Beat({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-chalk text-accent">
                {icon}
            </span>
            <div>
                <h3 className="font-display text-[16px] font-extrabold tracking-[-0.01em]">{title}</h3>
                <p className="mt-1 text-[13px] text-muted">{children}</p>
            </div>
        </div>
    );
}

export default function ModeSelect({
    quickTo,
    careerTo,
    worldCupRoute,
    cupRunInProgress,
    cupRunSummary,
    allPlayers,
}: Props) {
    // The rarest collectibles (highest-rated), for the "chase the legends" showcase.
    const legends = useMemo(() => {
        if (!FEATURES.stickerAlbum) return [];
        return [...collectiblePlayers(allPlayers)]
            .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))
            .slice(0, 5);
    }, [allPlayers]);

    return (
        <div className="mt-6">
            {/* HERO - the pitch as a tactics board, text laid over the grass */}
            <section
                className="relative flex items-center gap-10 overflow-hidden rounded-[14px] px-[clamp(22px,5vw,52px)] py-[clamp(30px,5vw,54px)] text-white shadow-[7px_7px_0_var(--color-ink)]"
                style={{ background: GRASS_BASE }}
            >
                <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                        background: `repeating-linear-gradient(0deg, ${GRASS_STRIPE} 0 44px, ${GRASS_BASE} 44px 88px)`,
                    }}
                />

                <div className="relative max-w-[620px] flex-1">
                    <h2 className="font-display text-[clamp(34px,6.4vw,60px)] font-black leading-none tracking-[-0.03em] [text-wrap:balance]">
                        Draft your dream XI.
                        <br />
                        <span className="text-amber">Win the World Cup.</span>
                    </h2>
                    <p className="mt-4 max-w-[52ch] text-[clamp(15px,2.2vw,17px)] text-white/[0.82]">
                        Spin real squads from every World Cup since 1990, pick your eleven one slot at
                        a time, then run the gauntlet - group stage to final, live and minute by minute.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link
                            to={quickTo}
                            className={`${CTA} bg-white text-[#13211a] hover:bg-white/90`}
                        >
                            Play a Quick Run
                            <ArrowRight size={17} strokeWidth={2.5} />
                        </Link>
                        <Link
                            to={careerTo}
                            className={`${CTA} bg-amber text-[#13211a] hover:bg-amber/90`}
                        >
                            Enter Career Mode
                            <ArrowRight size={17} strokeWidth={2.5} />
                        </Link>
                    </div>
                    <p className="mt-3.5 text-[12.5px] text-white/70">
                        <b className="font-semibold text-white">Quick Run</b> is a one-off.{' '}
                        <b className="font-semibold text-white">Career Mode</b> keeps your progress -
                        boosts, Prestige and unlocks that carry between runs.
                    </p>

                    {(cupRunInProgress || worldCupRoute) && (
                        <div className="mt-5 flex flex-wrap gap-2.5">
                            {cupRunInProgress && (
                                <ResumeButton
                                    to="/cup-run"
                                    label="Resume your Cup Run"
                                    sub={cupRunSummary ?? 'Pick up where you left off'}
                                />
                            )}
                            {worldCupRoute && (
                                <ResumeButton
                                    to={worldCupRoute}
                                    label="Resume the World Cup"
                                    sub="Back to your tournament"
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* All-time 4-3-3 on the tactics board (desktop only) */}
                <div className="relative hidden aspect-[200/300] w-[272px] shrink-0 min-[1120px]:block">
                    <svg
                        viewBox="0 0 200 300"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.4}
                        className="absolute inset-0 h-full w-full"
                        style={{ color: 'rgba(255,255,255,0.82)' }}
                        aria-hidden
                    >
                        <rect x="8" y="8" width="184" height="284" />
                        <path d="M14 8 A 6 6 0 0 1 8 14" />
                        <path d="M186 8 A 6 6 0 0 0 192 14" />
                        <path d="M8 286 A 6 6 0 0 1 14 292" />
                        <path d="M186 292 A 6 6 0 0 1 192 286" />
                        <line x1="8" y1="150" x2="192" y2="150" />
                        <circle cx="100" cy="150" r="28" />
                        <circle cx="100" cy="150" r="2.2" fill="currentColor" stroke="none" />
                        <rect x="52" y="8" width="96" height="44" />
                        <rect x="76" y="8" width="48" height="18" />
                        <circle cx="100" cy="38" r="2.2" fill="currentColor" stroke="none" />
                        <path d="M78 52 A 26 26 0 0 0 122 52" />
                        <rect x="52" y="248" width="96" height="44" />
                        <rect x="76" y="274" width="48" height="18" />
                        <circle cx="100" cy="262" r="2.2" fill="currentColor" stroke="none" />
                        <path d="M78 248 A 26 26 0 0 1 122 248" />
                    </svg>
                    {LINEUP.map((p) => (
                        <div
                            key={p.n}
                            className="absolute flex w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px]"
                            style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        >
                            <span className="grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white bg-pitch-dark font-mono text-[12px] font-extrabold text-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]">
                                {p.n}
                            </span>
                            <span className="whitespace-nowrap rounded-[3px] bg-[rgba(11,45,27,0.74)] px-[5px] py-px text-[9px] font-bold leading-[1.35] text-white">
                                {p.name}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS */}
            <div className="mt-8 grid grid-cols-1 gap-4 min-[680px]:grid-cols-3">
                <Beat icon={<CircleDashed size={21} strokeWidth={2} />} title="Draft your XI">
                    Roll real squads (or shop a transfer budget) and pick your eleven, one position at a
                    time.
                </Beat>
                <Beat icon={<Swords size={21} strokeWidth={2} />} title="Play the tournament">
                    Group stage, then knockouts - revealed live, goal by goal, just like the real thing.
                </Beat>
                <Beat icon={<Trophy size={21} strokeWidth={2} />} title="Lift the cup">
                    Win it all - and keep the legends you drafted in a Panini-style sticker album.
                </Beat>
            </div>

            {/* CHASE THE LEGENDS */}
            {FEATURES.stickerAlbum && legends.length > 0 && (
                <section className="mt-10">
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                        <div>
                            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">
                                Chase the legends
                            </h2>
                            <p className="mt-1 text-[13.5px] text-muted">
                                Draft an all-time great and the sticker is yours to keep. These five are
                                the rarest of all.
                            </p>
                        </div>
                        <Link
                            to="/album"
                            className="whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-pitch transition hover:text-pitch-dark"
                        >
                            Open the album &rarr;
                        </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 min-[760px]:grid-cols-5">
                        {legends.map((p) => {
                            const meta = TIER_META[tierOf(p)!];
                            const code = SQUAD_BY_ID[p.squadId]?.code ?? '';
                            return (
                                <div
                                    key={p.id}
                                    // Dim + grayscale (lit up on hover) only where hover exists; on
                                    // touch there is no hover, so show full colour and no lift.
                                    className="group overflow-hidden rounded-[10px] border border-line bg-panel shadow-[4px_4px_0_var(--color-line)] transition duration-300 [@media(hover:hover)]:opacity-90 [@media(hover:hover)]:grayscale hover:-translate-y-[3px] hover:opacity-100 hover:shadow-[6px_6px_0_#c99a2e] hover:grayscale-0"
                                >
                                    <div className="h-[6px]" style={{ background: meta.accent }} />
                                    {FEATURES.stickerImages && (
                                        <img
                                            src={`${import.meta.env.BASE_URL}stickers/${p.id}.png`}
                                            alt={p.name}
                                            // Large centred avatar on phones (the card's main eye-catcher);
                                            // full-width square hero from the 3-column breakpoint up.
                                            className="mx-auto mt-3 block aspect-square w-4/5 rounded-lg bg-white object-cover object-top min-[460px]:mx-0 min-[460px]:mt-0 min-[460px]:w-full min-[460px]:rounded-none"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    )}
                                    <div className="px-3 pb-3 pt-2.5 text-center">
                                        <span className="inline-block rounded bg-chalk px-[7px] py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                                            {code}
                                        </span>
                                        <div className="mt-2 font-display text-[14px] font-extrabold leading-[1.15]">
                                            {p.name}
                                        </div>
                                        <div className="mt-1.5 font-mono text-[22px] font-bold leading-none text-accent">
                                            {p.elo}
                                        </div>
                                        <div
                                            className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
                                            style={{ color: meta.accent }}
                                        >
                                            {meta.name}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* CLOSING */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3.5 border-t border-line pt-6">
                <div className="max-w-[42ch] font-display text-[17px] font-bold tracking-[-0.01em]">
                    From Maradona in '90 to Mbapp&eacute; in '22.{' '}
                    <span className="font-medium text-muted">Nine World Cups, every squad, one trophy.</span>
                </div>
                <div className="flex gap-2">
                    {FEATURES.stickerAlbum && (
                        <Link
                            to="/album"
                            className="rounded-md border border-line px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted transition hover:border-pitch hover:text-pitch"
                        >
                            Sticker Album
                        </Link>
                    )}
                    {FEATURES.squadBrowser && (
                        <Link
                            to="/squads/by-world-cup"
                            className="rounded-md border border-line px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted transition hover:border-pitch hover:text-pitch"
                        >
                            Squad Browser
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
