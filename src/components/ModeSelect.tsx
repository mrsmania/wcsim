import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Player } from '../data/types';
import { SQUADS, WORLD_CUP_YEARS } from '../data/squads';
import { FEATURES } from '../config';
import { collectibleCards } from '../domain/album';
import { CHALLENGES } from '../domain/challenges';
import { BOONS } from '../domain/boons';
import StickerCard from './StickerCard';
import { btn, CARD_FLAT, PAGE_TOP } from './matchUi';

/** The front page (route `/`): a marketing hero that sells the fantasy, then the
 *  "chase the legends" showcase. Two things and nothing else.
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
 *  AND THE LAST OF IT, the Continue, went on 2026-09-10 (owner's call): the hero offers
 *  ONE action, "Build your XI now", whatever is in progress. So the cover no longer reads
 *  the run or the half-built board at all, and the pair of buttons it used to grow - a
 *  Continue plus the destructive "Build a new XI" that had to confirm because Continue
 *  was standing beside it - is one plain link that needs no confirm and no sub-line. What
 *  carries on with a run is the Play tab, which already lands on it (see App's `playTo`),
 *  and the run screen itself. Nothing here branches on state now, which is the point:
 *  the front page is the pitch for the game, not a control panel over the save.
 *
 *  AND TWO MORE SECTIONS WENT ON THE SAME DAY (owner's call), which leaves the page at
 *  the two blocks above. The three-beat "how it works" - an icon tile, a heading and a
 *  line of grey text, three across - explained the game in the words the hero paragraph
 *  directly above it had already used, so it was the pitch restated one size smaller;
 *  its `Beat` component and the three lucide icons went with it, and so did
 *  `rounded-[10px]`, which was one of the two radii in the whole codebase used exactly
 *  once (the note on the hero's own corner below predicted that: "the 10px goes when the
 *  beats do"). The closing strip - "From 1970 to 2026. 15 World Cups, every squad, one
 *  trophy." - was a statistic under a rule at the foot of a page whose job was finished
 *  two sections earlier; its figures were derived off `WORLD_CUP_YEARS` rather than
 *  typed, which was the right way to write a line that should not have been there.
 *  **Do not re-add either as "the page looks short".** What sells the game is the board
 *  and the shelf.
 *
 *  AND A THIRD SECTION CAME BACK ON 2026-09-15, WHICH IS NOT THAT NOTE BEING IGNORED
 *  (owner's call, chosen from `docs/redesign-2026/turf-flat/home-options.html`, which
 *  drew five whole pages for it). The page sold the run and the album and said nothing
 *  at all about the career - no levels, no Prestige, no perks, no boosts, no honours -
 *  so three of the game's six tabs were invisible from the screen that is meant to sell
 *  it. That is a page which is INCOMPLETE, and the note above is about a page which is
 *  SHORT: the three beats were deleted for restating the hero paragraph one size
 *  smaller, and "One run feeds the next" says the one thing the hero cannot, which is
 *  why you would play a second run. Read the two together before adding a fourth
 *  section, because the bar the beats failed is the one that matters: does it say
 *  something no other block on this page already says?
 *
 *  TWO THINGS ABOUT IT ARE RULES RATHER THAN TASTE. Every figure in the hero strip is
 *  DERIVED (`WORLD_CUP_YEARS`, the dataset's own row count, `CHALLENGES`, `BOONS`) and
 *  none is typed, because a front-page figure is exactly the kind that goes stale
 *  quietly - the honours catalogue alone moved from 130 to 126 in three days, and
 *  eleven comments went on saying 130. None of those four imports costs the bundle
 *  anything: App reaches `domain/career.ts` eagerly through `useCareer`, and that pulls
 *  both catalogues in already. And the loop's five boxes are `CARD_FLAT` with no
 *  shadow, deliberately: the hero and the sticker cards both carry `shadow-hard` and
 *  they are the two things this page is selling, so the band that EXPLAINS sits under
 *  them rather than beside them. */
interface Props {
    /** Where "Build your XI now" goes. */
    buildTo: string;
    /** The active squad pool, for the rarest-stickers showcase. */
    allPlayers: Player[];
}

/** The one line of figures the page states about the game's size, under the hero's
 *  button. EVERY ONE IS DERIVED, and that is the whole point of the array: a typed 15 or
 *  130 on the front page reads as current for ever and goes wrong the first time the
 *  dataset or a catalogue moves, which both do regularly.
 *
 *  The player count walks the whole dataset rather than the pool the props carry: a
 *  player who has narrowed their World Cups in settings has not made the game smaller,
 *  and this line is the pitch for the game rather than a readout of their save.
 *
 *  The locale is NAMED rather than left to the browser, or the same figure renders
 *  9,625 here and 9'625 on a Swiss machine, which is the app's one four-digit number and
 *  so the one place that would ever show it. */
const PLAYER_ROWS = SQUADS.reduce((n, s) => n + s.players.length, 0);

const FACTS: { figure: string; label: string }[] = [
    { figure: String(WORLD_CUP_YEARS.length), label: 'World Cups' },
    { figure: PLAYER_ROWS.toLocaleString('en-GB'), label: 'players' },
    { figure: String(CHALLENGES.length), label: 'honours' },
    { figure: String(BOONS.length), label: 'boosts' },
];

