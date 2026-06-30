import { useEffect, useRef, useState } from 'react';
import type { Player } from '../data/types';
import { lastName } from '../data/types';
import type { Formation, Slot } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES } from '../config';
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

// --- Perspective projection --------------------------------------------------
// One pure function maps pitch coords to a 600x400-ish drawing space; the SVG and
// the (flat HTML) badges both use it, so badge positions are exact and need no
// DOM measurement. The SVG stretches its viewBox to the container and badges are
// placed as a percentage of the same box, so the two always line up.
const VBW = 600;
const VBH = 680;
const PAD_TOP = 64; // empty space above the far goal line so forward badges fit
const PAD_BOT = 20;
const TOP_RATIO = 0.6; // far edge width as a fraction of the near (bottom) edge
const BADGE_MIN_SCALE = 1; // far badges this fraction of near size (1 = constant)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Proj {
    x: number;
    y: number;
    s: number;
    yf: number;
}
type Project = (u: number, v: number) => Proj;

/** (u,v) in 0..1, v: 0 = far (top) .. 1 = near (bottom). Tilt = a receding-plane
 *  perspective (full foreshortening); flat = a plain rectangle (mobile). */
function makeProject(tilt: boolean): Project {
    if (!tilt) return (u, v) => ({ x: u * VBW, y: v * VBH, s: 1, yf: v });
    const D = 1 / TOP_RATIO;
    const planeH = VBH - PAD_TOP - PAD_BOT;
    return (u, v) => {
        const d = 1 + (D - 1) * (1 - v); // depth: near (v=1) = 1, far (v=0) = D
        const yf = (1 / d - TOP_RATIO) / (1 - TOP_RATIO); // screen fraction (0 far .. 1 near)
        const s = lerp(TOP_RATIO, 1, yf); // width grows linearly with screen depth
        return { x: VBW / 2 + (u - 0.5) * s * VBW, y: PAD_TOP + yf * planeH, s, yf };
    };
}

const d2 = (n: number) => Math.round(n * 100) / 100;
/** Project a point given in the classic 300x400 pitch space. */
const vb = (P: Project, vx: number, vy: number) => P(vx / 300, vy / 400);

function pathOf(P: Project, pts: [number, number][], close = false): string {
    let s = '';
    pts.forEach((pt, i) => {
        const q = vb(P, pt[0], pt[1]);
        s += `${i ? 'L' : 'M'}${d2(q.x)} ${d2(q.y)} `;
    });
    return s + (close ? 'Z' : '');
}

/** Sample an arc (angles in degrees, in 300x400 pitch space) as points. */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
}
const circlePts = (cx: number, cy: number, r: number, n: number) => arcPts(cx, cy, r, 0, 360, n);

/** All pitch markings, authored in 300x400 space and projected, as one path. */
function markingsPath(P: Project): string {
    return [
        pathOf(P, [[0, 0], [300, 0], [300, 400], [0, 400]], true), // touchlines
        pathOf(P, [[0, 200], [300, 200]]), // halfway line
        pathOf(P, circlePts(150, 200, 46, 64), true), // centre circle
        pathOf(P, [[62, 0], [62, 60], [238, 60], [238, 0]]), // top penalty box
        pathOf(P, [[112, 0], [112, 22], [188, 22], [188, 0]]), // top 6-yard box
        pathOf(P, [[62, 400], [62, 340], [238, 340], [238, 400]]), // bottom penalty box
        pathOf(P, [[112, 400], [112, 378], [188, 378], [188, 400]]), // bottom 6-yard box
        pathOf(P, arcPts(150, 40, 44, 27, 153, 20)), // top "D"
        pathOf(P, arcPts(150, 360, 44, 207, 333, 20)), // bottom "D"
        pathOf(P, arcPts(0, 0, 9, 90, 0, 6)), // corner arcs
        pathOf(P, arcPts(300, 0, 9, 180, 90, 6)),
        pathOf(P, arcPts(300, 400, 9, 270, 180, 6)),
        pathOf(P, arcPts(0, 400, 9, 360, 270, 6)),
    ].join(' ');
}

interface Props {
    formation: Formation;
    filled: Filled;
    /** Player awaiting placement; matching open slots become clickable. */
    selectedPlayer: Player | null;
    onPlace: (slotId: string) => void;
}

/** One placed player or open slot, rendered flat over the pitch at a projected
 *  position (a percentage of the stage) so it stays crisp and upright. */
