import type { ReactNode } from 'react';
import { BOONS, MIN_POOL_COMMONS, type Boon } from '../../domain/boons';
import {
    PERKS,
    boonUnlockState,
    perkPurchaseState,
    type CareerState,
} from '../../domain/career';
import { btn, CARD, CARD_FLAT, Meter, MONO_CAP, PAGE_EYEBROW } from '../matchUi';
import { RARITY_COLOR, RARITY_INK } from './types';

/** Owned-tier numeral shown next to a perk name (tiers are small). */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** A price, and what the price is IN.
 *
 *  It used to be a bare amber numeral in the corner of every unbought tile - "25" - which
 *  is perfectly legible to somebody who already knows this game has one currency and
 *  where it is spent. To anybody else it is a number with no unit, sitting beside a name
 *  and a description that are full of other numbers. So the word is on it. */
function PricePill({ cost }: { cost: number }) {
    return (
        <span className="shrink-0 rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-amber-ink">
            {cost} Prestige
        </span>
    );
}

/** The wallet, on each shop's own heading: not a repeat of the standing card above but the
 *  price context of the tiles directly under it, which is the same reason a shelf edge
 *  carries prices when the till also has a display. */
function WalletChip({ prestige }: { prestige: number }) {
    return (
        <span className="rounded-full bg-amber/[0.14] px-2.5 py-1 font-mono text-[11.5px] font-semibold text-amber-ink">
            {prestige} Prestige
        </span>
    );
}

/** A shop section's heading rule.
 *
 *  THE CARDS ARE GONE FROM EVERYTHING BUT THE STANDING. The page was three stacked cards,
 *  and two of them were a shadowed panel wrapped round a grid of shadowed panels, so the
 *  eye had to get past two frames to reach a perk. It is the album's and the honours
 *  ledger's shape now - one card for the overview at the top, then plain sections under a
 *  heavy rule - which is also what makes the level and the wallet the loudest things on
 *  the page rather than the third and fourth loudest.
 *
 *  No explaining sentence. Each of the three carried one ("to spend on perks and boosts",
 *  "Every tier you buy applies to all your future runs", "Unlocked boosts join the three a
 *  run offers between rounds") and each was a caption teaching the reader something the
 *  tiles under it demonstrate. */
function SectionHead({
    title,
    count,
    prestige,
}: {
    title: string;
    count?: string;
    prestige: number;
}) {
    return (
        <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b-2 border-ink pb-2.5">
            <h3 className="font-display text-[19px] font-bold tracking-[-0.01em]">{title}</h3>
            {count && (
                <span className="font-mono text-[12px] font-bold tabular-nums text-muted">
                    {count}
                </span>
            )}
            <span className="flex-1" />
            <WalletChip prestige={prestige} />
        </div>
    );
}

/** A tile's bottom line when there is nothing to press: either you already hold it, or
 *  something is in the way ("Need 25 Prestige", "Reach level 3", the pool's own floor). A
 *  chip rather than a disabled button in every case, and the blocked ones are why:
 *  `btn()` dims a disabled button to half opacity, which put the most informative label on
 *  the tile - the reason you cannot press it - at the faintest contrast on the page.
 *  Nothing here is an action, so nothing here is a button. */
function StateChip({ label, held }: { label: string; held?: boolean }) {
    return (
        <div
            className={`mt-2 w-full rounded-[5px] px-2 py-1.5 text-center font-mono text-[11px] font-bold ${
                held ? 'bg-pitch/10 text-pitch-ink' : 'border border-line bg-chalk text-muted'
            }`}
        >
            {label}
        </div>
    );
}

/** A boost's tile, wearing the same rarity as the cards a run actually offers.
 *
 *  It used to be a 2px dot in three of its own colours beside the name. The boost stop
 *  marks rarity with a 3px strip across the top of the card and the word itself in the
 *  `-ink` token of that tier, so a player learning what gold means at a stop was learning
 *  it twice - the shop and the shelf were not the same object. Same strip, same word, same
 *  two colour maps (`RARITY_COLOR` for the strip, which is a surface; `RARITY_INK` for the
 *  word, which at 9px bold needs a token that meets AA in both themes).
 *
 *  DIM IS "NOT IN YOUR POOL", and it is the whole state signal. Thirty-two tiles each
 *  carrying a chip saying whether it is in the pool is the field-of-colour the honours
 *  ledger exists to avoid; full strength for a card a run may be offered and quiet for
 *  everything else reads across the grid at a glance, and the price pill is what tells an
 *  unbought card apart from a benched one. */
function BoostTile({
    boon,
    dim,
    price,
    children,
}: {
    boon: Boon;
    dim: boolean;
    price: number | null;
    children: ReactNode;
}) {
    return (
        <div
            className={`${CARD_FLAT} p-3`}
            style={{ borderTop: `3px solid ${RARITY_COLOR[boon.rarity]}` }}
        >
            {/* The dim is on the CARD'S TEXT, never on what follows it. Fading a live
                control is the same mistake `StateChip` exists to avoid from the other
                direction: the button is the one thing on a quiet tile you might want to
                press, and half-strength white on green is exactly where the contrast pass
                found the app failing. */}
            <div className={dim ? 'opacity-60' : ''}>
                <div className="flex items-baseline justify-between gap-2">
                    <span className={`font-mono text-[9px] font-bold ${RARITY_INK[boon.rarity]}`}>
                        {boon.rarity}
                    </span>
                    {price !== null && <PricePill cost={price} />}
                </div>
                <div className="mt-1 font-display text-[13.5px] font-bold leading-tight">
                    {boon.name}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{boon.description}</p>
            </div>
            {children}
        </div>
    );
}

