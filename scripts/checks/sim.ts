// Characterization checks for the match sim, the shootout, standings and the bracket.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { FIXTURE, check, xiFor } from './harness';
import { SQUADS } from '../../src/data/squads';
import {
  bracketChampionId,
  buildBracket,
  currentGame,
  opponentOf,
  playRound,
  recordRound,
} from '../../src/domain/bracket';
import { KO_ROUNDS } from '../../src/domain/knockout';
import { type ShootoutResult, simulateMatch, simulateShootout } from '../../src/domain/match';
import {
  GROUP_MATCHDAYS,
  createGroup,
  pickOpponents,
  recordMatchday,
  simulateMatchday,
  squadGroupTeam,
  standings,
  userGroupTeam,
} from '../../src/domain/tournament';

export function simChecks(): void {
  // --- Penalty shootout: always a decisive, self-consistent result -----------
  {
    const a = squadGroupTeam(FIXTURE.home);
    const b = squadGroupTeam(FIXTURE.away);
    let ok = true;
    // The shootout that broke it, kept for the failure message: over 20,000 trials the name
    // of the check alone says nothing about which of the four properties went, or how
    // (hygiene H93's second half).
    let bad: { i: number; why: string; r: ShootoutResult } | null = null;
    for (let i = 0; i < 20000 && ok; i++) {
      const r = simulateShootout({ penTakers: a.penTakers }, { penTakers: b.penTakers });
      const homeScored = r.kicks.filter((k) => k.side === 'home' && k.scored).length;
      const awayScored = r.kicks.filter((k) => k.side === 'away' && k.scored).length;
      const why =
        r.home < 0 || r.away < 0
          ? 'negative tally'
          : r.home === r.away
            ? 'did not separate the sides'
            : r.homeWon !== r.home > r.away
              ? 'winner flag disagrees with the tally'
              : r.home !== homeScored || r.away !== awayScored
                ? 'kicks do not reconstruct the score'
                : '';
      if (why) {
        ok = false;
        bad = { i, why, r };
      }
    }
    check(
      'shootout: decisive, non-negative, and kicks reconstruct the score',
      () => ok,
      () =>
        bad
          ? `trial ${bad.i}: ${bad.why} (${bad.r.home}-${bad.r.away}, homeWon ${bad.r.homeWon}, ${bad.r.kicks.length} kicks)`
          : '',
    );
  }

  // --- Match sim (G1 model): even teams score believable, reconstructable ----
  {
    const t = squadGroupTeam(FIXTURE.home);
    const N = 20000;
    let goals = 0;
    let eventsOk = true;
    for (let i = 0; i < N; i++) {
      const r = simulateMatch(t, t); // same team both sides = no edge (GroupTeam IS a Side)
      goals += r.homeGoals + r.awayGoals;
      const home = r.events.filter((e) => e.side === 'home').length;
      const away = r.events.filter((e) => e.side === 'away').length;
      if (home !== r.homeGoals || away !== r.awayGoals) eventsOk = false;
    }
    const meanPerSide = goals / (2 * N);
    check(
      `match: even-team mean goals/side in [0.8, 2.2] (got ${meanPerSide.toFixed(2)})`,
      () => meanPerSide > 0.8 && meanPerSide < 2.2,
    );
    check('match: goal events reconstruct the scoreline', () => eventsOk);
  }

  // --- Standings: internally consistent totals, correct ordering -------------
  {
    let ok = true;
    for (let i = 0; i < 1000 && ok; i++) {
      const user = userGroupTeam(xiFor(i));
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
    check('standings: totals are consistent and the table is correctly ordered', () => ok);
  }

  // --- Bracket: always crowns one champion; co-qualifier only in the final ---
  {
    let completesOk = true;
    let metCoQualifierEarly = false;
    for (let i = 0; i < 1000 && completesOk; i++) {
      const user = userGroupTeam(xiFor(i));
      const coQualifier = squadGroupTeam(SQUADS[(i + 1) % SQUADS.length]);
      let b = buildBracket(user, coQualifier, [coQualifier.id]);
      let guard = 0;
      while (b.outcome === 'alive' && guard++ < 10) {
        const game = currentGame(b);
        if (game) {
          const opp = opponentOf(b, game);
          if (opp && opp.id === coQualifier.id && b.current !== KO_ROUNDS.length - 1) {
            metCoQualifierEarly = true;
          }
        }
        b = recordRound(b, playRound(b));
      }
      if (bracketChampionId(b) === null) completesOk = false; // a champion is always crowned
      if (b.rounds.length !== KO_ROUNDS.length) completesOk = false; // whole tree filled
    }
    check('bracket: always completes with exactly one champion', () => completesOk);
    check('bracket: the co-qualifier can only be met in the final', () => !metCoQualifierEarly);
  }

}
