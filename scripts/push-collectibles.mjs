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

/** Mirrors CATALOGUE_PATH in scripts/collectibles.ts (plain .mjs, so it cannot import
 *  the TypeScript one; the generator writes here, this reads there). */
const CATALOGUE_PATH = 'supabase/seed/collectibles.sql';
const ENV_PATH = 'dkr/.env';

function env(key) {
  let file;
  try {
    file = readFileSync(ENV_PATH, 'utf8');
  } catch {
    console.error(`push-collectibles: ${ENV_PATH} not found.`);
    console.error('  This needs the self-hosted stack config (see docs/nas-setup.md).');
    process.exit(1);
  }
  const hit = new RegExp(`^${key}=(.*)$`, 'm').exec(file);
  if (!hit?.[1]) {
    console.error(`push-collectibles: ${key} is not set in ${ENV_PATH}`);
    process.exit(1);
  }
  return hit[1].trim();
}

const api = env('SUPABASE_PUBLIC_URL').replace(/\/$/, '');
const key = env('SERVICE_ROLE_KEY');

let sql;
try {
  sql = readFileSync(CATALOGUE_PATH, 'utf8');
} catch {
  console.error(`push-collectibles: ${CATALOGUE_PATH} not found - run \`npm run gen:collectibles\` first.`);
  process.exit(1);
}

const rows = /^-- rows: (.+)$/m.exec(sql)?.[1] ?? 'unknown';
console.log(`push-collectibles: sending ${rows}`);
console.log(`  to ${api}`);

const res = await fetch(`${api}/pg/query`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).catch((err) => {
  console.error(`push-collectibles: could not reach the server - ${err.message}`);
  console.error('  Is the NAS up, and are you on a network that can reach it?');
  process.exit(1);
});

const body = await res.text();
if (!res.ok || body.includes('"error"')) {
  console.error(`push-collectibles: the server refused it (HTTP ${res.status})`);
  console.error(`  ${body.slice(0, 400)}`);
  process.exit(1);
}

// Read back what the server now holds, so the success message is evidence rather
// than an assumption.
const count = await fetch(`${api}/pg/query`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query:
      "select count(*) filter (where active) as active, count(*) filter (where not active) as retired from collectibles",
  }),
})
  .then((r) => r.json())
  .catch(() => null);

if (Array.isArray(count) && count[0]) {
  console.log(`push-collectibles: done - ${count[0].active} collectible, ${count[0].retired} retired`);
} else {
  console.log('push-collectibles: done');
}
