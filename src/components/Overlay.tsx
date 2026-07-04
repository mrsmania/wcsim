import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** A centred modal over a dimmed backdrop. Closes on the X button, a backdrop click,
 *  or Escape. Shared by the sticker overlays (trade, cup reward, run-end summary).
 *  `bare` drops the panel chrome (border/bg/padding) so children sit directly on the
 *  backdrop - used by the sticker lightbox to avoid a card-in-card look; the X then
 *  floats at the top-right of the screen. */
export default function Overlay({
  onClose,
  children,
  ariaLabel,
  bare = false,
}: {
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
  bare?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock background scroll while the modal is open (own effect with [] deps so the
  // original overflow is captured once and restored on close, not clobbered by a
  // re-render). The page scrolls on the document element, so lock that.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = 'hidden';
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-ink/55 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {bare && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink/40 text-white transition hover:bg-ink/70"
        >
          <X size={20} strokeWidth={2.5} />
        </button>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={
          bare
            ? 'relative max-h-[88vh] max-w-full overflow-auto'
            : 'relative max-h-[88vh] w-full max-w-[640px] overflow-auto rounded-lg border border-line bg-ground p-6 shadow-hard'
        }
      >
        {!bare && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-ink/10 hover:text-ink"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
