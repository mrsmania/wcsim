import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

/** Options for {@link useFollowBottom}. */
interface FollowBottomOpts {
  /** Pixels of breathing room to leave between the tail and the viewport bottom. */
  margin?: number;
  /** How far below the fold the tail may be (px) and still count as "near bottom"
   *  for the stick gate. While stuck, growth auto-follows; once the user scrolls
   *  away, following pauses until they return to the bottom. */
  threshold?: number;
}

/**
 * A single scroll authority for a region whose content grows over time (a live
 * match feed, appended knockout rounds, end-of-run banners). It keeps the bottom
 * of the region (a tail marker) pinned a small margin above the viewport bottom.
 *
 * Why not scrollIntoView: when the tail sits in the MIDDLE of the document (a
 * group match feed with later matchdays rendered below it), the browser thinks
 * the zero-height sentinel is already visible and refuses to scroll. We instead
 * compute the exact target scroll position from the tail's rect, so the margin is
 * honoured whether the tail is mid-document or at the very bottom.
 *
 * What triggers a follow: only genuine bottom-growth, i.e. the tail's absolute
 * document position moving DOWN. We do NOT follow merely because an observer
 * fired. This is the crux of the fix: mounting the screen, a scrollbar appearing
 * when content first overflows, or the mobile toolbar collapsing all fire
 * resize/observer events without adding content below, and following those is
 * exactly what used to yank the page to the bottom on arrival.
 *
 * How growth is detected: a ResizeObserver and a MutationObserver on the content
 * wrapper (`rootRef`). `rootRef` is a CALLBACK ref so the observers attach the
 * moment React mounts that wrapper. This matters because the screen first renders
 * a group-draw takeover where the wrapper is absent; an object ref read once on
 * mount would be null, leaving the observers watching the wrong element (the app
 * shell pins document.body to the viewport height, so a body observer never fires
 * on content growth). The MutationObserver catches DOM insertions (a goal line)
 * that may not resize any observed box.
 *
 * One rAF-coalesced scrollTo per frame, so nothing competes for the native
 * smooth-scroll animation (the source of the old "jumping").
 */
