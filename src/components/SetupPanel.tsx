import { useState } from 'react';
import { STYLES, STYLE_LABEL, type FormationName, type Style } from '../domain/formations';
import type { TeamStrength } from '../domain/draft';
import { ChevronDown, Dices } from 'lucide-react';

const STRENGTH_TIERS: { value: TeamStrength; label: string; hint: string }[] = [
    { value: 'weak', label: 'Weak', hint: 'rating < 75' },
    { value: 'medium', label: 'Medium', hint: 'rating 75-80' },
    { value: 'strong', label: 'Strong', hint: 'rating 80-88' },
    { value: 'very-strong', label: 'Very strong', hint: 'rating 88+' },
];

const SEGLBL = 'mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted';

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
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
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
                                        : 'border-line bg-white text-ink hover:border-pitch hover:text-pitch',
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
                                          ? 'bg-white text-muted hover:text-pitch'
                                          : 'cursor-not-allowed bg-pitch/5 text-muted/40',
                                ].join(' ')}
                            >
                                {STYLE_LABEL[style]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Build your XI */}
            <div className="border-t border-line p-[18px]">
                <p className={SEGLBL}>Build your XI</p>
                <div className="flex gap-[9px]">
                    <button
                        onClick={onStart}
                        disabled={!ready}
                        className="flex flex-1 items-center justify-center gap-2 rounded-[5px] border border-pitch-dark bg-pitch px-4 py-[11px] font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-pitch-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {ready ? 'Roll a squad' : 'Loading…'}
                        {ready && <Dices size={16} strokeWidth={2.5} />}
                    </button>
                    <div className="relative flex-1">
                        <button
                            onClick={() => setMenuOpen((o) => !o)}
                            disabled={!ready}
                            title="Testing: auto-fill a random valid XI of a chosen strength and skip the draft"
                            className="flex w-full items-center justify-center gap-2 rounded-[5px] border border-ink bg-white px-4 py-[11px] font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink transition hover:border-pitch hover:text-pitch disabled:cursor-not-allowed disabled:opacity-50"
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
                                <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-md border border-line bg-white shadow-hard">
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
                </div>
                <p className="mt-2.5 font-mono text-[12px] tracking-[0.02em] text-muted">
                    Roll a national-team squad, then pick one player into an open slot. Repeat 11
                    times.
                </p>
            </div>
        </div>
    );
}
