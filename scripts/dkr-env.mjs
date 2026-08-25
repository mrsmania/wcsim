/**
 * Credentials for the self-hosted account server, read from the stack's own config.
 *
 * `dkr/` is gitignored (it holds the database password, the JWT secret and the service
 * key, and this repo is public), so anything that talks to the server reads it from
 * there rather than carrying its own copy. Shared by `push-collectibles.mjs` and
 * `push-sql.mjs` so there is one place that knows where the keys live.
 */
import { readFileSync } from 'node:fs';

const ENV_PATH = 'dkr/.env';

/** One value out of dkr/.env, or exit with an explanation rather than a stack trace. */
export function env(key) {
  let file;
  try {
    file = readFileSync(ENV_PATH, 'utf8');
  } catch {
    console.error(`${ENV_PATH} not found.`);
    console.error('  This needs the self-hosted stack config (see docs/nas-setup.md).');
    process.exit(1);
  }
  const hit = new RegExp(`^${key}=(.*)$`, 'm').exec(file);
  if (!hit?.[1]) {
    console.error(`${key} is not set in ${ENV_PATH}`);
    process.exit(1);
  }
  return hit[1].trim();
}

/** The server's base URL and service-role key, ready to use. */
export function serverConfig() {
  return {
    api: env('SUPABASE_PUBLIC_URL').replace(/\/$/, ''),
    key: env('SERVICE_ROLE_KEY'),
  };
}

/**
 * Run SQL on the account server through Studio's pg-meta endpoint, as the service role.
 * Returns the parsed response; throws with the server's own message when it refuses,
 * since that message is the useful part of a failed migration.
 */
export async function runSql({ api, key }, sql) {
  const res = await fetch(`${api}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }).catch((err) => {
    // A certificate the OS trusts is not one Node trusts: Node ships its own CA list and
    // does not read the Windows store, so a host `curl` reaches fine can still fail here.
    // Say so, because otherwise this reads as "the NAS is down" and sends you to the NAS.
    const cause = err.cause?.message ?? '';
    const tls = /certificate|self-signed|unable to (get|verify)/i.test(`${err.message} ${cause}`);
    throw new Error(
      `could not reach the server - ${err.message}${cause ? ` (${cause})` : ''}\n` +
        (tls
          ? '  That is TLS trust, not the network. Node does not read the OS certificate\n' +
            '  store; retry with NODE_OPTIONS=--use-system-ca (Node 22.15+).'
          : '  Is the NAS up, and are you on a network that can reach it?'),
    );
  });

  const body = await res.text();
  if (!res.ok || body.includes('"error"')) {
    throw new Error(`the server refused it (HTTP ${res.status})\n  ${body.slice(0, 600)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
