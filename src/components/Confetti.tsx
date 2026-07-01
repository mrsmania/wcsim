import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

/** Festive palette (gold + the pitch greens + amber + white + a warm red). */
const COLORS = ['#F5C542', '#15924c', '#0E5C34', '#E4922B', '#ffffff', '#C8453C'];

/**
 * A full-viewport confetti celebration: two opening cannon bursts from the lower
 * corners, then a heavy rain from the top for `durationMs`. Backed by
 * canvas-confetti bound to our own canvas so it stays pointer-events-none (never
 * blocks the "Draft a new XI" button), sits at z-50, and is disabled under
 * prefers-reduced-motion. Piece size scales down on narrow screens so it is not
 * oversized on mobile.
 */
export default function Confetti({ durationMs = 9000 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;

    // No worker: it would transferControlToOffscreen(), which can only happen once
    // per canvas and so throws under React StrictMode's dev double-invoke. This
    // amount of confetti is fine on the main thread.
    const fire = confetti.create(canvas, { resize: true });
    // Narrow screens get smaller, fewer pieces (an absolute-sized piece looks huge
    // on a phone); wider screens get the full-size, denser rain.
    const narrow = window.innerWidth < 640;
    const scalar = narrow ? 0.6 : 0.9;
    const perFrame = narrow ? 3 : 6;

    // Opening burst from each lower corner, angled up and inward.
    fire({ particleCount: 90, spread: 100, startVelocity: 45, angle: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, scalar });
    fire({ particleCount: 90, spread: 100, startVelocity: 45, angle: 120, origin: { x: 1, y: 0.75 }, colors: COLORS, scalar });

    const end = performance.now() + durationMs;
    let raf = 0;
    const frame = (t: number) => {
      // Rain: drop pieces from just above the top edge with a little drift.
      fire({
        particleCount: perFrame,
        startVelocity: 0,
        ticks: 260,
        gravity: 0.7,
        drift: (Math.random() - 0.5) * 2,
        origin: { x: Math.random(), y: -0.1 },
        colors: COLORS,
        scalar,
      });
      if (t < end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      fire.reset();
    };
  }, [durationMs]);

  // h-full w-full is load-bearing: a <canvas> is a replaced element, so fixed
  // inset-0 alone leaves it at its intrinsic 300x150 (pinned top-left) and the
  // confetti draws only inside that box. A definite size stretches it full-viewport.
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
