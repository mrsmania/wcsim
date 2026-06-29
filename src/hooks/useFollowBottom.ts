import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

/** Options for {@link useFollowBottom}. */
interface FollowBottomOpts {
  /** Gap (px) to leave below the latest content so it is not glued to the fold. */
  margin?: number;
  /** How far (px) the tail may sit below the fold before we treat the user as
   *  having scrolled away (which pauses following until they return). */
  threshold?: number;
}

/**
 * Keep the bottom of a growing region (a "tail" marker) a small margin above the
 * bottom edge of the screen as content is appended. Rules:
 *
 *  - DOWN only. If new content still fits above the fold the target is at or above
 *    the current position and nothing happens ("still space above the break, do
 *    not scroll"). We never scroll up, which is what caused the old upward lurches.
 *  - Only content growth triggers a scroll. Scroll/resize events are read to
 *    decide whether to follow, never to cause a scroll (that feedback was the
 *    other half of the jumping).
 *  - Only real downward growth of the SAME tail acts. First sight and any tail
 *    change (a match ends, a new round mounts) just set a baseline, so arriving
 *    and switching regions never jump.
 *  - Pause/resume: "stuck" is recomputed from the tail's position on every scroll.
 *    Near the bottom of the active content => follow; scrolled up past `threshold`
 *    => pause. Our own scrolls land in the stuck zone, so we never need to tell
 *    our scrolls apart from the user's.
 *
 * The scroll itself is a single owned requestAnimationFrame easing loop rather
 * than window.scrollTo({behavior:'smooth'}). The native smooth scroll, called
 * repeatedly as goals arrive near the document bottom, retargets and overshoots
 * against the scroll clamp and visibly wobbles. The owned loop eases toward one
 * monotonically-downward target, clamps to the max scroll, and stops cleanly when
 * it arrives or cannot move further, so it never overshoots or fights the clamp.
 *
 * `rootRef` is a CALLBACK ref so the observers attach the moment React mounts the
 * content wrapper (the screen first renders a group-draw takeover where the
 * wrapper is absent; an object ref read once would be null).
 */
export function useFollowBottom(opts?: FollowBottomOpts): {
  tailRef: MutableRefObject<HTMLDivElement | null>;
  rootRef: (node: HTMLDivElement | null) => void;
} {
  const margin = opts?.margin ?? 24;
  const threshold = opts?.threshold ?? 120;

  const tailRef = useRef<HTMLDivElement | null>(null);
  const marginRef = useRef(margin);
  const thresholdRef = useRef(threshold);
  marginRef.current = margin;
  thresholdRef.current = threshold;

  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => setRootEl(node), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    // Follow by default; off when the user scrolls up, back on at the bottom.
    let stuck = true;
    // Absolute document position of the tail's bottom last time we looked, and the
    // tail element it belonged to (a relocating tail re-baselines, never scrolls).
    let lastDocBottom: number | null = null;
    let lastMarker: HTMLDivElement | null = null;
    let scheduleRaf: number | null = null;

    // --- owned easing loop -------------------------------------------------
    let animTarget: number | null = null;
    let animRaf: number | null = null;

    const stopAnim = () => {
      animTarget = null;
      if (animRaf !== null) {
        window.cancelAnimationFrame(animRaf);
        animRaf = null;
      }
    };

    const tick = () => {
      animRaf = null;
      if (animTarget === null || !stuck) {
        animTarget = null;
        return;
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.min(animTarget, maxScroll);
      const cur = window.scrollY;
      const diff = target - cur;
      if (diff <= 0.5) {
        animTarget = null; // arrived
        return;
      }
      window.scrollTo(0, cur + Math.max(1, diff * 0.25)); // ease out
      if (window.scrollY <= cur + 0.5) {
        animTarget = null; // could not move (clamped at the bottom) -> stop
        return;
      }
      animRaf = window.requestAnimationFrame(tick);
    };

    // Ease the page down to `y` (down only; target only ever grows).
    const scrollDownTo = (y: number) => {
      if (reduced?.matches) {
        window.scrollTo(0, y);
        return;
      }
      animTarget = animTarget === null ? y : Math.max(animTarget, y);
      if (animRaf === null) animRaf = window.requestAnimationFrame(tick);
    };

    // --- follow on content growth -----------------------------------------
    const follow = () => {
      scheduleRaf = null;
      const marker = tailRef.current;
      if (!marker) return;
      const bottom = marker.getBoundingClientRect().bottom; // viewport-relative
      const docBottom = bottom + window.scrollY; // absolute, scroll-independent

      if (marker !== lastMarker || lastDocBottom === null) {
        // First sight, or the active region changed: baseline + follow, no scroll.
        lastMarker = marker;
        lastDocBottom = docBottom;
        stuck = true;
        stopAnim();
        return;
      }

      const grew = docBottom > lastDocBottom + 1;
      lastDocBottom = docBottom;
      if (!grew || !stuck) return;

      // Put the tail `margin` above the fold. Down only: if it is already above
      // that line the content fits, desired <= scrollY, and we do nothing.
      const desired = window.scrollY + bottom - (window.innerHeight - marginRef.current);
      if (desired > window.scrollY + 0.5) scrollDownTo(desired);
    };

    const schedule = () => {
      if (scheduleRaf === null) scheduleRaf = window.requestAnimationFrame(follow);
    };

    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;
    if (rootEl) {
      ro = new ResizeObserver(schedule);
      ro.observe(rootEl);
      mo = new MutationObserver(schedule);
      mo.observe(rootEl, { childList: true, subtree: true });
    }

    // Read-only: recompute whether we are stuck. Never scrolls. If the user
    // scrolls away, also abandon any in-flight follow so we do not fight them.
    const onScroll = () => {
      const marker = tailRef.current;
      if (!marker) return;
      const belowFold = marker.getBoundingClientRect().bottom - window.innerHeight;
      stuck = belowFold <= thresholdRef.current;
      if (!stuck) stopAnim();
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (scheduleRaf !== null) window.cancelAnimationFrame(scheduleRaf);
      if (animRaf !== null) window.cancelAnimationFrame(animRaf);
    };
  }, [rootEl]);

  return { tailRef, rootRef };
}
