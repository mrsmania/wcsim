import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, Squad } from '../data/types';
import { xiStrength } from '../domain/match';
import { simulateTitleOdds } from '../domain/odds';
import { userRatingDelta, type Difficulty } from '../domain/difficulty';
import { ascensionAt, maxSelectableAscension, selectedAscension } from '../domain/ascension';
import type { MatchSpeed } from '../domain/clock';
import type { GroupTeam } from '../domain/tournament';
import { boonById, type Boon } from '../domain/boons';
import {
  beginRun,
  prepareGroupStage,
  prepareKnockoutRound,
  chooseBoon,
  resolveChoice,
  rerollOffer,
  chemistryOf,
  type RunState,
  type RunShape,
  type RunBuild,
  type KoMatch,
} from '../domain/run';
import {
  careerTopScorerId,
  levelProgress,
  type CareerState,
  type ChallengeInput,
  type RunReward,
} from '../domain/career';
import { consumeRunStart } from '../nav/pendingRun';
import { FEATURES } from '../config';
import { useFollowBottom } from '../hooks/useFollowBottom';
import { useToast } from '../hooks/useToast';
import { useRoundReview } from '../hooks/useRoundReview';
import { useCupRun } from '../hooks/useCupRun';
import { scrollIntoViewRespectingMotion } from '../hooks/motion';
import { CARD, SpeedControl, StageCrumb, StageHeader } from './matchUi';
import RunBracket from './cupRun/RunBracket';
import Confetti from './Confetti';
import LiveCupMatch from './cupRun/LiveCupMatch';
import RoundReview from './cupRun/RoundReview';
import CareerHub from './cupRun/CareerHub';
import RunXiPanel from './cupRun/RunXiPanel';
import PreRunPanel from './cupRun/PreRunPanel';
import GroupRevealPanel from './cupRun/GroupRevealPanel';
import RunPhasePanel from './cupRun/RunPhasePanel';
import GroupCell from './cupRun/GroupCell';
import type { Reward } from './cupRun/types';

/** Prototype of the Cup Run + the Manager Career meta-layer. Runs feed XP
 *  and Prestige into a persisted career; perks bought with Prestige feed back into
 *  the next run. The in-progress run persists to its own localStorage key, so a
 *  refresh mid-run resumes it; matches are revealed with the shared live clock; and
 *  the final XI's collectibles are banked to the sticker album via onRunEnd. */
