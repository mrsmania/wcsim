import { useState } from 'react';
import {
    FORMATIONS_DATA,
    STYLES,
    STYLE_LABEL,
    getFormation,
    type FormationName,
    type Style,
} from '../../domain/formations';
import type { RoomView } from '../../domain/pvpWire';
import type { VersusRoom } from '../../hooks/useVersusRoom';
import { CARD, CHIP_OFF, CHIP_ON, MONO_CAP, PRIMARY_BTN, SECONDARY_BTN } from '../matchUi';
import { ReadyMark, RoomCode, RoomNote, SeatRow } from './versusUi';

// The lobby: who is here, what shape you are playing, and the host's Start.
//
// FORMATION AND STYLE ARE CHOSEN HERE (P19) because they shape all eleven picks, and the
// clock should only ever cover picking players. They are also the reason a lobby cannot
// simply show everybody's row: your shape is yours until the room starts, or the last
// person to choose could counter everyone else.
//
// READY IS A SIGNAL, NOT A LOCK (P48). The host may start a full room whoever has
// pressed it, and anybody who has not is given an ordinary 4-3-3; you can change your
// shape right up to the start. Nobody can hold a room by wandering off, and it needs no
// second clock.

export default function RoomLobby({ view, room }: { view: RoomView; room: VersusRoom }) {
    const me = view.members.find((m) => m.userId === view.you?.userId) ?? null;
    const [name, setName] = useState<FormationName>(
        (me?.formationName as FormationName) || '4-3-3',
    );
    const [style, setStyle] = useState<Style>((me?.style as Style) || 'bal');
    const [busy, setBusy] = useState(false);
    const isHost = view.hostId === view.you?.userId;
    const full = view.members.length >= view.size;
    const styles = FORMATIONS_DATA.stylesByName[name] ?? STYLES;
    const shapeOk = !!getFormation(name, style);

    const send = (ready: boolean) => {
        setBusy(true);
        void room.ready(name, style, ready).finally(() => setBusy(false));
    };

    return (
        <div className="grid items-start gap-[22px] min-[860px]:grid-cols-[minmax(0,1fr)_320px]">
            <div className={`${CARD} p-4`}>
                <div className={MONO_CAP}>Your shape</div>
                <RoomNote>
                    Pick it now: the clock only ever covers picking players.
                </RoomNote>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {FORMATIONS_DATA.names.map((n) => (
                        <button
                            key={n}
                            onClick={() => setName(n)}
                            className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition ${
                                n === name ? CHIP_ON : CHIP_OFF
                            }`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {STYLES.map((s) => {
                        const enabled = styles.includes(s);
                        return (
                            <button
                                key={s}
                                disabled={!enabled}
                                onClick={() => setStyle(s)}
                                className={`rounded-[5px] border px-2.5 py-1.5 text-[12px] font-bold transition ${
                                    s === style ? CHIP_ON : CHIP_OFF
                                } ${enabled ? '' : 'cursor-not-allowed opacity-40'}`}
                            >
                                {STYLE_LABEL[s]}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        className={PRIMARY_BTN}
                        disabled={busy || !shapeOk}
                        onClick={() => send(true)}
                    >
                        {me?.ready ? 'Change my shape' : "I'm ready"}
                    </button>
                    {me?.ready && (
                        <button className={SECONDARY_BTN} disabled={busy} onClick={() => send(false)}>
                            Not yet
                        </button>
                    )}
                </div>
            </div>

            <div className={`${CARD} p-4`}>
                <div className={MONO_CAP}>Room code</div>
                <div className="mt-1.5">
                    <RoomCode code={view.code} />
                </div>
                <RoomNote>
                    {view.visibility === 'private'
                        ? 'Private: give this to the person you want to play.'
                        : 'Anybody signed in can join with this.'}
                </RoomNote>

                <div className={`${MONO_CAP} mt-4`}>
                    {view.members.length} of {view.size} here
                </div>
                <ul className="mt-1">
                    {view.members.map((m) => (
                        <SeatRow
                            key={m.userId}
                            member={m}
                            you={m.userId === view.you?.userId}
                            host={m.userId === view.hostId}
                            detail={<ReadyMark ready={m.ready} />}
                        />
                    ))}
                </ul>

                <div className={`${MONO_CAP} mt-4`}>The rules</div>
                <RoomNote>
                    {view.rules.method === 'budget'
                        ? `Buy an XI with $${view.rules.budget}, out of every World Cup, ${view.pickSeconds} seconds a pick.`
                        : `Roll random squads and pick one man from each, ${view.rerolls} re-roll${
                              view.rerolls === 1 ? '' : 's'
                          } each, ${view.pickSeconds} seconds a pick.`}{' '}
                    No boosts, no perks and no chemistry: eleven players against eleven.
                </RoomNote>
                {!view.showRatings && (
                    <RoomNote>
                        <span className="mt-1.5 block font-semibold text-amber-ink">
                            Ratings are hidden in this room. You pick on the name and the year;
                            the numbers come back at the whistle.
                        </span>
                    </RoomNote>
                )}

                {isHost ? (
                    <button
                        className={`${PRIMARY_BTN} mt-4 w-full`}
                        disabled={!full || busy}
                        onClick={() => {
                            setBusy(true);
                            void room.start().finally(() => setBusy(false));
                        }}
                    >
                        {full ? 'Start the draft' : `Waiting for ${view.size - view.members.length} more`}
                    </button>
                ) : (
                    <RoomNote>
                        <span className="mt-4 block">
                            {full
                                ? 'Everyone is here. The host starts it.'
                                : 'Waiting for the room to fill.'}
                        </span>
                    </RoomNote>
                )}
            </div>
        </div>
    );
}
