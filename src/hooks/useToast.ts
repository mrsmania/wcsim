import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a toast stays up. */
const TOAST_MS = 4500;

/**
 * A transient one-line message with its own timer. Extracted from `CupRunScreen`, which is
 * where the Cup Run's boost toast lived (hygiene H147); it is a self-contained machine with
 * nothing to do with the run.
 *
 * Two things it keeps, both of which were already right and are easy to lose in a rewrite:
 * showing a second message RESTARTS the timer rather than letting the first one's timeout
 * clear the second, and the timer is cleared on unmount so a navigation away cannot call
 * `setState` on a gone component.
 */
export function useToast(): { toast: string | null; showToast: (msg: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { toast, showToast };
}
