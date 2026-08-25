import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useState,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { basePlayer, squadsInPool } from './data/squads';
import type { Player, Position } from './data/types';
import { FORMATIONS_DATA, getFormation, STYLES } from './domain/formations';
import {
    canPlace,
    hasAnotherCup,
    hasAnotherTeam,
    homeViewOf,
    placedPlayers,
    positionsWithOpenSlot,
    randomXI,
    STRENGTH_BANDS,
    type TeamStrength,
} from './domain/draft';
import { budgetOf, extraRerollsOf } from './domain/career';
import { maxSelectableAscension, selectedAscension } from './domain/ascension';
import { runBuildOf, runShapeOf, type RunBuild, type RunShape } from './domain/run';
import { swapEligibleIds as swapEligibleIdsOf } from './domain/album';
import { FEATURES } from './config';
import { gameReducer, initialState, INITIAL_REROLLS, INITIAL_SWAPS } from './state/gameReducer';
import { isPlayTab, isRecords, screenOf } from './state/routes';
import { buildResume, cupRunResume } from './state/resume';
import { useLiveMatch } from './nav/liveMatch';
import { SubTabs, TabBottomBar, TabRow, type TabItem } from './components/navUi';
import { requestRunStart } from './nav/pendingRun';
import { setStoreErrorHandler, store, type AccountSnapshot } from './state/store';
import { useStickerAlbum } from './hooks/useStickerAlbum';
import { useSettings } from './hooks/useSettings';
import { useSquadRoll } from './hooks/useSquadRoll';
import { useBudgetBuild } from './hooks/useBudgetBuild';
import { useMovePlayer } from './hooks/useMovePlayer';
import { useStackedScroll } from './hooks/useStackedScroll';
import { useCareer } from './hooks/useCareer';
import SettingsModal from './components/SettingsModal';
import AccountModal from './components/AccountModal';
import SetupPanel from './components/SetupPanel';
import SquadPanel from './components/SquadPanel';
import BudgetMarket from './components/BudgetMarket';
import CompletePanel from './components/CompletePanel';
import ModeSelect from './components/ModeSelect';
import Pitch from './components/Pitch';
import BoxScore from './components/BoxScore';
import XiTable from './components/XiTable';
import Masthead from './components/Masthead';
import BuildPage from './components/BuildPage';
// Route-gated screens are code-split so the home/setup initial load stays small.
const SquadBrowser = lazy(() => import('./components/SquadBrowser'));
const AlbumScreen = lazy(() => import('./components/AlbumScreen'));
const ChallengesScreen = lazy(() => import('./components/ChallengesScreen'));
const CabinetScreen = lazy(() => import('./components/CabinetScreen'));
const CupRunScreen = lazy(() => import('./components/CupRunScreen'));
import RunEndOverlays from './components/RunEndOverlays';
import { StageHeader } from './components/matchUi';
const UnreachableScreen = lazy(() => import('./components/UnreachableScreen'));

type HomeView = 'setup' | 'draft' | 'complete';

/** Section eyebrow/title for the home screen, by sub-view. The home sub-view is
 *  derived from the drafted data (not `phase`), so navigating Back to home
 *  mid-tournament still reads as the locked XI. */
function homeCopy(view: HomeView): { eyebrow: string; title: string } {
    const eyebrow = view === 'complete' ? 'Confirmed line-up' : 'Team sheet';
    const title =
        view === 'setup'
            ? 'Set your formation'
            : view === 'draft'
              ? 'Build your XI'
              : 'Your XI is set';
    return { eyebrow, title };
}

/** Persisted state, read once before the first render (main.tsx) so everything here
 *  can still seed synchronously. `accountEmail` is null for a guest. */
