import { maxMinute } from '../../domain/clock';
import { PVP_SPEED } from '../../domain/pvpRoom';
import { xiStrength } from '../../domain/match';
import type { Player } from '../../data/types';
import type { ViewerTie } from '../../domain/pvpView';
import { useMatchClock, KO_END_HOLD_MS, FT_HOLD_MS } from '../../hooks/useMatchClock';
import { koEndLabel, koFinishedStatus, liveMatchView } from '../matchView';
import { ResultTag } from '../matchUi';
import MatchdayCard from '../MatchdayCard';

// One versus tie, revealed or settled, drawn with the game's own match card.
//
// TWO THINGS MAKE IT THE SAME MATCH FOR BOTH PEOPLE, and both are the server's doing
// (P30). The added time comes with the result rather than being rolled in each browser,
// and the speed is fixed at the room's - in the single-player game it is a personal
// setting spanning five to one, so two people watching the same stored result would
// otherwise see two different lengths and disagree about what happened when.
//
// The tie arrives already turned round so the viewer is the home side (`viewerTie`), which
// is why this can hand a two-sided match to a card written for "you and them".
//
// EXCEPT WHEN NOBODY WATCHING IS IN IT. A knocked-out player stays and watches the rest of
// the tournament (P24), and there the two sides are two other people: the tie is turned
// round for its own HOME player (which is the identity, so nothing is relabelled) and
// `sides` names them both, so the header stops saying "Your XI" and the feed stops tagging
// one of them "You". Whether a side WON is then not a thing to say from the viewer's
// chair either, so the tag reads "Full time" rather than won or lost.

export default function VersusMatch({
    label,
    tie,
    opponentName,
    yourXi,
    theirXi,
    ratings,
    live,
    sides,
    onEnd,
}: {
    label: string;
    tie: ViewerTie;
    opponentName: string;
    yourXi: Player[];
    /** Empty until their tie has been played, which is exactly when this is shown. */
    theirXi: Player[];
    /** Whether the two rating chips are shown. False while a hidden-ratings room is still
     *  playing; true at the whistle, where the numbers come back (P38). */
    ratings: boolean;
    /** Reveal it minute by minute, rather than showing the settled result. */
    live: boolean;
    /** The two names, for when NEITHER side is the viewer's (P24). See the header. */
    sides?: { user: string; opp: string };
    onEnd: () => void;
}) {
    const decided = tie.decided ?? 'reg';
    const liveMax = maxMinute(decided);
    // Undefined omits the chip entirely rather than blanking it, which is what
    // `FixtureHead` already does for a side whose rating is unknown.
    const yourRating = ratings && yourXi.length ? xiStrength(yourXi).overall : undefined;
    const theirRating = ratings && theirXi.length ? xiStrength(theirXi).overall : undefined;
    return live ? (
        <Live
            label={label}
            tie={tie}
            opponentName={opponentName}
            liveMax={liveMax}
            yourRating={yourRating}
            theirRating={theirRating}
            sides={sides}
            onEnd={onEnd}
        />
    ) : (
        <MatchdayCard
            label={label}
            tag={
                sides ? (
                    <ResultTag kind="next" label={tie.won === null ? 'Playing' : 'Full time'} />
                ) : (
                    <ResultTag
                        kind={tie.won === null ? 'next' : tie.won ? 'w' : 'l'}
                        label={tie.won === null ? 'Playing' : tie.won ? 'Won' : 'Lost'}
                    />
                )
            }
            userRating={yourRating}
            oppName={opponentName}
            sides={sides}
            // No code and no year: the other side is a person, and a three-letter code
            // derived from a name would fly whatever country's flag it collided with.
            oppCode=""
            oppRating={theirRating}
            view={liveMatchView({
                playing: false,
                liveMinute: liveMax,
                liveMax,
                clockLabel: '',
                finished: {
                    userGoals: tie.yourGoals ?? 0,
                    oppGoals: tie.theirGoals ?? 0,
                    ...koFinishedStatus(decided),
                    events: tie.events,
                },
            })}
            playing={false}
            clockLabel=""
            penKicks={decided === 'pens' ? (tie.pens?.kicks ?? undefined) : undefined}
            penShown={tie.pens?.kicks.length ?? 0}
            showShootout={decided === 'pens'}
        />
    );
}

/** The reveal. Its own component so the clock hook mounts with the match and not with
 *  the screen: the card above it is the settled one, and mounting a clock for that would
 *  hold the navigation inert over a result nobody is watching. */
function Live({
    label,
    tie,
    opponentName,
    liveMax,
    yourRating,
    theirRating,
    sides,
    onEnd,
}: {
    label: string;
    tie: ViewerTie;
    opponentName: string;
    liveMax: number;
    yourRating?: number;
    theirRating?: number;
    sides?: { user: string; opp: string };
    onEnd: () => void;
}) {
    const decided = tie.decided ?? 'reg';
    const penKicks = decided === 'pens' ? tie.pens?.kicks : undefined;
    const { liveMinute, clockLabel, penShown } = useMatchClock({
        speed: PVP_SPEED,
        maxMinute: liveMax,
        stoppage: tie.stoppage ?? undefined,
        endLabel: koEndLabel(decided),
        penKicks,
        endHoldMs: decided === 'reg' ? FT_HOLD_MS : KO_END_HOLD_MS,
        onEnd,
    });
    return (
        <MatchdayCard
            label={label}
            tag={<ResultTag kind="next" label="Live now" />}
            userRating={yourRating}
            oppName={opponentName}
            oppCode=""
            sides={sides}
            oppRating={theirRating}
            view={liveMatchView({
                playing: true,
                liveMinute,
                liveMax,
                clockLabel,
                playingEvents: tie.events,
            })}
            playing
            clockLabel={clockLabel}
            penKicks={penKicks}
            penShown={penShown}
            showShootout={!!penKicks && liveMinute >= liveMax}
        />
    );
}
