import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LayoutGrid, List, Play, Swords, TrendingUp, Trophy } from 'lucide-react';

/**
 * The tabs navigation (roadmap item 27, concept 2) - shared atoms.
 *
 * One mechanism for the destinations, and only destinations: settings and account stay
 * masthead buttons, because they are sheets you adjust without leaving rather than places
 * you go.
 *
 * IT WAS FIVE UNTIL 2026-08-31 AND IS NOW SIX, and the sixth is the only one that has ever
 * been added: Versus. The rule that kept it at five is still the rule - a tab is an address
 * you need from anywhere - and what changed is that versus became somewhere you need from
 * anywhere. While it was one live room at a time it was an evening you went to and left, so
 * a front-page door was the right size for it; duels are played over days and are the only
 * thing in this game that somebody else can be waiting on, so "is anything waiting for me"
 * has to be answerable from the album. Versus is last, being the one destination that is
 * not about your own career. Do not add a seventh without a reason of that shape.
 *
 * Two renderings of the same labels in the same order, so muscle memory carries between
 * devices: a row INSIDE the masthead from 700px up, and a fixed bottom bar at thumb height
 * below it.
 *
 * THE 2px NEAR-BLACK RULE THEY BOTH STOOD ON IS GONE (2026-09-02). It was the heaviest
 * line on every screen in the app, spent on the strip with the least to say, and in the
 * dark theme it came out as a near-WHITE bar brighter than the game under it. Both are a
 * `line` hairline now, the same one every card is drawn with. A rule is still needed at
 * both ends - the row is the foot of the identity block and the phone bar is a panel the
 * page scrolls under - but at one pixel it is structure rather than a statement.
 *
 * AND THE DESKTOP TAB IS AN UNDERLINE, NOT A FILLED FOLDER TAB (2026-09-02, chosen from
 * six header treatments). The row moved up onto the masthead's own line, where a green
 * block per destination would be the loudest thing in a header that is now one line tall;
 * six words with the current one in full-strength ink and a 2px green rule under it says
 * the same thing at chrome weight. Three consequences worth keeping:
 *   - `Masthead` owns the hairline, so the nav draws no border: the underline is placed at
 *     `-bottom-px` and covers that rule, which is what makes it read as one edge rather
 *     than as a bar sitting on top of a line.
 *   - The green is `pitch-ink`, never `pitch-dark`. It is the token that FLIPS (deep green
 *     on paper, bright green on graphite) and this underline is the whole "you are here"
 *     signal, so the surface green would have been a 2px line nobody could see in the dark
 *     theme.
 *   - The shared minimum width went with the fill. Even columns are a chip idiom - a block
 *     wants a consistent shape - and an underline belongs to its label, so each tab is as
 *     wide as its word plus equal padding. It also gives about 80px back, which is what
 *     keeps the single line alive on a small laptop.
 * The PHONE bar is untouched by all of this: it has never had a chip, it marks where you
 * are by colouring the icon and the label, and that still reads at thumb size.
 *
 * A tab is its label and nothing else. The row used to carry a mono sub-line per tab
 * (level and Prestige, album completion, challenges earned, cups in the pool), which put
 * four live counters into the chrome: the panel below each destination shows the same
 * figures, and the navigation is for getting there.
 *
 * `locked` goes inert while a match reveals (see `nav/liveMatch.ts`).
 *
 * Layering note: the phone bar sits at `z-20`, below every overlay - the group draw is
 * its own centred `z-40`, the shared `Overlay` is `z-[80]` and confetti `z-[90]`, all
 * over a full-screen backdrop.
 */

export type TabKey = 'play' | 'career' | 'album' | 'records' | 'squads' | 'versus';

export interface TabItem {
    key: TabKey;
    label: string;
    to: string;
    active: boolean;
}

const ICONS: Record<TabKey, ReactNode> = {
    play: <Play size={17} strokeWidth={2.2} />,
    // Progression, which is what the career IS: a level, a wallet and the perks they buy.
    // `Swords` sat here first and has moved to Versus, where fighting somebody is the
    // whole destination rather than a metaphor for levelling up; `Trophy` is Records'.
    career: <TrendingUp size={17} strokeWidth={2.2} />,
    album: <LayoutGrid size={17} strokeWidth={2.2} />,
    records: <Trophy size={17} strokeWidth={2.2} />,
    squads: <List size={17} strokeWidth={2.2} />,
    // The crossed swords: playing somebody. It was `Users` (two people, which is true of
    // a room and equally true of a lobby, a squad list and an album) while the career
    // held this glyph, and one tab having it meant the other could not.
    versus: <Swords size={17} strokeWidth={2.2} />,
};

/** The desktop row, rendered INSIDE the masthead's one line. Hidden below 700px, where
 *  the bottom bar takes over; wrapped onto its own full-width line below 1040px, where
 *  the crest, the six labels and the two buttons stop fitting side by side. */
