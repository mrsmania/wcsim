import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duelListed } from '../../domain/pvpView';
import type { DuelRow } from '../../domain/pvpWire';
import { RefereeError, readDuels } from '../../state/pvp/referee';
import { myRecord, NO_RECORD, type PvpRecord } from '../../state/pvp/records';
import { onWatchedChange, watchedDuels } from '../../state/pvp/watched';
import { CARD, MONO_CAP, btn } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { DuelLine, RefereeProblem, RoomNote, SectionHead } from './versusUi';

// WHAT VERSUS HAS TO SHOW FOR ITSELF (2026-09-17). The third segment of Records, beside the
// honours ledger and the trophy cabinet, and it is there for the reason those two are: this
// page is what you have DONE, and the versus page is where you go to do something.
//
// IT MOVED RATHER THAN BEING COPIED. Finished matches used to sit at the foot of the versus
// page, which is the list that grows for ever on the one screen whose whole rework was about
// getting the controls above the fold. What stays there is the two lists you can still act
// on - matches waiting on you, and matches where the next move is somebody else's - so a
// result you have not watched is still announced there and in the chrome's strip, and only
// the archive is here. Nothing appears on both pages.
//
// THE RECORD WAS BEING FETCHED AND NOT SHOWN AT ALL for a day, which is what prompted this:
// the versus page's header used to print "3 won, 1 lost" beside your name and the wording
// pass took the line out. The figures are the most record-shaped thing versus produces, so
// this is where they belong.
//
// THIS IS THE FIRST PART OF RECORDS THAT TALKS TO A SERVER. The ledger and the cabinet are
// derived from the career and the album and cannot fail, so they have no loading state and
// no error state; both halves of this one can fail independently, and the rule is the one
// the versus page already keeps - a record is a decoration beside the thing you came to do,
// so a record that will not load says nothing and leaves the results alone. The duels list
// failing is different and is reported, because an empty archive and an unreachable server
// look identical and only one of them means you have played nothing.

/** One figure of the record. `sub` is the word under it, since "12" alone says nothing. */
function Figure({ n, label, hero = false }: { n: number; label: string; hero?: boolean }) {
    return (
        <div
            className={`rounded-[5px] border px-3 py-2.5 ${
                hero ? 'border-pitch-dark bg-pitch-dark text-white' : 'border-line bg-chalk'
            }`}
        >
            <div className="font-mono text-[26px] font-bold leading-none tabular-nums">{n}</div>
            <div className={`${MONO_CAP} mt-1.5 ${hero ? 'text-white/75' : ''}`}>{label}</div>
        </div>
    );
}

export default function VersusRecords() {
    const navigate = useNavigate();
    const [record, setRecord] = useState<PvpRecord>(NO_RECORD);
    const [duels, setDuels] = useState<DuelRow[] | null>(null);
    const [error, setError] = useState<RefereeMessage | null>(null);
    const [watched, setWatched] = useState<ReadonlySet<string>>(watchedDuels);
    useEffect(() => onWatchedChange(setWatched), []);

    const refresh = useCallback(() => {
        // `myRecord` resolves to zeros rather than throwing: an account that has never
        // played has no row in the view, so "nothing there" is the ordinary case.
        void myRecord().then(setRecord);
        void readDuels()
            .then((r) => {
                setDuels(r.duels);
                setError(null);
            })
            .catch((err: unknown) => {
                setDuels([]);
                // ONLY this one refusal means "this server has no duels", and it is not
                // a fault worth a red panel: the feature has not arrived here, and the
                // empty state below is the honest reading. A timeout, a 500 or a session
                // that lapsed all land here too and mean nothing of the sort, which is why
                // they are reported rather than swallowed with it.
                if (err instanceof RefereeError && err.code === 'no-such-route') return;
                setError(refereeMessage(err, 'read your matches'));
            });
    }, []);
    useEffect(refresh, [refresh]);

    // The archive is the finished half, and "finished" is the same partition the versus page
    // makes: a match nobody has watched is WAITING rather than a result, because the score is
    // the thing being withheld and filing it here would give it away in the same breath. It
    // stays on the versus page until it has been watched and lands here afterwards.
    const listed = (duels ?? []).filter(duelListed);
    const played = listed.filter((d) => d.status === 'ended' && watched.has(d.code));

    return (
        <>
            <section>
                <SectionHead title="Your record" />
                <div className={`${CARD} p-4`}>
                    {/* MATCHES WON IS NOT ON HERE, and that is the owner's call
                        (2026-09-18): winning a quarter-final is not an honour, lifting the
                        cup is, and a board on the honours page should only carry the thing
                        worth having. Three figures rather than four, and each answers a
                        different question - how much versus you have played, how often you
                        went out, and what you actually won.

                        LOST STAYS, and it is not the same kind of number as Won was: this
                        is a knockout, so a loss is the match that ENDED a tournament for
                        you, which is a count of how many times you went out rather than a
                        tally of individual games. `record.won` is still read from the
                        server and simply not printed - it costs nothing, it is the same one
                        row, and it is what a ladder reads next. */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <Figure n={record.played} label="Played" hero />
                        <Figure n={record.lost} label="Lost" />
                        <Figure n={record.roomsWon} label="Cups won" />
                    </div>
                    <p className="mt-3 text-[12px] leading-snug text-muted">
                        A cup is a room you took outright: the whole tournament in a room of
                        four or eight, and the match itself in a duel.
                    </p>
                </div>
            </section>

            <section className="mt-[22px]">
                <SectionHead title="Your matches" />
                <div className={`${CARD} p-4`}>
                    {error ? (
                        <RefereeProblem
                            message={error}
                            action={
                                <button className={btn('secondary', 'compact')} onClick={refresh}>
                                    Try again
                                </button>
                            }
                        />
                    ) : duels === null ? (
                        <RoomNote>Looking.</RoomNote>
                    ) : played.length === 0 ? (
                        <RoomNote>
                            Nothing here yet. Matches you have played and watched are kept
                            here; the ones still going on are on the Versus tab.
                        </RoomNote>
                    ) : (
                        <ul>
                            {played.map((d) => (
                                // NO CODE ON A FINISHED ONE, and no fold either: this is the
                                // archive, so the whole of it is the point. The versus page
                                // showed the newest three because it was borrowing room from
                                // the controls above it, and that reason is gone.
                                <DuelLine
                                    key={d.code}
                                    row={d}
                                    watched={watched}
                                    code={false}
                                    // THE ARCHIVE'S OWN DOOR, which is the whole of the
                                    // navigation fix: the same room screen at a Records
                                    // address, so the tab the reader came from stays lit
                                    // and the crumb comes back here.
                                    go={(c) => navigate(`/records/versus/${c}`)}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </section>
        </>
    );
}
