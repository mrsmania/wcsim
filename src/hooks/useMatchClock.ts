import { useEffect, useRef, useState } from 'react';
import {
  buildMatchSteps,
  HALF_TIME_MS,
  PEN_MS,
  STEP_MS,
  type MatchSpeed,
} from '../domain/clock';
import type { PenKick } from '../domain/match';

/** Hold (ms) on the final scoreline before the group screen records + advances. */
export const FT_HOLD_MS = 700;
/** Hold (ms) on the final scoreline before a knockout round records + advances. */
export const KO_END_HOLD_MS = 1200;
/** Delay (ms) after the final whistle before a shootout starts revealing. */
export const SHOOTOUT_START_MS = 700;
/** Hold (ms) after the last penalty before the knockout round records + advances. */
export const SHOOTOUT_END_HOLD_MS = 1500;

/** What a match reveal needs from its caller. Passed fresh each render; the hook
 *  reads it through a ref so only starting a new match restarts the timer. */
export interface MatchClockSpec {
  /** True while a match is being revealed (drives the timer on/off). */
  active: boolean;
  /** Current playback speed (read via a ref, so changing it never restarts). */
  speed: MatchSpeed;
  /** Last minute to count to (90, or 120 for a knockout that went to extra time). */
  maxMinute: number;
  /** Label shown at the final whistle ("FT", "a.e.t.", "pens"). */
  endLabel: string;
  /** Penalty kicks to reveal one by one after full time (knockout shootouts). */
  penKicks?: PenKick[];
  /** How long to hold the final scoreline before {@link onEnd} when there is no
   *  shootout (the group screen uses a shorter hold than the knockout screen). */
  endHoldMs: number;
  /** Fired once the whole reveal (match + any shootout) has finished. */
  onEnd: () => void;
}

/** State a match card reads to render the live clock + shootout. */
export interface MatchClockState {
  liveMinute: number;
  clockLabel: string;
  /** How many penalty kicks have been revealed so far (0 until the shootout runs). */
  penShown: number;
}

/**
 * The shared match-reveal clock used by both the group and knockout screens. It
 * runs the {@link buildMatchSteps} sequence for the current speed (minute-by-minute
 * with per-half stoppage and a half-time hold), then shows the end label, then -
 * for a knockout that went to penalties - reveals the shootout kick by kick, and
 * finally fires `spec.onEnd`. The reveal cadence, half-time handling, goal-feed
 * timing, and end-of-match transition are identical to the effects it replaces;
 * only the ownership moved into one hook.
 *
 * `speed`, the callback, and the labels are read through a ref so changing them
 * does not restart the timer; the effect only re-runs when a new match starts
 * revealing (`active` flips or the reveal `id` changes), matching the originals.
 */
export function useMatchClock(spec: MatchClockSpec): MatchClockState {
  const [liveMinute, setLiveMinute] = useState(0);
  const [clockLabel, setClockLabel] = useState('');
  const [penShown, setPenShown] = useState(0);

  const specRef = useRef(spec);
  specRef.current = spec;

  const { active } = spec;

  useEffect(() => {
    if (!active) return;
    // Snapshot the reveal parameters at start; speed is re-read per tick so a
    // mid-match speed change still takes effect on the next tick.
    const start = specRef.current;
    const maxMinute = start.maxMinute;
    const endLabel = start.endLabel;
    const endHoldMs = start.endHoldMs;
    const kicks = start.penKicks ?? [];
    const steps = buildMatchSteps(maxMinute, HALF_TIME_MS[specRef.current.speed]);
    let idx = 0;
    let timer: number | undefined;

    const advance = () => {
      specRef.current.onEnd();
    };

    // Reveal the shootout one kick at a time, then hold and finish.
    const runShootout = () => {
      let k = 0;
      const penId = window.setInterval(() => {
        k += 1;
        setPenShown(k);
        if (k >= kicks.length) {
          window.clearInterval(penId);
          timer = window.setTimeout(advance, SHOOTOUT_END_HOLD_MS);
        }
      }, PEN_MS[specRef.current.speed]);
      timer = penId;
    };

    // Full time: show the end label, then either run the shootout or hold + finish.
    const finishClock = () => {
      setClockLabel(endLabel);
      if (kicks.length) timer = window.setTimeout(runShootout, SHOOTOUT_START_MS);
      else timer = window.setTimeout(advance, endHoldMs);
    };

    const tick = () => {
      const step = steps[idx];
      setLiveMinute(step.reveal);
      setClockLabel(step.label);
      const delay = STEP_MS[specRef.current.speed] + (step.hold ?? 0);
      if (idx >= steps.length - 1) {
        timer = window.setTimeout(finishClock, delay);
        return;
      }
      idx += 1;
      timer = window.setTimeout(tick, delay);
    };

    setLiveMinute(0);
    setClockLabel('');
    setPenShown(0);
    tick();
    return () => {
      if (timer) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
    };
  }, [active]);

  return { liveMinute, clockLabel, penShown };
}
