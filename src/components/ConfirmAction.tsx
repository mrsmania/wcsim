import { useState } from 'react';
import { DANGER_BTN, SECONDARY_BTN } from './matchUi';

/**
 * A destructive action with an inline confirm step, so a stray click never fires it.
 * Idle it renders a trigger button (styled by `triggerClassName`); clicked it swaps to
 * a prompt + a red confirm + a Cancel. Shared by Start over / Discard XI / Reset album.
 */
export default function ConfirmAction({
  prompt,
  confirmLabel,
  onConfirm,
  triggerLabel,
  triggerClassName,
  rowClassName = 'flex flex-wrap items-center justify-center gap-2',
}: {
  /** The question shown while confirming. */
  prompt: string;
  /** The red confirm button's label. */
  confirmLabel: string;
  onConfirm: () => void;
  /** The idle trigger's label. */
  triggerLabel: string;
  /** The idle trigger's className (a secondary button, a mono link, ...). */
  triggerClassName: string;
  /** The confirm row's layout (defaults to a centred wrap). */
  rowClassName?: string;
}) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className={rowClassName}>
        <span className="text-xs font-semibold text-muted">{prompt}</span>
        <button
          onClick={() => {
            onConfirm();
            setConfirm(false);
          }}
          className={DANGER_BTN}
        >
          {confirmLabel}
        </button>
        <button onClick={() => setConfirm(false)} className={`px-3 py-2 text-[12px] ${SECONDARY_BTN}`}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirm(true)} className={triggerClassName}>
      {triggerLabel}
    </button>
  );
}
