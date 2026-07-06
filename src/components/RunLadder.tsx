import { useEffect, useRef, type ReactNode } from 'react';
import type { RunState } from '../domain/run';

/** Short labels for the six ladder slots (group, four KO rounds, the cup). */
const SHORT = ['GRP', 'R16', 'QF', 'SF', 'FIN', 'CUP'];

type Status = 'win' | 'loss' | 'current' | 'upcoming' | 'cup-won' | 'cup-upcoming';

interface Step {
  short: string;
  status: Status;
  node: string;
  /** Only the current step carries a caption ("vs XXX"); the rest is a bare tracker. */
  sub: ReactNode;
  /** Whether this step can be opened in the content area (played round or the current one). */
  clickable: boolean;
}

const NODE_BASE = 'relative z-10 grid place-items-center rounded-full border-2 font-mono font-bold';
const NODE_BY_STATUS: Record<Status, string> = {
  win: 'border-pitch-dark bg-pitch text-white',
  loss: 'border-loss bg-loss text-white',
  current: 'border-amber bg-amber/90 text-ink ring-4 ring-amber/25',
  upcoming: 'border-line bg-panel text-muted',
  'cup-won': 'border-[#c99a3a] text-[#3a2a06]',
  'cup-upcoming': 'border-line bg-panel text-muted',
};

/** The Cup Run progress ladder: a basic history tracker (Group -> R16 -> QF -> SF ->
 *  Final -> Cup). It stays a bare stepper - clicking a step doesn't show detail here,
 *  it switches the content area below to that round (owned by the parent). The current
 *  step is lit and auto-scrolled to centre; `viewedIndex` marks the open step. */
export default function RunLadder({
  run,
  currentIndex,
  viewedIndex,
  onSelectStep,
  locked = false,
}: {
  run: RunState;
  /** The live/current round's step index (amber, auto-centred). */
  currentIndex: number;
  /** The step currently open in the content area (highlighted). */
  viewedIndex: number;
  onSelectStep: (index: number) => void;
  /** Block navigation while a live match is playing out. */
  locked?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLButtonElement | null>(null);

  const hist = run.history ?? [];
  const groupRec = hist.find((h) => h.stage === 'group');
  const koRec = (i: number) => hist.find((h) => h.stage === i);
  const ended = run.phase === 'ended';
  const champion = run.outcome === 'champion';

  const steps: Step[] = [];

  // Group.
  if (groupRec) {
    steps.push({ short: SHORT[0], status: groupRec.won ? 'win' : 'loss', node: groupRec.won ? '✓' : '✗', sub: null, clickable: true });
  } else {
    const cur = currentIndex === 0 && !ended;
    steps.push({ short: SHORT[0], status: cur ? 'current' : 'upcoming', node: SHORT[0], sub: cur ? <span className="text-amber">now</span> : null, clickable: currentIndex === 0 });
  }

  // Four knockout rounds.
  for (let i = 0; i < 4; i++) {
    const rec = koRec(i);
    if (rec) {
      steps.push({ short: SHORT[i + 1], status: rec.won ? 'win' : 'loss', node: rec.won ? '✓' : '✗', sub: null, clickable: true });
    } else if (currentIndex === i + 1 && !ended) {
      steps.push({
        short: SHORT[i + 1],
        status: 'current',
        node: SHORT[i + 1],
        sub: run.nextOpponent ? <span className="font-bold text-amber">vs {run.nextOpponent.code}</span> : null,
        clickable: true,
      });
    } else {
      steps.push({ short: SHORT[i + 1], status: 'upcoming', node: SHORT[i + 1], sub: null, clickable: currentIndex === i + 1 });
    }
  }

  // The cup (decorative endpoint, not a selectable round).
  steps.push({
    short: SHORT[5],
    status: champion ? 'cup-won' : 'cup-upcoming',
    node: '\u{1F3C6}',
    sub: champion ? <span className="font-bold text-pitch">Won!</span> : null,
    clickable: false,
  });

  // Keep the current step centred in the scroller (horizontal only, no page scroll).
  useEffect(() => {
    const c = scrollRef.current;
    const s = curRef.current;
    if (!c || !s) return;
    const cRect = c.getBoundingClientRect();
    const sRect = s.getBoundingClientRect();
    const target = c.scrollLeft + (sRect.left - cRect.left) - (c.clientWidth - sRect.width) / 2;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ left: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
  }, [currentIndex]);

  return (
    <div className="rounded-md border border-line bg-panel shadow-hard">
      <div ref={scrollRef} className="overflow-x-auto">
        <div className="flex min-w-[600px] items-start px-2 py-3.5">
          {steps.map((s, i) => {
            const isCurrent = i === currentIndex && !ended;
            const reached = s.status !== 'upcoming' && s.status !== 'cup-upcoming';
            const isCup = i === 5;
            const isViewed = i === viewedIndex;
            const canClick = s.clickable && !locked;
            return (
              <button
                key={i}
                type="button"
                ref={i === currentIndex ? curRef : undefined}
                disabled={!canClick}
                onClick={() => canClick && onSelectStep(i)}
                aria-pressed={isViewed}
                className={`relative flex flex-1 flex-col items-center rounded-md px-0.5 py-1 text-center ${
                  canClick ? 'cursor-pointer hover:bg-chalk' : 'cursor-default'
                } ${isViewed ? 'bg-chalk ring-1 ring-line' : ''}`}
              >
                {i > 0 && (
                  <span className={`absolute left-[-50%] top-[23px] h-0.5 w-full ${reached ? 'bg-pitch' : 'bg-line'}`} />
                )}
                <span
                  className={[
                    NODE_BASE,
                    isCup ? 'h-[42px] w-[42px] text-[18px]' : 'h-[38px] w-[38px] text-[11px]',
                    NODE_BY_STATUS[s.status],
                  ].join(' ')}
                  style={s.status === 'cup-won' ? { background: 'linear-gradient(135deg,#f0cf8a,#c99a3a)' } : undefined}
                >
                  {s.node}
                </span>
                <span
                  className={`mt-[7px] font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${
                    isCurrent ? 'text-amber' : reached ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {s.short}
                </span>
                <span className="mt-0.5 min-h-[13px] font-mono text-[10px] leading-tight">{s.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
