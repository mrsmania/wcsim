import { useEffect, useState } from 'react';
import { SQUADS } from '../data/squads';
import type { GroupTeam } from '../domain/tournament';
import { ArrowRight } from 'lucide-react';
import Flag from './Flag';
import { PRIMARY_BTN, RatingChip, StageHeader } from './matchUi';

/** How often (ms) the drawn flags reshuffle while the draw scrambles. */
const SCRAMBLE_STEP_MS = 90;
/** How long (ms) the scramble runs before settling on the real opponents. */
const SCRAMBLE_DURATION_MS = 1300;

const ALL_CODES = [...new Set(SQUADS.map((s) => s.code))];
const randomCode = () => ALL_CODES[Math.floor(Math.random() * ALL_CODES.length)];

interface Props {
  userTeam: GroupTeam;
  opponents: GroupTeam[];
  /** Dismiss the draw takeover and continue to the group stage. */
  onContinue: () => void;
}

/** The opening group draw: opponent flags scramble for a beat, then settle on the
 *  real teams, and a button continues to the group stage. Shown once as a full
 *  takeover before any matchday is played. */
export default function GroupDrawReveal({ userTeam, opponents, onContinue }: Props) {
  const [settled, setSettled] = useState(false);
  const [revealCodes, setRevealCodes] = useState<string[]>(() => opponents.map(() => randomCode()));

  useEffect(() => {
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
    <div className="mx-auto max-w-[780px]">
      <StageHeader eyebrow="Group draw" title="Your group" />
      <div className="rounded-md border border-line bg-panel p-6 shadow-hard">
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
      </div>
      <div className="mt-[22px] flex justify-center">
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
  );
}
