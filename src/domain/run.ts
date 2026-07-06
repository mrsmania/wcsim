import type { Player } from '../data/types';
import { primaryPosition } from '../data/types';
import { FEATURES } from '../config';
import { computeChemistry } from './chemistry';
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
  /** Career perks active for this run (affects offers / start). */
  perks: string[];
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

/** Team chemistry bonus for the current XI (0 when the feature is off). Recomputed
 *  live from the players so it stays correct after a roster boon changes the XI;
 *  every player is treated as in their natural role (a run tracks players, not slots). */
export function chemistryOf(xi: Player[]): number {
  if (!FEATURES.chemistry) return 0;
  return computeChemistry(xi.map((p) => ({ player: p, slotPosition: primaryPosition(p) }))).bonus;
}

/** Boon offer size, widened by the Extra Boon perk. */
const offerSize = (perks: string[]) => (perks.includes('extra-boon') ? 4 : 3);

export function beginRun(xi: Player[], perks: string[] = []): RunState {
  let players = xi;
  const activeBoons: string[] = [];
  const log = ['Cup run started. Win the group, then the knockouts.'];
  // Deep Squad perk: a flat +1 to the drafted XI at kickoff.
  if (perks.includes('deep-squad')) {
    players = players.map((p) => ({ ...p, elo: Math.min(99, p.elo + 1) }));
    log.push('Deep Squad: +1 to your XI.');
  }
  // Scout Network perk: begin with one random boon already applied.
  if (perks.includes('scout')) {
    const boon = offerBoons(1)[0];
    if (boon) {
      players = boon.apply(players, { opponentSquadId: null });
      activeBoons.push(boon.id);
      log.push(`Scout Network boon: ${boon.name} (${boon.description})`);
    }
  }
  return {
    xi: players,
    phase: 'group',
    koRound: 0,
    facedIds: [],
    activeBoons,
    perks,
    offer: null,
    nextOpponent: null,
    score: 0,
    outcome: null,
    log,
  };
}

/** Simulate the group stage; qualify -> draw the R16 opponent + offer a boon. */
export function playGroupStage(run: RunState): RunState {
  if (run.phase !== 'group') return run;
  const user = userGroupTeam(run.xi, chemistryOf(run.xi));
  const opponents = pickOpponents(3);
  let group = createGroup(user, opponents);
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
  // Exclude the group opponents from the knockout draw (no immediate rematch).
  const faced = [...run.facedIds, ...opponents.map((s) => s.id)];
  const opp = drawOpponent(new Set(faced));
  return {
    ...run,
    phase: 'boon',
    offer: offerBoons(offerSize(run.perks)),
    nextOpponent: opp,
    facedIds: [...faced, opp.id],
    score: STAGE_SCORE.group,
    log: [...run.log, line, `Through to the ${KO_ROUNDS[0]}. Pick a boon.`],
  };
}

/** Apply the chosen boon and move to the pending knockout tie. */
export function chooseBoon(run: RunState, boonId: string): RunState {
  if (run.phase !== 'boon') return run;
  const boon = boonById(boonId);
  if (!boon) return run;
  const before = run.xi;
  const xi = boon.apply(before, { opponentSquadId: run.nextOpponent?.id ?? null });
  // If the boon swapped the roster, name the change; otherwise show its description.
  const inP = xi.find((p) => !before.some((b) => b.id === p.id));
  const outP = before.find((p) => !xi.some((a) => a.id === p.id));
  const note = inP && outP ? `${inP.name} in for ${outP.name}` : boon.description;
  return {
    ...run,
    xi,
    activeBoons: [...run.activeBoons, boon.id],
    offer: null,
    phase: 'match',
    log: [...run.log, `Boon: ${boon.name} (${note})`],
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
  const { userWon, hg, ag, decided } = simulateKoTie(userGroupTeam(run.xi, chemistryOf(run.xi)), opp);
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
    offer: offerBoons(offerSize(run.perks)),
    nextOpponent: nextOpp,
    facedIds: [...run.facedIds, nextOpp.id],
    score: STAGE_SCORE[KO_OUTCOME[round]],
    log: [...run.log, `${scoreLine} Into the ${KO_ROUNDS[nextRound]}. Pick a boon.`],
  };
}
