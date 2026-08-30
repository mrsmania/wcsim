import { useEffect, useMemo, useRef } from 'react';
import type { Player } from '../../data/types';
import { SQUAD_BY_ID, squadsInPool } from '../../data/squads';
import type { Formation } from '../../domain/formations';
import { othersIn, roomDisplay, xiFrom } from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { detachedBuildIo } from '../../state/buildIo';
import { initialState, type GameState } from '../../state/gameReducer';
import { useBuild } from '../../hooks/useBuild';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import BuildSurface from '../BuildSurface';
import { ROOM_CONTROLS } from '../buildControls';
import { CARD_FLAT, MONO_CAP } from '../matchUi';
import RoomBracket from './RoomBracket';
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
// A ROLL ROOM'S SQUADS ARE DEALT, NOT ROLLED (P13). The referee hands over one squad at a
// time, so the whole local roll - the scramble, the draw-next-squad policy, the three
// kinds of re-roll - stands down (`squads: 'dealt'`), and what arrives is pushed onto the
// board with `ROLL_SETTLE`. Rolling here as well would race the server and let a player
// see a squad the referee never dealt, which it would then refuse to take a pick from.
//
// THE BUILD IS DETACHED (P29, wave 4). It writes nothing: not the solo XI it would
// otherwise overwrite, and not the active Cup Run, which every path that starts a build
// otherwise deletes.
//
// FINISHING EARLY MEANS WAITING, and in a room of eight that is the longest single stretch
// of the feature: nothing is paired until every draft is done (P47), so a decisive player
// can be sitting on a finished XI for four minutes. What fills it is the draw itself - the
// tree with every seat empty and every name in the pot - which is the thing that is about
// to happen, rather than a progress bar counting other people's picks.

/** The signature of a slot map, for deciding whether the server disagrees with the board.
 *  Slot order is the formation's, so this cannot report a difference that is only an
 *  object's key order. */
const signature = (formation: Formation, ids: Record<string, string | undefined>): string =>
    formation.slots.map((s) => ids[s.id] ?? '').join('|');

/** A roll room's re-roll is one button: the referee deals the next squad and takes no
 *  argument saying which kind, so "another team" and "another cup" have nothing to send. */
