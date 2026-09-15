import { useEffect } from 'react';

/**
 * Hold the page still while a modal is open.
 *
 * THE LOCK IS THE EASY HALF AND THE SCROLLBAR IS THE HARD ONE. Locking is
 * `overflow: hidden` on the document element (the page scrolls on the root, not on
 * `body`), and that on its own REMOVES the scrollbar - so on any platform with classic
 * scrollbars the layout viewport grows by the bar's width the instant a modal opens and
 * the whole page behind the backdrop jumps sideways. Measured in Chrome at a 1024px
 * window: `body` goes 1009 -> 1024, so everything centred moves 7.5px right and
 * everything full-width reflows, in the one moment the reader is being asked to look at
 * something else. Reported from the game about the album's trade modal, and it was every
 * modal in the app.
 *
 * SO THE GUTTER IS MEASURED AND PAID BACK as padding on the same element, which holds
 * `body`'s width to the pixel (verified: 1009 before, 1009 locked, 1009 after). It is
 * measured per lock rather than assumed, because the figure is the platform's and not
 * ours: a phone and macOS draw OVERLAY scrollbars that take no layout space at all, so
 * the measurement is 0 there and this whole mechanism costs nothing.
 *
 * `scrollbar-gutter: stable` IS NOT THE FIX, WHICH IS WORTH WRITING DOWN because it is
 * the obvious one-line answer and it was tried first. The property reserves the gutter
 * only when `overflow` is `scroll` or `auto`; `hidden` is deliberately not on that list,
 * so a browser that fully supports it (this one does) still shifts the full 15px. Do not
 * replace the arithmetic below with that declaration.
 *
 * `html { overflow-y: scroll }` in `index.css` is a DIFFERENT rule solving a different
 * jump - a short page and a tall one having the same width - and it is what makes the
 * gutter reliably non-zero here. The inline `overflow: hidden` overrides it, which is
 * exactly how a rule written to stop the page shifting came to be defeated by a modal.
 *
 * IT COUNTS, because two modals can overlap and the naive save-and-restore pair strands
 * the page. Each copy captures the CURRENT overflow, so if the outer one unmounts first
 * it restores the scroll while the inner one is still up, and the inner one then
 * "restores" `hidden` on the way out and the page can never be scrolled again. One
 * counter, locked on the first and released on the last, has no ordering to get wrong.
 */
let locks = 0;
let restore: (() => void) | null = null;

function lock(): void {
  locks += 1;
  if (locks > 1) return;

  const el = document.documentElement;
  const prevOverflow = el.style.overflow;
  const prevPadding = el.style.paddingRight;
  // Before hiding, not after: once `overflow` is hidden the bar is gone and the
  // difference reads 0, which is the measurement being taken after the thing it measures
  // has been removed.
  const gutter = window.innerWidth - el.clientWidth;

  el.style.overflow = 'hidden';
  if (gutter > 0) el.style.paddingRight = `${gutter}px`;

  restore = () => {
    el.style.overflow = prevOverflow;
    el.style.paddingRight = prevPadding;
  };
}

function unlock(): void {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  restore?.();
  restore = null;
}

/** Lock the page's scroll for as long as the calling component is mounted. */
export function useScrollLock(): void {
  // No dependencies: the lock is taken on mount and given back on unmount, so a
  // re-render must not re-run it (which is what the two hand-written copies of this
  // were careful about, in the same words, twice).
  useEffect(() => {
    lock();
    return unlock;
  }, []);
}
