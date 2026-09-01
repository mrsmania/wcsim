import { getFormation, type FormationName, type Style } from '../../domain/formations';
import {
    playersOf,
    roundLabel,
    roundsFor,
    viewerTie,
    xiFrom,
    type ViewerTie,
} from '../../domain/pvpView';
import type { MemberView, RoomView } from '../../domain/pvpWire';
import { Banner, CARD_FLAT, MONO_CAP } from '../matchUi';
import XiTable from '../XiTable';
import VersusMatch from './VersusMatch';
import { RoomNote } from './versusUi';

// The result (P38): the score, then BOTH XIs side by side with the ratings revealed.
//
// THE MATCH IT SHOWS IS THE ONE THAT ENDED YOUR OWN RUN, which in a room of two is also the
// one that decided the room and in a room of eight usually is not: `decidingTie` reads the
// last tie the viewer PLAYED, so a quarter-final loser gets their quarter-final and the two
// XIs that played it, while the room's winner is named from `championId`.
//
// It was the thinnest thing in the plan and it is the whole reward, because nothing else
// is at stake (P9). In a room where ratings were hidden it is also the only way to learn
// whether you misjudged a player or the dice fell badly, which is the question that
// switch exists to make interesting - so the numbers come back at the whistle whatever
// the room was playing under.

const EMPTY: Set<string> = new Set();

function XiOf({
    member,
    ids,
    heading,
}: {
    member: MemberView;
    ids: Record<string, string>;
    heading: string;
}) {
    const formation = getFormation(
        (member.formationName as FormationName) ?? '4-3-3',
        (member.style as Style) ?? 'bal',
    );
    if (!formation) return null;
    return (
        <div>
            <div className={MONO_CAP}>{heading}</div>
            <div className="mt-0.5 mb-2 text-[15px] font-extrabold text-ink">
                {member.name}
                <span className="ml-2 font-mono text-[11px] font-medium text-muted">
                    {formation.name}
                </span>
            </div>
            {/* Explicit rather than defaulted: at the whistle the numbers come back
                whatever the room was played under (P38), and that is a decision worth
                seeing at the call site. */}
            <XiTable
                formation={formation}
                filled={xiFrom(formation, ids)}
                ratings
                collectibles={false}
                ownedStickerIds={EMPTY}
            />
        </div>
    );
}

export default function RoomResult({
    view,
    tie,
    you,
    them,
}: {
    view: RoomView;
    /** The tie that ended it, from where the viewer is sitting. */
    tie: ViewerTie;
    you: MemberView;
    them: MemberView;
}) {
    const wonRoom = view.championId === you.userId;
    // Who actually won the ROOM, which in anything bigger than two is not the person who
    // beat you: read it off the champion rather than off the opponent in front of you.
    const champion = view.members.find((m) => m.userId === view.championId) ?? null;
    const yourIds = view.you?.xi ?? {};
    const theirIds = view.revealed[them.userId] ?? {};
    const yourFormation = getFormation(
        (you.formationName as FormationName) ?? '4-3-3',
        (you.style as Style) ?? 'bal',
    );
    const theirFormation = getFormation(
        (them.formationName as FormationName) ?? '4-3-3',
        (them.style as Style) ?? 'bal',
    );

    return (
        <div className="flex flex-col gap-[18px]">
            <Banner
                champion={wonRoom}
                eyebrow="Full time"
                heading={
                    wonRoom
                        ? 'You won the room'
                        : champion
                          ? `${champion.name} won the room`
                          : 'The room is finished'
                }
                body={
                    tie.yourGoals === null
                        ? undefined
                        : `${tie.yourGoals}-${tie.theirGoals}${
                              tie.decided === 'pens'
                                  ? ` on penalties (${tie.pens?.home ?? 0}-${tie.pens?.away ?? 0})`
                                  : tie.decided === 'aet'
                                    ? ' after extra time'
                                    : ''
                          }`
                }
            />

            {/* In a room of more than two the scoreline above is YOUR last match and the
                name is whoever won the whole thing, so which round yours ended in is the
                line that joins them up. A room of two has one match and needs no such
                sentence. */}
            {roundsFor(view.size) > 1 && !wonRoom && (
                <div className={`${CARD_FLAT} px-4 py-3`}>
                    <RoomNote>
                        Your run ended in the{' '}
                        {roundLabel(view.size, you.outIn ?? view.round).toLowerCase()}, against{' '}
                        {them.name}.
                    </RoomNote>
                </div>
            )}

            <VersusMatch
                label={
                    roundsFor(view.size) > 1
                        ? roundLabel(view.size, you.outIn ?? view.round)
                        : 'The match'
                }
                tie={tie}
                opponentName={them.name}
                yourXi={yourFormation ? playersOf(yourFormation, xiFrom(yourFormation, yourIds)) : []}
                theirXi={
                    theirFormation ? playersOf(theirFormation, xiFrom(theirFormation, theirIds)) : []
                }
                live={false}
                // The numbers come back at the whistle whatever the room was played
                // under (P38), which is what `roomDisplay` says for an ended room.
                ratings
                onEnd={() => undefined}
            />

            <div className={`${CARD_FLAT} p-4`}>
                <RoomNote>
                    Both teams, with the ratings. Nothing was at stake but the result, so
                    this is the reward: see where it was won.
                </RoomNote>
                <div className="mt-4 grid gap-5 min-[860px]:grid-cols-2">
                    <XiOf member={you} ids={yourIds} heading="Your XI" />
                    <XiOf member={them} ids={theirIds} heading="Their XI" />
                </div>
            </div>
        </div>
    );
}

/** The tie a finished room is about, from the viewer's side. Exported so the room screen
 *  can decide what to render without re-deriving which tie mattered. */
export function decidingTie(view: RoomView): ViewerTie | null {
    const id = view.you?.userId;
    if (!id) return null;
    const played = view.ties.filter((t) => t.decided !== null && (t.homeId === id || t.awayId === id));
    const last = played[played.length - 1];
    return last ? viewerTie(last, id) : null;
}
