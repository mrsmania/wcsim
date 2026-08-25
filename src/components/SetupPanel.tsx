import { useState } from 'react';
import { STYLES, STYLE_LABEL, type FormationName, type Style } from '../domain/formations';
import { ASCENSIONS, ascensionAt } from '../domain/ascension';
import type { TeamStrength } from '../domain/draft';
import { ChevronDown, Coins, Dices } from 'lucide-react';
import { CARD, PRIMARY_BTN_BASE, SECONDARY_BTN } from './matchUi';

const STRENGTH_TIERS: { value: TeamStrength; label: string; hint: string }[] = [
    { value: 'weak', label: 'Weak', hint: 'rating < 75' },
    { value: 'medium', label: 'Medium', hint: 'rating 75-80' },
    { value: 'strong', label: 'Strong', hint: 'rating 80-88' },
    { value: 'very-strong', label: 'Very strong', hint: 'rating 88+' },
];

const SEGLBL = 'mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted';

/** The two build-your-XI primary buttons share this sizing/disabled layout on top of
 *  the shared primary-button identity; they differ only in width (flex-1 vs w-full). */
const BUILD_BTN = `items-center justify-center gap-2 px-4 py-[11px] text-[13px] ${PRIMARY_BTN_BASE} disabled:cursor-not-allowed disabled:opacity-50`;

interface Props {
    names: FormationName[];
    selectedName: FormationName;
    selectedStyle: Style;
    /** Styles available for the selected formation. */
    availableStyles: Style[];
    /** False until the selected formation/style resolves (App passes !!previewFormation). */
    ready: boolean;
    onSelectName: (name: FormationName) => void;
    onSelectStyle: (style: Style) => void;
    onStart: () => void;
    /** Testing shortcut: auto-fill a random valid XI of the chosen strength. Omitted
     *  when FEATURES.randomTeam is off, which hides the whole control. */
    onRandomTeam?: (tier: TeamStrength) => void;
    /** Build the XI in the budget market instead of rolling (budgetDraft feature). */
    onBudgetDraft?: () => void;
    /** The run's Ascension tier, chosen here rather than on the Cup Run screen (roadmap
     *  item 28): it belongs with formation and style, because it is a choice about the run
     *  you are building, and "start run" now goes straight into the draw. `max` is the
     *  highest tier currently selectable (unlocked AND level-gated); anything above it
     *  renders as locked with the requirement. Required: the one mount always passes it,
     *  and the caller that omitted it was the pre-run screen deleted with roadmap 28. */
    ascension: { tier: number; max: number; onSelect: (tier: number) => void };
}

