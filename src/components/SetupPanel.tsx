import { STYLES, STYLE_LABEL, type FormationName, type Style } from '../domain/formations';
import { ArrowRight } from 'lucide-react';

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
    /** Testing shortcut: auto-fill a random valid XI and skip the draft. */
    onRandomTeam: () => void;
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
                    {ready ? 'Roll for your first squad' : 'Loading…'}
                    {ready && <ArrowRight size={16} strokeWidth={2.5} />}
                </button>
                <button
                    onClick={onRandomTeam}
                    disabled={!ready}
                    title="Testing: auto-fill a random valid XI and skip the draft"
                    className={[
                        'shrink-0 rounded-xl border px-4 py-3 text-sm font-black uppercase tracking-wide transition',
                        ready
                            ? 'border-stone-400 hover:border-stone-900 hover:bg-stone-900 hover:text-white'
                            : 'cursor-not-allowed border-stone-200 text-stone-300',
                    ].join(' ')}
                >
                    Random team
                </button>
            </div>
        </div>
    );
}
