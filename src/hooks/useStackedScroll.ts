import { useCallback, useRef, type MutableRefObject } from 'react';
import { scrollIntoViewRespectingMotion } from './motion';

// The build page's mobile scroll dance, and the two refs it needs (hygiene H84). It is
// the reason the placement handlers knew about the DOM at all.
//
// The dance is a there-and-back: picking a player scrolls to the board so a slot can be
// tapped, and placing him scrolls back to the panel he was picked from. It only reads as
// one gesture because the panel sits ABOVE the board on a phone - which is why the build
// page went back to panel-first after briefly trying pitch-first, where the return
// scroll travels the wrong way (roadmap item 27, decision D, reverted).
//
// Both go through `scrollIntoViewRespectingMotion`, so a reduced-motion preference jumps
// instead of animating. These were the last scrolls in the app that ignored it: five raw
// `behavior: 'smooth'` calls, while every other scroll had honoured the preference since
// the run screen started using the helper.

/** True on the stacked (single-column) layout, i.e. below the three-column breakpoint.
 *  On that layout the source panel and the pitch are stacked vertically, so we scroll
 *  between them; on the wide layout they sit side by side and there is nothing to do. */
const isStackedLayout = () =>
    typeof window !== 'undefined' && !window.matchMedia('(min-width: 1080px)').matches;

export interface StackedScroll {
    /** Attach to the board section. */
    pitchRef: MutableRefObject<HTMLDivElement | null>;
    /** Attach to the source panel (setup / drawn squad / market / complete). */
    squadRef: MutableRefObject<HTMLElement | null>;
    /** A player is in hand: bring the board up so a slot can be tapped. */
    scrollToPitch: () => void;
    /** He landed: go back to the panel, which is now showing the next thing to pick. */
    scrollToPanel: () => void;
}

export function useStackedScroll(): StackedScroll {
    const pitchRef = useRef<HTMLDivElement | null>(null);
    const squadRef = useRef<HTMLElement | null>(null);
    const scrollToPitch = useCallback(() => {
        if (!isStackedLayout() || !pitchRef.current) return;
        scrollIntoViewRespectingMotion(pitchRef.current);
    }, []);
    const scrollToPanel = useCallback(() => {
        if (!isStackedLayout() || !squadRef.current) return;
        scrollIntoViewRespectingMotion(squadRef.current);
    }, []);
    return { pitchRef, squadRef, scrollToPitch, scrollToPanel };
}