const ROOM_REROLLS = ['any'] as const;

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
    const others = othersIn(view);
    const rolling = view.rules.method === 'roll';
    const { ratings } = roomDisplay(view);

    // The room's cups, and only the room's (P4): everybody in a room draws from the same
    // pool, which is the host's choice and not the player's own setting.
    const pool = useMemo(() => {
        const squads = squadsInPool(view.rules.years);
        const players = squads.flatMap((s) => s.players);
        return { squads, players, byId: new Map(players.map((p) => [p.id, p])) };
    }, [view.rules.years]);

    // Seeded straight into the draft with the lobby's shape, so the setup step - which a
    // room does not have, formation and style being lobby decisions (P19) - is never on
    // screen for a frame.
    const seed = useMemo<GameState>(
        () => ({
            ...initialState,
            phase: 'draft',
            build: rolling ? 'roll' : 'budget',
            formationName: formation.name,
            style: formation.style,
            formation,
        }),
        [formation, rolling],
    );

    // A pick, posted the moment the board takes it. The ordinal is the room's, read off
    // the open window rather than counted here: the referee treats a repeated ordinal as
    // the same pick (P36), so a retry on a flaky link is a no-op rather than two spent
    // windows, and a number this side invented would not line up.
    const submitting = useRef(false);
    const onPick = (slotId: string, player: Player): void => {
        submitting.current = true;
        void room.pick(slotId, player.id).finally(() => {
            submitting.current = false;
        });
    };

    const build = useBuild({
        initial: seed,
        io: detachedBuildIo,
        pool,
        // A room's re-roll allowance is the host's, and it is spent by asking the referee.
        extraRerolls: 0,
        onPick,
        squads: rolling ? 'dealt' : 'local',
        onReroll: rolling ? () => void room.reroll() : undefined,
    });
    const { dispatch } = build;

    // The dealt squad, newest last (P13: one at a time). Pushed onto the board as if it
    // had been rolled, which is exactly what `ROLL_SETTLE` is for - so every screen below
    // reads the same state a single-player draft would.
    const dealtId = rolling ? (you?.dealt[you.dealt.length - 1] ?? null) : null;
    const { deal } = build;
    // The last deal this screen has put on the board. A REF and not the board's own
    // squad, which is what it used to compare against, and the difference is a real
    // one: placing a player CLEARS the drawn squad (the reducer does that so a
    // single-player draft rolls the next one), so between the tap landing on the board
    // and the referee's answer arriving the board has no squad while `dealt` still ends
    // with the one just used - and comparing the two put that spent squad straight back,
    // now with a scramble in front of it. Keyed on the deal instead, the gap shows
    // "Drawing a squad" until the next one really arrives, which is what is happening.
    const dealtRef = useRef<string | null>(null);
    useEffect(() => {
        if (!dealtId || dealtId === dealtRef.current) return;
        const squad = SQUAD_BY_ID[dealtId];
        if (!squad) return;
        dealtRef.current = dealtId;
        // Through the SCRAMBLE, not straight onto the board. The deal is the moment a
        // roll draft is about, and settling it silently made a squad simply appear -
        // which is what a room looked like until 2026-08-30. It is the single-player
        // animation unchanged, duration included, and it decides nothing: the target is
        // the referee's squad either way. It plays on a reload too, which costs a beat
        // of a window already part spent - the alternative is skipping the FIRST squad
        // of every draft, since that one is already dealt by the time this screen
        // mounts.
        deal(squad);
    }, [dealtId, deal]);

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

    // The referee's count, never the reducer's: a re-roll it refused (none left, or a
    // deal that found no squad) must not read as spent here.
    const rerollsLeft = you?.rerollsLeft ?? 0;
    const withRerolls = useMemo(
        () => ({ ...build, state: { ...build.state, rerollsLeft } }),
        [build, rerollsLeft],
    );

    const window = you?.window ?? null;
    const done = !window && (me?.picked ?? 0) >= formation.slots.length;

    return (
        <div className="flex flex-col gap-[18px]">
            {window && room.remainingMs !== null ? (
                <PickClock
                    remainingMs={room.remainingMs}
                    // The bar is a PROPORTION, so it needs the room's own window length:
                    // the host chooses twenty or thirty (P20), and a thirty drawn against
                    // a hardcoded twenty would sit full for the first ten seconds.
                    windowMs={view.pickSeconds * 1000}
                    ordinal={window.ordinal}
                    locked={room.locked}
                    hint={
                        rolling
                            ? 'Pick from the squad you were dealt, then tap his position'
                            : 'Buy a player, then tap his position'
                    }
                />
            ) : (
                <div className={`${CARD_FLAT} px-4 py-3`}>
                    <div className={MONO_CAP}>Your XI is in</div>
                    <RoomNote>{waitingLine(others)}</RoomNote>
                </div>
            )}

            {/* The draw, through the wait (P47). Only once YOUR XI is in: while you are
                still picking, the board is what the screen is for. */}
            {done && <RoomBracket view={view} serverNow={view.at} />}

            <div className={`${CARD_FLAT} flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5`}>
                {view.members.map((m) => (
                    <span key={m.userId} className="text-[12px] text-muted">
                        <b className="text-ink">{m.name}</b> {m.picked} of 11
                    </span>
                ))}
                {!ratings && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-amber-ink">
                        Ratings hidden
                    </span>
                )}
            </div>

            {/* Locked means the window is within a round trip of closing, so a tap could
                not arrive in time. The board goes read-only rather than taking one it
                cannot honour, which is the difference between a refused pick and a pick
                you were told was too late. */}
            <div className={room.locked && !done ? 'pointer-events-none opacity-60' : ''}>
                <BuildSurface
                    build={withRerolls}
                    // The album has no business in a room (P3, P8): no owned-sticker tick
                    // and, more to the point, no owned-sticker discount.
                    ownedStickerIds={EMPTY}
                    budget={view.rules.budget}
                    controls={ROOM_CONTROLS}
                    ratings={ratings}
                    rerollKinds={rolling ? ROOM_REROLLS : undefined}
                    complete={
                        // No heading of its own: `BuildSurface` already puts "Confirmed
                        // line-up / Your XI is set" directly above, and the wait is said by
                        // the panel at the top of the screen, so all that is left to add is
                        // what the money did.
                        !rolling ? (
                            <div className={`${CARD_FLAT} p-4`}>
                                <RoomNote>${you?.budgetLeft ?? 0} left over.</RoomNote>
                            </div>
                        ) : null
                    }
                />
            </div>
        </div>
    );
}

const EMPTY: Set<string> = new Set();

/** Who is still picking, named while there are few enough names to be worth reading. Past
 *  three it is a count: eight names in a sentence is a list, not a sentence. */
function waitingLine(others: { name: string; picked: number }[]): string {
    const busy = others.filter((m) => m.picked < 11);
    if (!busy.length) return 'Everybody is done. The draw is being made.';
    if (busy.length === 1) return `Waiting for ${busy[0]!.name} to finish.`;
    if (busy.length <= 3) {
        const names = busy.map((m) => m.name);
        return `Waiting for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
    }
    return `Waiting for ${busy.length} others to finish.`;
}
