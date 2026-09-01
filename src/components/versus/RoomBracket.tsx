import { useRef } from 'react';
import { Trophy } from 'lucide-react';
import {
    roomBracket,
    roundLabel,
    roundsFor,
    type BracketGame,
    type BracketRound,
    type BracketSeat,
} from '../../domain/pvpView';
import type { RoomView } from '../../domain/pvpWire';
import { confettiBurst } from '../Confetti';
import { CARD_FLAT, MONO_CAP } from '../matchUi';
import { RoomNote } from './versusUi';

// The room's tree: who drew whom, and how far each of them got.
//
// IT IS THE CUP RUN'S OWN BRACKET, down to the stylesheet. A room plays a knockout and the
// game already draws one, so drawing it twice was the mistake: this used to be columns of
// plain cards ending in a "Winner" box, which said the same things in a second visual
// language on a screen reached from the same tab bar. It wears the `bkt-` design now
// (docs/redesign-2026/turf-flat/knockout-bracket.html, mounted by Bracket.tsx for the Cup
// Run): the same match box, the same connectors joining a pair into the round above, the
// same round headings with the one being played in amber, and the same deep green
// champion node with its trophy and its burst of confetti. Only two figures differ and
// both are in the CSS, because a room's tree is 4 or 8 seats rather than 16 and so stands
// shorter and narrower.
//
// WHAT A SEAT HOLDS IS THE ONLY REAL DIFFERENCE, and it is data rather than design: a
// person where the cup has a nation, so a name instead of a flag, a country code, a year
// and a rating chip. The three states are the tree's own - through, out (dimmed and
// struck, which is what this tree has always done and what reads at a glance across eight
// boxes), and not settled yet. The phone layout stacks the two names where the cup's
// stands two country codes side by side, for the reason written over that rule in the CSS.
//
// IT IS ALSO THE DRAW CEREMONY, and that is the whole reason it appears during the draft
// rather than only after it. A room of more than two waits for every draft to finish and
// THEN draws the whole bracket in one go (P47), which buys two things worth having -
// nobody knows who they are facing while they pick, and two people sharing a code cannot
// arrange the tree by agreeing who joins first - at the cost of a wait that a decisive
// player in a room of eight can spend four minutes in. So the tree is on screen through
// that wait with every seat reading "?" and every name in the pot, and it fills in front
// of you the moment the last pick lands. A progress strip would have spent the same
// minutes saying less.
//
// A SCORELINE IS HELD BACK UNTIL ITS OWN REVEAL WINDOW CLOSES, which `roomBracket`
// decides. Every tie of a round is stamped at the same instant and they run for different
// lengths, so without it a player watching their own match would read the result of the
// tie they are about to be shown, printed on the tree beside it. A drawn tie carrying no
// score is one being played, which is exactly what the cup's tree says of its own pending
// round: there is no "Playing" strip on a box any more, and the amber round heading is
// what marks the round the room is in.
//
// A NAME IS SHOWN WHOLE, and the narrow cells truncate it in CSS rather than in code.
// This tree used to print the first word only, on the reasoning that a first word is what
// somebody is called - which is true of `Mario Smania` and of nothing else here. It was
// reported from a room of four with two practice opponents in it: `The Reserves` and
// `The Academy` are both called `The`, so the bracket, the winner box and the pot all
// named the same nobody three times over. A display name is at most `NAME_MAX` characters
// and every bot name is inside that too, so there is nothing here that needs shortening;
// where a box is genuinely too narrow, `.bkt-nm`'s ellipsis says a name was cut and a
// dropped surname says nothing at all.

/** One side of a game: a person, or a seat the draw has not reached yet. */
function Seat({ seat }: { seat: BracketSeat }) {
    if (!seat.userId) {
        return (
            <div className="bkt-seed">
                <span className="bkt-nm bkt-tbd">?</span>
            </div>
        );
    }
    const cls = [
        'bkt-seed',
        seat.won === true ? 'bkt-win' : seat.won === false ? 'bkt-out' : '',
        seat.you ? 'bkt-you' : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <div className={cls}>
            {/* The name truncates and the YOU tag does not: a box too narrow for both must
                lose the end of a name rather than the one word saying it is yours. */}
            <span className="bkt-nm">{seat.name}</span>
            {seat.you && <span className="bkt-you-tag">YOU</span>}
            {seat.goals !== null && <span className="bkt-sc">{seat.goals}</span>}
        </div>
    );
}

/** One game box. `stacked` is the narrow layout, where the box takes a fixed width so the
 *  two halves of the tree line up under one another. */
function Game({ game, stacked = false }: { game: BracketGame; stacked?: boolean }) {
    return (
        <div className={stacked ? 'bkt-match bkt-stack' : 'bkt-match'}>
            <Seat seat={game.home} />
            <Seat seat={game.away} />
        </div>
    );
}