function OverlayMarker({
    slot,
    player,
    target,
    leftPct,
    topPct,
    scale,
    tilt,
    compact,
    onPlace,
}: {
    slot: Slot;
    player: Player | null;
    /** Whether this open slot matches the selected player's natural (primary) or a
     *  secondary position, so the pulse can be colour-coded; 'none' = not a target. */
    target: 'none' | 'primary' | 'secondary';
    leftPct: number;
    topPct: number;
    scale: number;
    tilt: boolean;
    /** Mobile: show a minimal badge (number + last name only). */
    compact: boolean;
    onPlace: (slotId: string) => void;
}) {
    const transform = `translate(-50%, ${tilt ? '-100%' : '-50%'}) scale(${scale})`;
    // Slide to the new spot when the formation changes.
    const transition = 'left 0.45s ease-out, top 0.45s ease-out, transform 0.45s ease-out';
    const style = { left: `${leftPct}%`, top: `${topPct}%`, transform, transformOrigin: 'bottom center', transition };
    const shadow = tilt ? (
        <span className="absolute bottom-0 left-1/2 h-3 w-10 -translate-x-1/2 translate-y-1/2 bg-[radial-gradient(closest-side,rgba(0,0,0,0.33),transparent)]" />
    ) : null;

    if (player) {
        const squad = SQUAD_BY_ID[player.squadId];
        return (
            <div className="absolute flex flex-col items-center" style={style}>
                {shadow}
                <PlayerBadge
                    name={lastName(player.name)}
                    number={player.number}
                    position={slot.label}
                    code={squad?.code ?? ''}
                    elo={player.elo}
                    year={squad?.year}
                    compact={compact}
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
            {shadow}
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

export default function Pitch({ formation, filled, selectedPlayer, onPlace }: Props) {
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

    // Below lg the 3D tilt wastes too much vertical space, so the pitch is flat
    // (and badges are minimal); the tilted pitch is desktop-only.
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const onChange = () => setIsMobile(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const tilt = FEATURES.pitch3d && !isMobile;
    const P = makeProject(tilt);
    const marks = markingsPath(P);
    const spots = [
        [150, 200],
        [150, 40],
        [150, 360],
    ].map(([vx, vy]) => vb(P, vx, vy));

    return (
        <div className="relative mx-auto h-full w-full max-w-3xl overflow-hidden">
            {/* Pitch surface: grass stripes + markings, drawn in perspective (or flat
          on mobile) from the projection. The viewBox stretches to fill the frame. */}
            <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${VBW} ${VBH}`}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                {Array.from({ length: STRIPES }, (_, i) => {
                    const v0 = i / STRIPES;
                    const v1 = (i + 1) / STRIPES;
                    const a = P(0, v0);
                    const b = P(1, v0);
                    const c = P(1, v1);
                    const e = P(0, v1);
                    return (
                        <polygon
                            key={i}
                            points={`${d2(a.x)},${d2(a.y)} ${d2(b.x)},${d2(b.y)} ${d2(c.x)},${d2(c.y)} ${d2(e.x)},${d2(e.y)}`}
                            fill={i % 2 === 0 ? '#3f7d4e' : '#458a57'}
                        />
                    );
                })}
                <path
                    d={marks}
                    fill="none"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
                {spots.map((q, k) => (
                    <circle key={k} cx={d2(q.x)} cy={d2(q.y)} r={2.6} fill="rgba(255,255,255,0.6)" />
                ))}
                {/* Translucent inner frame: tints the very edge of the pitch. */}
                <path
                    d={pathOf(P, [[0, 0], [300, 0], [300, 400], [0, 400]], true)}
                    fill="none"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={4}
                    vectorEffect="non-scaling-stroke"
                />
            </svg>

            {/* Flat player overlay, positioned from the same projection (no measuring). */}
            <div className="absolute inset-0">
                {circles.map((slot, k) => {
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
                    const q = P(slot.x / 100, slot.y / 100);
                    return (
                        <OverlayMarker
                            key={k}
                            slot={slot}
                            player={player}
                            target={target}
                            leftPct={(q.x / VBW) * 100}
                            topPct={(q.y / VBH) * 100}
                            scale={lerp(BADGE_MIN_SCALE, 1, q.yf)}
                            tilt={tilt}
                            compact={isMobile}
                            onPlace={onPlace}
                        />
                    );
                })}
            </div>
        </div>
    );
}
