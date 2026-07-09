import { ChevronDown, ChevronUp } from 'lucide-react';
import {
    PERKS,
    FINISH_LABEL,
    perkLevelOf,
    nextPerkTier,
    type CareerState,
} from '../../domain/career';
import { BOONS, BOON_UNLOCK_COST, type Rarity } from '../../domain/boons';

/** Rarity dot colour in the boost library (reuses the palette tokens). */
const RARITY_DOT: Record<Rarity, string> = {
    common: 'bg-muted',
    rare: 'bg-pitch',
    legendary: 'bg-amber',
};

/** Owned-tier numeral shown next to a perk name (tiers are small). */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** The career hub - full between runs, a slim collapsible strip during a run. The
 *  toggle only shows while a run is active (`showToggle`); `showBody` gates the
 *  progress + perk-shop body. */
export default function CareerHub({
    career,
    prog,
    hubOpen,
    onToggleHub,
    showBody,
    showToggle,
    onPurchase,
    onUnlockBoost,
}: {
    career: CareerState;
    prog: { into: number; needed: number };
    hubOpen: boolean;
    onToggleHub: () => void;
    showBody: boolean;
    showToggle: boolean;
    onPurchase: (perkId: string) => void;
    onUnlockBoost: (boonId: string) => void;
}) {
    return (
        <section className="mb-4 mt-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            <div
                className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${showBody ? 'border-b border-line' : ''}`}
            >
                <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[17px] font-extrabold tracking-[-0.01em]">
                        Cup Run Hub
                    </span>
                    <span className="rounded-full bg-chalk px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                        Level {career.level}
                    </span>
                    <span className="rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#9a6512]">
                        {career.prestige} Prestige
                    </span>
                </div>
                {showToggle && (
                    <button
                        onClick={onToggleHub}
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-pitch"
                    >
                        {hubOpen ? 'Hide hub' : 'Career hub'}
                        {hubOpen ? (
                            <ChevronUp size={13} strokeWidth={2.5} />
                        ) : (
                            <ChevronDown size={13} strokeWidth={2.5} />
                        )}
                    </button>
                )}
            </div>

            {/* Animate open/close by transitioning the body's grid row from 0fr to 1fr
                (smoothly animates to its natural height, no fixed max-height needed). The
                body stays mounted and is clipped when closed. */}
            <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${showBody ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="bg-panel p-4">
                            <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                                Progress
                            </div>
                            <div className="h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
                                <div
                                    className="h-full bg-pitch"
                                    style={{ width: `${(prog.into / prog.needed) * 100}%` }}
                                />
                            </div>
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

                    {/* Perk shop */}
                    <div className="border-t border-line p-4">
                        <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                            Perks (spend Prestige - applies to future runs)
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {PERKS.map((perk) => {
                                const lvl = perkLevelOf(career, perk.id);
                                const next = nextPerkTier(career, perk.id); // null => maxed
                                const affordable = !!next && career.prestige >= next.cost;
                                const levelOk = !!next && career.level >= next.levelReq;
                                const canBuy = !!next && affordable && levelOk;
                                // What the player currently owns (the active effect), if any.
                                const owned = lvl > 0 ? perk.tiers[lvl - 1] : null;
                                return (
                                    <div
                                        key={perk.id}
                                        className="rounded-md border border-line bg-panel p-3"
                                    >
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
                                                <span className="font-mono text-[11px] font-semibold text-amber">
                                                    {next.cost}
                                                </span>
                                            )}
                                        </div>
                                        {/* What you have right now (or, if unowned, what the first tier unlocks). */}
                                        <p className="mt-1 text-[11.5px] leading-snug text-muted">
                                            {owned ? (
                                                <>
                                                    <span className="font-semibold text-pitch">
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
                                                <span className="font-semibold text-ink">
                                                    Next:
                                                </span>{' '}
                                                {next.description}
                                            </p>
                                        )}
                                        <button
                                            disabled={!canBuy}
                                            onClick={() => onPurchase(perk.id)}
                                            className={[
                                                'mt-2 w-full rounded-[5px] px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                                                !next
                                                    ? 'cursor-default bg-pitch/10 text-pitch'
                                                    : canBuy
                                                      ? 'bg-pitch text-white hover:bg-pitch-dark'
                                                      : 'cursor-not-allowed border border-line bg-panel text-muted/50',
                                            ].join(' ')}
                                        >
                                            {!next
                                                ? 'Maxed'
                                                : !levelOk
                                                  ? `Reach level ${next.levelReq}`
                                                  : !affordable
                                                    ? `Need ${next.cost}`
                                                    : lvl > 0
                                                      ? 'Upgrade'
                                                      : 'Unlock'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Boost library: unlock more boosts into every future run's offer pool. */}
                    <div className="border-t border-line p-4">
                        <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                            Boost library (spend Prestige - adds to future runs' offers)
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {BOONS.map((b) => {
                                const inPool = b.starter || career.unlockedBoons.includes(b.id);
                                const cost = BOON_UNLOCK_COST[b.rarity];
                                const affordable = career.prestige >= cost;
                                return (
                                    <div
                                        key={b.id}
                                        className="rounded-md border border-line bg-panel p-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${RARITY_DOT[b.rarity]}`}
                                                />
                                                <span className="font-display text-[13.5px] font-extrabold">
                                                    {b.name}
                                                </span>
                                            </span>
                                            {!inPool && (
                                                <span className="font-mono text-[11px] font-semibold text-amber">
                                                    {cost}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-[11.5px] leading-snug text-muted">
                                            {b.description}
                                        </p>
                                        {inPool ? (
                                            <div className="mt-2 w-full rounded-[5px] bg-pitch/10 px-2 py-1.5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-pitch">
                                                {b.starter ? 'Starter' : 'In pool'}
                                            </div>
                                        ) : (
                                            <button
                                                disabled={!affordable}
                                                onClick={() => onUnlockBoost(b.id)}
                                                className={[
                                                    'mt-2 w-full rounded-[5px] px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                                                    affordable
                                                        ? 'bg-pitch text-white hover:bg-pitch-dark'
                                                        : 'cursor-not-allowed border border-line bg-panel text-muted/50',
                                                ].join(' ')}
                                            >
                                                {affordable ? 'Unlock' : `Need ${cost}`}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
