import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Trophy, User } from 'lucide-react';
import { ALL_PLAYERS, SQUADS, squadsInPool } from './data/squads';
import type { Player, Position, Squad } from './data/types';
import { FORMATIONS_DATA, getFormation, STYLES } from './domain/formations';
import {
    canPlace,
    filledCount,
    isComplete,
    hasAnotherCup,
    hasAnotherTeam,
    placedPlayers,
    positionsWithOpenSlot,
    randomXI,
    rollAnotherCup,
    rollAnotherTeam,
    rollAny,
    STRENGTH_BANDS,
    type Filled,
    type TeamStrength,
} from './domain/draft';
import { KO_ROUNDS } from './domain/knockout';
import { extraRerollsOf, type CareerState } from './domain/career';
import { maxSelectableAscension } from './domain/ascension';
import { priceFor } from './domain/pricing';
import type { RunBuild, RunShape } from './domain/run';
import { canSwapInto } from './domain/album';
import { validateSquads } from './domain/validateSquads';
import { BUDGET_BY_TIER, FEATURES } from './config';
import { gameReducer, initialState, INITIAL_REROLLS, INITIAL_SWAPS } from './state/gameReducer';
import { useLiveMatch } from './nav/liveMatch';
import { SubTabs, TabBottomBar, TabRow, type TabItem } from './components/navUi';
import { requestRunStart } from './nav/pendingRun';
import { onStoreError, store, type AccountSnapshot } from './state/store';
import { useStickerAlbum } from './hooks/useStickerAlbum';
import { useSettings } from './hooks/useSettings';
import SettingsModal from './components/SettingsModal';
import AccountModal from './components/AccountModal';
import SetupPanel from './components/SetupPanel';
import SquadPanel, { type RerollKind } from './components/SquadPanel';
import BudgetMarket from './components/BudgetMarket';
import CompletePanel from './components/CompletePanel';
import ModeSelect from './components/ModeSelect';
import Pitch from './components/Pitch';
import BoxScore from './components/BoxScore';
import XiTable from './components/XiTable';
// Route-gated screens are code-split so the home/setup initial load stays small.
const SquadBrowser = lazy(() => import('./components/SquadBrowser'));
const AlbumScreen = lazy(() => import('./components/AlbumScreen'));
const ChallengesScreen = lazy(() => import('./components/ChallengesScreen'));
const CabinetScreen = lazy(() => import('./components/CabinetScreen'));
const CupRunScreen = lazy(() => import('./components/CupRunScreen'));
import RunEndOverlays from './components/RunEndOverlays';
import { StageHeader } from './components/matchUi';
const UnreachableScreen = lazy(() => import('./components/UnreachableScreen'));

/** True on the stacked (single-column) layout, i.e. below Tailwind's lg breakpoint.
 *  On that layout the squad list and pitch are stacked vertically, so we auto-scroll
 *  between them; on the wide layout they sit side by side and no scrolling is needed. */
const isStackedLayout = () =>
    typeof window !== 'undefined' && !window.matchMedia('(min-width: 1080px)').matches;

type HomeView = 'setup' | 'draft' | 'complete';

/** The transfer-market budget: the base one, raised by the owned `transfer-budget` perk
 *  tier. Every build is a career build, so there is no unscaled case. */
