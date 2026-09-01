// The referee, wired up.
//
// Wave 3 of docs/pvp-plan.md. A plain `node:http` server behind a route on the existing
// gateway (P46), a Postgres pool on its own narrow role, one stateless sweeper, and a
// broadcast that is only ever a nudge.
//
// THE BROADCAST CARRIES NO STATE, and that is a decision this file makes rather than
// inherits. What each player may see of a room differs (`view.ts`: another player's shape,
// deals and XI are hidden until their tie is played), and a broadcast goes to one channel
// for everybody - so a payload carrying the room would either leak the draft or need a
// message per member. It carries "this room changed, at T" and each client asks for its own
// view. That also makes P33's chief benefit structural rather than careful: there is no
// private data in the stream at all, so no policy can be wrong about it.
//
// ORDER AT STARTUP MATTERS. Recover, then sweep, then listen. Sweeping first auto-picks for
// every player in every drafting room and then hands back the time it has already spent.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { handle, type ApiDeps } from './api';
import { httpBroadcaster, silentBroadcaster, type Broadcaster } from './broadcast';
import { readEnv } from './env';
import { faultOf } from './fault';
import { inviteLimiter } from './invites';
import { pgStore } from './pgStore';
import { recoverAtBoot, startSweeper } from './sweeper';

/** Six characters, from an alphabet with no O/0 and no I/1/L: a code is read aloud and
 *  typed by somebody who did not choose it. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const log = (msg: string): void => {
  process.stdout.write(`${new Date().toISOString()} referee ${msg}\n`);
};

/** At most 64KB of body. A pick is a hundred bytes; anything larger is a mistake or an
 *  attempt, and reading it to find out which is the mistake. */
const MAX_BODY = 64 * 1024;

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // The referee is called from the deployed game on another origin, and the gateway in
    // front of it does not know these routes. Credentials are a bearer token rather than a
    // cookie, so a wildcard origin is safe here in the way it would not be otherwise.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

/**
 * Who is asking, for metering the unauthenticated invitation read and for nothing else.
 *
 * The referee sits behind the account server's own gateway (P46), so the socket's address
 * is the gateway's for every caller - the forwarded header is the only thing that tells two
 * visitors apart, and it is set by that gateway. It is also trivially spoofable by anybody
 * who wants their own bucket, which is why the global cap exists behind the per-key one:
 * this decides how a limit is SHARED, never who somebody is. Truncated because it is a map
 * key made of a header.
 */
function clientKeyOf(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return (first || req.socket.remoteAddress || 'unknown').slice(0, 64);
}

async function main(): Promise<void> {
  const env = readEnv(process.env);
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 8 });
  const store = pgStore(pool);
  const broadcaster: Broadcaster =
    env.realtimeUrl && env.realtimeKey
      ? httpBroadcaster(env.realtimeUrl, env.realtimeKey, log)
      : silentBroadcaster;
  if (broadcaster === silentBroadcaster) log('no REALTIME_URL: rooms will poll');

  const deps: ApiDeps = {
    store,
    now: () => Date.now(),
    jwtSecret: env.jwtSecret,
    jwtAudience: env.jwtAudience,
    sweepMs: env.sweepMs,
    // One limiter for the life of the process, in front of the one unauthenticated room
    // read (`invites.ts`). In memory and per instance on purpose: it is a rate limit rather
    // than a quota, so an instance restarting or a second one running costs a doubling of a
    // figure that is already generous, and putting it in Postgres would mean a write on
    // every visit to the cheapest read in the referee.
    inviteLimiter: inviteLimiter(),
    newCode,
    newBotId: () => randomUUID(),
  };

  const nudge = (code: string): void => {
    void broadcaster.publish(code, 'room', { code, at: Date.now() });
  };

  const recovered = await recoverAtBoot(store, Date.now());
  if (recovered.length) log(`recovered ${recovered.length} room(s): ${recovered.join(', ')}`);

  const stopSweeper = startSweeper(store, env.sweepMs, (result) => {
    for (const code of result.recovered) log(`recovered ${code} after an outage`);
    for (const code of result.advanced) nudge(code);
    for (const f of result.failed) log(`sweep failed for ${f.code}: ${f.fault}`);
  });

  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'OPTIONS') return send(res, 204, null);
        const url = new URL(req.url ?? '/', 'http://referee');
        const body = req.method === 'POST' ? await readBody(req) : {};
        const out = await handle(
          {
            method: req.method ?? 'GET',
            path: url.pathname,
            body,
            authorization: req.headers.authorization ?? null,
            clientKey: clientKeyOf(req),
          },
          deps,
        );
        if (out.publish) nudge(out.publish);
        send(res, out.status, out.body);
      } catch (err) {
        // NEVER THE MESSAGE: it can carry a query, a row value or a connection string. But
        // a 500 with nothing at all in it is undiagnosable by the only person who can see
        // it, which is what happened the first time wave 5 met a real database - the answer
        // was in this log and nobody watching the browser could get at it. So the reply
        // carries the SCHEMA IDENTIFIERS, which are public facts (they are in the
        // repository) and are enough to name the fault: an SQLSTATE plus whichever of the
        // column, constraint, table and function the driver attached.
        //
        // Deliberately NOT `err.detail`: Postgres puts the offending row's values in there
        // ("Key (code)=(RM0001) already exists"), which is the one part of a database error
        // that is nobody else's business.
        log(`500 ${req.method} ${req.url}: ${faultOf(err)} ${(err as Error).message}`);
        send(res, 500, { error: 'referee-error', detail: faultOf(err) });
      }
    })();
  });

  server.listen(env.port, () => log(`listening on ${env.port}, sweeping every ${env.sweepMs}ms`));

  const shutdown = (signal: string): void => {
    log(`${signal}: stopping`);
    stopSweeper();
    server.close(() => void pool.end().then(() => process.exit(0)));
    // A room's deadlines are in the database, so there is nothing to flush and nothing to
    // lose by being firm about it.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main().catch((err: Error) => {
  log(`failed to start: ${err.message}`);
  process.exit(1);
});
