// Characterization checks for the dataset itself.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { SQUADS, SQUAD_BY_ID } from '../../src/data/squads';
import { validateSquads } from '../../src/domain/validateSquads';

export function datasetChecks(): void {
  // --- Dataset integrity -----------------------------------------------------
  check('dataset: validateSquads reports no problems', () => validateSquads(SQUADS).length === 0);
  check('dataset: SQUAD_BY_ID resolves every squad', () => SQUADS.every((s) => SQUAD_BY_ID[s.id] === s));

}
