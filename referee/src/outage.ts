// Giving back the time an outage ate, and NOT giving it back the rest of the time.
//
// Wave 3 of docs/pvp-plan.md, decision P45. The rule itself is
// `recoverFromOutage` in `src/domain/pvpRoom.ts`, which is pure and already checked; what
// this file owns is the one question it cannot answer on its own: WHEN to apply it.
//
// THE BUG THIS FILE EXISTS TO PREVENT, found while wiring the sweeper and worth stating in
// full because the code that causes it looks obviously right.
//
// The sweeper knows when it last swept a room, so the tempting shape is: on every sweep,
// hand back the remainder since the last sweep, then tick. Every sweep is then "an outage
// of one second", which sounds harmless. It is not. `recoverFromOutage` sets
// `openedAt = now - (lastSeen - openedAt)`, so the elapsed time is FROZEN at whatever it
// was at the previous sweep - and the next sweep freezes it at the same value again. The
// pick clock stops dead. Nobody's window ever expires, the auto-pick never fires, and a
// room with an absent player waits for ever: the exact stall the entire no-timers design
// exists to make impossible, reintroduced by the mechanism meant to be fair about it.
//
// So recovery is conditional, and the condition is a gap that cannot be an ordinary sweep.
// `npm run checks` asserts both halves - that an ordinary sweep does not hand time back,
// and that a 45-second gap does - because the first is the one that would pass unnoticed:
// a room whose clock has stopped looks perfectly healthy until somebody stops picking.

import { recoverFromOutage, type PvpRoom } from '../../src/domain/pvpRoom';
import { OUTAGE_FLOOR_MS, OUTAGE_SWEEPS } from './env';

/** The gap that counts as the referee having been away. */
export function outageMs(sweepMs: number): number {
  return Math.max(sweepMs * OUTAGE_SWEEPS, OUTAGE_FLOOR_MS);
}

/**
 * Was the referee away? A gap of more than a few sweep intervals AND more than the floor is
 * not a slow sweep, it is a restart, a redeploy or a stalled container.
 *
 * BOTH halves of that threshold earn their place. The multiple keeps a deployment that
 * sweeps every five seconds from reading every ordinary pass as an outage. The floor keeps
 * a fast one from reading a single slow pass as one - and it is what stops the pathological
 * case, a sweeper persistently slower than its own interval, from handing time back on
 * every pass and freezing the clock exactly as the unconditional version would.
 *
 * A sweeper that is genuinely slower than ten seconds a pass is a broken deployment either
 * way, and this errs towards giving players time rather than auto-picking through them.
 */
export function wasOutage(sweptAt: number | null, now: number, sweepMs: number): boolean {
  if (sweptAt === null) return false;
  return now - sweptAt > outageMs(sweepMs);
}

/**
 * Apply P45 if, and only if, there was an outage.
 *
 * Returns the same object when there was not, so a caller can skip a write on identity -
 * the pattern the rest of this feature uses.
 */
export function recoverIfNeeded(
  room: PvpRoom,
  sweptAt: number | null,
  now: number,
  sweepMs: number,
): PvpRoom {
  if (!wasOutage(sweptAt, now, sweepMs)) return room;
  return recoverFromOutage(room, sweptAt!, now);
}
