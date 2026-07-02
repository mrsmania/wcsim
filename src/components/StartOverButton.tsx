import { useState } from 'react';
import { SECONDARY_BTN } from './matchUi';

/**
 * A "Start over" control with an inline confirm, so a mid-draft click never discards
 * the XI by accident. `onReset` drops every chosen player and returns to setup.
 */
export default function StartOverButton({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs font-semibold text-muted">Drop your XI and start over?</span>
        <button
          onClick={onReset}
          className="rounded-[5px] border border-loss bg-loss px-3 py-2 font-display text-[12px] font-extrabold uppercase tracking-[0.04em] text-white transition hover:opacity-90"
        >
          Yes, start over
        </button>
        <button
          onClick={() => setConfirm(false)}
          className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className={`mt-3 flex w-full items-center justify-center px-4 py-2.5 text-[13px] ${SECONDARY_BTN}`}
    >
      Start over
    </button>
  );
}
