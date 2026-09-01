import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../data/types';
import { lastName } from '../data/format';
import { assignNearest, type Formation, type Slot } from '../domain/formations';
import { moveOptions, type Filled } from '../domain/draft';
import { swapTargetSlots } from '../domain/album';
import PlayerBadge from './PlayerBadge';

/** Number of alternating mowing stripes across the pitch. */
const STRIPES = 11;

// Flat top-down drawing box. 480x640 maps the 300x400 authored markings at a
// uniform 1.6x scale, so circles stay round; the SVG fits this box with "meet"
// and the badges sit over the fitted, centred box.
const VBW = 480;
const VBH = 640;
// Inset the markings from the board edge by this fraction, leaving a grass margin
// around the touchlines (matches the comp's .out inset of 3.5%). The same fraction
// of each side keeps the x/y scale equal, so circles stay round.
const PAD = 0.035;
const PADX = PAD * VBW;
const PADY = PAD * VBH;
const SX = (VBW - 2 * PADX) / 300;
const SY = (VBH - 2 * PADY) / 400;

const d2 = (n: number) => Math.round(n * 100) / 100;
/** Map a point given in the classic 300x400 pitch space into the inset board. */
const px = (vx: number) => PADX + vx * SX;
const py = (vy: number) => PADY + vy * SY;

function pathOf(pts: [number, number][], close = false): string {
    let s = '';
    pts.forEach((pt, i) => {
        s += `${i ? 'L' : 'M'}${d2(px(pt[0]))} ${d2(py(pt[1]))} `;
    });
    return s + (close ? 'Z' : '');
}

/** Sample an arc (angles in degrees, in 300x400 pitch space) as points. */
function arcPts(
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    n: number,
): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
}
const circlePts = (cx: number, cy: number, r: number, n: number) => arcPts(cx, cy, r, 0, 360, n);

/** All pitch markings, authored in 300x400 space and scaled into the box. */
function markingsPath(): string {
    return [
        pathOf(
            [
                [0, 0],
                [300, 0],
                [300, 400],
                [0, 400],
            ],
            true,
        ), // touchlines
        pathOf([
            [0, 200],
            [300, 200],
        ]), // halfway line
        pathOf(circlePts(150, 200, 46, 64), true), // centre circle
        pathOf([
            [62, 0],
            [62, 60],
            [238, 60],
            [238, 0],
        ]), // top penalty box
        pathOf([
            [112, 0],
            [112, 22],
            [188, 22],
            [188, 0],
        ]), // top 6-yard box
        pathOf([
            [62, 400],
            [62, 340],
            [238, 340],
            [238, 400],
        ]), // bottom penalty box
        pathOf([
            [112, 400],
            [112, 378],
            [188, 378],
            [188, 400],
        ]), // bottom 6-yard box
        pathOf(arcPts(150, 40, 44, 27, 153, 20)), // top "D"
        pathOf(arcPts(150, 360, 44, 207, 333, 20)), // bottom "D"
        pathOf(arcPts(0, 0, 9, 90, 0, 6)), // corner arcs
        pathOf(arcPts(300, 0, 9, 180, 90, 6)),
        pathOf(arcPts(300, 400, 9, 270, 180, 6)),
        pathOf(arcPts(0, 400, 9, 360, 270, 6)),
    ].join(' ');
}

