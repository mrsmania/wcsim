import { useState, type ReactNode } from 'react';
import { DANGER_BTN, btn } from './matchUi';

/**
 * A destructive action with an inline confirm step, so a stray click never fires it.
 * Idle it renders a trigger button (styled by `triggerClassName`); clicked it swaps to
 * a prompt + a red confirm + a Cancel. Shared by Start over / Discard XI / Reset album /
 * Delete my account.
 *
 * Two layouts, because the five callers genuinely want two. By default the prompt and
 * both buttons sit in one row, which is what a footer control wants. Pass
 * `confirmClassName` and the confirming state becomes a box instead - the prompt on its
 * own line above the button row - which is what a multi-sentence warning needs.
 */
export default function ConfirmAction({
  prompt,
  confirmLabel,
  onConfirm,
  triggerLabel,
  triggerClassName,
  rowClassName = 'flex flex-wrap items-center justify-center gap-2',
  promptClassName = 'text-xs font-semibold text-muted',
  confirmClassName,
  busy = false,
  busyLabel,
}: {
  /** The question shown while confirming. A node, not a string: the account-delete
   *  warning is three sentences with the email bolded inside it. */
  prompt: ReactNode;
  /** The red confirm button's label. */
  confirmLabel: string;
  onConfirm: () => void;
  /** The idle trigger's label. */
  triggerLabel: string;
  /** The idle trigger's className (a secondary button, a mono link, ...). */
  triggerClassName: string;
  /** The confirm row's layout (defaults to a centred wrap). */
  rowClassName?: string;
  /** The prompt's className. Overridden where the row sits on a dark surface (the
   *  cover's grass hero), since the default muted grey is a paper-on-white colour. */
  promptClassName?: string;
  /** Set to render the confirming state as a box with the prompt above the buttons,
   *  rather than everything on one row. Its own className, so the caller picks the
   *  surface (the account panel tints it red). */
  confirmClassName?: string;
  /** True while an async confirm is in flight: both buttons disable and the confirm
   *  shows `busyLabel`. */
  busy?: boolean;
  /** The confirm button's label while `busy` (e.g. "Deleting..."). Supplying it also
   *  hands the CALLER ownership of when the confirm closes: it stays open after
   *  `onConfirm` rather than self-closing, because an action that is still running and
   *  can still fail must not collapse back to its trigger. `busy` alone cannot carry
   *  that, since it defaults to false and so cannot say whether it was passed. Every
   *  synchronous caller omits both and keeps the old self-closing behaviour. */
  busyLabel?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const managed = busyLabel !== undefined;

  if (confirm) {
    const buttons = (
      <>
        <button
          onClick={() => {
            onConfirm();
            if (!managed) setConfirm(false);
          }}
          disabled={busy}
          className={`${DANGER_BTN} disabled:opacity-60`}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button
          onClick={() => setConfirm(false)}
          disabled={busy}
          className={btn('secondary')}
        >
          Cancel
        </button>
      </>
    );

    if (confirmClassName) {
      return (
        <div className={confirmClassName}>
          <p className={promptClassName}>{prompt}</p>
          <div className={rowClassName}>{buttons}</div>
        </div>
      );
    }
    return (
      <div className={rowClassName}>
        <span className={promptClassName}>{prompt}</span>
        {buttons}
      </div>
    );
  }

  return (
    <button onClick={() => setConfirm(true)} className={triggerClassName}>
      {triggerLabel}
    </button>
  );
}
