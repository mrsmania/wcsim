import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { SQUADS } from './data/squads';
import type { Player, Position, Squad } from './data/types';
import { FORMATIONS_DATA, getFormation, STYLES } from './domain/formations';
import {
    canPlace,
    filledCount,
    hasAnotherCup,
    hasAnotherTeam,
    positionsWithOpenSlot,
    randomXI,
    rollAnotherCup,
    rollAnotherTeam,
    rollAny,
    STRENGTH_BANDS,
    type TeamStrength,
} from './domain/draft';
import {
    createGroup,
    isGroupFinished,
    pickOpponents,
    userAdvanced,
    userGroupTeam,
} from './domain/tournament';
import { teamChemistry } from './domain/chemistry';
import { createKnockout, KO_ROUNDS } from './domain/knockout';
import { FEATURES } from './config';
import { gameReducer, initialState } from './state/gameReducer';
import type { MatchSpeed } from './domain/clock';
import SetupPanel from './components/SetupPanel';
import SquadPanel, { type RerollKind } from './components/SquadPanel';
import CompletePanel from './components/CompletePanel';
import Pitch from './components/Pitch';
import BoxScore from './components/BoxScore';
import XiTable from './components/XiTable';
import TournamentScreen from './components/TournamentScreen';

/** True on the stacked (single-column) layout, i.e. below Tailwind's lg breakpoint.
 *  On that layout the squad list and pitch are stacked vertically, so we auto-scroll
 *  between them; on the wide layout they sit side by side and no scrolling is needed. */
const isStackedLayout = () =>
    typeof window !== 'undefined' && !window.matchMedia('(min-width: 1080px)').matches;

/** Playback preferences (speed + auto/game-by-game) persisted across runs. */
const SETTINGS_KEY = 'wcsim:settings';

function loadSettings(): { speed?: MatchSpeed; auto?: boolean } {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        const out: { speed?: MatchSpeed; auto?: boolean } = {};
        if (parsed.speed === 'slow' || parsed.speed === 'normal' || parsed.speed === 'fast')
            out.speed = parsed.speed;
        if (typeof parsed.auto === 'boolean') out.auto = parsed.auto;
        return out;
    } catch {
        return {};
    }
}

function saveSettings(speed: MatchSpeed, auto: boolean) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ speed, auto }));
    } catch {
        /* localStorage unavailable (e.g. private mode); preferences just won't persist */
    }
}

