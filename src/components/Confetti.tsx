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
}

/**
 * A full-viewport canvas that rains heavy confetti for `durationMs`, then lets the
 * last pieces fall out. Self-contained (no deps), pointer-events-none so it never
 * blocks the "Draft a new XI" button, and disabled under prefers-reduced-motion.
 */
export default function Confetti({ durationMs = 9000 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
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
          size: 5 + Math.random() * 7,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.35,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          round: Math.random() < 0.4,
        });
      }
    };
    add(200); // an opening burst

    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (t - start < durationMs && pieces.length < 460) add(7); // keep it heavy
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += 0.05; // gravity
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
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
        if (p.y > h + 40) pieces.splice(i, 1);
      }
      if (pieces.length > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [durationMs]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50" />;
}
