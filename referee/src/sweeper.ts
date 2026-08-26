// The one thing that moves a room forward when nobody is doing anything.
//
// Wave 3 of docs/pvp-plan.md, decision P32. It holds no state - not a timer, not a room, not
// a deadline - so it is correct across a restart by construction, correct if two instances
// briefly overlap during a redeploy (the store's row lock is what settles that), and it can
// be run once by hand to see what it would do.
//
// It is also the only place P45's recovery is applied, and `outage.ts` says at length why
// that is conditional rather than every time.
//
// WHAT IT DOES NOT DO: it does not decide anything. Every judgement - whose window expired,
// what the auto-pick is, when a round advances - is `tickRoom`, which is pure and checked.
// This is a loop and an error boundary.

import { recoverFromOutage, tickRoom } from '../../src/domain/pvpRoom';
import { recoverIfNeeded } from './outage';
import type { RoomStore } from './store';

export interface SweepResult {
  /** Rooms looked at. */
  scanned: number;
  /** Rooms that actually changed, and so were written and published. */
  advanced: string[];
  /** Rooms that came back from an outage with time handed back. */
  recovered: string[];
  /** Codes that threw. One bad room must not stop the sweep: the next room's player is
   *  waiting on a clock that does not care why. */
  failed: string[];
}

export async function sweepOnce(
  store: RoomStore,
  now: number,
  sweepMs: number,
): Promise<SweepResult> {
  const out: SweepResult = { scanned: 0, advanced: [], recovered: [], failed: [] };
  const codes = await store.liveCodes();
  for (const code of codes) {
    out.scanned += 1;
    try {
      const done = await store.mutate(code, now, (room, ctx) => {
        const recovered = recoverIfNeeded(room, ctx.sweptAt, now, sweepMs);
        const ticked = tickRoom(recovered, now);
        return {
          room: ticked,
          // `recoverIfNeeded` and `tickRoom` both return their argument when there was
          // nothing to do, so identity is the whole test and an idle room costs one read.
          result: { changed: ticked !== room, recovered: recovered !== room },
          unchanged: ticked === room,
        };
      });
      if (!done) continue;
      if (done.result.recovered) out.recovered.push(code);
      if (done.result.changed) out.advanced.push(code);
    } catch {
      out.failed.push(code);
    }
  }
  return out;
}

/**
 * P45 at BOOT, where the gap is an outage however short it was.
 *
 * The threshold in `outage.ts` is there to tell an ordinary sweep from a restart, and at
 * startup there is nothing to tell apart: the process was not running, so every millisecond
 * since the last sweep is time a player spent staring at a screen whose submissions were
 * failing. A two-second redeploy is a tenth of a twenty-second window, which is worth
 * giving back, and the clamp inside `recoverFromOutage` means a crash loop cannot hand out
 * more than one full window however many times this runs.
 *
 * Deliberately BEFORE the first sweep. The other order auto-picks for everybody and then
 * apologises.
 */
export async function recoverAtBoot(store: RoomStore, now: number): Promise<string[]> {
  const out: string[] = [];
  for (const code of await store.liveCodes()) {
    try {
      const done = await store.mutate(code, now, (room, ctx) => {
        const next = ctx.sweptAt === null ? room : recoverFromOutage(room, ctx.sweptAt, now);
        return { room: next, result: next !== room, unchanged: next === room };
      });
      if (done?.result) out.push(code);
    } catch {
      // A room that will not load is the sweeper's problem in a moment, not the boot's.
    }
  }
  return out;
}

/**
 * The sweep loop.
 *
 * `setTimeout` after each pass rather than `setInterval`, so a slow pass cannot queue up
 * behind itself: the sweeper is stateless and idempotent, but two of it running at once
 * would spend the row lock arguing with itself for no benefit.
 */
export function startSweeper(
  store: RoomStore,
  sweepMs: number,
  onSweep: (result: SweepResult) => void,
): () => void {
  let stopped = false;
  let handle: ReturnType<typeof setTimeout> | null = null;
  const pass = async (): Promise<void> => {
    try {
      onSweep(await sweepOnce(store, Date.now(), sweepMs));
    } catch {
      // A store that is down entirely. Nothing to do but come round again: the deadlines
      // are in the database, so no time is lost, and the outage rule hands it back.
    }
    if (!stopped) handle = setTimeout(() => void pass(), sweepMs);
  };
  void pass();
  return () => {
    stopped = true;
    if (handle) clearTimeout(handle);
  };
}
