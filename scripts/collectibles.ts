/**
 * Shared between the generator (`gen-collectibles.ts`) and the drift guard in
 * `checks.ts`, so both derive the catalogue and its checksum the same way. Node-only
 * (uses `node:crypto`); nothing in `src/` imports this.
 */
import { createHash } from 'node:crypto';
import type { Player, Squad } from '../src/data/types';
import type { StickerTier } from '../src/config';

/** Written by the generator, read by the guard. Relative to the repo root, which is
 *  the cwd for both `npm run gen:collectibles` and `npm run checks`. */
export const CATALOGUE_PATH = 'supabase/seed/collectibles.sql';

export interface CatalogueRow {
  playerId: string;
  tier: StickerTier;
  elo: number;
  name: string;
  squadId: string;
  nationCode: string;
  year: number;
}

/**
 * Every collectible in the dataset, sorted so the output is byte-stable (tier is not
 * a sort key: player id alone is unique and total).
 */
export function catalogueRows(
  allPlayers: Player[],
  squadById: Record<string, Squad | undefined>,
  tierOf: (p: Player) => StickerTier | null,
): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  for (const p of allPlayers) {
    const tier = tierOf(p);
    if (!tier) continue;
    const squad = squadById[p.squadId];
    if (!squad) continue;
    rows.push({
      playerId: p.id,
      tier,
      elo: p.elo,
      name: p.name,
      squadId: p.squadId,
      nationCode: squad.code,
      year: squad.year,
    });
  }
  rows.sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  return rows;
}

/** Checksum of the facts the server validates against (who, which tier, what rating).
 *  Deliberately excludes the display fields, so fixing a spelling does not fail the
 *  guard - it just means the seed is regenerated at some point. */
export function catalogueChecksum(rows: CatalogueRow[]): string {
  const canonical = rows.map((r) => `${r.playerId}|${r.tier}|${r.elo}`).join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** The checksum recorded in a generated seed file, or null if absent/unreadable. */
export function checksumInFile(sql: string): string | null {
  return /^-- checksum: ([0-9a-f]{16})$/m.exec(sql)?.[1] ?? null;
}
