import type { Player } from '../data/types';
import { categoryOf, primaryPosition } from '../data/types';
import { SQUADS } from '../data/squads';
import {
  userGroupTeam,
  createGroup,
  simulateMatchday,
  recordMatchday,
  userAdvanced,
  standings,
  pickOpponents,
  GROUP_MATCHDAYS,
  type GroupTeam,
} from './tournament';
import { simulateMatch, simulateExtraTime, simulateShootout } from './match';
import { drawOpponent, KO_ROUNDS, type KoDecided } from './knockout';
import { offerBoons, boonById, type Boon } from './boons';

// ---------------------------------------------------------------------------
// Cup Run (roguelike) - prototype run state machine. Pure over Math.random via
// the sim. The UI steps it: playGroupStage -> chooseBoon -> playKnockoutRound ...
// ---------------------------------------------------------------------------

export type RunPhase = 'group' | 'boon' | 'match' | 'ended';
export type RunOutcome = 'group' | 'r16' | 'qf' | 'sf' | 'final' | 'champion';

export interface RunState {
  /** The current XI, with any boon rating deltas baked in. */
  xi: Player[];
  phase: RunPhase;
  /** Index into KO_ROUNDS for the next knockout tie (0 = Round of 16). */
  koRound: number;
  /** Squad ids already drawn as opponents (avoid repeats). */
  facedIds: string[];
  activeBoons: string[];
  /** The pending 1-of-3 boon offer, when phase === 'boon'. */
  offer: Boon[] | null;
  /** The drawn opponent for the upcoming knockout tie (shown before it is played). */
  nextOpponent: GroupTeam | null;
  score: number;
  outcome: RunOutcome | null;
  /** Narrative lines, oldest first. */
  log: string[];
}

/** Cumulative score for reaching each stage. */
const STAGE_SCORE: Record<RunOutcome, number> = {
  group: 10,
  r16: 25,
  qf: 45,
  sf: 70,
  final: 95,
  champion: 140,
};
/** The Finish tag for losing in KO round i (0..3). */
const KO_OUTCOME: RunOutcome[] = ['r16', 'qf', 'sf', 'final'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Auto-draft a legal random XI (1 GK, 4 DEF, 3 MID, 3 FWD), one person each.
 *  A stand-in for the real draft so the prototype focuses on the run loop. */
export function autoDraftXi(): Player[] {
  const byCat: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const s of SQUADS) for (const p of s.players) byCat[categoryOf(primaryPosition(p))].push(p);
  const used = new Set<string>();
  const pick = (cat: string, n: number): Player[] => {
    const pool = byCat[cat];
    const out: Player[] = [];
    let guard = 0;
    while (out.length < n && guard++ < 1000) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      if (!p || used.has(p.personId)) continue;
      used.add(p.personId);
      out.push(p);
    }
    return out;
  };
  return [...pick('GK', 1), ...pick('DEF', 4), ...pick('MID', 3), ...pick('FWD', 3)];
}

export function beginRun(xi: Player[]): RunState {
  return {
    xi,
    phase: 'group',
    koRound: 0,
    facedIds: [],
    activeBoons: [],
    offer: null,
    nextOpponent: null,
    score: 0,
    outcome: null,
    log: ['Cup run started. Win the group, then the knockouts.'],
  };
}

/** Simulate the group stage; qualify -> draw the R16 opponent + offer a boon. */
export function playGroupStage(run: RunState): RunState {
  if (run.phase !== 'group') return run;
  const user = userGroupTeam(run.xi);
  let group = createGroup(user, pickOpponents(3));
  for (let md = 1; md <= GROUP_MATCHDAYS; md++) {
    group = recordMatchday(group, simulateMatchday(group, md));
  }
  const table = standings(group);
  const pos = table.findIndex((s) => s.team.isUser) + 1;
  const line = `Group stage: finished ${ordinal(pos)} of ${table.length}.`;
  if (!userAdvanced(group)) {
    return {
      ...run,
      phase: 'ended',
      outcome: 'group',
      score: STAGE_SCORE.group,
      log: [...run.log, line, 'Eliminated in the group stage.'],
    };
  }
  const opp = drawOpponent(new Set(run.facedIds));
  return {
    ...run,
    phase: 'boon',
    offer: offerBoons(3),
    nextOpponent: opp,
    facedIds: [...run.facedIds, opp.id],
    score: STAGE_SCORE.group,
    log: [...run.log, line, `Through to the ${KO_ROUNDS[0]}. Pick a boon.`],
  };
}

/** Apply the chosen boon and move to the pending knockout tie. */
export function chooseBoon(run: RunState, boonId: string): RunState {
  if (run.phase !== 'boon') return run;
  const boon = boonById(boonId);
  if (!boon) return run;
  return {
    ...run,
    xi: boon.apply(run.xi),
    activeBoons: [...run.activeBoons, boon.id],
    offer: null,
    phase: 'match',
    log: [...run.log, `Boon: ${boon.name} (${boon.description})`],
  };
}

/** A single knockout tie: 90', extra time on a draw, then a shootout. */
function simulateKoTie(
  user: GroupTeam,
  opp: GroupTeam,
): { userWon: boolean; hg: number; ag: number; decided: KoDecided } {
  const reg = simulateMatch(user, opp);
  let hg = reg.homeGoals;
  let ag = reg.awayGoals;
  if (hg !== ag) return { userWon: hg > ag, hg, ag, decided: 'reg' };
  const et = simulateExtraTime(user, opp);
  hg += et.homeGoals;
  ag += et.awayGoals;
  if (hg !== ag) return { userWon: hg > ag, hg, ag, decided: 'aet' };
  const so = simulateShootout({ penTakers: user.penTakers }, { penTakers: opp.penTakers });
  return { userWon: so.homeWon, hg, ag, decided: 'pens' };
}

/** Play the pending knockout tie; win -> next round (+ boon) or the trophy. */
export function playKnockoutRound(run: RunState): RunState {
  if (run.phase !== 'match' || !run.nextOpponent) return run;
  const round = run.koRound;
  const roundName = KO_ROUNDS[round];
  const opp = run.nextOpponent;
  const { userWon, hg, ag, decided } = simulateKoTie(userGroupTeam(run.xi), opp);
  const tag = decided === 'pens' ? ' (pens)' : decided === 'aet' ? ' (aet)' : '';
  const scoreLine = `${roundName}: you ${hg}-${ag} ${opp.name}${tag}.`;

  if (!userWon) {
    const outcome = KO_OUTCOME[round];
    return {
      ...run,
      phase: 'ended',
      outcome,
      score: STAGE_SCORE[outcome],
      nextOpponent: null,
      log: [...run.log, `${scoreLine} Knocked out.`],
    };
  }
  if (round >= KO_ROUNDS.length - 1) {
    return {
      ...run,
      phase: 'ended',
      outcome: 'champion',
      score: STAGE_SCORE.champion,
      nextOpponent: null,
      log: [...run.log, `${scoreLine} You are World Cup champions!`],
    };
  }
  const nextRound = round + 1;
  const nextOpp = drawOpponent(new Set(run.facedIds));
  return {
    ...run,
    phase: 'boon',
    koRound: nextRound,
    offer: offerBoons(3),
    nextOpponent: nextOpp,
    facedIds: [...run.facedIds, nextOpp.id],
    score: STAGE_SCORE[KO_OUTCOME[round]],
    log: [...run.log, `${scoreLine} Into the ${KO_ROUNDS[nextRound]}. Pick a boon.`],
  };
}
