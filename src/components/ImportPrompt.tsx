import { useState } from 'react';
import Overlay from './Overlay';
import { PRIMARY_BTN, SECONDARY_BTN } from './matchUi';
import { albumStats } from '../domain/album';
import { ALL_PLAYERS } from '../data/squads';
import type { AccountSnapshot } from '../state/store';

// ---------------------------------------------------------------------------
// The one-time guest -> account move, offered once: this browser has progress and
// the account you just signed into has none (FR-15).
//
// It is a MOVE, not a copy: on success the local copy is deleted, so there is never
// a stale twin of the account sitting in this browser (FR-16a). That is stated
// plainly here, because it is not what "import" usually implies.
// ---------------------------------------------------------------------------

export default function ImportPrompt({
  local,
  email,
  onImport,
  onDecline,
}: {
  local: AccountSnapshot;
  email: string;
  /** Resolves once the server has confirmed and the local copy is gone. */
  onImport: () => Promise<void>;
  onDecline: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = albumStats(local.album, ALL_PLAYERS);
  const career = local.career;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      await onImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={onDecline} ariaLabel="Bring your progress in">
      <h2 className="font-display text-[20px] font-extrabold uppercase tracking-[-0.01em]">
        Bring your progress in?
      </h2>
      <p className="mt-2 text-[13.5px] leading-snug text-muted">
        You have progress saved in this browser, and <b className="text-ink">{email}</b> is a
        fresh account. Move it over now, or start the account clean.
      </p>

      <div className="mt-3 rounded-md border border-line bg-chalk px-3 py-2.5 font-mono text-[12px] leading-relaxed">
        <div>
          Stickers: <b className="text-accent">{stats.collected}</b> of {stats.total}
        </div>
        <div>
          Career: level <b className="text-accent">{career.level}</b> &middot;{' '}
          <b className="text-accent">{career.prestige}</b> Prestige &middot;{' '}
          {career.stats.runs} {career.stats.runs === 1 ? 'run' : 'runs'}
          {career.stats.cups > 0 && ` · ${career.stats.cups} cups`}
        </div>
        {(local.game || local.run) && <div>Plus a game in progress.</div>}
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        This is a move, not a copy: once the account has it, the browser copy is deleted, so
        you never end up with two collections drifting apart. It can only be done once.
      </p>

      {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run()} disabled={busy} className={`${PRIMARY_BTN} disabled:opacity-50`}>
          {busy ? 'Moving...' : 'Move it to my account'}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}
        >
          Start the account clean
        </button>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        Starting clean leaves the browser copy alone, so signing out gets it back. You will not
        be asked again.
      </p>
    </Overlay>
  );
}