interface Props {
    formation: Formation;
    filled: Filled;
    /** Player awaiting placement; matching open slots become clickable. */
    selectedPlayer: Player | null;
    onPlace: (slotId: string) => void;
    /** Testing aid: clear a placed slot via the x on its badge. */
    onRemove?: (slotId: string) => void;
    /** Swap the selected player into an already-filled slot they are eligible for
     *  (sticker album feature). When set, matching filled slots become swap targets. */
    onSwap?: (slotId: string) => void;
    /** Budget draft: tap an empty slot to shop that position (no player held). When
     *  set, empty slots are clickable even without a selected player; the tapped slot
     *  becomes the market's target. Undefined in the roll draft (no behaviour change). */
    onSelectSlot?: (slotId: string) => void;
    /** Budget draft: the empty slot currently being shopped for (highlighted). */
    targetSlotId?: string;
    /** Move a placed player (FEATURES.movePlayers): tapping his badge calls this with
     *  his slot, and tapping it again cancels. Undefined leaves placed badges inert. */
    onStartMove?: (slotId: string) => void;
    /** The slot whose player is currently being moved, or null when none is. */
    movingSlotId?: string | null;
    /** Commit the move to this slot (empty, or a team-mate to trade places with). */
    onMove?: (toSlotId: string) => void;
    /** Whether a held player's NATURAL slot is picked out in amber, with every other slot
     *  he can fill in white. Default true, which is the single-player board. A versus room
     *  passes false and every eligible slot pulses amber alike: nothing in a room pays for
     *  a natural role (no chemistry, P25; no honours), so the second colour would be
     *  advice the room does not actually back. See `buildControls.ts`. */
    naturalHint?: boolean;
}

/** The three looks an OPEN slot can have. Amber is "this is his natural position",
 *  white is every other invitation to tap (a move destination, a secondary position, the
 *  market's next slot to shop), and idle is the dashed circle. The white one was written
 *  out three times and the idle one twice, which made a six-arm ternary that said six
 *  things and meant three.
 *
 *  WITHOUT `naturalHint` THERE ARE TWO: white collapses into amber, so every slot the held
 *  player can take pulses alike. A versus room is the caller - see `buildControls.ts`. */
const SLOT_AMBER = 'animate-slot-pulse-primary cursor-pointer border-amber bg-amber/90 text-ink';
const SLOT_WHITE = 'animate-slot-pulse-secondary cursor-pointer border-white bg-white/85 text-ink';
const SLOT_IDLE = 'border-dashed border-white/55 bg-white/10 text-white';

/** One placed player or open slot, rendered flat over the pitch at a position
 *  (a px offset over the fitted board) so it stays crisp and upright. */
