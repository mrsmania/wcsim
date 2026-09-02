import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleDashed, Swords, Trophy } from 'lucide-react';
import ConfirmAction from './ConfirmAction';
import type { Player } from '../data/types';
import { WORLD_CUP_YEARS } from '../data/squads';
import { FEATURES } from '../config';
import { collectibleCards } from '../domain/album';
import StickerCard from './StickerCard';
import { btn } from './matchUi';

/** The front page (route `/`): a marketing hero that sells the fantasy, then a 3-beat
 *  "how it works" and a "chase the legends" showcase.
 *
 *  It used to be a LAUNCHER, with two door cards (Quick Run / Career Mode) and up to
 *  three resume buttons. Both went with the navigation rework (roadmap items 27 and 28):
 *  the doors led to the identical build page, so the choice became a control on it and
 *  then disappeared entirely when One-off was dropped; and the resume trio became one
 *  Continue. What is left is the part that was always worth keeping - the hero board, the
 *  beats and the legends - plus one primary action.
 *
 *  A THIRD DOOR, "Play somebody", went on 2026-09-01, and it is the same reasoning one
 *  step later. It was the cover's own way into Versus, put there when Versus had no
 *  address of its own; Versus is a tab now, visible from every screen in the game, so the
 *  door was a second answer to a question the bar already answers - and it was pulling the
 *  front page towards a mode this screen is not about. Play is the single-player game.
 *
 *  The single Continue is likewise single-player only: a held versus room used to outrank
 *  the Cup Run here and does not any more (see App). */
