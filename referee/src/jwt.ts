// Verifying a session token, and then deciding whether to act on it.
//
// Wave 3 of docs/pvp-plan.md, the deployment half of P34. The DECISION half is
// `src/domain/pvpAuth.ts` and it is deliberately somewhere else: what a set of verified
// claims means is a rule, checkable without a network, and this file is only the
// signature.
//
// THE TRAP, restated because this is the file that would fall into it. In self-hosted
// Supabase the "anon key" is a JWT signed with the same secret as every user's session,
// carrying `role: "anon"` and no `sub`, and it ships in the browser bundle by design. So a
// referee that verifies the signature and reads `sub` has verified nothing: it accepts that
// key from anybody on the internet. Verification and authorisation are two steps here and
// the second one is `verifyCaller`.
//
// HS256 by hand rather than a library, because it is thirty lines of `node:crypto` against
// a dependency in a container that holds a database credential, and because the one thing
// that is easy to get wrong - comparing signatures with `===`, which leaks the answer a
// byte at a time - is one call to `timingSafeEqual`.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyCaller, type CallerVerdict, type TokenClaims } from '../../src/domain/pvpAuth';

export type TokenFault = 'missing' | 'malformed' | 'wrong-algorithm' | 'bad-signature';

export interface TokenVerdict extends CallerVerdict {
  /** Why the token itself was refused, before its claims were even read. */
  tokenFault?: TokenFault;
}

const refuse = (tokenFault: TokenFault): TokenVerdict => ({ ok: false, faults: [], tokenFault });

/** base64url, which is not what `Buffer.from(s, 'base64')` does with padding and the two
 *  substituted characters - and getting it wrong makes a valid token look forged. */
function decodeSegment(seg: string): string | null {
  try {
    return Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** The bearer token out of an Authorization header, or null. Case-insensitive on the
 *  scheme, because clients disagree about it and a 401 for `bearer` would be a bad day. */
export function bearerOf(header: string | undefined | null): string | null {
  const m = /^bearer\s+(\S+)$/i.exec((header ?? '').trim());
  return m?.[1] ?? null;
}

/**
 * Verify a token and decide whether to act for whoever it names.
 *
 * `now` is milliseconds and passed in, like everywhere else in this feature, so the expiry
 * rule can be exercised without waiting for one.
 */
export function verifyToken(
  token: string | null,
  secret: string,
  now: number,
  audience?: string,
): TokenVerdict {
  if (!token) return refuse('missing');
  const parts = token.split('.');
  if (parts.length !== 3) return refuse('malformed');
  const [head, body, sig] = parts as [string, string, string];

  const headerJson = decodeSegment(head);
  if (!headerJson) return refuse('malformed');
  let alg: unknown;
  try {
    alg = (JSON.parse(headerJson) as { alg?: unknown }).alg;
  } catch {
    return refuse('malformed');
  }
  // `none` is the classic forgery and an asymmetric algorithm here would mean verifying a
  // signature with a key the attacker chose. One algorithm, named.
  if (alg !== 'HS256') return refuse('wrong-algorithm');

  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const actual = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return refuse('bad-signature');
  }

  const claimsJson = decodeSegment(body);
  if (!claimsJson) return refuse('malformed');
  let claims: TokenClaims;
  try {
    claims = JSON.parse(claimsJson) as TokenClaims;
  } catch {
    return refuse('malformed');
  }
  // Signature good. Now the part that actually decides, and the part a naive referee omits.
  return verifyCaller(claims, now, audience);
}
