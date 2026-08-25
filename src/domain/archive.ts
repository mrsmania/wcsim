// Queries over the whole dataset, for the read-only squad archive: which World Cups exist,
// a year's field ranked, every nation with its participations, a cross-tournament player
// search, and a nation's all-time best players.
//
// All five lived in `SquadBrowser.tsx` (hygiene H143). None of them is presentation; the
// component keeps the routing, the copy and the row cap.
//
// **No pool parameter, deliberately.** This view reads the ENTIRE dataset on purpose - it
// is a reference archive, not a shop - and threading the squad-pool setting through here
// would silently start hiding tournaments from it, which is the same class of bug as
// storing "every tournament" as a list of the years that happened to exist.

import type { Player, Squad } from '../data/types';
import { SQUADS, WORLD_CUP_YEARS } from '../data/squads';
import { normalizeSearch } from '../data/format';
import { squadOverall } from './tournament';

/** The World Cups in the dataset, newest first - the order the archive lists them in. */
export const ARCHIVE_YEARS: number[] = [...WORLD_CUP_YEARS].reverse();

/** A nation and every World Cup it appears in within this dataset. */
export interface TeamGroup {
  code: string;
  nation: string;
  /** The nation's squads, newest tournament first. */
  squads: Squad[];
}

/** One human's whole record for a nation: their best rating and every appearance. */
export interface Legend {
  personId: string;
  name: string;
  best: number;
  apps: { year: number; elo: number }[];
}

/** How many legends a nation's page lists. */
export const LEGENDS_SHOWN = 10;

/** The nations in one World Cup, strongest first then alphabetical.
 *
 *  Ranked by the same COMPUTED rating the game uses (the best XI's overall), not by a
 *  stored field - there is no squad-level rating in the dataset, so every number shown
 *  anywhere tracks the player ratings. */
export function fieldOf(year: number): Squad[] {
  return SQUADS.filter((s) => s.year === year).sort(
    (a, b) => squadOverall(b) - squadOverall(a) || a.nation.localeCompare(b.nation),
  );
}

/** Every nation with the World Cups it appears in, most participations first then
 *  alphabetical; each nation's own squads newest-first.
 *
 *  "Participations" means occurrences in THIS dataset, not real-world history. */
export function teamGroups(): TeamGroup[] {
  const byCode = new Map<string, TeamGroup>();
  for (const s of SQUADS) {
    const e = byCode.get(s.code) ?? { code: s.code, nation: s.nation, squads: [] };
    e.squads.push(s);
    byCode.set(s.code, e);
  }
  const arr = [...byCode.values()];
  for (const t of arr) t.squads.sort((a, b) => b.year - a.year);
  arr.sort((a, b) => b.squads.length - a.squads.length || a.nation.localeCompare(b.nation));
  return arr;
}

/** Cross-tournament player search, strongest first.
 *
 *  Matches a player's own name, or ANY player of a squad whose nation, three-letter code
 *  or year matches - so "Brazil" returns a whole squad and "muller" returns one man.
 *  Diacritic-insensitive on the two name-ish predicates via `normalizeSearch`; the YEAR
 *  predicate deliberately tests the RAW query, because normalising digits does nothing and
 *  the raw string is what a year looks like.
 *
 *  Returns EVERY hit, uncapped. The archive shows the first 80 and prints the full count
 *  beside them ("showing top 80 of 214"), so capping in here would change what the screen
 *  says rather than just what it draws. */
export function searchArchive(rawQuery: string): { player: Player; squad: Squad }[] {
  const q = rawQuery.trim();
  const nq = normalizeSearch(q);
  const hits: { player: Player; squad: Squad }[] = [];
  for (const squad of SQUADS) {
    const teamHit =
      normalizeSearch(squad.nation).includes(nq) ||
      squad.code.toLowerCase().includes(nq) ||
      String(squad.year).includes(q);
    for (const player of squad.players) {
      if (teamHit || normalizeSearch(player.name).includes(nq)) hits.push({ player, squad });
    }
  }
  return hits.sort((a, b) => b.player.elo - a.player.elo);
}

/** A nation's ten best players, ranked by their single best rating across appearances -
 *  not by an average, so one great tournament counts.
 *
 *  Grouped by `personId`, the identity link that makes the same human one entry across
 *  tournaments. Almost nothing else in the codebase reads it, which is part of why this
 *  was worth having in the domain rather than in a component. */
export function topLegends(team: TeamGroup, limit = LEGENDS_SHOWN): Legend[] {
  const byPerson = new Map<string, Legend>();
  for (const sq of team.squads) {
    for (const p of sq.players) {
      const e =
        byPerson.get(p.personId) ??
        ({ personId: p.personId, name: p.name, best: 0, apps: [] } as Legend);
      e.apps.push({ year: sq.year, elo: p.elo });
      e.best = Math.max(e.best, p.elo);
      byPerson.set(p.personId, e);
    }
  }
  const arr = [...byPerson.values()];
  for (const l of arr) l.apps.sort((a, b) => b.year - a.year);
  arr.sort(
    (a, b) => b.best - a.best || b.apps.length - a.apps.length || a.name.localeCompare(b.name),
  );
  return arr.slice(0, limit);
}
