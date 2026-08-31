import { useCallback, useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { NAME_MAX, NAME_MIN, validateName } from '../../domain/displayName';
import type { PvpVersion, VersionMismatch } from '../../domain/pvpVersion';
import {
    claimDisplayName,
    clientVersion,
    currentDisplayName,
    handshake,
} from '../../state/pvp/referee';
import { btn, CARD, MONO_CAP, PRIMARY_BTN, StageHeader } from '../matchUi';
import RoomScreen from './RoomScreen';
import VersusHome from './VersusHome';
import { refereeMessage, type RefereeMessage } from './refereeMessage';
import { RefereeProblem, RoomNote } from './versusUi';

// The way into versus, and the three things that have to be true before anybody sees a
// room: an account, a referee that speaks this build's language, and a name to be called.
//
// THE HANDSHAKE IS FIRST AND IT IS NOT DECORATION (P35). The client deploys on a push to
// `main` and the referee is rebuilt by hand, so they are never in lockstep, and there are
// two ways they drift: the protocol, and the DATASET the referee bundles to validate
// picks. A client offering a player the referee has never heard of gets every pick
// refused halfway through a draft with no way to say why. Better to say "versus is
// updating" at the door.

type Gate =
    | { kind: 'checking' }
    | { kind: 'unreachable' }
    | { kind: 'mismatch'; why: VersionMismatch; theirs: PvpVersion | null }
    | { kind: 'name' }
    | { kind: 'ready'; name: string };

export default function VersusScreen({ signedIn }: { signedIn: boolean }) {
    const inRoom = useMatch('/versus/:code');
    const code = inRoom?.params.code?.toUpperCase() ?? null;
    const [gate, setGate] = useState<Gate>({ kind: 'checking' });
    // Changing the name is a DETOUR rather than a gate: the same panel, reached on purpose
    // from the versus page instead of because there is nothing to be called yet.
    const [renaming, setRenaming] = useState(false);

    const check = useCallback(async () => {
        const shake = await handshake();
        if (shake.unreachable) return setGate({ kind: 'unreachable' });
        if (shake.mismatch) {
            return setGate({ kind: 'mismatch', why: shake.mismatch, theirs: shake.theirs });
        }
        try {
            const name = await currentDisplayName();
            setGate(name ? { kind: 'ready', name } : { kind: 'name' });
        } catch {
            setGate({ kind: 'unreachable' });
        }
    }, []);

    useEffect(() => {
        if (!signedIn) return;
        setGate({ kind: 'checking' });
        setRenaming(false);
        void check();
    }, [signedIn, check]);

    if (!signedIn) {
        return (
            <>
                <StageHeader eyebrow="Versus" title="Play somebody" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>
                        Two, four or eight people, a team each from the same money or the same
                        dice, and a knockout to settle it. Play whoever is around, or send a
                        code to the people you want. It needs an account, because the others
                        have to know who they beat and the result has to live somewhere none of
                        you can edit.
                    </RoomNote>
                    <RoomNote>
                        <span className="mt-2 block">
                            Sign in from the account button at the top of the page. Everything
                            you have already - your XI, your run, your album - stays exactly as
                            it is; a room never touches any of it.
                        </span>
                    </RoomNote>
                </div>
            </>
        );
    }

    if (gate.kind === 'checking') {
        return (
            <>
                <StageHeader eyebrow="Versus" title="Play somebody" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>Checking with the referee.</RoomNote>
                </div>
            </>
        );
    }

    if (gate.kind === 'unreachable' || gate.kind === 'mismatch') {
        const mine = clientVersion();
        return (
            <>
                <StageHeader eyebrow="Versus" title="Versus is updating" />
                <div className={`${CARD} p-5`}>
                    <RoomNote>
                        {gate.kind === 'unreachable'
                            ? 'The referee is not answering. Versus is off until it does; nothing else in the game is affected.'
                            : gate.why === 'protocol'
                              ? 'This page and the referee are on different versions. Try again in a few minutes.'
                              : 'This page and the referee are carrying different squads, so a team built here could not be checked there. Try again in a few minutes.'}
                    </RoomNote>
                    {gate.kind === 'mismatch' && (
                        <p className={`${MONO_CAP} mt-3`}>
                            here {mine.protocol}/{mine.dataset}
                            {gate.theirs && ` · there ${gate.theirs.protocol}/${gate.theirs.dataset}`}
                        </p>
                    )}
                </div>
            </>
        );
    }

    if (gate.kind === 'name') {
        return <NamePanel current={null} onDone={(name) => setGate({ kind: 'ready', name })} />;
    }

    // Not while in a room: the code in the URL is somewhere to be, and a panel that replaced
    // it would take a player out of a draft to rename themselves.
    if (renaming && !code) {
        return (
            <NamePanel
                current={gate.name}
                onDone={(name) => {
                    setGate({ kind: 'ready', name });
                    setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
            />
        );
    }

    return code ? (
        <RoomScreen code={code} />
    ) : (
        <VersusHome name={gate.name} onRename={() => setRenaming(true)} />
    );
}

/**
 * Choosing what everybody else calls you (P22), and changing it later.
 *
 * The rule is in `domain/displayName.ts` and it is enforced on both sides, which is why
 * this can show what a name WOULD become before it is claimed: normalised, folded, and
 * refused if the folded form is already held. There is no word filter, by decision; the
 * answer to a name somebody should not have is a report and the owner renaming them.
 *
 * ONE PANEL FOR BOTH, and the only difference is `current`. Picking a name for the first
 * time and changing one are the same instruction (`set_display_name` updates the row it
 * finds, and re-claiming a key you already hold is not a collision), the same rule and the
 * same three things that can go wrong. What changes is the copy, the field starting full,
 * and there being somewhere to go back to.
 *
 * A RENAME REACHES A ROOM ALREADY IN FLIGHT, and that is why there is nothing to warn about
 * here. No room stores a name: `pvp_members` holds a seat and every screen reads the name
 * off `profiles` through a join, so the lobby you are sitting in, the tree, the duel list
 * and the result all say the new one within a poll. Records key on the account (P22), so
 * nothing you have won is left behind under the old name either.
 */
function NamePanel({
    current,
    onDone,
    onCancel,
}: {
    current: string | null;
    onDone: (name: string) => void;
    onCancel?: () => void;
}) {
    const [raw, setRaw] = useState(current ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RefereeMessage | null>(null);
    const verdict = validateName(raw);
    // Nothing to save is not an error, so the button goes quiet rather than the form
    // reporting a fault. The comparison is on the NORMALISED name, since that is what would
    // be stored: adding a trailing space is not a rename.
    const unchanged = current !== null && verdict.name === current;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!verdict.ok || busy || unchanged) return;
        setBusy(true);
        setError(null);
        void claimDisplayName(raw)
            .then(onDone)
            .catch((err: unknown) => {
                setBusy(false);
                setError(refereeMessage(err, 'save that name'));
            });
    };

    return (
        <>
            <StageHeader
                eyebrow="Versus"
                title={current === null ? 'Pick a name' : 'Change your name'}
            />
            <form className={`${CARD} max-w-[460px] p-5`} onSubmit={submit}>
                <RoomNote>
                    What everybody else sees. {NAME_MIN} to {NAME_MAX} characters, and one
                    nobody else is using.
                </RoomNote>
                {current !== null && (
                    <RoomNote>
                        <span className="mt-2 block">
                            It changes everywhere at once, rooms you are already in included.
                            Nothing you have won moves with it: your record follows the
                            account, not the name.
                        </span>
                    </RoomNote>
                )}
                <input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    autoComplete="off"
                    maxLength={40}
                    aria-label="Display name"
                    className="mt-3 w-full rounded-[5px] border border-line bg-ground px-3 py-2.5 text-[16px] font-bold text-ink outline-none focus:border-pitch"
                />
                {raw.trim() !== '' && !verdict.ok && (
                    <p className="mt-2 text-[13px] text-muted">
                        {verdict.faults.includes('too-short') && `At least ${NAME_MIN} characters. `}
                        {verdict.faults.includes('too-long') && `At most ${NAME_MAX} characters. `}
                        {verdict.faults.includes('bad-character') &&
                            `Not allowed: ${verdict.rejected.join(' ')}`}
                    </p>
                )}
                {verdict.ok && !unchanged && verdict.name !== raw && (
                    <p className="mt-2 text-[13px] text-muted">
                        You will be shown as <b className="text-ink">{verdict.name}</b>.
                    </p>
                )}
                {error && <RefereeProblem message={error} />}
                <div className="mt-4 flex flex-wrap gap-2">
                    <button className={PRIMARY_BTN} disabled={!verdict.ok || busy || unchanged}>
                        {current === null ? "That's me" : 'Call me that'}
                    </button>
                    {onCancel && (
                        <button type="button" className={btn('quiet')} onClick={onCancel}>
                            Never mind
                        </button>
                    )}
                </div>
            </form>
        </>
    );
}
