import {
    FORMATIONS_DATA,
    STYLES,
    STYLE_LABEL,
    getFormation,
    type FormationName,
    type Style,
} from '../../domain/formations';
import Pitch from '../Pitch';
import { CHIP_OFF, CHIP_ON } from '../matchUi';
import { RoomNote } from './versusUi';

// Choosing a formation and a style, for every room that lets you.
//
// ITS OWN COMPONENT BECAUSE A DUEL NEEDS IT TOO, and for a while it did not have it. The
// picker lived inside `RoomLobby`, a duel replaces `RoomLobby` with its own waiting panel,
// and the plan asserted that "both shapes are chosen already - the challenger's when they
// sent it, the opponent's as they accept". That was never true of any code: neither player
// in a duel could reach a formation control, so every duel was played 4-3-3 balanced by
// both sides. Reported 2026-08-30.
//
// So the control is shared rather than copied. Two rules travel with it, and both were
// already learned in the lobby:
//
// - THE CHOICE IS POSTED THE MOMENT IT IS MADE. A chip that is lit and not yet sent is a
//   lie, and the button that used to send it - "Change my shape" - was a button nobody could
//   explain.
// - AND READY LOCKS IT (`locked`, 2026-09-25, asked for). P48's rule is the SERVER's and is
//   unchanged - the referee still takes a lineup from a ready player, and the host may still
//   start over somebody who never pressed it - but a screen where Ready means "I have
//   decided" and the chips underneath are still live is two answers to the same question.
//   Pressing Not ready is how you change your mind, which is one gesture and says so.
// - A FORMATION CHANGE MAY MAKE THE CURRENT STYLE ILLEGAL, since a 3-4-3 has no defensive
//   variant. It falls back to the first the new formation allows rather than leaving an
//   impossible pair on screen under a disabled button, which is a dead end the player did
//   not ask for.
//
// AND IT SHOWS THE BOARD, which is the single-player build's own `Pitch` and not a diagram
// drawn for this screen. Eleven names for a shape mean nothing until you see where the
// eleven stand, and the component already answers that: it keeps eleven persistent circles
// and slides each one to its nearest new slot on a change (`assignNearest`), so switching
// from a 4-3-3 to a 3-5-2 is a team moving rather than a picture being replaced. Handing it
// an empty board and no held player leaves every slot inert, so it is a preview and not a
// second place to tap.

export default function ShapePicker({
    name,
    style,
    onPick,
    note,
    locked = false,
}: {
    name: FormationName;
    style: Style;
    /** Called with a legal pair, always. The caller posts it. */
    onPick: (name: FormationName, style: Style) => void;
    /** What to say under the heading. A lobby and a duel are choosing for different
     *  reasons, so the sentence is the caller's. */
    note: string;
    /** Settled: this player has pressed Ready. The chips go inert and say why, rather than
     *  the caller hiding the control - a shape you cannot SEE is worse than one you cannot
     *  change, since it is the thing you are being asked to be ready about. Defaulted, so a
     *  caller with nothing to lock reads exactly as it did. */
    locked?: boolean;
}) {
    const styles = FORMATIONS_DATA.stylesByName[name] ?? STYLES;
    const shape = getFormation(name, style);

    const pickFormation = (n: FormationName): void => {
        const allowed = FORMATIONS_DATA.stylesByName[n] ?? STYLES;
        const s = allowed.includes(style) ? style : (allowed[0] ?? 'bal');
        if (getFormation(n, s)) onPick(n, s);
    };

    /* THE CHOSEN CHIP KEEPS ITS FULL STRENGTH WHEN THE ROW IS LOCKED, and only the ones you
       did not pick go quiet. Dimming the lot fades the one thing on the row still carrying
       information - which shape you settled on - and this codebase has made exactly that
       mistake twice, on the perk tiles and on the disabled buttons that were carrying their
       own reason. Inert, not invisible. */
    const chip = (on: boolean): string =>
        `rounded-[5px] border px-2.5 py-1.5 text-[12px] font-bold transition ${
            on ? CHIP_ON : CHIP_OFF
        }${locked ? ' cursor-not-allowed' : ''}${locked && !on ? ' opacity-40' : ''}`;

    return (
        <>
            <RoomNote>
                {locked ? 'Settled while you are ready. Press "Not ready" to change it.' : note}
            </RoomNote>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {FORMATIONS_DATA.names.map((n) => (
                    <button
                        key={n}
                        type="button"
                        disabled={locked}
                        onClick={() => pickFormation(n)}
                        className={`${chip(n === name)} font-mono`}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {STYLES.map((s) => {
                    const enabled = styles.includes(s);
                    return (
                        <button
                            key={s}
                            type="button"
                            disabled={locked || !enabled}
                            onClick={() => onPick(name, s)}
                            className={`${chip(s === style)}${
                                enabled ? '' : ' cursor-not-allowed opacity-40'
                            }`}
                        >
                            {STYLE_LABEL[s]}
                        </button>
                    );
                })}
            </div>
            {shape && (
                <div className="mx-auto mt-4 max-w-[320px]">
                    <Pitch
                        formation={shape}
                        filled={{}}
                        selectedPlayer={null}
                        onPlace={() => undefined}
                    />
                </div>
            )}
        </>
    );
}
