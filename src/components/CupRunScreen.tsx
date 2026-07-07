import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { primaryPosition, type Player } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { xiStrength, type MatchEvent, type ShootoutResult } from '../domain/match';
import { simulateTitleOdds } from '../domain/odds';
import { KO_ROUNDS, type KoDecided } from '../domain/knockout';
import type { MatchSpeed } from '../domain/clock';
import type { GroupState, GroupTeam } from '../domain/tournament';
import { boonById, type Boon, type Rarity } from '../domain/boons';
import {
  beginRun,
  prepareGroupStage,
  prepareKnockoutRound,
  chooseBoon,
  chemistryOf,
  type RunState,
  type RunOutcome,
  type UserMatch,
  type KoMatch,
  type RoundRecord,
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
import { loadRun, saveRun, clearRun } from '../state/runStorage';
import { useMatchClock, FT_HOLD_MS, KO_END_HOLD_MS } from '../hooks/useMatchClock';
import { useFollowBottom } from '../hooks/useFollowBottom';
import { liveMatchView, resultTag } from './matchView';
import { ordinal, ResultTag } from './matchUi';
import MatchdayCard from './MatchdayCard';
import StandingsTable from './StandingsTable';
import RunLadder from './RunLadder';
import Confetti from './Confetti';
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

const SPEEDS: { value: MatchSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`);
const PRIMARY_BTN =
  'rounded-md bg-pitch px-5 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-white transition hover:bg-pitch-dark';

interface Reward {
  xpGained: number;
  prestigeGained: number;
  leveledUp: boolean;
}

/** The live-reveal state: which match(es) are being played out before the run
 *  commits to `next`. Transient (not persisted) - a refresh mid-reveal drops back
 *  to the pre-play run, which just replays. The group carries its final table +
 *  a `done` flag so the standings show after the three matches, before committing. */
type Reveal =
  | { kind: 'group'; next: RunState; matches: UserMatch[]; group: GroupState; index: number; done: boolean }
  | { kind: 'ko'; next: RunState; match: KoMatch; opp: GroupTeam; roundName: string };

/** One match revealed minute by minute with the shared clock + goal feed (the same
 *  playback the main game uses). The user is always the home side. Keyed by the
 *  caller so each match remounts and restarts its own clock. Fires `onEnd` once the
 *  reveal (and any shootout) finishes. */
function LiveCupMatch({
  label,
  opp,
  userRating,
  events,
  decided,
  pens,
  speed,
  onEnd,
}: {
  label: string;
  opp: GroupTeam;
  userRating: number;
  events: MatchEvent[];
  decided: KoDecided;
  pens?: ShootoutResult;
  speed: MatchSpeed;
  onEnd: () => void;
}) {
  const liveMax = decided === 'reg' ? 90 : 120;
  const { liveMinute, clockLabel, penShown } = useMatchClock({
    active: true,
    speed,
    maxMinute: liveMax,
    endLabel: decided === 'reg' ? 'FT' : decided === 'aet' ? 'a.e.t.' : 'pens',
    penKicks: decided === 'pens' ? pens?.kicks : undefined,
    endHoldMs: decided === 'reg' ? FT_HOLD_MS : KO_END_HOLD_MS,
    onEnd,
  });
  const view = liveMatchView({
    playing: true,
    userSide: 'home',
    liveMinute,
    liveMax,
    clockLabel,
    playingEvents: events,
  });
  const penKicks = decided === 'pens' ? pens?.kicks : undefined;
  const showShootout = !!penKicks && liveMinute >= liveMax;
  return (
    <MatchdayCard
      label={label}
      tag={<ResultTag kind="next" label="Live now" />}
      userRating={userRating}
      oppName={opp.name}
      oppCode={opp.code}
      oppYear={opp.year}
      oppRating={opp.strength.overall}
      view={view}
      userSide="home"
      playing
      clockLabel={clockLabel}
      penKicks={penKicks}
      penShown={penShown}
      showShootout={showShootout}
    />
  );
}

/** A settled group match rendered as a finished card (used before the standings). */
function GroupResultCard({ m, i, userRating }: { m: UserMatch; i: number; userRating: number }) {
  const ug = m.result.homeGoals;
  const og = m.result.awayGoals;
  return (
    <MatchdayCard
      label={`Matchday ${i + 1}`}
      tag={<ResultTag {...resultTag({ user: ug, opp: og })} />}
      userRating={userRating}
      oppName={m.opp.name}
      oppCode={m.opp.code}
      oppYear={m.opp.year}
      oppRating={m.opp.strength.overall}
      view={liveMatchView({
        playing: false,
        userSide: 'home',
        liveMinute: 90,
        liveMax: 90,
        clockLabel: '',
        finished: { userGoals: ug, oppGoals: og, status: 'Full time', statusDim: true, events: m.result.events },
      })}
      userSide="home"
      playing={false}
      clockLabel=""
    />
  );
}

/** A finished knockout tie rendered as a settled card (goal feed + shootout). Built
 *  from primitives so it serves both the just-played tie (kept above the boost pick)
 *  and a past-round review opened from the ladder. */
function FinishedKoCard({
  roundName,
  oppName,
  oppCode,
  oppYear,
  oppRating,
  userRating,
  userGoals,
  oppGoals,
  decided,
  events,
  pens,
  userWon,
}: {
  roundName: string;
  oppName: string;
  oppCode: string;
  oppYear?: number;
  oppRating?: number;
  userRating: number;
  userGoals: number;
  oppGoals: number;
  decided: KoDecided;
  events: MatchEvent[];
  pens?: ShootoutResult;
  userWon: boolean;
}) {
  const liveMax = decided === 'reg' ? 90 : 120;
  const status = decided === 'reg' ? 'Full time' : decided === 'aet' ? 'a.e.t.' : 'Penalties';
  const label = userWon
    ? decided === 'pens'
      ? 'Won on penalties'
      : decided === 'aet'
        ? 'Won a.e.t.'
        : 'Won'
    : decided === 'pens'
      ? 'Lost on penalties'
      : 'Lost';
  const penKicks = decided === 'pens' ? pens?.kicks : undefined;
  return (
    <MatchdayCard
      label={roundName}
      tag={<ResultTag kind={userWon ? 'w' : 'l'} label={label} />}
      userRating={userRating}
      oppName={oppName}
      oppCode={oppCode}
      oppYear={oppYear}
      oppRating={oppRating ?? 0}
      view={liveMatchView({
        playing: false,
        userSide: 'home',
        liveMinute: liveMax,
        liveMax,
        clockLabel: '',
        finished: { userGoals, oppGoals, status, statusDim: decided === 'reg', events },
      })}
      userSide="home"
      playing={false}
      clockLabel=""
      penKicks={penKicks}
      penShown={penKicks?.length ?? 0}
      showShootout={!!penKicks}
    />
  );
}

/** The read-only review shown in the content area when a past round is opened from
 *  the ladder: the round's result (+ boost taken), or the group's finishing summary. */
function RoundReview({ record, onBack }: { record: RoundRecord; onBack: () => void }) {
  const backBtn = (
    <button
      onClick={onBack}
      className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-pitch"
    >
      <ArrowLeft size={13} strokeWidth={2.5} />
      Back to the current round
    </button>
  );

  const boost = record.boostId ? boonById(record.boostId) : undefined;
  const boostLine = boost && (
    <div className="mt-3 flex items-start gap-2 text-[12.5px]">
      <span
        className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
        style={{ background: RARITY_COLOR[boost.rarity] }}
      />
      <span className="text-muted">
        Boost taken: <b className="text-ink">{boost.name}</b> &middot; {boost.description}
      </span>
    </div>
  );

  if (record.stage === 'group') {
    return (
      <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
        <div className="mb-3 text-[14px] font-semibold">
          Group stage, finished {ordinal(record.groupPos ?? 0)} of {record.groupSize} ·{' '}
          <span className={record.won ? 'text-pitch' : 'text-loss'}>
            {record.won ? 'through to the knockouts' : 'eliminated'}
          </span>
        </div>
        {record.groupResults && (
          <div className="flex flex-col gap-1.5">
            {record.groupResults.map((r, i) => {
              const res = r.us > r.them ? 'text-pitch' : r.us < r.them ? 'text-loss' : 'text-muted';
              return (
                <div key={i} className="flex items-center gap-2 text-[13px]">
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
        {boostLine}
        {backBtn}
      </div>
    );
  }

  return (
    <div>
      <FinishedKoCard
        roundName={KO_ROUNDS[record.stage as number]}
        oppName={record.oppName ?? ''}
        oppCode={record.oppCode ?? ''}
        oppYear={record.oppYear}
        oppRating={record.oppRating}
        userRating={record.userRating ?? 0}
        userGoals={record.userGoals ?? 0}
        oppGoals={record.oppGoals ?? 0}
        decided={record.decided ?? 'reg'}
        events={record.events ?? []}
        pens={record.pens}
        userWon={record.won}
      />
      <div className="mt-4 rounded-md border border-line bg-panel p-4 shadow-hard">
        {boost ? boostLine : <div className="text-[12.5px] text-muted">No boost this round.</div>}
        {backBtn}
      </div>
    </div>
  );
}

/** A compact result banner (styled like the quick-game `Banner`): deep-green for a
 *  win / the cup, flat white for a loss, with the tifo corner arcs. No action button
 *  (the Cup Run panel below owns those). */
function RunBanner({
  tone,
  eyebrow,
  heading,
  body,
}: {
  tone: 'win' | 'loss';
  eyebrow: string;
  heading: string;
  body?: string;
}) {
  const win = tone === 'win';
  const arc = win ? 'border-white/15' : 'border-line';
  return (
    <div
      className={`relative overflow-hidden rounded-md border p-5 text-center shadow-hard ${
        win ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-panel'
      }`}
    >
      <span className={`pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full border-2 ${arc}`} />
      <span className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full border-2 ${arc}`} />
      <div
        className={`relative font-mono text-[10px] font-semibold uppercase tracking-[0.2em] ${
          win ? 'text-amber' : 'text-loss'
        }`}
      >
        {eyebrow}
      </div>
      <div className="relative mt-1 font-display text-2xl font-black tracking-[-0.02em] max-sm:text-xl">
        {heading}
      </div>
      {body && (
        <div className={`relative mt-1 text-[12.5px] ${win ? 'text-white/80' : 'text-muted'}`}>{body}</div>
      )}
    </div>
  );
}

