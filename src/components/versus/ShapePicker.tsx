import {
    FORMATIONS_DATA,
    STYLES,
    STYLE_LABEL,
    getFormation,
    type FormationName,
    type Style,
} from '../../domain/formations';
import Pitch from '../Pitch';
import { CHIP_OFF, CHIP_ON, MONO_CAP } from '../matchUi';
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
// - THE CHOICE IS POSTED THE MOMENT IT IS MADE (P48 lets a ready player keep changing shape
//   until the start, so nothing here has to lock). A chip that is lit and not yet sent is a
//   lie, and the button that used to send it - "Change my shape" - was a button nobody could
//   explain.
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
}: {
    name: FormationName;
    style: Style;
    /** Called with a legal pair, always. The caller posts it. */
    onPick: (name: FormationName, style: Style) => void;
    /** What to say under the heading. A lobby and a duel are choosing for different
     *  reasons, so the sentence is the caller's. */
    note: string;
}) {
    const styles = FORMATIONS_DATA.stylesByName[name] ?? STYLES;
    const shape = getFormation(name, style);

    const pickFormation = (n: FormationName): void => {
        const allowed = FORMATIONS_DATA.stylesByName[n] ?? STYLES;
        const s = allowed.includes(style) ? style : (allowed[0] ?? 'bal');
        if (getFormation(n, s)) onPick(n, s);
    };

    return (
        <>
            <div className={MONO_CAP}>Your shape</div>
            <RoomNote>{note}</RoomNote>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {FORMATIONS_DATA.names.map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => pickFormation(n)}
                        className={`rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] font-bold transition ${
                            n === name ? CHIP_ON : CHIP_OFF
                        }`}
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
                            disabled={!enabled}
                            onClick={() => onPick(name, s)}
                            className={`rounded-[5px] border px-2.5 py-1.5 text-[12px] font-bold transition ${
                                s === style ? CHIP_ON : CHIP_OFF
                            } ${enabled ? '' : 'cursor-not-allowed opacity-40'}`}
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
