import type { GameState } from './gameReducer';
import { store } from './store';

/**
 * Everything a build does to the world OUTSIDE its own reducer, as one small object
 * the build is handed rather than reaches for.
 *
 * There is exactly one build in the single-player game and it is the whole app's state,
 * so for a long time these two writes could simply be called where they happened. A
 * versus room needs a SECOND build (pvp-plan P29), running beside the first, and both of
 * them are wrong for it:
 *
 *  - `saveBuild` mirrors the build so a refresh resumes it. A room's draft must not be
 *    mirrored: it would overwrite the half-built XI the player left on the build page,
 *    and while signed in it is a server round trip PER TAP, where one failure raises the
 *    blocking unreachable screen (D9) full screen with the pick clock still running.
 *  - `clearRun` drops an in-progress Cup Run, because starting a fresh XI means the run
 *    that XI was built for is over. A room starting a build through the same door would
 *    silently DELETE a live Cup Run.
 *
 * So the two are a seam. `soloBuildIo` is the app's own build and behaves exactly as the
 * code that used to be inline; `detachedBuildIo` writes nothing at all, which is what a
 * room is instantiated with. Nothing else in the build may touch the store - see the
 * source-level check in `scripts/checks/build.ts`, which is what keeps a third write from
 * being added straight into the hook and quietly reaching the server from inside a room.
 */
export interface BuildIo {
  /** Mirror the whole build, so a refresh resumes it where it was. */
  saveBuild(state: GameState): void;
  /** Drop an in-progress Cup Run: a fresh XI replaces the team it was built for. */
  clearRun(): void;
}

/** The two store methods a build writes through. Narrowed to those two on purpose: it is
 *  the whole list, and a fake in the checks has to implement only what is really used. */
export type BuildWriter = {
  saveGame: (state: GameState) => Promise<unknown>;
  saveRun: (run: null) => Promise<unknown>;
};

/**
 * A build's writes, through `writer` - or NOTHING AT ALL when it is null.
 *
 * A factory rather than two hand-written objects so that "the detached one writes
 * nothing" is a property of one piece of code that can be exercised with a recording
 * fake, instead of two implementations that have to be kept in step by eye.
 */
export function createBuildIo(writer: BuildWriter | null): BuildIo {
  if (!writer) {
    return {
      saveBuild() {},
      clearRun() {},
    };
  }
  return {
    saveBuild(state) {
      // Voided like every other local write: nothing awaits it, and a failed account
      // write is reported by the store itself.
      void writer.saveGame(state);
    },
    clearRun() {
      void writer.saveRun(null);
    },
  };
}

/** The app's own build: mirrored to storage, and starting a fresh XI ends the run. */
export const soloBuildIo: BuildIo = createBuildIo(store);

/** A build that belongs to nobody but its own screen: a versus room's draft (P29).
 *  It persists nothing and it cannot reach the player's run. */
export const detachedBuildIo: BuildIo = createBuildIo(null);
