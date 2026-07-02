import { useEffect, type ReactNode } from 'react';

/** A centred modal over a dimmed backdrop. Closes on backdrop click or Escape.
 *  Shared by the sticker overlays (trade, cup reward, run-end summary). */
export default function Overlay({
  onClose,
  children,
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-ink/55 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="max-h-[88vh] w-full max-w-[640px] overflow-auto rounded-lg border border-line bg-ground p-6 shadow-hard"
      >
        {children}
      </div>
    </div>
  );
}
