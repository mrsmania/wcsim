import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { primaryPosition } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { xiStrength } from '../domain/match';
import { simulateTitleOdds } from '../domain/odds';
import { KO_ROUNDS } from '../domain/knockout';
import type { Rarity } from '../domain/boons';
import {
  autoDraftXi,
  beginRun,
  playGroupStage,
  chooseBoon,
  playKnockoutRound,
  type RunState,
  type RunOutcome,
} from '../domain/run';
import {
  PERKS,
  applyRunResult,
  buyPerk,
  levelProgress,
  FINISH_LABEL,
  type CareerState,
} from '../domain/career';
import { loadCareer, saveCareer } from '../state/careerStorage';
import Flag from './Flag';

const RARITY_COLOR: Record<Rarity, string> = {
  legendary: '#c99a3a',
  rare: '#e4922b',
  common: '#15924c',
};

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  group: 'the group stage',
  r16: 'the Round of 16',
  qf: 'the Quarter-finals',
  sf: 'the Semi-finals',
  final: 'the Final',
  champion: 'World Cup Champions',
};

const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);
const PRIMARY_BTN =
  'rounded-md bg-pitch px-5 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-white transition hover:bg-pitch-dark';

interface Reward {
  xpGained: number;
  prestigeGained: number;
  leveledUp: boolean;
}

/** Prototype of the roguelike Cup Run + the Manager Career meta-layer. Runs feed XP
 *  and Prestige into a persisted career; perks bought with Prestige feed back into
 *  the next run. Self-contained local state; does not touch the main game reducer. */
