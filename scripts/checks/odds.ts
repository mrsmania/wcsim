// Characterization checks for the title-odds simulation.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, xiFor } from './harness';
import { simulateTitleOdds } from '../../src/domain/odds';

export function oddsChecks(): void {
  // --- Title odds: a valid probability distribution ---------------------------
  {
    const o = simulateTitleOdds(xiFor(), 300);
    const distSum = Object.values(o.distribution).reduce((a, b) => a + b, 0);
    const ok =
      Math.abs(distSum - 1) < 1e-9 &&
      o.champion >= 0 &&
      o.advanced <= 1 &&
      o.champion <= o.finalist + 1e-9 &&
      o.finalist <= o.advanced + 1e-9;
    check('odds: distribution sums to 1 and champion <= finalist <= advanced', () => ok);
  }

}
