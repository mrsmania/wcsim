/**
 * Send the collectible list to the account server.
 *
 *   npm run gen:collectibles    # rebuild the list from src/data/squads.ts
 *   npm run push:collectibles   # send it to the server
 *
 * Why this exists: the game decides who is collectible from player ratings, and the
 * server keeps its own copy of that list so it can check nobody awards themselves a
 * sticker they did not earn. The server cannot read the game's files, so after a
 * rating change the list has to be regenerated and then sent. `npm run checks` fails
 * while the generated file and the dataset disagree, so the first step cannot be
 * forgotten silently; this script is the second step.
 *
 * Safe to re-run: the seed upserts, and anyone who has dropped below the collectible
 * threshold is marked retired rather than deleted, so albums that already hold them
 * keep working while no new copies can be earned.
 *
 * Credentials come from dkr/.env (the self-hosted stack's own config, gitignored).
 * Nothing is read from the network and nothing is written anywhere else.
 */
import { readFileSync } from 'node:fs';
// @ts-expect-error - a plain .mjs with no declarations; this file is bundled, not compiled
// by tsc, and the two functions it needs are the ones push-sql.mjs uses too.
import { runSql, serverConfig } from './dkr-env.mjs';
// Imported, not re-typed. This was a `.mjs` holding its own copy of the path with a note
// saying it could not import the TypeScript one - honest, and still a drift risk: the
// generator writes wherever `collectibles.ts` says, and this read wherever the copy said
// (hygiene H100). It goes through the same esbuild pipe as the generator now, so there is
// one definition.
import { CATALOGUE_PATH } from './collectibles';

// Credentials and the send itself are shared with push-sql.mjs, so there is one place
// that knows where the keys live and how to talk to the server.
const { api, key } = serverConfig();

let sql: string;
try {
  sql = readFileSync(CATALOGUE_PATH, 'utf8');
} catch {
  console.error(`push-collectibles: ${CATALOGUE_PATH} not found - run \`npm run gen:collectibles\` first.`);
  process.exit(1);
}

const rows = /^-- rows: (.+)$/m.exec(sql)?.[1] ?? 'unknown';
console.log(`push-collectibles: sending ${rows}`);
console.log(`  to ${api}`);

try {
  await runSql({ api, key }, sql);
} catch (err) {
  console.error(`push-collectibles: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// Read back what the server now holds, so the success message is evidence rather
// than an assumption.
const count = await runSql(
  { api, key },
  'select count(*) filter (where active) as active, count(*) filter (where not active) as retired from collectibles',
).catch(() => null);

if (Array.isArray(count) && count[0]) {
  console.log(`push-collectibles: done - ${count[0].active} collectible, ${count[0].retired} retired`);
} else {
  console.log('push-collectibles: done');
}
