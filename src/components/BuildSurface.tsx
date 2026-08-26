import { FEATURES } from '../config';
import type { Build, BuildView } from '../hooks/useBuild';
import BuildPage from './BuildPage';
import SetupPanel from './SetupPanel';
import SquadPanel from './SquadPanel';
import BudgetMarket from './BudgetMarket';
import CompletePanel from './CompletePanel';
import Pitch from './Pitch';
import BoxScore from './BoxScore';
import XiTable from './XiTable';
import { FORMATIONS_DATA } from '../domain/formations';

// The build's own RENDERING, beside `hooks/useBuild`'s own state (pvp-plan P29, wave 4).
//
// Which panel is showing, what each one is fed, and how the shared pitch is wired to the
// two interaction machines. It was the composition root's largest single expression, and
// it is here for the same reason the state moved: a versus room draws the same three
// columns from its own build, and a second copy of this wiring would drift from the first
// the moment either changed.
//
// It takes a `Build` plus the handful of facts a build cannot know about itself - the
// album, the money the career allows, and what pressing Start Run means - so nothing here
// reaches for the app's state, and none of it is specific to the single-player game.

/** Section eyebrow/title, by sub-view. Derived from the drafted data (not `phase`), so
 *  navigating back to the build mid-run still reads as the locked XI. */
function headerCopy(view: BuildView): { eyebrow: string; title: string } {
    const eyebrow = view === 'complete' ? 'Confirmed line-up' : 'Team sheet';
    const title =
        view === 'setup'
            ? 'Set your formation'
            : view === 'draft'
              ? 'Build your XI'
              : 'Your XI is set';
    return { eyebrow, title };
}

export default function BuildSurface({
    build,
    ownedStickerIds,
    budget,
    ascension,
    onStartRun,
    onReset,
}: {
    build: Build;
    /** Stickers already in the album, by player id: the "you have this one" mark in both
     *  player lists and the line-up sheet. Empty when the album is off. */
    ownedStickerIds: Set<string>;
    /** The transfer market's money. The build itself has no opinion about it: the app
     *  scales it by the career's perk tier, and a room is told a figure by its host. */
    budget: number;
    /** The Ascension picker on the complete panel: the tier in force, the highest one
     *  selectable, and what picking one does. */
    ascension: { tier: number; max: number; onSelect: (tier: number) => void };
    /** The XI is set and the player is kicking off. */
    onStartRun: () => void;
    /** Start over: everything a reset means to the caller, including the build's own. */
    onReset: () => void;
}) {
    const { state, view, activeFormation, isBudgetBuild, market, movePlayer } = build;
    const { formation, filled, style, formationName, selectedPlayerId, rerollsLeft, rolling } =
        state;
    const STICKERS = FEATURES.stickerAlbum;
    const header = headerCopy(view);

    return (
        <BuildPage
            eyebrow={header.eyebrow}
            title={header.title}
            panelRef={build.panelRef}
            boardRef={build.boardRef}
            panel={
                <>
                    {view === 'setup' && (
                        <SetupPanel
                            names={FORMATIONS_DATA.names}
                            selectedName={formationName}
                            selectedStyle={style}
                            availableStyles={build.availableStyles}
                            ready={!!build.previewFormation}
                            onSelectName={build.setFormationName}
                            onSelectStyle={build.setStyle}
                            onStart={build.start}
                            onRandomTeam={FEATURES.randomTeam ? build.randomTeam : undefined}
                            onBudgetDraft={FEATURES.budgetDraft ? build.enterBudget : undefined}
                        />
                    )}
                    {view === 'draft' &&
                        formation &&
                        (isBudgetBuild ? (
                            <BudgetMarket
                                formation={formation}
                                filled={filled}
                                budget={budget}
                                poolPlayers={build.pool.players}
                                targetSlot={market.targetSlot}
                                heldPlayer={market.heldPlayer}
                                onHold={market.hold}
                                onAutoFill={market.autoFill}
                                onClear={build.clearBudget}
                                onStartOver={onReset}
                                ownedStickerIds={ownedStickerIds}
                            />
                        ) : (
                            <SquadPanel
                                squad={build.panelSquad}
                                rolling={rolling}
                                rerollsLeft={rerollsLeft}
                                canAnotherTeam={build.canAnotherTeam}
                                canAnotherCup={build.canAnotherCup}
                                openPositions={build.openPositions}
                                swapEligibleIds={build.swapEligibleIds}
                                swapsLeft={state.swapsLeft}
                                usedPersonIds={build.usedPersonIds}
                                selectedPlayerId={selectedPlayerId}
                                onReroll={build.reroll}
                                onSelectPlayer={build.selectPlayer}
                                ownedStickerIds={ownedStickerIds}
                                onReset={onReset}
                            />
                        ))}
                    {view === 'complete' && formation && (
                        <CompletePanel
                            formation={formation}
                            filled={filled}
                            style={style}
                            onStartRun={onStartRun}
                            onReset={onReset}
                            ascension={{
                                tier: ascension.tier,
                                max: ascension.max,
                                onSelect: ascension.onSelect,
                            }}
                        />
                    )}
                </>
            }
            board={
                activeFormation && (
                    <Pitch
                        formation={activeFormation}
                        filled={filled}
                        selectedPlayer={isBudgetBuild ? market.heldPlayer : build.selectedPlayer}
                        onPlace={isBudgetBuild ? market.place : build.place}
                        onRemove={
                            isBudgetBuild
                                ? market.remove
                                : FEATURES.removePlayers
                                  ? build.remove
                                  : undefined
                        }
                        onSwap={
                            !isBudgetBuild && STICKERS && state.swapsLeft > 0
                                ? build.swap
                                : undefined
                        }
                        onSelectSlot={isBudgetBuild ? market.shop : undefined}
                        targetSlotId={isBudgetBuild ? market.targetSlot?.id : undefined}
                        // Moving a placed player. Offered even with a card in hand: a slot
                        // the held card can swap into keeps the swap, and anywhere else the
                        // tap picks the placed player up instead, dropping the card.
                        onStartMove={FEATURES.movePlayers ? build.startMove : undefined}
                        movingSlotId={movePlayer.movingSlotId}
                        onMove={FEATURES.movePlayers ? movePlayer.move : undefined}
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
                            budget={isBudgetBuild ? budget : undefined}
                            ownedStickerIds={ownedStickerIds}
                        />
                    </>
                )
            }
        />
    );
}
