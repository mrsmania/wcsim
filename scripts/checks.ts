/**
 * WP0 - domain characterization checks.
 *
 * A lightweight, committed stand-in for a test runner. It exercises the
 * deterministic-except-for-`Math.random` game core many times and asserts
 * invariants that must always hold, whatever the random draw. Run it with
 * `npm run checks` (bundled with esbuild and executed in node); it prints a
 * PASS/FAIL summary and exits non-zero if any invariant is violated.
 *
 * This is a safety net for the risky domain math (match sim, penalty shootout,
 * the knockout bracket, standings, chemistry) - not a UI or behaviour change.
 */
import { SQUADS, SQUAD_BY_ID } from '../src/data/squads';
import { primaryPosition, type Player } from '../src/data/types';
import { validateSquads } from '../src/domain/validateSquads';
import { simulateMatch, simulateShootout, type Side } from '../src/domain/match';
import {
  createGroup,
  pickOpponents,
  recordMatchday,
  simulateMatchday,
  squadGroupTeam,
  standings,
  userGroupTeam,
  GROUP_MATCHDAYS,
  type GroupTeam,
} from '../src/domain/tournament';
import {
  buildBracket,
  bracketChampionId,
  currentGame,
  opponentOf,
  playRound,
  recordRound,
  BRACKET_ROUNDS,
} from '../src/domain/bracket';
import { computeChemistry, MAX_BONUS, type Placement } from '../src/domain/chemistry';

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failures.push(name);
}

const bestEleven = (players: Player[]): Player[] =>
  [...players].sort((a, b) => b.elo - a.elo).slice(0, 11);
const sideOf = (t: GroupTeam): Side => ({ strength: t.strength, scorers: t.scorers });

// --- Dataset integrity -----------------------------------------------------
check('dataset: validateSquads reports no problems', validateSquads(SQUADS).length === 0);
check('dataset: SQUAD_BY_ID resolves every squad', SQUADS.every((s) => SQUAD_BY_ID[s.id] === s));

// --- Penalty shootout: always a decisive, self-consistent result -----------
{
  const a = squadGroupTeam(SQUADS[0]);
  const b = squadGroupTeam(SQUADS[1]);
  let ok = true;
  for (let i = 0; i < 20000 && ok; i++) {
    const r = simulateShootout({ penTakers: a.penTakers }, { penTakers: b.penTakers });
    const homeScored = r.kicks.filter((k) => k.side === 'home' && k.scored).length;
    const awayScored = r.kicks.filter((k) => k.side === 'away' && k.scored).length;
    if (r.home < 0 || r.away < 0) ok = false; // never a negative tally
    if (r.home === r.away) ok = false; // always separates the sides
    if (r.homeWon !== r.home > r.away) ok = false; // winner flag matches the tally
    if (r.home !== homeScored || r.away !== awayScored) ok = false; // kicks reconstruct the score
  }
  check('shootout: decisive, non-negative, and kicks reconstruct the score', ok);
}

// --- Match sim (G1 model): even teams score believable, reconstructable ----
{
  const t = squadGroupTeam(SQUADS[0]);
  const N = 20000;
  let goals = 0;
  let eventsOk = true;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch(sideOf(t), sideOf(t)); // same team both sides = no edge
    goals += r.homeGoals + r.awayGoals;
    const home = r.events.filter((e) => e.side === 'home').length;
    const away = r.events.filter((e) => e.side === 'away').length;
    if (home !== r.homeGoals || away !== r.awayGoals) eventsOk = false;
  }
  const meanPerSide = goals / (2 * N);
  check(
    `match: even-team mean goals/side in [0.8, 2.2] (got ${meanPerSide.toFixed(2)})`,
    meanPerSide > 0.8 && meanPerSide < 2.2,
  );
  check('match: goal events reconstruct the scoreline', eventsOk);
}

// --- Standings: internally consistent totals, correct ordering -------------
{
  let ok = true;
  for (let i = 0; i < 1000 && ok; i++) {
    const user = userGroupTeam(bestEleven(SQUADS[i % SQUADS.length].players));
    let group = createGroup(user, pickOpponents(3));
    for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
      group = recordMatchday(group, simulateMatchday(group, md));
    }
    const table = standings(group);
    if (table.length !== 4) ok = false;
    let gf = 0;
    let ga = 0;
    for (const s of table) {
      if (s.played !== s.won + s.drawn + s.lost) ok = false;
      if (s.points !== s.won * 3 + s.drawn) ok = false;
      if (s.gd !== s.gf - s.ga) ok = false;
      if (s.played !== 3) ok = false; // 4-team round robin
      gf += s.gf;
      ga += s.ga;
    }
    if (gf !== ga) ok = false; // every goal for is a goal against for someone
    for (let k = 1; k < table.length; k++) {
      const x = table[k - 1];
      const y = table[k];
      const ordered =
        x.points > y.points ||
        (x.points === y.points && (x.gd > y.gd || (x.gd === y.gd && x.gf >= y.gf)));
      if (!ordered) ok = false;
    }
  }
  check('standings: totals are consistent and the table is correctly ordered', ok);
}

// --- Bracket: always crowns one champion; co-qualifier only in the final ---
{
  let completesOk = true;
  let metCoQualifierEarly = false;
  for (let i = 0; i < 1000 && completesOk; i++) {
    const user = userGroupTeam(bestEleven(SQUADS[i % SQUADS.length].players));
    const coQualifier = squadGroupTeam(SQUADS[(i + 1) % SQUADS.length]);
    let b = buildBracket(user, coQualifier, [coQualifier.id]);
    let guard = 0;
    while (b.outcome === 'alive' && guard++ < 10) {
      const game = currentGame(b);
      if (game) {
        const opp = opponentOf(b, game);
        if (opp && opp.id === coQualifier.id && b.current !== BRACKET_ROUNDS.length - 1) {
          metCoQualifierEarly = true;
        }
      }
      b = recordRound(b, playRound(b));
    }
    if (bracketChampionId(b) === null) completesOk = false; // a champion is always crowned
    if (b.rounds.length !== BRACKET_ROUNDS.length) completesOk = false; // whole tree filled
  }
  check('bracket: always completes with exactly one champion', completesOk);
  check('bracket: the co-qualifier can only be met in the final', !metCoQualifierEarly);
}

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
  check('chemistry: bonus equals the category sum, capped at MAX_BONUS', ok);
}

// --- Summary ---------------------------------------------------------------
console.log('WP0 characterization checks');
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failures.length}`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll characterization checks passed.');