export default function SetupPanel({
    names,
    selectedName,
    selectedStyle,
    availableStyles,
    ready,
    onSelectName,
    onSelectStyle,
    onStart,
    onRandomTeam,
    onBudgetDraft,
    ascension,
}: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <div className={CARD}>
            {/* Formation */}
            <div className="p-[18px]">
                <p className={SEGLBL}>Formation</p>
                <div className="grid grid-cols-4 gap-[5px]">
                    {names.map((name) => {
                        const active = name === selectedName;
                        return (
                            <button
                                key={name}
                                onClick={() => onSelectName(name)}
                                className={[
                                    'whitespace-nowrap rounded-[4px] border px-px py-2.5 text-center font-mono text-[11.5px] font-semibold tracking-[-0.01em] transition',
                                    active
                                        ? 'border-ink bg-ink text-ground'
                                        : 'border-line bg-panel text-ink hover:border-pitch hover:text-pitch',
                                ].join(' ')}
                            >
                                {name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Style */}
            <div className="border-t border-line p-[18px]">
                <p className={SEGLBL}>Style</p>
                <div className="flex overflow-hidden rounded-[5px] border border-line">
                    {STYLES.map((style) => {
                        const active = style === selectedStyle;
                        const enabled = availableStyles.includes(style);
                        return (
                            <button
                                key={style}
                                disabled={!enabled}
                                onClick={() => onSelectStyle(style)}
                                className={[
                                    'flex-1 border-r border-line px-1 py-2.5 text-[12.5px] font-semibold transition last:border-r-0',
                                    active
                                        ? 'bg-pitch-dark text-white'
                                        : enabled
                                          ? 'bg-panel text-muted hover:text-pitch'
                                          : 'cursor-not-allowed bg-pitch/5 text-muted/40',
                                ].join(' ')}
                            >
                                {STYLE_LABEL[style]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Ascension: the run's difficulty ladder. Chosen with the shape, since both
                are decisions about the run being built and there is no pre-run screen to
                make them on any more. */}
            <div className="border-t border-line p-[18px]">
                <p className={SEGLBL}>Ascension</p>
                <div className="grid grid-cols-6 gap-[5px]">
                    {ASCENSIONS.map((a) => {
                        const active = a.tier === ascension.tier;
                        const locked = a.tier > ascension.max;
                        return (
                            <button
                                key={a.tier}
                                disabled={locked}
                                onClick={() => ascension.onSelect(a.tier)}
                                aria-pressed={active}
                                title={
                                    locked
                                        ? `Win a cup at the tier below and reach level ${a.levelReq}`
                                        : a.label
                                }
                                className={[
                                    'rounded-[4px] border py-2.5 text-center font-mono text-[11.5px] font-semibold transition',
                                    active
                                        ? 'border-ink bg-ink text-ground'
                                        : locked
                                          ? 'border-line bg-panel text-line'
                                          : 'border-line bg-panel text-ink hover:border-pitch hover:text-pitch',
                                ].join(' ')}
                            >
                                {a.label.replace('Ascension ', '')}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2.5 text-[12px] leading-snug text-muted">
                    {ascension.tier === 0
                        ? 'Standard difficulty. Rewards at face value.'
                        : `${ascensionAt(ascension.tier).userDelta} to your own attack and defence, a stronger knockout field, and rewards x${ascensionAt(ascension.tier).rewardMult}.`}
                </p>
            </div>

            {/* Build your XI */}
            <div className="border-t border-line p-[18px]">
                <p className={SEGLBL}>Build your XI</p>
                <div className="flex gap-[9px]">
                    <button
                        onClick={onStart}
                        disabled={!ready}
                        className={`flex flex-1 ${BUILD_BTN}`}
                    >
                        {ready ? 'Roll a squad' : 'Loading…'}
                        {ready && <Dices size={16} strokeWidth={2.5} />}
                    </button>
                    {onRandomTeam && (
                        <div className="relative flex-1">
                            <button
                                onClick={() => setMenuOpen((o) => !o)}
                                disabled={!ready}
                                title="Testing: auto-fill a random valid XI of a chosen strength and skip the draft"
                                className={`flex w-full items-center justify-center gap-2 px-4 py-[11px] text-[13px] ${SECONDARY_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                Random team
                                <ChevronDown size={15} strokeWidth={2.5} />
                            </button>
                            {menuOpen && ready && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setMenuOpen(false)}
                                    />
                                    <div className={`absolute right-0 z-20 mt-1.5 w-44 overflow-hidden ${CARD}`}>
                                        {STRENGTH_TIERS.map((t) => (
                                            <button
                                                key={t.value}
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    onRandomTeam(t.value);
                                                }}
                                                className="flex w-full items-baseline justify-between gap-2 border-b border-line px-3 py-2 text-left transition last:border-b-0 hover:bg-pitch/5"
                                            >
                                                <span className="text-sm font-bold">{t.label}</span>
                                                <span className="font-mono text-[10px] text-muted">
                                                    {t.hint}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
                {onBudgetDraft && (
                    <button
                        onClick={onBudgetDraft}
                        disabled={!ready}
                        className={`mt-[9px] flex w-full ${BUILD_BTN}`}
                    >
                        Buy with a budget
                        <Coins size={16} strokeWidth={2.5} />
                    </button>
                )}
                <p className="mt-2.5 font-mono text-[12px] tracking-[0.02em] text-muted">
                    Roll a national-team squad, then pick one player into an open slot. Repeat 11
                    times.
                </p>
            </div>
        </div>
    );
}
