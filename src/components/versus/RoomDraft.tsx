import { useEffect, useMemo, useRef } from 'react';
import type { Player } from '../../data/types';
import type { Formation } from '../../domain/formations';
import { squadsInPool } from '../../data/squads';
import { xiFrom } from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { detachedBuildIo } from '../../state/buildIo';
import { initialState, type GameState } from '../../state/gameReducer';
import { useBuild } from '../../hooks/useBuild';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import BuildSurface from '../BuildSurface';
import { ROOM_CONTROLS } from '../buildControls';
import { CARD_FLAT, MONO_CAP } from '../matchUi';
import { PickClock, RoomNote } from './versusUi';

// The draft: the build page, with the room's rules and the room's clock.
//
// THE BOARD IS OPTIMISTIC AND THE REFEREE IS THE TRUTH. A tap places the player at once,
// because on a mobile link an unconfirmed tap looks like a tap that did nothing - and
// then the answer arrives and the board is reconciled to whatever the server actually
// holds. Three things can make those two differ and all three are ordinary: a pick can be
// refused, the clock can fill a slot for you while you are still reading the market, and
// a reload starts from an empty board with eleven picks already made.
//
// THE BUILD IS DETACHED (P29, wave 4). It writes nothing: not the solo XI it would
// otherwise overwrite, and not the active Cup Run, which every path that starts a build
// otherwise deletes.

/** The signature of a slot map, for deciding whether the server disagrees with the board.
 *  Slot order is the formation's, so this cannot report a difference that is only an
 *  object's key order. */
const signature = (formation: Formation, ids: Record<string, string | undefined>): string =>
    formation.slots.map((s) => ids[s.id] ?? '').join('|');

export default function RoomDraft({
    view,
    room,
    formation,
}: {
    view: RoomView;
    room: VersusRoom;
    /** The shape chosen in the lobby. The caller keys this component on it, so a build
     *  never has to change formation underneath itself. */
    formation: Formation;
}) {
    const you = view.you;
    const me = view.members.find((m) => m.userId === you?.userId) ?? null;
    const others = view.members.filter((m) => m.userId !== you?.userId);

    // The room's cups, and only the room's (P4): everybody in a room draws from the same
    // pool, which is the host's choice and not the player's own setting.
    const pool = useMemo(() => {
        const squads = squadsInPool(view.rules.years);
        const players = squads.flatMap((s) => s.players);
        return { squads, players, byId: new Map(players.map((p) => [p.id, p])) };
    }, [view.rules.years]);

    // Seeded straight into the budget build with the lobby's shape, so the setup step -
    // which a room does not have, formation and style being lobby decisions (P19) - is
    // never on screen for a frame.
    const seed = useMemo<GameState>(
        () => ({
            ...initialState,
            phase: 'draft',
            build: 'budget',
            formationName: formation.name,
            style: formation.style,
            formation,
        }),
        [formation],
    );

    // A pick, posted the moment the board takes it. The ordinal is the room's, read off
    // the open window rather than counted here: the referee treats a repeated ordinal as
    // the same pick (P36), so a retry on a flaky link is a no-op rather than two spent
    // windows, and a number this side invented would not line up.
    const submitting = useRef(false);
    const onBuy = (slotId: string, player: Player): void => {
        submitting.current = true;
        void room
            .pick(slotId, player.id)
            .finally(() => {
                submitting.current = false;
            });
    };

    const build = useBuild({ initial: seed, io: detachedBuildIo, pool, extraRerolls: 0, onBuy });
    const { dispatch } = build;

    // Reconcile. The server's XI wins, always - but only when it actually differs, or
    // every poll would rebuild the board and drop the card in your hand.
    const serverIds = you?.xi ?? {};
    const serverSig = signature(formation, serverIds);
    const boardSig = signature(
        formation,
        Object.fromEntries(Object.entries(build.state.filled).map(([k, p]) => [k, p?.id])),
    );
    useEffect(() => {
        // A pick in flight is expected to disagree: that is what optimistic means. Wait
        // for its answer rather than yanking the player back out for one render.
        if (submitting.current || serverSig === boardSig) return;
        dispatch({ type: 'SYNC_XI', formation, filled: xiFrom(formation, serverIds) });
        // `serverIds` is a fresh object on every poll, so the signature is the dependency:
        // it changes only when the XI does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverSig, boardSig, formation, dispatch]);

    const window = you?.window ?? null;
    const done = !window && (me?.picked ?? 0) >= formation.slots.length;

    return (
        <div className="flex flex-col gap-[18px]">
            {window && room.remainingMs !== null ? (
                <PickClock
                    remainingMs={room.remainingMs}
                    ordinal={window.ordinal}
                    locked={room.locked}
                />
            ) : (
                <div className={`${CARD_FLAT} px-4 py-3`}>
                    <div className={MONO_CAP}>Your XI is in</div>
                    <RoomNote>
                        {others.length === 1
                            ? `Waiting for ${others[0]!.name} to finish.`
                            : 'Waiting for the rest of the room.'}
                    </RoomNote>
                </div>
            )}

            <div className={`${CARD_FLAT} flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5`}>
                {view.members.map((m) => (
                    <span key={m.userId} className="text-[12px] text-muted">
                        <b className="text-ink">{m.name}</b> {m.picked} of 11
                    </span>
                ))}
            </div>

            {/* Locked means the window is within a round trip of closing, so a tap could
                not arrive in time. The board goes read-only rather than taking one it
                cannot honour, which is the difference between a refused pick and a pick
                you were told was too late. */}
            <div className={room.locked && !done ? 'pointer-events-none opacity-60' : ''}>
                <BuildSurface
                    build={build}
                    // The album has no business in a room (P3, P8): no owned-sticker tick
                    // and, more to the point, no owned-sticker discount.
                    ownedStickerIds={EMPTY}
                    budget={view.rules.budget}
                    controls={ROOM_CONTROLS}
                    complete={
                        <div className={`${CARD_FLAT} p-4`}>
                            <div className={MONO_CAP}>Line-up confirmed</div>
                            <RoomNote>
                                Eleven picked and ${you?.budgetLeft ?? 0} left over. The match
                                starts when everybody is done.
                            </RoomNote>
                        </div>
                    }
                />
            </div>
        </div>
    );
}

const EMPTY: Set<string> = new Set();