export default function CupRunScreen() {
  const [career, setCareer] = useState<CareerState>(loadCareer);
  const [run, setRun] = useState<RunState | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);

  const odds = useMemo(() => (run ? simulateTitleOdds(run.xi, 600).champion : 0), [run?.xi]);
  const str = useMemo(
    () => (run ? xiStrength(run.xi) : { attack: 0, defense: 0, overall: 0 }),
    [run?.xi],
  );

  const startRun = () => {
    setReward(null);
    setRun(beginRun(autoDraftXi(career.unlocked.includes('deep-squad')), career.unlocked));
  };

  // Step the run; award XP/Prestige exactly once when it ends.
  const advance = (next: RunState) => {
    if (next.phase === 'ended' && run && run.phase !== 'ended') {
      const r = applyRunResult(career, next);
      setCareer(r.career);
      saveCareer(r.career);
      setReward({ xpGained: r.xpGained, prestigeGained: r.prestigeGained, leveledUp: r.leveledUp });
    }
    setRun(next);
  };

  const purchase = (perkId: string) => {
    const c = buyPerk(career, perkId);
    setCareer(c);
    saveCareer(c);
  };

  const prog = levelProgress(career.xp);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        to="/"
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch"
      >
        <ArrowLeft size={13} strokeWidth={2.5} className="transition group-hover:-translate-x-0.5" />
        Back to game
      </Link>

      <div className="mb-5 mt-1">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
          Career &middot; prototype
        </div>
        <h2 className="mt-0.5 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] max-sm:text-2xl">
          Cup Run
        </h2>
      </div>

      {/* Career hub */}
      <section className="mb-4 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="bg-panel p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg font-extrabold">Level {career.level}</span>
              <span className="font-mono text-[12px] font-semibold text-amber">
                {career.prestige} Prestige
              </span>
            </div>
            <div className="mt-2 h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
              <div
                className="h-full bg-pitch"
                style={{ width: `${(prog.into / prog.needed) * 100}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted">
              {prog.into} / {prog.needed} XP to level {career.level + 1}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px bg-line sm:w-[300px]">
            {(
              [
                ['Runs', String(career.stats.runs)],
                ['Cups', String(career.stats.cups)],
                ['Best', career.stats.bestFinish ? FINISH_LABEL[career.stats.bestFinish] : '-'],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="bg-panel px-2 py-4 text-center">
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {label}
                </div>
                <div className="mt-0.5 font-display text-[15px] font-extrabold leading-tight">
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Perk shop */}
        <div className="border-t border-line p-4">
          <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Perks (spend Prestige - applies to future runs)
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {PERKS.map((perk) => {
              const owned = career.unlocked.includes(perk.id);
              const affordable = career.prestige >= perk.cost;
              return (
                <div key={perk.id} className="rounded-md border border-line bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[13.5px] font-extrabold">{perk.name}</span>
                    <span className="font-mono text-[11px] font-semibold text-amber">
                      {perk.cost}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug text-muted">{perk.description}</p>
                  <button
                    disabled={owned || !affordable}
                    onClick={() => purchase(perk.id)}
                    className={[
                      'mt-2 w-full rounded-[5px] px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition',
                      owned
                        ? 'cursor-default bg-pitch/10 text-pitch'
                        : affordable
                          ? 'bg-pitch text-white hover:bg-pitch-dark'
                          : 'cursor-not-allowed border border-line bg-white text-muted/50',
                    ].join(' ')}
                  >
                    {owned ? 'Owned' : affordable ? 'Unlock' : `Need ${perk.cost}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* No active run: CTA */}
      {!run && (
        <div className="rounded-md border border-line bg-panel p-8 text-center shadow-hard">
          <p className="mb-4 text-[13.5px] text-muted">
            Draft an XI and chase the trophy. Every run earns XP and Prestige for your career.
          </p>
          <button onClick={startRun} className={PRIMARY_BTN}>
            Start a Cup Run
          </button>
        </div>
      )}

      {/* Active run */}
      {run && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Your XI */}
          <section className="overflow-hidden rounded-md border border-line bg-panel shadow-hard">
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
              <span className="font-display text-base font-extrabold uppercase tracking-[-0.01em]">
                Your XI
              </span>
              <span className="font-mono text-[11px] font-semibold text-muted">
                Score <span className="text-ink">{run.score}</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-px border-b border-line bg-line text-center">
              {(
                [
                  ['Title', pct(odds), true],
                  ['Ovr', str.overall, false],
                  ['Att', str.attack, false],
                  ['Def', str.defense, false],
                ] as const
              ).map(([label, val, hero]) => (
                <div key={label} className={hero ? 'bg-pitch-dark py-2 text-white' : 'bg-panel py-2'}>
                  <div
                    className={`font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${hero ? 'text-white/70' : 'text-muted'}`}
                  >
                    {label}
                  </div>
                  <div className="font-mono text-[17px] font-bold leading-tight">{val}</div>
                </div>
              ))}
            </div>
            <ul>
              {run.xi.map((p) => {
                const sq = SQUAD_BY_ID[p.squadId];
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-2.5 border-b border-line px-4 py-1.5 last:border-b-0"
                  >
                    <span className="w-8 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-pitch">
                      {primaryPosition(p)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {p.name}
                    </span>
                    {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
                    <span className="w-6 shrink-0 text-right font-mono text-[14px] font-bold">
                      {p.elo}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Run panel + log */}
          <section className="flex flex-col gap-4">
            <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
              {run.phase === 'group' && (
                <div className="text-center">
                  <p className="mb-4 text-[13.5px] text-muted">
                    Play the group stage. Finish in the top two to reach the knockouts.
                  </p>
                  <button onClick={() => advance(playGroupStage(run))} className={PRIMARY_BTN}>
                    Play group stage
                  </button>
                </div>
              )}

              {run.phase === 'boon' && run.offer && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Pick a boon
                    </span>
                    {run.nextOpponent && (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                        Next: <Flag code={run.nextOpponent.code} className="h-3 w-[18px]" />
                        <b className="text-ink">{run.nextOpponent.name}</b> in {KO_ROUNDS[run.koRound]}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {run.offer.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setRun(chooseBoon(run, b.id))}
                        className="flex flex-col gap-1.5 rounded-md border border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-pitch"
                        style={{ borderTop: `3px solid ${RARITY_COLOR[b.rarity]}` }}
                      >
                        <span
                          className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
                          style={{ color: RARITY_COLOR[b.rarity] }}
                        >
                          {b.rarity}
                        </span>
                        <span className="font-display text-[14px] font-extrabold leading-tight">
                          {b.name}
                        </span>
                        <span className="text-[11.5px] leading-snug text-muted">{b.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {run.phase === 'match' && run.nextOpponent && (
                <div className="text-center">
                  <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {KO_ROUNDS[run.koRound]}
                  </p>
                  <p className="mb-4 inline-flex items-center gap-2 text-[15px] font-semibold">
                    You <Flag code={run.nextOpponent.code} className="h-3.5 w-5" /> vs{' '}
                    {run.nextOpponent.name}
                  </p>
                  <div>
                    <button onClick={() => advance(playKnockoutRound(run))} className={PRIMARY_BTN}>
                      Play {KO_ROUNDS[run.koRound]}
                    </button>
                  </div>
                </div>
              )}

              {run.phase === 'ended' && run.outcome && (
                <div className="text-center">
                  <div
                    className="mx-auto mb-3 inline-block rounded-md px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                    style={
                      run.outcome === 'champion'
                        ? { background: 'linear-gradient(135deg,#f0cf8a,#c99a3a)', color: '#3a2a06' }
                        : { background: '#eee', color: '#555' }
                    }
                  >
                    {run.outcome === 'champion'
                      ? '★ Champions ★'
                      : `Out in ${OUTCOME_LABEL[run.outcome]}`}
                  </div>
                  <div className="font-display text-2xl font-black">Final score {run.score}</div>
                  {reward && (
                    <div className="mt-1.5 font-mono text-[12px] text-muted">
                      +{reward.xpGained} XP &middot;{' '}
                      <span className="text-amber">+{reward.prestigeGained} Prestige</span>
                      {reward.leveledUp && (
                        <span className="ml-2 font-bold text-pitch">Level up!</span>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-center gap-2.5">
                    <button onClick={startRun} className={PRIMARY_BTN}>
                      New run
                    </button>
                    <button
                      onClick={() => {
                        setRun(null);
                        setReward(null);
                      }}
                      className="rounded-md border border-line bg-white px-4 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-ink transition hover:border-pitch hover:text-pitch"
                    >
                      Career
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Run log */}
            <div className="rounded-md border border-line bg-panel p-4 shadow-hard">
              <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Run log
              </div>
              <ul className="flex flex-col gap-1.5">
                {run.log.map((line, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-ink">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
