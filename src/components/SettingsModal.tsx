import { useState } from 'react';
import Overlay from './Overlay';
import { DANGER_BTN, SECONDARY_BTN, SegControl, SpeedControl } from './matchUi';
import type { MatchSpeed } from '../domain/clock';
import type { Difficulty } from '../domain/difficulty';
import type { SettingsApi } from '../hooks/useSettings';

const GROUP = 'border-t border-line px-5 py-4 first:border-t-0';
const GH = 'font-display text-[14px] font-extrabold';
const HINT = 'mt-0.5 text-[12px] leading-snug text-muted';

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
    { value: 'casual', label: 'Casual' },
    { value: 'normal', label: 'Normal' },
    { value: 'hard', label: 'Hard' },
];
const DIFF_DESC: Record<Difficulty, string> = {
    casual: 'Your ties tilt your way - a scoring edge in every match you play.',
    normal: 'Balanced. Your matches play to the ratings.',
    hard: 'Opponents get the edge in your ties. Every round is a fight.',
};

/** A small on/off switch (dark mode, and future boolean settings). */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onToggle}
            className={`relative h-6 w-[42px] shrink-0 rounded-full border transition ${
                on ? 'border-pitch-dark bg-pitch' : 'border-line bg-line'
            }`}
        >
            <span
                className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
                    on ? 'left-[21px]' : 'left-[2px]'
                }`}
            />
        </button>
    );
}

/** The global settings sheet, opened from the masthead gear. Gathers the match
 *  playback controls (moved here from the match screens), difficulty, and the
 *  appearance toggle. The squad-pool limiter is added in the next slice. */
export default function SettingsModal({
    onClose,
    settings,
    speed,
    onSetSpeed,
    auto,
    onSetAuto,
    onChangeDifficulty,
    albumCount,
}: {
    onClose: () => void;
    settings: SettingsApi;
    speed: MatchSpeed;
    onSetSpeed: (s: MatchSpeed) => void;
    auto: boolean;
    onSetAuto: (a: boolean) => void;
    /** Commit a difficulty change (App also resets the sticker album). */
    onChangeDifficulty: (d: Difficulty) => void;
    /** Collected stickers at risk when difficulty changes (0 hides the confirm). */
    albumCount: number;
}) {
    const { settings: s, setTheme } = settings;
    // A difficulty awaiting confirmation (changing difficulty wipes the album).
    const [pending, setPending] = useState<Difficulty | null>(null);

    const pickDifficulty = (d: Difficulty) => {
        if (d === s.difficulty) return;
        if (albumCount > 0) setPending(d);
        else onChangeDifficulty(d);
    };

    return (
        <Overlay onClose={onClose} ariaLabel="Settings">
            <h2 className="mb-3 font-display text-[20px] font-extrabold uppercase tracking-[-0.01em]">
                Settings
            </h2>
            <div className="overflow-hidden rounded-md border border-line bg-panel">
                {/* Difficulty */}
                <div className={GROUP}>
                    <div className={GH}>Difficulty</div>
                    <p className={HINT}>How hard it is to win a tie, and so to lift the cup.</p>
                    <div className="mt-3">
                        <SegControl
                            ariaLabel="Difficulty"
                            label="Level"
                            value={s.difficulty}
                            onSelect={pickDifficulty}
                            options={DIFFICULTIES}
                        />
                    </div>
                    <p className="mt-2 font-mono text-[11px] leading-snug text-muted">
                        {DIFF_DESC[s.difficulty]}
                    </p>
                    {pending && (
                        <div className="mt-3 rounded-md border border-loss/40 bg-loss/[0.06] p-3">
                            <p className="text-[12.5px] leading-snug">
                                Switching difficulty resets your sticker album. You will lose{' '}
                                <b>{albumCount}</b> collected{' '}
                                {albumCount === 1 ? 'sticker' : 'stickers'}.
                            </p>
                            <div className="mt-2.5 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChangeDifficulty(pending);
                                        setPending(null);
                                    }}
                                    className={DANGER_BTN}
                                >
                                    Change &amp; reset album
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPending(null)}
                                    className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Match playback */}
                <div className={GROUP}>
                    <div className={GH}>Match playback</div>
                    <p className={HINT}>
                        Speed of the live reveal, and whether tournament rounds auto-play or wait for
                        you.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                        <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
                        <SegControl
                            ariaLabel="Tournament rounds"
                            label="Rounds"
                            value={auto ? 'auto' : 'manual'}
                            onSelect={(v) => onSetAuto(v === 'auto')}
                            options={[
                                { value: 'manual', label: 'Manual' },
                                { value: 'auto', label: 'Auto-play' },
                            ]}
                        />
                    </div>
                </div>

                {/* Appearance */}
                <div className={GROUP}>
                    <div className={GH}>Appearance</div>
                    <div className="mt-2 flex items-center justify-between gap-4">
                        <div>
                            <div className="text-[13.5px] font-semibold">Dark mode</div>
                            <p className={HINT}>Night-match theme for low-light play.</p>
                        </div>
                        <Switch
                            on={s.theme === 'dark'}
                            onToggle={() => setTheme(s.theme === 'dark' ? 'light' : 'dark')}
                            label="Dark mode"
                        />
                    </div>
                </div>
            </div>
        </Overlay>
    );
}
