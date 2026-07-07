import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
    /** Tooltip text/content shown on hover. */
    label: ReactNode;
    /** The trigger contents (rendered inside an inline span). */
    children: ReactNode;
    /** Classes applied to the trigger wrapper (e.g. the chip styling). */
    className?: string;
    /** Wider bubble with more padding, for multi-line content like rules. */
    wide?: boolean;
}

interface Anchor {
    cx: number;
    top: number;
    bottom: number;
}

/**
 * Lightweight hover tooltip. The bubble is portalled to document.body and
 * positioned `fixed` from the trigger's rect, so it is never clipped by
 * scrollable/overflow ancestors. It flips above/below depending on available
 * space, and dismisses on scroll/resize so it never lingers out of place.
 * Hover-only (the trigger stays non-focusable so it is valid inside a button row).
 */
export default function Tooltip({ label, children, className, wide = false }: Props) {
    const ref = useRef<HTMLSpanElement>(null);
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [placement, setPlacement] = useState<'above' | 'below'>('above');
    const id = useId();

    const show = () => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    };
    const hide = () => setAnchor(null);

    // Flip above/below based on the room above the trigger, measured before paint.
    useLayoutEffect(() => {
        if (!anchor || !bubbleRef.current) return;
        const h = bubbleRef.current.offsetHeight;
        const fitsAbove = anchor.top >= h + 12;
        const fitsBelow = window.innerHeight - anchor.bottom >= h + 12;
        // Prefer above, but drop below when there isn't room above (and there is below).
        setPlacement(fitsAbove || !fitsBelow ? 'above' : 'below');
    }, [anchor]);

    // A fixed bubble would stay put while the page/list scrolls - dismiss instead.
    useEffect(() => {
        if (!anchor) return;
        const onMove = () => hide();
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [anchor]);

    const margin = wide ? 150 : 124;
    const left = anchor ? Math.min(Math.max(anchor.cx, margin), window.innerWidth - margin) : 0;
    const top = anchor ? (placement === 'above' ? anchor.top - 8 : anchor.bottom + 8) : 0;
    const transform = placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';

    return (
        <span
            ref={ref}
            className={className}
            aria-describedby={anchor ? id : undefined}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {anchor &&
                createPortal(
                    <span
                        ref={bubbleRef}
                        id={id}
                        role="tooltip"
                        style={{ position: 'fixed', left, top, transform }}
                        className={`pointer-events-none z-50 block rounded-md bg-stone-900 text-[11px] font-medium leading-snug text-white shadow-lg ${
                            wide ? 'max-w-[280px] px-2.5 py-2' : 'max-w-[220px] px-2 py-1'
                        }`}
                    >
                        {label}
                    </span>,
                    document.body,
                )}
        </span>
    );
}
