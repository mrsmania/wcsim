import { useState } from 'react';
import { STYLES, STYLE_LABEL, type FormationName, type Style } from '../domain/formations';
import type { TeamStrength } from '../domain/draft';
import { ChevronDown, Dices } from 'lucide-react';

const STRENGTH_TIERS: { value: TeamStrength; label: string; hint: string }[] = [
    { value: 'weak', label: 'Weak', hint: 'rating < 75' },
    { value: 'medium', label: 'Medium', hint: 'rating 75–80' },
    { value: 'strong', label: 'Strong', hint: 'rating 80–88' },
    { value: 'very-strong', label: 'Very strong', hint: 'rating 88+' },
];

interface Props {
    names: FormationName[];
    selectedName: FormationName;
    selectedStyle: Style;
    /** Styles available for the selected formation. */
    availableStyles: Style[];
    /** False while the CSV is still loading. */
    ready: boolean;
    onSelectName: (name: FormationName) => void;
    onSelectStyle: (style: Style) => void;
    onStart: () => void;
    /** Testing shortcut: auto-fill a random valid XI of the chosen strength. */
    onRandomTeam: (tier: TeamStrength) => void;
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
}: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <div className="flex flex-col gap-5">
            {/* Formation */}
            <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                    SELECT YOUR FORMATION
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {names.map((name) => {
                        const active = name === selectedName;
                        return (
                            <button
                                key={name}
                                onClick={() => onSelectName(name)}
                                className={[
                                    'rounded border px-1 py-2 text-center text-sm font-black transition',
                                    active
                                        ? 'border-stone-900 bg-stone-900 text-white'
                                        : 'border-stone-300 bg-white hover:bg-stone-100',
                                ].join(' ')}
                            >
                                {name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Style */}
            <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-semibold tracking-[0.15em] text-stone-500">
                    SELECT YOUR STYLE
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {STYLES.map((style) => {
                        const active = style === selectedStyle;
                        const enabled = availableStyles.includes(style);
                        return (
                            <button
                                key={style}
                                disabled={!enabled}
                                onClick={() => onSelectStyle(style)}
                                className={[
                                    'rounded border px-1 py-2 text-center text-xs font-bold uppercase tracking-wide transition',
                                    active
                                        ? 'border-stone-900 bg-stone-900 text-white'
                                        : enabled
                                          ? 'border-stone-300 bg-white hover:bg-stone-100'
                                          : 'cursor-not-allowed border-stone-200 bg-stone-50 text-stone-300',
                                ].join(' ')}
                            >
                                {STYLE_LABEL[style]}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onStart}
                    disabled={!ready}
                    className={[
                        'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black uppercase tracking-wide transition',
                        ready
                            ? 'bg-red-600 text-white hover:bg-red-500 active:scale-[0.99]'
                            : 'cursor-not-allowed bg-stone-200 text-stone-400',
                    ].join(' ')}
                >
                    {ready ? 'Roll' : 'Loading…'}
                    {ready && <Dices size={18} strokeWidth={2.5} />}
                </button>
                <div className="relative shrink-0">
                    <button
                        onClick={() => setMenuOpen((o) => !o)}
                        disabled={!ready}
                        title="Testing: auto-fill a random valid XI of a chosen strength and skip the draft"
                        className={[
                            'inline-flex h-full items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-black uppercase tracking-wide transition',
                            ready
                                ? 'border-stone-400 hover:border-stone-900 hover:bg-stone-900 hover:text-white'
                                : 'cursor-not-allowed border-stone-200 text-stone-300',
                        ].join(' ')}
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
                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-lg">
                                {STRENGTH_TIERS.map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => {
                                            setMenuOpen(false);
                                            onRandomTeam(t.value);
                                        }}
                                        className="flex w-full items-baseline justify-between gap-2 border-b border-stone-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-stone-100"
                                    >
                                        <span className="text-sm font-bold">{t.label}</span>
                                        <span className="text-[10px] font-medium text-stone-400">
                                            {t.hint}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
