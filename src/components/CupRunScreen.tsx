import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Player, Squad } from '../data/types';
import { xiStrength } from '../domain/match';
import { simulateTitleOdds } from '../domain/odds';
import { userRatingDelta, type Difficulty } from '../domain/difficulty';
import { KO_ROUNDS } from '../domain/knockout';
import {
  ASCENSIONS,
  ascensionAt,
  maxSelectableAscension,
} from '../domain/ascension';
import type { MatchSpeed } from '../domain/clock';
import type { GroupTeam } from '../domain/tournament';
import { type Boon } from '../domain/boons';
import {
  beginRun,
  prepareGroupStage,
  prepareKnockoutRound,
  chooseBoon,
  chemistryOf,
  type RunState,
  type KoMatch,
  type RoundRecord,
} from '../domain/run';
import {
  applyRunResult,
  buyPerkTier,
  unlockBoon,
  levelProgress,
  type CareerState,
} from '../domain/career';
import { loadCareer, saveCareer } from '../state/careerStorage';
import { loadRun, saveRun, clearRun, loadReveal, saveReveal, clearReveal } from '../state/runStorage';
import { useFollowBottom } from '../hooks/useFollowBottom';
import { scrollIntoViewRespectingMotion } from '../hooks/motion';
import {
  Banner,
  ordinal,
  PRIMARY_BTN,
  SpeedControl,
  StageCrumb,
} from './matchUi';
import StandingsTable from './StandingsTable';
import RunLadder from './RunLadder';
import Confetti from './Confetti';
import Flag from './Flag';
import LiveCupMatch from './cupRun/LiveCupMatch';
import GroupResultCard from './cupRun/GroupResultCard';
import FinishedKoCard from './cupRun/FinishedKoCard';
import RoundReview from './cupRun/RoundReview';
import BoostOffer from './cupRun/BoostOffer';
import CareerHub from './cupRun/CareerHub';
import RunXiPanel from './cupRun/RunXiPanel';
import RunEndPanel from './cupRun/RunEndPanel';
import { OUTCOME_LABEL, koWinHeading, type Reveal, type Reward } from './cupRun/types';

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
  difficulty,
  pool,
  onRunEnd,
}: {
  /** The XI drafted in the main game, or null if the XI is not complete yet. */
  draftedXi: Player[] | null;
  /** Reset the draft and go draft a fresh XI (each run is a new team). */
  onReDraft: () => void;
  /** Match playback speed (shared with the main game, so the preference persists). */
  speed: MatchSpeed;
  onSetSpeed: (s: MatchSpeed) => void;
  /** Difficulty handicap applied to the user's matches + the odds readout. */
  difficulty: Difficulty;
  /** The squad pool (squad-pool setting): opponents + the odds sim draw from these. */
  pool: Squad[];
  /** Bank the finished run's collectibles to the sticker album (App owns the album).
   *  Omitted when the sticker feature is off. Called once per run at its end. */
  onRunEnd?: (xi: Player[], wonCup: boolean) => void;
}) {
  const diffDelta = userRatingDelta(difficulty);
  const [career, setCareer] = useState<CareerState>(loadCareer);
  const [run, setRun] = useState<RunState | null>(loadRun);
  const [reward, setReward] = useState<Reward | null>(null);
  // Restore an in-flight reveal (only when a run exists, so a stale one is ignored),
  // so leaving mid-match resumes the current round rather than replaying it.
  const [reveal, setReveal] = useState<Reveal | null>(() => (loadRun() ? loadReveal() : null));
  // The just-finished knockout tie, kept on screen through the following boost pick.
  const [lastKoMatch, setLastKoMatch] = useState<{ match: KoMatch; opp: GroupTeam; roundName: string } | null>(null);
  // A transient toast for what a boost just did (so the run log isn't needed).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  // The boost-pick panel, scrolled into view when a run enters the boost phase.
  const boostRef = useRef<HTMLDivElement | null>(null);
  // The career hub is open before a run and collapses to a slim strip once one starts
  // (perks are a between-runs thing). The Hide/Career-hub toggle is always available, so
  // the user can override either way (see the run-presence effect below).
  const [hubOpen, setHubOpen] = useState(true);
  // The Ascension tier chosen for the next run. Defaults to the last tier the player
  // chose (persisted on the career), falling back to the highest selectable the first
  // time; always clamped to what is currently selectable.
  const maxAsc = maxSelectableAscension(career.ascension, career.level);
  const [ascSel, setAscSel] = useState(() => Math.min(career.lastAscension ?? maxAsc, maxAsc));
  useEffect(() => {
    setAscSel((s) => Math.min(s, maxAsc));
  }, [maxAsc]);

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

  // Persist the in-flight reveal alongside the run, so leaving mid-match resumes the
  // current round instead of replaying it. Cleared when the reveal ends (setReveal(null)).
  useEffect(() => {
    if (reveal) saveReveal(reveal);
    else clearReveal();
  }, [reveal]);

  // Default the hub open before a run and collapsed once one starts; only fires when the
  // run presence flips, so a manual toggle sticks until then.
  const hasRun = !!run;
  useEffect(() => {
    setHubOpen(!hasRun);
  }, [hasRun]);

  // Bank the run's collectibles to the album once, when it ends. Reload-safe via the
  // persisted stickersApplied flag (so a refresh on the ended screen won't re-bank).
  useEffect(() => {
    if (!onRunEnd || !run || run.phase !== 'ended' || run.stickersApplied) return;
    onRunEnd(run.xi, run.outcome === 'champion');
    setRun({ ...run, stickersApplied: true });
  }, [run, onRunEnd]);

  // The XI + Ascension to show: the live run, or - before it starts - a preview of the
  // drafted XI at the currently-chosen tier (B: the run only commits when "Play group
  // stage" is clicked, so the hub/ascension stay adjustable until then).
  const chosenAsc = Math.min(ascSel, maxAsc);
  const activeXi = run?.xi ?? draftedXi ?? null;
  const activeAsc = run?.ascension ?? chosenAsc;
  const previewRun: RunState | null =
    !run && draftedXi
      ? {
          xi: draftedXi,
          phase: 'group',
          koRound: 0,
          facedIds: [],
          activeBoons: [],
          perkLevels: career.perkLevels,
          unlockedBoons: career.unlockedBoons,
          ascension: chosenAsc,
          offer: null,
          nextOpponent: null,
          score: 0,
          outcome: null,
          history: [],
          boostedIds: [],
          stickersApplied: false,
        }
      : null;

  const chem = useMemo(() => (activeXi ? chemistryOf(activeXi) : 0), [activeXi]);
  const odds = useMemo(
    () =>
      activeXi
        ? simulateTitleOdds(activeXi, 600, chem, diffDelta + ascensionAt(activeAsc).userDelta, pool)
            .champion
        : 0,
    [activeXi, activeAsc, chem, diffDelta, pool],
  );
  const str = useMemo(
    () => (activeXi ? xiStrength(activeXi) : { attack: 0, defense: 0, overall: 0 }),
    [activeXi],
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
    scrollIntoViewRespectingMotion(el, 'center');
  }, [run?.phase]);

  // Commit the run at the chosen Ascension AND reveal the group in one step (B: no
  // separate "start" screen - the run only begins here, so perks/ascension picked in
  // the hub above still apply). Remembers the chosen tier as the next run's default.
  const startAndPlayGroup = () => {
    if (!draftedXi) return;
    const chosen = Math.min(ascSel, maxAsc);
    if (career.lastAscension !== chosen) {
      const c = { ...career, lastAscension: chosen };
      setCareer(c);
      saveCareer(c);
    }
    const begun = beginRun(draftedXi, career.perkLevels, career.unlockedBoons, chosen);
    const p = prepareGroupStage(begun, diffDelta, pool);
    setReward(null);
    setLastKoMatch(null);
    setReviewIndex(null);
    setRun(begun);
    if (p) {
      setReveal({ kind: 'group', next: p.next, matches: p.userMatches, group: p.group, index: 0, done: false });
    }
  };

  // Step the run; award XP/Prestige exactly once when it ends.
  const advance = (next: RunState) => {
    if (next.phase === 'ended' && run && run.phase !== 'ended') {
      const r = applyRunResult(career, next);
      setCareer(r.career);
      saveCareer(r.career);
      setReward({
        xpGained: r.xpGained,
        prestigeGained: r.prestigeGained,
        leveledUp: r.leveledUp,
        ascensionMult: ascensionAt(next.ascension).rewardMult,
      });
    }
    setRun(next);
  };

  // Kick off the live reveal of the group stage / the pending knockout tie.
  const playGroup = () => {
    if (!run) return;
    const p = prepareGroupStage(run, diffDelta, pool);
    if (p) setReveal({ kind: 'group', next: p.next, matches: p.userMatches, group: p.group, index: 0, done: false });
  };
  const playKo = () => {
    if (!run) return;
    const p = prepareKnockoutRound(run, diffDelta, pool);
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

  // Apply a boost to `base`, toast what it did (roster swap names the players in/out
  // from the domain-provided swap; otherwise the boost's description), then hand the
  // committed next state to `commit`. Shared by the group-results and between-rounds
  // pickers, which only differ in the source state and how they commit it.
  const applyBoost = (base: RunState, b: Boon, commit: (next: RunState) => void) => {
    const { next, swappedIn, swappedOut } = chooseBoon(base, b.id);
    showToast(
      swappedIn && swappedOut
        ? `${b.name}: ${swappedIn.name} in for ${swappedOut.name}`
        : `${b.name}: ${b.description}`,
    );
    commit(next);
  };

  // The first boost is picked right on the group-results screen (before entering the
  // knockouts): apply it, then commit straight into the Round of 16.
  const pickGroupBoost = (b: Boon) => {
    if (reveal?.kind !== 'group') return;
    applyBoost(reveal.next, b, (next) => {
      advance(next);
      setReveal(null);
    });
  };

  // Pick a boost between knockout rounds: apply it and clear the kept match.
  const pickBoost = (b: Boon) => {
    if (!run) return;
    applyBoost(run, b, (next) => {
      setLastKoMatch(null);
      setRun(next);
    });
  };

  const purchase = (perkId: string) => {
    const c = buyPerkTier(career, perkId);
    setCareer(c);
    saveCareer(c);
  };

  const unlockBoost = (boonId: string) => {
    const c = unlockBoon(career, boonId);
    setCareer(c);
    saveCareer(c);
  };

  const prog = levelProgress(career.xp);
  const showHubBody = hubOpen;
  const boostedIds = new Set(run?.boostedIds ?? []);

  // The career hub element. On the pre-run screen it renders BELOW the preview so the
  // "Play group stage" button stays visible; for an active run / no XI it sits on top.
  const hub = (
    <CareerHub
      career={career}
      prog={prog}
      hubOpen={hubOpen}
      onToggleHub={() => setHubOpen((o) => !o)}
      showBody={showHubBody}
      showToggle
      onPurchase={purchase}
      onUnlockBoost={unlockBoost}
    />
  );

  // Ascension selector (pre-run): the chosen tier and the requirement to unlock the
  // next one (a cup at the tier below + the career level gate).
  const selAsc = ascensionAt(Math.min(ascSel, maxAsc));
  const nextAsc = ASCENSIONS[maxAsc + 1];
  const nextAscHint = nextAsc
    ? [
        career.ascension < nextAsc.tier ? `win a ${ascensionAt(maxAsc).label} cup` : null,
        career.level < nextAsc.levelReq ? `reach level ${nextAsc.levelReq}` : null,
      ].filter(Boolean)
    : [];

  // The final knockout tie of an ended run (the loss, or the won final), rebuilt from
  // history so the ended screen still shows the opponent + scoreline - the live
  // `lastKoMatch` is cleared when a run ends. Null for a group-stage exit (no KO tie).
  const lastRecord = run && run.history.length ? run.history[run.history.length - 1] : undefined;
  const endedKoRecord =
    run?.phase === 'ended' && lastRecord && typeof lastRecord.stage === 'number' && lastRecord.events
      ? lastRecord
      : null;

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
      <StageCrumb dir="back" label="Back to the build" to="/career-mode" className="mt-7" />

      {/* Career hub - open above the content; a slim strip during an active run. */}
      {hub}

      {/* Pre-run: land straight on the run layout (the ladder, the XI, the Ascension
          picker) with the hub open below; one "Play group stage" both starts the run and
          reveals the group. No separate "Start a Cup Run" step. */}
      {previewRun && (
        <>
          <div className="mb-4">
            <RunLadder
              run={previewRun}
              currentIndex={0}
              viewedIndex={0}
              onSelectStep={() => {}}
              locked={false}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
            <RunXiPanel
              xi={previewRun.xi}
              score={0}
              activeBoons={[]}
              boostedIds={boostedIds}
              odds={odds}
              str={str}
            />
            <section className="flex min-w-0 flex-col gap-4">
              <div className="rounded-md border border-line bg-panel p-5 shadow-hard">
                {/* Ascension selector: a harder run for a bigger reward. */}
                <div className="mx-auto max-w-[380px] rounded-md border border-line bg-chalk p-3">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Ascension
                  </div>
                  <div className="mt-1.5 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      aria-label="Lower Ascension"
                      disabled={ascSel <= 0}
                      onClick={() => setAscSel((s) => Math.max(0, s - 1))}
                      className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel font-mono text-[15px] font-bold text-ink transition enabled:hover:border-pitch disabled:opacity-30"
                    >
                      &minus;
                    </button>
                    <div className="min-w-[150px]">
                      <div className="font-display text-[15px] font-extrabold leading-tight">
                        {selAsc.label}
                      </div>
                      <div className="font-mono text-[11px] text-muted">
                        {selAsc.tier === 0
                          ? 'Standard difficulty'
                          : `You ${selAsc.userDelta} rating, rewards x${selAsc.rewardMult}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Higher Ascension"
                      disabled={ascSel >= maxAsc}
                      onClick={() => setAscSel((s) => Math.min(maxAsc, s + 1))}
                      className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel font-mono text-[15px] font-bold text-ink transition enabled:hover:border-pitch disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  {nextAscHint.length > 0 && (
                    <div className="mt-2 font-mono text-[10px] leading-snug text-muted">
                      Unlock {nextAsc.label}: {nextAscHint.join(' and ')}
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <p className="mb-4 text-[13.5px] text-muted">
                    Pick a team boost between rounds; every run earns XP and Prestige. Finish top
                    two in the group to reach the knockouts.
                  </p>
                  <button onClick={startAndPlayGroup} className={PRIMARY_BTN}>
                    Play group stage
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
      {!run && !draftedXi && (
        <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center shadow-hard">
          <p className="mb-4 text-[13.5px] text-muted">
            Draft your XI first, then bring it here for a Cup Run.
          </p>
          <Link to="/career-mode" className={PRIMARY_BTN}>
            Draft your XI
          </Link>
        </div>
      )}

      {/* Active run */}
      {run && (
        <>
          {/* Progress ladder: Group -> R16 -> QF -> SF -> Final -> Cup. Clicking a step
              switches the content area below to that round; the current step returns
              to the live view. Locked while a match is playing out. */}
          <div className="mb-4">
            {run.ascension > 0 && (
              <div className="mb-2 flex justify-center">
                <span className="rounded-full border border-amber/40 bg-amber/[0.12] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a6512]">
                  {ascensionAt(run.ascension).label} &middot; rewards x{ascensionAt(run.ascension).rewardMult}
                </span>
              </div>
            )}
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
            <RunXiPanel
              xi={run.xi}
              score={run.score}
              activeBoons={run.activeBoons}
              boostedIds={boostedIds}
              odds={odds}
              str={str}
            />

            {/* Run panel: the live/interactive round view, or a past round's review */}
            <section className="flex min-w-0 flex-col gap-4">
              {reviewRecord ? (
                <RoundReview record={reviewRecord} onBack={() => setReviewIndex(null)} />
              ) : (
                <>
              {run.phase !== 'ended' && (
                <div className="flex items-center justify-end gap-2">
                  <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
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
                              <Banner
                                champion={advanced}
                                size="sm"
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
                  <Banner
                    champion
                    size="sm"
                    eyebrow={lastKoMatch.roundName}
                    heading={koWinHeading(lastKoMatch.match)}
                    body={`Through to the ${KO_ROUNDS[run.koRound]}. Pick a boost below.`}
                  />
                )}
                {run.phase === 'ended' && endedKoRecord && (
                  <FinishedKoCard
                    roundName={KO_ROUNDS[endedKoRecord.stage as number]}
                    oppName={endedKoRecord.oppName ?? ''}
                    oppCode={endedKoRecord.oppCode ?? ''}
                    oppYear={endedKoRecord.oppYear}
                    oppRating={endedKoRecord.oppRating}
                    userRating={endedKoRecord.userRating ?? 0}
                    userGoals={endedKoRecord.userGoals ?? 0}
                    oppGoals={endedKoRecord.oppGoals ?? 0}
                    decided={endedKoRecord.decided ?? 'reg'}
                    events={endedKoRecord.events ?? []}
                    pens={endedKoRecord.pens}
                    userWon={endedKoRecord.won}
                  />
                )}
                {run.phase === 'ended' && run.outcome && (
                  <Banner
                    champion={run.outcome === 'champion'}
                    size="sm"
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
                    <RunEndPanel
                      score={run.score}
                      reward={reward}
                      onReDraft={onReDraft}
                      onReplay={startAndPlayGroup}
                      onCareer={() => {
                        setRun(null);
                        setReward(null);
                        setLastKoMatch(null);
                      }}
                    />
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
