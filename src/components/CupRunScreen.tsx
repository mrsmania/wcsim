import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Player, Squad } from '../data/types';
import { xiStrength } from '../domain/match';
import { simulateTitleOdds } from '../domain/odds';
import { userRatingDelta, type Difficulty } from '../domain/difficulty';
import { KO_ROUNDS } from '../domain/knockout';
import { ascensionAt, maxSelectableAscension } from '../domain/ascension';
import type { MatchSpeed } from '../domain/clock';
import { groupAsOf, GROUP_MATCHDAYS, type GroupTeam } from '../domain/tournament';
import { type Boon } from '../domain/boons';
import {
  beginRun,
  prepareGroupStage,
  prepareKnockoutRound,
  chooseBoon,
  rerollOffer,
  chemistryOf,
  type RunState,
  type RunShape,
  type RunBuild,
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
import { store } from '../state/store';
import { consumeRunStart } from '../nav/pendingRun';
import { basePlayer } from '../data/squads';
import { FEATURES } from '../config';
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
import GroupDrawReveal from './GroupDrawReveal';
import RunBracket from './cupRun/RunBracket';
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
  draftedShape,
  draftedBuild,
  onReDraft,
  speed,
  onSetSpeed,
  difficulty,
  pool,
  onRunEnd,
  onRunStart,
  banking = false,
  view = 'both',
  buildTo = '/career-mode',
  showFullDraw = false,
  onSetShowFullDraw,
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
  pool: Squad[];
  /** Bank the finished run's collectibles to the sticker album (App owns the album).
   *  Omitted when the sticker feature is off. Called once per run at its end, with the
   *  ids a roster boost brought in so they can be left out of the haul. */
  onRunEnd?: (xi: Player[], wonCup: boolean, boostedIds: string[]) => void;
  /** A new run is starting, so anything still pending from the last one is stale. */
  onRunStart?: () => void;
  /** The finished run's stickers are still saving: the run-end actions wait, so the
   *  haul is shown before the next run can begin. */
  banking?: boolean;
  /** Which half of this screen to render. `both` is the shipped behaviour: the career
   *  hub and the live run share one route, with the hub collapsing to a strip mid-run.
   *  The tabs navigation splits them (roadmap item 27, finding F4 - a shop and a step of
   *  play cannot be the same address), so it mounts this screen twice: `hub` for the
   *  Career tab (hub only, always open) and `run` under Play (the run, no hub). The
   *  career state and the purchase handlers stay here either way, so the split is a
   *  render branch rather than a state lift. */
  view?: 'both' | 'hub' | 'run';
  /** Where "back to the build" goes (the route differs between the two navigations). */
  buildTo?: string;
  /** The bracket's "Your path" accordion: whether the full draw shows, and the setter.
   *  A persisted preference (App owns it) rather than component state, so consulting the
   *  draw once does not have to be redone on every navigation back into the run. */
  showFullDraw?: boolean;
  onSetShowFullDraw?: (open: boolean) => void;
}) {
  const diffDelta = userRatingDelta(difficulty);
  const CHALLENGES_ON = FEATURES.challenges;
  const [career, setCareer] = useState<CareerState>(() => store.peek().career);
  const [run, setRun] = useState<RunState | null>(() => store.peek().run);
  const [reward, setReward] = useState<Reward | null>(null);
  // Restore an in-flight reveal, so leaving mid-match resumes the current round rather
  // than replaying it. The store already drops a reveal with no run behind it.
  const [reveal, setReveal] = useState<Reveal | null>(() => store.peek().reveal);
  // The just-finished knockout tie, kept on screen through the following boost pick.
  const [lastKoMatch, setLastKoMatch] = useState<{ match: KoMatch; opp: GroupTeam; roundName: string } | null>(null);
  // The group draw, shown once per group before the matchdays reveal.
  // Its own state rather than a field on the reveal: it is a one-shot dismissal, and the
  // matchdays must not start playing behind it.
  const [drawOpen, setDrawOpen] = useState(false);
  // A transient toast for what a boost just did (so the run log isn't needed).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  // The boost-pick panel, scrolled into view when a run enters the boost phase.
  const boostRef = useRef<HTMLDivElement | null>(null);
  // The career hub starts collapsed to a slim strip (so the Play CTA is visible without
  // scrolling); the whole-bar toggle opens it to shop perks. It re-collapses when a run
  // starts so the match reveal is not hidden (see the run-presence effect below).
  const [hubOpen, setHubOpen] = useState(false);
  // The Ascension tier for the next run. Chosen on the build page, which persists it as
  // the career's `lastAscension`; read here and clamped to what is currently selectable, so
  // a stale saved tier (a career that lost a level gate, or a save from another device)
  // cannot start a run above the ceiling.
  const maxAsc = maxSelectableAscension(career.ascension, career.level);
  const chosenAscension = Math.min(career.lastAscension ?? maxAsc, maxAsc);

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
  // KO rounds the tree can open a review for: exactly those with a history record.
  // A record is written when the round is played, and `koRound` advances in the same
  // breath, so the live round never has one - except on an ended run, where the review
  // of the last tie is worth having (the content column is the end panel by then).
  const reviewableRounds = useMemo(
    () =>
      (run?.history ?? [])
        .map((h) => h.stage)
        .filter((st): st is number => typeof st === 'number'),
    [run?.history],
  );
  const reviewRecord: RoundRecord | undefined =
    run && reviewIndex !== null
      ? reviewIndex === 0
        ? (run.history ?? []).find((h) => h.stage === 'group')
        : (run.history ?? []).find((h) => h.stage === reviewIndex - 1)
      : undefined;

  // Persist the in-progress run (or clear it once there is none), so a refresh
  // mid-run resumes exactly where it left off.
  useEffect(() => {
    void store.saveRun(run);
  }, [run]);

  // Persist the in-flight reveal alongside the run, so leaving mid-match resumes the
  // current round instead of replaying it. Cleared when the reveal ends (setReveal(null)).
  useEffect(() => {
    void store.saveReveal(reveal);
  }, [reveal]);

  // Collapse the hub whenever a run starts (so the match reveal is not buried); only fires
  // when the run presence flips, so a manual toggle sticks until then. Pre-run it keeps the
  // collapsed default (or whatever the user last set).
  const hasRun = !!run;
  useEffect(() => {
    if (hasRun) setHubOpen(false);
  }, [hasRun]);

  // Bank the run's collectibles to the album once, when it ends. Reload-safe via the
  // persisted stickersApplied flag (so a refresh on the ended screen won't re-bank).
  useEffect(() => {
    if (!onRunEnd || !run || run.phase !== 'ended' || run.stickersApplied) return;
    onRunEnd(run.xi, run.outcome === 'champion', run.boostedIds);
    setRun({ ...run, stickersApplied: true });
  }, [run, onRunEnd]);

  // The XI + Ascension to show: the live run, or - before it starts - a preview of the
  // drafted XI at the currently-chosen tier (B: the run only commits when "Play group
  // stage" is clicked, so the hub/ascension stay adjustable until then).
  const chosenAsc = chosenAscension;
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
    // The previous run's sticker haul may still be in flight; it belongs to that run,
    // not this one.
    onRunStart?.();
    const chosen = chosenAscension;
    if (career.lastAscension !== chosen) {
      const c = { ...career, lastAscension: chosen };
      setCareer(c);
      void store.saveCareer(c);
    }
    const begun = beginRun(draftedXi, career.perkLevels, career.unlockedBoons, chosen, {
      shape: draftedShape ?? undefined,
      build: draftedBuild ?? undefined,
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
  // It fires only when the navigation ASKED for a kickoff (`requestRunStart`, consumed
  // once). The first version inferred it from "no run in progress", which is the same
  // shape as a reload, a Back navigation, a bookmark or a save that has not landed - and
  // each of those then drew a fresh group over the run that was there. Module state, not
  // router state: `location.state` survives a reload, which would put the bug straight
  // back. The ref is still needed because `startAndPlayGroup` sets the run asynchronously.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (view === 'hub' || run || !draftedXi || autoStarted.current) return;
    if (!consumeRunStart()) return;
    autoStarted.current = true;
    startAndPlayGroup();
    // startAndPlayGroup closes over state that is settled by the time this can fire; it is
    // deliberately not a dependency, or picking an Ascension would restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, run, draftedXi]);

  /** What the challenge predicates need beyond the run and the career: dataset
   *  ratings (the run's XI carries boost deltas), the album as it stands, and the
   *  lifetime trade count. Read at run end rather than held in state, so it reflects
   *  a haul banked earlier in the same session. */
  const challengeInput = () => ({
    base: basePlayer,
    album: store.peek().album,
    trades: store.peek().albumStats.tradesCompleted,
  });

  // Step the run; award XP/Prestige exactly once when it ends.
  const advance = (next: RunState) => {
    if (next.phase === 'ended' && run && run.phase !== 'ended') {
      // The clock is passed in rather than read inside the domain, so `applyRunResult`
      // stays pure and the checks harness stays deterministic. It is the only thing the
      // run archive cannot work out for itself.
      const r = applyRunResult(
        career,
        next,
        CHALLENGES_ON ? challengeInput() : undefined,
        Date.now(),
      );
      setCareer(r.career);
      void store.saveCareer(r.career);
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
    void store.saveCareer(c);
  };

  const unlockBoost = (boonId: string) => {
    const c = unlockBoon(career, boonId);
    setCareer(c);
    void store.saveCareer(c);
  };

  // The draw's two halves, read off the group the reveal is carrying.
  const groupDraw =
    reveal?.kind === 'group'
      ? (() => {
            const user = reveal.group.teams.find((t) => t.isUser);
            const opponents = reveal.group.teams.filter((t) => !t.isUser);
            return user && opponents.length ? { user, opponents } : null;
        })()
      : null;
  // Matchdays fully revealed so far: while matchday N is playing, N-1 are complete, and
  // once the reveal is done all three are. This is what the table is projected to.
  const revealedMatchdays =
    reveal?.kind === 'group' ? (reveal.done ? GROUP_MATCHDAYS : reveal.index) : 0;

  const prog = levelProgress(career.xp);
  const showHubBody = hubOpen;
  const boostedIds = new Set(run?.boostedIds ?? []);

  // The career hub element. On the pre-run screen it renders BELOW the preview so the
  // "Play group stage" button stays visible; for an active run / no XI it sits on top.
  const hubOnly = view === 'hub';
  const hub = (
    <CareerHub
      career={career}
      prog={prog}
      hubOpen={hubOnly || hubOpen}
      onToggleHub={() => setHubOpen((o) => !o)}
      showBody={hubOnly || showHubBody}
      showToggle={!hubOnly}
      onPurchase={purchase}
      onUnlockBoost={unlockBoost}
    />
  );

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
      {view !== 'hub' && (
        <StageCrumb dir="back" label="Back to the build" to={buildTo} className="mt-7" />
      )}

      {/* Career hub - open above the content; a slim strip during an active run. Its own
          page in the tabs navigation, where the run is a separate route. */}
      {view !== 'run' && hub}

      {/* Pre-run: land straight on the run layout (the ladder, the XI, the Ascension
          picker) with the hub open below; one "Play group stage" both starts the run and
          reveals the group. No separate "Start a Cup Run" step.
          This is the FALLBACK rather than the norm: a kickoff goes straight into the draw,
          so it shows only when you arrive without one and with no run to resume. It keeps
          the button, so nothing is a dead end. */}
      {!hubOnly && previewRun && (
        <>
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
      {!hubOnly && !run && !draftedXi && (
        <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center shadow-hard">
          <p className="mb-4 text-[13.5px] text-muted">
            Draft your XI first, then bring it here for a Cup Run.
          </p>
          <Link to={buildTo} className={PRIMARY_BTN}>
            Draft your XI
          </Link>
        </div>
      )}

      {/* Active run */}
      {!hubOnly && run && (
        <>
          {/* There was a progress ladder here (Group -> R16 -> ... -> Cup). It went with
              the second chrome: the group table and the bracket already say which round
              this is and how the earlier ones went. Its round-review side survived the
              move - the bracket's own played cells open the same `RoundReview` below (see
              `RunBracket`), so the only step with no way back into it is the GROUP, which
              has no cell on the bracket. */}
          {run.ascension > 0 && (
            <div className="mb-4 flex justify-center">
              <span className="rounded-full border border-amber/40 bg-amber/[0.12] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a6512]">
                {ascensionAt(run.ascension).label} &middot; rewards x{ascensionAt(run.ascension).rewardMult}
              </span>
            </div>
          )}

          {/* The knockouts play out on the tree (roadmap item 28, option A), collapsed to
              the user own path with the full 16-team draw behind a chevron: the tree is
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
                    <>
                      {/* The draw, once per group. Nothing behind it renders until it is
                          dismissed: the table names the four teams, so leaving it up
                          showed the opponents through the backdrop while the flags were
                          still scrambling in front. */}
                      {drawOpen && groupDraw && (
                        <GroupDrawReveal
                          userTeam={groupDraw.user}
                          opponents={groupDraw.opponents}
                          onContinue={() => setDrawOpen(false)}
                        />
                      )}
                      {/* The table as it stands: projected to the matchdays revealed so
                          far, so it fills in as the group plays out. */}
                      {!drawOpen && (
                        <div className="mb-4">
                          <StandingsTable
                            group={groupAsOf(reveal.group, revealedMatchdays)}
                            groupFinished={reveal.done}
                            advanced={reveal.done && reveal.next.phase !== 'ended'}
                          />
                        </div>
                      )}
                      {!drawOpen && reveal.matches.map((m, i) => {
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
                        // The other group fixture used to sit under each card; the
                        // table's own "All results" already lists every one of the six,
                        // so it was the same scoreline printed twice.
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
                            {/* No final table here: the live one above IS the final table
                                once the third matchday is in, and printing it again put
                                the same eight rows on screen twice. */}
                            {advanced && reveal.next.offer ? (
                              <div className="mt-4 rounded-md border border-line bg-panel p-5 shadow-hard">
                                <BoostOffer
                                  offer={reveal.next.offer}
                                  nextOpponent={reveal.next.nextOpponent}
                                  roundName={KO_ROUNDS[0]}
                                  onPick={pickGroupBoost}
                                  rerollsLeft={reveal.next.rerollsLeft ?? 0}
                                  onReroll={() =>
                                    setReveal({ ...reveal, next: rerollOffer(reveal.next) })
                                  }
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
                      rerollsLeft={run.rerollsLeft ?? 0}
                      onReroll={() => setRun(rerollOffer(run))}
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
                      banking={banking}
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
