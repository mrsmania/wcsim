import { btn } from './matchUi';
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
      triggerClassName={`mt-3 w-full ${btn('secondary')}`}
      rowClassName="mt-3 flex flex-wrap items-center justify-center gap-2"
    />
  );
}
