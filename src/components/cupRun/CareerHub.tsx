import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEATURES } from '../../config';
import {
    PERKS,
    FINISH_LABEL,
    boonUnlockState,
    perkPurchaseState,
    type CareerState,
} from '../../domain/career';
import { BOONS, type Rarity } from '../../domain/boons';
import { btn, CARD_FLAT, CARD_SM, Meter, MONO_CAP } from '../matchUi';

/** Rarity dot colour in the boost library (reuses the palette tokens). */
const RARITY_DOT: Record<Rarity, string> = {
    common: 'bg-muted',
    rare: 'bg-pitch',
    legendary: 'bg-amber',
};

/** Owned-tier numeral shown next to a perk name (tiers are small). */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** The amber Prestige chip. */
function PrestigeChip({ prestige }: { prestige: number }) {
    return (
        <span className="rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-ink">
            {prestige} Prestige
        </span>
    );
}

/** One card's head strip: the title, an optional count, the wallet chip, a sentence
 *  saying what the card is for, and an optional link on the right.
 *
 *  It is deliberately the trophy cabinet's own `BlockHead` shape, so the two career
 *  surfaces read alike. It is not shared yet only because that copy is mid-rework in
 *  another session's tree; folding the two into `matchUi` is the obvious next step. */
function CardHead({
    title,
    count,
    chip,
    hint,
    link,
}: {
    title: string;
    count?: string;
    chip?: ReactNode;
    hint?: string;
    link?: { to: string; label: string };
}) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-hair px-3.5 pb-2.5 pt-3">
            <h3 className="font-display text-[14.5px] font-extrabold tracking-[-0.01em]">
                {title}
            </h3>
            {count && (
                <span className="font-mono text-[11.5px] font-bold tabular-nums text-muted">
                    {count}
                </span>
            )}
            {chip}
            {hint && <span className="text-[12px] leading-snug text-muted">{hint}</span>}
            {link && (
                <Link
                    to={link.to}
                    className="ml-auto font-display text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-accent transition hover:underline"
                >
                    {link.label} &rarr;
                </Link>
            )}
        </div>
    );
}

/** A shop tile's bottom line when there is nothing to press: either you already hold it
 *  ("Maxed", "In pool", "Starter") or something is still in the way ("Need 25", "Reach
 *  level 3"). A chip rather than a disabled button in BOTH cases, and the second one is
 *  why: `btn()` dims a disabled button to half opacity, which put the most informative
 *  label on the card - the reason you cannot buy it - at the faintest contrast on the
 *  page. Nothing here is an action, so nothing here is a button. */
function StateChip({ label, held }: { label: string; held?: boolean }) {
    return (
        <div
            className={`mt-2 w-full rounded-[5px] px-2 py-1.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.06em] ${
                held ? 'bg-pitch/10 text-pitch-ink' : 'border border-line bg-chalk text-muted'
            }`}
        >
            {label}
        </div>
    );
}

/** The career page: three cards rather than one.
 *
 *  It used to be a single card holding the standing, a challenge overview, the perk shop
 *  and the boost library as `border-t` separated bands - a lot of unlike things under one
 *  shadow, and the two SHOPS in particular ran straight into each other, so telling a
 *  perk tier from a boost unlock meant reading the caption above the grid rather than
 *  seeing it. One card per thing instead, each with a head saying what it is, what it
 *  costs and what you already hold.
 *
 *  The challenge overview went with the split: `/records` is the honours ledger, and a
 *  counter plus the last three earned was a second, smaller answer to the same question.
 *
 *  It was also collapsible, and that machinery went too, because it was dead. The hub was
 *  split off the run screen by the navigation rework (a shop and a step of play cannot be
 *  the same address), so it only ever renders on the Career tab, always fully open: the
 *  toggle branch, the animated body and their four props had no caller left. */