export default function App() {
    const [state, dispatch] = useReducer(gameReducer, initialState, (base) => ({
        ...base,
        ...loadSettings(),
    }));
    const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
    const timerRef = useRef<number | null>(null);
    const animatingRef = useRef(false);
    const pitchRef = useRef<HTMLDivElement | null>(null);
    const squadRef = useRef<HTMLElement | null>(null);

    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        },
        [],
    );

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
        knockout,
        speed,
        auto,
    } = state;

    // Persist playback preferences so speed + mode carry across runs and reloads.
    useEffect(() => {
        saveSettings(speed, auto);
    }, [speed, auto]);

    // During setup the pitch previews the selected formation/style; during the
    // draft it uses the locked formation stored in state.
    const previewFormation = useMemo(
        () => getFormation(FORMATIONS_DATA, formationName, style),
        [formationName, style],
    );
    const activeFormation = phase === 'setup' ? previewFormation : formation;

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
        if (isReroll) dispatch({ type: 'CONSUME_REROLL' });
        dispatch({ type: 'ROLL_START' });

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

    const handleStart = useCallback(() => {
        if (!previewFormation) return;
        dispatch({ type: 'START_DRAFT', formation: previewFormation });
        const open = positionsWithOpenSlot(previewFormation, {});
        runRoll(rollAny(SQUADS, open, new Set(), null), false);
    }, [previewFormation, runRoll]);

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

    const handlePlace = useCallback(
        (slotId: string) => {
            const slot = formation?.slots.find((s) => s.id === slotId);
            const player = currentSquad?.players.find((p) => p.id === selectedPlayerId);
            if (!formation || !slot || !player || !canPlace(player, slot, filled)) return;

            dispatch({ type: 'PLACE_PLAYER', slotId });

            // Mobile: jump back up to the squad list (showing the next drawn squad); the
            // panel's scroll-mt keeps a little margin above it.
            if (isStackedLayout()) {
                squadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            const nextFilled = { ...filled, [slotId]: player };
            if (filledCount(formation, nextFilled) >= formation.slots.length) return; // complete

            const open = positionsWithOpenSlot(formation, nextFilled);
            const used = new Set([...usedPersonIds, player.personId]);
            runRoll(rollAny(SQUADS, open, used, currentSquad?.id ?? null), false);
        },
        [formation, currentSquad, selectedPlayerId, filled, usedPersonIds, runRoll],
    );

    // Testing aid: remove a placed player. If no squad is in hand (we were
    // "complete"), roll one for the freed slot so a replacement can be drafted.
    const handleRemove = useCallback(
        (slotId: string) => {
            const removed = formation && filled[slotId];
            if (!formation || !removed) return;
            dispatch({ type: 'REMOVE_PLAYER', slotId });
            if (!currentSquad && !rolling) {
                const nextFilled = { ...filled };
                delete nextFilled[slotId];
                const open = positionsWithOpenSlot(formation, nextFilled);
                const used = new Set(usedPersonIds.filter((id) => id !== removed.personId));
                runRoll(rollAny(SQUADS, open, used, null), false);
            }
        },
        [formation, filled, currentSquad, rolling, usedPersonIds, runRoll],
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
        if (!formation) return;
        const players = formation.slots.map((s) => filled[s.id]).filter((p): p is Player => !!p);
        const bonus = FEATURES.chemistry ? teamChemistry(formation, filled).bonus : 0;
        dispatch({
            type: 'START_GROUP',
            group: createGroup(userGroupTeam(players, bonus), pickOpponents(3)),
        });
    }, [formation, filled]);

    const handleEnterKnockout = useCallback(() => {
        if (!group) return;
        const user = group.teams.find((t) => t.isUser)!;
        const excludeIds = group.teams.filter((t) => !t.isUser).map((t) => t.id);
        dispatch({ type: 'START_KNOCKOUT', knockout: createKnockout(user, excludeIds) });
    }, [group]);

    // Group and knockout share one screen. As soon as the user clears the group,
    // create the knockout so the Round of 16 shows up as the next game section
    // (no manual "Enter the knockouts" step), then it plays like any other game.
    useEffect(() => {
        if (
            phase === 'group' &&
            group &&
            !knockout &&
            isGroupFinished(group) &&
            userAdvanced(group)
        ) {
            handleEnterKnockout();
        }
    }, [phase, group, knockout, handleEnterKnockout]);

    const openPositions = useMemo<Set<Position>>(
        () =>
            activeFormation ? positionsWithOpenSlot(activeFormation, filled) : new Set<Position>(),
        [activeFormation, filled],
    );
    const usedSet = useMemo(() => new Set(usedPersonIds), [usedPersonIds]);
    const selectedPlayer = currentSquad?.players.find((p) => p.id === selectedPlayerId) ?? null;
    const panelSquad = rolling ? displaySquad : currentSquad;
    const availableStyles = FORMATIONS_DATA.stylesByName[formationName] ?? STYLES;

    // Page section header (eyebrow + heading) and the masthead status stamp, both
    // phase-dependent. The stamp is null on the tournament screens (their own header).
    const placed = activeFormation ? filledCount(activeFormation, filled) : 0;
    const sectionEyebrow = phase === 'complete' ? 'Confirmed line-up' : 'Team sheet';
    const sectionTitle =
        phase === 'setup'
            ? 'Set your formation'
            : phase === 'draft'
              ? 'Build your XI'
              : 'Your XI is set';
    const koStamp =
        knockout?.outcome === 'champion'
            ? 'Champions'
            : knockout?.outcome === 'out'
              ? 'Eliminated'
              : KO_ROUNDS[knockout?.current ?? 0];
    const stampText =
        phase === 'setup'
            ? 'Set up · 11 to pick'
            : phase === 'draft'
              ? `Drafting · ${placed}/11`
              : phase === 'complete'
                ? 'Team sheet · locked'
                : phase === 'group'
                  ? 'Group stage'
                  : phase === 'knockout'
                    ? koStamp
                    : null;

    return (
        <div className="min-h-full text-ink">
            <div className="mx-auto max-w-[1180px] px-[22px] pb-20 pt-5">
                <header className="flex items-center gap-4 border-b-2 border-ink pb-4">
                    <span className="relative h-[38px] w-[38px] shrink-0 rounded-[3px] bg-[repeating-linear-gradient(90deg,#0e5c34_0_5px,#15924c_5px_10px)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)]">
                        <span className="absolute inset-[7px] rounded-[1px] border-[1.5px] border-white/90" />
                    </span>
                    <h1 className="font-display text-[23px] font-black uppercase leading-none tracking-[-0.02em]">
                        World Cup <span className="text-pitch">Simulator</span>
                    </h1>
                    <span className="border-l border-line pl-3.5 text-[12.5px] text-muted max-sm:hidden">
                        Draft a random XI. Win the cup.
                    </span>
                    {stampText && (
                        <span className="ml-auto rounded-[3px] border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted max-sm:hidden">
                            {stampText}
                        </span>
                    )}
                </header>

                {(phase === 'group' || phase === 'knockout') && group && formation ? (
                    <TournamentScreen
                        group={group}
                        knockout={knockout}
                        formation={formation}
                        filled={filled}
                        speed={speed}
                        auto={auto}
                        onSetAuto={(a) => dispatch({ type: 'SET_AUTO', auto: a })}
                        onSetSpeed={(s) => dispatch({ type: 'SET_SPEED', speed: s })}
                        onRecordMatchday={(results) =>
                            dispatch({ type: 'RECORD_MATCHDAY', results })
                        }
                        onAdvanceKo={(p) => dispatch({ type: 'KO_RECORD', ...p })}
                        onReset={() => dispatch({ type: 'RESET' })}
                    />
                ) : (
                    <>
                    <div className="mb-5 mt-7 flex items-center gap-4">
                        <div>
                            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-pitch">
                                {sectionEyebrow}
                            </div>
                            <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                                {sectionTitle}
                            </h2>
                        </div>
                        <div className="relative h-0 flex-1 border-t-2 border-line">
                            <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                        </div>
                    </div>
                    <div className="grid items-start gap-[22px] [grid-template-areas:'sum'_'board'_'stack'] [grid-template-columns:1fr] min-[760px]:[grid-template-areas:'sum_stack'_'board_board'] min-[760px]:[grid-template-columns:1fr_1fr] min-[1080px]:[grid-template-areas:'sum_board_stack'] min-[1080px]:[grid-template-columns:300px_minmax(0,1fr)_320px]">
                        {/* Col 1: setup -> drawn squad -> complete */}
                        <aside ref={squadRef} className="scroll-mt-6 [grid-area:sum]">
                            {phase === 'setup' && (
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
                                />
                            )}
                            {phase === 'draft' && formation && (
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
                                    usedPersonIds={usedSet}
                                    selectedPlayerId={selectedPlayerId}
                                    onReroll={handleReroll}
                                    onSelectPlayer={(playerId) =>
                                        dispatch({ type: 'SELECT_PLAYER', playerId })
                                    }
                                />
                            )}
                            {phase === 'complete' && formation && (
                                <CompletePanel
                                    formation={formation}
                                    filled={filled}
                                    style={style}
                                    onStart={handleStartGroup}
                                    onReset={() => dispatch({ type: 'RESET' })}
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
                )}
            </div>
        </div>
    );
}
