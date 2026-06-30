import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Player } from '../data/types';
import { lastName } from '../data/types';
import type { Formation, Slot } from '../domain/formations';
import type { Filled } from '../domain/draft';
import PlayerBadge from './PlayerBadge';

/** Number of alternating mowing stripes across the pitch. */
const STRIPES = 20;

const slotDist = (a: Slot, b: Slot) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Hungarian algorithm: min-cost perfect assignment for a square cost matrix.
 *  Returns colForRow[i] = the column assigned to row i. */
function hungarian(cost: number[][]): number[] {
    const n = cost.length;
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0); // p[col] = row matched to col
    const way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(n + 1).fill(Infinity);
        const used = new Array(n + 1).fill(false);
        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = Infinity;
            let j1 = -1;
            for (let j = 1; j <= n; j++) {
                if (used[j]) continue;
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) {
                    minv[j] = cur;
                    way[j] = j0;
                }
                if (minv[j] < delta) {
                    delta = minv[j];
                    j1 = j;
                }
            }
            for (let j = 0; j <= n; j++) {
                if (used[j]) {
                    u[p[j]] += delta;
                    v[j] -= delta;
                } else {
                    minv[j] -= delta;
                }
            }
            j0 = j1;
        } while (p[j0] !== 0);
        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0);
    }
    const colForRow = new Array(n).fill(0);
    for (let j = 1; j <= n; j++) colForRow[p[j] - 1] = j - 1;
    return colForRow;
}

/**
 * Reassign each existing circle (prev[k]) to a slot in `next` so total movement
 * is minimised (squared distance, which discourages long cross-pitch jumps), and
 * the 11 circles persist and slide to their closest new positions rather than
 * appearing/disappearing. Returns an array aligned to circle index k.
 */
function assignNearest(prev: Slot[], next: Slot[]): Slot[] {
    const cost = prev.map((p) => next.map((q) => slotDist(p, q)));
    const colForRow = hungarian(cost);
    return prev.map((_, i) => next[colForRow[i]]);
}

// Flat top-down drawing box. 480x640 maps the 300x400 authored markings at a
// uniform 1.6x scale, so circles stay round; the SVG fits this box with "meet"
// and the badges sit over the fitted, centred box.
const VBW = 480;
const VBH = 640;
const SX = VBW / 300;
const SY = VBH / 400;

const d2 = (n: number) => Math.round(n * 100) / 100;
/** Map a point given in the classic 300x400 pitch space into the drawing box. */
const px = (vx: number) => vx * SX;
const py = (vy: number) => vy * SY;

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
        pathOf([[0, 0], [300, 0], [300, 400], [0, 400]], true), // touchlines
        pathOf([[0, 200], [300, 200]]), // halfway line
        pathOf(circlePts(150, 200, 46, 64), true), // centre circle
        pathOf([[62, 0], [62, 60], [238, 60], [238, 0]]), // top penalty box
        pathOf([[112, 0], [112, 22], [188, 22], [188, 0]]), // top 6-yard box
        pathOf([[62, 400], [62, 340], [238, 340], [238, 400]]), // bottom penalty box
        pathOf([[112, 400], [112, 378], [188, 378], [188, 400]]), // bottom 6-yard box
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
}

/** One placed player or open slot, rendered flat over the pitch at a position
 *  (a px offset over the fitted board) so it stays crisp and upright. */
function OverlayMarker({
    slot,
    player,
    target,
    left,
    top,
    scale,
    onPlace,
    onRemove,
}: {
    slot: Slot;
    player: Player | null;
    /** Whether this open slot matches the selected player's natural (primary) or a
     *  secondary position, so the pulse can be colour-coded; 'none' = not a target. */
    target: 'none' | 'primary' | 'secondary';
    left: string;
    top: string;
    scale: number;
    onPlace: (slotId: string) => void;
    /** Testing aid: clear this slot (only shown for placed players). */
    onRemove?: () => void;
}) {
    const transform = `translate(-50%, -50%) scale(${scale})`;
    // Slide to the new spot when the formation changes.
    const transition = 'left 0.45s ease-out, top 0.45s ease-out, transform 0.45s ease-out';
    const style = { left, top, transform, transformOrigin: 'center', transition };

    if (player) {
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

    return (
        <button
            className="absolute flex flex-col items-center"
            style={style}
            disabled={target === 'none'}
            onClick={() => onPlace(slot.id)}
        >
            <div
                className={[
                    'flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed text-xs font-extrabold uppercase tracking-wide transition',
                    target === 'primary'
                        ? 'animate-slot-pulse-primary cursor-pointer border-pitch bg-pitch/25 text-white'
                        : target === 'secondary'
                          ? 'animate-slot-pulse-secondary cursor-pointer border-amber bg-amber/25 text-white'
                          : 'border-white/70 bg-black/10 text-white/85',
                ].join(' ')}
            >
                {slot.label}
            </div>
        </button>
    );
}

export default function Pitch({ formation, filled, selectedPlayer, onPlace, onRemove }: Props) {
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
                {Array.from({ length: STRIPES }, (_, i) => {
                    const y0 = (i / STRIPES) * VBH;
                    const y1 = ((i + 1) / STRIPES) * VBH;
                    return (
                        <rect
                            key={i}
                            x={0}
                            y={d2(y0)}
                            width={VBW}
                            height={d2(y1 - y0)}
                            fill={i % 2 === 0 ? '#1f8a4d' : '#1a7d45'}
                        />
                    );
                })}
                <path
                    d={marks}
                    fill="none"
                    stroke="rgba(255,255,255,0.82)"
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
                {spots.map((q, k) => (
                    <circle key={k} cx={d2(q.x)} cy={d2(q.y)} r={2.6} fill="rgba(255,255,255,0.82)" />
                ))}
            </svg>

            {/* Player overlay: positioned in px over the fitted, centred board and
          scaled with it (capped at 1 so badges never grow past native size). */}
            <div className="absolute inset-0">
                {fit > 0 &&
                    circles.map((slot, k) => {
                        const player = filled[slot.id] ?? null;
                        const matches =
                            !!selectedPlayer &&
                            !player &&
                            selectedPlayer.positions.includes(slot.position);
                        const target: 'none' | 'primary' | 'secondary' = !matches
                            ? 'none'
                            : selectedPlayer!.positions[0] === slot.position
                              ? 'primary'
                              : 'secondary';
                        const qx = (slot.x / 100) * VBW;
                        const qy = (slot.y / 100) * VBH;
                        return (
                            <OverlayMarker
                                key={k}
                                slot={slot}
                                player={player}
                                target={target}
                                left={`${ox + qx * fit}px`}
                                top={`${oy + qy * fit}px`}
                                scale={Math.min(fit, 1)}
                                onPlace={onPlace}
                                onRemove={
                                    player && onRemove ? () => onRemove(slot.id) : undefined
                                }
                            />
                        );
                    })}
            </div>
        </div>
    );
}
