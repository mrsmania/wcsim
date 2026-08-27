import { getFormation, type FormationName, type Style } from '../../domain/formations';
import { playersOf, viewerTie, xiFrom, type ViewerTie } from '../../domain/pvpView';
import type { MemberView, RoomView } from '../../domain/pvpWire';
import { Banner, CARD_FLAT, MONO_CAP } from '../matchUi';
import XiTable from '../XiTable';
import VersusMatch from './VersusMatch';
import { RoomNote } from './versusUi';

// The result (P38): the score, then BOTH XIs side by side with the ratings revealed.
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
                heading={wonRoom ? 'You won the room' : `${them.name} won the room`}
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

            <VersusMatch
                label="The match"
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
