import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { basePlayer } from './data/squads';
import { budgetOf, extraRerollsOf } from './domain/career';
import { maxSelectableAscension, selectedAscension } from './domain/ascension';
import { runBuildOf, runShapeOf, type RunBuild, type RunShape } from './domain/run';
import { FEATURES } from './config';
import { INITIAL_REROLLS, INITIAL_SWAPS } from './state/gameReducer';
import { soloBuildIo } from './state/buildIo';
import { isPlayTab, isRecords, screenOf } from './state/routes';
import { buildResume, cupRunResume } from './state/resume';
import { useLiveMatch } from './nav/liveMatch';
import { useHeldVersusRoom } from './nav/versusRoom';
import { SubTabs, TabBottomBar, TabRow, type TabItem } from './components/navUi';
import { requestRunStart } from './nav/pendingRun';
import { setStoreErrorHandler, store, type AccountSnapshot } from './state/store';
import { useStickerAlbum } from './hooks/useStickerAlbum';
import { useSettings } from './hooks/useSettings';
import { useBuild } from './hooks/useBuild';
import { useCareer } from './hooks/useCareer';
import { usePool } from './hooks/usePool';
import SettingsModal from './components/SettingsModal';
import AccountModal from './components/AccountModal';
import ModeSelect from './components/ModeSelect';
import Masthead from './components/Masthead';
import BuildSurface from './components/BuildSurface';
import { SOLO_CONTROLS } from './components/buildControls';
import CompletePanel from './components/CompletePanel';
// Route-gated screens are code-split so the home/setup initial load stays small.
const SquadBrowser = lazy(() => import('./components/SquadBrowser'));
const AlbumScreen = lazy(() => import('./components/AlbumScreen'));
const ChallengesScreen = lazy(() => import('./components/ChallengesScreen'));
const CabinetScreen = lazy(() => import('./components/CabinetScreen'));
const CupRunScreen = lazy(() => import('./components/CupRunScreen'));
const VersusScreen = lazy(() => import('./components/versus/VersusScreen'));
import RunEndOverlays from './components/RunEndOverlays';
import { StageHeader } from './components/matchUi';
const UnreachableScreen = lazy(() => import('./components/UnreachableScreen'));

/** Persisted state, read once before the first render (main.tsx) so everything here
 *  can still seed synchronously. `accountEmail` is null for a guest. */
