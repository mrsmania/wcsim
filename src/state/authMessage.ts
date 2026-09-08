// ---------------------------------------------------------------------------
// Turning a sign-in refusal into a sentence a player can act on.
//
// WHY THIS EXISTS. `requestCode` used to rethrow GoTrue's own `error.message` and the
// account panel printed it unchanged, so a player who arrived during a busy hour was told
// "email rate limit exceeded". That is wrong three ways at once: it reads as though THEY
// did something wrong, it does not say it is temporary, and it gives them nothing to do.
// It is also the message most likely to be seen by the most people at the worst moment,
// since the limit it reports is one bucket shared by everybody signing in.
//
// THE RULE IS THE REFEREE'S RULE, and this is deliberately the same shape as
// `components/versus/refereeMessage.ts`: say something useful for the cases we know, and
// for everything else show the server's own words rather than a shrug. A sentence we
// invented for an error we did not anticipate is worse than the raw string, because the
// raw string can at least be searched for.
//
// THE TWO 429s ARE DIFFERENT THINGS WEARING ONE CODE, which is the one subtlety here.
// GoTrue answers both the per-address gap and the global hourly bucket with
// `over_email_send_rate_limit`, so the code alone cannot tell them apart. The per-address
// one already carries the useful part - how many seconds are left - so it is matched on
// its own wording and its number is KEPT. Everything else at 429 is the shared bucket,
// which is not the player's fault and not about them.
//
// Pure and importing nothing, so `npm run checks` can hold it without pulling the auth
// client (and therefore the whole supabase library) into the harness.
// ---------------------------------------------------------------------------

/** How long the per-address gap says to wait, or null when this is not that error. */
export function secondsToWait(message: string): number | null {
  const m = /you can only request this after (\d+) seconds?/i.exec(message);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True for the refusals that mean "come back shortly" rather than "you got it wrong". */
export function isRateLimit(code: string | undefined, status: number | undefined): boolean {
  return (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429
  );
}

/**
 * What to show the player. Takes the error as it arrives from the auth client, which
 * carries an optional `code` and `status` beside the message.
 */
export function authMessage(err: unknown): string {
  const e = err as { message?: unknown; code?: unknown; status?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : String(err);
  const code = typeof e?.code === 'string' ? e.code : undefined;
  const status = typeof e?.status === 'number' ? e.status : undefined;

  // The per-address gap, which is the one a single player trips by pressing twice. Its
  // own number is the whole value of it, so it survives.
  const wait = secondsToWait(message);
  if (wait !== null) {
    return wait === 1
      ? 'You just asked for a code. You can ask for another in 1 second.'
      : `You just asked for a code. You can ask for another in ${wait} seconds.`;
  }

  // The shared bucket. Nothing about this is the player's doing, so the sentence says so.
  if (isRateLimit(code, status)) {
    return 'Too many people are signing in at once. Please try again in a few minutes.';
  }

  if (code === 'otp_expired') {
    return 'That code has expired. Ask for a new one and it will arrive in a moment.';
  }

  // Anything we did not anticipate keeps the server's own words.
  return message;
}