export function useFollowBottom(opts?: FollowBottomOpts): {
  tailRef: MutableRefObject<HTMLDivElement | null>;
  rootRef: (node: HTMLDivElement | null) => void;
} {
  const margin = opts?.margin ?? 24;
  const threshold = opts?.threshold ?? 120;

  const tailRef = useRef<HTMLDivElement | null>(null);
  // Whether we are currently "stuck" to the bottom and should follow growth.
  const stickRef = useRef(true);
  // True while we are mid-flight on our own scrollTo, so the resulting scroll
  // event is not mistaken for the user scrolling away.
  const programmaticRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Keep the latest tuning values reachable from the effect below without
  // re-subscribing observers/listeners on every render.
  const marginRef = useRef(margin);
  const thresholdRef = useRef(threshold);
  marginRef.current = margin;
  thresholdRef.current = threshold;

  // The growing content wrapper, tracked as state via a callback ref so the
  // effect re-runs (and re-attaches the observers) the moment React mounts it.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => setRootEl(node), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    /** Absolute position of the tail's bottom edge in the document (independent
     *  of the current scroll), or null when no tail is mounted. */
    const tailDocBottom = (): number | null => {
      const el = tailRef.current;
      if (!el) return null;
      return el.getBoundingClientRect().bottom + window.scrollY;
    };

    /** Distance (px) from the tail's bottom edge down to the viewport bottom.
     *  Negative when the tail is above the fold (already scrolled past). */
    const tailBelowFold = (): number | null => {
      const el = tailRef.current;
      if (!el) return null;
      return el.getBoundingClientRect().bottom - window.innerHeight;
    };

    /** Scroll so the tail sits `margin` px above the viewport bottom. Explicit
     *  math against the tail rect, NOT scrollIntoView. */
    const scrollToTail = (behavior: ScrollBehavior) => {
      const el = tailRef.current;
      if (!el) return;
      const rectBottom = el.getBoundingClientRect().bottom;
      const target = rectBottom + window.scrollY - window.innerHeight + marginRef.current;
      const top = Math.max(0, target);
      // Nothing to do if we are already within a pixel of the goal (avoids
      // firing a redundant programmatic scroll that would swallow the next real
      // user-scroll via the programmatic flag).
      if (Math.abs(window.scrollY - top) < 1) return;
      programmaticRef.current = true;
      window.scrollTo({ top, behavior });
    };

    /** Coalesce any number of follow requests in a frame into one scrollTo. */
    const requestFollow = (behavior: ScrollBehavior) => {
      if (!stickRef.current) return;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (!stickRef.current) return;
        const effective: ScrollBehavior = prefersReduced?.matches ? 'auto' : behavior;
        scrollToTail(effective);
      });
    };

    // The last known absolute tail position. The first measurement only sets the
    // baseline (no follow), so arriving on the screen never scrolls. After that
    // we follow only when the tail has moved DOWN, i.e. content was added below.
    let lastTailBottom: number | null = null;
    const onContentChange = (behavior: ScrollBehavior) => {
      const tb = tailDocBottom();
      if (tb === null) return;
      if (lastTailBottom === null) {
        lastTailBottom = tb; // baseline only, never scroll on first measurement
        return;
      }
      const grew = tb > lastTailBottom + 2; // > a couple px of real downward growth
      lastTailBottom = tb;
      if (grew) requestFollow(behavior);
    };

    // Observe the growing wrapper (absent during the group-draw takeover, where
    // rootEl is null and there is nothing to follow yet). Live-feed growth is
    // high-frequency, so instant ('auto') avoids the janky, constantly
    // interrupted smooth animation on mobile.
    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;
    if (rootEl) {
      ro = new ResizeObserver(() => onContentChange('auto'));
      ro.observe(rootEl);
      mo = new MutationObserver(() => onContentChange('auto'));
      mo.observe(rootEl, { childList: true, subtree: true });
    }

    // Stick gate. Two separable concerns, kept apart on purpose:
    //
    //  - DISENGAGE only on a genuine user gesture to move UP (wheel up / a touch
    //    drag that lowers scrollY). We must NOT disengage on the generic scroll
    //    event, because when a match ends the tall live-feed box collapses to a
    //    one-line result and the tail teleports to the document end; that layout
    //    shift fires a scroll and leaves the tail far below the fold. Treating
    //    that as "user left the bottom" would wrongly stop us from following the
    //    end-of-run banner into view (the exact bug this avoids).
    //  - RE-ENGAGE liberally: any scroll that lands the tail within threshold of
    //    the fold means we are back at the bottom, so resume following. Snapping
    //    follow back on is the safe direction; the user can always scroll away
    //    again with a fresh gesture.
    const onScroll = () => {
      if (programmaticRef.current) {
        programmaticRef.current = false;
        return;
      }
      const below = tailBelowFold();
      if (below !== null && below <= thresholdRef.current) {
        stickRef.current = true; // back near the bottom
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // A user actively scrolling up (wheel or upward touch drag) disengages the
    // follow so we stop yanking them down while they read earlier content.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        const below = tailBelowFold();
        if (below !== null && below > thresholdRef.current) stickRef.current = false;
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });

    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      // Finger moving DOWN the screen scrolls the page content UP (toward older
      // content), i.e. the user is leaving the bottom.
      if (y - touchY > 6) {
        const below = tailBelowFold();
        if (below !== null && below > thresholdRef.current) stickRef.current = false;
      }
      touchY = y;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    // Mobile dynamic viewport: the URL/toolbar collapsing changes innerHeight
    // mid-run. Re-pin ONLY when we are already stuck and essentially at the
    // bottom, so a viewport change (or the scrollbar appearing on first
    // overflow) can never yank the page down while the user is reading the top.
    const onViewportChange = () => {
      if (!stickRef.current) return;
      const below = tailBelowFold();
      if (below !== null && below <= marginRef.current + 4) requestFollow('smooth');
    };
    window.addEventListener('resize', onViewportChange);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [rootEl]);

  return { tailRef, rootRef };
}
