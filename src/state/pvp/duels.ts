// ---------------------------------------------------------------------------
// "Your duels have moved. Ask again."
//
// WHY IT EXISTS. The duels list is read from two places on their own slow beats - the
// versus page every ten seconds, the chrome's strip every thirty - because a duel is
// played over days and nothing in it normally changes while somebody is looking. That is
// right for a duel the OTHER player moves in, and wrong for one THIS player just ended:
// the reported bug was withdrawing from a duel and finding it still under "On now" until
// the page was reloaded.
//
// AND IT IS A RACE, NOT ONLY A LAG. Leaving deliberately does not wait for the referee's
// answer before navigating (`RoomScreen`), so the versus page mounts and reads the list
// while the forfeit is still in flight - and gets the honest pre-forfeit answer back. A
// poll cannot fix that; only asking again once the write has landed can.
//
// SO THE SIGNAL IS FIRED WHEN AN ANSWER LANDS, never when an instruction is sent, and it
// carries nothing. Nothing here computes what the list now says: that is the referee's,
// exactly as it is everywhere else in this feature. This says only that the copy in hand
// is out of date, and both readers go and ask.
// ---------------------------------------------------------------------------

const subs = new Set<() => void>();

/** Something this player did may have changed their duels: re-read the list now. Call it
 *  once the referee has ANSWERED, or the re-read races the write all over again. */
export function duelsChanged(): void {
    for (const s of subs) s();
}

/** Subscribe to it. Both readers of the list do, so the versus page and the chrome's strip
 *  stop disagreeing with the server at the same moment rather than a poll apart. */
export function onDuelsChanged(fn: () => void): () => void {
    subs.add(fn);
    return () => {
        subs.delete(fn);
    };
}
