/**
 * Generate the three secrets a self-hosted Supabase needs, locally.
 *
 *   node scripts/gen-supabase-keys.mjs
 *
 * Prints JWT_SECRET plus the ANON_KEY and SERVICE_ROLE_KEY that are signed with it.
 * The two keys are ordinary HS256 JWTs whose only real content is a role claim, which
 * is why they must be regenerated together whenever the secret changes.
 *
 * Nothing leaves this machine, and no dependency is needed (node's own crypto).
 * See docs/nas-setup.md §4.
 */
import { createHmac, randomBytes } from 'node:crypto';

/** Ten years, in seconds. Matches what Supabase's own defaults use. */
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.${mac}`;
}

// 48 random bytes as hex = 96 chars, comfortably above Supabase's 32-char minimum.
const jwtSecret = randomBytes(48).toString('hex');
const iat = Math.floor(Date.now() / 1000);
const exp = iat + TEN_YEARS;

const anon = sign({ role: 'anon', iss: 'supabase', iat, exp }, jwtSecret);
const service = sign({ role: 'service_role', iss: 'supabase', iat, exp }, jwtSecret);

console.log('Paste these into the .env next to docker-compose.yml:\n');
console.log(`JWT_SECRET=${jwtSecret}\n`);
console.log(`ANON_KEY=${anon}\n`);
console.log(`SERVICE_ROLE_KEY=${service}\n`);
console.log('Also invent a POSTGRES_PASSWORD and a DASHBOARD_PASSWORD (any long strings).');
console.log('ANON_KEY is safe to ship in the browser. SERVICE_ROLE_KEY never leaves the NAS.');
console.log(`Valid until ${new Date(exp * 1000).toISOString().slice(0, 10)}.`);
