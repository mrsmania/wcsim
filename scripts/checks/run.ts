// Characterization checks for a Cup Run end to end, on a bracket, and what it must not re-roll.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check, playToEnd, runFor, stepRun, xiFor } from './harness';
import { SQUADS } from '../../src/data/squads';
import { bracketChampion, opponentOf, userGameInRound } from '../../src/domain/bracket';
import {
  type RunOutcome,
  type RunState,
  beginRun,
  chooseBoon,
  playGroupStage,
  prepareGroupStage,
  prepareKnockoutRound,
} from '../../src/domain/run';
import {
  GROUP_MATCHDAYS,
  USER_ID,
  bestEleven,
  createGroup,
  groupAsOf,
  pickOpponents,
  recordMatchday,
  simulateMatchday,
  standings,
  userGroupTeam,
} from '../../src/domain/tournament';

export function runChecks(): void {
  // --- Cup Run: always ends with a valid outcome, score, and 11 players -------
  {
    const EXPECT: Record<RunOutcome, number> = {
      group: 10,
      r16: 25,
      qf: 45,
      sf: 70,
      final: 95,
      champion: 140,
    };
    let ok = true;
    for (let i = 0; i < 300 && ok; i++) {
      let r = playGroupStage(runFor(i));
      r = playToEnd(r);
      if (r.phase !== 'ended' || !r.outcome) ok = false;
      else if (r.score !== EXPECT[r.outcome] || r.xi.length !== 11) ok = false;
    }
    check('run: every Cup Run ends with a valid outcome, score, and 11 players', () => ok);
  }

  // --- Cup Run on a bracket (roadmap item 28) ---------------------------------
  // A run begun with `bracket: true` plays its knockouts on a 16-team tree instead of a
  // fresh opponent per round. Three things have to hold, and each of them is the kind
  // that breaks silently: the tree completes, the user's own tie is the one the tree
  // records, and Ascension's draw slope actually reaches the field.
  {
    let completes = true;
    let ownTieMatches = true;
    let oppFromBracket = true;
    for (let i = 0; i < 200 && completes && ownTieMatches && oppFromBracket; i++) {
      const squad = SQUADS[(i * 5) % SQUADS.length];
      let r: RunState = beginRun(bestEleven(squad.players), { ascension: i % 6 });
      r = playGroupStage(r);
      for (let guard = 0; r.phase !== 'ended' && guard < 20; guard++) {
        if (r.phase === 'match') {
          // The opponent handed to the next tie must be the one the tree says it is.
          const g = r.bracket ? userGameInRound(r.bracket, r.koRound) : undefined;
          const treeOpp = g && r.bracket ? opponentOf(r.bracket, g) : undefined;
          if (r.bracket && treeOpp?.id !== r.nextOpponent?.id) oppFromBracket = false;
        }
        const next = stepRun(r);
        if (next === r) break;
        r = next;
      }
      // A group exit never builds one; anything past the group must have a finished tree.
      if (r.outcome === 'group') {
        if (r.bracket) completes = false;
        continue;
      }
      const b = r.bracket;
      if (!b || !bracketChampion(b)) {
        completes = false;
        continue;
      }
      // The user's last tie, as the tree recorded it, must match the run's own history.
      const last = r.history[r.history.length - 1];
      // The narrowing is kept in a variable rather than discarded on assignment, which is
      // what the old `typeof last?.stage === 'number'` test did (hygiene H70).
      const lastKo = last && last.stage !== 'group' ? last : undefined;
      const game = lastKo ? userGameInRound(b, lastKo.stage) : undefined;
      const res = game?.result;
      if (
        !lastKo ||
        !res ||
        res.homeGoals !== lastKo.userGoals ||
        res.awayGoals !== lastKo.oppGoals ||
        (res.winnerId === USER_ID) !== lastKo.won
      ) {
        ownTieMatches = false;
      }
    }
    check('run/bracket: every run past the group crowns exactly one champion', () => completes);
    check("run/bracket: the tree records the user's own tie, not a re-simulation", () => ownTieMatches);
    check('run/bracket: the next opponent is read off the tree', () => oppFromBracket);

    // Ascension's slope has to reach buildBracket, or the high tiers field a Base-strength
    // draw and half of what the tier means does nothing. Measured over the whole field.
    const fieldStrength = (tier: number) => {
      let total = 0;
      let n = 0;
      for (let i = 0; i < 120; i++) {
        let r: RunState = runFor(i * 3, { ascension: tier });
        r = playGroupStage(r);
        const b = r.bracket;
        if (!b) continue;
        for (const [id, t] of Object.entries(b.teams)) {
          if (id === USER_ID) continue;
          total += t.strength.overall;
          n += 1;
        }
      }
      return n ? total / n : 0;
    };
    const base = fieldStrength(0);
    const top = fieldStrength(5);
    check(
      `run/bracket: a higher Ascension fields a stronger draw (Base ${base.toFixed(1)} < V ${top.toFixed(1)})`,
      () => top > base + 0.5,
    );
  }

  // --- groupAsOf: the projection the Cup Run's live table reads ---------------
  {
    let identity = true;
    let monotonic = true;
    for (let i = 0; i < 200 && identity && monotonic; i++) {
      const user = userGroupTeam(xiFor(i), 0, 0);
      let group = createGroup(user, pickOpponents(3, SQUADS));
      for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
        group = recordMatchday(group, simulateMatchday(group, md));
      }
      // At the last matchday the projection is the group itself.
      const full = groupAsOf(group, GROUP_MATCHDAYS);
      if (JSON.stringify(full) !== JSON.stringify(group)) identity = false;
      // Played fixtures only ever accumulate, and points never fall.
      let played = -1;
      let pts = -1;
      for (let md = 0; md <= GROUP_MATCHDAYS; md++) {
        const g = groupAsOf(group, md);
        const p = g.fixtures.filter((f) => f.result).length;
        const userPts = standings(g).find((st) => st.team.isUser)?.points ?? 0;
        if (p < played || userPts < pts) monotonic = false;
        played = p;
        pts = userPts;
      }
    }
    check('groupAsOf: the projection at the final matchday is the group itself', () => identity);
    check('groupAsOf: results and points only ever accumulate', () => monotonic);
  }

  // --- The drawn group survives on the run ------------------------------------
  // A group is drawn once and then replayed, never re-drawn. It has to live on the
  // RunState, because the screen's live reveal is transient (and for a signed-in player
  // never persisted at all): when the draw lived only there, a reload mid-group drew
  // three new opponents over the group already in progress.
  {
    let stable = true;
    let recorded = true;
    let committedDropsIt = true;
    for (let i = 0; i < 200 && stable && recorded && committedDropsIt; i++) {
      const begun = runFor(i);
      const first = prepareGroupStage(begun)!;
      // The run held while the group reveals carries it; the run it was prepared from
      // did not.
      if (!first.current.group || begun.group) recorded = false;
      // Preparing again from that held run replays the same group: same three opponents,
      // same six results. (`next` is re-derived, so its bracket is drawn afresh - it is
      // not committed until the reveal ends.)
      const again = prepareGroupStage(first.current)!;
      if (JSON.stringify(again.group) !== JSON.stringify(first.group)) stable = false;
      if (again.current !== first.current) recorded = false;
      // Advancing past the group leaves it behind: the round record carries the results.
      if (first.next.group !== undefined) committedDropsIt = false;
    }
    check('run/group: the drawn group is recorded on the run it is revealed from', () => recorded);
    check('run/group: preparing again replays the same group rather than drawing one', () => stable);
    check('run/group: the state committed after the group no longer carries it', () => committedDropsIt);
  }

  // --- Nothing a round decides can be re-rolled by preparing it again ---------
  // The anti-reload-cheat invariant: a reload replays the round, it does not roll a new
  // one. Everything random is decided when the round starts and kept on the run - the
  // user's own scoreline, the rest of the tree, the boost offer and the next opponent -
  // so preparing the same run twice must be identical in all of it.
  {
    let groupExitStable = true;
    let koStable = true;
    let koRecorded = true;
    let koDropped = true;
    let tiesChecked = 0;
    for (let i = 0; i < 120; i++) {
      const begun = runFor(i);
      const g1 = prepareGroupStage(begun)!;
      // Surviving the group also decides the field of 16, the first offer and the R16
      // opponent; a second prepare must hand back exactly those.
      const g2 = prepareGroupStage(g1.current)!;
      if (
        JSON.stringify(g2.next.bracket) !== JSON.stringify(g1.next.bracket) ||
        JSON.stringify(g2.next.offer) !== JSON.stringify(g1.next.offer) ||
        JSON.stringify(g2.next.nextOpponent) !== JSON.stringify(g1.next.nextOpponent)
      ) {
        groupExitStable = false;
      }
      if (g1.next.phase !== 'boon' || !g1.next.offer) continue;
      // Into the knockouts, and through as many ties as this run survives.
      let run: RunState = chooseBoon(g1.next, g1.next.offer[0].id).next;
      let guard = 0;
      while (run.phase === 'match' && guard++ < 8) {
        const k1 = prepareKnockoutRound(run)!;
        if (!k1.current.koPending || run.koPending) koRecorded = false;
        const k2 = prepareKnockoutRound(k1.current)!;
        if (
          JSON.stringify(k2.match) !== JSON.stringify(k1.match) ||
          JSON.stringify(k2.next.bracket) !== JSON.stringify(k1.next.bracket) ||
          JSON.stringify(k2.next.offer) !== JSON.stringify(k1.next.offer) ||
          JSON.stringify(k2.next.nextOpponent) !== JSON.stringify(k1.next.nextOpponent) ||
          k2.next.phase !== k1.next.phase
        ) {
          koStable = false;
        }
        if (k2.current !== k1.current || k1.next.koPending !== undefined) koDropped = false;
        tiesChecked++;
        run = k1.next;
        if (run.phase === 'boon' && run.offer) run = chooseBoon(run, run.offer[0].id).next;
      }
    }
    // The bound is a guard against the loop silently exercising nothing, not a measurement:
    // it only has to be clear of any working run. It used to be 200 and sat INSIDE the
    // distribution - 120 runs replay a mean of 233 ties but 1 rep in 80 came in at or below
    // 200, so the suite went red about once in eighty for no reason at all (roadmap 31, the
    // second instance). 120 is one tie per run of the loop, half the mean, and 0 of 80
    // measured reps came near it.
    check(`run/ko: ties replayed (${tiesChecked}) rather than re-rolled`, () => tiesChecked > 120);
    check('run/ko: the decided round is recorded on the run it is revealed from', () => koRecorded);
    check(
      'run/ko: preparing again replays the same tie, tree, offer and next opponent',
      () => koStable,
    );
    check('run/ko: the state committed after the tie no longer carries the decisions', () => koDropped);
    check(
      'run/group: preparing again replays the same tree, first offer and R16 opponent',
      () => groupExitStable,
    );
  }

}
