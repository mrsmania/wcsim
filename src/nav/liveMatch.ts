/**
 * "A match is revealing right now."
 *
 * Published by `useMatchClock`, the one hook the group screen, the knockout screen and
 * the Cup Run all share, and read only by the tabs navigation, which goes inert while a
 * reveal runs. The reason it has to: the live playback is transient state that is
 * deliberately not persisted (a refresh replays the current match), so navigating away
 * mid-match loses it. The run ladder already takes a `locked` flag for exactly this;
 * this is the same rule for the nav bar.
 *
 * A counter rather than a boolean, so two overlapping reveals (a screen unmounting while
 * another mounts) cannot leave the bar stuck. With the classic navigation nothing
 * subscribes and this is a number no one reads.
 */
import { useEffect, useState } from 'react';

let held = 0;
const subs = new Set<(live: boolean) => void>();

const emit = () => {
  const live = held > 0;
  for (const s of subs) s(live);
};

/** Mark a reveal as running; call the returned function to release it (idempotent). */
export function holdLiveMatch(): () => void {
  held += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held = Math.max(0, held - 1);
    emit();
  };
}

/** Subscribe to "a match is revealing" (re-renders on change). */
export function useLiveMatch(): boolean {
  const [live, setLive] = useState(() => held > 0);
  useEffect(() => {
    subs.add(setLive);
    // Re-sync on mount: a reveal may already be running when the bar mounts.
    setLive(held > 0);
    return () => {
      subs.delete(setLive);
    };
  }, []);
  return live;
}
