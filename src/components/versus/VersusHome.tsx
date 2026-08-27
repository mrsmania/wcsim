import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import { offersRatingSwitch } from '../../domain/pvpView';
import { useHeldVersusRoom } from '../../nav/versusRoom';
import { createRoom } from '../../state/pvp/referee';
import { CARD, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN, StageHeader } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// The way in: make a room, or type the code somebody gave you.
//
// TWO KINDS OF ROOM NOW: buy an XI from a shared budget, or roll random squads and pick
// from what you are dealt. Both private, two players, twenty seconds a pick. The referee
// has taken every other combination since wave 3 - public rooms, four and eight players, a
// thirty-second clock - and each is a later wave with a screen of its own to answer for it.
// Offering a control the room cannot yet show properly is worse than not offering it.
//
// THE RATINGS SWITCH IS OFFERED FOR A ROLL ROOM AND NOT FOR A BUDGET ONE (P5), and the
// reason is not squeamishness: a budget room shows a price computed straight from the
// rating it would be hiding, so the switch would hide nothing. That was P14, and it is
// void because the two can no longer co-occur. `offersRatingSwitch` is that rule, shared
// with the checks.
//
// WRITTEN IN OUTCOMES, NOT SETTINGS (plan section 8). "$110 buys about one 99-rated star
// and ten players around 80" is a sentence somebody can act on; "budget: 110" is not, and
// a player can arrive here having never built an XI, since the mode is deliberately
// independent of the career.

/** The budgets on offer, and what each one buys. The referee allows $70 to $200 in any
 *  step; three named choices are what a room needs, and the third is the one that makes
 *  the price curve bite. */
const BUDGETS = [
    { value: 90, label: '$90', sub: 'Tight. One star at most, and the rest is bargains.' },
    { value: 110, label: '$110', sub: 'The standard. About one 99 and ten players near 80.' },
    { value: 150, label: '$150', sub: 'Generous. Two or three genuine greats.' },
];

/** How many re-rolls a roll room allows. Named in outcomes: what the number MEANS is how
 *  often you can refuse a squad you were dealt. */
const REROLLS = [
    { value: 0, label: 'None', sub: 'Take what you are dealt, every time.' },
    { value: 3, label: 'Three', sub: 'Enough to refuse a squad with nobody you need.' },
    { value: 6, label: 'Six', sub: 'Generous. You will nearly always get a shape you want.' },
];

/** One row of choices, each a name and a sentence about what it does to the game. */
function Choice<T extends number | string>({
    label,
    options,
    value,
    onPick,
}: {
    label: string;
    options: readonly { value: T; label: string; sub: string }[];
    value: T;
    onPick: (v: T) => void;
}) {
    return (
        <>
            <div className={`${MONO_CAP} mt-4`}>{label}</div>
            <div className="mt-1.5 flex flex-col gap-1.5">
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        onClick={() => onPick(o.value)}
                        className={`rounded-[5px] border px-3 py-2 text-left transition ${
                            o.value === value
                                ? 'border-pitch bg-pitch/10'
                                : 'border-line bg-panel hover:border-pitch'
                        }`}
                    >
                        <span className="font-mono text-[13px] font-bold text-ink">{o.label}</span>
                        <span className="ml-2 text-[12px] text-muted">{o.sub}</span>
                    </button>
                ))}
            </div>
        </>
    );
}