export default function CupRunScreen({
  draftedXi,
  draftedShape,
  draftedBuild,
  onReDraft,
  speed,
  onSetSpeed,
  difficulty,
  pool,
  onRunEnd,
  onRunStart,
  banking,
  view,
  buildTo,
  showFullDraw,
  onSetShowFullDraw,
  career,
  buyPerk,
  unlockBoost,
  startRun,
  rememberAscension,
  bankRun,
  challengeInput,
}: {
  /** The XI drafted in the main game, or null if the XI is not complete yet. */
  draftedXi: Player[] | null;
  /** The shape that XI kicks off in, and how it was built: what the build page knows
   *  and the run cannot recover later, recorded onto the run for the challenge
   *  catalogue. Null alongside an incomplete XI, and "Replay same XI" reuses both. */
  draftedShape: RunShape | null;
  draftedBuild: RunBuild | null;
  /** Reset the draft and go draft a fresh XI (each run is a new team). */
  onReDraft: () => void;
  /** Match playback speed (shared with the main game, so the preference persists). */
  speed: MatchSpeed;
  onSetSpeed: (s: MatchSpeed) => void;
  /** Difficulty handicap applied to the user's matches + the odds readout. */
  difficulty: Difficulty;
  /** The squad pool (squad-pool setting): opponents + the odds sim draw from these. */
  pool: readonly Squad[];
  /** Bank the finished run's collectibles to the sticker album (App owns the album).
   *  Omitted when the sticker feature is off. Called once per run at its end, with the
   *  ids a roster boost brought in so they can be left out of the haul. */
  /** `cupPicks` is how many stickers a cup win may pick (Double Print grants two). */
  onRunEnd?: (xi: Player[], wonCup: boolean, boostedIds: string[], cupPicks?: number) => void;
  /** A new run is starting, so anything still pending from the last one is stale. */
  onRunStart?: () => void;
  /** The finished run's stickers are still saving: the run-end actions wait, so the
   *  haul is shown before the next run can begin. */
  banking: boolean;
  /** Which half of this screen to render. The tabs navigation gives the career hub and
   *  the live run separate routes (roadmap item 27, finding F4 - a shop and a step of
   *  play cannot be the same address), so App mounts this screen twice: `hub` for the
   *  Career tab (the hub alone) and `run` under Play (the run, no hub). The
   *  career state and the purchase handlers stay here either way, so the split is a
   *  render branch rather than a state lift.
   *
   *  There used to be a third value, `both`, for the era when one route served both, and
   *  it was the DEFAULT and documented as "the shipped behaviour" long after no caller
   *  could reach it. */
  view: 'hub' | 'run';
  /** Where "back to the build" goes. Always `/play`: there is one build route now. */
  buildTo: string;
  /** The bracket accordion: whether the full 16-team bracket shows, and the setter.
   *  A persisted preference (App owns it) rather than component state, so consulting the
   *  draw once does not have to be redone on every navigation back into the run. */
  showFullDraw: boolean;
  onSetShowFullDraw?: (open: boolean) => void;
  /** The career and the four things that change it (hooks/useCareer, owned by App so the
   *  build page prices the market off the same value this screen spends from). */
  career: CareerState;
  buyPerk: (perkId: string) => void;
  unlockBoost: (boonId: string) => void;
  startRun: (tier: number) => number;
  /** Remember the Ascension tier WITHOUT spending a start-boost grant: what the pre-run
   *  card's picker calls. `startRun` deals the grant and is the kickoff's alone. */
  rememberAscension: (tier: number) => void;
  bankRun: (run: RunState, challenges?: ChallengeInput, at?: number) => RunReward;
  /** What the challenge predicates need beyond the run and the career: dataset ratings,
   *  the album as it stands and the lifetime trade count. A function, not a value, so it
   *  is read at run END and reflects a haul banked earlier in the same session. */
  challengeInput: () => ChallengeInput;
}) {
  const diffDelta = userRatingDelta(difficulty);
  const CHALLENGES_ON = FEATURES.challenges;
  // The ended screen's Career action leaves for `/career`; everything else on this screen
  // that navigates does it with a `Link`.
  const navigate = useNavigate();
  const [reward, setReward] = useState<Reward | null>(null);
  // The run in flight and the reveal playing over it, with their two writes
  // (hooks/useCupRun). Seeded from the boot snapshot, which already drops a reveal with
  // no run behind it.
  const { run, setRun, reveal, setReveal } = useCupRun();
  // The just-finished knockout tie, kept on screen through the following boost pick.
  const [lastKoMatch, setLastKoMatch] = useState<{ match: KoMatch; opp: GroupTeam; roundName: string } | null>(null);
  // The group draw, shown once per group before the matchdays reveal.
  // Its own state rather than a field on the reveal: it is a one-shot dismissal, and the
  // matchdays must not start playing behind it.
  const [drawOpen, setDrawOpen] = useState(false);
  // A transient toast for what a boost just did (so the run log isn't needed).
  const { toast, showToast } = useToast();
  // The boost-pick panel, scrolled into view when a run enters the boost phase.
  const boostRef = useRef<HTMLDivElement | null>(null);
  // The Ascension tier for the next run. Chosen on the build page, which persists it as
  // the career's `lastAscension`; read here and clamped to what is currently selectable, so
  // a stale saved tier (a career that lost a level gate, or a save from another device)
  // cannot start a run above the ceiling.
  const chosenAscension = selectedAscension(career);

  // Which round the content column is showing, and which can be opened. 0 is the GROUP
  // and knockout round r is r + 1; null means the live round.
  const { reviewIndex, setReviewIndex, reviewableRounds, groupRecord, reviewRecord } =
    useRoundReview(run);

  // Bank the run's collectibles to the album once, when it ends. Reload-safe via the
  // persisted stickersApplied flag (so a refresh on the ended screen won't re-bank).
  useEffect(() => {
    if (!onRunEnd || !run || run.phase !== 'ended' || run.stickersApplied) return;
    onRunEnd(run.xi, run.outcome === 'champion', run.boostedIds, run.cupPicks ?? 1);
    setRun({ ...run, stickersApplied: true });
  }, [run, onRunEnd]);

  // The cup-win celebration is a MOMENT, not a property of the run. `run.outcome` stays
  // 'champion' until a new run is started, and this one component serves both `/cup-run`
  // and `/career`, so raining off the outcome alone fell again on every arrival at either
  // route and on every reload of the ended screen. It is fired by the TRANSITION instead:
  // the first outcome a mount sees was decided before it, and only a change to 'champion'
  // after that is a cup being won on screen. Cleared when the next run starts.
  const seenOutcome = useRef<RunState['outcome'] | undefined>(undefined);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    const outcome = run?.outcome ?? null;
    const before = seenOutcome.current;
    seenOutcome.current = outcome;
    if (before === undefined || before === outcome) return;
    setCelebrating(outcome === 'champion');
  }, [run?.outcome]);

  // The XI + Ascension to show: the live run, or - before it starts - a preview of the
  // drafted XI at the currently-chosen tier (B: the run only commits when "Play group
  // stage" is clicked, so the hub/ascension stay adjustable until then).
  const chosenAsc = chosenAscension;
  const activeXi = run?.xi ?? draftedXi ?? null;
  const activeAsc = run?.ascension ?? chosenAsc;

  const chem = useMemo(() => (activeXi ? chemistryOf(activeXi) : 0), [activeXi]);
  const odds = useMemo(
    () =>
      activeXi
        ? simulateTitleOdds(activeXi, 600, {
            chemistryBonus: chem,
            atkDefDelta: diffDelta + ascensionAt(activeAsc).userDelta,
            pool,
          })
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
    // The previous run's sticker haul may still be in flight; it belongs to that run,
    // not this one.
    onRunStart?.();
    const chosen = chosenAscension;
    // Remember the tier and SPEND any Youth Development grant an earlier run banked.
    const owed = startRun(chosen);
    const begun = beginRun(draftedXi, {
      perkLevels: career.perkLevels,
      unlockedBoons: career.unlockedBoons,
      ascension: chosen,
      kickoff: {
        shape: draftedShape ?? undefined,
        build: draftedBuild ?? undefined,
        careerTopScorerId: careerTopScorerId(career),
        bonusStartBoosts: owed,
      },
    });
    const p = prepareGroupStage(begun, diffDelta, pool);
    setReward(null);
    setLastKoMatch(null);
    setReviewIndex(null);
    // `p.current` is the run with the drawn group recorded on it, which is what makes the
    // group survive a reload: the reveal below is transient (and for an account never
    // persisted at all), so it cannot be the only place the draw lives.
    setRun(p?.current ?? begun);
    if (p) {
      setReveal({ kind: 'group', next: p.next, matches: p.userMatches, group: p.group, index: 0, done: false });
      // The draw comes first: the table and the matchdays stay behind it, so the group is
      // not spoiled before it is dismissed.
      setDrawOpen(true);
    }
  };

  // "Start run" lands here and the draw opens immediately: with the Ascension picked on
  // the build page there is nothing left for a pre-run screen to ask, so it is gone.
  //
  // It fires only when the navigation ASKED for a kickoff (`requestRunStart`). The first
  // version inferred it from "no run in progress", which is the same shape as a reload, a
  // Back navigation, a bookmark or a save that has not landed - and each of those then
  // drew a fresh group over the run that was there. Module state, not router state:
  // `location.state` survives a reload, which would put the bug straight back.
  //
  // **The request is read-and-cleared FIRST, before any test that can bail out.** An
  // unconsumed request is not spent, it is PARKED, and leaving one parked is a bug that
  // starts a cup on its own: pressing Start Run with a FINISHED run still in storage used
  // to skip this effect at `run` and land back on that run's ended screen (Start Run
  // looking broken), with the request still set - and the next thing to clear the run,
  // the ended screen's own Career button, then found a kickoff waiting and drew a fresh
  // group under `/cup-run`, one click after the cup was won. A request describes the
  // navigation that carried it and must never outlive it.
  //
  // What it does with one: a run still in FLIGHT is never clobbered, and an ENDED one is
  // replaced, because that is a finished story rather than something to carry on with -
  // `state/resume.ts` tells the front page's Continue exactly the same thing. The
  // `autoStarted` ref this used to carry goes with the reorder: the request is spent on
  // the first pass, so a second pass has nothing left to act on.
  useEffect(() => {
    if (view === 'hub') return;
    if (!consumeRunStart()) return;
    if (!draftedXi || (run && run.phase !== 'ended')) return;
    startAndPlayGroup();
    // startAndPlayGroup closes over state that is settled by the time this can fire; it is
    // deliberately not a dependency, or picking an Ascension would restart the run.
  }, [view, run, draftedXi]);

  // Step the run; award XP/Prestige exactly once when it ends.
  const advance = (next: RunState) => {
    if (next.phase === 'ended' && run && run.phase !== 'ended') {
      // The clock is passed in rather than read inside the domain, so `applyRunResult`
      // stays pure and the checks harness stays deterministic. It is the only thing the
      // run archive cannot work out for itself.
      const r = bankRun(next, CHALLENGES_ON ? challengeInput() : undefined, Date.now());
      setReward({
        xpGained: r.xpGained,
        prestigeGained: r.prestigeGained,
        leveledUp: r.leveledUp,
        ascensionMult: ascensionAt(next.ascension).rewardMult,
        challenges: r.challengesCompleted,
        challengePrestige: r.challengePrestige,
      });
    }
    setRun(next);
  };

  // Kick off the live reveal of the group stage / the pending knockout tie.
  const playGroup = () => {
    if (!run) return;
    const p = prepareGroupStage(run, diffDelta, pool);
    if (!p) return;
    // Records the group on the run the first time (identical object, so no write, once
    // it is already there). No draw modal here: this is either a group being replayed
    // after a reload, whose draw the player has already seen, or the classic chrome,
    // which never had one.
    setRun(p.current);
    setReveal({ kind: 'group', next: p.next, matches: p.userMatches, group: p.group, index: 0, done: false });
  };
  const playKo = () => {
    if (!run) return;
    const p = prepareKnockoutRound(run, diffDelta, pool);
    if (!p) return;
    // Records the round's decisions on the run before a ball is kicked, so a reload
    // replays this tie rather than rolling a new one (identical object, and so no write,
    // when they are already there).
    setRun(p.current);
    setReveal({ kind: 'ko', next: p.next, match: p.match, opp: p.opp, roundName: p.roundName });
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
    // A card that asks a question has not done anything yet - it is parked waiting for the
    // answer - so there is nothing to announce. Committing still matters: it moves the
    // parked choice onto the run, which is what makes the picker survive a reload (and,
    // from the group-results screen, what gets the player onto the run screen to answer).
    if (!next.pendingChoice) {
      showToast(
        swappedIn && swappedOut
          ? `${b.name}: ${swappedIn.name} in for ${swappedOut.name}`
          : `${b.name}: ${b.description}`,
      );
    }
    commit(next);
  };

  // Answer a card that asked a question (The Armband). Only reachable while the run holds
  // a `pendingChoice`, which is also what the picker renders from.
  const answerChoice = (playerId: string) => {
    if (!run?.pendingChoice) return;
    const boon = boonById(run.pendingChoice.boonId);
    const { next } = resolveChoice(run, playerId);
    const named = run.xi.find((p) => p.id === playerId);
    if (boon && named) showToast(`${boon.name}: ${named.name} takes the armband`);
    setLastKoMatch(null);
    setRun(next);
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

  const prog = levelProgress(career.xp);
  const boostedIds = new Set(run?.boostedIds ?? []);

  // The career hub, which is the Career TAB and nothing else: the run view below never
  // mounts it (a shop and a step of play are not the same address), which is why it no
  // longer takes a collapsed state or a toggle.
  const hubOnly = view === 'hub';
  const hub = (
    <CareerHub
      career={career}
      prog={prog}
      onPurchase={buyPerk}
      onUnlockBoost={unlockBoost}
    />
  );

  // The final knockout tie of an ended run (the loss, or the won final), rebuilt from
  // history so the ended screen still shows the opponent + scoreline - the live
  // `lastKoMatch` is cleared when a run ends. Null for a group-stage exit (no KO tie).
  const lastRecord = run && run.history.length ? run.history[run.history.length - 1] : undefined;
  // The narrowing is kept, not discarded on assignment: the old `typeof stage === 'number'`
  // test proved this was a knockout record and then threw the proof away, so every read
  // below paid a `??` fallback that could not fire (hygiene H70).
  const endedKoRecord =
    run?.phase === 'ended' && lastRecord && lastRecord.stage !== 'group' ? lastRecord : null;

  return (
    <div ref={rootRef}>
      {/* Cup-win celebration: rains once, at the moment the final is won. */}
      {celebrating && <Confetti />}

      {/* Boost toast: what the last pick did (roster swap names the players). */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <div className="pointer-events-auto max-w-[92vw] rounded-md border border-pitch-dark bg-ink px-4 py-2.5 text-center font-mono text-[12.5px] font-semibold text-ground shadow-hard">
            {toast}
          </div>
        </div>
      )}
      {view === 'hub' ? (
        // The Career tab is a destination, so it gets the same eyebrow + title header
        // every other one has. The run view keeps the back crumb instead: it is a step
        // of play reached from the build, not a place you navigate to.
        <StageHeader eyebrow="Your career" title="Cup Run Career" />
      ) : (
        <StageCrumb dir="back" label="Back to the build" to={buildTo} className="mt-[30px]" />
      )}

      {/* The career hub: the standing, the perk shop and the boost library, one card
          each. Its own page in the tabs navigation - the run below never shows it. */}
      {hubOnly && hub}

      {/* Pre-run: the drafted XI with one "Play group stage" button, or a pointer back
          to the build when there is no XI (cupRun/PreRunPanel). Both are fallbacks: a
          kickoff goes straight into the draw, so this is what arriving WITHOUT one gets. */}
      {!hubOnly && !run && (
        <PreRunPanel
          xi={draftedXi}
          odds={odds}
          str={str}
          onPlay={startAndPlayGroup}
          buildTo={buildTo}
          ascension={{
            tier: chosenAscension,
            max: maxSelectableAscension(career.ascension, career.level),
            onSelect: rememberAscension,
          }}
        />
      )}

      {/* Active run */}
      {!hubOnly && run && (
        <>
          {/* There was a progress ladder here (Group -> R16 -> ... -> Cup). It went with
              the second chrome: the group table and the bracket already say which round
              this is and how the earlier ones went. Its round-review side survived the
              move whole - the bracket's own played cells open the same `RoundReview`
              below, and the GROUP leads that path as its own cell (`GroupCell`), so every
              round the run has played has a way back into its review. */}
          {run.ascension > 0 && (
            <div className="mb-4 flex justify-center">
              <span className="rounded-full border border-amber/40 bg-amber/[0.12] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-amber-ink">
                {ascensionAt(run.ascension).label} &middot; rewards x{ascensionAt(run.ascension).rewardMult}
              </span>
            </div>
          )}

          {/* The knockouts play out on the tree (roadmap item 28, option A), collapsed to
              the user's own path with the full 16-team bracket behind a chevron: the tree is
              the right thing to look at between rounds and too tall to sit above every
              screen of a run. Full width rather than inside the content column, because a
              16-team tree squeezed beside the XI panel scrolls sideways. Absent during the
              group (nothing to seed it from until the group is survived) and on any run
              begun without one. Hidden while reviewing a past round. */}
          {run.bracket && reviewIndex === null && (
            <div className="mb-4">
              <RunBracket
                bracket={run.bracket}
                open={showFullDraw}
                onSetOpen={(o) => onSetShowFullDraw?.(o)}
                // A played cell opens that round's review, which is what the ladder's
                // steps used to do. Locked while a match is revealing, as the ladder was:
                // the live playback is not persisted, so leaving the screen loses it.
                reviewableRounds={reveal ? [] : reviewableRounds}
                onOpenReview={(r) => setReviewIndex(r + 1)}
                // The group leads the path. Index 0 is its review, which is the whole
                // reason `reviewIndex === 0` exists.
                groupRecord={groupRecord}
                onOpenGroupReview={reveal ? undefined : () => setReviewIndex(0)}
              />
            </div>
          )}

          {/* A group EXIT has no bracket to lead, and the run ends there - so without this
              the group's summary goes unreachable again the moment you navigate away from
              the results screen and back. Same cell, mounted on its own. */}
          {!run.bracket && groupRecord && reviewIndex === null && (
            <div className={`mb-4 ${CARD} p-4`}>
              <GroupCell
                record={groupRecord}
                onOpenReview={reveal ? undefined : () => setReviewIndex(0)}
              />
            </div>
          )}

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
                  {/* No speed control on the group screen: the group is one continuous
                      reveal you sit through, and the table plus three cards below already
                      fill it. It returns for the knockouts, where each round is its own
                      screen and its own decision to start. */}
                  {run.phase !== 'ended' && run.phase !== 'group' && (
                    <div className="flex items-center justify-end gap-2">
                      <SpeedControl speed={speed} onSetSpeed={onSetSpeed} />
                    </div>
                  )}

                  {reveal ? (
                    <div>
                      {reveal.kind === 'group' ? (
                        <GroupRevealPanel
                          reveal={reveal}
                          drawOpen={drawOpen}
                          onDismissDraw={() => setDrawOpen(false)}
                          userRating={userRating}
                          speed={speed}
                          onMatchEnd={handleMatchEnd}
                          onPickBoost={pickGroupBoost}
                          onReroll={(next) => setReveal({ ...reveal, next: rerollOffer(next) })}
                          onContinue={continueFromGroup}
                        />
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
                    <RunPhasePanel
                      run={run}
                      lastKoMatch={lastKoMatch}
                      endedKoRecord={endedKoRecord}
                      userRating={userRating}
                      reward={reward}
                      banking={banking}
                      boostRef={boostRef}
                      onPlayGroup={playGroup}
                      onPlayKo={playKo}
                      onPickBoost={pickBoost}
                      onAnswerChoice={answerChoice}
                      onReroll={(next) => setRun(rerollOffer(next))}
                      onReDraft={onReDraft}
                      onReplay={startAndPlayGroup}
                      // Career is a DESTINATION, and this button predates the chrome
                      // that made it one: it cleared the run in place, back when
                      // `/cup-run` with no run WAS the hub. It is not any more, so
                      // clearing alone dropped the player onto the pre-run card for a
                      // fresh cup - which is the opposite of what the button says. Clear
                      // the finished run, then actually go to the career.
                      onCareer={() => {
                        setRun(null);
                        setReward(null);
                        setLastKoMatch(null);
                        navigate('/career');
                      }}
                    />
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
