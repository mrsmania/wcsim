import Overlay from './Overlay';
import { SegControl, SpeedControl } from './matchUi';
import type { MatchSpeed } from '../domain/clock';
import type { SettingsApi } from '../hooks/useSettings';

const GROUP = 'border-t border-line px-5 py-4 first:border-t-0';
const GH = 'font-display text-[14px] font-extrabold';
const HINT = 'mt-0.5 text-[12px] leading-snug text-muted';

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
 *  playback controls (moved here from the match screens) and the appearance toggle.
 *  Difficulty and the squad-pool limiter are added in later slices. */
export default function SettingsModal({
    onClose,
    settings,
    speed,
    onSetSpeed,
    auto,
    onSetAuto,
}: {
    onClose: () => void;
    settings: SettingsApi;
    speed: MatchSpeed;
    onSetSpeed: (s: MatchSpeed) => void;
    auto: boolean;
    onSetAuto: (a: boolean) => void;
}) {
    const { settings: s, setTheme } = settings;
    return (
        <Overlay onClose={onClose} ariaLabel="Settings">
            <h2 className="mb-3 font-display text-[20px] font-extrabold uppercase tracking-[-0.01em]">
                Settings
            </h2>
            <div className="overflow-hidden rounded-md border border-line bg-panel">
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