export default function App({
    snapshot,
    accountEmail,
}: {
    snapshot: AccountSnapshot;
    accountEmail: string | null;
}) {
    const [state, dispatch] = useReducer(
        gameReducer,
        initialState,
        () => snapshot.game ?? initialState,
    );
    const location = useLocation();
    const navigate = useNavigate();

    // Sticker album (gated). The whole lifecycle - collection state, run-end banking
    // (standard game + Cup Run), the normalized cup-win reward pick, trades, and reset -
    // lives in this hook, outside the reducer / game state and in its own localStorage
    // key, so resetting a run never touches the collection (FR-7).
    const STICKERS = FEATURES.stickerAlbum;
    const settings = useSettings(snapshot.settings);
    // The active squad pool (squad-pool setting): the squads and players the game draws
    // from - the user's rolls, the transfer market, the opponents, and the album target.
    // Recomputed only when the setting changes.
    const poolSquads = useMemo(
        () => squadsInPool(settings.settings.poolYears),
        [settings.settings.poolYears],
    );
    const poolPlayers = useMemo(() => poolSquads.flatMap((s) => s.players), [poolSquads]);
    const stickers = useStickerAlbum(state.swapsLeft, snapshot.album, poolPlayers);
    // The career, seeded from the boot snapshot like the album (hooks/useCareer). It used
    // to be state inside the run screen, which is why two memos here re-read it from the
    // store on every navigation with an eslint-disable each, just to price the market,
    // offer the right Ascension tiers and colour the challenge ledger.
    const { career, buyPerk, unlockBoost, startRun, bankRun } = useCareer(snapshot.career);
    // The Ascension tier for the next run, picked on the build page (roadmap item 28)
    // rather than on a pre-run screen that no longer exists in the tabs chrome. Held here
    // as UI state and mirrored onto the career's `lastAscension`, which is where the run
    // already read its default from - so nothing new has to be threaded to `beginRun`.
    const [ascension, setAscension] = useState<number | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    // Accounts (gated): the blocking state for a failed save while signed in (D9),
    // a global overlay like the album's.
    const [storeError, setStoreError] = useState<Error | null>(null);
    useEffect(() => setStoreErrorHandler(setStoreError), []);
    // The build page's mobile there-and-back: the two scroll anchors and the two calls
    // that use them (hooks/useStackedScroll).
    const { pitchRef, squadRef, scrollToPitch, scrollToPanel } = useStackedScroll();

    const {
        phase,
        formationName,
        style,
        build,
        formation,
        filled,
        currentSquad,
        selectedPlayerId,
        usedPersonIds,
        rerollsLeft,
        rolling,
        speed,
        swapsLeft,
    } = state;

    // Persist the whole game so the clean-path routes survive a refresh.
    useEffect(() => {
        void store.saveGame(state);
    }, [state]);

    // During setup the pitch previews the selected formation/style; during the
    // draft it uses the locked formation stored in state.
    const previewFormation = useMemo(
        () => getFormation(formationName, style),
        [formationName, style],
    );
    // Home sub-view derived from the data, not `phase`: no formation -> setup;
    // formation but incomplete -> draft; complete XI -> complete (even once the
    // tournament has started, so Back to home shows the locked XI).
    // Keyed on the board, not on `phase` - see `homeViewOf`.
    const homeView: HomeView = homeViewOf(formation, filled);
    const activeFormation = homeView === 'setup' ? previewFormation : formation;

    // Mobile: when a player is picked, scroll the pitch to the top (with a little
    // margin via scroll-mt) so the user can tap an open slot. Scrolling back up to
    // the squad after placing is done in handlePlace.
    useEffect(() => {
        if (phase === 'draft' && selectedPlayerId) scrollToPitch();
    }, [selectedPlayerId, phase, scrollToPitch]);

    // The roll draft: the scramble animation and the draw-next-squad policy, with their
    // four refs and their two effects (hooks/useSquadRoll). It is the subtlest code the
    // build has and none of it is composition, which is why it is not here any more.
    const { displaySquad, reroll } = useSquadRoll({
        phase,
        build,
        formation,
        currentSquad,
        rolling,
        filled,
        usedPersonIds,
        rerollsLeft,
        pool: poolSquads,
        dispatch,
    });

    // The two transient interaction machines the shared pitch drives (hooks/useMovePlayer
    // and hooks/useBudgetBuild). They cross-cancel: taking a card drops a move in
    // progress, and picking a placed player up drops the card. The move hook is declared
    // first so the market can call its `cancel`; the other direction is `handleStartMove`
    // below, since neither hook can own both without knowing about the other.
    const move = useMovePlayer({ activeFormation, phase, dispatch });
    const budget = useBudgetBuild({
        isBudgetBuild: build === 'budget',
        formation,
        activeFormation,
        filled,
        dispatch,
        onTakeCard: move.cancel,
        scrollToPitch,
        scrollToPanel,
    });

    const handleStart = useCallback(() => {
        if (!previewFormation) return;
        // A fresh draft means a fresh team, so drop any in-progress Cup Run.
        void store.saveRun(null);
        // The Extra Re-roll perk tops up the base three. Read off the live career, so
        // buying the perk in the hub and coming straight back applies without a reload.
        const extraRerolls = extraRerollsOf(career);
        // Just enter the draft; the draw-next-squad effect rolls the first squad
        // from committed state (an open slot with no squad in hand).
        dispatch({ type: 'START_DRAFT', formation: previewFormation, extraRerolls });
    }, [previewFormation, career]);

    // Testing shortcut: auto-pick a full valid XI (within a strength band) and
    // jump straight to "complete".
    const handleRandomTeam = useCallback(
        (tier: TeamStrength) => {
            if (!previewFormation) return;
            void store.saveRun(null);
            const { filled, usedPersonIds } = randomXI(
                previewFormation,
                poolSquads,
                STRENGTH_BANDS[tier],
            );
            dispatch({
                type: 'AUTOFILL',
                formation: previewFormation,
                filled,
                usedPersonIds,
            });
        },
        [previewFormation, poolSquads],
    );

    // Budget build: enter it in place (no route change) - the left column swaps to
    // the market, while the pitch + ratings/line-up stay put.
    const handleBudget = useCallback(() => {
        if (!previewFormation) return;
        void store.saveRun(null);
        budget.enter(previewFormation);
    }, [previewFormation, budget]);

    // Clear every bought player but stay in the budget build (re-enter it fresh).
    const handleBudgetClear = useCallback(() => {
        if (formation) budget.enter(formation);
    }, [formation, budget]);

    // Taking a drawn-squad card drops a move in progress: only one thing is being aimed
    // at a time, and the last tap is what the user means. The market's own card does the
    // same, from inside `useBudgetBuild`.
    const handleSelectPlayer = useCallback(
        (playerId: string) => {
            move.cancel();
            dispatch({ type: 'SELECT_PLAYER', playerId });
        },
        [move],
    );

    const handlePlace = useCallback(
        (slotId: string) => {
            // The reducer owns placement validation and ignores an invalid slot;
            // dispatch unconditionally and let it be the single source of truth.
            // The draw-next-squad effect rolls the next squad from committed state.
            const slot = formation?.slots.find((s) => s.id === slotId);
            const player = currentSquad?.players.find((p) => p.id === selectedPlayerId);
            const willPlace = !!formation && !!slot && !!player && canPlace(player, slot, filled);

            dispatch({ type: 'PLACE_PLAYER', slotId });

            // Mobile: jump back up to the squad list (showing the next drawn squad); the
            // panel's scroll-mt keeps a little margin above it. Only for a placement
            // that actually landed.
            if (willPlace) scrollToPanel();
        },
        [formation, currentSquad, selectedPlayerId, filled, scrollToPanel],
    );

    // Swap the selected player into an already-filled slot (sticker album feature).
    // The reducer validates eligibility; the draw effect then rolls the next squad
    // for any still-open slot, exactly like a placement.
    const handleSwap = useCallback(
        (slotId: string) => {
            dispatch({ type: 'SWAP_PLAYER', slotId });
            scrollToPanel();
        },
        [scrollToPanel],
    );

    // Testing aid: remove a placed player. The XI drops back to 'draft'; if no
    // squad is in hand (we were "complete"), the draw-next-squad effect rolls one
    // for the freed slot from committed state so a replacement can be drafted.
    const handleRemove = useCallback((slotId: string) => {
        dispatch({ type: 'REMOVE_PLAYER', slotId });
    }, []);

    // Picking a placed player up is the other half of that rule, and the half neither
    // hook can own: the move hook clears the reducer's selection, and the market's held
    // card is dropped here, so the two gestures overwrite each other in both directions
    // rather than one silently winning.
    const handleStartMove = useCallback(
        (slotId: string) => {
            budget.dropHeld();
            move.startMove(slotId);
        },
        [budget, move],
    );

    const handleReset = useCallback(() => {
        // A reset is a brand-new team, so drop any in-progress Cup Run too - and any
        // sticker summary still arriving for the run being abandoned.
        if (STICKERS) stickers.onNewRun();
        void store.saveRun(null);
        dispatch({ type: 'RESET' });
        // One build route, so a reset always lands there and finding F8 (three different
        // answers to "go back") answers itself.
        navigate('/play');
        // `stickers.onNewRun` is a stable callback, so this stays referentially quiet.
        // `location.pathname` is deliberately NOT a dependency: it was one while the
        // destination was computed from it, and leaving it made this callback a new object
        // on every navigation, which propagated to four child components.
    }, [navigate, STICKERS, stickers.onNewRun]);

    const openPositions = useMemo<Set<Position>>(
        () =>
            activeFormation ? positionsWithOpenSlot(activeFormation, filled) : new Set<Position>(),
        [activeFormation, filled],
    );
    // Ids of drawn-squad players that can be swapped in (collectible + swaps remain +
    // there's a filled slot they can take): a different-person slot when they're not
    // already in the XI, or their OWN slot as an upgrade (a different card of the same
    // person). Empty when the album is off / no swaps left, so gating is unchanged there.
    const swapEligibleIds = useMemo<Set<string>>(
        () =>
            !STICKERS || swapsLeft <= 0 || !activeFormation || !currentSquad
                ? new Set<string>()
                : swapEligibleIdsOf(
                      currentSquad.players,
                      activeFormation.slots,
                      filled,
                      new Set(usedPersonIds),
                  ),
        [STICKERS, swapsLeft, activeFormation, currentSquad, filled, usedPersonIds],
    );
    const usedSet = useMemo(() => new Set(usedPersonIds), [usedPersonIds]);
    // Stickers already in the album, by PLAYER id: the marker in both player lists (and
    // the line-up sheet) uses it to say "you have this one" rather than only
    // "collectible". Player id, not personId - a sticker is per version of a person, so
    // Buffon 88 and Buffon 90 are separate cards. Empty when the album is off, which
    // makes every marker read as unowned exactly as it did before.
    const ownedStickerIds = useMemo(
        () => new Set(STICKERS ? stickers.album.collected : []),
        [STICKERS, stickers.album],
    );
    const selectedPlayer = currentSquad?.players.find((p) => p.id === selectedPlayerId) ?? null;
    const panelSquad = rolling ? displaySquad : currentSquad;
    const availableStyles = FORMATIONS_DATA.stylesByName[formationName] ?? STYLES;

    const isBudgetBuild = build === 'budget';

    // Page section header (eyebrow + heading), derived from the home sub-view.
    const home = homeCopy(homeView);

    // The completed XI (all slots filled) handed to a Cup Run; null until full.
    const draftedXi = useMemo<Player[] | null>(() => {
        if (!formation) return null;
        const ps = placedPlayers(formation, filled);
        return ps.length === formation.slots.length ? ps : null;
    }, [formation, filled]);

    // Route -> which screen, decided by `state/routes.ts` (feature flags included), so
    // the contract is one pure function rather than ten booleans declared here and
    // re-tested in the render chain below. `location.pathname` is basename-relative.
    //
    // The legacy aliases went on 2026-08-24: `/challenges` and `/cabinet` for the two
    // honours screens, and `/quick-run` + `/career-mode` for the build. They existed to
    // protect bookmarks made before the navigation rework, and the app has never been
    // live, so there are none. They now hit the catch-all redirect, exactly as `/group`
    // and `/knockout` already do.
    const path = location.pathname;
    const screen = screenOf(path);
    const isSquads = screen === 'squads';
    const isAlbum = screen === 'album';
    const isCupRun = screen === 'cup-run';
    const isLauncher = screen === 'front';
    const isBuild = screen === 'build';
    // `/career` is the hub, split off the live run (finding F4); `/records` holds the two
    // honours screens as segments of one destination.
    const isCareerHub = screen === 'career';
    const tabsRecords = isRecords(screen);
    const recordsCabinet = screen === 'cabinet';

    // The Ascension picker's props for the build page: the tier in force and the highest
    // one currently selectable (unlocked AND level-gated).
    const ascensionMax = maxSelectableAscension(career.ascension, career.level);
    const ascensionTier = selectedAscension(career, ascension);
    // Picking a tier mirrors it onto the career, which is where the run reads its default
    // from - so nothing new has to be threaded to `beginRun`. `startRun` is the same write
    // the run itself makes at kickoff, and it no-ops when the tier has not moved.
    const pickAscension = useCallback(
        (tier: number) => {
            setAscension(tier);
            startRun(tier);
        },
        [startRun],
    );

    // Transfer-market budget, scaled by the owned `transfer-budget` perk tier. The build
    // record below reads the same figure, so what the market charged and what the run
    // recorded cannot drift. Named for the money, since `budget` is the market's
    // interaction machine now.
    const marketBudget = budgetOf(career);

    // What the build page knows and the run cannot work out afterwards: the shape the XI
    // kicks off in, and how it was assembled. Both are handed to `beginRun` so the
    // challenge catalogue can judge them (docs/challenges-spec.html, slices B and C).
    // Recorded at kickoff rather than derived at run end because placing a player
    // promotes the slot's role onto him, a roster boost changes the XI later, and the
    // album (and so the owned-sticker discount) keeps growing.
    const draftedShape = useMemo<RunShape | null>(
        () => (formation && draftedXi ? runShapeOf(formation, filled) : null),
        [formation, filled, draftedXi],
    );

    // The build record. The career's budget is the one in force, and this is also read
    // from `/cup-run`, one navigation after the market closed.
    const draftedBuild = useMemo<RunBuild | null>(() => {
        if (!draftedXi) return null;
        const swapsUsed = INITIAL_SWAPS - swapsLeft;
        return build === 'budget'
            ? runBuildOf({
                  method: 'budget',
                  xi: draftedXi,
                  // The same figure the market charged against, not a second lookup.
                  budget: marketBudget,
                  ownedStickerIds,
                  swapsUsed,
              })
            : runBuildOf({
                  method: 'roll',
                  allowance: INITIAL_REROLLS + extraRerollsOf(career),
                  rerollsLeft,
                  swapsUsed,
              });
    }, [draftedXi, build, marketBudget, career, ownedStickerIds, rerollsLeft, swapsLeft]);

    /** What the challenge predicates need beyond the run and the career: dataset ratings
     *  (the run's XI carries boost deltas), the album as it stands, and the lifetime trade
     *  count. A function, so it is read when a run ENDS and reflects a haul banked earlier
     *  in the same session rather than whatever was in state at mount. */
    const challengeInput = useCallback(
        () => ({
            base: basePlayer,
            album: store.peek().album,
            trades: store.peek().albumStats.tradesCompleted,
        }),
        [],
    );

    // Launcher-only read, refreshed whenever we land on `/`: a Cup Run that is
    // mid-flight, described in one line for the Continue button (`state/resume.ts`).
    //
    // The one `store.peek()` left, and `useCupRun` records why: the run stays owned by the
    // run screen because the account path needs it written back by a CHILD's effect.
    const resumeCupRun = useMemo(
        () => cupRunResume(store.peek().run),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isLauncher, path],
    );

    // Launcher-only read: an XI left mid-build, so coming back to the site is not a
    // dead end. Only when there is nothing further along to resume.
    const resumeBuild = useMemo(
        () => buildResume(formation, filled, !!resumeCupRun),
        [formation, filled, resumeCupRun],
    );

    // ---------------------------------------------------------------- tabs chrome
    // A match reveal is transient state (deliberately not persisted), so the bar goes
    // inert while one plays, exactly as the run ladder already does.
    const liveMatch = useLiveMatch();
    // Where the Play tab lands: the run if there is one, the build if one is half done,
    // otherwise the cover. The crest always returns to the cover.
    const playTo = resumeCupRun ? '/cup-run' : formation ? '/play' : '/';
    const playTabActive = isPlayTab(screen);
    // A tab is a label and a destination. The per-tab sub-line each of these used to
    // carry (where the run is, level and Prestige, album completion, challenges earned,
    // cups in the pool) is gone: every one of those figures is on the screen the tab
    // leads to, so the chrome was restating four counters at once.
    // Annotated as (TabItem | false)[] rather than cast to it, so a mistyped `to` or a
    // missing `label` is an error at the literal instead of at the cast; the predicate in
    // the filter is what removes the `false` arm, so neither end needs an assertion.
    const tabEntries: (TabItem | false)[] = [
        { key: 'play', label: 'Play', to: playTo, active: playTabActive },
        { key: 'career', label: 'Career', to: '/career', active: isCareerHub },
        STICKERS && { key: 'album', label: 'Album', to: '/album', active: isAlbum },
        (FEATURES.challenges || FEATURES.trophyCabinet) && {
            key: 'records',
            label: 'Records',
            to: FEATURES.challenges ? '/records' : '/records/cabinet',
            active: tabsRecords,
        },
        FEATURES.squadBrowser && {
            key: 'squads',
            label: 'Squads',
            to: '/squads/by-world-cup',
            active: isSquads,
        },
    ];
    const tabs: TabItem[] = tabEntries.filter((t): t is TabItem => t !== false);

    // The cover's single Continue action: a live Cup Run, else a half-built XI. One
    // action because this navigation keeps one run at a time; "build a new XI" beside it
    // discards whichever of the two it is.
    const continueAction = resumeCupRun
        ? { to: '/cup-run', label: 'Resume your Cup Run', sub: resumeCupRun.summary }
        : resumeBuild
          ? { to: resumeBuild.to, label: resumeBuild.label, sub: resumeBuild.sub }
          : null;

    return (
        <div className="min-h-full text-ink">
            {/* The extra bottom padding below 700px is the room the phone tab bar occupies. */}
            <div className="mx-auto max-w-[1180px] px-[22px] pb-20 pt-5 max-[699px]:pb-28">
                <Masthead
                    accountEmail={accountEmail}
                    onOpenAccount={() => setAccountOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                />

                {/* The five destinations (roadmap item 27, concept 2): a row here and a
                    fixed bottom bar on a phone. */}
                {tabs.length > 0 && (
                    <>
                        <TabRow items={tabs} locked={liveMatch} />
                        <TabBottomBar items={tabs} locked={liveMatch} />
                    </>
                )}

                <Suspense
                    fallback={
                        <div className="mt-20 text-center font-mono text-[12px] text-muted">
                            Loading…
                        </div>
                    }
                >
                    {isSquads ? (
                        <SquadBrowser />
                    ) : isCareerHub || isCupRun ? (
                        // The Career tab is the hub, `/cup-run` the live run. One arm: the
                        // two used to be separate branches rendering the same component
                        // with sixteen byte-identical props, differing only in `view`.
                        // React reconciles them as one component at one child position, so
                        // there was never even a remount difference between them.
                        <CupRunScreen
                            view={isCareerHub ? 'hub' : 'run'}
                            buildTo="/play"
                            draftedXi={draftedXi}
                            draftedShape={draftedShape}
                            draftedBuild={draftedBuild}
                            onReDraft={handleReset}
                            speed={speed}
                            onSetSpeed={(s) => dispatch({ type: 'SET_SPEED', speed: s })}
                            difficulty={settings.settings.difficulty}
                            pool={poolSquads}
                            showFullDraw={settings.settings.showFullDraw}
                            onSetShowFullDraw={settings.setShowFullDraw}
                            onRunEnd={STICKERS ? stickers.onCupRunEnd : undefined}
                            onRunStart={STICKERS ? stickers.onNewRun : undefined}
                            banking={STICKERS ? stickers.banking : false}
                            career={career}
                            buyPerk={buyPerk}
                            unlockBoost={unlockBoost}
                            startRun={startRun}
                            bankRun={bankRun}
                            challengeInput={challengeInput}
                        />
                    ) : isAlbum ? (
                        <AlbumScreen
                            album={stickers.album}
                            allPlayers={poolPlayers}
                            onTrade={stickers.onTrade}
                            onReset={stickers.canResetAlbum ? stickers.onResetAlbum : undefined}
                        />
                    ) : tabsRecords ? (
                        // The Records tab. Both are read-only honours over the same
                        // career, so they are segments of one destination rather than two
                        // tabs, which is what keeps the bar at five.
                        <>
                            {/* One header for the destination, above the segmented
                                control that picks which half of it you are reading -
                                the shape `/squads` uses for its Display toggle. The two
                                screens drop their own headers here (`heading={false}`),
                                since a second title under the control that names the
                                same thing is a title twice. */}
                            <StageHeader eyebrow="Your honours" title="Records" />
                            <SubTabs
                                className="mb-[18px] max-w-[320px]"
                                items={[
                                    ...(FEATURES.challenges
                                        ? [
                                              {
                                                  label: 'Challenges',
                                                  to: '/records',
                                                  active: !recordsCabinet,
                                              },
                                          ]
                                        : []),
                                    ...(FEATURES.trophyCabinet
                                        ? [
                                              {
                                                  label: 'Cabinet',
                                                  to: '/records/cabinet',
                                                  active: recordsCabinet,
                                              },
                                          ]
                                        : []),
                                ]}
                            />
                            {recordsCabinet ? (
                                <CabinetScreen
                                    career={career}
                                    album={stickers.album}
                                    allPlayers={poolPlayers}
                                />
                            ) : (
                                <ChallengesScreen completed={career.completedChallenges} />
                            )}
                        </>
                    ) : isLauncher ? (
                        <ModeSelect
                            continueAction={continueAction}
                            buildTo="/play"
                            onNewXi={handleReset}
                            allPlayers={poolPlayers}
                        />
                    ) : isBuild ? (
                        <BuildPage
                            eyebrow={home.eyebrow}
                            title={home.title}
                            panelRef={squadRef}
                            boardRef={pitchRef}
                            panel={
                                <>
                                    {homeView === 'setup' && (
                                        <SetupPanel
                                            names={FORMATIONS_DATA.names}
                                            selectedName={formationName}
                                            selectedStyle={style}
                                            availableStyles={availableStyles}
                                            ready={!!previewFormation}
                                            onSelectName={(name) =>
                                                dispatch({ type: 'SET_FORMATION', name })
                                            }
                                            onSelectStyle={(st) =>
                                                dispatch({ type: 'SET_STYLE', style: st })
                                            }
                                            onStart={handleStart}
                                            onRandomTeam={
                                                FEATURES.randomTeam ? handleRandomTeam : undefined
                                            }
                                            onBudgetDraft={
                                                FEATURES.budgetDraft ? handleBudget : undefined
                                            }
                                            ascension={{
                                                tier: ascensionTier,
                                                max: ascensionMax,
                                                onSelect: pickAscension,
                                            }}
                                        />
                                    )}
                                    {homeView === 'draft' &&
                                        formation &&
                                        (isBudgetBuild ? (
                                            <BudgetMarket
                                                formation={formation}
                                                filled={filled}
                                                budget={marketBudget}
                                                poolPlayers={poolPlayers}
                                                targetSlot={budget.targetSlot}
                                                heldPlayer={budget.heldPlayer}
                                                onHold={budget.hold}
                                                onAutoFill={budget.autoFill}
                                                onClear={handleBudgetClear}
                                                onStartOver={handleReset}
                                                ownedStickerIds={ownedStickerIds}
                                            />
                                        ) : (
                                            <SquadPanel
                                                squad={panelSquad}
                                                rolling={rolling}
                                                rerollsLeft={rerollsLeft}
                                                canAnotherTeam={
                                                    !!currentSquad &&
                                                    hasAnotherTeam(poolSquads, currentSquad)
                                                }
                                                canAnotherCup={
                                                    !!currentSquad &&
                                                    hasAnotherCup(poolSquads, currentSquad)
                                                }
                                                openPositions={openPositions}
                                                swapEligibleIds={swapEligibleIds}
                                                swapsLeft={swapsLeft}
                                                usedPersonIds={usedSet}
                                                selectedPlayerId={selectedPlayerId}
                                                onReroll={reroll}
                                                onSelectPlayer={handleSelectPlayer}
                                                ownedStickerIds={ownedStickerIds}
                                                onReset={handleReset}
                                            />
                                        ))}
                                    {homeView === 'complete' && formation && (
                                        <CompletePanel
                                            formation={formation}
                                            filled={filled}
                                            style={style}
                                            onStartRun={() => {
                                                // Tell the run screen this navigation is a
                                                // kickoff, so it never has to infer that
                                                // from "no run in progress" - which a
                                                // reload also looks like.
                                                requestRunStart();
                                                navigate('/cup-run');
                                            }}
                                            onReset={handleReset}
                                        />
                                    )}
                                </>
                            }
                            board={
                                activeFormation && (
                                    <Pitch
                                        formation={activeFormation}
                                        filled={filled}
                                        selectedPlayer={
                                            isBudgetBuild ? budget.heldPlayer : selectedPlayer
                                        }
                                        onPlace={isBudgetBuild ? budget.place : handlePlace}
                                        onRemove={
                                            isBudgetBuild
                                                ? budget.remove
                                                : FEATURES.removePlayers
                                                  ? handleRemove
                                                  : undefined
                                        }
                                        onSwap={
                                            !isBudgetBuild && STICKERS && swapsLeft > 0
                                                ? handleSwap
                                                : undefined
                                        }
                                        onSelectSlot={isBudgetBuild ? budget.shop : undefined}
                                        targetSlotId={
                                            isBudgetBuild ? budget.targetSlot?.id : undefined
                                        }
                                        // Moving a placed player. Offered even with a card
                                        // in hand: a slot the held card can swap into keeps
                                        // the swap, and anywhere else the tap picks the
                                        // placed player up instead, dropping the card.
                                        onStartMove={
                                            FEATURES.movePlayers ? handleStartMove : undefined
                                        }
                                        movingSlotId={move.movingSlotId}
                                        onMove={FEATURES.movePlayers ? move.move : undefined}
                                    />
                                )
                            }
                            stack={
                                activeFormation && (
                                    <>
                                        <BoxScore formation={activeFormation} filled={filled} />
                                        <XiTable
                                            formation={activeFormation}
                                            filled={filled}
                                            budget={isBudgetBuild ? marketBudget : undefined}
                                            ownedStickerIds={ownedStickerIds}
                                        />
                                    </>
                                )
                            }
                        />
                    ) : (
                        <Navigate to="/" replace />
                    )}
                </Suspense>

                {/* Footer: the fan-made disclaimer. The text nav that used to sit here
                    (four of eleven destinations, 11px, below the fold - finding F1) is gone;
                    the tabs reach everything. */}
                <footer className="mt-16 flex flex-col items-center gap-2.5 border-t border-line pt-5 sm:flex-row sm:justify-center">
                    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            Made in Switzerland
                            <img
                                src={`${import.meta.env.BASE_URL}img/swiss.svg`}
                                alt="Swiss flag"
                                className="h-[15px] w-[15px]"
                            />
                        </span>
                        <span>- not affiliated with FIFA</span>
                    </p>
                </footer>
            </div>

            {/* Run-end sticker flow (global overlays, layered over any screen), driven
                by the hook's normalized state: a cup win picks a bonus sticker first
                (blocks until picked), then the summary; a loss banked in the hook, so
                only the summary shows (when at least one new sticker was earned). */}
            {STICKERS && (
                <RunEndOverlays
                    album={stickers.album}
                    allPlayers={poolPlayers}
                    pendingReward={stickers.pendingReward}
                    newStickerIds={stickers.newStickerIds}
                    onCloseSummary={stickers.clearNewStickers}
                    onViewAlbum={() => {
                        stickers.clearNewStickers();
                        navigate('/album');
                    }}
                />
            )}

            {settingsOpen && (
                <SettingsModal
                    onClose={() => setSettingsOpen(false)}
                    settings={settings}
                    speed={speed}
                    onSetSpeed={(s) => dispatch({ type: 'SET_SPEED', speed: s })}
                />
            )}

            {accountOpen && (
                <AccountModal
                    email={accountEmail}
                    onClose={() => setAccountOpen(false)}
                    // Signing in or out swaps the whole store (guest storage vs the
                    // account), so the cleanest handover is a reload: main.tsx picks the
                    // right implementation and reads it fresh.
                    onAccountChanged={() => window.location.reload()}
                />
            )}

            {/* Accounts: the blocking state when a save fails while signed in. Lazy,
                so a guest never loads it. */}
            {storeError && (
                <Suspense fallback={null}>
                    <UnreachableScreen
                        message={storeError.message}
                        midPlay
                        variant={storeError.name === 'StaleVersionError' ? 'stale' : 'unreachable'}
                    />
                </Suspense>
            )}
        </div>
    );
}
