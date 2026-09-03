// Characterization checks for THE BUILD AS AN INSTANTIABLE UNIT (pvp-plan P29, wave 4).
//
// The build used to be the composition root's own body, and the two things that stopped a
// second one existing were not state at all - they were writes. It mirrored itself to the
// single persisted game state on every tap, and every path that started a fresh XI dropped
// the player's active Cup Run. A versus room drafting through the same code would
// therefore have overwritten a half-built solo XI, DELETED a live run, and (while signed
// in) made one server round trip per tap, where a single failure raises the blocking
// unreachable screen full-screen with a pick clock still running.
//
// So the two writes became a seam (`src/state/buildIo.ts`) and everything else became a
// hook that can be called twice. What is asserted here is that seam and the ONE way it can
// quietly come undone: a third write added straight into the build, which no `io` can
// intercept. That is a source-level check on purpose - there is nothing to run, the defect
// is a line of code being in the wrong file.

import { readFileSync } from 'node:fs';
import { check } from './harness';
import { createBuildIo, detachedBuildIo, soloBuildIo, type BuildWriter } from '../../src/state/buildIo';
import { initialState, type GameState } from '../../src/state/gameReducer';

/** A `BuildWriter` that records rather than writes. */
function recorder(): BuildWriter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    saveGame(state: GameState) {
      calls.push(`saveGame:${state.phase}`);
      return Promise.resolve();
    },
    saveRun(run: null) {
      calls.push(`saveRun:${String(run)}`);
      return Promise.resolve();
    },
  };
}

/** The same sequence of build events, put through whichever io. Everything a build does
 *  to the world beyond its own reducer happens in one of these five moments. */
function exercise(io: { saveBuild(s: GameState): void; clearRun(): void }): void {
  io.saveBuild(initialState);
  io.clearRun();
  io.saveBuild({ ...initialState, phase: 'draft' });
  io.saveBuild({ ...initialState, phase: 'complete' });
  io.clearRun();
}

