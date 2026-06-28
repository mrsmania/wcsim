import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
    /** Tooltip text/content shown on hover. */
    label: ReactNode;
    /** The trigger contents (rendered inside an inline span). */
    children: ReactNode;
    /** Classes applied to the trigger wrapper (e.g. the chip styling). */
    className?: string;
}

/**
 * Lightweight hover tooltip. The bubble is portalled to document.body and
 * positioned `fixed` from the trigger's bounding rect, so it is never clipped by
 * scrollable/overflow ancestors. Hover-only (the trigger stays non-focusable so
 * it is valid inside an existing button row).
 */
export default function Tooltip({ label, children, className }: Props) {
    const ref = useRef<HTMLSpanElement>(null);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const id = useId();

    const show = () => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: r.left + r.width / 2, y: r.top });
    };
    const hide = () => setPos(null);

    // Keep the bubble within the viewport (it is centered on the trigger).
    const left = pos ? Math.min(Math.max(pos.x, 124), window.innerWidth - 124) : 0;

    return (
        <span
            ref={ref}
            className={className}
            aria-describedby={pos ? id : undefined}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {pos &&
                createPortal(
                    <span
                        id={id}
                        role="tooltip"
                        style={{ position: 'fixed', left, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}
                        className="pointer-events-none z-50 block max-w-[220px] rounded-md bg-stone-900 px-2 py-1 text-[11px] font-medium leading-snug text-white shadow-lg"
                    >
                        {label}
                    </span>,
                    document.body,
                )}
        </span>
    );
}
