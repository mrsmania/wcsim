import type { ReactNode } from 'react';
import { FEATURES } from '../config';
import type { BuildControls } from './buildControls';
import type { RerollKind } from '../domain/draft';
import type { Build, BuildView } from '../hooks/useBuild';
import BuildPage from './BuildPage';
import SetupPanel from './SetupPanel';
import SquadPanel from './SquadPanel';
import BudgetMarket from './BudgetMarket';
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
    controls,
    ratings,
    rerollKinds,
    complete,
    onReset,
}: {
    build: Build;
    /** Stickers already in the album, by player id: the "you have this one" mark in both
     *  player lists and the line-up sheet. Empty when the album is off. */
    ownedStickerIds: Set<string>;
    /** The transfer market's money. The build itself has no opinion about it: the app
     *  scales it by the career's perk tier, and a room is told a figure by its host. */
    budget: number;
    /** Which of the build's own controls are offered (P41). */
    controls: BuildControls;
    /** Whether the numbers are shown: the ratings strip's figures, the line-up sheet's
     *  column, the rating on a drawn-squad row. False in a hidden-ratings versus room
     *  (P5). It is NOT one of the controls above: those are a fixed room-versus-app
     *  split, and this varies from room to room.
     *
     *  REQUIRED, deliberately, and `npm run checks` asserts it stays that way. The three
     *  components below default it to true so the single-player callers read unchanged, so
     *  a room that simply forgot to pass it would show every rating and look perfectly
     *  fine. Making the one door into them require an answer is what turns "the room hides
     *  the numbers" from a habit into a compiler error. */
    ratings: boolean;
    /** Which re-rolls the drawn-squad panel offers. Omitted means all three; a room has
     *  one, because the referee deals the next squad and takes no kind. */
    rerollKinds?: readonly RerollKind[];
    /** What shows once all eleven slots are filled. The app's is the confirmed line-up
     *  with the Ascension picker and Start Run; a room's says the draft is done and who
     *  it is still waiting for. It is a NODE rather than a set of props because the two
     *  have nothing in common but their position on the page. */
    complete: ReactNode;
    /** Start over: everything a reset means to the caller, including the build's own.
     *  Omitted in a room, along with the controls that would offer it. */
    onReset?: () => void;
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
                            onRandomTeam={
                                FEATURES.randomTeam && controls.randomTeam
                                    ? build.randomTeam
                                    : undefined
                            }
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
                                onAutoFill={controls.autoFill ? market.autoFill : undefined}
                                onClear={controls.clear ? build.clearBudget : undefined}
                                onStartOver={controls.startOver ? onReset : undefined}
                                ownedStickerIds={ownedStickerIds}
                                collectibles={controls.collectibles}
                            />
                        ) : (
                            <SquadPanel
                                squad={build.panelSquad}
                                rolling={rolling}
                                rerollsLeft={rerollsLeft}
                                canAnotherTeam={build.canAnotherTeam}
                                canAnotherCup={build.canAnotherCup}
                                openPositions={build.openPositions}
                                swapEligibleIds={controls.swap ? build.swapEligibleIds : EMPTY_IDS}
                                swapsLeft={state.swapsLeft}
                                ratings={ratings}
                                chemistry={controls.chemistry}
                                collectibles={controls.collectibles}
                                rerollKinds={rerollKinds}
                                usedPersonIds={build.usedPersonIds}
                                selectedPlayerId={selectedPlayerId}
                                onReroll={build.reroll}
                                onSelectPlayer={build.selectPlayer}
                                ownedStickerIds={ownedStickerIds}
                                onReset={controls.startOver ? onReset : undefined}
                            />
                        ))}
                    {view === 'complete' && complete}
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
                            !controls.removePlayer
                                ? undefined
                                : isBudgetBuild
                                  ? market.remove
                                  : FEATURES.removePlayers
                                    ? build.remove
                                    : undefined
                        }
                        onSwap={
                            !isBudgetBuild && STICKERS && controls.swap && state.swapsLeft > 0
                                ? build.swap
                                : undefined
                        }
                        onSelectSlot={isBudgetBuild ? market.shop : undefined}
                        targetSlotId={isBudgetBuild ? market.targetSlot?.id : undefined}
                        // Amber for the natural role and white for the rest, or amber for
                        // everything he can fill. A room takes the second: it pays nothing
                        // for a natural role, so the two-colour pulse would be advice with
                        // nothing behind it.
                        naturalHint={controls.naturalHint}
                        // Moving a placed player. Offered even with a card in hand: a slot
                        // the held card can swap into keeps the swap, and anywhere else the
                        // tap picks the placed player up instead, dropping the card.
                        onStartMove={
                            FEATURES.movePlayers && controls.movePlayer
                                ? build.startMove
                                : undefined
                        }
                        movingSlotId={movePlayer.movingSlotId}
                        onMove={
                            FEATURES.movePlayers && controls.movePlayer
                                ? movePlayer.move
                                : undefined
                        }
                    />
                )
            }
            stack={
                activeFormation && (
                    <>
                        <BoxScore
                            formation={activeFormation}
                            filled={filled}
                            ratings={ratings}
                            chemistry={controls.chemistry}
                        />
                        <XiTable
                            formation={activeFormation}
                            filled={filled}
                            budget={isBudgetBuild ? budget : undefined}
                            ratings={ratings}
                            ownedStickerIds={ownedStickerIds}
                        />
                    </>
                )
            }
        />
    );
}

/** One empty set, so a room's render does not allocate a new one every frame. */
const EMPTY_IDS: Set<string> = new Set();
