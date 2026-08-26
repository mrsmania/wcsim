// Characterization checks for the PvP room rules (src/domain/pvp.ts), wave 0 of
// docs/pvp-plan.md.
//
// The whole point of that module is that a room is judged by rules a browser cannot
// alter, so these checks are the specification of what "refused" means. Every one asserts
// against a DELIBERATELY BROKEN XI built from a legal one, which is the vacuity guard
// this file needs most: a validator that returned `ok: true` unconditionally would pass
// any check that only ever fed it good input, and that is exactly the shape of the
// vacuous `prime-years` check the hygiene audit found guarding nothing.
//
// Each fault check is therefore a pair: the legal XI passes, and the same XI with one
// thing wrong is refused for that specific reason. Both halves matter - asserting only
// the refusal would pass against a validator that refuses everything.

import { check, withSeed } from './harness';
import { getFormation, type Formation } from '../../src/domain/formations';
import type { Filled } from '../../src/domain/draft';
import { SQUAD_BY_ID, squadsInPool } from '../../src/data/squads';
import type { Player } from '../../src/data/types';
import {
  autoCompleteXi,
  autoPick,
  pvpTeam,
  roomPlayers,
  validateXi,
  xiCost,
  type RoomRules,
} from '../../src/domain/pvp';
import { resolveKoTie } from '../../src/domain/knockout';
import { teamChemistry } from '../../src/domain/chemistry';
import { xiStrength } from '../../src/domain/match';
import { userGroupTeam } from '../../src/domain/tournament';

const BUDGET_RULES: RoomRules = { method: 'budget', budget: 110, years: [] };
const ROLL_RULES: RoomRules = { method: 'roll', budget: 0, years: [] };

function formation(): Formation {
  const f = getFormation('4-3-3', 'bal');
  if (!f) throw new Error('4-3-3 bal is not a formation');
  return f;
}

/** A legal, affordable XI: the cheapest eligible player for each slot, no person twice.
 *  Cheapest rather than best so it is comfortably inside any budget, which keeps the
 *  budget checks about the budget rather than about who happens to be affordable. */
function legalXi(f: Formation, rules: RoomRules): Filled {
  const pool = roomPlayers(rules);
  const used = new Set<string>();
  const filled: Filled = {};
  for (const slot of f.slots) {
    const p = pool
      .filter((c) => c.positions.includes(slot.position) && !used.has(c.personId))
      .sort((a, b) => a.elo - b.elo)[0];
    if (!p) throw new Error(`no candidate for ${slot.position}`);
    used.add(p.personId);
    filled[slot.id] = p;
  }
  return filled;
}

/** The squads a filled XI draws from, which is what a roll room would have had to deal. */
function squadsOf(filled: Filled): string[] {
  return [...new Set(Object.values(filled).map((p) => p!.squadId))];
}

