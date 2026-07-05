import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Swords, Trophy } from 'lucide-react';
import { SQUADS } from './data/squads';
import type { Player, Position, Squad } from './data/types';
import { FORMATIONS_DATA, getFormation, STYLES } from './domain/formations';
import {
    canPlace,
    filledCount,
    isComplete,
    hasAnotherCup,
    hasAnotherTeam,
    positionsWithOpenSlot,
    randomXI,
    rollAnotherCup,
    rollAnotherTeam,
    rollAny,
    STRENGTH_BANDS,
    type Filled,
    type TeamStrength,
} from './domain/draft';
import {
    bracketSeedFromGroup,
    createGroup,
    isGroupFinished,
    pickOpponents,
    userAdvanced,
    userGroupTeam,
} from './domain/tournament';
import { teamChemistry } from './domain/chemistry';
import { buildBracket, BRACKET_ROUNDS, type BracketState } from './domain/bracket';
import {
    albumStats,
    applyRunStickers,
    executeTrade,
    isCollectible,
    pendingNewStickers,
    type AlbumState,
} from './domain/album';
import { validateSquads } from './domain/validateSquads';
import { FEATURES, type StickerTier } from './config';
import { gameReducer, initialState } from './state/gameReducer';
import { loadGame, saveGame } from './state/persist';
import { loadAlbum, saveAlbum, loadStats, saveStats } from './state/albumStorage';
import SetupPanel from './components/SetupPanel';
import SquadPanel, { type RerollKind } from './components/SquadPanel';
import CompletePanel from './components/CompletePanel';
import Pitch from './components/Pitch';
import BoxScore from './components/BoxScore';
import XiTable from './components/XiTable';
import TournamentScreen from './components/TournamentScreen';
import KnockoutScreen from './components/KnockoutScreen';
import SquadBrowser from './components/SquadBrowser';
import AlbumScreen from './components/AlbumScreen';
import CupRunScreen from './components/CupRunScreen';
import BudgetDraftScreen from './components/BudgetDraftScreen';
import CupRewardPicker from './components/CupRewardPicker';
import RunEndStickerSummary from './components/RunEndStickerSummary';

/** True on the stacked (single-column) layout, i.e. below Tailwind's lg breakpoint.
 *  On that layout the squad list and pitch are stacked vertically, so we auto-scroll
 *  between them; on the wide layout they sit side by side and no scrolling is needed. */
const isStackedLayout = () =>
    typeof window !== 'undefined' && !window.matchMedia('(min-width: 1080px)').matches;

/** The masthead status stamp for the knockout screen (round name, or the outcome
 *  once the run is over). */
function knockoutStamp(bracket: BracketState | null): string {
    if (bracket?.outcome === 'champion') return 'Champions';
    if (bracket?.outcome === 'out') return 'Eliminated';
    return BRACKET_ROUNDS[bracket?.current ?? 0];
}

type HomeView = 'setup' | 'draft' | 'complete';

/** Section eyebrow/title + masthead stamp for the home screen, by sub-view. The
 *  home sub-view is derived from the drafted data (not `phase`), so navigating
 *  Back to home mid-tournament still reads as the locked XI. */
function homeCopy(view: HomeView, placed: number): { eyebrow: string; title: string; stamp: string } {
    const eyebrow = view === 'complete' ? 'Confirmed line-up' : 'Team sheet';
    const title =
        view === 'setup'
            ? 'Set your formation'
            : view === 'draft'
              ? 'Build your XI'
              : 'Your XI is set';
    const stamp =
        view === 'setup'
            ? 'Set up · 11 to pick'
            : view === 'draft'
              ? `Drafting · ${placed}/11`
              : 'Team sheet · locked';
    return { eyebrow, title, stamp };
}

