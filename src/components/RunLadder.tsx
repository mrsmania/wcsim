import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RoundRecord, RunState } from '../domain/run';
import { KO_ROUNDS } from '../domain/knockout';
import { boonById, type Rarity } from '../domain/boons';
import { ordinal } from './matchUi';
import Flag from './Flag';

/** Short labels for the six ladder slots (group, four KO rounds, the cup). */
const SHORT = ['GRP', 'R16', 'QF', 'SF', 'FIN', 'CUP'];

const RARITY_COLOR: Record<Rarity, string> = {
  legendary: '#c99a3a',
  rare: '#e4922b',
  common: '#15924c',
};

type Status = 'win' | 'loss' | 'current' | 'upcoming' | 'cup-won' | 'cup-upcoming';

interface Step {
  short: string;
  status: Status;
  node: string;
  /** Only the current step carries a caption in the bar ("vs XXX"); everything else
   *  lives in the detail panel below. */
  sub: ReactNode;
  /** The completed round this step represents, if any (makes the step clickable). */
  record?: RoundRecord;
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

const koStatus = (d?: string) => (d === 'aet' ? 'After extra time' : d === 'pens' ? 'Penalties' : 'Full time');

function BoostLine({ boostId }: { boostId?: string }) {
  const boost = boostId ? boonById(boostId) : undefined;
  if (!boost) return null;
  return (
    <div className="mt-3 flex items-start gap-1.5 border-t border-line pt-2.5 text-[12px] text-muted">
      <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: RARITY_COLOR[boost.rarity] }} />
      <span>
        Boost taken: <b className="text-ink">{boost.name}</b> — {boost.description}
      </span>
    </div>
  );
}

/** The detail for a completed round, shown in the panel below the bar. */
function RoundDetail({ record }: { record: RoundRecord }) {
  if (record.stage === 'group') {
    return (
      <div>
        <div className="mb-2 text-[13px] font-semibold">
          Group stage — finished {ordinal(record.groupPos ?? 0)} of {record.groupSize} ·{' '}
          <span className={record.won ? 'text-pitch' : 'text-loss'}>
            {record.won ? 'through to the knockouts' : 'eliminated'}
          </span>
        </div>
        {record.groupResults && (
          <div className="flex flex-col gap-1">
            {record.groupResults.map((r, i) => {
              const res = r.us > r.them ? 'text-pitch' : r.us < r.them ? 'text-loss' : 'text-muted';
              return (
                <div key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-[74px] shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    Matchday {i + 1}
                  </span>
                  <span className="font-semibold">Your XI</span>
                  <span className={`font-mono font-bold ${res}`}>
                    {r.us}-{r.them}
                  </span>
                  <Flag code={r.code} className="h-3 w-[18px]" />
                  <span className="min-w-0 truncate">{r.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {KO_ROUNDS[record.stage as number]}
        </span>
        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${record.won ? 'text-pitch' : 'text-loss'}`}>
          {record.won ? 'Won' : 'Lost'}
          {record.decided !== 'reg' ? ` · ${koStatus(record.decided).toLowerCase()}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-[14.5px] font-semibold">
        <span className="flex items-center gap-1.5">
          <Flag isUser code="" className="h-[15px] w-[22px]" />
          Your XI
        </span>
        <span className="rounded-[4px] bg-ink px-3 py-0.5 font-mono text-lg font-bold tracking-[0.02em] text-ground">
          {record.userGoals}-{record.oppGoals}
        </span>
        <span className="flex items-center gap-1.5">
          <Flag code={record.oppCode ?? ''} className="h-[15px] w-[22px]" />
          {record.oppName}
          {record.oppYear ? <span className="font-mono text-[11px] text-muted"> {record.oppYear}</span> : null}
        </span>
      </div>
      <BoostLine boostId={record.boostId} />
    </div>
  );
}

/** The Cup Run progress ladder: Group -> R16 -> QF -> SF -> Final -> Cup, current
 *  step lit and auto-scrolled to centre. The bar itself stays a clean stepper; each
 *  played step is clickable and its full result + boost show in the detail panel
 *  below, which defaults to (and follows) the most recently played round. */
export default function RunLadder({ run }: { run: RunState }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLButtonElement | null>(null);
  // The step the user clicked, or null to follow the latest played round.
  const [picked, setPicked] = useState<number | null>(null);

  const hist = run.history ?? [];
  const groupRec = hist.find((h) => h.stage === 'group');
  const koRec = (i: number) => hist.find((h) => h.stage === i);
  const ended = run.phase === 'ended';
  const champion = run.outcome === 'champion';

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
    steps.push({ short: SHORT[0], status: groupRec.won ? 'win' : 'loss', node: groupRec.won ? '✓' : '✗', record: groupRec, sub: null });
  } else {
    steps.push({ short: SHORT[0], status: 'current', node: SHORT[0], sub: <span className="text-amber">now</span> });
  }

  // Four knockout rounds.
  for (let i = 0; i < 4; i++) {
    const rec = koRec(i);
    if (rec) {
      steps.push({ short: SHORT[i + 1], status: rec.won ? 'win' : 'loss', node: rec.won ? '✓' : '✗', record: rec, sub: null });
    } else if (currentIndex === i + 1 && !ended) {
      steps.push({
        short: SHORT[i + 1],
        status: 'current',
        node: SHORT[i + 1],
        sub: run.nextOpponent ? <span className="font-bold text-amber">vs {run.nextOpponent.code}</span> : null,
      });
    } else {
      steps.push({ short: SHORT[i + 1], status: 'upcoming', node: SHORT[i + 1], sub: null });
    }
  }

  // The cup.
  steps.push({
    short: SHORT[5],
    status: champion ? 'cup-won' : 'cup-upcoming',
    node: '\u{1F3C6}',
    sub: champion ? <span className="font-bold text-pitch">Won!</span> : null,
  });

  // Default the detail to the most recently played round; a click overrides it.
  let latestPlayed = -1;
  steps.forEach((s, i) => {
    if (s.record) latestPlayed = i;
  });
  const detailIndex = picked !== null && steps[picked]?.record ? picked : latestPlayed >= 0 ? latestPlayed : null;
  const detailRecord = detailIndex !== null ? steps[detailIndex]?.record : undefined;

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
    <div className="rounded-md border border-line bg-panel shadow-hard">
      <div ref={scrollRef} className="overflow-x-auto">
        <div className="flex min-w-[600px] items-start px-2 py-3.5">
          {steps.map((s, i) => {
            const isCurrent = s.status === 'current';
            const reached = s.status !== 'upcoming' && s.status !== 'cup-upcoming';
            const isCup = i === 5;
            const clickable = !!s.record;
            const isDetail = detailIndex === i;
            return (
              <button
                key={i}
                type="button"
                ref={i === currentIndex ? curRef : undefined}
                disabled={!clickable}
                onClick={() => clickable && setPicked((p) => (p === i ? null : i))}
                aria-pressed={isDetail}
                className={`relative flex flex-1 flex-col items-center rounded-md px-0.5 py-1 text-center ${
                  clickable ? 'cursor-pointer hover:bg-chalk' : 'cursor-default'
                } ${isDetail ? 'bg-chalk ring-1 ring-line' : ''}`}
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
      {detailRecord && (
        <div className="border-t border-line px-4 py-3">
          <RoundDetail record={detailRecord} />
        </div>
      )}
    </div>
  );
}