export function pvpChecks(): void {
  const f = formation();
  const legal = legalXi(f, BUDGET_RULES);

  // --- The baseline. Without this every refusal check below is vacuous ------
  {
    const v = validateXi(f, legal, BUDGET_RULES);
    check(
      `pvp: a legal ${f.slots.length}-man XI inside the budget is accepted`,
      () => v.ok && v.faults.length === 0 && v.players.length === f.slots.length,
      () => `faults: ${v.faults.join(', ') || 'none'}; cost ${v.cost}`,
    );
    check(
      'pvp: an accepted XI reports the cost the price curve says it costs',
      () => v.cost === xiCost(Object.values(legal).map((p) => p!)) && v.cost > 0,
      () => `reported ${v.cost}`,
    );
  }

  // --- Each fault, one at a time -------------------------------------------
  {
    const broken: Filled = { ...legal };
    delete broken[f.slots[0]!.id];
    const v = validateXi(f, broken, BUDGET_RULES);
    check(
      'pvp: an XI with an empty slot is refused, and reports no players',
      () => !v.ok && v.faults.includes('empty-slot') && v.players.length === 0,
      () => v.faults.join(', '),
    );
  }

  {
    // A goalkeeper into an outfield slot. Found rather than assumed, so the check fails
    // loudly if the dataset ever stops having one who cannot play there.
    const outfield = f.slots.find((s) => s.position !== 'GK')!;
    const keeper = roomPlayers(BUDGET_RULES).find(
      (p) => p.positions.includes('GK') && !p.positions.includes(outfield.position),
    );
    const broken: Filled = { ...legal, [outfield.id]: keeper! };
    const v = validateXi(f, broken, BUDGET_RULES);
    check(
      `pvp: a player who cannot play ${outfield.position} is refused from that slot`,
      () => !!keeper && !v.ok && v.faults.includes('wrong-position'),
      () => (keeper ? v.faults.join(', ') : 'no keeper ineligible for the slot was found'),
    );
  }

  {
    // The same PERSON twice. Two slots he can fill, so nothing else is broken with it.
    const pool = roomPlayers(BUDGET_RULES);
    const pair = f.slots
      .flatMap((a) => f.slots.map((b) => [a, b] as const))
      .find(([a, b]) => a.id !== b.id && pool.some((p) => p.positions.includes(a.position) && p.positions.includes(b.position)));
    const [slotA, slotB] = pair!;
    const man = pool.find((p) => p.positions.includes(slotA.position) && p.positions.includes(slotB.position))!;
    const broken: Filled = { ...legal, [slotA.id]: man, [slotB.id]: man };
    const v = validateXi(f, broken, BUDGET_RULES);
    check(
      'pvp: the same person in two slots is refused',
      () => !!pair && !v.ok && v.faults.includes('duplicate-person'),
      () => v.faults.join(', '),
    );
  }

  {
    // A room narrowed to one tournament, holding a player from another.
    const years = squadsInPool([]).map((s) => s.year);
    const oneCup = { ...BUDGET_RULES, years: [Math.max(...years)] };
    const narrowed = legalXi(f, oneCup);
    const outsider = roomPlayers(BUDGET_RULES).find(
      (p) => SQUAD_BY_ID[p.squadId]!.year !== oneCup.years[0] && p.positions.includes(f.slots[0]!.position),
    );
    const broken: Filled = { ...narrowed, [f.slots[0]!.id]: outsider! };
    const okV = validateXi(f, narrowed, oneCup);
    const badV = validateXi(f, broken, oneCup);
    check(
      `pvp: a ${oneCup.years[0]}-only room accepts its own XI and refuses a player from another cup`,
      () => okV.ok && !badV.ok && badV.faults.includes('out-of-pool'),
      () => `own XI faults: ${okV.faults.join(', ') || 'none'}; outsider faults: ${badV.faults.join(', ')}`,
    );
  }

  {
    // An id the dataset does not hold, at a rating a browser made up. This is the check
    // that proves nothing trusts the submitted object.
    const invented: Player = {
      id: 'not-a-real-player',
      personId: 'not-a-real-person',
      squadId: SQUAD_BY_ID['bra-1970']!.id,
      number: 99,
      name: 'Invented',
      positions: [f.slots[0]!.position],
      elo: 99,
    };
    const broken: Filled = { ...legal, [f.slots[0]!.id]: invented };
    const v = validateXi(f, broken, BUDGET_RULES);
    check(
      'pvp: a player id the dataset does not hold is refused',
      () => !v.ok && v.faults.includes('unknown-player'),
      () => v.faults.join(', '),
    );
  }

  {
    // A doctored RATING must not change what an XI costs. The submitted object claims
    // 60 (the cheapest the scale allows) for a player who is nothing of the sort.
    const slot = f.slots[0]!;
    const real = legal[slot.id]!;
    const dear = roomPlayers(BUDGET_RULES)
      .filter((p) => p.positions.includes(slot.position) && p.personId !== real.personId)
      .sort((a, b) => b.elo - a.elo)[0]!;
    const doctored: Filled = { ...legal, [slot.id]: { ...dear, elo: 60 } };
    const v = validateXi(f, doctored, BUDGET_RULES);
    const honest = validateXi(f, { ...legal, [slot.id]: dear }, BUDGET_RULES);
    check(
      'pvp: a submitted rating cannot change what a player costs',
      () => v.cost === honest.cost && v.cost > 0,
      () => `doctored ${v.cost} vs honest ${honest.cost} (claimed 60, really ${dear.elo})`,
    );
  }

  {
    // Over budget: the best XI money can buy, against a budget that cannot buy it.
    const pool = roomPlayers(BUDGET_RULES);
    const used = new Set<string>();
    const dear: Filled = {};
    for (const slot of f.slots) {
      const p = pool
        .filter((c) => c.positions.includes(slot.position) && !used.has(c.personId))
        .sort((a, b) => b.elo - a.elo)[0]!;
      used.add(p.personId);
      dear[slot.id] = p;
    }
    const v = validateXi(f, dear, BUDGET_RULES);
    check(
      'pvp: an XI dearer than the budget is refused',
      () => !v.ok && v.faults.includes('over-budget') && v.cost > BUDGET_RULES.budget,
      () => `cost ${v.cost} against ${BUDGET_RULES.budget}`,
    );
    // And the same XI in a room that CAN afford it is fine, so the check is about the
    // budget rather than about the players.
    const rich = validateXi(f, dear, { ...BUDGET_RULES, budget: v.cost });
    check(
      'pvp: that same XI is accepted by a room whose budget covers it exactly',
      () => rich.ok,
      () => rich.faults.join(', '),
    );
  }

  {
    // Was he dealt? A roll room only allows players from squads the referee handed over.
    const dealt = squadsOf(legal);
    const okV = validateXi(f, legal, ROLL_RULES, dealt);
    const short = dealt.slice(0, -1);
    const badV = validateXi(f, legal, ROLL_RULES, short);
    check(
      'pvp: a roll room accepts an XI drawn from the squads it dealt',
      () => okV.ok && okV.cost === 0,
      () => `faults: ${okV.faults.join(', ')}; cost ${okV.cost}`,
    );
    check(
      'pvp: a roll room refuses a player from a squad it never dealt',
      () => dealt.length > 1 && !badV.ok && badV.faults.includes('undealt'),
      () => `dealt ${short.length} of ${dealt.length}; faults: ${badV.faults.join(', ')}`,
    );
  }

  // --- The auto-pick, which is what makes "no forfeits" true ----------------
  {
    // The done-when from the plan: a thousand auto-picks from the tightest corner the
    // rules allow never strand a slot. A budget of exactly one dollar per slot is that
    // corner - every pick must take the cheapest thing available or the last slots
    // cannot be filled at all.
    const tight: RoomRules = { ...BUDGET_RULES, budget: f.slots.length };
    let complete = 0;
    let overspent = 0;
    withSeed(20260826, () => {
      for (let i = 0; i < 1000; i++) {
        const out = autoCompleteXi(f, {}, tight, { remaining: tight.budget });
        const v = validateXi(f, out, tight);
        if (v.ok) complete++;
        if (v.cost > tight.budget) overspent++;
      }
    });
    check(
      `pvp: 1,000 auto-completed XIs at $1 a slot are all legal (${complete}/1000)`,
      () => complete === 1000 && overspent === 0,
      () => `${complete} legal, ${overspent} over budget`,
    );
  }

  {
    // And at a real budget, which is the case that actually happens.
    let complete = 0;
    withSeed(7, () => {
      for (let i = 0; i < 500; i++) {
        const out = autoCompleteXi(f, {}, BUDGET_RULES, { remaining: BUDGET_RULES.budget });
        if (validateXi(f, out, BUDGET_RULES).ok) complete++;
      }
    });
    check(
      `pvp: a player who does nothing at all still ends with a legal XI (${complete}/500)`,
      () => complete === 500,
      () => `${complete} of 500`,
    );
  }

  {
    // The held card is placed rather than a random player (plan P12).
    const slot = f.slots.find((s) => s.position !== 'GK')!;
    const held = roomPlayers(BUDGET_RULES).find(
      (p) => p.positions.includes(slot.position) && p.elo >= 85,
    )!;
    let placedHeld = 0;
    withSeed(3, () => {
      for (let i = 0; i < 200; i++) {
        const made = autoPick(f, {}, BUDGET_RULES, { held, remaining: BUDGET_RULES.budget });
        if (made?.held && made.player.id === held.id) placedHeld++;
      }
    });
    check(
      'pvp: a card held when the clock expires is placed, not a random player',
      () => placedHeld === 200,
      () => `${placedHeld} of 200`,
    );
  }

  {
    // Without a held card it IS random: more than one player must come out over many
    // draws, or "random" is a claim nothing checks.
    const seen = new Set<string>();
    withSeed(11, () => {
      for (let i = 0; i < 200; i++) {
        const made = autoPick(f, {}, BUDGET_RULES, { remaining: BUDGET_RULES.budget });
        if (made) seen.add(made.player.id);
      }
    });
    check(
      `pvp: an unheld auto-pick is random (${seen.size} different players over 200 draws)`,
      () => seen.size > 20,
      () => `only ${seen.size} distinct`,
    );
  }

  {
    // A roll room fills from the LAST squad dealt, and from nothing else.
    const dealt = ['bra-1970', 'ita-1970'];
    const lastSquad = new Set(SQUAD_BY_ID['ita-1970']!.players.map((p) => p.id));
    let fromLast = 0;
    let picks = 0;
    withSeed(5, () => {
      for (let i = 0; i < 200; i++) {
        const made = autoPick(f, {}, ROLL_RULES, { dealt });
        if (!made) continue;
        picks++;
        if (lastSquad.has(made.player.id)) fromLast++;
      }
    });
    check(
      `pvp: a roll room's auto-pick comes from the last squad dealt (${fromLast}/${picks})`,
      () => picks > 0 && fromLast === picks,
      () => `${fromLast} of ${picks} from ita-1970`,
    );
  }

  // --- A match side --------------------------------------------------------
  {
    const players = Object.values(legal).map((p) => p!);
    const a = pvpTeam({ id: 'a', name: 'Ada', code: 'ADA', players });
    const b = pvpTeam({ id: 'b', name: 'Bo', code: 'BOO', players, isUser: true });
    check(
      'pvp: two sides in one tie keep their own identity, which userGroupTeam cannot do',
      () => a.id !== b.id && a.name !== b.name && a.code !== b.code && !a.isUser && b.isUser,
      () => `${a.id}/${a.name}/${a.code} vs ${b.id}/${b.name}/${b.code}`,
    );
    check(
      'pvp: a side carries eleven ranked penalty takers, best first',
      () =>
        a.penTakers.length === players.length &&
        a.penTakers.every((t, i) => i === 0 || t.elo <= a.penTakers[i - 1]!.elo),
      () => a.penTakers.map((t) => t.elo).join(','),
    );
  }

  {
    // Chemistry is off in a room (P25). The proof cannot be "two PvP sides of the same
    // players read the same", which is a comparison of a function with itself - the
    // tautology the hygiene audit warned about when a shared helper's check compares the
    // things now sharing it. So it is asserted from OUTSIDE: a PvP side reads exactly the
    // raw `xiStrength`, while the single-player builder handed the same XI's real
    // chemistry bonus reads higher. The second half is the vacuity guard, and it is the
    // one that matters: without it this would pass just as happily against an XI whose
    // chemistry bonus was zero anyway.
    const squad = SQUAD_BY_ID['bra-1970']!;
    const used = new Set<string>();
    const cohesive: Filled = {};
    // As many from one squad as its positions allow, then anyone at all for the rest, so
    // the XI is always complete and always strongly cohesive.
    for (const pass of [squad.players, roomPlayers(BUDGET_RULES)]) {
      for (const slot of f.slots) {
        if (cohesive[slot.id]) continue;
        const p = pass.find((c) => c.positions.includes(slot.position) && !used.has(c.personId));
        if (p) {
          used.add(p.personId);
          cohesive[slot.id] = p;
        }
      }
    }
    const xi = f.slots.map((s) => cohesive[s.id]!).filter(Boolean);
    const bonus = teamChemistry(f, cohesive).bonus;
    const room = pvpTeam({ id: 'x', name: 'X', code: 'XXX', players: xi });
    const raw = xiStrength(xi);
    const singlePlayer = userGroupTeam(xi, bonus);
    check(
      `pvp: a room side reads the raw XI strength, with no chemistry bonus (this XI earns ${bonus})`,
      () =>
        xi.length === f.slots.length &&
        bonus > 0 &&
        room.strength.attack === raw.attack &&
        room.strength.defense === raw.defense &&
        room.strength.overall === raw.overall,
      () => `${xi.length} placed, bonus ${bonus}, room ${JSON.stringify(room.strength)} vs raw ${JSON.stringify(raw)}`,
    );
    check(
      'pvp: the same XI in the single-player game reads HIGHER, which is what is being switched off',
      () =>
        singlePlayer.strength.attack === room.strength.attack + bonus &&
        singlePlayer.strength.defense === room.strength.defense + bonus,
      () => `single-player ${JSON.stringify(singlePlayer.strength)} vs room ${JSON.stringify(room.strength)}`,
    );
  }

  {
    // A tie between two PvP sides always produces a winner, through `resolveKoTie`
    // directly - the shared resolver the plan wrongly said needed lifting out of the
    // Cup Run. Vacuity guard: assert a shootout actually happened at least once, or a
    // run where every tie was settled in regulation would say nothing about the path
    // that matters.
    const players = Object.values(legal).map((p) => p!);
    const a = pvpTeam({ id: 'a', name: 'Ada', code: 'ADA', players });
    const b = pvpTeam({ id: 'b', name: 'Bo', code: 'BOO', players });
    let decided = 0;
    let shootouts = 0;
    withSeed(99, () => {
      for (let i = 0; i < 2000; i++) {
        const r = resolveKoTie(a, b);
        if (typeof r.homeWon === 'boolean') decided++;
        if (r.decided === 'pens') {
          shootouts++;
          if (!r.pens) decided--;
        }
      }
    });
    check(
      `pvp: 2,000 ties between two rooms sides all crown a winner (${shootouts} on penalties)`,
      () => decided === 2000 && shootouts > 0,
      () => `${decided} decided, ${shootouts} shootouts`,
    );
  }
}
