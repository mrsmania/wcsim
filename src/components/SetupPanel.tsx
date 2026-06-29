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
        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-4 shadow-soft">
            {/* Formation */}
            <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                    Select your formation
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {names.map((name) => {
                        const active = name === selectedName;
                        return (
                            <button
                                key={name}
                                onClick={() => onSelectName(name)}
                                className={[
                                    'rounded-xl border px-1 py-2 text-center text-sm font-extrabold transition',
                                    active
                                        ? 'border-pitch bg-pitch text-white shadow-soft'
                                        : 'border-line bg-white hover:border-pitch hover:text-pitch',
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
                <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
                    Select your style
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
                                    'rounded-xl border px-1 py-2 text-center text-xs font-bold uppercase tracking-wide transition',
                                    active
                                        ? 'border-pitch bg-pitch text-white shadow-soft'
                                        : enabled
                                          ? 'border-line bg-white hover:border-pitch hover:text-pitch'
                                          : 'cursor-not-allowed border-line bg-pitch/5 text-muted/40',
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
                        'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition',
                        ready
                            ? 'bg-pitch text-white shadow-soft hover:bg-pitch-dark active:scale-[0.99]'
                            : 'cursor-not-allowed bg-pitch/15 text-muted',
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
                            'inline-flex h-full items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition',
                            ready
                                ? 'border-line bg-white hover:border-pitch hover:text-pitch'
                                : 'cursor-not-allowed border-line text-muted/40',
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
                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-white shadow-soft">
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
                                        <span className="text-[10px] font-medium text-muted">
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
