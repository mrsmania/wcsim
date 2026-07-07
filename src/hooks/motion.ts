/** Whether the user has asked to reduce motion (respected before any animated
 *  scroll / transition). Guards against a missing matchMedia (very old / SSR). */
export function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Scroll an element into view, honouring the reduced-motion preference (jump
 *  instantly rather than animate). `block` positions it (top/center/...). */
export function scrollIntoViewRespectingMotion(
  el: Element,
  block: ScrollLogicalPosition = 'start',
): void {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block });
}
