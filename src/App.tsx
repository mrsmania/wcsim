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
  rollAnotherCup,
  rollAnotherTeam,
  rollAny,
} from './domain/draft';
import { createGroup, pickOpponents, userGroupTeam } from './domain/tournament';
import { gameReducer, initialState } from './state/gameReducer';
import SetupPanel from './components/SetupPanel';
import SquadPanel, { type RerollKind } from './components/SquadPanel';
import CompletePanel from './components/CompletePanel';
import Pitch from './components/Pitch';
import BoxScore from './components/BoxScore';
import GroupStageScreen from './components/GroupStageScreen';

/** True on the stacked (single-column) layout, i.e. below Tailwind's lg breakpoint.
 *  On that layout the squad list and pitch are stacked vertically, so we auto-scroll
 *  between them; on the wide layout they sit side by side and no scrolling is needed. */
const isStackedLayout = () =>
  typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [displaySquad, setDisplaySquad] = useState<Squad | null>(null);
  const timerRef = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const pitchRef = useRef<HTMLElement | null>(null);
  const squadRef = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const { phase, formationName, style, formation, filled, currentSquad, selectedPlayerId, usedPersonIds, rerollsLeft, rolling, group } =
    state;

  // During setup the pitch previews the selected formation/style; during the
  // draft it uses the locked formation stored in state.
  const previewFormation = useMemo(
    () => getFormation(FORMATIONS_DATA, formationName, style),
    [formationName, style],
  );
  const activeFormation = phase === 'setup' ? previewFormation : formation;

  // Mobile: when a player is picked, scroll the pitch roughly to the middle of
  // the viewport so the user can tap an open slot, with some breathing room on
  // top. (Scrolling back up after placing is done in handlePlace.)
  useEffect(() => {
    if (phase === 'draft' && selectedPlayerId && isStackedLayout()) {
      pitchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const handlePlace = useCallback(
    (slotId: string) => {
      const slot = formation?.slots.find((s) => s.id === slotId);
      const player = currentSquad?.players.find((p) => p.id === selectedPlayerId);
      if (!formation || !slot || !player || !canPlace(player, slot, filled)) return;

      dispatch({ type: 'PLACE_PLAYER', slotId });

      // Mobile: jump back up to the squad list (showing the next drawn squad),
      // leaving a little space above it instead of pinning it to the top edge.
      if (isStackedLayout() && squadRef.current) {
        const top = squadRef.current.getBoundingClientRect().top + window.scrollY - 16;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }

      const nextFilled = { ...filled, [slotId]: player };
      if (filledCount(formation, nextFilled) >= formation.slots.length) return; // complete

      const open = positionsWithOpenSlot(formation, nextFilled);
      const used = new Set([...usedPersonIds, player.personId]);
      runRoll(rollAny(SQUADS, open, used, currentSquad?.id ?? null), false);
    },
    [formation, currentSquad, selectedPlayerId, filled, usedPersonIds, runRoll],
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
    dispatch({ type: 'START_GROUP', group: createGroup(userGroupTeam(players), pickOpponents(3)) });
  }, [formation, filled]);

  const openPositions = useMemo<Set<Position>>(
    () => (activeFormation ? positionsWithOpenSlot(activeFormation, filled) : new Set<Position>()),
    [activeFormation, filled],
  );
  const usedSet = useMemo(() => new Set(usedPersonIds), [usedPersonIds]);
  const selectedPlayer = currentSquad?.players.find((p) => p.id === selectedPlayerId) ?? null;
  const panelSquad = rolling ? displaySquad : currentSquad;
  const availableStyles = FORMATIONS_DATA.stylesByName[formationName] ?? STYLES;

  return (
    <div className="min-h-full bg-[#ece5d8] text-stone-900">
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <header className="mb-5 flex items-baseline gap-3 border-b-2 border-stone-900 pb-2">
          <h1 className="text-2xl font-black tracking-tight">World Cup Simulator</h1>
          <span className="text-sm font-semibold text-stone-500">Draft your most random world cup XI</span>
        </header>

        {phase === 'group' && group ? (
          <GroupStageScreen
            group={group}
            onRecordMatchday={(results) => dispatch({ type: 'RECORD_MATCHDAY', results })}
            onReset={() => dispatch({ type: 'RESET' })}
          />
        ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
          {/* Left: setup -> drawn squad -> complete */}
          <aside ref={squadRef}>
            {phase === 'setup' && (
              <SetupPanel
                names={FORMATIONS_DATA.names}
                selectedName={formationName}
                selectedStyle={style}
                availableStyles={availableStyles}
                ready={!!previewFormation}
                onSelectName={(name) => dispatch({ type: 'SET_FORMATION', name })}
                onSelectStyle={(s) => dispatch({ type: 'SET_STYLE', style: s })}
                onStart={handleStart}
              />
            )}
            {phase === 'draft' && formation && (
              <SquadPanel
                squad={panelSquad}
                rolling={rolling}
                rerollsLeft={rerollsLeft}
                canAnotherTeam={!!currentSquad && hasAnotherTeam(SQUADS, currentSquad)}
                canAnotherCup={!!currentSquad && hasAnotherCup(SQUADS, currentSquad)}
                openPositions={openPositions}
                usedPersonIds={usedSet}
                selectedPlayerId={selectedPlayerId}
                onReroll={handleReroll}
                onSelectPlayer={(playerId) => dispatch({ type: 'SELECT_PLAYER', playerId })}
              />
            )}
            {phase === 'complete' && formation && (
              <CompletePanel
                formation={formation}
                filled={filled}
                onStart={handleStartGroup}
                onReset={() => dispatch({ type: 'RESET' })}
              />
            )}
          </aside>

          {/* Center: pitch (shown immediately, previews the chosen formation) */}
          <main ref={pitchRef}>
            {activeFormation ? (
              <Pitch
                formation={activeFormation}
                filled={filled}
                selectedPlayer={selectedPlayer}
                onPlace={handlePlace}
              />
            ) : (
              <div className="flex aspect-[3/4] max-w-xl items-center justify-center rounded-lg border border-dashed border-stone-400 text-stone-400">
                Loading formations…
              </div>
            )}
          </main>

          {/* Right: box score */}
          <aside>
            {activeFormation ? (
              <BoxScore formation={activeFormation} filled={filled} />
            ) : (
              <div className="text-sm text-stone-400">Box score appears once formations load.</div>
            )}
          </aside>
        </div>
        )}
      </div>
    </div>
  );
}
