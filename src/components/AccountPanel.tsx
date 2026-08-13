import { useState } from 'react';
import { FEATURES } from '../config';
import { DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from './matchUi';

// ---------------------------------------------------------------------------
// The whole sign-in surface: one email field, a 6-digit code, done. The same flow
// serves a first-time player and a returning one, so there is no separate register
// step. Rendered inside the settings sheet, and only when a server is configured
// (FEATURES.accounts); a guest never sees it, and never downloads the auth client.
// ---------------------------------------------------------------------------

const FIELD =
  'w-full rounded-md border border-line bg-ground px-3 py-2 text-[13.5px] outline-none focus:border-pitch';

type Stage = 'idle' | 'sending' | 'code' | 'verifying';

export default function AccountPanel({
  email,
  onSignedIn,
  onSignedOut,
}: {
  /** The signed-in address, or null for a guest. */
  email: string | null;
  onSignedIn: () => void;
  onSignedOut: () => void;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!FEATURES.accounts) return null;

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    setStage((s) => (s === 'verifying' ? 'code' : 'idle'));
  };

  const send = async () => {
    setError(null);
    setStage('sending');
    try {
      const { requestCode } = await import('../state/auth');
      await requestCode(address);
      setStage('code');
    } catch (err) {
      fail(err);
    }
  };

  const verify = async () => {
    setError(null);
    setStage('verifying');
    try {
      const { submitCode } = await import('../state/auth');
      await submitCode(address, code);
      // The store has to be rebuilt against the account, which happens on reload.
      onSignedIn();
    } catch (err) {
      fail(err);
    }
  };

  const out = async (scope: 'local' | 'global') => {
    setError(null);
    try {
      const { signOut } = await import('../state/auth');
      await signOut(scope);
      onSignedOut();
    } catch (err) {
      fail(err);
    }
  };

  if (email) {
    return (
      <div>
        <div className="text-[13.5px] font-semibold">Signed in</div>
        <p className="mt-0.5 font-mono text-[12px] text-muted">{email}</p>
        <p className="mt-1.5 text-[12px] leading-snug text-muted">
          Your album, career and settings follow this account on any device.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void out('local')} className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}>
            Sign out
          </button>
          <button type="button" onClick={() => void out('global')} className={DANGER_BTN}>
            Sign out everywhere
          </button>
        </div>
        {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12px] leading-snug text-muted">
        Playing as a guest: progress stays in this browser. Sign in with your email and your
        collection follows you between devices. No password, just a code.
      </p>

      {stage === 'code' || stage === 'verifying' ? (
        <div className="mt-2.5">
          <p className="text-[12.5px]">
            Code sent to <b>{address}</b>. Check your spam folder if it isn&apos;t there.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className={`${FIELD} font-mono tracking-[0.3em]`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-label="Six-digit code"
            />
            <button
              type="button"
              onClick={() => void verify()}
              disabled={code.trim().length < 6 || stage === 'verifying'}
              className={`${PRIMARY_BTN} shrink-0 disabled:opacity-50`}
            >
              {stage === 'verifying' ? 'Checking...' : 'Sign in'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setStage('idle');
              setCode('');
            }}
            className="mt-2 text-[12px] text-muted underline"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <input
            className={FIELD}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email address"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!address.includes('@') || stage === 'sending'}
            className={`${PRIMARY_BTN} shrink-0 disabled:opacity-50`}
          >
            {stage === 'sending' ? 'Sending...' : 'Send code'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}
    </div>
  );
}