const budgetOf = (career: CareerState): number =>
    BUDGET_BY_TIER[Math.min(career.perkLevels['transfer-budget'] ?? 0, BUDGET_BY_TIER.length - 1)];

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
    const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
    // Budget build (transient, not persisted): the market player currently held and
    // the empty slot being shopped for. Both drive the shared pitch in budget mode.
    const [heldId, setHeldId] = useState<string | null>(null);
    const [budgetTargetId, setBudgetTargetId] = useState<string | null>(null);
    // The placed player picked up to be moved to another of his roles (transient, and
    // shared by both build methods since they share the pitch).
    const [movingSlotId, setMovingSlotId] = useState<string | null>(null);
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
    const stickers = useStickerAlbum(state, snapshot.album, poolPlayers);
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
    useEffect(() => onStoreError(setStoreError), []);
    const timerRef = useRef<number | null>(null);
    const animatingRef = useRef(false);
    const pitchRef = useRef<HTMLDivElement | null>(null);
    const squadRef = useRef<HTMLElement | null>(null);
    // Re-entry guard for the draw-next-squad effect: once it fires a roll for the
    // current committed state it stops until that roll settles (or a placement /
    // removal changes the state), so one open slot never triggers two rolls.
    const drawGuardRef = useRef(false);
    // The id of the last squad that was in hand, so the next auto-draw can exclude
    // it (never scramble straight back to the same squad). Cleared on reset.
    const lastSquadIdRef = useRef<string | null>(null);

    useEffect(
        () => () => {
            // Clear any in-flight scramble timer on unmount. Also reset the animation
            // flag so a roll that was interrupted here (e.g. React StrictMode's dev
            // remount clearing the timer while `rolling` is still true) is detected as
            // orphaned by the draw-next-squad effect and restarted, rather than leaving
            // the squad box stuck on "Drawing a squad...".
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = null;
            animatingRef.current = false;
        },
        [],
    );

    // Dev-time dataset integrity check: run the WP2 validator once on mount and
    // report any problems (silent when clean).
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const problems = validateSquads(SQUADS);
        if (problems.length === 0) {
            console.info('validateSquads: 0 problems');
        } else {
            console.error(`validateSquads: ${problems.length} problem(s)`, problems);
        }
    }, []);

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
        () => getFormation(FORMATIONS_DATA, formationName, style),
        [formationName, style],
    );
    // Home sub-view derived from the data, not `phase`: no formation -> setup;
    // formation but incomplete -> draft; complete XI -> complete (even once the
    // tournament has started, so Back to home shows the locked XI).
    const homeView: HomeView = !formation
        ? 'setup'
        : isComplete(formation, filled)
          ? 'complete'
          : 'draft';
    const activeFormation = homeView === 'setup' ? previewFormation : formation;

    // Mobile: when a player is picked, scroll the pitch to the top (with a little
    // margin via scroll-mt) so the user can tap an open slot. Scrolling back up to
    // the squad after placing is done in handlePlace.
    useEffect(() => {
        if (phase === 'draft' && selectedPlayerId && isStackedLayout()) {
            pitchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [selectedPlayerId, phase]);

    // Animate a scramble through random squads, then settle on `target`.
    const runRoll = useCallback((target: Squad | null, isReroll: boolean) => {
        if (!target || animatingRef.current) return;
        animatingRef.current = true;
        dispatch({ type: 'ROLL_START', isReroll });

        let delay = 55;
        let elapsed = 0;
        let lastIdx = -1;
        const spin = () => {
            // Cycle to a *different* squad each tick so the scramble reads clearly.
            let idx = Math.floor(Math.random() * SQUADS.length);
            if (SQUADS.length > 1 && idx === lastIdx) idx = (idx + 1) % SQUADS.length;
            lastIdx = idx;
            setDisplaySquad(SQUADS[idx]);
            elapsed += delay;
            delay = Math.min(delay * 1.13, 260);
            if (elapsed < 1300) {
                timerRef.current = window.setTimeout(spin, delay);
            } else {
                setDisplaySquad(target);
                dispatch({ type: 'ROLL_SETTLE', squad: target });
                animatingRef.current = false;
            }
        };
        spin();
    }, []);

    // Remember the squad currently in hand so the next auto-draw can exclude it.
    // Cleared back at setup (a fresh run) so the very first roll excludes nothing.
    useEffect(() => {
        if (phase === 'setup') lastSquadIdRef.current = null;
        else if (currentSquad) lastSquadIdRef.current = currentSquad.id;
    }, [phase, currentSquad]);

    // Draw the next squad from committed state. Whenever the draft has an open slot
    // and no squad in hand (and nothing is rolling), roll one. This is the single
    // owner of "draw the next squad": it subsumes the first roll on START_DRAFT,
    // the roll after a placement (PLACE_PLAYER clears currentSquad), and the roll
    // for a freed slot after REMOVE_PLAYER when the XI was complete. Rerolls stay
    // explicit (they keep a squad in hand / set rolling, so this never interferes).
    useEffect(() => {
        // Roll build only: the budget build has no rolling (its slots are filled by
        // buying), so it must never draw a squad.
        const needSquad = phase === 'draft' && build === 'roll' && !!formation && !currentSquad;
        // `rolling` is true but no animation is actually running: the in-flight
        // scramble was interrupted (a reload/StrictMode remount cleared its timer).
        // Recover by rolling again, otherwise the squad box stays on "Drawing...".
        const orphaned = needSquad && rolling && !animatingRef.current;
        const shouldDraw = (needSquad && !rolling) || orphaned;
        if (!shouldDraw) {
            // No draw pending (a squad is in hand, or a real roll is animating, or not
            // in the draft): release the guard so the next open slot triggers one roll.
            drawGuardRef.current = false;
            return;
        }
        // Guard against double rolls, except when recovering an orphaned roll.
        if (drawGuardRef.current && !orphaned) return;
        drawGuardRef.current = true;
        const open = positionsWithOpenSlot(formation, filled);
        const used = new Set(usedPersonIds);
        runRoll(rollAny(poolSquads, open, used, lastSquadIdRef.current), false);
    }, [
        phase,
        build,
        formation,
        currentSquad,
        rolling,
        filled,
        usedPersonIds,
        runRoll,
        poolSquads,
    ]);

    const handleStart = useCallback(() => {
        if (!previewFormation) return;
        // A fresh draft means a fresh team, so drop any in-progress Cup Run.
        void store.saveRun(null);
        // The Extra Re-roll perk tops up the base three. Read at the click (store.peek is
        // synchronous), so buying the perk in the hub and coming straight back applies
        // without a reload.
        const extraRerolls = extraRerollsOf(store.peek().career);
        // Just enter the draft; the draw-next-squad effect rolls the first squad
        // from committed state (an open slot with no squad in hand).
        dispatch({ type: 'START_DRAFT', formation: previewFormation, extraRerolls });
    }, [previewFormation]);

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
        setHeldId(null);
        setBudgetTargetId(null);
        dispatch({ type: 'START_BUDGET', formation: previewFormation });
    }, [previewFormation]);

    // Hold / release a market player (its eligible slots then pulse on the pitch).
    // Taking a card in hand drops a move in progress: only one thing is being aimed
    // at a time, and the last tap is what the user means.
    // Mobile: holding a card scrolls the pitch up, exactly as picking a drawn player does.
    // The roll draft gets that from the `selectedPlayerId` effect below; the market holds
    // its card in local state, so it never fired there - the same gesture with half the
    // help. `willHold` is computed here rather than inside the updater, because a scroll
    // is a side effect and setState updaters can run twice.
    const handleBudgetHold = useCallback(
        (player: Player) => {
            setMovingSlotId(null);
            const willHold = heldId !== player.id;
            setHeldId(willHold ? player.id : null);
            if (willHold && isStackedLayout()) {
                pitchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        [heldId],
    );

    // Same rule for a drawn-squad card.
    const handleSelectPlayer = useCallback((playerId: string) => {
        setMovingSlotId(null);
        dispatch({ type: 'SELECT_PLAYER', playerId });
    }, []);

    // Auto-fill: commit a full budget XI (the market computes it). AUTOFILL -> complete.
    const handleBudgetAutoFill = useCallback(
        (filledXi: Filled, usedPersonIds: string[]) => {
            if (!formation) return;
            setHeldId(null);
            setBudgetTargetId(null);
            dispatch({ type: 'AUTOFILL', formation, filled: filledXi, usedPersonIds });
        },
        [formation],
    );

    // Clear every bought player but stay in the budget build (re-enter it fresh).
    const handleBudgetClear = useCallback(() => {
        if (!formation) return;
        setHeldId(null);
        setBudgetTargetId(null);
        dispatch({ type: 'START_BUDGET', formation });
    }, [formation]);

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
            if (willPlace && isStackedLayout()) {
                squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        [formation, currentSquad, selectedPlayerId, filled],
    );

    // Swap the selected player into an already-filled slot (sticker album feature).
    // The reducer validates eligibility; the draw effect then rolls the next squad
    // for any still-open slot, exactly like a placement.
    const handleSwap = useCallback((slotId: string) => {
        dispatch({ type: 'SWAP_PLAYER', slotId });
        if (isStackedLayout()) {
            squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    // Testing aid: remove a placed player. The XI drops back to 'draft'; if no
    // squad is in hand (we were "complete"), the draw-next-squad effect rolls one
    // for the freed slot from committed state so a replacement can be drafted.
    const handleRemove = useCallback((slotId: string) => {
        dispatch({ type: 'REMOVE_PLAYER', slotId });
    }, []);

    // --- move a placed player within his position range -----------------------
    // Pick a placed player up, or put him back down if he is the one already held.
    // This is the other half of the rule above: it drops whatever card was selected in
    // the squad list or the market, so the two gestures overwrite each other in both
    // directions rather than one silently winning.
    const handleStartMove = useCallback((slotId: string) => {
        dispatch({ type: 'SELECT_PLAYER', playerId: null });
        setHeldId(null);
        setMovingSlotId((cur) => (cur === slotId ? null : slotId));
    }, []);
    // Drop him into the chosen slot. The reducer re-checks eligibility and ignores an
    // invalid pair, so a stale click cannot corrupt the XI.
    const handleMove = useCallback(
        (toSlotId: string) => {
            if (!movingSlotId) return;
            dispatch({ type: 'MOVE_PLAYER', fromSlotId: movingSlotId, toSlotId });
            setMovingSlotId(null);
        },
        [movingSlotId],
    );
    // A formation change (different slots) or leaving the build behind drops the move.
    // Deliberately NOT keyed on the selection: handleStartMove clears it, so watching it
    // here would have a move cancel itself the moment it began.
    useEffect(() => {
        setMovingSlotId(null);
    }, [activeFormation, phase]);

    // --- budget build: place / shop / remove on the shared pitch ---------------
    // Buy the held market player into an eligible slot, then shop the next empty one.
    const handleBudgetPlace = useCallback(
        (slotId: string) => {
            const player = heldId ? ALL_PLAYERS.find((p) => p.id === heldId) : null;
            if (!player || !formation) return;
            dispatch({ type: 'BUY_PLAYER', slotId, player });
            setHeldId(null);
            const next = formation.slots.find((s) => s.id !== slotId && !filled[s.id]);
            setBudgetTargetId(next ? next.id : null);
            // Mobile: back up to the market for the next position, as a placement does.
            if (isStackedLayout()) {
                squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        [heldId, formation, filled],
    );
    // Tap an empty slot with no eligible held player: shop that position instead.
    const handleBudgetShop = useCallback((slotId: string) => {
        setBudgetTargetId(slotId);
        setHeldId(null);
    }, []);
    // Remove a bought player (drops back to building) and shop that slot again.
    const handleBudgetRemove = useCallback((slotId: string) => {
        dispatch({ type: 'REMOVE_PLAYER', slotId });
        setBudgetTargetId(slotId);
        setHeldId(null);
    }, []);

    const handleReroll = useCallback(
        (kind: RerollKind) => {
            if (!formation || !currentSquad || rolling || rerollsLeft <= 0) return;
            const open = positionsWithOpenSlot(formation, filled);
            const used = new Set(usedPersonIds);
            const target =
                kind === 'team'
                    ? rollAnotherTeam(poolSquads, currentSquad, open, used)
                    : kind === 'cup'
                      ? rollAnotherCup(poolSquads, currentSquad, open, used)
                      : rollAny(poolSquads, open, used, currentSquad.id);
            runRoll(target, true);
        },
        [formation, currentSquad, filled, usedPersonIds, rerollsLeft, rolling, runRoll, poolSquads],
    );

    const handleReset = useCallback(() => {
        // A reset is a brand-new team, so drop any in-progress Cup Run too - and any
        // sticker summary still arriving for the run being abandoned.
        if (STICKERS) stickers.onNewRun();
        void store.saveRun(null);
        dispatch({ type: 'RESET' });
        // Re-open setup in the path that matches where the reset came from: stay on a
        // build route; a Cup Run -> the career build; a World Cup -> the quick build;
        // anywhere else -> the launcher.
        // One build route, so a reset always lands there and finding F8 (three different
        // answers to "go back") answers itself.
        navigate('/play');
        // `stickers.onNewRun` is a stable callback, so this stays referentially quiet.
    }, [navigate, location.pathname, STICKERS, stickers.onNewRun]);

    const openPositions = useMemo<Set<Position>>(
        () =>
            activeFormation ? positionsWithOpenSlot(activeFormation, filled) : new Set<Position>(),
        [activeFormation, filled],
    );
    // Ids of drawn-squad players that can be swapped in (collectible + swaps remain +
    // there's a filled slot they can take): a different-person slot when they're not
    // already in the XI, or their OWN slot as an upgrade (a different card of the same
    // person). Empty when the album is off / no swaps left, so gating is unchanged there.
    const swapEligibleIds = useMemo<Set<string>>(() => {
        const ids = new Set<string>();
        if (!STICKERS || swapsLeft <= 0 || !activeFormation || !currentSquad) return ids;
        const used = new Set(usedPersonIds);
        for (const p of currentSquad.players) {
            const ok = activeFormation.slots.some((s) => {
                const occ = filled[s.id];
                return !!occ && canSwapInto(p, occ, s.position, used);
            });
            if (ok) ids.add(p.id);
        }
        return ids;
    }, [STICKERS, swapsLeft, activeFormation, currentSquad, filled, usedPersonIds]);
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

    // Budget build: the effective empty slot being shopped (falls back to the first
    // open one) and the held market player - both drive the shared pitch.
    const isBudgetBuild = build === 'budget';
    const budgetTargetSlot =
        isBudgetBuild && activeFormation
            ? (activeFormation.slots.find((s) => s.id === budgetTargetId && !filled[s.id]) ??
              activeFormation.slots.find((s) => !filled[s.id]) ??
              null)
            : null;
    const heldPlayer =
        isBudgetBuild && heldId ? (ALL_PLAYERS.find((p) => p.id === heldId) ?? null) : null;

    // Page section header (eyebrow + heading), derived from the home sub-view.
    const home = homeCopy(homeView);

    // The completed XI (all slots filled) handed to a Cup Run; null until full.
    const draftedXi = useMemo<Player[] | null>(() => {
        if (!formation) return null;
        const ps = placedPlayers(formation, filled);
        return ps.length === formation.slots.length ? ps : null;
    }, [formation, filled]);

    // Route -> which screen. `location.pathname` is basename-relative. `/` is the front
    // page (the hero + the beats + one Continue), `/play` the build, `/cup-run` the run.
    const path = location.pathname;
    const squadsEnabled = FEATURES.squadBrowser;
    const isSquads = squadsEnabled && (path === '/squads' || path.startsWith('/squads/'));
    const isAlbum = STICKERS && path === '/album';
    const isCupRun = path === '/cup-run';
    const isLauncher = path === '/';
    const isBuild = path === '/play';
    // `/career` is the hub, split off the live run (finding F4); `/records` holds the two
    // honours screens as segments.
    //
    // The legacy aliases went on 2026-08-24: `/challenges` and `/cabinet` for the two
    // honours screens, and `/quick-run` + `/career-mode` for the build. They existed to
    // protect bookmarks made before the navigation rework, and the app has never been
    // live, so there are none. They now hit the catch-all redirect, exactly as `/group`
    // and `/knockout` already do. The two honours aliases were also a latent bug: this
    // block tested `tabsRecords` FIRST, and its definition already matched both of them,
    // so their own render arms were unreachable and the standalone header + Back crumb
    // they were documented as carrying never rendered.
    const isCareerHub = path === '/career';
    const tabsRecords = path === '/records' || path === '/records/cabinet';
    const recordsCabinet = FEATURES.trophyCabinet && path === '/records/cabinet';
    const albumSummary = stickers.summary;

    // The completed-challenge set. Same shape as careerPeek below: the career lives in
    // CupRunScreen, so it is re-read from the store whenever the route changes rather than
    // lifted into App. Read on every route, because the Records tab shows the count as its
    // sub-line.
    const challengeIds = useMemo(
        () => store.peek().career.completedChallenges,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [path],
    );

    // The career, re-read on every navigation (it lives in CupRunScreen otherwise), so
    // buying a perk in the hub and coming straight back to build applies. Not gated on
    // the build route the way the budget below is, because the kickoff build record is
    // computed on `/cup-run` too, where the budget in force is still the career one.
    const careerPeek = useMemo(
        () => store.peek().career,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [path],
    );
    // The Ascension picker's props for the build page: the tier in force and the highest
    // one currently selectable (unlocked AND level-gated).
    const ascensionMax = maxSelectableAscension(careerPeek.ascension, careerPeek.level);
    const ascensionTier = Math.min(ascension ?? careerPeek.lastAscension ?? ascensionMax, ascensionMax);
    const pickAscension = useCallback(
        (tier: number) => {
            setAscension(tier);
            const career = store.peek().career;
            if (career.lastAscension !== tier) void store.saveCareer({ ...career, lastAscension: tier });
        },
        [],
    );

    // Transfer-market budget, scaled by the owned `transfer-budget` perk tier. The build
    // record below reads the same figure, so what the market charged and what the run
    // recorded cannot drift.
    const budget = budgetOf(careerPeek);

    // What the build page knows and the run cannot work out afterwards: the shape the XI
    // kicks off in, and how it was assembled. Both are handed to `beginRun` so the
    // challenge catalogue can judge them (docs/challenges-spec.html, slices B and C).
    // Recorded at kickoff rather than derived at run end because placing a player
    // promotes the slot's role onto him, a roster boost changes the XI later, and the
    // album (and so the owned-sticker discount) keeps growing.
    const draftedShape = useMemo<RunShape | null>(() => {
        if (!formation || !draftedXi) return null;
        const slots = formation.slots.flatMap((s) => {
            const player = filled[s.id];
            return player ? [{ slotId: s.id, role: s.position, playerId: player.id }] : [];
        });
        return slots.length === formation.slots.length
            ? { formation: formation.name, style: formation.style, slots }
            : null;
    }, [formation, filled, draftedXi]);

    // The build record. The career's budget is the one in force, and this is also read
    // from `/cup-run`, one navigation after the market closed.
    const draftedBuild = useMemo<RunBuild | null>(() => {
        if (!draftedXi) return null;
        const swapsUsed = INITIAL_SWAPS - swapsLeft;
        if (build === 'budget') {
            const prices = draftedXi.map((p) => priceFor(p, ownedStickerIds));
            return {
                method: 'budget',
                budget: budgetOf(careerPeek),
                spent: prices.reduce((n, c) => n + c, 0),
                dearest: Math.max(...prices),
                discounted: draftedXi.filter((p) => ownedStickerIds.has(p.id)).length,
                swapsUsed,
            };
        }
        // The allowance is re-derived rather than remembered, so buying the Extra Re-roll
        // perk in the middle of a draft (which does not top up the re-rolls already
        // granted) would read as one more used than there was. It costs a reducer field
        // to make exact and the window is narrow, so this follows the plan's formula.
        const allowance = INITIAL_REROLLS + extraRerollsOf(careerPeek);
        return { method: 'roll', rerollsUsed: Math.max(0, allowance - rerollsLeft), swapsUsed };
    }, [draftedXi, build, careerPeek, ownedStickerIds, rerollsLeft, swapsLeft]);

    // Launcher-only read, refreshed whenever we land on `/`: a Cup Run that is
    // mid-flight (not yet ended), with a short round summary for the resume button.
    // Null when there is nothing to resume.
    const resumeCupRun = useMemo(() => {
        const r = store.peek().run;
        if (!r || r.phase === 'ended') return null;
        const round = r.phase === 'group' ? 'Group stage' : (KO_ROUNDS[r.koRound] ?? 'Knockouts');
        const opp = r.nextOpponent ? ` · vs ${r.nextOpponent.name} ${r.nextOpponent.year}` : '';
        return { summary: round + opp, round };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLauncher, path]);

    // Launcher-only read: an XI left mid-build, so coming back to the site is not a
    // dead end. Only when there is nothing further along to resume (an in-progress Cup
    // Run already covers that, and implies a finished XI).
    const resumeBuild = useMemo(() => {
        if (!formation || resumeCupRun) return null;
        const picked = filledCount(formation, filled);
        if (picked === 0) return null;
        const to = '/play';
        return picked === formation.slots.length
            ? { to, label: 'Your XI is ready', sub: formation.name }
            : {
                  to,
                  label: 'Finish your XI',
                  sub: `${formation.name} · ${picked} of ${formation.slots.length} picked`,
              };
    }, [isLauncher, formation, filled, resumeCupRun]);

    // ---------------------------------------------------------------- tabs chrome
    // A match reveal is transient state (deliberately not persisted), so the bar goes
    // inert while one plays, exactly as the run ladder already does.
    const liveMatch = useLiveMatch();
    // Where the Play tab lands: the run if there is one, the build if one is half done,
    // otherwise the cover. The crest always returns to the cover.
    const playTo = resumeCupRun ? '/cup-run' : formation ? '/play' : '/';
    const isPlayTab = isLauncher || isBuild || isCupRun;
    const tabs: TabItem[] = (
        [
              {
                  key: 'play' as const,
                  label: 'Play',
                  // Route first, then the stored progress. The resume reads below are
                  // refreshed on navigation only (`store.peek`, the existing pattern in
                  // this file), so a run started without navigating would leave a stale
                  // sub-line; where you are is always current.
                  sub: isCupRun
                      ? (resumeCupRun?.round ?? 'Cup Run')
                      : resumeCupRun
                        ? resumeCupRun.round
                        : formation && homeView !== 'setup'
                          ? `${filledCount(formation, filled)} of ${formation.slots.length}`
                          : undefined,
                  to: playTo,
                  active: isPlayTab,
              },
              {
                  key: 'career' as const,
                  label: 'Career',
                  sub: `Lv ${careerPeek.level} · ${careerPeek.prestige}`,
                  to: '/career',
                  active: isCareerHub,
              },
              STICKERS && {
                  key: 'album' as const,
                  label: 'Album',
                  sub: albumSummary
                      ? `${albumSummary.collected} / ${albumSummary.total}`
                      : undefined,
                  to: '/album',
                  active: isAlbum,
              },
              (FEATURES.challenges || FEATURES.trophyCabinet) && {
                  key: 'records' as const,
                  label: 'Records',
                  sub: FEATURES.challenges ? `${challengeIds.length} earned` : undefined,
                  to: FEATURES.challenges ? '/records' : '/records/cabinet',
                  active: tabsRecords,
              },
              squadsEnabled && {
                  key: 'squads' as const,
                  label: 'Squads',
                  sub: `${settings.settings.poolYears.length} cups`,
                  to: '/squads/by-world-cup',
                  active: isSquads,
              },
        ] as (TabItem | false)[]
    ).filter(Boolean) as TabItem[];

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
                {/* No bottom rule: the tab row below carries it, so the tabs read as part
                    of the identity block rather than as a strip under it. */}
                <header className="flex items-center gap-3 pb-3">
                    <Link
                        to="/"
                        aria-label="World Cup Simulator - home"
                        className="flex items-center gap-3 transition hover:opacity-90"
                    >
                        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[6px] bg-pitch-dark">
                            <Trophy size={21} strokeWidth={2} className="text-amber" />
                        </span>
                        <h1 className="font-display text-[23px] font-black uppercase leading-none tracking-[-0.02em]">
                            World Cup <span className="text-pitch">Simulator</span>
                        </h1>
                    </Link>
                    <span className="border-l border-line pl-3.5 text-[12.5px] text-muted max-sm:hidden">
                        Draft a random XI. Win the cup.
                    </span>
                    <div className="ml-auto flex items-center gap-2.5">
                        {/* Accounts (gated): its own button and its own dialog, rather
                            than a section inside the settings sheet. Signed in it shows
                            who you are. */}
                        {FEATURES.accounts && (
                            <button
                                type="button"
                                onClick={() => setAccountOpen(true)}
                                title={accountEmail ?? 'Sign in to keep your album on every device'}
                                className="flex h-[33px] shrink-0 items-center gap-1.5 rounded-[5px] border border-line bg-panel px-2.5 text-[12px] font-semibold text-muted transition hover:border-pitch hover:text-pitch"
                            >
                                <User size={15} strokeWidth={2.2} />
                                <span className="max-sm:hidden">
                                    {accountEmail ? accountEmail.split('@')[0] : 'Sign in'}
                                </span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            aria-label="Settings"
                            title="Settings"
                            className="grid h-[33px] w-[33px] shrink-0 place-items-center rounded-[5px] border border-line bg-panel text-muted transition hover:border-pitch hover:text-pitch"
                        >
                            <SettingsIcon size={17} strokeWidth={2} />
                        </button>
                    </div>
                </header>

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
                                    career={careerPeek}
                                    album={stickers.album}
                                    allPlayers={poolPlayers}
                                />
                            ) : (
                                <ChallengesScreen completed={challengeIds} />
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
                        <>
                            <div className="mb-5 mt-7 flex items-center gap-4">
                                <div>
                                    <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                                        {home.eyebrow}
                                    </div>
                                    <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                                        {home.title}
                                    </h2>
                                </div>
                                <div className="relative h-0 flex-1 border-t-2 border-line">
                                    <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                                </div>
                            </div>
                            {/* One column below 760, two to 1080, three above; the source
                                panel (setup / drawn squad / market / complete) is always
                                FIRST on a phone, then the pitch, then the ratings.
                                The tabs navigation briefly put the pitch first (item 27's
                                decision D, on the reasoning that the thing you tap was
                                sandwiched between the panel you pick from and the ratings
                                you check). Reverted 2026-08-21: that problem was already
                                solved by motion rather than by order - picking a player
                                scrolls the pitch up, placing him scrolls the panel back -
                                and pitch-first breaks the pairing, because scrolling "to
                                the pitch" is a no-op when the pitch is already at the top
                                and the return scroll then travels the wrong way. */}
                            <div className="grid items-start gap-[22px] [grid-template-areas:'sum'_'board'_'stack'] [grid-template-columns:1fr] min-[760px]:[grid-template-areas:'sum_stack'_'board_board'] min-[760px]:[grid-template-columns:1fr_1fr] min-[1080px]:[grid-template-areas:'sum_board_stack'] min-[1080px]:[grid-template-columns:300px_minmax(0,1fr)_320px]">
                                {/* Col 1: setup -> drawn squad -> complete */}
                                <aside ref={squadRef} className="scroll-mt-6 [grid-area:sum]">
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
                                            onSelectStyle={(s) =>
                                                dispatch({ type: 'SET_STYLE', style: s })
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
                                                budget={budget}
                                                poolPlayers={poolPlayers}
                                                targetSlot={budgetTargetSlot}
                                                heldPlayer={heldPlayer}
                                                onHold={handleBudgetHold}
                                                onAutoFill={handleBudgetAutoFill}
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
                                                onReroll={handleReroll}
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
                                </aside>

                                {/* Col 2: the pitch. Col 3: ratings + chemistry + line-up sheet
              stacked, matching the turf-flat comp. On narrow widths the grid
              areas restack to settings, pitch, then the stack. */}
                                {activeFormation ? (
                                    <>
                                        <section
                                            ref={pitchRef}
                                            className="scroll-mt-6 [grid-area:board]"
                                        >
                                            <Pitch
                                                formation={activeFormation}
                                                filled={filled}
                                                selectedPlayer={
                                                    isBudgetBuild ? heldPlayer : selectedPlayer
                                                }
                                                onPlace={
                                                    isBudgetBuild ? handleBudgetPlace : handlePlace
                                                }
                                                onRemove={
                                                    isBudgetBuild
                                                        ? handleBudgetRemove
                                                        : FEATURES.removePlayers
                                                          ? handleRemove
                                                          : undefined
                                                }
                                                onSwap={
                                                    isBudgetBuild
                                                        ? undefined
                                                        : STICKERS && swapsLeft > 0
                                                          ? handleSwap
                                                          : undefined
                                                }
                                                onSelectSlot={
                                                    isBudgetBuild ? handleBudgetShop : undefined
                                                }
                                                targetSlotId={
                                                    isBudgetBuild ? budgetTargetSlot?.id : undefined
                                                }
                                                // Moving a placed player. Offered even
                                                // with a card in hand: a slot the held
                                                // card can swap into keeps the swap, and
                                                // anywhere else the tap picks the placed
                                                // player up instead, dropping the card.
                                                onStartMove={
                                                    FEATURES.movePlayers
                                                        ? handleStartMove
                                                        : undefined
                                                }
                                                movingSlotId={movingSlotId}
                                                onMove={
                                                    FEATURES.movePlayers ? handleMove : undefined
                                                }
                                            />
                                        </section>
                                        <section className="flex flex-col gap-[18px] [grid-area:stack]">
                                            <BoxScore formation={activeFormation} filled={filled} />
                                            <XiTable
                                                formation={activeFormation}
                                                filled={filled}
                                                budget={isBudgetBuild ? budget : undefined}
                                                ownedStickerIds={ownedStickerIds}
                                            />
                                        </section>
                                    </>
                                ) : (
                                    <div className="mx-auto flex aspect-[3/4] w-full max-w-[560px] items-center justify-center rounded-md border border-dashed border-line text-muted [grid-area:board]">
                                        Loading formations…
                                    </div>
                                )}
                            </div>
                        </>
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
