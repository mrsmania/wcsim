// The referee's configuration, read once and complained about loudly.
//
// Wave 3 of docs/pvp-plan.md. Every value comes from the environment because the referee
// runs as a container beside the Supabase stack (P46) and its secrets - the database
// password for its own narrow role, the JWT secret it verifies sessions with - must not be
// in this repository, which is public.
//
// It is a pure function of a plain object rather than a module reading `process.env` at
// import time, for the usual two reasons: the rule can be checked without a container, and
// a missing variable is a message rather than a crash halfway through the first request.

export interface RefereeEnv {
  port: number;
  /** `postgres://pvp_referee:...@db:5432/postgres`. The narrow role from migration 0016,
   *  which is `nologin` until somebody runs `alter role pvp_referee login password '...'`
   *  by hand (P34, and the roadmap item for this wave). */
  databaseUrl: string;
  /** The Supabase `JWT_SECRET`. The referee verifies sessions itself rather than asking
   *  the auth server, because a verification that needs a round trip is a verification
   *  that fails when the auth server is busy. */
  jwtSecret: string;
  /** Optional. When the deployment sets an audience, a token must carry it (P34). */
  jwtAudience?: string;
  /** Where Realtime lives, for Broadcast (P33). Absent means the referee runs without
   *  publishing, which is a legitimate deployment - every client still polls its room -
   *  and it must not be a startup failure, or a Realtime outage takes rooms down too. */
  realtimeUrl?: string;
  /** The service-role key Broadcast is posted with. Required if `realtimeUrl` is set. */
  realtimeKey?: string;
  /** How often the sweeper looks. A deadline is stored data (P32), so this is granularity
   *  and nothing else: doubling it makes an expiry up to a second later, not wrong. */
  sweepMs: number;
}

/** How long a gap since the last sweep counts as an OUTAGE rather than an ordinary pause.
 *  See `outage.ts`: applying P45's recovery on every sweep stops the pick clock dead, so
 *  the threshold is what separates the two. A multiple of the sweep interval, so a
 *  deployment that sweeps every five seconds does not read every ordinary pass as an
 *  outage - and an absolute floor as well, because the multiple alone leaves a fast
 *  sweeper one slow pass away from handing time back. */
export const OUTAGE_SWEEPS = 4;
export const OUTAGE_FLOOR_MS = 10_000;

const int = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Throws with EVERY missing variable named, not just the first: filling them in one at a
 *  time across four container restarts is the alternative. */
export function readEnv(src: Record<string, string | undefined>): RefereeEnv {
  const missing: string[] = [];
  const need = (key: string): string => {
    const v = src[key]?.trim();
    if (!v) missing.push(key);
    return v ?? '';
  };
  const databaseUrl = need('REFEREE_DATABASE_URL');
  const jwtSecret = need('SUPABASE_JWT_SECRET');
  const realtimeUrl = src.REALTIME_URL?.trim() || undefined;
  const realtimeKey = src.REALTIME_SERVICE_KEY?.trim() || undefined;
  if (realtimeUrl && !realtimeKey) missing.push('REALTIME_SERVICE_KEY (REALTIME_URL is set)');
  if (missing.length) {
    throw new Error(`referee: missing configuration: ${missing.join(', ')}`);
  }
  return {
    port: int(src.PORT, 8787),
    databaseUrl,
    jwtSecret,
    jwtAudience: src.SUPABASE_JWT_AUD?.trim() || undefined,
    realtimeUrl,
    realtimeKey,
    sweepMs: int(src.SWEEP_MS, 1000),
  };
}