function OverlayMarker({
    slot,
    player,
    target,
    swapTarget,
    isTarget,
    moveRole,
    movable,
    shifts,
    naturalHint,
    left,
    top,
    scale,
    onPlace,
    onRemove,
    onSwap,
    onSelectSlot,
    onStartMove,
    onMove,
}: {
    slot: Slot;
    player: Player | null;
    /** Whether this open slot matches the selected player's natural (primary) or a
     *  secondary position, so the pulse can be colour-coded; 'none' = not a target. */
    target: 'none' | 'primary' | 'secondary';
    /** Whether this FILLED slot can accept the selected player via a swap. */
    swapTarget: boolean;
    /** Budget draft: this empty slot is the one currently being shopped for. */
    isTarget: boolean;
    /** Move mode: this is the player being moved / a slot he can move to / neither
     *  (in which case, while a move is in progress, the slot is inert). */
    moveRole: 'mover' | 'destination' | 'bystander' | null;
    /** This placed player has at least one slot to move to, so his badge offers it. */
    movable: boolean;
    /** How many players taking this destination would shift: 1 into an empty slot, 2 for
     *  a straight trade, 3+ for a rotation. Only meaningful for a destination. */
    shifts: number;
    /** Whether the natural position is picked out in amber against white for the rest. */
    naturalHint: boolean;
    left: string;
    top: string;
    scale: number;
    onPlace: (slotId: string) => void;
    /** Testing aid: clear this slot (only shown for placed players). */
    onRemove?: () => void;
    onSwap?: (slotId: string) => void;
    onSelectSlot?: (slotId: string) => void;
    /** Pick this placed player up (or put him back down). */
    onStartMove?: (slotId: string) => void;
    /** Drop the player being moved into this slot. */
    onMove?: (slotId: string) => void;
}) {
    const transform = `translate(-50%, -50%) scale(${scale})`;
    // Slide to the new spot when the formation changes.
    const transition = 'left 0.45s ease-out, top 0.45s ease-out, transform 0.45s ease-out';
    const style = { left, top, transform, transformOrigin: 'center', transition };

    if (player) {
        // Swapping a collectible in takes precedence: it only happens while a card is
        // held, and a move can only start with empty hands.
        if (swapTarget && onSwap) {
            return (
                <div className="absolute flex flex-col items-center" style={style}>
                    <PlayerBadge
                        name={lastName(player.name)}
                        number={player.number}
                        swap
                        onActivate={() => onSwap(slot.id)}
                        activateLabel={`Swap in for ${lastName(player.name)}`}
                    />
                </div>
            );
        }
        // Move mode: taking this slot either trades the two players straight over, or
        // rotates a chain of three or more round. Say which, because "trade places with"
        // would be a lie about the second.
        if (moveRole === 'destination' && onMove) {
            const rotates = shifts > 2;
            return (
                <div className="absolute flex flex-col items-center" style={style}>
                    <PlayerBadge
                        name={lastName(player.name)}
                        number={player.number}
                        swap
                        rotate={rotates}
                        onActivate={() => onMove(slot.id)}
                        activateLabel={
                            rotates
                                ? `Take ${lastName(player.name)}'s spot, rotating ${shifts} players`
                                : `Trade places with ${lastName(player.name)}`
                        }
                    />
                </div>
            );
        }
        // Tapping a placed player picks him up; tapping him again puts him back. A
        // player with nowhere to go is not offered the gesture at all (`movable`), so
        // tapping him is never a dead end, and while someone else is being moved the
        // other badges are inert - the only things clickable are the destinations and
        // the cancel.
        const pickUp = onStartMove && (moveRole === 'mover' || (!moveRole && movable));
        if (!pickUp) {
            return (
                <div className="absolute flex flex-col items-center" style={style}>
                    <PlayerBadge
                        name={lastName(player.name)}
                        number={player.number}
                        onRemove={onRemove}
                    />
                </div>
            );
        }
        // The wrapper is a plain div and the gesture lives ON the badge: the remove "x" is
        // a button too, and nesting one inside the other is invalid HTML (React warned on
        // every render of the build page). PlayerBadge makes them siblings.
        return (
            <div className="absolute flex flex-col items-center" style={style}>
                <PlayerBadge
                    name={lastName(player.name)}
                    number={player.number}
                    onRemove={onRemove}
                    moving={moveRole === 'mover'}
                    onActivate={() => onStartMove(slot.id)}
                    activateLabel={
                        moveRole === 'mover'
                            ? `Stop moving ${lastName(player.name)}`
                            : `Move ${lastName(player.name)}`
                    }
                />
            </div>
        );
    }

    // A held player eligible for this slot -> place it (roll behaviour). Otherwise, if
    // the budget draft passed onSelectSlot, tapping shops this position instead. A move
    // in progress overrides both: the empty slots this player can take are the
    // destinations, and every other slot is inert until the move ends.
    const moveHere = moveRole === 'destination' && !!onMove;
    const canPlace = !moveRole && target !== 'none';
    const clickable = moveHere || (!moveRole && (canPlace || !!onSelectSlot));
    // The budget market's "next position to shop" highlight has no business pulsing
    // during a move: the slot is inert then unless it is a destination, and a pulsing
    // white "+" that ignores the click is just noise over the move it is competing with.
    const shopHere = isTarget && !moveRole;
    // The second colour, or the first one again. Where nothing rewards a natural role the
    // white pulse would be saying "this slot is the lesser one" about a choice the room
    // scores identically, so the two collapse into one.
    const SLOT_OTHER = naturalHint ? SLOT_WHITE : SLOT_AMBER;
    return (
        <button
            className="absolute flex flex-col items-center"
            style={style}
            disabled={!clickable}
            onClick={() =>
                moveHere
                    ? onMove(slot.id)
                    : canPlace
                      ? onPlace(slot.id)
                      : onSelectSlot?.(slot.id)
            }
        >
            <div
                className={[
                    'grid h-12 w-12 place-items-center rounded-full border-2 text-lg font-semibold leading-none transition',
                    // The order is load-bearing and is why this is not one condition per
                    // look: a destination outranks a natural-position match, and a
                    // natural-position match outranks the market's shop-here slot.
                    moveHere
                        ? SLOT_OTHER
                        : target === 'primary'
                          ? SLOT_AMBER
                          : target === 'secondary' || shopHere
                            ? SLOT_OTHER
                            : onSelectSlot
                              ? `cursor-pointer ${SLOT_IDLE} hover:border-white`
                              : SLOT_IDLE,
                ].join(' ')}
            >
                {moveHere || canPlace || shopHere ? '+' : null}
            </div>
            <span className="mt-1.5 rounded-[3px] bg-ink/60 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                {slot.label}
            </span>
        </button>
    );
}

