// Characterization checks for boon validity and the effect ledger.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, runFor, stepRun, withSeed, xiFor } from './harness';
import { SQUADS } from '../../src/data/squads';
import { ELO_MAX } from '../../src/data/types';
import {
  BOONS,
  applyBoon,
  availableBoons,
  lockableBoons,
  offerBoons,
} from '../../src/domain/boons';
import { type RunEffect, xiOf } from '../../src/domain/effects';
import { type RunState } from '../../src/domain/run';

export function effectsChecks(): void {
  // --- Boons: keep a valid 11 (no duplicate person); offers are distinct ------
  // The distinctness claim used to apply each boon ONCE, against one XI and one opponent,
  // unseeded - so a roster boon that duplicates a `personId` only on some draws was caught
  // roughly one run in N (hygiene H95). It is a loop now: 200 applications per card, the XI
  // and the opponent both varying, which is what makes "never duplicates a person" a
  // property rather than a spot check. Seeded, so the sample is the same every run.
  {
    let ok = true;
    let bad = '';
    withSeed(0x2545f491, () => {
      for (let i = 0; i < 200; i++) {
        const xi = xiFor(i * 13);
        const opponentSquadId = SQUADS[(i * 7) % SQUADS.length]!.id;
        for (const b of BOONS) {
          const after = applyBoon(xi, b, { opponentSquadId });
          // Roster boons swap, never grow or shrink the XI.
          if (after.length !== xi.length) {
            ok = false;
            bad ||= `${b.id} returned ${after.length} players (round ${i})`;
          }
          if (new Set(after.map((p) => p.personId)).size !== after.length) {
            ok = false;
            bad ||= `${b.id} duplicated a person (round ${i}, vs ${opponentSquadId})`;
          }
        }
      }
      const pool = availableBoons([]);
      const offer = offerBoons(pool, 3);
      if (offer.length !== 3 || new Set(offer.map((b) => b.id)).size !== 3) {
        ok = false;
        bad ||= 'an offer of three was not three distinct cards';
      }
      // Offers only ever contain boons from the given pool, and n clamps to the pool size.
      if (offer.some((b) => !pool.some((p) => p.id === b.id))) {
        ok = false;
        bad ||= 'an offer held a card from outside the pool';
      }
      if (offerBoons(pool, pool.length + 5).length !== pool.length) {
        ok = false;
        bad ||= 'asking for more cards than the pool holds did not clamp';
      }
    });
    check(
      `boons: every boon keeps 11 distinct players over 200 XIs; offers are distinct + in pool`,
      () => ok,
      () => bad,
    );
  }

  // --- The effect ledger: the XI is roster + effects, and stays that way -----
  // Roadmap item 04, slice 1. The boon-power table above is the real regression test for
  // the refactor (it must not move); these are the properties the ledger itself has to
  // hold, each of which is a bug the old baked-in version could not even express.
  {
    const xi = xiFor();
    const ids = xi.map((p) => p.id);
    let ok = true;

    // Pure: same inputs, same XI, however many times it is asked.
    const eff: RunEffect[] = [
      { id: 'a', source: 'x', label: 'X', target: { ids }, delta: 2, appliedAt: -1 },
      { id: 'b', source: 'y', label: 'Y', target: { ids: [ids[0]] }, delta: -3, appliedAt: 0 },
    ];
    const once = xiOf(xi, eff, 0);
    const twice = xiOf(xi, eff, 0);
    if (JSON.stringify(once) !== JSON.stringify(twice)) ok = false;

    // Per-step clamping, which is the whole reason an inverse transform is unsound. A 98
    // with +2 then -3 is 96 (clamp to 99, then subtract), NOT 97 (sum to 97, then clamp).
    // Asserted as a literal because "simplifying" xiOf to a sum is the tempting mistake.
    const high = [{ ...xi[0], id: 'clamp-me', elo: 98 }];
    const stacked: RunEffect[] = [
      { id: 'up', source: 'x', label: 'X', target: { ids: ['clamp-me'] }, delta: 2, appliedAt: -1 },
      { id: 'dn', source: 'y', label: 'Y', target: { ids: ['clamp-me'] }, delta: -3, appliedAt: -1 },
    ];
    if (xiOf(high, stacked, 0)[0].elo !== 96) ok = false;

    // Expiry: live on its round, gone after it, and the un-bumped value is the base.
    const temp: RunEffect[] = [
      { id: 't', source: 'x', label: 'X', target: { ids: [ids[0]] }, delta: 5, appliedAt: 0, expiresAfter: 1 },
    ];
    if (xiOf(xi, temp, 1)[0].elo !== Math.min(ELO_MAX, xi[0].elo + 5)) ok = false;
    if (xiOf(xi, temp, 2)[0].elo !== xi[0].elo) ok = false;

    // A target id nobody matches (a roster boost swapped that player out) is a no-op, not
    // a throw and not a misapplied bump.
    const orphan: RunEffect[] = [
      { id: 'o', source: 'x', label: 'X', target: { ids: ['nobody'] }, delta: 9, appliedAt: 0 },
    ];
    if (JSON.stringify(xiOf(xi, orphan, 0)) !== JSON.stringify(xi)) ok = false;

    check('effects: xiOf is pure, clamps per step, expires, and tolerates orphan ids', () => ok);
  }

  // --- The xi cache agrees with the ledger at every phase of a real run ------
  // The invariant that catches a future transition which forgets to recompute.
  {
    let ok = true;
    let checked = 0;
    for (let seed = 0; seed < 40; seed++) {
      let run = runFor(seed, { perkLevels: { 'deep-squad': 2, scout: 1 }, unlockedBoons: lockableBoons().map((b) => b.id) });
      const agrees = (r: RunState) =>
        JSON.stringify(r.xi) === JSON.stringify(xiOf(r.roster ?? r.xi, r.effects ?? [], r.koRound));
      if (!agrees(run)) ok = false;
      checked++;
      // Its own loop, because the assertion is per STATE rather than at the end; the step
      // itself is the shared one.
      for (let guard = 0; run.phase !== 'ended' && guard < 12; guard++) {
        const next = stepRun(run);
        if (next === run) break;
        run = next;
        if (!agrees(run)) ok = false;
        checked++;
      }
    }
    check(`effects: run.xi always equals xiOf(roster, effects, koRound) (${checked} states)`, () => ok);
  }

}
