// Characterization checks for chemistry.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, withSeed, xiFor } from './harness';
import { SQUADS } from '../../src/data/squads';
import { primaryPosition, type Player } from '../../src/data/types';
import { MAX_BONUS, type Placement, computeChemistry, teamChemistry } from '../../src/domain/chemistry';
import { bestEleven, userGroupTeam } from '../../src/domain/tournament';
import { FORMATIONS_DATA } from '../../src/domain/formations';
import { autoFillBudget } from '../../src/domain/budget';
import { placedPlayers } from '../../src/domain/draft';
import { chemistryOf } from '../../src/domain/run';
import { BUDGET_DRAFT } from '../../src/config';

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

  // --- The build page and the run score the same XI identically (roadmap 38) --------
  //
  // Two routes to one number, and they were a point apart. `teamChemistry` reads the
  // formation and the untouched players, so it compares a man against the slot he is
  // standing in. `chemistryOf` gets a run's XI, where `placedPlayers` has already promoted
  // that slot onto him - so the natural role has to be fetched back out of the dataset. It
  // was not, which made "In position" 11 out of 11 for every XI that ever started a run and
  // left the number on the build page a promise the simulator did not keep.
  //
  // This is not a comparison between two things sharing one helper (the trap CLAUDE.md
  // names for a DRY check): the two paths build their placements from different inputs, and
  // only the second one has to go back through `basePlayer`.
  //
  // Two guards keep it from going vacuous, and both were mutation-tested. The same loop
  // reproduces the OLD reading and asserts it WOULD have disagreed here, and it asserts the
  // sample actually fails "In position" - so an XI set that happened to field everyone in
  // their natural role breaks the guard instead of quietly passing the check. Setting
  // FIT_MIN to 0 (which makes the category free again by another route) turns both red.
  {
    const forms = Object.values(FORMATIONS_DATA.byKey);
    let sampled = 0;
    let agree = 0;
    let preFixDisagreed = 0;
    let fitFailed = 0;
    let firstGap = '';
    withSeed(0x0f171b26, () => {
      for (let i = 0; i < 240; i++) {
        const f = forms[i % forms.length]!;
        const { filled } = autoFillBudget(f.slots, {}, BUDGET_DRAFT);
        const xi = placedPlayers(f, filled);
        if (xi.length !== f.slots.length) continue;
        sampled++;

        const build = teamChemistry(f, filled);
        const run = chemistryOf(xi);
        if (build.bonus === run) agree++;
        else if (!firstGap) firstGap = `${f.name} ${f.style}: build ${build.bonus}, run ${run}`;

        // The reading this check exists to keep out: both sides off the run's own copy.
        const preFix = computeChemistry(
          xi.map((p: Player) => ({ player: p, slotPosition: primaryPosition(p) })),
        ).bonus;
        if (preFix !== build.bonus) preFixDisagreed++;

        // The property the bug destroyed. Read off the build page's OWN report rather than
        // re-deriving the rule here: the harness reimplementing the fixed reading and then
        // comparing it against the fixed reading would prove nothing.
        if (!build.categories.some((c) => c.key === 'fit')) fitFailed++;
      }
    });
    check(
      'chemistry: the build page and a run score the same XI identically',
      () => sampled >= 200 && agree === sampled,
      () => `${agree}/${sampled} agreed; first gap ${firstGap || '(none)'}`,
    );
    check(
      'chemistry: that agreement is not vacuous - the pre-fix reading disagreed on this sample',
      () => sampled >= 200 && preFixDisagreed > sampled / 2,
      () => `${preFixDisagreed}/${sampled} would have disagreed`,
    );
    check(
      'chemistry: "In position" is a category this sample can FAIL (a run got it free)',
      () => sampled >= 200 && fitFailed > sampled / 2,
      () => `${fitFailed}/${sampled} failed the category`,
    );
  }

}