export function TabRow({ items, locked }: { items: TabItem[]; locked?: boolean }) {
    return (
        <nav
            aria-label="Main"
            // No border: the masthead's hairline is this row's rule, and the active tab's
            // underline sits on it. items-stretch so each tab fills the header's height,
            // which is what puts every underline on that one edge.
            //
            // `w-full` below 1040px is the whole of the two-row fallback: `flex-wrap` on
            // the header then pushes the nav onto its own line and the buttons keep the
            // first. One nav in the DOM either way - a second copy behind a media query
            // would announce itself as the main navigation twice.
            //
            // `max-[1040px]`, and the number is not a typo: Tailwind's max variant is
            // STRICTLY less than what it is given, so `max-[1039px]` would leave a window
            // of exactly 1039px on the single-line layout it does not fit. Measured: the
            // row needs 978px, plus the 64px the account button can still grow by before
            // its label truncates.
            className="hidden items-stretch gap-1 max-[1040px]:order-last max-[1040px]:w-full min-[700px]:flex"
        >
            {items.map((t) => {
                const inert = !!locked && !t.active;
                return (
                    <Link
                        key={t.key}
                        to={t.to}
                        aria-current={t.active ? 'page' : undefined}
                        aria-disabled={inert || undefined}
                        tabIndex={inert ? -1 : undefined}
                        className={[
                            // The underline is a pseudo-element rather than a border, so
                            // switching it on and off cannot move the label by a pixel.
                            'relative flex items-center px-[13px] py-[9px] transition',
                            "after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:content-['']",
                            t.active
                                ? 'text-ink after:bg-pitch-ink'
                                : 'text-muted hover:text-ink hover:after:bg-line',
                            inert ? 'pointer-events-none opacity-40' : '',
                        ].join(' ')}
                    >
                        <span className="block font-display text-[13.5px] font-extrabold uppercase tracking-[0.03em]">
                            {t.label}
                        </span>
                    </Link>
                );
            })}
            {/* The note only exists while a match reveals, and it is the second signal
                rather than the first: the tabs themselves go dim and unclickable. So it
                hides below 1120px instead of being allowed to push the nav onto a second
                line mid-playback - a header that grows 38px taller while a goal is being
                revealed is worse than a header that explains itself only when there is
                room. The phone bar has never carried it at all, for the same reason. */}
            {locked && (
                <span className="ml-auto self-center whitespace-nowrap pl-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-ink max-[1120px]:hidden">
                    Match in play
                </span>
            )}
        </nav>
    );
}

/** The phone bottom bar. Shown below 700px only; `App` reserves the space for it. */
export function TabBottomBar({ items, locked }: { items: TabItem[]; locked?: boolean }) {
    return (
        <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] min-[700px]:hidden"
            // THE COLUMN COUNT FOLLOWS THE ITEMS, and it has to be an inline style rather
            // than a class: Tailwind emits utilities from the class strings it can SEE in
            // the source, so a computed `grid-cols-${n}` is a class that does not exist.
            // It was a literal `grid-cols-5` until Versus made it six, and the bar wrapped
            // the sixth tab onto a second row - under the fold, on the one layout where
            // the bar is the whole navigation. The `minmax(0, 1fr)` rather than `1fr` is
            // what stops a long label widening its own column.
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
            {items.map((t) => {
                const inert = !!locked && !t.active;
                return (
                    <Link
                        key={t.key}
                        to={t.to}
                        aria-current={t.active ? 'page' : undefined}
                        aria-disabled={inert || undefined}
                        tabIndex={inert ? -1 : undefined}
                        className={[
                            'flex min-w-0 flex-col items-center gap-[3px] px-0.5 pb-[9px] pt-[7px] transition',
                            t.active ? 'text-pitch-ink' : 'text-muted',
                            inert ? 'pointer-events-none opacity-35' : '',
                        ].join(' ')}
                    >
                        {ICONS[t.key]}
                        <span
                            className={`max-w-full truncate font-mono text-[8.5px] uppercase tracking-[0.02em] ${
                                t.active ? 'font-bold' : ''
                            }`}
                        >
                            {t.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * A second-level segmented link row, for the one place this concept needs a second
 * level: Records holds Challenges and Cabinet, because both are read-only honours over
 * the same career and neither earns a tab of its own.
 */
export function SubTabs({
    items,
    className = '',
}: {
    items: { label: string; to: string; active: boolean }[];
    className?: string;
}) {
    return (
        <div
            className={`flex overflow-hidden rounded-[5px] border border-line bg-panel ${className}`}
        >
            {items.map((it) => (
                <Link
                    key={it.to}
                    to={it.to}
                    aria-current={it.active ? 'page' : undefined}
                    className={[
                        'flex-1 border-l border-line px-[14px] py-[9px] text-center font-display text-[12px] font-bold uppercase tracking-[0.04em] transition first:border-l-0',
                        it.active
                            ? 'bg-pitch-dark text-white'
                            : 'text-muted hover:bg-ink/5 hover:text-ink',
                    ].join(' ')}
                >
                    {it.label}
                </Link>
            ))}
        </div>
    );
}

/**
 * The strip under the tab bar: "a versus match wants you, and here it is".
 *
 * ONE CLASS STRING because there are two of them and only ever one on screen - the live
 * room you are holding, or the duel that is waiting - and they are the same object as far
 * as a reader is concerned. Two copies drifting by a pixel of padding is exactly the shape
 * of the button sprawl the `btn` tokens were written to end.
 *
 * IT NEEDS ITS OWN TOP MARGIN. The tab row above ends in a rule, and a bordered green
 * panel butted straight against that rule reads as part of the navigation rather than as a
 * line the navigation is carrying. It sits clear of it now, by the same gap it already left
 * below itself.
 */
export const ROOM_STRIP =
    'my-4 flex items-center justify-between gap-3 rounded-md border border-pitch bg-pitch/10 px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-pitch-ink transition hover:bg-pitch/20';