export default function CareerHub({
    career,
    prog,
    onPurchase,
    onUnlockBoost,
}: {
    career: CareerState;
    prog: { into: number; needed: number };
    onPurchase: (perkId: string) => void;
    onUnlockBoost: (boonId: string) => void;
}) {
    // Derived once: the head strip counts what is already in the offer pool, and each
    // tile reads its own price and state off the same answer.
    const boosts = BOONS.map((b) => ({ boon: b, ...boonUnlockState(career, b.id) }));
    const inPool = boosts.filter((b) => b.inPool).length;
    return (
        <>
            {/* Standing: the level, the wallet, the XP to the next one, and what the
                career has to show for itself so far. */}
            <section className={`mb-3.5 mt-1 overflow-hidden ${CARD_SM}`}>
                <CardHead
                    title={`Level ${career.level}`}
                    chip={<PrestigeChip prestige={career.prestige} />}
                    hint="to spend on perks and boosts"
                    link={
                        FEATURES.trophyCabinet
                            ? { to: '/records/cabinet', label: 'Trophy cabinet' }
                            : undefined
                    }
                />
                <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="bg-panel p-4">
                        <div className={`mb-1.5 ${MONO_CAP}`}>Progress</div>
                        <Meter pct={(prog.into / prog.needed) * 100} height={8} />
                        <div className="mt-1 font-mono text-[10px] text-muted">
                            {prog.into} / {prog.needed} XP to level {career.level + 1}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-px bg-line sm:w-[300px]">
                        {(
                            [
                                ['Runs', String(career.stats.runs)],
                                ['Cups', String(career.stats.cups)],
                                [
                                    'Best',
                                    career.stats.bestFinish
                                        ? FINISH_LABEL[career.stats.bestFinish]
                                        : '-',
                                ],
                            ] as const
                        ).map(([label, val]) => (
                            <div key={label} className="bg-panel px-2 py-4 text-center">
                                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                                    {label}
                                </div>
                                <div className="mt-0.5 font-display text-[15px] font-extrabold leading-tight">
                                    {val}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Perk shop: six tracks, each tiered and level-gated. */}
            <section className={`mb-3.5 overflow-hidden ${CARD_SM}`}>
                <CardHead
                    title="Perks"
                    chip={<PrestigeChip prestige={career.prestige} />}
                    hint="Every tier you buy applies to all your future runs."
                />
                <div className="grid gap-2.5 p-3.5 sm:grid-cols-2">
                    {PERKS.map((perk) => {
                        // The rule and the label's precedence both come from the
                        // domain now: the component picks only the words.
                        const { owned: lvl, next, canBuy, reason } = perkPurchaseState(
                            career,
                            perk.id,
                        );
                        // What the player currently owns (the active effect), if any.
                        const owned = lvl > 0 ? perk.tiers[lvl - 1] : null;
                        return (
                            <div key={perk.id} className={`${CARD_FLAT} p-3`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-display text-[13.5px] font-extrabold">
                                        {perk.name}
                                        {lvl > 0 && (
                                            <span className="ml-1.5 rounded bg-pitch/10 px-1.5 py-[1px] align-middle font-mono text-[10px] font-bold text-accent">
                                                {ROMAN[lvl] ?? lvl}
                                            </span>
                                        )}
                                    </span>
                                    {next && (
                                        <span className="font-mono text-[11px] font-semibold text-amber-ink">
                                            {next.cost}
                                        </span>
                                    )}
                                </div>
                                {/* What you have right now (or, if unowned, what the first tier unlocks). */}
                                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                                    {owned ? (
                                        <>
                                            <span className="font-semibold text-pitch-ink">
                                                Active:
                                            </span>{' '}
                                            {owned.description}
                                        </>
                                    ) : (
                                        next?.description
                                    )}
                                </p>
                                {/* The upgrade on offer, once you already own a tier. */}
                                {owned && next && (
                                    <p className="mt-1 text-[11px] leading-snug text-muted">
                                        <span className="font-semibold text-ink">Next:</span>{' '}
                                        {next.description}
                                    </p>
                                )}
                                {!next ? (
                                    <StateChip label="Maxed" held />
                                ) : canBuy ? (
                                    <button
                                        onClick={() => onPurchase(perk.id)}
                                        className={`mt-2 w-full ${btn('primary', 'compact')}`}
                                    >
                                        {reason === 'upgrade' ? 'Upgrade' : 'Unlock'}
                                    </button>
                                ) : (
                                    <StateChip
                                        label={
                                            reason === 'level'
                                                ? `Reach level ${next.levelReq}`
                                                : `Need ${next.cost}`
                                        }
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Boost library: unlock more boosts into every future run's offer pool. */}
            <section className={`mb-4 overflow-hidden ${CARD_SM}`}>
                <CardHead
                    title="Boost library"
                    count={`${inPool} / ${boosts.length} in the pool`}
                    chip={<PrestigeChip prestige={career.prestige} />}
                    hint="Unlocked boosts join the three a run offers between rounds."
                />
                <div className="grid gap-2.5 p-3.5 sm:grid-cols-2">
                    {boosts.map(({ boon: b, cost, inPool: held, starter, affordable }) => (
                        <div key={b.id} className={`${CARD_FLAT} p-3`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                    <span
                                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${RARITY_DOT[b.rarity]}`}
                                    />
                                    <span className="font-display text-[13.5px] font-extrabold">
                                        {b.name}
                                    </span>
                                </span>
                                {!held && (
                                    <span className="font-mono text-[11px] font-semibold text-amber-ink">
                                        {cost}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-[11.5px] leading-snug text-muted">
                                {b.description}
                            </p>
                            {held ? (
                                <StateChip label={starter ? 'Starter' : 'In pool'} held />
                            ) : affordable ? (
                                <button
                                    onClick={() => onUnlockBoost(b.id)}
                                    className={`mt-2 w-full ${btn('primary', 'compact')}`}
                                >
                                    Unlock
                                </button>
                            ) : (
                                <StateChip label={`Need ${cost}`} />
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}
