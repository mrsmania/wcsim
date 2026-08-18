/**
 * Apply a migration (or run any one-off query) against the account server.
 *
 *   npm run push:sql -- supabase/migrations/0010_finish_run_one_trip.sql
 *   npm run push:sql -- --query "select count(*) from profiles"
 *   npm run push:sql -- --dry-run supabase/migrations/0010_finish_run_one_trip.sql
 *
 * Why this exists: migrations are applied by hand on the NAS, which meant pasting a
 * file into Studio's SQL editor and trusting that it went in. This is the same route
 * `push:collectibles` already uses (Studio's pg-meta endpoint, service-role key from
 * `dkr/.env`), so applying a migration is one command with the server's own answer
 * printed back.
 *
 * It needs to run from a machine that can reach the NAS - the same LAN or VPN
 * requirement as `push:collectibles`. Nothing here is specific to one migration; the
 * file is sent as-is, and every migration in this repo is a single
 * `begin; ... commit;`, so a failure leaves nothing behind.
 */
import { readFileSync } from 'node:fs';
import { runSql, serverConfig } from './dkr-env.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const queryAt = args.indexOf('--query');
const inline = queryAt >= 0 ? args[queryAt + 1] : null;
const file = args.find((a) => !a.startsWith('--') && a !== inline);

if (!file && !inline) {
  console.error('push-sql: give it a .sql file, or --query "select ...".');
  console.error('  e.g. npm run push:sql -- supabase/migrations/0010_finish_run_one_trip.sql');
  process.exit(1);
}

let sql;
if (inline) {
  sql = inline;
} else {
  try {
    sql = readFileSync(file, 'utf8');
  } catch {
    console.error(`push-sql: ${file} not found.`);
    process.exit(1);
  }
}

const { api, key } = serverConfig();
const label = inline ? 'inline query' : file;
// A rough count, just so the summary says something about size; statements inside a
// function body are not statements at this level, hence "roughly".
const statements = sql.split(';').filter((s) => s.trim()).length;

console.log(`push-sql: ${label}`);
console.log(`  ${sql.length} bytes, roughly ${statements} statements`);
console.log(`  to ${api}`);

if (dryRun) {
  console.log('push-sql: --dry-run, nothing sent.');
  process.exit(0);
}

try {
  const result = await runSql({ api, key }, sql);
  if (Array.isArray(result) && result.length) {
    console.log('push-sql: done. The server returned:');
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
  } else {
    console.log('push-sql: done.');
  }
} catch (err) {
  console.error(`push-sql: ${err.message}`);
  process.exit(1);
}
