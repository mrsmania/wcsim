import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LayoutGrid, List, Play, Swords, Trophy, Users } from 'lucide-react';

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
 * devices: a row under the masthead from 700px up, and a fixed bottom bar at thumb height
 * below it. The row carries the masthead's 2px ink rule, so the tabs read as part of the
 * identity block rather than as a strip below it.
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
    career: <Swords size={17} strokeWidth={2.2} />,
    album: <LayoutGrid size={17} strokeWidth={2.2} />,
    records: <Trophy size={17} strokeWidth={2.2} />,
    squads: <List size={17} strokeWidth={2.2} />,
    // Two people, which is what the destination is: `Swords` would read better and is
    // the career's already, and two tabs sharing a glyph is worse than a plainer one.
    versus: <Users size={17} strokeWidth={2.2} />,
};

/** The desktop row. Hidden below 700px, where the bottom bar takes over. */
export function TabRow({ items, locked }: { items: TabItem[]; locked?: boolean }) {
    return (
        <nav
            aria-label="Main"
            // items-stretch so every tab is the same height as the filled one.
            className="hidden items-stretch gap-[2px] border-b-2 border-ink min-[700px]:flex"
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
                            'block min-w-[92px] rounded-t-[5px] border border-b-0 px-[15px] pb-2 pt-[9px] transition',
                            t.active
                                ? 'border-pitch-dark bg-pitch-dark text-white'
                                : 'border-transparent text-muted hover:bg-ink/5 hover:text-ink',
                            inert ? 'pointer-events-none opacity-40' : '',
                        ].join(' ')}
                    >
                        <span className="block font-display text-[13.5px] font-extrabold uppercase tracking-[0.03em]">
                            {t.label}
                        </span>
                    </Link>
                );
            })}
            {locked && (
                <span className="ml-auto pb-2 pr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-ink">
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
            className="fixed inset-x-0 bottom-0 z-20 grid border-t-2 border-ink bg-panel pb-[env(safe-area-inset-bottom)] min-[700px]:hidden"
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
 * IT NEEDS ITS OWN TOP MARGIN. The tab row above ends in the masthead's 2px ink rule, and
 * a bordered green panel butted straight against that rule reads as part of the navigation
 * rather than as a line the navigation is carrying. It sits clear of it now, by the same
 * gap it already left below itself.
 */
export const ROOM_STRIP =
    'my-4 flex items-center justify-between gap-3 rounded-md border border-pitch bg-pitch/10 px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-pitch-ink transition hover:bg-pitch/20';
