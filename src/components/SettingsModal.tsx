import { useMemo } from 'react';
import Overlay from './Overlay';
import { CARD_FLAT, SegControl, SpeedControl } from './matchUi';
import type { MatchSpeed } from '../domain/clock';
import type { Difficulty } from '../domain/difficulty';
import { WORLD_CUP_YEARS } from '../data/squads';
import { collectiblePlayers } from '../domain/album';
import type { SettingsApi } from '../hooks/useSettings';
import type { Pool } from '../hooks/usePool';

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

/** The global settings sheet, opened from the masthead gear: match playback, difficulty,
 *  appearance and the squad pool. Signing in lives in its own dialog (AccountModal), not
 *  here - it is the one thing a new player may want and does not belong behind a gear. */
export default function SettingsModal({
    onClose,
    settings,
    pool,
    speed,
    onSetSpeed,
}: {
    onClose: () => void;
    settings: SettingsApi;
    /** The pool the rest of the app is playing with, so the counters below read the same
     *  derivation rather than walking the dataset a second time (hygiene H86). */
    pool: Pool;
    speed: MatchSpeed;
    onSetSpeed: (s: MatchSpeed) => void;
}) {
    const { settings: s, setTheme, setDifficulty, setPoolYears } = settings;

    // Nothing to confirm: a difficulty change persists the preference and stops there.
    // It used to wipe the sticker album, which is why this had a danger dialog; the rule
    // was dropped 2026-08-20 (roadmap item 24) because nothing wipes the career or the
    // challenges either, and those are earned under a difficulty just as much.
    const pickDifficulty = (d: Difficulty) => {
        if (d !== s.difficulty) setDifficulty(d);
    };

    // Toggle a World Cup in/out of the pool, keeping at least one selected.
    const togglePool = (y: number) => {
        const next = s.poolYears.includes(y)
            ? s.poolYears.filter((x) => x !== y)
            : [...s.poolYears, y].sort((a, b) => a - b);
        if (next.length) setPoolYears(next);
    };
    // Memoized because it is not cheap and it was being redone on every render of an open
    // sheet: `collectiblePlayers` walks every player in the pool (hygiene H145). The pool
    // itself is no longer re-derived here - it comes in already built.
    const poolCounts = useMemo(
        () => ({
            cups: s.poolYears.length,
            teams: pool.squads.length,
            players: pool.players.length,
            collectibles: collectiblePlayers(pool.players).length,
        }),
        [s.poolYears, pool],
    );

    return (
        <Overlay onClose={onClose} ariaLabel="Settings">
            <h2 className="mb-3 font-display text-[20px] font-extrabold uppercase tracking-[-0.01em]">
                Settings
            </h2>
            <div className={`overflow-hidden ${CARD_FLAT}`}>
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

                {/* Squad pool */}
                <div className={GROUP}>
                    <div className={GH}>Squad pool</div>
                    <p className={HINT}>
                        Which World Cups the game draws from - your squad rolls, the transfer market,
                        your opponents, and the sticker album.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {WORLD_CUP_YEARS.map((y) => {
                            const on = s.poolYears.includes(y);
                            return (
                                <button
                                    key={y}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => togglePool(y)}
                                    className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition ${
                                        on
                                            ? 'border-pitch-dark bg-pitch-dark text-white'
                                            : 'border-line bg-panel text-muted hover:border-pitch'
                                    }`}
                                >
                                    {y}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2.5 rounded-md bg-chalk px-3 py-2 font-mono text-[11px] text-ink">
                        Pool: <b className="text-accent">{poolCounts.cups}</b> World Cups &middot;{' '}
                        <b className="text-accent">{poolCounts.teams}</b> teams &middot;{' '}
                        <b className="text-accent">{poolCounts.players.toLocaleString()}</b> players
                        &middot; <b className="text-accent">{poolCounts.collectibles}</b> collectibles
                    </div>
                </div>

                {/* Difficulty */}
                <div className={GROUP}>
                    <div className={GH}>Difficulty</div>
                    <p className={HINT}>How hard it is to win a tie, and so to lift the cup.</p>
                    <div className="mt-3 flex">
                        <SegControl
                            ariaLabel="Difficulty"
                            value={s.difficulty}
                            onSelect={pickDifficulty}
                            options={DIFFICULTIES}
                        />
                    </div>
                    <p className="mt-2 font-mono text-[11px] leading-snug text-muted">
                        {DIFF_DESC[s.difficulty]}
                    </p>
                </div>

                {/* Match playback */}
                <div className={GROUP}>
                    <div className={GH}>Match playback</div>
                    <p className={HINT}>Speed of the live reveal.</p>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                        <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
                    </div>
                </div>

            </div>
        </Overlay>
    );
}
