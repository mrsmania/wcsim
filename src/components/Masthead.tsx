import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Trophy, User } from 'lucide-react';
import { FEATURES } from '../config';

/** The identity block: crest and wordmark home, the tagline, and the two things that are
 *  sheets rather than destinations - the account and the settings.
 *
 *  No bottom rule: the tab row below carries it, so the tabs read as part of this block
 *  rather than as a strip under it. */
export default function Masthead({
    accountEmail,
    onOpenAccount,
    onOpenSettings,
}: {
    /** Null for a guest. Signed in, the account button shows who you are. */
    accountEmail: string | null;
    onOpenAccount: () => void;
    onOpenSettings: () => void;
}) {
    return (
        <header className="flex items-center gap-3 pb-3">
            <Link
                to="/"
                aria-label="Mondialino - home"
                className="flex items-center gap-3 transition hover:opacity-90"
            >
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[6px] bg-pitch-dark">
                    <Trophy size={21} strokeWidth={2} className="text-amber" />
                </span>
                {/* One word, still two-tone: the green falls on the diminutive, which is
                    what the name turns on ("mondiale" is the World Cup in Italian, "-ino"
                    makes it the little one). Keeps the wordmark's signature without a
                    second word. */}
                <h1 className="font-display text-[23px] font-black uppercase leading-none tracking-[-0.02em]">
                    Mondial<span className="text-pitch">ino</span>
                </h1>
            </Link>
            <span className="border-l border-line pl-3.5 text-[12.5px] text-muted max-sm:hidden">
                Draft a random XI. Win the cup.
            </span>
            <div className="ml-auto flex items-center gap-2.5">
                {/* Accounts (gated): its own button and its own dialog, rather than a
                    section inside the settings sheet. */}
                {FEATURES.accounts && (
                    <button
                        type="button"
                        onClick={onOpenAccount}
                        title={accountEmail ?? 'Sign in to keep your album on every device'}
                        className="flex h-[33px] shrink-0 items-center gap-1.5 rounded-[5px] border border-line bg-panel px-2.5 text-[12px] font-semibold text-muted transition hover:border-pitch hover:text-pitch"
                    >
                        <User size={15} strokeWidth={2.2} />
                        <span className="max-sm:hidden">
                            {accountEmail ? accountEmail.split('@')[0] : 'Sign in'}
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label="Settings"
                    title="Settings"
                    className="grid h-[33px] w-[33px] shrink-0 place-items-center rounded-[5px] border border-line bg-panel text-muted transition hover:border-pitch hover:text-pitch"
                >
                    <SettingsIcon size={17} strokeWidth={2} />
                </button>
            </div>
        </header>
    );
}
