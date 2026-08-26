// ---------------------------------------------------------------------------
// Who the referee will take an instruction from.
//
// Wave 1 of docs/pvp-plan.md, decision P34. Pure, so the rule can be asserted without a
// server, a token library or a network - what is decided here is what a set of already
// verified claims MEANS, not how a signature is checked.
//
// THE TRAP THIS EXISTS FOR. In self-hosted Supabase the "anon key" is not an API key in
// any meaningful sense: it is a JWT signed with the same `JWT_SECRET` as every user's
// session token, carrying `role: "anon"` and no `sub`. It ships inside the browser bundle
// by design (cloud-sync NFR-2: the browser gets the publishable key and row-level security
// is the real boundary). So a referee that verifies the SIGNATURE and reads `sub` accepts
// that key from any visitor on the internet, with an undefined user id, and whatever it
// then does with that id is either a crash or a room joined by nobody.
//
// A verified signature is therefore necessary and nowhere near sufficient. This is the
// same shape as the bug migration `0008_function_grants.sql` fixed, where every function
// was callable by anyone because Postgres makes functions PUBLIC by default and the
// Supabase image grants them to `anon` on top: the default is the trap, and the fix is to
// state the rule explicitly rather than to rely on what looks like a gate.
//
// The referee is also the only component in the whole design that takes un-RLS'd input
// from the internet, which is why P34 additionally gives it its own narrow Postgres role.
// That half is deployment, not logic, and lives in wave 3.
// ---------------------------------------------------------------------------

/** The claims of an already signature-verified token. Deliberately all optional and all
 *  `unknown`-ish: this function's whole job is to decide whether a decoded blob is
 *  something to act on, so typing the input as if it were already trustworthy would
 *  assume the answer. */
export interface TokenClaims {
  role?: string;
  sub?: string;
  exp?: number;
  aud?: string;
}

/** Why a caller was refused. Named rather than a boolean because the referee should log
 *  which rule rejected a request - "unauthorized" tells whoever is debugging a deployment
 *  nothing, and the anon-key case in particular looks like a working client. */
export type CallerFault = 'not-authenticated' | 'no-subject' | 'expired' | 'wrong-audience';

export interface CallerVerdict {
  ok: boolean;
  /** The account id, only when `ok`. */
  userId?: string;
  faults: CallerFault[];
}

/** The role a real signed-in user's token carries. `anon` is the other one, and refusing
 *  it is the entire point of this module. */
const AUTHENTICATED = 'authenticated';

/**
 * Decide whether an already signature-verified token identifies an account the referee
 * will act for.
 *
 * `now` is passed in rather than read, so the expiry rule is testable and the module stays
 * pure - the same reason `applyRunResult` takes its timestamp as an argument.
 *
 * `audience` is optional because a self-hosted deployment may not set one; when it is
 * given it must match. Absent on both sides is fine, absent on one is not.
 */
export function verifyCaller(
  claims: TokenClaims,
  now: number,
  audience?: string,
): CallerVerdict {
  const faults: CallerFault[] = [];
  // The order is deliberate: role first, because it is the check that a naive
  // implementation omits and the one that lets the whole internet in.
  if (claims.role !== AUTHENTICATED) faults.push('not-authenticated');
  if (!claims.sub) faults.push('no-subject');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) faults.push('expired');
  if (audience !== undefined && claims.aud !== audience) faults.push('wrong-audience');
  return faults.length
    ? { ok: false, faults }
    : { ok: true, userId: claims.sub, faults: [] };
}