export default function App() {
    const [state, dispatch] = useReducer(gameReducer, initialState, () => loadGame() ?? initialState);
    const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
    const location = useLocation();
    const navigate = useNavigate();

    // Sticker album (gated). Lives outside the reducer / game state and in its own
    // localStorage key, so resetting a run never touches the collection (FR-7).
    const STICKERS = FEATURES.stickerAlbum;
    const allPlayers = useMemo(() => SQUADS.flatMap((s) => s.players), []);
    const [album, setAlbum] = useState<AlbumState>(() =>
        STICKERS ? loadAlbum() : { version: 1, collected: [], duplicates: {} },
    );
    /** New (non-duplicate) ids earned this run -> shows the run-end summary. */
    const [newStickerIds, setNewStickerIds] = useState<string[] | null>(null);
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
        formation,
        filled,
        currentSquad,
        selectedPlayerId,
        usedPersonIds,
        rerollsLeft,
        rolling,
        group,
        bracket,
        speed,
        auto,
        stickersApplied,
        swapsLeft,
    } = state;

    // Persist the whole game so the clean-path routes survive a refresh.
    useEffect(() => {
        saveGame(state);
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
        const needSquad = phase === 'draft' && !!formation && !currentSquad;
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
        runRoll(rollAny(SQUADS, open, used, lastSquadIdRef.current), false);
    }, [phase, formation, currentSquad, rolling, filled, usedPersonIds, runRoll]);

    const handleStart = useCallback(() => {
        if (!previewFormation) return;
        // Just enter the draft; the draw-next-squad effect rolls the first squad
        // from committed state (an open slot with no squad in hand).
        dispatch({ type: 'START_DRAFT', formation: previewFormation });
    }, [previewFormation]);

    // Testing shortcut: auto-pick a full valid XI (within a strength band) and
    // jump straight to "complete".
    const handleRandomTeam = useCallback(
        (tier: TeamStrength) => {
            if (!previewFormation) return;
            const { filled, usedPersonIds } = randomXI(
                previewFormation,
                SQUADS,
                STRENGTH_BANDS[tier],
            );
            dispatch({ type: 'AUTOFILL', formation: previewFormation, filled, usedPersonIds });
        },
        [previewFormation],
    );

    // Budget market: load the hand-picked XI into the game (same as a rolled draft's
    // completion) and go to the complete panel.
    const handleBudgetConfirm = useCallback(
        (filled: Filled, usedPersonIds: string[]) => {
            if (!previewFormation) return;
            dispatch({ type: 'AUTOFILL', formation: previewFormation, filled, usedPersonIds });
            navigate('/');
        },
        [previewFormation, navigate],
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
            if (willPlace && isStackedLayout()) {
                squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        [formation, currentSquad, selectedPlayerId, filled],
    );

    // Swap the selected player into an already-filled slot (sticker album feature).
    // The reducer validates eligibility; the draw effect then rolls the next squad
    // for any still-open slot, exactly like a placement.
    const handleSwap = useCallback(
        (slotId: string) => {
            dispatch({ type: 'SWAP_PLAYER', slotId });
            if (isStackedLayout()) {
                squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        [],
    );

    // Testing aid: remove a placed player. The XI drops back to 'draft'; if no
    // squad is in hand (we were "complete"), the draw-next-squad effect rolls one
    // for the freed slot from committed state so a replacement can be drafted.
    const handleRemove = useCallback(
        (slotId: string) => {
            dispatch({ type: 'REMOVE_PLAYER', slotId });
        },
        [],
    );

    const handleReroll = useCallback(
        (kind: RerollKind) => {
            if (!formation || !currentSquad || rolling || rerollsLeft <= 0) return;
            const open = positionsWithOpenSlot(formation, filled);
            const used = new Set(usedPersonIds);
            const target =
                kind === 'team'
                    ? rollAnotherTeam(SQUADS, currentSquad, open, used)
                    : kind === 'cup'
                      ? rollAnotherCup(SQUADS, currentSquad, open, used)
                      : rollAny(SQUADS, open, used, currentSquad.id);
            runRoll(target, true);
        },
        [formation, currentSquad, filled, usedPersonIds, rerollsLeft, rolling, runRoll],
    );

    const handleStartGroup = useCallback(() => {
        // Already drawn (e.g. navigated Back to home): just return to the group.
        if (group) {
            navigate('/group');
            return;
        }
        if (!formation) return;
        const players = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
        const bonus = FEATURES.chemistry ? teamChemistry(formation, filled).bonus : 0;
        dispatch({
            type: 'START_GROUP',
            group: createGroup(userGroupTeam(players, bonus), pickOpponents(3)),
        });
        navigate('/group');
    }, [group, formation, filled, navigate]);

    const handleEnterKnockout = useCallback(() => {
        // Already built (navigated Back to the group): just return to the bracket.
        if (bracket) {
            navigate('/knockout');
            return;
        }
        if (!group) return;
        const { user, coQualifier, excludeIds } = bracketSeedFromGroup(group);
        dispatch({
            type: 'START_BRACKET',
            bracket: buildBracket(user, coQualifier, excludeIds),
        });
        navigate('/knockout');
    }, [bracket, group, navigate]);

    const handleReset = useCallback(() => {
        dispatch({ type: 'RESET' });
        navigate('/');
    }, [navigate]);

    // --- sticker album -----------------------------------------------------
    // Collectibles in the final XI (derived, so autofill and swaps are handled for
    // free - no incremental pending log to keep in sync).
    const draftedCollectibleIds = useMemo(
        () =>
            Object.values(filled)
                .filter((p): p is Player => !!p)
                .filter(isCollectible)
                .map((p) => p.id),
        [filled],
    );

    // The run's terminal state (persistent): group elimination, or the bracket end.
    const runEnd = useMemo<{ wonCup: boolean } | null>(() => {
        if (!STICKERS) return null;
        if (bracket) {
            if (bracket.outcome === 'champion') return { wonCup: true };
            if (bracket.outcome === 'out') return { wonCup: false };
            return null;
        }
        if (group && isGroupFinished(group) && !userAdvanced(group)) return { wonCup: false };
        return null;
    }, [STICKERS, bracket, group]);

    const applyStickers = useCallback(
        (wonCup: boolean, cupPickId: string | null) => {
            const ids = cupPickId ? [...draftedCollectibleIds, cupPickId] : draftedCollectibleIds;
            const newly = pendingNewStickers(album, ids);
            const next = applyRunStickers(album, draftedCollectibleIds, wonCup, cupPickId);
            setAlbum(next);
            saveAlbum(next);
            const stats = loadStats();
            saveStats({
                runsPlayed: stats.runsPlayed + 1,
                stickersEarned: stats.stickersEarned + newly.length,
                tradesCompleted: stats.tradesCompleted,
            });
            dispatch({ type: 'MARK_STICKERS_APPLIED' });
            setNewStickerIds(newly);
        },
        [album, draftedCollectibleIds],
    );

    // Bank stickers once when the run ends by loss/elimination. Cup wins wait for
    // the reward pick (CupRewardPicker below), which then calls applyStickers.
    useEffect(() => {
        if (!STICKERS || stickersApplied || !runEnd || runEnd.wonCup) return;
        applyStickers(false, null);
    }, [STICKERS, stickersApplied, runEnd, applyStickers]);

    const handleTrade = useCallback(
        (tier: StickerTier, playerId: string) => {
            const next = executeTrade(album, tier, playerId);
            setAlbum(next);
            saveAlbum(next);
            const stats = loadStats();
            saveStats({ ...stats, tradesCompleted: stats.tradesCompleted + 1 });
        },
        [album],
    );

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
            if (!isCollectible(p)) continue;
            const ok = activeFormation.slots.some((s) => {
                const occ = filled[s.id];
                if (!occ || !p.positions.includes(s.position)) return false;
                return occ.personId === p.personId ? occ.id !== p.id : !used.has(p.personId);
            });
            if (ok) ids.add(p.id);
        }
        return ids;
    }, [STICKERS, swapsLeft, activeFormation, currentSquad, filled, usedPersonIds]);
    const usedSet = useMemo(() => new Set(usedPersonIds), [usedPersonIds]);
    const selectedPlayer = currentSquad?.players.find((p) => p.id === selectedPlayerId) ?? null;
    const panelSquad = rolling ? displaySquad : currentSquad;
    const availableStyles = FORMATIONS_DATA.stylesByName[formationName] ?? STYLES;

    // Page section header (eyebrow + heading) and the masthead status stamp, both
    // phase-dependent. The stamp is null on the tournament screens (their own header).
    const placed = activeFormation ? filledCount(activeFormation, filled) : 0;
    const home = homeCopy(homeView, placed);

    // The completed XI (all slots filled) handed to a Cup Run, with its chemistry bonus.
    const cupRunXi =
        formation &&
        (() => {
            const ps = formation.slots
                .map((s) => filled[s.id])
                .filter((p): p is Player => !!p);
            return ps.length === formation.slots.length ? ps : null;
        })();
    const draftedXi = cupRunXi || null;
    const cupRunChemistry =
        draftedXi && formation && FEATURES.chemistry ? teamChemistry(formation, filled).bonus : 0;

    // Route -> which screen. `location.pathname` is basename-relative.
    const path = location.pathname;
    const squadsEnabled = FEATURES.squadBrowser;
    const isSquads = squadsEnabled && (path === '/squads' || path.startsWith('/squads/'));
    const isAlbum = STICKERS && path === '/album';
    const isCupRun = FEATURES.careerMode && path === '/cup-run';
    const isBudget = FEATURES.budgetDraft && path === '/build';
    const isGroup = path === '/group';
    const isKnockout = path === '/knockout';
    const isHome = path === '/';
    // Where "Play" returns to: the furthest game screen reached.
    const gameRoute = bracket ? '/knockout' : group ? '/group' : '/';
    const albumSummary = STICKERS ? albumStats(album, allPlayers) : null;
    const stampText = isSquads
        ? null
        : isAlbum
          ? 'Sticker album'
          : isGroup
            ? 'Group stage'
            : isKnockout
              ? knockoutStamp(bracket)
              : home.stamp;

    return (
        <div className="min-h-full text-ink">
            <div className="mx-auto max-w-[1180px] px-[22px] pb-20 pt-5">
                <header className="flex items-center gap-3 border-b-2 border-ink pb-4">
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
                        {stampText && (
                            <span className="rounded-[3px] border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted max-sm:hidden">
                                {stampText}
                            </span>
                        )}
                        {squadsEnabled && (
                            <div className="flex overflow-hidden rounded-[5px] border border-line">
                                {(
                                    [
                                        ['Play', gameRoute, !isSquads],
                                        ['Squads', '/squads/by-world-cup', isSquads],
                                    ] as const
                                ).map(([label, to, active]) => (
                                    <Link
                                        key={label}
                                        to={to}
                                        className={[
                                            'border-r border-line px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition last:border-r-0',
                                            active
                                                ? 'bg-ink text-ground'
                                                : 'bg-white text-muted hover:text-pitch',
                                        ].join(' ')}
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </header>

                {isSquads ? (
                    <SquadBrowser />
                ) : isCupRun ? (
                    <CupRunScreen
                        draftedXi={draftedXi}
                        chemistryBonus={cupRunChemistry}
                        onReDraft={handleReset}
                    />
                ) : isBudget ? (
                    <BudgetDraftScreen
                        formation={previewFormation}
                        onConfirm={handleBudgetConfirm}
                    />
                ) : isAlbum ? (
                    <AlbumScreen
                        album={album}
                        allPlayers={allPlayers}
                        onTrade={handleTrade}
                        onClose={() => navigate('/')}
                    />
                ) : isGroup ? (
                    group && formation ? (
                        <TournamentScreen
                            group={group}
                            formation={formation}
                            filled={filled}
                            speed={speed}
                            auto={auto}
                            onSetAuto={(a) => dispatch({ type: 'SET_AUTO', auto: a })}
                            onSetSpeed={(s) => dispatch({ type: 'SET_SPEED', speed: s })}
                            onRecordMatchday={(results) =>
                                dispatch({ type: 'RECORD_MATCHDAY', results })
                            }
                            onEnterKnockout={handleEnterKnockout}
                            hasBracket={!!bracket}
                            onReset={handleReset}
                        />
                    ) : (
                        <Navigate to="/" replace />
                    )
                ) : isKnockout ? (
                    bracket && group && formation ? (
                        <KnockoutScreen
                            bracket={bracket}
                            group={group}
                            formation={formation}
                            filled={filled}
                            speed={speed}
                            auto={auto}
                            onSetAuto={(a) => dispatch({ type: 'SET_AUTO', auto: a })}
                            onSetSpeed={(s) => dispatch({ type: 'SET_SPEED', speed: s })}
                            onRecordRound={(games) =>
                                dispatch({ type: 'RECORD_BRACKET_ROUND', games })
                            }
                            onViewGroup={() => navigate('/group')}
                            onReset={handleReset}
                        />
                    ) : (
                        <Navigate to="/" replace />
                    )
                ) : isHome ? (
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
                    <div className="grid items-start gap-[22px] [grid-template-areas:'sum'_'board'_'stack'] [grid-template-columns:1fr] min-[760px]:[grid-template-areas:'sum_stack'_'board_board'] min-[760px]:[grid-template-columns:1fr_1fr] min-[1080px]:[grid-template-areas:'sum_board_stack'] min-[1080px]:[grid-template-columns:300px_minmax(0,1fr)_320px]">
                        {/* Col 1: setup -> drawn squad -> complete */}
                        <aside ref={squadRef} className="scroll-mt-6 [grid-area:sum]">
                            {STICKERS && albumSummary && (
                                <Link
                                    to="/album"
                                    className="mb-4 flex w-full items-center gap-3 rounded-md border border-line bg-panel px-3.5 py-3 text-left shadow-hard transition hover:border-pitch"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] bg-pitch-dark">
                                        <Trophy size={18} strokeWidth={2} className="text-amber" />
                                    </span>
                                    <span className="flex flex-col leading-tight">
                                        <b className="font-display text-[14px] font-extrabold">
                                            Sticker album
                                        </b>
                                        <span className="font-mono text-[11px] text-muted">
                                            {albumSummary.collected} / {albumSummary.total} collected
                                        </span>
                                    </span>
                                    <ArrowRight size={15} strokeWidth={2.5} className="ml-auto text-pitch" />
                                </Link>
                            )}
                            {FEATURES.careerMode && (
                                <Link
                                    to="/cup-run"
                                    className="mb-4 flex w-full items-center gap-3 rounded-md border border-line bg-panel px-3.5 py-3 text-left shadow-hard transition hover:border-pitch"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] bg-pitch-dark">
                                        <Swords size={18} strokeWidth={2} className="text-amber" />
                                    </span>
                                    <span className="flex flex-col leading-tight">
                                        <b className="font-display text-[14px] font-extrabold">
                                            Cup Run <span className="text-muted">(beta)</span>
                                        </b>
                                        <span className="font-mono text-[11px] text-muted">
                                            Roguelike draft + boons
                                        </span>
                                    </span>
                                    <ArrowRight size={15} strokeWidth={2.5} className="ml-auto text-pitch" />
                                </Link>
                            )}
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
                                    onSelectStyle={(s) => dispatch({ type: 'SET_STYLE', style: s })}
                                    onStart={handleStart}
                                    onRandomTeam={handleRandomTeam}
                                    onBudgetDraft={
                                        FEATURES.budgetDraft ? () => navigate('/build') : undefined
                                    }
                                />
                            )}
                            {homeView === 'draft' && formation && (
                                <SquadPanel
                                    squad={panelSquad}
                                    rolling={rolling}
                                    rerollsLeft={rerollsLeft}
                                    canAnotherTeam={
                                        !!currentSquad && hasAnotherTeam(SQUADS, currentSquad)
                                    }
                                    canAnotherCup={
                                        !!currentSquad && hasAnotherCup(SQUADS, currentSquad)
                                    }
                                    openPositions={openPositions}
                                    swapEligibleIds={swapEligibleIds}
                                    swapsLeft={swapsLeft}
                                    usedPersonIds={usedSet}
                                    selectedPlayerId={selectedPlayerId}
                                    onReroll={handleReroll}
                                    onSelectPlayer={(playerId) =>
                                        dispatch({ type: 'SELECT_PLAYER', playerId })
                                    }
                                    onReset={handleReset}
                                />
                            )}
                            {homeView === 'complete' && formation && (
                                <CompletePanel
                                    formation={formation}
                                    filled={filled}
                                    style={style}
                                    onStart={handleStartGroup}
                                    onCupRun={
                                        FEATURES.careerMode ? () => navigate('/cup-run') : undefined
                                    }
                                    onReset={handleReset}
                                />
                            )}
                        </aside>

                        {/* Col 2: the pitch. Col 3: ratings + chemistry + line-up sheet
              stacked, matching the turf-flat comp. On narrow widths the grid
              areas restack to settings, pitch, then the stack. */}
                        {activeFormation ? (
                            <>
                                <section ref={pitchRef} className="scroll-mt-6 [grid-area:board]">
                                    <Pitch
                                        formation={activeFormation}
                                        filled={filled}
                                        selectedPlayer={selectedPlayer}
                                        onPlace={handlePlace}
                                        onRemove={FEATURES.removePlayers ? handleRemove : undefined}
                                        onSwap={STICKERS && swapsLeft > 0 ? handleSwap : undefined}
                                    />
                                </section>
                                <section className="flex flex-col gap-[18px] [grid-area:stack]">
                                    <BoxScore
                                        formation={activeFormation}
                                        filled={filled}
                                        showChemistry
                                    />
                                    <XiTable formation={activeFormation} filled={filled} />
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
            </div>

            {/* Run-end sticker flow (global overlays, layered over any screen).
                Cup win: pick a bonus sticker first (blocks until picked), then the
                summary. Loss/elimination: the effect above already applied, so only
                the summary shows (when at least one new sticker was earned). */}
            {STICKERS && runEnd?.wonCup && !stickersApplied && (
                <CupRewardPicker
                    album={album}
                    allPlayers={allPlayers}
                    onPick={(playerId) => applyStickers(true, playerId)}
                />
            )}
            {STICKERS && newStickerIds && newStickerIds.length > 0 && (
                <RunEndStickerSummary
                    newPlayerIds={newStickerIds}
                    allPlayers={allPlayers}
                    onClose={() => setNewStickerIds(null)}
                    onViewAlbum={() => {
                        setNewStickerIds(null);
                        navigate('/album');
                    }}
                />
            )}
        </div>
    );
}