interface Props {
    /** The single Continue action (a live run, a tournament, or a half-built XI), or null
     *  when nothing is in progress. */
    continueAction: { to: string; label: string; sub: string } | null;
    /** Where "Build your XI" goes. */
    buildTo: string;
    /** Discard what is in progress and start a fresh build. Destructive, so it confirms
     *  inline. */
    onNewXi?: () => void;
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

// The game's exact pitch greens - the same two tokens Pitch.tsx's board is drawn with,
// which is what these used to be hand-copied from. Not theme-swapped: a green board in
// both themes (see the tokens' comment in index.css).
const GRASS_BASE = 'var(--color-grass)';
const GRASS_STRIPE = 'var(--color-grass-stripe)';

// THE HERO'S CTAs ARE THE APP'S TWO BUTTONS, on the app's one dark surface (2026-09-02).
// They used to be three looks of their own - an amber fill, a white fill and a translucent
// white outline, all at a 14px label and an 8px radius nothing else in the app uses - which
// made the front page the loudest argument against there being a button system at all.
//
// They take `btn(tone, size, 'dark')` now: the same shape, the same radius, the same face
// and the same size as every other page action, rendered for a green ground. The amber went
// with it, and that is the one visible loss: amber was doing the "this is the thing to press"
// job that the primary tone does everywhere else, and it cannot be the primary here because
// `pitch-dark` on the scrimmed grass measures about 1.1 and would disappear. White on green
// is what replaces it, which is what the second CTA already was.
//
// See the note on `btn` in matchUi for why a surface is not a fourth design.

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

export default function ModeSelect({ continueAction, buildTo, onNewXi, allPlayers }: Props) {
    // The rarest collectibles (highest-rated), for the "chase the legends" showcase.
    const legends = useMemo(() => {
        if (!FEATURES.stickerAlbum) return [];
        return collectibleCards(allPlayers)
            .sort(
                (a, b) => b.player.elo - a.player.elo || a.player.name.localeCompare(b.player.name),
            )
            .slice(0, 5);
    }, [allPlayers]);

    return (
        <div className="mt-[30px]">
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
                {/* A scrim under the WORDS only, and it is a contrast fix rather than a
                    flourish: the amber headline on the bare stripes measures 1.76, under
                    even the 3:1 that large text is allowed, and no value of a mid amber
                    reads on a mid green. This deepens the turf where the text sits (3.79
                    for the amber, 10.24 for the white) and fades out before the tactics
                    board, which stays exactly as bright as it was.

                    THE VALUE IS A LITERAL, AND IT USED TO BE `ink` (fixed 2026-09-02).
                    `ink` is theme-swapped, so in the DARK theme the scrim was painted with
                    a near-white (#eceef1) and washed the turf PALE - #8ebba4 by the time it
                    reached the words - which took the white headline to **2.14** and the
                    paragraph with it. The whole point of this layer is to DEEPEN the green,
                    and "deepen" is not something a token that inverts can do. Same
                    reasoning as the CTAs, which have always used the literal: the hero's
                    board is green in both themes, so everything laid over it is too. */}
                <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-r from-[#13211a]/55 via-[#13211a]/25 to-transparent"
                />

                <div className="relative max-w-[620px] flex-1">
                    <h2 className="font-display text-[clamp(34px,6.4vw,60px)] font-black leading-none tracking-[-0.03em] [text-wrap:balance]">
                        Draft your dream XI.
                        <br />
                        <span className="text-amber">Win the World Cup.</span>
                    </h2>
                    <p className="mt-4 max-w-[52ch] text-[clamp(15px,2.2vw,17px)] text-white/[0.82]">
                        Spin real squads from every World Cup since 1970, pick your eleven one slot at
                        a time, then run the gauntlet - group stage to final, live and minute by minute.
                    </p>


                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        {continueAction ? (
                            <>
                                <Link
                                    to={continueAction.to}
                                    className={btn('primary', 'normal', 'dark')}
                                >
                                    {continueAction.label}
                                    <ArrowRight size={17} strokeWidth={2.5} />
                                </Link>
                                {onNewXi && (
                                    <ConfirmAction
                                        triggerLabel="Build a new XI"
                                        triggerClassName={btn('secondary', 'normal', 'dark')}
                                        prompt="This ends what you have in progress."
                                        confirmLabel="Start a new XI"
                                        onConfirm={onNewXi}
                                        rowClassName="flex flex-wrap items-center gap-2.5"
                                        promptClassName="text-[12.5px] font-semibold text-white/85"
                                    />
                                )}
                            </>
                        ) : (
                            <Link
                                to={buildTo}
                                className={btn('primary', 'normal', 'dark')}
                            >
                                Build your XI now
                                <ArrowRight size={17} strokeWidth={2.5} />
                            </Link>
                        )}
                    </div>
                    {continueAction && (
                        <p className="mt-3.5 text-[12.5px] text-white/70">
                            {continueAction.sub}
                        </p>
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
                                {FEATURES.stickersOnCupWinOnly
                                    ? 'Win the cup with an all-time great and the sticker is yours to keep.'
                                    : 'Draft an all-time great and the sticker is yours to keep.'}{' '}
                                These five are the rarest of all.
                            </p>
                        </div>

                    </div>
                    <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 min-[760px]:grid-cols-5">
                        {legends.map(({ player: p, tier }) => (
                            // The album's OWN card, not a second design of one. This showcase is a
                            // promise about the shelf those five end up on, and it used to keep a
                            // card of its own - a different border, a different rating cell, a
                            // country code where the album has a flag - so the thing being promised
                            // did not look like the thing you get.
                            //
                            // Grayscale until hovered, and only where hover EXISTS: on touch there
                            // is nothing to hover, so the cards are in colour from the start rather
                            // than permanently grey.
                            <div
                                key={p.id}
                                // `grid` rather than a plain block: the card is the one child, so it
                                // stretches to the wrapper the way it stretches to the album's own
                                // grid cell, and a name that wraps to two lines does not leave the
                                // four beside it short.
                                className="grid transition duration-300 [@media(hover:hover)]:grayscale hover:-translate-y-[3px] hover:grayscale-0"
                            >
                                <StickerCard player={p} tier={tier} collected />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* CLOSING */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3.5 border-t border-line pt-6">
                <div className="max-w-[42ch] font-display text-[17px] font-bold tracking-[-0.01em]">
                    {/* Derived, both halves. "Nine World Cups" was true three drops ago and
                        "'90 to '22" named the ends of a dataset that now runs further at both
                        ends - a hardcoded count in front of a growing dataset is a promise
                        that goes stale quietly. */}
                    From {WORLD_CUP_YEARS[0]} to {WORLD_CUP_YEARS[WORLD_CUP_YEARS.length - 1]}.{' '}
                    <span className="font-medium text-muted">
                        {WORLD_CUP_YEARS.length} World Cups, every squad, one trophy.
                    </span>
                </div>
                {/* Album and Squads are tabs, so shortcuts here would be a third way to
                    the same two places. */}
            </div>
        </div>
    );
}
