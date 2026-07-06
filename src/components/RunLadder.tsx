import { useEffect, useRef, type ReactNode } from 'react';
import type { RunState } from '../domain/run';
import { ordinal } from './matchUi';

/** Short labels for the six ladder slots (group, four KO rounds, the cup). */
const SHORT = ['GRP', 'R16', 'QF', 'SF', 'FIN', 'CUP'];

type Status = 'win' | 'loss' | 'current' | 'upcoming' | 'cup-won' | 'cup-upcoming';

interface Step {
  short: string;
  status: Status;
  /** Node glyph: a tick / cross for played rounds, the label otherwise, 🏆 for the cup. */
  node: string;
  /** Small caption under the label (result, "vs XXX", finishing position). */
  sub: ReactNode;
}

const NODE_BASE =
  'relative z-10 grid place-items-center rounded-full border-2 font-mono font-bold';
const NODE_BY_STATUS: Record<Status, string> = {
  win: 'border-pitch-dark bg-pitch text-white',
  loss: 'border-loss bg-loss text-white',
  current: 'border-amber bg-amber/90 text-ink ring-4 ring-amber/25',
  upcoming: 'border-line bg-panel text-muted',
  'cup-won': 'border-[#c99a3a] text-[#3a2a06]',
  'cup-upcoming': 'border-line bg-panel text-muted',
};

/** The Cup Run progress ladder: Group -> R16 -> QF -> SF -> Final -> Cup, current
 *  step lit and auto-scrolled to the centre so the user never scrolls to find it.
 *  Reads the structured `run.history` (plus the pending opponent + outcome). */
export default function RunLadder({ run }: { run: RunState }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLDivElement | null>(null);

  const hist = run.history ?? [];
  const groupRec = hist.find((h) => h.stage === 'group');
  const koRec = (i: number) => hist.find((h) => h.stage === i);
  const ended = run.phase === 'ended';
  const champion = run.outcome === 'champion';

  // Which slot is "current" (drives the highlight + auto-centre).
  const currentIndex =
    run.phase === 'group'
      ? 0
      : !ended
        ? run.koRound + 1
        : champion
          ? 5
          : run.outcome === 'group'
            ? 0
            : run.koRound + 1;

  const steps: Step[] = [];

  // Group.
  if (groupRec) {
    steps.push({
      short: SHORT[0],
      status: groupRec.won ? 'win' : 'loss',
      node: groupRec.won ? '✓' : '✗',
      sub: (
        <span className={groupRec.won ? 'font-bold text-pitch' : 'font-bold text-loss'}>
          {ordinal(groupRec.groupPos ?? 0)} / {groupRec.groupSize}
        </span>
      ),
    });
  } else {
    steps.push({ short: SHORT[0], status: 'current', node: SHORT[0], sub: <span className="text-amber">now</span> });
  }

  // Four knockout rounds.
  for (let i = 0; i < 4; i++) {
    const rec = koRec(i);
    if (rec) {
      steps.push({
        short: SHORT[i + 1],
        status: rec.won ? 'win' : 'loss',
        node: rec.won ? '✓' : '✗',
        sub: (
          <span className={rec.won ? 'font-bold text-pitch' : 'font-bold text-loss'}>
            {rec.won ? 'W' : 'L'} {rec.userGoals}-{rec.oppGoals} {rec.oppCode}
          </span>
        ),
      });
    } else if (currentIndex === i + 1 && !ended) {
      steps.push({
        short: SHORT[i + 1],
        status: 'current',
        node: SHORT[i + 1],
        sub: run.nextOpponent ? (
          <span className="font-bold text-amber">vs {run.nextOpponent.code}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
      });
    } else {
      steps.push({ short: SHORT[i + 1], status: 'upcoming', node: SHORT[i + 1], sub: <span className="text-muted">—</span> });
    }
  }

  // The cup.
  steps.push({
    short: SHORT[5],
    status: champion ? 'cup-won' : 'cup-upcoming',
    node: '\u{1F3C6}',
    sub: champion ? <span className="font-bold text-pitch">Won!</span> : <span className="text-muted">—</span>,
  });

  // Keep the current step centred in the scroller (horizontal only, no page scroll).
  useEffect(() => {
    const c = scrollRef.current;
    const s = curRef.current;
    if (!c || !s) return;
    const target = s.offsetLeft + s.offsetWidth / 2 - c.clientWidth / 2;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    c.scrollTo({ left: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
  }, [currentIndex]);

  return (
    <div ref={scrollRef} className="overflow-x-auto rounded-md border border-line bg-panel shadow-hard">
      <div className="flex min-w-[600px] items-start px-2 py-3.5">
        {steps.map((s, i) => {
          const isCurrent = s.status === 'current';
          const reached = s.status !== 'upcoming' && s.status !== 'cup-upcoming';
          const isCup = i === 5;
          return (
            <div
              key={i}
              ref={i === currentIndex ? curRef : undefined}
              className="relative flex flex-1 flex-col items-center px-0.5 text-center"
            >
              {i > 0 && (
                <span
                  className={`absolute left-[-50%] top-[19px] h-0.5 w-full ${reached ? 'bg-pitch' : 'bg-line'}`}
                />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