export default function Pitch({
    formation,
    filled,
    selectedPlayer,
    onPlace,
    onRemove,
    onSwap,
    onSelectSlot,
    targetSlotId,
    onStartMove,
    movingSlotId = null,
    onMove,
    naturalHint = true,
}: Props) {
    // 11 persistent circles (keyed by index). On a formation change each circle
    // slides to its nearest new slot instead of mounting/unmounting.
    const [circles, setCircles] = useState<Slot[]>(() => formation.slots);
    const formationRef = useRef(formation);
    useEffect(() => {
        if (formationRef.current === formation) return;
        formationRef.current = formation;
        setCircles((prev) =>
            prev.length === formation.slots.length
                ? assignNearest(prev, formation.slots)
                : formation.slots,
        );
    }, [formation]);

    // Measure the stage so we can fit the fixed-aspect board inside it and place
    // the badges over the (centred) drawing.
    const stageRef = useRef<HTMLDivElement | null>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    // "meet" fit: scale the drawing box to fit, then centre it in the stage.
    const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / VBW, box.h / VBH) : 0;
    const ox = (box.w - VBW * fit) / 2;
    const oy = (box.h - VBH * fit) / 2;

    // The personIds currently placed (drives the swap rule: a used collectible may
    // only swap into the slot where that person sits, as an upgrade; an unused one may
    // swap into any filled slot it fits).
    // Memoized because the swap memo below depends on it: a fresh Set every render would
    // change the dep array every render and the memo would never actually hold.
    const usedPersonIds = useMemo(
        () =>
            new Set(
                Object.values(filled)
                    .filter((pl) => !!pl)
                    .map((pl) => pl.personId),
            ),
        [filled],
    );

    // The filled slots the held collectible could swap into. One pass, memoized, rather
    // than the rule re-derived per badge inside the render (hygiene H58). `usedPersonIds`
    // here is derived from `filled` - App's copy comes from reducer state, and the two are
    // deliberately not interchangeable.
    const swapTargets = useMemo(
        () => swapTargetSlots(selectedPlayer, formation.slots, filled, usedPersonIds),
        [selectedPlayer, formation, filled, usedPersonIds],
    );

    // Where the player being moved may go, and how many players each option actually
    // shifts: 1 for an empty slot, 2 for a straight trade, 3+ for a rotation. The rule
    // lives in domain/draft; this only paints it, and the count keeps the label honest -
    // "trade places with" would be a lie where three men rotate.
    const moving = movingSlotId && filled[movingSlotId] ? movingSlotId : null;
    const destinations = useMemo(
        () => (moving ? moveOptions(formation, filled, moving) : null),
        [formation, filled, moving],
    );

    // Which placed players have anywhere to go, so their badge offers the gesture. This
    // was a second full sweep PER BADGE inside the render below, so eleven of them ran on
    // every render; it is one sweep, memoized, and it is skipped entirely while a move is
    // in progress because every other badge is inert then anyway.
    const movableSlots = useMemo(() => {
        const out = new Set<string>();
        if (moving || !onStartMove) return out;
        for (const s of formation.slots) {
            if (filled[s.id] && moveOptions(formation, filled, s.id).size > 0) out.add(s.id);
        }
        return out;
    }, [formation, filled, moving, onStartMove]);

    const marks = markingsPath();
    const spots = [
        [150, 200],
        [150, 40],
        [150, 360],
    ].map(([vx, vy]) => ({ x: px(vx), y: py(vy) }));

    return (
        <div
            ref={stageRef}
            className="relative mx-auto aspect-[3/4] w-full max-w-[560px] overflow-hidden rounded-md border border-line shadow-hard"
        >
            {/* Pitch surface: grass stripes + markings, drawn flat from the box and
          fitted with "meet" so the board keeps its shape and the badges line up. */}
            <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${VBW} ${VBH}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
            >
                {/* Grass mowing stripes. A full-board base sits behind, and each
                  stripe is drawn a hair taller than its slot so consecutive stripes
                  overlap: that removes the sub-pixel seams (the page showing through)
                  the user would otherwise see between stripes. */}
                <rect x={0} y={0} width={VBW} height={VBH} fill="var(--color-grass)" />
                {Array.from({ length: STRIPES }, (_, i) => (
                    <rect
                        key={i}
                        x={0}
                        y={d2((i / STRIPES) * VBH)}
                        width={VBW}
                        height={d2(VBH / STRIPES) + 1}
                        fill={i % 2 === 0 ? 'var(--color-grass-stripe)' : 'var(--color-grass)'}
                    />
                ))}
                <path
                    d={marks}
                    fill="none"
                    stroke="rgba(255,255,255,0.82)"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
                {spots.map((q, k) => (
                    <circle
                        key={k}
                        cx={d2(q.x)}
                        cy={d2(q.y)}
                        r={2.6}
                        fill="rgba(255,255,255,0.82)"
                    />
                ))}
            </svg>

            {/* Player overlay: positioned in px over the fitted, centred board and
          scaled with it (capped at 1 so badges never grow past native size). */}
            <div className="absolute inset-0">
                {fit > 0 &&
                    circles.map((slot, k) => {
                        const player = filled[slot.id] ?? null;
                        // Keyed on `selectedPlayer` rather than on the derived boolean:
                        // a boolean discards the narrowing, which is what made the
                        // assertion below look necessary (hygiene H21).
                        const eligible =
                            selectedPlayer && !player && selectedPlayer.positions.includes(slot.position)
                                ? selectedPlayer
                                : null;
                        const target: 'none' | 'primary' | 'secondary' = !eligible
                            ? 'none'
                            : eligible.positions[0] === slot.position
                              ? 'primary'
                              : 'secondary';
                        // A filled slot a selected COLLECTIBLE is eligible for = a swap
                        // target (only collectibles can be swapped in). `onSwap` is
                        // undefined when the album is off or no swaps remain, which is
                        // this component's own gating; the rule is `swapTargetSlots`.
                        const swapTarget = !!onSwap && swapTargets.has(slot.id);
                        const qx = px((slot.x / 100) * 300);
                        const qy = py((slot.y / 100) * 400);
                        return (
                            <OverlayMarker
                                key={k}
                                slot={slot}
                                player={player}
                                target={target}
                                swapTarget={swapTarget}
                                isTarget={!player && slot.id === targetSlotId}
                                shifts={destinations?.get(slot.id) ?? 0}
                                movable={movableSlots.has(slot.id)}
                                naturalHint={naturalHint}
                                moveRole={
                                    !moving
                                        ? null
                                        : slot.id === moving
                                          ? 'mover'
                                          : destinations?.has(slot.id)
                                            ? 'destination'
                                            : 'bystander'
                                }
                                left={`${ox + qx * fit}px`}
                                top={`${oy + qy * fit}px`}
                                scale={Math.min(fit, 1)}
                                onPlace={onPlace}
                                onRemove={player && onRemove ? () => onRemove(slot.id) : undefined}
                                onSwap={onSwap}
                                onSelectSlot={onSelectSlot}
                                onStartMove={onStartMove}
                                onMove={onMove}
                            />
                        );
                    })}
            </div>
        </div>
    );
}
