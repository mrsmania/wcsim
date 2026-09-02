// Characterization checks for who scores a goal.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { FIXTURE, check, withSeed } from './harness';
import { ALL_PLAYERS } from '../../src/data/squads';
import {
  ELO_MAX,
  ELO_MIN,
  type Player,
  type Position,
  primaryPosition,
} from '../../src/data/types';
import { type Filled, placedPlayers } from '../../src/domain/draft';
import { getFormation } from '../../src/domain/formations';
import {
  POSITION_WEIGHT,
  pickScorer,
  scorerPool,
  scorerWeight,
  simulateMatch,
} from '../../src/domain/match';
import { squadGroupTeam, userGroupTeam } from '../../src/domain/tournament';

export function scorersChecks(): void {
  // --- Who scores: position weighting + the rating tilt ----------------------
  // `scorerPool` decides which player is CREDITED with a goal, never how many are
  // scored (that is expectedGoals from the two strengths), so nothing here can move a
  // scoreline. What it can do is drift: the ordering below is the whole design, and a
  // stray edit to one number would silently make a holding midfielder a striker.
  {
    const anyPlayer = ALL_PLAYERS[0];
    const at = (pos: Position, elo: number): Player => ({ ...anyPlayer, positions: [pos], elo });

    // 1. The ordering, at one fixed rating so only position is in play.
    const ORDER: Position[] = ['ST', 'LW', 'AM', 'RM', 'CM', 'DM', 'LB', 'CB'];
    const weights = ORDER.map((pos) => scorerWeight(at(pos, 80)));
    const strictlyDescending = weights.every((w, i) => i === 0 || weights[i - 1] > w);
    check(
      'scorers: ST > winger > AM > wide mid > CM > DM > full-back > CB at equal rating',
      () => strictlyDescending &&
        scorerWeight(at('LW', 80)) === scorerWeight(at('RW', 80)) &&
        scorerWeight(at('LB', 80)) === scorerWeight(at('RB', 80)),
    );
    check(
      'scorers: a keeper cannot score from open play, at any rating',
      () => POSITION_WEIGHT.GK === 0 &&
        scorerWeight(at('GK', 99)) === 0 &&
        scorerWeight(at('GK', 60)) === 0,
    );

    // 2. The rating tilt: monotone within a position, and bounded so that no rating gap
    //    the dataset allows can turn a defender into an attacker. ADJACENT lines are a
    //    different matter and are deliberately crossable - a 99 full-back (1.48) does
    //    outscore a 60 central midfielder (1.40), which is the tilt doing its job. What
    //    must hold is the attack/defence divide: the worst attacker still beats the best
    //    defender, so the shape of the XI decides the shape of the scoring.
    const tilt = [ELO_MIN, 75, 85, ELO_MAX].map((elo) => scorerWeight(at('ST', elo)));
    const ATTACKING: Position[] = ['ST', 'LW', 'RW', 'AM'];
    const DEFENDING: Position[] = ['CB', 'LB', 'RB'];
    const worstAttacker = Math.min(...ATTACKING.map((pos) => scorerWeight(at(pos, ELO_MIN))));
    const bestDefender = Math.max(...DEFENDING.map((pos) => scorerWeight(at(pos, ELO_MAX))));
    check(
      'scorers: rating tilts within a line but never turns a defender into an attacker',
      () => tilt.every((w, i) => i === 0 || w > tilt[i - 1]) && worstAttacker > bestDefender,
    );

    // 3. An XI with no eligible scorer at all (eleven keepers) still credits someone,
    //    rather than every goal reading 'Unknown'.
    const keepers = Array.from({ length: 11 }, (_, i) => at('GK', 70 + i));
    const gkPool = scorerPool(keepers);
    check(
      'scorers: an XI that cannot score falls back to everyone equally likely',
      () => gkPool.length === 11 &&
        gkPool.every((s) => s.weight === 1) &&
        !!pickScorer(gkPool) &&
        pickScorer([]) === undefined,
    );

    // 4. Legacy tolerance. A GroupTeam is persisted (the game state, the active run and
    //    a run's drawn nextOpponent), so a match in flight when the weights shipped hands
    //    back the old `string[]` pool - a name repeated once per point of weight. Reading
    //    each entry as 1 has to reproduce that old distribution exactly.
    const legacy = ['Striker', 'Striker', 'Striker', 'Striker', 'Defender'];
    let striker = 0;
    for (let i = 0; i < 40000; i++) if (pickScorer(legacy) === 'Striker') striker++;
    const ratio = striker / (40000 - striker);
    check(
      'scorers: a run persisted before the weights keeps its old string pool working',
      () => ratio > 3.4 && ratio < 4.6,
    );

    // 5. End to end through the real sim: the per-player ordering holds, and no keeper
    //    ever appears in a goal feed.
    //
    // SEEDED, and it has to be (hygiene H95, the rule the boon-power table follows). The
    // ordering below is a claim about five measured RATES over 6,000 random matches, and
    // the last pair of it is tight: the fixture XI takes the highest-rated eligible player
    // per slot, which puts a 91 at right-back against a 97 and a 96 in the middle, so the
    // 25% the weights give a full-back over a centre-back (1.0 against 0.8) comes back as
    // 15% once the rating tilt has closed most of it. That is about 2.8 standard deviations
    // of the difference, so the assertion failed roughly one run in a few hundred on
    // nothing but the draw - and an assertion that fails at random is worse than no
    // assertion, which is exactly why the boon table is seeded. Fixed inputs, one
    // reproducible answer; the generator is restored immediately after, in a finally.
    //
    // The seed is not lucky: it reads a 14.9% gap where the weights and the tilt predict
    // 15.4%, so what the block measures is the middle of the distribution rather than a
    // corner of it that happens to pass. Every guard is still live - the sample has to
    // reach 5,000 goals, every scorer has to resolve to a player in the XI, and no keeper
    // may appear at all - because a seeded sample that measured nothing would pass just as
    // quietly as a random one.
    withSeed(9, () => {
    const f = getFormation('4-2-3-1', 'off')!;
    const used = new Set<string>();
    const filled: Filled = {};
    for (const slot of f.slots) {
      const p = ALL_PLAYERS.filter(
        (x) => !used.has(x.personId) && x.positions.includes(slot.position),
      ).sort((a, b) => b.elo - a.elo)[0];
      if (p) {
        used.add(p.personId);
        filled[slot.id] = p;
      }
    }
    const xi = placedPlayers(f, filled);
    const byName = new Map(xi.map((p) => [p.name, p]));
    const user = userGroupTeam(xi);
    const opp = squadGroupTeam(FIXTURE.away);
    const perPos = new Map<Position, number>();
    const countPos = new Map<Position, number>();
    for (const p of xi) countPos.set(primaryPosition(p), (countPos.get(primaryPosition(p)) ?? 0) + 1);
    let goals = 0;
    let unknown = 0;
    for (let i = 0; i < 6000; i++) {
      for (const e of simulateMatch(user, opp).events) {
        if (e.side !== 'home') continue;
        goals++;
        const p = byName.get(e.scorer);
        if (!p) {
          unknown++;
          continue;
        }
        const pos = primaryPosition(p);
        perPos.set(pos, (perPos.get(pos) ?? 0) + 1);
      }
    }
    const rate = (pos: Position) => (perPos.get(pos) ?? 0) / (countPos.get(pos) ?? 1) / goals;
    const ORDERED: Position[] = ['ST', 'AM', 'CM', 'RB', 'CB'];
    check(
      'scorers: over 6000 matches the measured order is ST > AM > CM > full-back > CB',
      () => goals > 5000 &&
        unknown === 0 &&
        !perPos.has('GK') &&
        rate('ST') > rate('AM') &&
        rate('AM') > rate('CM') &&
        rate('CM') > rate('RB') &&
        rate('RB') > rate('CB'),
      // Which pair flipped, and on what sample - a weight edit is what this exists to
      // catch, and the name alone does not say which line moved (hygiene H93).
      () => `${goals} goals, ${unknown} unresolved, GK ${perPos.has('GK') ? 'scored' : 'none'}; ` +
        ORDERED.map((pos) => `${pos} ${(rate(pos) * 1000).toFixed(2)}`).join(' > '),
    );
    });
  }

}
