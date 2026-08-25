import { useEffect, useState } from 'react';
import { SQUADS } from '../data/squads';
import type { GroupTeam } from '../domain/tournament';
import { ArrowRight } from 'lucide-react';
import Flag from './Flag';
import { CARD, PAGE_EYEBROW, PRIMARY_BTN, RatingChip } from './matchUi';
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
 *  the group screen, shown once for a freshly drawn group.
 *
 *  Dismissed by the Continue button ONLY: a backdrop click and Escape deliberately do
 *  nothing, because the draw is the reveal and closing it by accident spoils it. The
 *  callers hide the standings behind it for the same reason, so the modal never has to
 *  rely on its backdrop tint to keep the opponents secret. */
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

  // Lock background scroll while the draw is up: the page behind it is the group it
  // is hiding, so scrolling it defeats the modal. Same pattern as `Overlay` (own
  // effect with [] deps so the original overflow is captured once and restored on
  // dismiss); the page scrolls on the document element, so lock that.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = 'hidden';
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`max-h-[90vh] w-full max-w-[560px] overflow-y-auto ${CARD} p-5 sm:p-6`}>
        <div className="mb-4">
          <div className={PAGE_EYEBROW}>
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