/** The win result headline for a finished knockout tie. */
function koWinHeading(m: KoMatch): string {
  if (m.decided === 'pens') return 'Won on penalties';
  if (m.decided === 'aet') return `Won ${m.userGoals}-${m.oppGoals} (a.e.t.)`;
  return `Won ${m.userGoals}-${m.oppGoals}`;
}

/** The three-boost picker (rarity-topped cards) plus the "Next: opponent" line. Shared
 *  by the after-group screen (first boost) and the between-knockout-rounds boost phase.
 *  The next opponent shows flag + name + year so the year isn't lost. */
function BoostOffer({
  offer,
  nextOpponent,
  roundName,
  onPick,
}: {
  offer: Boon[];
  nextOpponent: GroupTeam | null;
  roundName: string;
  onPick: (b: Boon) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Pick a boost
        </span>
        {nextOpponent && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
            Next: <Flag code={nextOpponent.code} className="h-3 w-[18px]" />
            <b className="text-ink">{nextOpponent.name}</b>
            {nextOpponent.year != null && <span>{nextOpponent.year}</span>} in {roundName}
          </span>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {offer.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b)}
            className="flex flex-col gap-1.5 rounded-md border border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-pitch"
            style={{ borderTop: `3px solid ${RARITY_COLOR[b.rarity]}` }}
          >
            <span
              className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{ color: RARITY_COLOR[b.rarity] }}
            >
              {b.rarity}
            </span>
            <span className="font-display text-[14px] font-extrabold leading-tight">{b.name}</span>
            <span className="text-[11.5px] leading-snug text-muted">{b.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Prototype of the Cup Run + the Manager Career meta-layer. Runs feed XP
 *  and Prestige into a persisted career; perks bought with Prestige feed back into
 *  the next run. The in-progress run persists to its own localStorage key, so a
 *  refresh mid-run resumes it; matches are revealed with the shared live clock; and
 *  the final XI's collectibles are banked to the sticker album via onRunEnd. */
export default function CupRunScreen({
  draftedXi,
  onReDraft,
  speed,
  onSetSpeed,
  onRunEnd,
}: {
  /** The XI drafted in the main game, or null if the XI is not complete yet. */
  draftedXi: Player[] | null;
  /** Reset the draft and go draft a fresh XI (each run is a new team). */
  onReDraft: () => void;
  /** Match playback speed (shared with the main game, so the preference persists). */
  speed: MatchSpeed;
  onSetSpeed: (s: MatchSpeed) => void;
  /** Bank the finished run's collectibles to the sticker album (App owns the album).
   *  Omitted when the sticker feature is off. Called once per run at its end. */
  onRunEnd?: (xi: Player[], wonCup: boolean) => void;
}) {
  const [career, setCareer] = useState<CareerState>(loadCareer);
  const [run, setRun] = useState<RunState | null>(loadRun);
  const [reward, setReward] = useState<Reward | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // The just-finished knockout tie, kept on screen through the following boost pick.
  const [lastKoMatch, setLastKoMatch] = useState<{ match: KoMatch; opp: GroupTeam; roundName: string } | null>(null);
  // A transient toast for what a boost just did (so the run log isn't needed).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  // The boost-pick panel, scrolled into view when a run enters the boost phase.
  const boostRef = useRef<HTMLDivElement | null>(null);
  // The career hub collapses to a slim strip during a run (perks are a between-runs
  // thing); it always shows fully when there is no active run.
  const [hubOpen, setHubOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // Ladder navigation: which round the content area is showing. null = the live/current
  // round; a step index = reviewing that past round. `currentRoundIndex` is the live
  // round's step (group = 0, KO round r = r+1). A review snaps back to live whenever the
  // run advances to a new round.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const currentRoundIndex = run
    ? run.phase === 'group' || (run.phase === 'ended' && run.outcome === 'group')
      ? 0
      : run.koRound + 1
    : 0;
  useEffect(() => {
    setReviewIndex(null);
  }, [currentRoundIndex]);
  const reviewRecord: RoundRecord | undefined =
    run && reviewIndex !== null
      ? reviewIndex === 0
        ? (run.history ?? []).find((h) => h.stage === 'group')
        : (run.history ?? []).find((h) => h.stage === reviewIndex - 1)
      : undefined;

  // Persist the in-progress run (or clear it once there is none), so a refresh
  // mid-run resumes exactly where it left off.
  useEffect(() => {
    if (run) saveRun(run);
    else clearRun();
  }, [run]);

  // Bank the run's collectibles to the album once, when it ends. Reload-safe via the
  // persisted stickersApplied flag (so a refresh on the ended screen won't re-bank).
  useEffect(() => {
    if (!onRunEnd || !run || run.phase !== 'ended' || run.stickersApplied) return;
    onRunEnd(run.xi, run.outcome === 'champion');
    setRun({ ...run, stickersApplied: true });
  }, [run, onRunEnd]);

  const chem = useMemo(() => (run ? chemistryOf(run.xi) : 0), [run?.xi]);
  const odds = useMemo(
    () => (run ? simulateTitleOdds(run.xi, 600, chem).champion : 0),
    [run?.xi, chem],
  );
  const str = useMemo(
    () => (run ? xiStrength(run.xi) : { attack: 0, defense: 0, overall: 0 }),
    [run?.xi],
  );
  const userRating = str.overall + chem;

  // Follow the live feed down while a match is revealing.
  const { tailRef, rootRef } = useFollowBottom({ active: !!reveal });

  // When a run enters the boost phase, scroll the boost picker into view so the user
  // lands on it after a knockout tie (or the group table) without hunting for it.
  useEffect(() => {
    if (run?.phase !== 'boon') return;
    const el = boostRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [run?.phase]);

  const startRun = () => {
    if (!draftedXi) return;
    setReward(null);
    setReveal(null);
    setLastKoMatch(null);
    setReviewIndex(null);
    setRun(beginRun(draftedXi, career.unlocked));
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

  // Kick off the live reveal of the group stage / the pending knockout tie.
  const playGroup = () => {
    if (!run) return;
    const p = prepareGroupStage(run);
    if (p) setReveal({ kind: 'group', next: p.next, matches: p.userMatches, group: p.group, index: 0, done: false });
  };
  const playKo = () => {
    if (!run) return;
    const p = prepareKnockoutRound(run);
    if (p) setReveal({ kind: 'ko', next: p.next, match: p.match, opp: p.opp, roundName: p.roundName });
  };

  // A revealed match finished: advance the group reveal (or show its final table when
  // all three are done), or commit a knockout tie.
  const handleMatchEnd = () => {
    if (!reveal) return;
    if (reveal.kind === 'group') {
      if (reveal.index < reveal.matches.length - 1) setReveal({ ...reveal, index: reveal.index + 1 });
      else setReveal({ ...reveal, done: true }); // all three played -> show the table
    } else {
      // A knockout tie that leads to another boost: keep the finished card on screen
      // through the boost pick (auto-scrolled to below). A loss / the final commits
      // straight to the ended panel.
      setLastKoMatch(
        reveal.next.phase === 'boon'
          ? { match: reveal.match, opp: reveal.opp, roundName: reveal.roundName }
          : null,
      );
      advance(reveal.next);
      setReveal(null);
    }
  };
  // Commit the group after the standings overview (used on a group-stage exit, where
  // there is no boost to pick).
  const continueFromGroup = () => {
    if (reveal?.kind !== 'group') return;
    advance(reveal.next);
    setReveal(null);
  };

  // The first boost is picked right on the group-results screen (before entering the
  // knockouts): apply it, toast what it did, then commit straight into the Round of 16.
  const pickGroupBoost = (b: Boon) => {
    if (reveal?.kind !== 'group') return;
    const before = reveal.next.xi;
    const next = chooseBoon(reveal.next, b.id);
    const inP = next.xi.find((p) => !before.some((x) => x.id === p.id));
    const outP = before.find((p) => !next.xi.some((x) => x.id === p.id));
    showToast(inP && outP ? `${b.name}: ${inP.name} in for ${outP.name}` : `${b.name}: ${b.description}`);
    advance(next);
    setReveal(null);
  };

  // Pick a boost: apply it, clear the kept match, and toast what it did (roster swap
  // names the players; otherwise the boost's description) so the log isn't needed.
  const pickBoost = (b: Boon) => {
    if (!run) return;
    const before = run.xi;
    const next = chooseBoon(run, b.id);
    const inP = next.xi.find((p) => !before.some((x) => x.id === p.id));
    const outP = before.find((p) => !next.xi.some((x) => x.id === p.id));
    showToast(inP && outP ? `${b.name}: ${inP.name} in for ${outP.name}` : `${b.name}: ${b.description}`);
    setLastKoMatch(null);
    setRun(next);
  };

  const purchase = (perkId: string) => {
    const c = buyPerk(career, perkId);
    setCareer(c);
    saveCareer(c);
  };

  const prog = levelProgress(career.xp);
  const showHubBody = !run || hubOpen;
  const boostedIds = new Set(run?.boostedIds ?? []);

  return (
    <div ref={rootRef} className="mx-auto max-w-[1000px]">
      {/* Cup-win celebration: rains once when the run ends as champion. */}
      {run?.outcome === 'champion' && <Confetti />}

      {/* Boost toast: what the last pick did (roster swap names the players). */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <div className="pointer-events-auto max-w-[92vw] rounded-md border border-pitch-dark bg-ink px-4 py-2.5 text-center font-mono text-[12.5px] font-semibold text-ground shadow-hard">
            {toast}
          </div>
        </div>
      )}
      <Link
        to="/"
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-pitch"
      >
        <ArrowLeft size={13} strokeWidth={2.5} className="transition group-hover:-translate-x-0.5" />
        Back to game
      </Link>

      {/* Career hub - full between runs, a slim collapsible strip during a run. */}
      <section className="mb-4 mt-1 overflow-hidden rounded-md border border-line bg-panel shadow-hard">
        <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${showHubBody ? 'border-b border-line' : ''}`}>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[17px] font-extrabold tracking-[-0.01em]">Cup Run</span>
            <span className="rounded-full bg-chalk px-2 py-0.5 font-mono text-[11px] font-semibold text-pitch-dark">
              Level {career.level}
            </span>
            <span className="rounded-full bg-amber/[0.14] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#9a6512]">
              {career.prestige} Prestige
            </span>
          </div>
          {run && (
            <button
              onClick={() => setHubOpen((o) => !o)}
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-pitch"
            >
              {hubOpen ? 'Hide hub' : 'Career hub'}
              {hubOpen ? <ChevronUp size={13} strokeWidth={2.5} /> : <ChevronDown size={13} strokeWidth={2.5} />}
            </button>
          )}
        </div>

        {showHubBody && (
          <>
            <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="bg-panel p-4">
                <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Progress
                </div>
                <div className="h-[8px] overflow-hidden rounded-full border border-line bg-chalk">
                  <div className="h-full bg-pitch" style={{ width: `${(prog.into / prog.needed) * 100}%` }} />
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
                    <div className="mt-0.5 font-display text-[15px] font-extrabold leading-tight">{val}</div>
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
                        <span className="font-mono text-[11px] font-semibold text-amber">{perk.cost}</span>
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
          </>
        )}
      </section>

      {/* No active run: start with the drafted XI, or prompt to draft one. */}
      {!run &&
        (draftedXi ? (
          <div className="rounded-md border border-line bg-panel p-8 text-center shadow-hard">
            <p className="mb-4 text-[13.5px] text-muted">
              Take your drafted XI on a Cup Run. Pick a team boost between rounds; every run earns
              XP and Prestige for your career.
            </p>
            <button onClick={startRun} className={PRIMARY_BTN}>
              Start a Cup Run
            </button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center shadow-hard">
            <p className="mb-4 text-[13.5px] text-muted">
              Draft your XI first, then bring it here for a Cup Run.
            </p>
            <Link to="/" className={PRIMARY_BTN}>
              Draft your XI
            </Link>
          </div>
        ))}

      {/* Active run */}
      {run && (
        <>
          {/* Progress ladder: Group -> R16 -> QF -> SF -> Final -> Cup. Clicking a step
              switches the content area below to that round; the current step returns
              to the live view. Locked while a match is playing out. */}
          <div className="mb-4">
            <RunLadder
              run={run}
              currentIndex={currentRoundIndex}
              viewedIndex={reviewIndex ?? currentRoundIndex}
              onSelectStep={(i) => setReviewIndex(i === currentRoundIndex ? null : i)}
              locked={!!reveal}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
            {/* Your XI + active boosts */}
            <section className="self-start overflow-hidden rounded-md border border-line bg-panel shadow-hard">
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
                      className="flex items-center gap-2 border-b border-line px-4 py-1.5 last:border-b-0"
                    >
                      <span className="w-7 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-pitch">
                        {primaryPosition(p)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
                      {boostedIds.has(p.id) && (
                        <span className="shrink-0 rounded-[3px] bg-amber px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.04em] text-white">
                          Boost
                        </span>
                      )}
                      {sq && <Flag code={sq.code} className="h-3 w-[18px]" />}
                      <span className="w-6 shrink-0 text-right font-mono text-[14px] font-bold">{p.elo}</span>
                    </li>
                  );
                })}
              </ul>
              {run.activeBoons.length > 0 && (
                <div className="border-t border-line p-3">
                  <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Active boosts
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {run.activeBoons.map((id, i) => {
                      const b = boonById(id);
                      if (!b) return null;
                      return (
                        <span
                          key={`${id}-${i}`}
                          className="rounded-[4px] border border-l-[3px] border-line bg-white px-2 py-1 text-[11px] font-semibold"
                          style={{ borderLeftColor: RARITY_COLOR[b.rarity] }}
                        >
                          {b.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Run panel: the live/interactive round view, or a past round's review */}
            <section className="flex min-w-0 flex-col gap-4">
              {reviewRecord ? (
                <RoundReview record={reviewRecord} onBack={() => setReviewIndex(null)} />
              ) : (
                <>
              {run.phase !== 'ended' && (
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Speed
                  </span>
                  <div className="flex overflow-hidden rounded-[5px] border border-line">
                    {SPEEDS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => onSetSpeed(s.value)}
                        className={`border-l border-line px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition first:border-l-0 ${
                          speed === s.value ? 'bg-ink text-ground' : 'bg-white text-muted hover:text-ink'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {reveal ? (
                <div>
                  {reveal.kind === 'group' ? (
                    <>
                      {reveal.matches.map((m, i) => {
                        if (i > reveal.index) return null;
                        if (i === reveal.index && !reveal.done)
                          return (
                            <LiveCupMatch
                              key={i}
                              label={`Matchday ${i + 1}`}
                              opp={m.opp}
                              userRating={userRating}
                              events={m.result.events}
                              decided="reg"
                              speed={speed}
                              onEnd={handleMatchEnd}
                            />
                          );
                        return <GroupResultCard key={i} m={m} i={i} userRating={userRating} />;
                      })}
                      {reveal.done && (() => {
                        const advanced = reveal.next.phase !== 'ended';
                        const gr = reveal.next.history.find((h) => h.stage === 'group');
                        return (
                          <>
                            <div className="mt-6">
                              <RunBanner
                                tone={advanced ? 'win' : 'loss'}
                                eyebrow={
                                  gr
                                    ? `Group stage · finished ${ordinal(gr.groupPos ?? 0)} of ${gr.groupSize}`
                                    : 'Group stage'
                                }
                                heading={advanced ? 'Through to the knockouts' : 'Knocked out'}
                                body={advanced ? 'Pick your first boost, then into the Round of 16.' : undefined}
                              />
                            </div>
                            <div className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                              Final group table
                            </div>
                            <StandingsTable group={reveal.group} groupFinished advanced={advanced} />
                            {advanced && reveal.next.offer ? (
                              <div className="mt-4 rounded-md border border-line bg-panel p-5 shadow-hard">
                                <BoostOffer
                                  offer={reveal.next.offer}
                                  nextOpponent={reveal.next.nextOpponent}
                                  roundName={KO_ROUNDS[0]}
                                  onPick={pickGroupBoost}
                                />
                              </div>
                            ) : (
                              <div className="mt-4 flex justify-center">
                                <button onClick={continueFromGroup} className={PRIMARY_BTN}>
                                  Continue
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <LiveCupMatch
                      key="ko"
                      label={reveal.roundName}
                      opp={reveal.opp}
                      userRating={userRating}
                      events={reveal.match.events}
                      decided={reveal.match.decided}
                      pens={reveal.match.pens}
                      speed={speed}
                      onEnd={handleMatchEnd}
                    />
                  )}
                  <div ref={tailRef} aria-hidden className="h-0" />
                </div>
              ) : (
                <>
                {run.phase === 'boon' && lastKoMatch && (
                  <FinishedKoCard
                    roundName={lastKoMatch.roundName}
                    oppName={lastKoMatch.opp.name}
                    oppCode={lastKoMatch.opp.code}
                    oppYear={lastKoMatch.opp.year}
                    oppRating={lastKoMatch.opp.strength.overall}
                    userRating={userRating}
                    userGoals={lastKoMatch.match.userGoals}
                    oppGoals={lastKoMatch.match.oppGoals}
                    decided={lastKoMatch.match.decided}
                    events={lastKoMatch.match.events}
                    pens={lastKoMatch.match.pens}
                    userWon={lastKoMatch.match.userWon}
                  />
                )}
                {run.phase === 'boon' && lastKoMatch && (
                  <RunBanner
                    tone="win"
                    eyebrow={lastKoMatch.roundName}
                    heading={koWinHeading(lastKoMatch.match)}
                    body={`Through to the ${KO_ROUNDS[run.koRound]}. Pick a boost below.`}
                  />
                )}
                {run.phase === 'ended' && run.outcome && (
                  <RunBanner
                    tone={run.outcome === 'champion' ? 'win' : 'loss'}
                    eyebrow={
                      run.outcome === 'champion'
                        ? 'Full time · the Final'
                        : `Knocked out · ${OUTCOME_LABEL[run.outcome]}`
                    }
                    heading={run.outcome === 'champion' ? 'World Cup Champions' : 'Knocked out'}
                    body={
                      run.outcome === 'champion'
                        ? 'Your XI ran the tournament and lifted the cup.'
                        : undefined
                    }
                  />
                )}
                <div
                  ref={run.phase === 'boon' ? boostRef : undefined}
                  className="rounded-md border border-line bg-panel p-5 shadow-hard"
                >
                  {run.phase === 'group' && (
                    <div className="text-center">
                      <p className="mb-4 text-[13.5px] text-muted">
                        Play the group stage. Finish in the top two to reach the knockouts.
                      </p>
                      <button onClick={playGroup} className={PRIMARY_BTN}>
                        Play group stage
                      </button>
                    </div>
                  )}

                  {run.phase === 'boon' && run.offer && (
                    <BoostOffer
                      offer={run.offer}
                      nextOpponent={run.nextOpponent}
                      roundName={KO_ROUNDS[run.koRound]}
                      onPick={pickBoost}
                    />
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
                        <button onClick={playKo} className={PRIMARY_BTN}>
                          Play {KO_ROUNDS[run.koRound]}
                        </button>
                      </div>
                    </div>
                  )}

                  {run.phase === 'ended' && run.outcome && (
                    <div className="text-center">
                      <div className="font-display text-2xl font-black">Final score {run.score}</div>
                      {reward && (
                        <div className="mt-1.5 font-mono text-[12px] text-muted">
                          +{reward.xpGained} XP &middot;{' '}
                          <span className="text-amber">+{reward.prestigeGained} Prestige</span>
                          {reward.leveledUp && <span className="ml-2 font-bold text-pitch">Level up!</span>}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                        <button onClick={onReDraft} className={PRIMARY_BTN}>
                          Draft a new XI
                        </button>
                        <button
                          onClick={startRun}
                          className="rounded-md border border-line bg-white px-4 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                          Replay same XI
                        </button>
                        <button
                          onClick={() => {
                            setRun(null);
                            setReward(null);
                            setLastKoMatch(null);
                          }}
                          className="rounded-md border border-line bg-white px-4 py-3 font-display font-extrabold uppercase tracking-[0.02em] text-ink transition hover:border-pitch hover:text-pitch"
                        >
                          Career
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </>
              )}
              </>
            )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
