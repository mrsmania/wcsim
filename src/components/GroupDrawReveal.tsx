import { useEffect, useState } from 'react';
import { SQUADS } from '../data/squads';
import type { GroupTeam } from '../domain/tournament';
import { ArrowRight } from 'lucide-react';
import Flag from './Flag';
import { PRIMARY_BTN, RatingChip } from './matchUi';
import { prefersReducedMotion } from '../hooks/motion';

/** How often (ms) the drawn flags reshuffle while the draw scrambles. */
const SCRAMBLE_STEP_MS = 90;
/** How long (ms) the scramble runs before settling on the real opponents. */
const SCRAMBLE_DURATION_MS = 1300;

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];

interface Props {
  userTeam: GroupTeam;
  opponents: GroupTeam[];
  /** Dismiss the draw modal and continue to the group stage. */
  onContinue: () => void;
}

/** The opening group draw: opponent flags scramble for a beat, then settle on the
 *  real teams, and a button continues to the group stage. Rendered as a modal over
 *  the group screen, shown once for a freshly drawn group. */
export default function GroupDrawReveal({ userTeam, opponents, onContinue }: Props) {
  const [settled, setSettled] = useState(false);
  const [revealCodes, setRevealCodes] = useState<string[]>(() => opponents.map(() => randomCode()));

  useEffect(() => {
    // Reduced motion: skip the scramble and reveal the real opponents at once.
    if (prefersReducedMotion()) {
      setRevealCodes(opponents.map((o) => o.code));
      setSettled(true);
      return;
    }
    let elapsed = 0;
    const id = window.setInterval(() => {
      elapsed += SCRAMBLE_STEP_MS;
      if (elapsed >= SCRAMBLE_DURATION_MS) {
        window.clearInterval(id);
        setRevealCodes(opponents.map((o) => o.code));
        setSettled(true);
      } else {
        setRevealCodes(opponents.map(() => randomCode()));
      }
    }, SCRAMBLE_STEP_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={settled ? onContinue : undefined}
    >
      <div
        className="w-full max-w-[560px] rounded-md border border-line bg-panel p-5 shadow-hard sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
            Group draw
          </div>
          <h2 className="mt-0.5 font-display text-2xl font-extrabold leading-none tracking-[-0.02em]">
            Your group
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col items-center gap-2 rounded-[5px] border border-pitch/40 bg-pitch/[0.06] px-3 py-5 text-center">
            <Flag isUser code="" className="h-6 w-9" />
            <span className="text-sm font-bold text-ink">Your XI</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-loss">
              You
            </span>
            <RatingChip value={userTeam.strength.overall} />
          </div>
          {opponents.map((o, i) => (
            <div
              key={o.id}
              className={`flex flex-col items-center gap-2 rounded-[5px] border border-line bg-ground px-3 py-5 text-center ${
                settled ? 'animate-settle' : ''
              }`}
            >
              <Flag code={revealCodes[i] ?? ''} className="h-6 w-9" />
              <span className="text-sm font-semibold leading-tight text-ink">
                {settled ? o.name : '…'}
              </span>
              {settled && o.year && (
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber">
                  WC {o.year}
                </span>
              )}
              {settled && <RatingChip value={o.strength.overall} />}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-center">
          {settled ? (
            <button onClick={onContinue} className={PRIMARY_BTN}>
              Continue to group stage
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          ) : (
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Drawing opponents…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
