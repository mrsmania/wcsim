// How often a stranger may ask what an invitation points at.
//
// THE ONE UNAUTHENTICATED ROOM READ NEEDS A RATE LIMIT, and that is the whole of this
// file. `GET /v1/rooms/:code/invite` answers without a session on purpose (`InviteRoom`:
// a link is how a private room and a duel reach anybody), which means the six characters
// of a code are the only thing standing between a caller and a host's display name. Six
// characters from a 31-letter alphabet is 887 million, so the secret is only as good as
// the rate at which it can be guessed: unmetered, that is minutes of work with a script;
// at the figures below it is years, and the arithmetic is the reason for the numbers
// rather than a feeling about them.
//
// IT IS A PURE FUNCTION OF A CLOCK, like everything else in this referee (P32): no timers,
// `now` is an argument, so `npm run checks` drives a flood, a rolled window and a second
// caller through the real thing in microseconds.
//
// WHAT IT IS NOT. Not a defence against somebody with a valid code - they were sent one -
// and not a defence of the room itself: joining still needs an account and a display name,
// and every command in `api.ts` still needs a session. It buys back exactly what an
// unauthenticated read spends, which is the enumeration rate.

/** The window and the two caps. Sixty seconds is coarse on purpose: a fixed window lets a
 *  caller burst across a boundary, which at these figures is 40 reads instead of 20 and
 *  nobody's problem, and it costs one number instead of a queue of timestamps per key. */
export interface InviteLimits {
  windowMs: number;
  /** How many one caller may make. An invitation is opened once and refreshed a few times,
   *  so this is generous to a person and useless to a script. */
  perKey: number;
  /** How many everybody may make together, which is the backstop for a flood spread over
   *  many addresses. Four a second against 887 million codes is several years to a first
   *  hit, and this game does not see four invitations a second. */
  total: number;
}

export const INVITE_LIMITS: InviteLimits = { windowMs: 60_000, perKey: 20, total: 240 };

export interface InviteLimiter {
  /** Whether this read may go ahead, counting it when it may. */
  allow(key: string, now: number): boolean;
}

export function inviteLimiter(limits: InviteLimits = INVITE_LIMITS): InviteLimiter {
  let windowStart = -Infinity;
  let total = 0;
  const counts = new Map<string, number>();
  return {
    allow(key: string, now: number): boolean {
      if (now - windowStart >= limits.windowMs) {
        windowStart = now;
        total = 0;
        counts.clear();
      }
      if (total >= limits.total) return false;
      const used = counts.get(key) ?? 0;
      // A REFUSAL IS FREE, and that is the property to keep: a refused read does not touch
      // the shared budget, so one caller hammering their own limit cannot starve everybody
      // else out through the global cap. It is also what bounds the memory - nothing is
      // ever put in the map without incrementing `total`, so the map holds at most `total`
      // keys for at most one window, whatever arrives.
      if (used >= limits.perKey) return false;
      counts.set(key, used + 1);
      total++;
      return true;
    },
  };
}
