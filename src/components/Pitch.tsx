import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Player } from '../data/types';
import { lastName } from '../data/types';
import type { Formation, Slot } from '../domain/formations';
import type { Filled } from '../domain/draft';
import { SQUAD_BY_ID } from '../data/squads';
import { FEATURES } from '../config';
import PlayerBadge from './PlayerBadge';

/** Number of alternating mowing stripes across the pitch. */
const STRIPES = 18;

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

interface Props {
    formation: Formation;
    filled: Filled;
    /** Player awaiting placement; matching open slots become clickable. */
    selectedPlayer: Player | null;
    onPlace: (slotId: string) => void;
}

/** Width (px, in field space) of the invisible measurement anchors. Their
 *  rendered width after the 3D transform gives the perspective scale at a point. */
const ANCHOR_W = 90;

/** One placed player or open slot, rendered flat in the 2D overlay at a measured
 *  screen position so it stays crisp and upright over the tilted pitch. */
function OverlayMarker({
    slot,
    player,
    target,
    pos,
    tilt,
    compact,
    onPlace,
}: {
    slot: Slot;
    player: Player | null;
    /** Whether this open slot matches the selected player's natural (primary) or a
     *  secondary position, so the pulse can be colour-coded; 'none' = not a target. */
    target: 'none' | 'primary' | 'secondary';
    pos: { x: number; y: number; s: number };
    tilt: boolean;
    /** Mobile: show a minimal badge (number + last name only). */
    compact: boolean;
    onPlace: (slotId: string) => void;
}) {
    const transform = `translate(-50%, ${tilt ? '-100%' : '-50%'}) scale(${pos.s})`;
    // Slide to the new measured spot when the formation changes.
    const transition = 'left 0.45s ease-out, top 0.45s ease-out, transform 0.45s ease-out';
    const shadow = tilt ? (
        <span className="absolute bottom-0 left-1/2 h-3 w-10 -translate-x-1/2 translate-y-1/2 bg-[radial-gradient(closest-side,rgba(0,0,0,0.33),transparent)]" />
    ) : null;

    if (player) {
        const squad = SQUAD_BY_ID[player.squadId];
        return (
            <div
                className="absolute flex flex-col items-center"
                style={{
                    left: pos.x,
                    top: pos.y,
                    transform,
                    transformOrigin: 'bottom center',
                    transition,
                }}
            >
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
            style={{
                left: pos.x,
                top: pos.y,
                transform,
                transformOrigin: 'bottom center',
                transition,
            }}
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
    // (and badges are minimal); the tilted 3D pitch is desktop-only.
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

    // Player badges render flat in a 2D overlay (never inside the 3D transform, so
    // they stay readable). Invisible anchors sit on the tilted surface; we measure
    // where each lands on screen and place its badge there.
    const stageRef = useRef<HTMLDivElement | null>(null);
    const anchorRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [positions, setPositions] = useState<{ x: number; y: number; s: number }[]>([]);

    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const measure = () => {
            const sr = stage.getBoundingClientRect();
            setPositions(
                circles.map((_, k) => {
                    const a = anchorRefs.current[k];
                    if (!a) return { x: 0, y: 0, s: 1 };
                    const r = a.getBoundingClientRect();
                    const s = tilt ? Math.max(0.84, Math.min(1, r.width / ANCHOR_W)) : 1;
                    return {
                        x: r.left - sr.left + r.width / 2,
                        y: r.top - sr.top + r.height / 2,
                        s,
                    };
                }),
            );
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(stage);
        return () => ro.disconnect();
    }, [circles, tilt]);

    return (
        <div
            ref={stageRef}
            className={[
                'relative mx-auto h-full w-full max-w-2xl overflow-hidden',
                tilt ? 'pitch-stage' : '',
            ].join(' ')}
        >
            {/* Pitch surface: tilts back in 3D (stripes + markings recede); flat fills the frame.
          The top of the field is cropped above the container so the attacking third
          does not leave a band of empty grass over the forwards. No box around it. */}
            <div
                className={tilt ? 'pitch-field absolute overflow-hidden' : 'absolute inset-0'}
                style={tilt ? { left: '2%', right: '2%', top: '-4%', bottom: '1%' } : undefined}
            >
                {/* Mowing stripes */}
                <div className="absolute inset-0">
                    {Array.from({ length: STRIPES }).map((_, i) => (
                        <div
                            key={i}
                            className={i % 2 === 0 ? 'bg-[#3f7d4e] ' : 'bg-[#458a57]'}
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: `${(i * 100) / STRIPES}%`,
                                height: `${100 / STRIPES}%`,
                            }}
                        />
                    ))}
                </div>
                {/* Markings. viewBox matches the 3:4 pitch aspect, so preserveAspectRatio="none"
            stretches to fill without distorting the line weight. */}
                <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 300 400"
                    preserveAspectRatio="none"
                    fill="none"
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={1.2}
                    aria-hidden="true"
                >
                    {/* Halfway line + centre circle and spot */}
                    <line x1="0" y1="200" x2="300" y2="200" />
                    <circle cx="150" cy="200" r="46" />
                    <circle cx="150" cy="200" r="2.4" fill="rgba(255,255,255,0.6)" stroke="none" />
                    {/* Top end: penalty box, 6-yard box, penalty spot, "D" arc */}
                    <path d="M62 0 V60 H238 V0" />
                    <path d="M112 0 V22 H188 V0" />
                    <circle cx="150" cy="40" r="2.4" fill="rgba(255,255,255,0.6)" stroke="none" />
                    <path d="M110.8 60 A44 44 0 0 0 189.2 60" />
                    {/* Bottom end: penalty box, 6-yard box, penalty spot, "D" arc */}
                    <path d="M62 400 V340 H238 V400" />
                    <path d="M112 400 V378 H188 V400" />
                    <circle cx="150" cy="360" r="2.4" fill="rgba(255,255,255,0.6)" stroke="none" />
                    <path d="M110.8 340 A44 44 0 0 1 189.2 340" />
                    {/* Corner arcs */}
                    <path d="M0 9 A9 9 0 0 0 9 0" />
                    <path d="M291 0 A9 9 0 0 0 300 9" />
                    <path d="M300 391 A9 9 0 0 0 291 400" />
                    <path d="M9 400 A9 9 0 0 0 0 391" />
                </svg>
                {/* Translucent inner frame: layered over the green stripes so the 30% white tints the pitch edge */}
                <div className="pointer-events-none absolute inset-0 border-3 border-white/30" />
                {/* Invisible anchors, one per slot, measured to place the flat badges. */}
                {circles.map((slot, k) => (
                    <span
                        key={k}
                        ref={(el) => {
                            anchorRefs.current[k] = el;
                        }}
                        aria-hidden="true"
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                            left: `${slot.x}%`,
                            top: `${slot.y}%`,
                            width: ANCHOR_W,
                            height: 0,
                        }}
                    />
                ))}
            </div>

            {/* Flat 2D player overlay, positioned from the measured anchors. */}
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
                    const pos = positions[k];
                    if (!pos) return null;
                    return (
                        <OverlayMarker
                            key={k}
                            slot={slot}
                            player={player}
                            target={target}
                            pos={pos}
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
