import { pick } from './random';
import type { KoDecided } from './knockout';
import { ET_MINUTES, REG_MINUTES } from './match';
/** Match simulation playback speed. */
export type MatchSpeed = 'slow' | 'normal' | 'fast';

/** Milliseconds per minute-tick of the live clock, by speed. */
export const STEP_MS: Record<MatchSpeed, number> = { slow: 90, normal: 45, fast: 18 };
/** Half-time hold (ms) by speed. */
export const HALF_TIME_MS: Record<MatchSpeed, number> = { slow: 900, normal: 550, fast: 250 };
/** Per-kick interval (ms) of a penalty shootout, by speed. */
export const PEN_MS: Record<MatchSpeed, number> = { slow: 900, normal: 550, fast: 240 };

/** The final minute of a knockout game, by how the tie was decided. A rule about football,
 *  not about presentation: it is the number `buildMatchSteps` below is called with, so it
 *  decides whether a 105th-minute goal is ever revealed. It lived in the shared
 *  presentational-atoms module (hygiene H145). */
export const maxMinute = (decided: KoDecided) =>
  decided === 'reg' ? REG_MINUTES : REG_MINUTES + ET_MINUTES;

/** One tick of the live match clock. */
export interface ClockStep {
  /** Minute threshold for revealing goals (events with minute <= reveal show). */
  reveal: number;
  /** Display label, e.g. "73'", "45+2'", "HT". */
  label: string;
  /** Extra hold (ms) after this step before the next - used for half-time. */
  hold?: number;
}

// Stoppage minutes 0-7, peaking around 2-3, with 6-7 the least likely.
const STOPPAGE_TABLE = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7];
function stoppage(): number {
  return pick(STOPPAGE_TABLE);
}

/**
 * Build the live-clock step sequence for a match up to `maxMinute` (90, or 120
 * for a knockout that goes to extra time). Each half gets stoppage time (45+x,
 * 90+x), and a brief half-time hold separates the halves. Goals still live at
 * minutes 1..maxMinute; stoppage is shown on the clock only.
 *
 * `added` is the two halves' stoppage, when the CALLER already knows it. The
 * single-player game does not and rolls it here, which is right for a match one
 * person is watching. A versus room does: the added time is decided by the server
 * and sent with the result (plan P30), because it is rolled per client otherwise
 * and two people watching the same stored match would see two different lengths.
 */
export function buildMatchSteps(
  maxMinute: number,
  halfTimeHold: number,
  added?: readonly [number, number],
): ClockStep[] {
  const steps: ClockStep[] = [];
  for (let m = 1; m <= 45; m++) steps.push({ reveal: m, label: `${m}'` });
  const firstHalfAdded = added ? added[0] : stoppage();
  for (let k = 1; k <= firstHalfAdded; k++) steps.push({ reveal: 45, label: `45+${k}'` });
  steps.push({ reveal: 45, label: 'HT', hold: halfTimeHold });
  for (let m = 46; m <= 90; m++) steps.push({ reveal: m, label: `${m}'` });
  const secondHalfAdded = added ? added[1] : stoppage();
  for (let k = 1; k <= secondHalfAdded; k++) steps.push({ reveal: 90, label: `90+${k}'` });
  // Extra time (knockout only): no extra stoppage, just count on.
  for (let m = 91; m <= maxMinute; m++) steps.push({ reveal: m, label: `${m}'` });
  return steps;
}