/** "One run feeds the next": the loop, as five boxes. A label and one sentence each, no
 *  sub-heading and no icon - the deleted three-beat block had an icon tile and a heading
 *  above its line of grey text, and what killed it was saying the hero's own words
 *  again rather than the furniture it said them in.
 *
 *  COLLECT is its own step rather than a clause inside EARN, which is why EARN's
 *  sentence does not mention stickers: the album is the one thing here with a whole
 *  section of its own directly below, so the box is what hands the reader on to it. */
const STEPS: { name: string; text: string }[] = [
    {
        name: 'Build',
        text: 'Roll national squads and take one man from each, or shop a transfer market on a budget.',
    },
    {
        name: 'Play',
        text: 'Simulate the tournament and watch your team struggle or shine, minute by minute.',
    },
    {
        name: 'Earn',
        text: 'Paid whether you lift the cup or go out in the group. Honours and a trophy on the shelf if you go all the way.',
    },
    { name: 'Collect', text: 'Gather stickers of your favourite stars and legends.' },
    { name: 'Spend', text: 'Feed your team with perks and boosts and go again.' },
];

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

// THE HERO'S CTA IS THE APP'S OWN BUTTON, on the app's one dark surface (2026-09-02, when
// there were two of them). They used to be three looks of their own - an amber fill, a
// white fill and a translucent white outline, all at a 14px label and an 8px radius
// nothing else in the app uses - which made the front page the loudest argument against
// there being a button system at all.
//
// It takes `btn(tone, size, 'dark')` now: the same shape, the same radius, the same face
// and the same size as every other page action, rendered for a green ground. The amber went
// with it, and that is the one visible loss: amber was doing the "this is the thing to press"
// job that the primary tone does everywhere else, and it cannot be the primary here because
// `pitch-dark` on the scrimmed grass measures about 1.1 and would disappear. White on green
// is what replaces it, which is what the second CTA already was.
//
// See the note on `btn` in matchUi for why a surface is not a fourth design.

