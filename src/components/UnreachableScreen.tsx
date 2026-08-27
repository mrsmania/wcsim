// The signed-in-but-server-unreachable state (D9): a signed-in player is blocked
// rather than quietly dropped into local play, because their album and career live
// on the server and inventing an empty one locally would be a lie.
//
// Used in two places: main.tsx when the boot read fails (before the app exists), and
// App when a save fails mid-play. Deliberately plain and self-contained so it renders
// in both situations.

// THE ONE PLACE THE BUTTON TOKENS ARE WRITTEN OUT BY HAND, and it has to be: this file has
// no imports at all (see above) so that main.tsx can render it before the app exists, and
// `matchUi` would drag lucide, react-router and Flag onto that path. So these two are copies
// of `btn('primary')` and `btn('quiet')` and must be kept in step with them - which is what
// `npm run checks` asserts, because a screen nobody sees until something has gone wrong is
// exactly the one that drifts.
const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-[5px] border font-display font-extrabold uppercase tracking-[0.04em] transition disabled:cursor-not-allowed disabled:opacity-50 px-5 py-3 text-[13px] border-pitch-dark bg-pitch-dark text-white hover:bg-pitch-hover active:scale-[0.99]';
const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-[5px] border font-display font-extrabold uppercase tracking-[0.04em] transition disabled:cursor-not-allowed disabled:opacity-50 px-5 py-3 text-[13px] border-line bg-panel text-muted hover:border-pitch hover:text-pitch-ink';
// Not matchUi's CARD_FLAT either, for the same reason.

export default function UnreachableScreen({
  message,
  /** True when the failure happened while playing, rather than at startup. */
  midPlay = false,
  /** `stale` is a different story: the server is fine, another device moved the
   *  account on, and the fix is to reload rather than to retry (FR-11). */
  variant = 'unreachable',
}: {
  message: string;
  midPlay?: boolean;
  variant?: 'unreachable' | 'stale';
}) {
  if (variant === 'stale') {
    return (
      <div className="fixed inset-0 z-[100] overflow-auto bg-ground">
        <div className="mx-auto max-w-[520px] px-6 py-16 text-ink">
          <h1 className="font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
            Opened somewhere else
          </h1>
          <p className="mt-3 text-[14px] leading-snug text-muted">
            This account was played on another device or tab, so what is on screen here is out
            of date. Reload to pick up where that one left off. Nothing was lost.
          </p>
          <div className="mt-5">
            <button type="button" onClick={() => window.location.reload()} className={PRIMARY}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  const continueAsGuest = () => {
    void import('../state/auth').then(async ({ signOut }) => {
      await signOut().catch(() => {});
      window.location.reload();
    });
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-ground">
      <div className="mx-auto max-w-[520px] px-6 py-16 text-ink">
        <h1 className="font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
          Can&apos;t reach your account
        </h1>
        <p className="mt-3 text-[14px] leading-snug text-muted">
          {midPlay
            ? 'Your last action was not saved, and the server is not answering. Nothing has been lost on the server, but carrying on here would not be saved either.'
            : "Your collection and career live on the server, and it isn't answering right now. Rather than start you off with an empty album, we stopped here."}
        </p>
        <p className="mt-2 font-mono text-[11.5px] text-muted">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.location.reload()} className={PRIMARY}>
            Try again
          </button>
          <button type="button" onClick={continueAsGuest} className={SECONDARY}>
            Continue as guest
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-muted">
          Continuing as a guest signs you out and uses this browser only. Your account is
          untouched, and signing back in brings it back.
        </p>
      </div>
    </div>
  );
}
