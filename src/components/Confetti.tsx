import { useEffect, useRef } from 'react';

/** Festive palette (gold + the pitch greens + amber + white + a warm red). */
const COLORS = ['#F5C542', '#15924c', '#0E5C34', '#E4922B', '#ffffff', '#C8453C'];

interface Piece {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rot: number;
    vrot: number;
    color: string;
    round: boolean;
    /** Remaining frames for a burst piece; omitted for rain (lives until off-screen). */
    life?: number;
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
    ctx.restore();
}

/**
 * A one-shot burst of confetti erupting from a screen point (`originX/Y` in client
 * coordinates), used by the champion cup on hover. Self-contained: it appends its
 * own throwaway full-viewport canvas, animates the pieces up-and-out under gravity,
 * then removes the canvas once they have all fallen. Pointer-events-none and a no-op
 * under prefers-reduced-motion.
 */
export function confettiBurst(originX: number, originY: number, count = 80) {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:60';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pieces: Piece[] = [];
    for (let i = 0; i < count; i++) {
        // Fire outward in every direction (a full 360deg pop), then let gravity win.
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        pieces.push({
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 5 + Math.random() * 6,
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 0.4,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            round: Math.random() < 0.4,
            life: 90 + Math.floor(Math.random() * 40),
        });
    }

    // Time-based motion (in 60fps units) so the burst runs at the same speed on
    // high-refresh displays; life is counted in frames, so it scales with dt too.
    const FRAME = 1000 / 60;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
        const dt = Math.min((t - last) / FRAME, 3);
        last = t;
        ctx.clearRect(0, 0, w, h);
        for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            p.vy += 0.12 * dt; // gravity
            p.vx *= Math.pow(0.99, dt);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
            p.life! -= dt;
            drawPiece(ctx, p);
            if (p.life! <= 0 || p.y > h + 40) pieces.splice(i, 1);
        }
        if (pieces.length > 0) {
            raf = requestAnimationFrame(tick);
        } else {
            cancelAnimationFrame(raf);
            canvas.remove();
        }
    };
    raf = requestAnimationFrame(tick);
}

/**
 * A full-viewport canvas that rains heavy confetti for `durationMs`, then lets the
 * last pieces fall out. Self-contained (no deps), pointer-events-none so it never
 * blocks the "Draft a new XI" button, and disabled under prefers-reduced-motion.
 * Piece size / density scale down on narrow screens.
 */
export default function Confetti({ durationMs = 3000 }: { durationMs?: number }) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // `stopped` guards against a leftover frame from a torn-down effect: under React
        // StrictMode the effect runs twice in dev, and without this a stale loop keeps
        // clearing the canvas and fighting the live one (the rain vanishes after a beat).
        let stopped = false;

        // Narrow screens get smaller, fewer pieces (an absolute-sized piece looks huge
        // on a phone); wider screens get the full-size, denser rain.
        const narrow = window.innerWidth < 640;
        const sizeScale = narrow ? 0.7 : 1;
        const openingBurst = narrow ? 120 : 200;
        const perFrame = narrow ? 4 : 7;
        const maxPieces = narrow ? 260 : 900;

        const dpr = window.devicePixelRatio || 1;
        let w = 0;
        let h = 0;
        // Size the backing store to the canvas's own rendered box (x dpr for crispness);
        // h-full w-full stretches that box to the viewport, so display and backing match.
        const resize = () => {
            const r = canvas.getBoundingClientRect();
            w = r.width;
            h = r.height;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const pieces: Piece[] = [];
        const add = (n: number) => {
            for (let i = 0; i < n; i++) {
                pieces.push({
                    x: Math.random() * w,
                    y: -20 - Math.random() * h * 0.4, // start above the fold so it rains in
                    vx: (Math.random() - 0.5) * 1.6,
                    vy: 2 + Math.random() * 3.5,
                    size: (5 + Math.random() * 7) * sizeScale,
                    rot: Math.random() * Math.PI,
                    vrot: (Math.random() - 0.5) * 0.35,
                    color: COLORS[Math.floor(Math.random() * COLORS.length)],
                    round: Math.random() < 0.4,
                });
            }
        };
        add(openingBurst); // an opening burst

        // Time-based motion: scale every per-frame delta by how long the frame
        // actually took, in 60fps units. Without this the rain runs 2-4x too fast on
        // high-refresh (120/144Hz) displays, where rAF fires that much more often.
        const FRAME = 1000 / 60;
        const start = performance.now();
        let last = start;
        let spawnAcc = 0;
        let raf = 0;
        const tick = (t: number) => {
            if (stopped) return;
            // Cap the step so returning from a background tab doesn't teleport pieces.
            const dt = Math.min((t - last) / FRAME, 3);
            last = t;
            ctx.clearRect(0, 0, w, h);
            if (t - start < durationMs && pieces.length < maxPieces) {
                spawnAcc += perFrame * dt; // keep it heavy, at a refresh-independent rate
                const n = Math.floor(spawnAcc);
                if (n > 0) {
                    add(n);
                    spawnAcc -= n;
                }
            }
            for (let i = pieces.length - 1; i >= 0; i--) {
                const p = pieces[i];
                p.vy += 0.05 * dt; // gravity
                p.vx *= Math.pow(0.995, dt);
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.rot += p.vrot * dt;
                drawPiece(ctx, p);
                if (p.y > h + 40) pieces.splice(i, 1);
            }
            if (pieces.length > 0) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            stopped = true;
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            // Wipe the canvas so a torn-down instance leaves nothing behind for the next.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }, [durationMs]);

    // h-full w-full is load-bearing: a <canvas> is a replaced element, so fixed
    // inset-0 alone leaves it at its intrinsic 300x150 (pinned top-left). A definite
    // CSS size stretches it full-viewport; the effect sizes the backing store to match.
    return (
        <canvas
            ref={ref}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[90] h-full w-full"
        />
    );
}
