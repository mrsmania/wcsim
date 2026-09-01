import { useEffect, useState } from 'react';
import { duelToOpen, type DuelAlert } from '../domain/pvpView';
import type { DuelRow } from '../domain/pvpWire';
import { readDuels } from '../state/pvp/referee';
import { onDuelsChanged } from '../state/pvp/duels';
import { onWatchedChange, watchedDuels } from '../state/pvp/watched';

// ---------------------------------------------------------------------------
// "One of your duels wants you", for the strip under the tab bar.
//
// A LIVE ROOM ANNOUNCES ITSELF BY BEING HELD (`nav/versusRoom.ts`): you are in it, this
// tab knows, and the strip is a way back. A DUEL CANNOT WORK THAT WAY. It is played over
// days, from whatever device is to hand, and the two moments worth interrupting somebody
// for both happen while they are somewhere else entirely - your opponent finishing their
// team, and the match being played by the server the instant they do. Neither of those is
// anything a browser can know without asking, so this asks.
//
// IT IS A SLOW POLL AND THAT IS THE WHOLE DESIGN. Thirty seconds, one small list, and only
// while signed in with a referee configured: the room screen polls at two seconds because
// something is moving in front of you, and nothing here is. A duel that has been waiting
// for six hours can wait another half a minute.
//
// The alert is only ever the MOST urgent row (`duelToOpen`): a result nobody has watched,
// then a team nobody has sent. The rest of the list is a list, and the Versus tab is where
// lists live.
// ---------------------------------------------------------------------------

/** How often to ask. See the header: this is a background check, not a clock. */
const POLL_MS = 30_000;

export interface DuelAlertRow {
    row: DuelRow;
    alert: Exclude<DuelAlert, null>;
}

export function useDuelAlert(enabled: boolean): DuelAlertRow | null {
    const [rows, setRows] = useState<readonly DuelRow[]>([]);
    const [watched, setWatched] = useState<ReadonlySet<string>>(watchedDuels);

    // Watching a result in the room below has to take the strip down at once, rather than
    // at the next poll: the list is unchanged - the duel is still finished - and it is
    // only the local fact that moved.
    useEffect(() => onWatchedChange(setWatched), []);

    useEffect(() => {
        if (!enabled) {
            setRows([]);
            return;
        }
        let alive = true;
        const ask = () => {
            void readDuels()
                .then((r) => {
                    if (alive) setRows(r.duels);
                })
                // Silently. A referee that predates duels answers 404 for this route, and
                // a chrome that showed an error for it would be broken on every screen of
                // the app until the server is rebuilt - where an absent strip is just a
                // feature that has not arrived.
                .catch(() => undefined);
        };
        ask();
        const t = window.setInterval(ask, POLL_MS);
        // AND WHENEVER THIS PLAYER HAS JUST MOVED A DUEL THEMSELVES. Thirty seconds is the
        // right beat for somebody else's move and much too slow for your own: withdraw
        // from a duel and the strip would go on saying it is your move, about a game you
        // have just given up. `duelsChanged` fires when the referee answers.
        const off = onDuelsChanged(ask);
        return () => {
            alive = false;
            off();
            window.clearInterval(t);
        };
    }, [enabled]);

    return duelToOpen(rows, watched);
}
