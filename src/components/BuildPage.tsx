import type { MutableRefObject, ReactNode } from 'react';
import { PAGE_EYEBROW } from './matchUi';

/** The build page's section header and its three-column layout (hygiene H84).
 *
 *  It takes the three areas as nodes rather than the panels' props: which panel shows and
 *  what it is fed is composition, and belongs where the state is. What lives HERE is
 *  everything the layout decides - the breakpoints, the grid areas, the order the areas
 *  restack in on a phone, the scroll anchors the mobile dance needs, and the placeholder
 *  while the formations load. */
export default function BuildPage({
    eyebrow,
    title,
    panelRef,
    boardRef,
    panel,
    board,
    stack,
}: {
    /** The section header, derived from the build's sub-view. */
    eyebrow: string;
    title: string;
    /** The source panel's scroll anchor, and the board's (hooks/useStackedScroll). */
    panelRef: MutableRefObject<HTMLElement | null>;
    boardRef: MutableRefObject<HTMLDivElement | null>;
    /** Whichever of setup / drawn squad / market / complete is showing. */
    panel: ReactNode;
    /** The pitch. Null until the formations have loaded, which is what the dashed
     *  placeholder is for. */
    board: ReactNode;
    /** Ratings, chemistry and the line-up sheet. Null alongside a null board. */
    stack: ReactNode;
}) {
    return (
        <>
            <div className="mb-5 mt-7 flex items-center gap-4">
                <div>
                    <div className={PAGE_EYEBROW}>{eyebrow}</div>
                    <h2 className="mt-0.5 font-display text-3xl font-extrabold leading-none tracking-[-0.02em]">
                        {title}
                    </h2>
                </div>
                <div className="relative h-0 flex-1 border-t-2 border-line">
                    <span className="absolute -top-[5px] left-0 h-2 w-2 rounded-full border-2 border-line bg-panel" />
                </div>
            </div>
            {/* One column below 760, two to 1080, three above; the source panel (setup /
                drawn squad / market / complete) is always FIRST on a phone, then the
                pitch, then the ratings.
                The tabs navigation briefly put the pitch first (item 27's decision D, on
                the reasoning that the thing you tap was sandwiched between the panel you
                pick from and the ratings you check). Reverted 2026-08-21: that problem was
                already solved by motion rather than by order - picking a player scrolls
                the pitch up, placing him scrolls the panel back - and pitch-first breaks
                the pairing, because scrolling "to the pitch" is a no-op when the pitch is
                already at the top and the return scroll then travels the wrong way. */}
            <div className="grid items-start gap-[22px] [grid-template-areas:'sum'_'board'_'stack'] [grid-template-columns:1fr] min-[760px]:[grid-template-areas:'sum_stack'_'board_board'] min-[760px]:[grid-template-columns:1fr_1fr] min-[1080px]:[grid-template-areas:'sum_board_stack'] min-[1080px]:[grid-template-columns:300px_minmax(0,1fr)_320px]">
                {/* Col 1: setup -> drawn squad or market -> complete */}
                <aside ref={panelRef} className="scroll-mt-6 [grid-area:sum]">
                    {panel}
                </aside>

                {/* Col 2: the pitch. Col 3: ratings + chemistry + line-up sheet stacked,
                    matching the turf-flat comp. On narrow widths the grid areas restack to
                    the panel, the pitch, then the stack. */}
                {board ? (
                    <>
                        <section ref={boardRef} className="scroll-mt-6 [grid-area:board]">
                            {board}
                        </section>
                        <section className="flex flex-col gap-[18px] [grid-area:stack]">
                            {stack}
                        </section>
                    </>
                ) : (
                    <div className="mx-auto flex aspect-[3/4] w-full max-w-[560px] items-center justify-center rounded-md border border-dashed border-line text-muted [grid-area:board]">
                        Loading formations…
                    </div>
                )}
            </div>
        </>
    );
}
