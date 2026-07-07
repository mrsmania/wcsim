import { SECONDARY_BTN } from './matchUi';
import ConfirmAction from './ConfirmAction';

/**
 * A "Start over" control with an inline confirm, so a mid-draft click never discards
 * the XI by accident. `onReset` drops every chosen player and returns to setup.
 */
export default function StartOverButton({ onReset }: { onReset: () => void }) {
  return (
    <ConfirmAction
      prompt="Drop your XI and start over?"
      confirmLabel="Yes, start over"
      onConfirm={onReset}
      triggerLabel="Start over"
      triggerClassName={`mt-3 flex w-full items-center justify-center px-4 py-2.5 text-[13px] ${SECONDARY_BTN}`}
      rowClassName="mt-3 flex flex-wrap items-center justify-center gap-2"
    />
  );
}