export default function ModeSelect({ buildTo, allPlayers }: Props) {
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
        <div className={PAGE_TOP}>
            {/* HERO - the pitch as a tactics board, text laid over the grass.

                THE RADIUS AND THE SHADOW ARE THE HOUSE ONES, and both used to be this
                page's own (fixed 2026-09-07, authenticity pass A3). The corner was
                `rounded-[14px]` and the beat tiles below it were `rounded-[10px]`, and
                those were the only two radii in the whole codebase used exactly once:
                everything else is 5px (33 uses) or the 6px card idiom (22). The 10px went
                with the beats on 2026-09-10, as this note said it would.

                The shadow was the one that mattered. It was a bespoke
                `7px_7px_0_var(--color-ink)` against the system's 6px `shadow-hard`, and
                `ink` INVERTS, so in the DARK theme the front page carried a near-white slab
                down its right and bottom edges, brighter than anything else on the screen.
                That is the same fault class as the scrim below, whose own note records
                being fixed on 2026-09-02, three days earlier, and this one stayed live.
                `--shadow-hard` is `6px 6px 0 var(--color-pitch-dark)`, which does not
                invert, so the offset is a deep green in both themes: it matches the sticker
                cards further down the page in daylight, and at night it nearly disappears,
                which is what every card in the app already does. The general rule is the
                one the scrim states below in capitals, reached a second time from a
                different direction: a theme-swapped token laid over a surface that is NOT
                theme-swapped is a bug waiting for somebody to open the other theme. */}
            <section
                className="relative flex items-center gap-10 overflow-hidden rounded-[5px] px-[clamp(22px,5vw,52px)] py-[clamp(30px,5vw,54px)] text-white shadow-hard"
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
                    <h2 className="font-display text-[clamp(34px,6.4vw,60px)] font-bold leading-none tracking-[-0.03em] [text-wrap:balance]">
                        Draft your dream XI.
                        <br />
                        <span className="text-amber">Win the World Cup.</span>
                    </h2>
                    <p className="mt-4 max-w-[52ch] text-[clamp(15px,2.2vw,17px)] text-white/[0.82]">
                        Spin real squads from every World Cup since 1970, pick your eleven one slot at
                        a time, then run the gauntlet - group stage to final, live and minute by minute.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Link to={buildTo} className={btn('primary', 'normal', 'dark')}>
                            Build your XI now
                            <ArrowRight size={17} strokeWidth={2.5} />
                        </Link>
                    </div>

                    {/* The size of the game, in figures, under the button. It is `font-mono`
                        because that token IS the marker for "this is a figure or a data
                        label" (see the seam note in index.css) and this line is nothing
                        else; every value comes off the dataset and the two catalogues, never
                        typed - see FACTS above.

                        The text tones are the hero paragraph's own `white/[0.82]` with the
                        figures at full white, rather than a new value: the scrim under these
                        words is measured (10.24 for white) and inventing a third opacity here
                        would be a contrast question nobody had asked. It costs the hero no
                        HEIGHT on desktop, where the 272px tactics board is much taller than
                        this column and sets the row on its own.

                        THERE IS NO MIDDLE DOT BETWEEN THE ITEMS, AND THAT IS A WRAP FIX
                        rather than a preference. A separator drawn between items is fine
                        while the row is one line and wrong the moment it is two: on a phone
                        this wraps after "players", and the dot that belonged BETWEEN two
                        figures came out at the head of the second line as a stray bullet.
                        Every version of that has the same fault somewhere - a trailing
                        separator strands the dot at the end of a line instead, and CSS
                        cannot tell which item starts a row. Spacing separates them at every
                        width, and the figures being full white against the labels' 0.82 is
                        what groups each pair. */}
                    <ul className="mt-[18px] flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11.5px] font-semibold text-white/[0.82]">
                        {FACTS.map((f) => (
                            <li key={f.label}>
                                <span className="mr-[5px] text-white">{f.figure}</span>
                                {f.label}
                            </li>
                        ))}
                    </ul>
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

            {/* ONE RUN FEEDS THE NEXT - the loop, which is the half of the game the hero
                cannot state. See the note at the top of this file for why a third section
                is here at all and what bar a fourth would have to clear.

                Five across from 1000px, two from 560px, one below that. Five is not a
                number that divides anything else on this page, so the breakpoints are the
                content's own rather than the layout grid's, and they are measured: at the
                1000px breakpoint a box is 179px wide, the longest of the five sentences
                runs to four lines, and the grid levels all five to 148px. Four lines is
                the floor rather than a near miss - Build's sentence does not fit in three
                at any width this page offers - so moving the breakpoint up buys nothing,
                and moving it down starts cutting words. */}
            <section className="mt-10">
                <h2 className="font-display text-[22px] font-bold tracking-[-0.01em]">
                    One run feeds the next
                </h2>
                <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">
                    The cup is not the end of it. Everything a run pays is spent on the run
                    after, which is what makes the second one a different game from the first.
                </p>
                <ol className="mt-4 grid gap-3 min-[560px]:grid-cols-2 min-[1000px]:grid-cols-5">
                    {STEPS.map((s) => (
                        <li key={s.name} className={`${CARD_FLAT} px-4 py-[13px]`}>
                            <h3 className="font-display text-[15px] font-bold tracking-[-0.01em]">
                                {s.name}
                            </h3>
                            <p className="mt-1 text-[12.5px] text-muted">{s.text}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {/* CHASE THE LEGENDS */}
            {FEATURES.stickerAlbum && legends.length > 0 && (
                <section className="mt-10">
                    {/* One block, not a flex row: the `justify-between` here used to hold a
                        control on the right and has held nothing since it went, so a
                        two-child layout was describing a header with one child. */}
                    <div className="mb-4">
                        <h2 className="font-display text-[22px] font-bold tracking-[-0.01em]">
                            Chase the legends
                        </h2>
                        {/* WHAT THE ALBUM IS, AND HOW A CARD GETS INTO IT (2026-09-10,
                            owner's call: the old line said only "the sticker is yours to
                            keep", which promises a reward without ever saying what the
                            collection is or what earns one). Rewritten 2026-09-15, same
                            call, and the rewrite changed what the first sentence is ABOUT
                            rather than how it is worded - see below.

                            THE RATING IS GONE, AND THAT IS WHY `STICKER_TIERS` IS NO LONGER
                            IMPORTED HERE. It used to read "rated 90 or higher", with the 90
                            derived off `STICKER_TIERS.legendary.min` precisely so it could
                            not go stale; the line now says "extraordinary World Cup
                            performances", which is the same fact told as football rather
                            than as a threshold, and needs no figure at all. That is
                            strictly safer than the derived version and worth knowing before
                            somebody "restores" the number: the band is a tuning knob, not a
                            promise, and it has moved.

                            THE ONE TYPED FIGURE LEFT IS "three tiers", which the old copy
                            also typed. `STICKER_TIERS` has exactly three keys and the album
                            screen is built out of them, so it is the album's own structure
                            rather than a number that drifts - and spelling a derived 3 back
                            out as an English word costs more than it protects.

                            THE BRANCH IS NOT OPTIONAL. `stickersOnCupWinOnly` is the flag
                            that decides whether a run banks its XI or only a cup does, and
                            it has been flipped both ways (see the album section of
                            CLAUDE.md). The copy has to move with it, or the front page
                            starts lying the moment it is thrown. The owner supplied the
                            false (shipped) branch; the true branch is the same two facts in
                            the same voice, since only the banking rule differs. */}
                        <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted">
                            Players with extraordinary World Cup performances have a sticker,
                            sorted into three tiers.{' '}
                            {FEATURES.stickersOnCupWinOnly
                                ? 'Win the cup and collect the ones in your final XI into the album, plus one extra of your choosing.'
                                : 'Finish a run and collect the ones in your final XI into the album, win or lose. Win the cup and pick one extra.'}{' '}
                            Trade stickers that you collected multiple times. Collected
                            stickers are offered for less money on the transfer market.
                        </p>
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
        </div>
    );
}
