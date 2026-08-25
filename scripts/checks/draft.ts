// Characterization checks for placing and moving players on the board.
//
// One of the seventeen concern modules `scripts/checks.ts` runs (hygiene H104). It was
// one 3,900-line file whose blocks shared nothing but the assertion helper, and whose
// summary ran last only because it happened to sit at the bottom.

import { check } from './harness';
import { type Player } from '../../src/data/types';
import { type Filled, canMove, moveTargets, placedPlayers, planMove } from '../../src/domain/draft';
import { FORMATIONS_DATA } from '../../src/domain/formations';

export function draftChecks(): void {
  // --- Placed XI promotes the slot role to the primary position ---------------
  {
    // A DM/CB placed at CB should count as a CB (the Rijkaard bug).
    let ok = true;
    const f = Object.values(FORMATIONS_DATA.byKey).find((fm) =>
      fm.slots.some((s) => s.position === 'CB'),
    )!;
    const cb = f.slots.find((s) => s.position === 'CB')!;
    const player: Player = {
      id: 't1', personId: 't1', squadId: 'x', number: 4, name: 'Rijkaard',
      positions: ['DM', 'CB'], elo: 88,
    };
    const placed = placedPlayers(f, { [cb.id]: player });
    // The slot role (CB) is promoted to positions[0]; the other role is kept.
    if (placed.length !== 1 || placed[0].positions[0] !== 'CB') ok = false;
    if (!placed[0].positions.includes('DM')) ok = false;
    // A player already in their slot role is returned untouched (same object).
    const inPos: Player = { ...player, positions: ['CB', 'DM'] };
    if (placedPlayers(f, { [cb.id]: inPos })[0] !== inPos) ok = false;
    check('draft: placedPlayers promotes the slot role to the primary position', () => ok);
  }

  // --- Moving a placed player stays inside his position range ----------------
  {
    let ok = true;
    const f = Object.values(FORMATIONS_DATA.byKey).find(
      (fm) =>
        fm.slots.some((s) => s.position === 'CB') &&
        fm.slots.some((s) => s.position === 'DM') &&
        fm.slots.some((s) => s.position === 'ST'),
    )!;
    const cb = f.slots.find((s) => s.position === 'CB')!;
    const dm = f.slots.find((s) => s.position === 'DM')!;
    const st = f.slots.find((s) => s.position === 'ST')!;
    const utility: Player = {
      id: 'm1', personId: 'm1', squadId: 'x', number: 4, name: 'Utility',
      positions: ['DM', 'CB'], elo: 85,
    };
    const striker: Player = {
      id: 'm2', personId: 'm2', squadId: 'x', number: 9, name: 'Striker',
      positions: ['ST'], elo: 90,
    };

    // Into an empty slot he can play; not into one he cannot.
    const one: Filled = { [cb.id]: utility };
    if (!canMove(f, one, cb.id, dm.id)) ok = false;
    if (canMove(f, one, cb.id, st.id)) ok = false;
    if (canMove(f, one, cb.id, cb.id)) ok = false; // nowhere to go: same slot

    // A trade needs BOTH halves to fit: the striker cannot cover centre-back, so the
    // pair is refused rather than silently producing an invalid line-up.
    const two: Filled = { [cb.id]: utility, [st.id]: striker };
    if (canMove(f, two, cb.id, st.id)) ok = false;
    const swapper: Player = { ...striker, id: 'm3', personId: 'm3', positions: ['ST', 'CB'] };
    const three: Filled = { [cb.id]: utility, [st.id]: swapper };
    if (canMove(f, three, cb.id, st.id)) ok = false; // utility still cannot play ST
    const both: Player = { ...utility, positions: ['DM', 'CB', 'ST'] };
    if (!canMove(f, { [cb.id]: both, [st.id]: swapper }, cb.id, st.id)) ok = false;

    // The trap: placedPlayers hands out copies with the filled slot promoted to the
    // front, so a move keyed off positions[0] would shrink a player's range every time
    // he moved. Moving him back and forth must offer the same targets each time.
    const targetsAt = (slotId: string, filled: Filled) => [...moveTargets(f, filled, slotId)].sort();
    const atCb = targetsAt(cb.id, { [cb.id]: utility });
    const reordered = placedPlayers(f, { [cb.id]: utility })[0]; // positions now ['CB','DM']
    if (targetsAt(cb.id, { [cb.id]: reordered }).join() !== atCb.join()) ok = false;
    // And over a round trip repeated many times (CB -> DM -> CB -> ...): what he is
    // offered at each end must be identical every time he arrives back there.
    let filled: Filled = { [cb.id]: utility };
    const seen = new Map<string, string>();
    for (let i = 0; i < 8; i++) {
      const from = filled[cb.id] ? cb.id : dm.id;
      const to = from === cb.id ? dm.id : cb.id;
      if (!canMove(f, filled, from, to)) { ok = false; break; }
      filled = { [to]: filled[from]! };
      const here = targetsAt(to, filled).join();
      if (!here.length) ok = false; // never stranded
      if (seen.has(to) && seen.get(to) !== here) ok = false; // the range never shrinks
      seen.set(to, here);
    }
    check('draft: a move stays within the position range, however often it is made', () => ok);
  }

  // --- Rotations: a legal cycle no pair can reach --------------------------------
  {
    let ok = true;
    const f = Object.values(FORMATIONS_DATA.byKey).find(
      (fm) =>
        fm.slots.some((s) => s.position === 'LW') &&
        fm.slots.some((s) => s.position === 'RW') &&
        fm.slots.some((s) => s.position === 'ST'),
    )!;
    const lw = f.slots.find((s) => s.position === 'LW')!;
    const st = f.slots.find((s) => s.position === 'ST')!;
    const rw = f.slots.find((s) => s.position === 'RW')!;
    const mk = (id: string, positions: Player['positions']): Player => ({
      id, personId: id, squadId: 'x', number: 9, name: id, positions, elo: 90,
    });

    // The real case from the dataset (Knoflicek / Burruchaga / Donadoni): the front three
    // can rotate one place round, but NO pair of them can trade - each would land in a
    // slot they cannot play. A pairwise-only rule offers nothing here.
    const a = mk('a', ['LW', 'ST']);
    const b = mk('b', ['AM', 'RW', 'ST']);
    const c = mk('c', ['LW', 'RW', 'AM']);
    // Only the front three exist, so the chain cannot escape into an empty midfield slot.
    const trio: Filled = { [lw.id]: a, [st.id]: b, [rw.id]: c };
    const frontOnly = { ...f, slots: [lw, st, rw] };
    if (!canMove(frontOnly, trio, lw.id, st.id)) ok = false; // a -> ST, rotating b and c
    const rotated = planMove(frontOnly, trio, lw.id, st.id)!;
    if (rotated[st.id] !== a || rotated[rw.id] !== b || rotated[lw.id] !== c) ok = false;
    // Every player still plays a position he actually has, and nobody was dropped.
    for (const s of frontOnly.slots) {
      const p = rotated[s.id];
      if (!p || !p.positions.includes(s.position)) ok = false;
    }
    if (new Set(Object.values(rotated).map((p) => p!.id)).size !== 3) ok = false;

    // Only that one direction is legal here: a cannot play RW, so rotating the other way
    // is refused at the first step rather than fudged.
    if (canMove(frontOnly, trio, lw.id, rw.id)) ok = false;
    if (canMove(frontOnly, trio, st.id, lw.id)) ok = false; // b cannot play LW either
    // Tapping the other end of the same cycle reaches the same legal arrangement.
    const fromRw = planMove(frontOnly, trio, rw.id, lw.id);
    if (!fromRw || fromRw[lw.id] !== c || fromRw[st.id] !== a || fromRw[rw.id] !== b) ok = false;

    // A cycle that is genuinely impossible stays impossible: three one-position players
    // have nowhere to go at all.
    const stuck: Filled = {
      [lw.id]: mk('x', ['LW']), [st.id]: mk('y', ['ST']), [rw.id]: mk('z', ['RW']),
    };
    for (const from of frontOnly.slots) {
      if (moveTargets(frontOnly, stuck, from.id).size !== 0) ok = false;
    }
    check('draft: a legal rotation of three is offered where no pair can trade', () => ok);
  }

}
