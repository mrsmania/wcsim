// Characterization checks for chemistry.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, xiFor } from './harness';
import { SQUADS } from '../../src/data/squads';
import { primaryPosition } from '../../src/data/types';
import { MAX_BONUS, type Placement, computeChemistry } from '../../src/domain/chemistry';
import { bestEleven, userGroupTeam } from '../../src/domain/tournament';

export function chemistryChecks(): void {
  // --- Chemistry: bonus is the (capped) sum of its parts ----------------------
  {
    let ok = true;
    for (const squad of SQUADS) {
      const placements: Placement[] = bestEleven(squad.players).map((p) => ({
        player: p,
        slotPosition: primaryPosition(p),
      }));
      const rep = computeChemistry(placements);
      const sum = rep.categories.reduce((acc, c) => acc + c.points, 0);
      if (sum !== rep.rawTotal) ok = false;
      if (rep.bonus !== Math.min(MAX_BONUS, rep.rawTotal)) ok = false;
      if (rep.capped !== rep.rawTotal > MAX_BONUS) ok = false;
      if (rep.bonus < 0 || rep.bonus > MAX_BONUS) ok = false;
    }
    const empty = computeChemistry([]);
    if (empty.bonus !== 0 || empty.rawTotal !== 0) ok = false;
    check('chemistry: bonus equals the category sum, capped at MAX_BONUS', () => ok);
  }

  // --- Chemistry bonus reaches the sim (attack + defense, not just overall) ----
  {
    const players = xiFor();
    const base = userGroupTeam(players, 0).strength;
    const boosted = userGroupTeam(players, 5).strength;
    const reaches =
      boosted.attack === base.attack + 5 &&
      boosted.defense === base.defense + 5 &&
      boosted.overall === base.overall + 5;
    check('chemistry: the bonus lifts attack + defense (so it affects the match sim)', () => reaches);
  }

}
