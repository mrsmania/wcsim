/**
 * Generate the server-side collectible catalogue from the dataset.
 *
 * The database has to know who is collectible and at what tier, so it can validate
 * sticker earns and trades (docs/cloud-sync-design.md §3, FR-18 to FR-20). That
 * fact lives in TypeScript (`player.elo` against `STICKER_TIERS`, applied by
 * `tierOf`), which SQL cannot read - so it is generated here instead of maintained
 * by hand, and `npm run checks` fails if the committed seed and the dataset ever
 * disagree.
 *
 *   npm run gen:collectibles     # rewrite supabase/seed/collectibles.sql
 *
 * Run it after ANY change to squads.ts ratings or to STICKER_TIERS.
 */
import { writeFileSync } from 'node:fs';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../src/data/squads';
import { tierOf } from '../src/domain/album';
import {
  BANK_CAP,
  INITIAL_SWAPS,
  STICKER_TIERS,
  STICKER_TRADE_COST,
  type StickerTier,
} from '../src/config';
import {
  CATALOGUE_PATH,
  catalogueChecksum,
  catalogueRows,
  type CatalogueRow,
} from './collectibles';

const rows = catalogueRows(ALL_PLAYERS, SQUAD_BY_ID, tierOf);
const checksum = catalogueChecksum(rows);

const byTier = (tier: StickerTier) => rows.filter((r) => r.tier === tier).length;
const summary = (Object.keys(STICKER_TIERS) as StickerTier[])
  .map((t) => `${byTier(t)} ${t}`)
  .join(' / ');

/** Single-quote a SQL string literal (doubling any apostrophe: Songo'o, N'Kono). */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const values = rows
  .map(
    (r: CatalogueRow) =>
      `  (${q(r.playerId)}, ${q(r.tier)}, ${r.elo}, ${q(r.name)}, ${q(r.squadId)}, ` +
      `${q(r.nationCode)}, ${r.year})`,
  )
  .join(',\n');

const sql = `-- GENERATED FILE - do not edit by hand.
-- Source: src/data/squads.ts + STICKER_TIERS, via scripts/gen-collectibles.ts.
-- Regenerate with \`npm run gen:collectibles\` after any rating or tier change;
-- \`npm run checks\` fails while this file and the dataset disagree.
--
-- rows: ${rows.length} (${summary})
-- checksum: ${checksum}
--
-- Idempotent: upserts the catalogue, and marks anything no longer collectible as
-- inactive rather than deleting it, so a sticker somebody already owns keeps its
-- row (album_stickers references this table).

begin;

create temporary table collectibles_seed (
  player_id   text primary key,
  tier        text not null,
  elo         integer not null,
  name        text not null,
  squad_id    text not null,
  nation_code text not null,
  year        integer not null
) on commit drop;

insert into collectibles_seed
  (player_id, tier, elo, name, squad_id, nation_code, year)
values
${values};

insert into collectibles
  (player_id, tier, elo, name, squad_id, nation_code, year, active)
select player_id, tier, elo, name, squad_id, nation_code, year, true
from collectibles_seed
on conflict (player_id) do update set
  tier        = excluded.tier,
  elo         = excluded.elo,
  name        = excluded.name,
  squad_id    = excluded.squad_id,
  nation_code = excluded.nation_code,
  year        = excluded.year,
  active      = true;

-- A rating tweak can drop someone out of the collectible bands. Retire them (no new
-- copies can be earned) without breaking the albums that already hold them.
update collectibles c
   set active = false
 where c.active
   and not exists (select 1 from collectibles_seed s where s.player_id = c.player_id);

-- Economy constants the server validates against, mirrored from src/config.ts so they
-- cannot drift independently.
insert into economy_constants (key, value) values
  ('trade_cost_legendary', ${STICKER_TRADE_COST.legendary}),
  ('trade_cost_iconic', ${STICKER_TRADE_COST.iconic}),
  ('trade_cost_monumental', ${STICKER_TRADE_COST.monumental}),
  ('max_swaps_per_run', ${INITIAL_SWAPS}),
  ('max_collectibles_per_run', ${BANK_CAP})
on conflict (key) do update set value = excluded.value;

commit;
`;

writeFileSync(CATALOGUE_PATH, sql, 'utf8');
console.log(`gen-collectibles: wrote ${CATALOGUE_PATH}`);
console.log(`  rows: ${rows.length} (${summary})`);
console.log(`  checksum: ${checksum}`);