export function buildChecks(): void {
  // --- The seam: the app's build writes, a room's build writes NOTHING -------
  // The vacuity guard is the first half of the same check, and it is not decoration:
  // "the detached io made no calls" is worth nothing unless the identical sequence
  // through a live writer demonstrably makes some.
  {
    const live = recorder();
    exercise(createBuildIo(live));
    const dead = recorder();
    exercise(createBuildIo(null));
    check(
      'build: the app\'s build mirrors itself and drops the run; a detached one writes nothing',
      () =>
        // Vacuity: the sequence really does write, five times, in order.
        live.calls.join(' ') ===
          'saveGame:setup saveRun:null saveGame:draft saveGame:complete saveRun:null' &&
        // ...and the same sequence through a detached build reaches the store not once.
        dead.calls.length === 0,
      () => `live: [${live.calls.join(', ')}]; detached: [${dead.calls.join(', ')}]`,
    );
  }

  // --- The two exports are the two instances of that one factory --------------
  // Both are objects with the same shape, so a caller cannot tell them apart by duck
  // typing and pick the wrong one by accident; and the SURFACE is exactly two methods,
  // which is what makes "persistence and run-clearing off" a complete list rather than
  // the two writes somebody happened to remember.
  {
    const wanted = ['saveBuild', 'clearRun'];
    const keys = (o: object) => Object.keys(o).sort();
    check(
      'build: a build writes through exactly two methods, and both ios implement both',
      () =>
        keys(soloBuildIo).join() === wanted.slice().sort().join() &&
        keys(detachedBuildIo).join() === wanted.slice().sort().join() &&
        soloBuildIo !== detachedBuildIo,
      () => `solo: [${keys(soloBuildIo).join(', ')}]; detached: [${keys(detachedBuildIo).join(', ')}]`,
    );
  }

  // --- The build unit reaches nothing the APP owns ----------------------------
  // The check that actually protects a room. `detachedBuildIo` intercepts the two writes
  // it is given; it cannot intercept a `store.saveX()` written straight into the hook, or
  // a `useNavigate` that walks a player out of a room mid-draft. So the rule is that the
  // build unit does not import any of it at all - it is handed what it needs.
  //
  // The vacuity guard is the last clause: the same scan run over the composition root has
  // to FIND those imports. If the matcher ever stops matching, App comes back clean and
  // this fails, rather than passing over five files it can no longer read.
  {
    const src = (f: string) => readFileSync(`src/${f}`, 'utf8');
    /** The modules a build must not reach for: the app's persistence and its kickoff
     *  request, its routing, and the two progress layers a room has none of (P8: no part
     *  of a career reaches a room, and the album has no business in one either).
     *
     *  Matched on the SUFFIX, so a relative specifier from either directory reads the
     *  same: `./state/store` from the root and `../state/store` from a hook. */
    const FORBIDDEN = ['state/store', 'nav/pendingRun', 'react-router-dom', 'useCareer', 'useStickerAlbum'];
    const reaches = (imports: string[], mod: string) =>
      imports.some((i) => i === mod || i.endsWith(`/${mod}`));
    const importsOf = (text: string) =>
      [...text.matchAll(/^import[^;]*?from '([^']+)';/gms)].map((m) => m[1]!);
    const unit = ['hooks/useBuild.ts', 'components/BuildSurface.tsx'];
    const reached = unit.flatMap((f) => {
      const imports = importsOf(src(f));
      return FORBIDDEN.filter((m) => reaches(imports, m)).map((m) => `${f} imports ${m}`);
    });
    // Vacuity: the composition root does reach every one of them, through this same scan.
    const appImports = importsOf(src('App.tsx'));
    const appReaches = FORBIDDEN.filter((m) => reaches(appImports, m));
    check(
      'build: the build unit imports no store, no router and no career or album',
      () =>
        reached.length === 0 &&
        unit.every((f) => src(f).length > 1000) &&
        // The scan works: App reaches all five of them.
        appReaches.length === FORBIDDEN.length,
      () =>
        reached.length
          ? reached.join('; ')
          : `the scan found only ${appReaches.length} of ${FORBIDDEN.length} in App.tsx, so it is not reading imports`,
    );

    // A ROOM'S BUILD IS THE DETACHED ONE, and this is the same kind of check as the two
    // export lines below and for the same reason: `detachedBuildIo` and `soloBuildIo` are
    // interchangeable objects, so a room wired to the wrong one behaves perfectly until
    // somebody's Cup Run disappears. It also has to take its controls from the room's own
    // set - `roomControls`, which is `ROOM_CONTROLS` plus the two a whole-draft room can
    // afford (P52) - and never from the app's.
    {
      const draft = src('components/versus/RoomDraft.tsx');
      check(
        "build: a room's draft is built detached, and hides the controls a room hides",
        () =>
          draft.includes('detachedBuildIo') &&
          /controls=\{roomControls\(/.test(draft) &&
          !draft.includes('soloBuildIo') &&
          !draft.includes('SOLO_CONTROLS'),
        () => 'src/components/versus/RoomDraft.tsx is not wired to the detached build',
      );
    }

    // THE MOVE IS POSTED, AND IT IS TOLD APART FROM A PICK (P42). Nothing behavioural can
    // see either half. A screen that never posted the rearrangement would look right for a
    // second and then spring back, which is exactly the state the gesture was switched off
    // in for two waves; and a screen that posted EVERY board change as a move would send a
    // pick down a route that refuses it, which reads as a room that keeps rejecting picks
    // it has already taken. The roster comparison is the whole distinction - the same
    // question the referee asks - so the check reads for it rather than for the call alone.
    {
      const draft = src('components/versus/RoomDraft.tsx');
      const client = src('state/pvp/referee.ts');
      check(
        "build: a per-pick room posts a MOVE, guarded by the same permutation test the referee applies",
        () =>
          /room\s*\.move\(/.test(draft) &&
          /const rearranged =[^;]*roster\(/.test(draft) &&
          /if \([^)]*!rearranged[^)]*\) return;/.test(draft) &&
          // AND A REFEREE THAT HAS NEVER HEARD OF THE ROUTE IS NOT AN ERROR. The client
          // half deploys by pushing to `main` and the referee is rebuilt by hand, so a
          // 404 here is expected rather than exceptional: it has to become an answer the
          // screen can act on (`canMove`), never a red line on the room strip.
          /'no-such-route'/.test(client) &&
          /outcome: 'no-route'/.test(client) &&
          // Vacuity: the scan is reading the real files, which both name things it is not
          // looking for here.
          /room\.pick\(/.test(draft) &&
          client.includes('postXi'),
        () =>
          `move ${/room\s*\.move\(/.test(draft)}, guard ${/if \([^)]*!rearranged[^)]*\) return;/.test(draft)}, no-route ${/outcome: 'no-route'/.test(client)}`,
      );
    }

    // The store is reached from ONE file on the build's behalf, and that file is the
    // seam. A second one would be a second policy nobody could switch off.
    //
    // The second half reads the two exports rather than calling them, and it is the one
    // thing the behavioural check above CANNOT see: `createBuildIo(null)` writes nothing
    // because there is nothing to write to, so the property that decides whether a room
    // is safe is which argument the detached export is built with. A copy-paste making it
    // `createBuildIo(store)` would pass every other check in this file.
    const io = readFileSync('src/state/buildIo.ts', 'utf8');
    const built = (name: string) =>
      new RegExp(`export const ${name}: BuildIo = createBuildIo\\(([a-z]+)\\);`).exec(io)?.[1];
    check(
      "build: the seam is the one file that knows the store, and only the app's build gets it",
      () =>
        io.includes("from './store'") &&
        built('soloBuildIo') === 'store' &&
        built('detachedBuildIo') === 'null',
      () =>
        `solo is built with ${String(built('soloBuildIo'))}, detached with ${String(built('detachedBuildIo'))}`,
    );
  }
}