export default function App({
    snapshot,
    accountEmail,
}: {
    snapshot: AccountSnapshot;
    accountEmail: string | null;
}) {
    const location = useLocation();
    const navigate = useNavigate();

    const STICKERS = FEATURES.stickerAlbum;
    const settings = useSettings(snapshot.settings);
    // The active squad pool (squad-pool setting): the squads and players the game draws
    // from - the user's rolls, the transfer market, the opponents, the odds sim and the
    // album's completion target. Derived once (hooks/usePool) and handed out.
    const pool = usePool(settings.settings.poolYears);
    const poolSquads = pool.squads;
    const poolPlayers = pool.players;
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
    // The career, seeded from the boot snapshot like the album (hooks/useCareer). It used
    // to be state inside the run screen, which is why two memos here re-read it from the
    // store on every navigation with an eslint-disable each, just to price the market,
    // offer the right Ascension tiers and colour the challenge ledger.
    const { career, buyPerk, unlockBoost, startRun, rememberAscension, bankRun } =
        useCareer(snapshot.career);

    // THE BUILD (hooks/useBuild). The reducer, its two effects, the three interaction
    // machines and the eleven handlers, as an instantiable unit rather than as this
    // component's own body - which is what lets a versus room hold a SECOND one
    // (pvp-plan P29). `soloBuildIo` is the app's own: mirrored to storage so a refresh
    // resumes it, and starting a fresh XI drops the run that XI replaced. A room is
    // handed `detachedBuildIo` instead and writes neither.
    const build = useBuild({
        initial: snapshot.game,
        io: soloBuildIo,
        pool,
        // The Extra Re-roll perk tops up the base three. Read off the live career, so
        // buying the perk in the hub and coming straight back applies without a reload.
        extraRerolls: extraRerollsOf(career),
    });
    const { state } = build;
    const { formation, filled, speed } = state;
    const draftedXi = build.draftedXi;
    // Sticker album (gated). The whole lifecycle - collection state, run-end banking, the
    // normalized cup-win reward pick, trades, and reset - lives in this hook, outside the
    // build and in its own localStorage key, so resetting a run never touches the
    // collection (FR-7). It reads the build's remaining swaps and nothing else of it.
    const stickers = useStickerAlbum(state.swapsLeft, snapshot.album, poolPlayers);

    // Start over, from anywhere that offers it. The build's own half (drop the board,
    // drop the run it was built for) is `build.reset`; what is added here is the app's:
    // a sticker summary still arriving for the run being abandoned, and where to land.
    const handleReset = useCallback(() => {
        if (STICKERS) stickers.onNewRun();
        build.reset();
        // One build route, so a reset always lands there and finding F8 (three different
        // answers to "go back") answers itself.
        navigate('/play');
        // `stickers.onNewRun` and `build.reset` are both stable callbacks, so this stays
        // referentially quiet. `location.pathname` is deliberately NOT a dependency: it
        // was one while the destination was computed from it, and leaving it made this
        // callback a new object on every navigation, which propagated to four children.
    }, [navigate, STICKERS, stickers.onNewRun, build.reset]);

    const ownedStickerIds = useMemo(
        () => new Set(STICKERS ? stickers.album.collected : []),
        [STICKERS, stickers.album],
    );
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
    const isVersus = screen === 'versus';
    const tabsRecords = isRecords(screen);
    const recordsCabinet = screen === 'cabinet';

    // The Ascension picker's props for the complete panel: the tier in force and the
    // highest one currently selectable (unlocked AND level-gated).
    const ascensionMax = maxSelectableAscension(career.ascension, career.level);
    const ascensionTier = selectedAscension(career, ascension);
    // Picking a tier mirrors it onto the career, which is where the run reads its default
    // from - so nothing new has to be threaded to `beginRun`.
    //
    // `rememberAscension`, NOT `startRun`: the latter also spends a Youth Development
    // grant and hands back what it owes, so wiring a picker to it binned the grant on the
    // floor - and the picker is a control you can touch as often as you like before any
    // run exists to be dealt to.
    const pickAscension = useCallback(
        (tier: number) => {
            setAscension(tier);
            rememberAscension(tier);
        },
        [rememberAscension],
    );

    // Transfer-market budget, scaled by the owned `transfer-budget` perk tier. The build
    // record below reads the same figure, so what the market charged and what the run
    // recorded cannot drift. The build itself has no opinion about the money: it is told
    // a figure, which is also how a room will hand it the host's.
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
        const swapsUsed = INITIAL_SWAPS - state.swapsLeft;
        return state.build === 'budget'
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
                  rerollsLeft: state.rerollsLeft,
                  swapsUsed,
              });
    }, [draftedXi, state.build, state.rerollsLeft, state.swapsLeft, marketBudget, career, ownedStickerIds]);

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

    // A Cup Run that is mid-flight, described in one line for the Continue button
    // (`state/resume.ts`). The one `store.peek()` left, and `useCupRun` records why: the
    // run stays owned by the run screen, because the account path needs it written back by
    // a CHILD's effect.
    //
    // A plain read, not a memo keyed on the path (hygiene H14). `peek()` is a synchronous
    // in-memory field read, so the memo cached nothing and its key was a lie about the
    // dependency - and it was strictly WORSE than reading: a memo keyed on the path serves
    // a stale run for any change that does not navigate.
    const resumeCupRun = cupRunResume(store.peek().run);

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
    // A live room is the TOP of the Continue precedence - room, then run, then build -
    // in the cover's Continue and in the Play tab's destination alike (plan section 8).
    // Without it, tapping the crest out of habit mid-room lands you on your solo build
    // with a pick clock running somewhere else.
    //
    // AND IT IS ONLY EVER SHOWN TO AN ACCOUNT, which was a reported bug: the pointer lives
    // in `sessionStorage` and signing out reloads the page, so a guest was left with a
    // "Back to your room" on the front page and a room strip in the chrome, for a room the
    // guest cannot even read. A room is account-only (P17), so a pointer with no account is
    // stale by definition - gating the READ covers every way it can go stale (a sign-out, a
    // session expiring, an account deleted in another tab), where clearing it at each of
    // those sites covers only the ones somebody remembered. `AccountPanel` clears it too,
    // so the stale value does not sit there waiting.
    const signedInHeld = useHeldVersusRoom();
    const heldRoom = accountEmail ? signedInHeld : null;
    const roomTo = heldRoom ? `/versus/${heldRoom.code}` : null;
    // Where the Play tab lands: the run if there is one, the build if one is half done,
    // otherwise the cover. The crest always returns to the cover.
    const playTo = roomTo ?? (resumeCupRun ? '/cup-run' : formation ? '/play' : '/');
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
    const continueAction =
        roomTo && heldRoom
            ? {
                  to: roomTo,
                  label: 'Back to your room',
                  sub: `Versus ${heldRoom.code} · ${heldRoom.line}`,
              }
            : resumeCupRun
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

                {/* One line saying you are holding a room, and taking you back to it. A
                    room runs on a clock somebody else is also watching, so wandering off
                    to the album has a cost the rest of the app does not. */}
                {heldRoom && roomTo && !isVersus && (
                    <Link
                        to={roomTo}
                        className="mb-4 flex items-center justify-between gap-3 rounded-md border border-pitch bg-pitch/10 px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-pitch-ink transition hover:bg-pitch/20"
                    >
                        <span className="truncate">
                            Versus {heldRoom.code} &middot; {heldRoom.line}
                        </span>
                        <span className="shrink-0">Back to it</span>
                    </Link>
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
                            onSetSpeed={build.setSpeed}
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
                            rememberAscension={rememberAscension}
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
                            versusTo={FEATURES.pvp ? '/versus' : undefined}
                            buildTo="/play"
                            onNewXi={handleReset}
                            allPlayers={poolPlayers}
                        />
                    ) : isVersus ? (
                        <VersusScreen signedIn={!!accountEmail} />
                    ) : isBuild ? (
                        <BuildSurface
                            build={build}
                            ownedStickerIds={ownedStickerIds}
                            budget={marketBudget}
                            controls={SOLO_CONTROLS}
                            // The single-player game always shows them; the switch is a
                            // room's, and only a roll room's (P5).
                            ratings
                            complete={
                                state.formation && (
                                    <CompletePanel
                                        formation={state.formation}
                                        filled={filled}
                                        style={state.style}
                                        onStartRun={() => {
                                            // Tell the run screen this navigation is a
                                            // kickoff, so it never has to infer that from
                                            // "no run in progress" - which a reload also
                                            // looks like.
                                            requestRunStart();
                                            navigate('/cup-run');
                                        }}
                                        onReset={handleReset}
                                        ascension={{
                                            tier: ascensionTier,
                                            max: ascensionMax,
                                            onSelect: pickAscension,
                                        }}
                                    />
                                )
                            }
                            onReset={handleReset}
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
                    pool={pool}
                    speed={speed}
                    onSetSpeed={build.setSpeed}
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
