/**
 * The checks harness: the assertion helper, seeding, the fixtures, and the summary.
 *
 * Everything here is shared by the seventeen concern modules beside it. It was one
 * 3,900-line file whose blocks shared nothing but `check` and the failure list (hygiene
 * H104), and whose summary ran last only because it sat at the bottom of the file - now it
 * is a function the index calls after the rest, which is a rule rather than a coincidence.
 */
import { SQUADS } from '../../src/data/squads';
import { type Player } from '../../src/data/types';
import { type Boon } from '../../src/domain/boons';
import {
  type GroupRecord,
  type KoRecord,
  type RunState,
  beginRun,
  chooseBoon,
  playGroupStage,
  playKnockoutRound,
  resolveChoice,
} from '../../src/domain/run';
import { bestEleven } from '../../src/domain/tournament';

let passed = 0;
const failures: string[] = [];

/** Assert one invariant.
 *
 *  `ok` is a THUNK, and that is the whole point (hygiene H93). It used to be a
 *  pre-computed boolean, so an exception anywhere inside the expression - an
 *  out-of-range index, one of the file's non-null assertions meeting a null - took the
 *  whole harness down: you got a stack trace instead of a named failure, and every
 *  later block silently never ran. Now the throw is caught, reported against the check
 *  that caused it, and the rest of the suite still runs.
 *
 *  `detail` is a thunk too, evaluated only on failure, for the counterexample: a check
 *  over 3,000 iterations used to report a name and nothing else. */
export function check(name: string, ok: () => boolean, detail?: () => string): void {
  let result: boolean;
  try {
    result = ok();
  } catch (err) {
    failures.push(`${name}: THREW ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (result) {
    passed++;
    return;
  }
  let extra = '';
  if (detail) {
    try {
      extra = detail();
    } catch (err) {
      extra = `(detail threw: ${err instanceof Error ? err.message : String(err)})`;
    }
  }
  failures.push(extra ? `${name} - ${extra}` : name);
}

// --- Round-record fixtures ---------------------------------------------------
// `RoundRecord` is a discriminated union (hygiene H70), so a fixture has to be shaped like
// a record a real run could actually write. These two fill in the fields a given check does
// not care about, which is better than the old partial literals: those described records
// that could never exist, so a check could pass against a shape the game never produces.
export function groupRec(over: Partial<GroupRecord> = {}): GroupRecord {
  return {
    stage: 'group',
    won: true,
    groupPos: 1,
    groupSize: 4,
    groupResults: [],
    ...over,
  };
}
export function koRec(stage: number, over: Partial<Omit<KoRecord, 'stage'>> = {}): KoRecord {
  return {
    stage,
    won: true,
    oppName: 'Opponent',
    oppCode: 'BRA',
    userGoals: 1,
    oppGoals: 0,
    decided: 'reg',
    userRating: 80,
    oppRating: 80,
    events: [],
    ...over,
  };
}

// --- Seeding: a named, bounded construct -------------------------------------
// Several checks are existence or band claims over random trials, and an assertion that
// fails at random is worse than no assertion. The seeding was an inline monkeypatch inside
// one block, so every other random check stayed unseeded by default rather than by
// decision (hygiene H95).
//
// `Math.random` is replaced for the duration of `fn` and restored in a `finally`, so a
// throw inside cannot leak a fake generator into the rest of the suite - which would make
// every later check deterministic and quietly stop testing anything.

/** Run `fn` with `Math.random` replaced by a seeded generator. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const realRandom = Math.random;
  let prng = seed | 0;
  Math.random = () => {
    // mulberry32: small, fast, good enough to stand in for Math.random here.
    prng = (prng + 0x6d2b79f5) | 0;
    let t = prng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}

// --- Run fixtures: one XI, one run, one walk ---------------------------------
// The harness had 42 copies of "the best XI of some squad", 43 `beginRun` calls and
// fifteen near-identical "walk this run to the end" loops, each re-deciding the same
// three-way branch (hygiene H158). Two consequences beyond the size: a new run phase had
// to be taught to fifteen places, and a walk that always picks `offer[0]` can land on a
// card that asks a QUESTION, park on `pendingChoice` and spin to its guard limit without
// ever reaching `ended` - a per-site behaviour nobody chose.

/** The best XI of squad `i`, wrapping. `SQUADS[0]` is the default because most checks only
 *  need a plausible XI, not a particular one. */
export function xiFor(i = 0): Player[] {
  return bestEleven(SQUADS[i % SQUADS.length]!.players);
}

/** A run begun from that XI. */
export function runFor(i = 0, opts?: Parameters<typeof beginRun>[1]): RunState {
  return beginRun(xiFor(i), opts);
}

/** One step of a run, whatever it is waiting on: play the group, answer a card that asked
 *  a question, take a boost, or play the knockout tie.
 *
 *  Returns the SAME object when there is nothing to do, so a caller can stop on identity
 *  rather than on a guard. `pick` selects the boost - an index into the offer, or a
 *  function for the sites that want a particular kind of card. */
export function stepRun(
  run: RunState,
  pick: number | ((offer: readonly Boon[]) => Boon | undefined) = 0,
): RunState {
  if (run.phase === 'group') return playGroupStage(run);
  if (run.phase === 'match') return playKnockoutRound(run);
  if (run.phase === 'boon') {
    // A parked question first: the phase stays `boon` until it is answered, so picking
    // another card here would just re-park the same one.
    if (run.pendingChoice) return resolveChoice(run, run.xi[0]!.id).next;
    const offer = run.offer ?? [];
    if (!offer.length) return run;
    const b = typeof pick === 'number' ? offer[pick] ?? offer[0]! : pick(offer);
    return b ? chooseBoon(run, b.id).next : run;
  }
  return run;
}

/** Walk a run to its end. `limit` stays per-site: a few check NAMES print how many states
 *  they visited, so a different bound would change the harness's own output. */
export function playToEnd(
  run: RunState,
  pick: number | ((offer: readonly Boon[]) => Boon | undefined) = 0,
  limit = 20,
): RunState {
  let r = run;
  for (let guard = 0; r.phase !== 'ended' && guard < limit; guard++) {
    const next = stepRun(r, pick);
    if (next === r) break;
    r = next;
  }
  return r;
}

/** The run at each of its boost stops - the offers a real career is actually shown, with
 *  the state behind them, so a caller can read `activeBoons` or re-roll the offer. */
export function boonStops(squadIndex = 0, opts?: Parameters<typeof beginRun>[1], limit = 12): RunState[] {
  const stops: RunState[] = [];
  let r = playGroupStage(runFor(squadIndex, opts));
  for (let guard = 0; r.phase !== 'ended' && guard < limit; guard++) {
    if (r.phase === 'boon' && r.offer?.length) stops.push(r);
    const next = stepRun(r);
    if (next === r) break;
    r = next;
  }
  return stops;
}


/** Print the tally and exit non-zero if anything failed. The index calls this LAST. */
export function summary(): void {
  console.log('WP0 characterization checks');
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nAll characterization checks passed.');
}
