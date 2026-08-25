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

const label = inline ? 'inline query' : file;
/** Statements at the TOP level: semicolons outside a dollar-quoted body, a string, a
 *  comment or brackets.
 *
 *  This used to be `sql.split(';').length`, which counts every semicolon inside every
 *  plpgsql body - so a migration holding three functions announced itself as forty-odd
 *  statements in the confirmation prompt you are meant to read before sending it to a
 *  live server (hygiene H100). */
function countStatements(text) {
  let n = 0;
  let i = 0;
  let depth = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '--') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    const c = text[i];
    if (c === "'" || c === '"') {
      // SQL escapes a quote by doubling it, so this walks to the first unpaired one.
      i += 1;
      while (i < text.length) {
        if (text[i] === c) {
          if (text[i + 1] === c) i += 2;
          else break;
        } else i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '$') {
      // A dollar-quoted body: $$ ... $$ or $tag$ ... $tag$. Everything inside is opaque.
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (m) {
        const end = text.indexOf(m[0], i + m[0].length);
        i = end === -1 ? text.length : end + m[0].length;
        continue;
      }
    }
    if (c === '(') depth += 1;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) n += 1;
    i += 1;
  }
  // A trailing statement with no final semicolon still counts.
  return n + (/[^\s;]/.test(text.slice(text.lastIndexOf(';') + 1)) ? 1 : 0);
}
const statements = countStatements(sql);

// Resolved AFTER the dry-run branch below. `serverConfig()` reads dkr/.env and exits 1 when
// it is missing, so calling it first made --dry-run - the one mode that touches no network
// and needs no credentials - the one mode you could not use without them. That is exactly
// backwards for its main use: reading a migration before asking someone with NAS access to
// apply it. (Hygiene H110.)
let api = null;
let key = null;
if (!dryRun) {
  ({ api, key } = serverConfig());
}

console.log(`push-sql: ${label}`);
console.log(`  ${sql.length} bytes, ${statements} top-level statement${statements === 1 ? '' : 's'}`);
console.log(`  to ${api ?? 'not resolved (dry run)'}`);

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