/** The champion node, with the cup's own burst of confetti on hover. */
function Cup({
    name,
    stacked,
}: {
    /** The winner, or null while the room is still being played. */
    name: string | null;
    stacked: boolean;
}) {
    const trophyRef = useRef<HTMLSpanElement>(null);

    const burst = () => {
        const el = trophyRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        confettiBurst(r.left + r.width / 2, r.top + r.height / 2);
    };

    return (
        <div className="bkt-cup bkt-cup-who" onMouseEnter={name ? burst : undefined}>
            <div className="bkt-cup-lbl">{name ? 'Room champion' : 'Champion'}</div>
            <span ref={trophyRef} className="bkt-cup-trophy" aria-hidden>
                <Trophy size={stacked ? 20 : 24} strokeWidth={2} />
            </span>
            <div className="bkt-cup-nm">{name ?? '?'}</div>
        </div>
    );
}

/** The two halves of a round, the top of the tree first. Every round before the final
 *  splits down the middle for the narrow layout, which flows inwards from both ends. */
const halves = (r: BracketRound): [BracketGame[], BracketGame[]] => {
    const half = Math.max(1, Math.floor(r.games.length / 2));
    return [r.games.slice(0, half), r.games.slice(half)];
};

/** One band of the narrow tree: a single game, or a pair joined into the band beyond it.
 *  `sf` is the band next to the centre, whose connector has the final's gap to cross, and
 *  `up` is the bottom half, where the whole tree flows upwards. */
function Band({ games, sf, up }: { games: BracketGame[]; sf: boolean; up: boolean }) {
    const cls = ['bkt-mband', sf ? 'bkt-sf' : '', up ? 'bkt-up' : ''].filter(Boolean).join(' ');
    return (
        <div className={cls}>
            {games.length === 1 ? (
                <Game game={games[0]!} stacked />
            ) : (
                <div className="bkt-vpair">
                    {games.map((g) => (
                        <Game key={g.game} game={g} stacked />
                    ))}
                </div>
            )}
        </div>
    );
}

/** The games of a round, two at a time: a pair is what the connectors join into the one
 *  game above it, and it is the element they are positioned off. */
function pairs(games: BracketGame[]): BracketGame[][] {
    const out: BracketGame[][] = [];
    for (let i = 0; i < games.length; i += 2) out.push(games.slice(i, i + 2));
    return out;
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
        ? (view.members.find((m) => m.userId === view.championId)?.name ?? null)
        : null;
    // Every round but the last feeds the one above it; the last IS the final, which stands
    // on its own beside the cup in both layouts.
    const feeders = rounds.slice(0, -1);
    const final = rounds[rounds.length - 1]!.games[0]!;
    // Which column is live: the round being played, or the champion's once the room is
    // won. Nothing is marked while the draw is still ahead of the room.
    const nowIdx = champion
        ? rounds.length
        : view.status === 'round'
          ? Math.max(0, view.round - 1)
          : -1;

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
                                className="inline-flex max-w-full items-baseline gap-1.5 rounded-[4px] border border-line bg-panel px-2 py-1 text-[12px] font-bold text-ink"
                            >
                                <span className="truncate">{m.name}</span>
                                {m.userId === view.you?.userId && (
                                    <span className="shrink-0 font-mono text-[9px] text-pitch-ink">YOU</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className={`bkt-wrap mt-3 ${view.size >= 8 ? 'bkt-of-8' : 'bkt-of-4'}`}>
                {/* ---- wide: left-to-right ---- */}
                <div className="bkt-scroll bkt-wide">
                    <div className="bkt-heads">
                        {rounds.map((r, i) => (
                            <div key={r.round} className={`bkt-h${i === nowIdx ? ' now' : ''}`}>
                                {r.label}
                            </div>
                        ))}
                        <div className={`bkt-h${nowIdx === rounds.length ? ' now' : ''}`}>
                            Champion
                        </div>
                    </div>
                    <div className="bkt">
                        {feeders.map((r) => (
                            <div className="bkt-round" key={r.round}>
                                {pairs(r.games).map((pv, pi) => (
                                    <div className="bkt-pair" key={pi}>
                                        {pv.map((g) => (
                                            <Game key={g.game} game={g} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}
                        <div className="bkt-round bkt-final">
                            <Game game={final} />
                        </div>
                        <div className="bkt-round bkt-champ">
                            <Cup name={champion} stacked={false} />
                        </div>
                    </div>
                </div>

                {/* ---- narrow: two-sided, converging on the cup ---- */}
                <div className="bkt-narrow">
                    <div className="bkt-mtree">
                        {feeders.map((r, i) => (
                            <Band
                                key={r.round}
                                games={halves(r)[0]}
                                sf={i === feeders.length - 1}
                                up={false}
                            />
                        ))}

                        <div className="bkt-mcenter">
                            <div className="bkt-mfinal">
                                <div className="bkt-mfinal-lbl">Final</div>
                                <Game game={final} stacked />
                            </div>
                            <Cup name={champion} stacked />
                        </div>

                        {[...feeders].reverse().map((r, i) => (
                            <Band key={r.round} games={halves(r)[1]} sf={i === 0} up />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** The label for the round a room is playing right now, for a match card's own heading. */
export const currentRoundLabel = (view: RoomView): string =>
    roundLabel(view.size, Math.max(1, view.round));
