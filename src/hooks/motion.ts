/** How long (ms) a reveal scramble runs before it settles on the real answer. Shared by
 *  the two scrambles the game has - the squad roll on the build page and the group draw's
 *  flags - which had a copy each. They are deliberately NOT one hook: the roll accelerates
 *  (55ms ticks easing out to 260) while the draw steps evenly at 90ms, so what they share
 *  is how long the beat lasts, not how it is animated. */
export const SCRAMBLE_MS = 1300;

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