export default function VersusHome() {
    const navigate = useNavigate();
    const held = useHeldVersusRoom();
    const [method, setMethod] = useState<'budget' | 'roll'>('budget');
    const [budget, setBudget] = useState(110);
    const [rerolls, setRerolls] = useState(3);
    const [showRatings, setShowRatings] = useState(true);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);

    const make = () => {
        setBusy(true);
        setError(null);
        void createRoom({
            visibility: 'private',
            size: 2,
            method,
            budget,
            rerolls,
            // The referee forces this true for a budget room regardless (P5); sending the
            // honest value rather than a hopeful one keeps the two sides agreeing.
            showRatings: offersRatingSwitch(method) ? showRatings : true,
            // Every tournament. Empty means all, exactly as the pool setting does - never
            // a literal list of every current year, which is the bug that once hid a
            // whole World Cup from every existing save.
            years: [],
            pickSeconds: 20,
        })
            .then((room) => navigate(`/versus/${room.code}`))
            .catch((err: unknown) => {
                setBusy(false);
                // Whatever the referee said, said back. The old version of this replaced
                // every refusal with one sentence, which was true of a wrong sign-in
                // secret, a name the server cannot read, and a database error alike.
                setError(refereeMessage(err, 'open a room'));
            });
    };

    const join = (e: React.FormEvent) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        if (c.length >= 4) navigate(`/versus/${c}`);
    };

    return (
        <>
            <StageHeader eyebrow="Versus" title="Play somebody" />

            {held && (
                <div className={`${CARD} mb-[18px] flex flex-wrap items-center gap-3 p-4`}>
                    <div className="min-w-0 flex-1">
                        <div className={MONO_CAP}>You are in a room</div>
                        <RoomNote>
                            {held.code} &middot; {held.status === 'lobby' ? 'waiting to start' : 'in progress'}
                        </RoomNote>
                    </div>
                    <button className={PRIMARY_BTN} onClick={() => navigate(`/versus/${held.code}`)}>
                        Back to it
                    </button>
                </div>
            )}

            <div className="grid items-start gap-[22px] min-[860px]:grid-cols-2">
                <div className={`${CARD} p-4`}>
                    <div className={MONO_CAP}>Make a room</div>
                    <RoomNote>
                        You and one other person each put together an XI out of all{' '}
                        {WORLD_CUP_YEARS.length} World Cups, twenty seconds a pick. Then the two
                        teams play. Your career, your album and your perks stay out of it
                        entirely: it is eleven players against eleven players.
                    </RoomNote>

                    <Choice
                        label="How you get your players"
                        value={method}
                        onPick={setMethod}
                        options={[
                            {
                                value: 'budget' as const,
                                label: 'Buy them',
                                sub: 'Shop the whole dataset against a budget. Skill is knowing what a player is worth.',
                            },
                            {
                                value: 'roll' as const,
                                label: 'Roll for them',
                                sub: 'Random squads, one at a time, pick one man from each. Skill is knowing who to take.',
                            },
                        ]}
                    />

                    {method === 'budget' ? (
                        <Choice
                            label="How much each"
                            value={budget}
                            onPick={setBudget}
                            options={BUDGETS}
                        />
                    ) : (
                        <>
                            <Choice
                                label="Re-rolls each"
                                value={rerolls}
                                onPick={setRerolls}
                                options={REROLLS}
                            />
                            {/* P40: this is a HOUSE RULE and the copy says so. The app ships
                                a squad browser whose whole purpose is to expose every rating,
                                and a second tab defeats it completely. It hides the numbers
                                on the room's own screens, which is worth having and is all it
                                claims. */}
                            <div className={`${MONO_CAP} mt-4`}>The numbers</div>
                            <div className="mt-1.5 flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setShowRatings(true)}
                                    className={`rounded-[5px] border px-3 py-2 text-left transition ${
                                        showRatings
                                            ? 'border-pitch bg-pitch/10'
                                            : 'border-line bg-panel hover:border-pitch'
                                    }`}
                                >
                                    <span className="font-mono text-[13px] font-bold text-ink">
                                        Ratings on
                                    </span>
                                    <span className="ml-2 text-[12px] text-muted">
                                        You both see what everybody is rated.
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowRatings(false)}
                                    className={`rounded-[5px] border px-3 py-2 text-left transition ${
                                        !showRatings
                                            ? 'border-pitch bg-pitch/10'
                                            : 'border-line bg-panel hover:border-pitch'
                                    }`}
                                >
                                    <span className="font-mono text-[13px] font-bold text-ink">
                                        Ratings hidden
                                    </span>
                                    <span className="ml-2 text-[12px] text-muted">
                                        Pick on the name and the year. The numbers come back at
                                        the whistle.
                                    </span>
                                </button>
                            </div>
                            {!showRatings && (
                                <RoomNote>
                                    <span className="mt-2 block">
                                        It is a house rule, not a lock: the Squads tab exists to
                                        show ratings, so a second tab defeats it. Agree not to,
                                        and it makes the draft a genuine judgement.
                                    </span>
                                </RoomNote>
                            )}
                        </>
                    )}

                    <button className={`${PRIMARY_BTN} mt-4 w-full`} disabled={busy} onClick={make}>
                        Open a room
                    </button>
                    <RoomNote>
                        <span className="mt-2 block">
                            You get a six-character code. Send it to whoever you want to play.
                        </span>
                    </RoomNote>
                    {error && <RefereeProblem message={error} />}
                </div>

                <form className={`${CARD} p-4`} onSubmit={join}>
                    <div className={MONO_CAP}>Join with a code</div>
                    <RoomNote>Somebody sent you six characters. Put them in.</RoomNote>
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="ABC234"
                        aria-label="Room code"
                        className="mt-3 w-full rounded-[5px] border border-line bg-ground px-3 py-2.5 text-center font-mono text-[20px] font-bold tracking-[0.3em] text-ink outline-none focus:border-pitch"
                    />
                    <button className={`${SECONDARY_BTN} mt-3 w-full`} disabled={code.trim().length < 4}>
                        Go to the room
                    </button>
                </form>
            </div>
        </>
    );
}
