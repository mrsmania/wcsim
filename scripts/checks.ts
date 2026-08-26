/**
 * WP0 - domain characterization checks.
 *
 * A lightweight, committed stand-in for a test runner. It exercises the
 * deterministic-except-for-`Math.random` game core many times and asserts invariants that
 * must always hold, whatever the random draw. Run it with `npm run checks` (bundled with
 * esbuild and executed in node); it prints a PASS/FAIL summary and exits non-zero if any
 * invariant is violated.
 *
 * This is a safety net for the risky domain math (match sim, penalty shootout, the
 * knockout bracket, standings, chemistry) - not a UI or behaviour change.
 *
 * THIS FILE IS THE INDEX. The assertions live in `checks/`, one module per concern, and
 * this calls them - and `checks/meta.ts` asserts that this list names every one of them,
 * because a module nobody wired in contributes zero assertions silently. It was a single 3,900-line file whose forty-odd blocks shared nothing
 * but the assertion helper (hygiene H104), with two constraints that held only by accident
 * of file position - the seeded sampling had to stay contiguous, and the summary had to
 * come last. Both are explicit now: seeding is a lexical `withSeed(...)` wrapper, and the
 * summary is a call after the loop below.
 *
 * Each module runs inside its own `try`. A concern that throws outside a `check` used to
 * end the run and take every later block with it silently; now it is reported as a failure
 * of that concern and the rest still run.
 */
import { check, summary } from './checks/harness';
import { metaChecks } from './checks/meta';
import { datasetChecks } from './checks/dataset';
import { simChecks } from './checks/sim';
import { chemistryChecks } from './checks/chemistry';
import { pricingChecks } from './checks/pricing';
import { marketChecks } from './checks/market';
import { draftChecks } from './checks/draft';
import { buildChecks } from './checks/build';
import { effectsChecks } from './checks/effects';
import { cardsChecks } from './checks/cards';
import { boonsChecks } from './checks/boons';
import { runChecks } from './checks/run';
import { careerChecks } from './checks/career';
import { oddsChecks } from './checks/odds';
import { assetsChecks } from './checks/assets';
import { challengesChecks } from './checks/challenges';
import { cabinetChecks } from './checks/cabinet';
import { scorersChecks } from './checks/scorers';
import { stateChecks } from './checks/state';
import { pvpChecks } from './checks/pvp';
import { pvpRoomChecks } from './checks/pvpRoom';
import { refereeChecks } from './checks/referee';

/** In the order the single file ran them, which is the order to keep: it is roughly
 *  data -> engine -> economy -> screens, so a broken dataset is reported before the
 *  forty things downstream of it. */
const CONCERNS: [string, () => void | Promise<void>][] = [
  ['meta', metaChecks],
  ['dataset', datasetChecks],
  ['sim', simChecks],
  ['chemistry', chemistryChecks],
  ['pricing', pricingChecks],
  ['market', marketChecks],
  ['draft', draftChecks],
  ['build', buildChecks],
  ['effects', effectsChecks],
  ['cards', cardsChecks],
  ['boons', boonsChecks],
  ['run', runChecks],
  ['career', careerChecks],
  ['odds', oddsChecks],
  ['assets', assetsChecks],
  ['challenges', challengesChecks],
  ['cabinet', cabinetChecks],
  ['scorers', scorersChecks],
  ['state', stateChecks],
  ['pvp', pvpChecks],
  ['pvpRoom', pvpRoomChecks],
  ['referee', refereeChecks],
];

for (const [name, run] of CONCERNS) {
  // `check` reports a throw inside one assertion; this reports a throw between them - a
  // fixture that could not be built, an import-time surprise - against the concern rather
  // than as a bare stack trace that ends the run.
  //
  // A concern may be ASYNC (`referee` is: it drives the referee's real handlers, which take
  // a store that returns promises), so this awaits first and then asserts on the outcome,
  // rather than calling inside the thunk. The guarantee is the same and the ordering is
  // still strict, which matters for `summary()` below.
  let thrown: unknown = null;
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  check(
    `${name}: the block ran to the end`,
    () => thrown === null,
    () => String((thrown as Error)?.stack ?? thrown),
  );
}

summary();
