import type { Squad } from '../data/types';
import { ELO_MAX, ELO_MIN } from '../data/types';
import { CONFEDERATION } from '../data/confederations';

// ---------------------------------------------------------------------------
// Dataset integrity checks. `validateSquads` is a pure function that walks the
// whole squad dataset and returns a list of human-readable problems (an empty
// array means the dataset is clean). It never throws and never logs; callers
// decide what to do with the findings. Kept framework-free so it can run in the
// app, in a build step, or standalone in node.
// ---------------------------------------------------------------------------

function inRange(n: number): boolean {
  return Number.isFinite(n) && n >= ELO_MIN && n <= ELO_MAX;
}

/** Validate the squad dataset. Returns problem strings; [] means clean. */
export function validateSquads(squads: Squad[]): string[] {
  const problems: string[] = [];

  // Unique Squad.id - duplicates would be silently dropped by Object.fromEntries.
  const seenSquadIds = new Set<string>();
  for (const s of squads) {
    if (seenSquadIds.has(s.id)) {
      problems.push(`Duplicate squad id "${s.id}"`);
    } else {
      seenSquadIds.add(s.id);
    }

    // Squad.code must be a known confederation.
    if (!CONFEDERATION[s.code]) {
      problems.push(`Squad "${s.id}" has code "${s.code}" with no confederation mapping`);
    }
  }

  // Player-level checks across the whole dataset.
  const seenPlayerIds = new Set<string>();
  const nameByPerson = new Map<string, string>();
  for (const s of squads) {
    for (const p of s.players) {
      // Unique Player.id across the dataset.
      if (seenPlayerIds.has(p.id)) {
        problems.push(`Duplicate player id "${p.id}"`);
      } else {
        seenPlayerIds.add(p.id);
      }

      // At least one eligible position.
      if (p.positions.length < 1) {
        problems.push(`Player "${p.id}" (${p.name}) has no positions`);
      }

      // Player.elo within range.
      if (!inRange(p.elo)) {
        problems.push(
          `Player "${p.id}" (${p.name}) rating ${p.elo} is outside ${ELO_MIN}-${ELO_MAX}`,
        );
      }

      // Identical personId must map to an identical name.
      const known = nameByPerson.get(p.personId);
      if (known === undefined) {
        nameByPerson.set(p.personId, p.name);
      } else if (known !== p.name) {
        problems.push(
          `personId "${p.personId}" maps to conflicting names "${known}" and "${p.name}"`,
        );
      }
    }
  }

  return problems;
}
