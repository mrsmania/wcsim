import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Trophy, User } from 'lucide-react';
import { FEATURES } from '../config';
import { TabRow, type TabItem } from './navUi';

/** The identity block AND the six destinations, on ONE row (2026-09-02).
 *
 *  It used to be two rows: crest, wordmark, tagline and the two buttons up top, the tabs
 *  underneath, and **89 pixels of chrome** before the page said anything about football -
 *  on every screen, with the page's own title repeating the active tab immediately below.
 *  It is 45 now.
 *
 *  THE TAGLINE IS WHAT PAID FOR IT, and that is a measurement rather than a preference:
 *  the tab row needs 581px, the crest row had 575px spare, so the tabs missed fitting
 *  beside the crest by SIX pixels - and "Draft a random XI. Win the cup." was 196 of them.
 *  Note it never cost any HEIGHT: it sat beside the crest, which sets the row's height on
 *  its own, so removing it gains width and nothing else. The front page's hero makes the
 *  same promise at the size it deserves, and the line was already hidden below 640px, so
 *  no phone lost anything.
 *
 *  THE HEADER'S HAIRLINE IS THE TABS' RULE TOO, which is why `TabRow` draws no border of
 *  its own any more: the active tab's underline sits ON this row's bottom edge. Keep the
 *  border here rather than on the nav, or the two layouts below need two rules.
 *
 *  BELOW 1040px THE TABS WRAP to a second line, by `flex-wrap` and `w-full` on the nav
 *  rather than by a second copy of it - there is one `<nav>` in the source and one in the
 *  DOM, which matters because a duplicate would be a second thing announcing itself as the
 *  main navigation. The buttons keep the first line with the crest either way. Below 700px
 *  the nav hides itself and the fixed bottom bar takes over, as it always did.
 *
 *  The account and settings buttons stay here, and stay sheets rather than destinations:
 *  you adjust them without leaving. The account label is capped and truncates, because it
 *  prints whatever is in front of the `@` and an unbounded button on a row this tight is
 *  what would break the single line. */
export default function Masthead({
    tabs,
    locked,
    accountEmail,
    onOpenAccount,
    onOpenSettings,
}: {
    /** The destinations. Empty only if every flag behind them is off. */
    tabs: TabItem[];
    /** Inert while a match reveals (see `nav/liveMatch.ts`). */
    locked?: boolean;
    /** Null for a guest. Signed in, the account button shows who you are. */
    accountEmail: string | null;
    onOpenAccount: () => void;
    onOpenSettings: () => void;
}) {
    return (
        <header className="flex flex-wrap items-stretch gap-x-5 border-b border-line">
            <Link
                to="/"
                aria-label="Mondialino - home"
                className="flex items-center gap-2.5 py-[7px] transition hover:opacity-90"
            >
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[5px] bg-pitch-dark">
                    <Trophy size={17} strokeWidth={2} className="text-amber" />
                </span>
                {/* One word, still two-tone: the green falls on the diminutive, which is
                    what the name turns on ("mondiale" is the World Cup in Italian, "-ino"
                    makes it the little one). Keeps the wordmark's signature without a
                    second word. */}
                <h1 className="font-display text-[21px] font-black uppercase leading-none tracking-[-0.02em]">
                    Mondial<span className="text-pitch-ink">ino</span>
                </h1>
            </Link>

            {tabs.length > 0 && <TabRow items={tabs} locked={locked} />}

            <div className="ml-auto flex items-center gap-2 py-[7px]">
                {/* Accounts (gated): its own button and its own dialog, rather than a
                    section inside the settings sheet. */}
                {FEATURES.accounts && (
                    <button
                        type="button"
                        onClick={onOpenAccount}
                        title={accountEmail ?? 'Sign in to keep your album on every device'}
                        className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[5px] border border-line bg-panel px-2.5 text-[12px] font-semibold text-muted transition hover:border-pitch hover:text-pitch-ink"
                    >
                        <User size={15} strokeWidth={2.2} />
                        <span className="min-w-0 max-w-[110px] truncate max-sm:hidden">
                            {accountEmail ? accountEmail.split('@')[0] : 'Sign in'}
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label="Settings"
                    title="Settings"
                    className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[5px] border border-line bg-panel text-muted transition hover:border-pitch hover:text-pitch-ink"
                >
                    <SettingsIcon size={16} strokeWidth={2} />
                </button>
            </div>
        </header>
    );
}