/** The career page: the standing, the perk shop and the boost library.
 *
 *  WHAT IT NO LONGER SHOWS. The standing card carried runs / cups / best finish and a link
 *  to the trophy cabinet; all four are the cabinet's own subject, one tab away, and they
 *  were sharing a card with the two figures a player comes to this page to act on. It also
 *  carried a challenge overview once, which went the same way for the same reason: the
 *  honours ledger has its own tab.
 *
 *  It was one card holding everything as `border-t` separated bands before that, and the
 *  two SHOPS in particular ran straight into each other. It was also collapsible, and that
 *  machinery was dead: the navigation rework split the hub onto its own route, so the
 *  toggle, the animated body and their four props had no caller left. */
export default function CareerHub({
    career,
    prog,
    onPurchase,
    onUnlockBoost,
    onSetInPool,
}: {
    career: CareerState;
    prog: { into: number; needed: number };
    onPurchase: (perkId: string) => void;
    onUnlockBoost: (boonId: string) => void;
    /** Move a boost the career holds in or out of the offer pool. */
    onSetInPool: (boonId: string, inPool: boolean) => void;
}) {
    // Derived once: the heading counts what a run would be offered, and each tile reads
    // its own price and state off the same answer.
    const boosts = BOONS.map((b) => ({ boon: b, ...boonUnlockState(career, b.id) }));
    const inPool = boosts.filter((b) => b.inPool).length;
    return (
        <>
            {/* The standing: the two figures the rest of the page spends. It is the album's
                counter card - a big numeral over a meter, and the currency in a chalk cell
                beside it - because that is the shape this page was asked to borrow and
                because the level and the wallet are what a player opens it to see. */}
            <section
                className={`grid grid-cols-1 overflow-hidden ${CARD} sm:grid-cols-[minmax(0,1fr)_210px]`}
            >
                <div className="p-[22px]">
                    <div className={PAGE_EYEBROW}>Level</div>
                    <div className="mb-3 mt-1.5 font-display font-bold leading-none tracking-[-0.01em]">
                        <span className="text-[44px]">{career.level}</span>
                    </div>
                    <Meter pct={(prog.into / prog.needed) * 100} height={9} />
                    <div className="mt-3 font-mono text-[12px] text-muted">
                        <b className="text-ink">{prog.needed - prog.into}</b> XP to level{' '}
                        {career.level + 1}
                    </div>
                </div>
                <div className="border-t border-line bg-chalk p-[22px] sm:border-l sm:border-t-0">
                    <div className={MONO_CAP}>Prestige</div>
                    <div className="mt-1 font-mono text-[38px] font-bold leading-none text-amber-ink">
                        {career.prestige}
                    </div>
                    {/* The one sentence on the page, and it is here rather than beside a
                        heading: a currency needs saying what it BUYS once, where the figure
                        is, and the two shops below then need no caption of their own. It is
                        the album card's own shape - the duplicate count carries a line
                        under it saying what duplicates are for. */}
                    <div className="mt-1.5 text-[11.5px] leading-snug text-muted">
                        Spend it on perks and boosts to strengthen your next run.
                    </div>
                </div>
            </section>

            {/* Perk shop: six tracks, each tiered and level-gated. */}
            <section className="mt-8">
                <SectionHead title="Perks" prestige={career.prestige} />
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                                    <span className="font-display text-[13.5px] font-bold">
                                        {perk.name}
                                        {lvl > 0 && (
                                            <span className="ml-1.5 rounded bg-pitch/10 px-1.5 py-[1px] align-middle font-mono text-[10px] font-bold text-accent">
                                                {ROMAN[lvl] ?? lvl}
                                            </span>
                                        )}
                                    </span>
                                    {next && <PricePill cost={next.cost} />}
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
                                                : `Need ${next.cost} Prestige`
                                        }
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Boost library: what the career holds, and which of it a run may be offered.
                Buying is only half of it now - every boost you hold can be taken out of the
                pool and put back, so a career that wants a narrow, reliable offer can have
                one. The single restriction is `MIN_POOL_COMMONS`, which is what keeps a
                run's last stop from having nothing to deal. */}
            <section className="mt-8 mb-4">
                <SectionHead
                    title="Boost library"
                    count={`${inPool} / ${boosts.length} in the pool`}
                    prestige={career.prestige}
                />
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {boosts.map(({ boon: b, cost, owned, inPool: held, affordable, canBench }) => (
                        <BoostTile key={b.id} boon={b} dim={!held} price={owned ? null : cost}>
                            {!owned ? (
                                affordable ? (
                                    <button
                                        onClick={() => onUnlockBoost(b.id)}
                                        className={`mt-2 w-full ${btn('primary', 'compact')}`}
                                    >
                                        Unlock
                                    </button>
                                ) : (
                                    <StateChip label={`Need ${cost} Prestige`} />
                                )
                            ) : !held ? (
                                <button
                                    onClick={() => onSetInPool(b.id, true)}
                                    className={`mt-2 w-full ${btn('primary', 'compact')}`}
                                >
                                    Add to pool
                                </button>
                            ) : canBench ? (
                                <button
                                    onClick={() => onSetInPool(b.id, false)}
                                    className={`mt-2 w-full ${btn('secondary', 'compact')}`}
                                >
                                    Take out of pool
                                </button>
                            ) : (
                                <StateChip label={`${MIN_POOL_COMMONS} commons must stay`} />
                            )}
                        </BoostTile>
                    ))}
                </div>
            </section>
        </>
    );
}