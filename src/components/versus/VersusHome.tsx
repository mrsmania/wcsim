import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORLD_CUP_YEARS } from '../../data/squads';
import { useHeldVersusRoom } from '../../nav/versusRoom';
import { createRoom } from '../../state/pvp/referee';
import { CARD, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN, StageHeader } from '../matchUi';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// The way in: make a room, or type the code somebody gave you.
//
// WAVE 5 IS ONE KIND OF ROOM: private, two players, buy from a budget, twenty seconds a
// pick. The referee has taken every other combination since wave 3 - public rooms, four
// and eight players, rolled squads, hidden ratings, a thirty-second clock - and each is
// a later wave with a screen of its own to answer for it. Offering a control the room
// cannot yet show properly is worse than not offering it.
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

export default function VersusHome() {
    const navigate = useNavigate();
    const held = useHeldVersusRoom();
    const [budget, setBudget] = useState(110);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);

    const make = () => {
        setBusy(true);
        setError(null);
        void createRoom({
            visibility: 'private',
            size: 2,
            method: 'budget',
            budget,
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
                        You and one other person each buy an XI from the same money, out of
                        all {WORLD_CUP_YEARS.length} World Cups, twenty seconds a pick. Then the
                        two teams play. Your career, your album and your perks stay out of it
                        entirely: it is eleven players against eleven players.
                    </RoomNote>

                    <div className={`${MONO_CAP} mt-4`}>How much each</div>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                        {BUDGETS.map((b) => (
                            <button
                                key={b.value}
                                onClick={() => setBudget(b.value)}
                                className={`rounded-[5px] border px-3 py-2 text-left transition ${
                                    b.value === budget
                                        ? 'border-pitch bg-pitch/10'
                                        : 'border-line bg-panel hover:border-pitch'
                                }`}
                            >
                                <span className="font-mono text-[13px] font-bold text-ink">
                                    {b.label}
                                </span>
                                <span className="ml-2 text-[12px] text-muted">{b.sub}</span>
                            </button>
                        ))}
                    </div>

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
