import { Trophy } from 'lucide-react';
import {
    gamesIn,
    roomBracket,
    roundLabel,
    roundsFor,
    type BracketGame,
    type BracketSeat,
} from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { CARD_FLAT, MONO_CAP } from '../matchUi';
import { RoomNote } from './versusUi';

// The room's tree: who drew whom, and how far each of them got.
//
// IT IS ALSO THE DRAW CEREMONY, and that is the whole reason it appears during the draft
// rather than only after it. A room of more than two waits for every draft to finish and
// THEN draws the whole bracket in one go (P47), which buys two things worth having -
// nobody knows who they are facing while they pick, and two people sharing a code cannot
// arrange the tree by agreeing who joins first - at the cost of a wait that a decisive
// player in a room of eight can spend four minutes in. So the tree is on screen through
// that wait with every seat empty and every name in the pot, and it fills in front of you
// the moment the last pick lands. A progress strip would have spent the same minutes
// saying less.
//
// A SCORELINE IS HELD BACK UNTIL ITS OWN REVEAL WINDOW CLOSES, which `roomBracket`
// decides. Every tie of a round is stamped at the same instant and they run for different
// lengths, so without it a player watching their own match would read the result of the
// tie they are about to be shown, printed on the tree beside it.

/** Names are people's, not nations', and they sit in a narrow cell. The first word is
 *  what somebody is called; the rest is what makes it not fit. */
export const shortName = (name: string): string => (name.split(/\s+/)[0] ?? name).slice(0, 10);

function Seat({ seat }: { seat: BracketSeat }) {
    if (!seat.userId) {
        return (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="font-mono text-[11px] text-dim">Not drawn</span>
            </div>
        );
    }
    // Out is dimmed rather than struck through or reddened: the tree already says who went
    // on, and a field of red over half of it is the thing the challenge ledger's rule
    // exists to avoid.
    const tone = seat.won === false ? 'text-dim' : 'text-ink';
    return (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className={`min-w-0 truncate text-[12.5px] font-bold ${tone}`}>
                {shortName(seat.name)}
                {seat.you && <span className="ml-1.5 font-mono text-[9px] text-pitch-ink">YOU</span>}
            </span>
            <span
                className={`shrink-0 font-mono text-[12.5px] font-bold tabular-nums ${
                    seat.won ? 'text-ink' : 'text-dim'
                }`}
            >
                {seat.goals ?? '–'}
            </span>
        </div>
    );
}

function Game({ game }: { game: BracketGame }) {
    return (
        <div
            className={`overflow-hidden rounded-[5px] border bg-panel ${
                game.yours ? 'border-pitch' : 'border-line'
            }`}
        >
            <Seat seat={game.home} />
            <div className="border-t border-hair" />
            <Seat seat={game.away} />
            {game.live && (
                <div className="border-t border-hair bg-amber/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-amber-ink">
                    Playing
                </div>
            )}
        </div>
    );
}

export default function RoomBracket({
    view,
    /** The server's own clock, which is what decides whether a scoreline is public yet. */
    serverNow,
}: {
    view: RoomView;
    serverNow: number;
}) {
    const rounds = roomBracket(view, serverNow);
    // A room of two has one game and no tree to draw: the match card below says everything
    // this would, and a bracket of one box beside it is furniture.
    if (roundsFor(view.size) < 2) return null;
    const undrawn = rounds.every((r) => !r.drawn);
    const champion = view.championId
        ? view.members.find((m) => m.userId === view.championId)
        : undefined;

    return (
        <div className={`${CARD_FLAT} p-4`}>
            <div className={MONO_CAP}>{undrawn ? 'The draw' : 'The bracket'}</div>
            {undrawn ? (
                <RoomNote>
                    Every XI is finished first and then the whole tree is drawn at once, so
                    nobody knows who they are facing while they pick.
                </RoomNote>
            ) : (
                <RoomNote>
                    Drawn at random. A score appears when that match finishes.
                </RoomNote>
            )}

            {undrawn && (
                <div className="mt-3">
                    <div className={MONO_CAP}>In the pot</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {view.members.map((m) => (
                            <span
                                key={m.userId}
                                className="rounded-[4px] border border-line bg-panel px-2 py-1 text-[12px] font-bold text-ink"
                            >
                                {shortName(m.name)}
                                {m.userId === view.you?.userId && (
                                    <span className="ml-1.5 font-mono text-[9px] text-pitch-ink">YOU</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-3 grid gap-3 min-[700px]:grid-flow-col min-[700px]:auto-cols-fr">
                {rounds.map((r) => (
                    <div key={r.round}>
                        <div className={MONO_CAP}>
                            {r.label}
                            {gamesIn(view.size, r.round) > 1 && (
                                <span className="ml-1.5 text-dim">
                                    {gamesIn(view.size, r.round)} games
                                </span>
                            )}
                        </div>
                        <div className="mt-1.5 flex flex-col gap-2">
                            {r.games.map((g) => (
                                <Game key={g.game} game={g} />
                            ))}
                        </div>
                    </div>
                ))}
                <div>
                    <div className={MONO_CAP}>Winner</div>
                    <div
                        className={`mt-1.5 flex items-center gap-2 rounded-[5px] border px-2 py-2.5 ${
                            champion
                                ? 'border-pitch bg-pitch/10'
                                : 'border-line border-dashed bg-panel'
                        }`}
                    >
                        <Trophy
                            size={15}
                            className={champion ? 'text-amber-ink' : 'text-dim'}
                            strokeWidth={2.5}
                        />
                        <span
                            className={`min-w-0 truncate text-[12.5px] font-bold ${
                                champion ? 'text-ink' : 'text-dim'
                            }`}
                        >
                            {champion ? shortName(champion.name) : 'To be won'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** The label for the round a room is playing right now, for a match card's own heading. */
export const currentRoundLabel = (view: RoomView): string =>
    roundLabel(view.size, Math.max(1, view.round));
