// The one thing a room reads about a PERSON rather than about a room: their record.
//
// Wave 8 of docs/pvp-plan.md. It goes straight to the account server rather than through
// the referee, and that is the plan's own split rather than a shortcut: `pvp_records` is a
// `security_invoker` VIEW with `select` granted to `authenticated`. The referee is the only
// writer of rooms; a record is not a room.
//
// THE CLIENT NOW WRITES NOTHING AT ALL HERE (2026-09-02). It used to file a report about
// somebody's display name, which was the other half of this file and the only table the
// browser could insert into anywhere in the game. Reporting is gone: the host throwing
// somebody out of the room is the whole answer to a name or a person you want nothing to
// do with, and it acts at once instead of waiting for the owner to read a queue by hand.
// Migration 0026 drops the table behind it, so do not reinstate the insert without it.
//
// A RECORD IS DERIVED, NEVER INCREMENTED (P36). It is a view over `pvp_matches`, so a
// retried write cannot corrupt it and a ladder later reads the same corpus. That is also
// why there is nothing here to update: winning a match is recorded by the referee writing
// the match, and this only reads.

// The auth library is DYNAMICALLY imported, as everywhere else that touches it: a guest
// must never download it (`docs/cloud-sync-design.md`), and mixing a static import of the
// same module with the dynamic ones would fold GoTrue into whichever chunk imported it
// statically - here, the versus screens.

/** Somebody's win/loss record. Nothing is at stake but this (P9), and a ladder is the
 *  planned next step rather than something this shape has to anticipate. */
export interface PvpRecord {
    played: number;
    won: number;
    lost: number;
    /** Rooms won outright, i.e. the last round of a room. In a room of two that is every
     *  win; in a room of eight it is the tournament. */
    roomsWon: number;
}

export const NO_RECORD: PvpRecord = { played: 0, won: 0, lost: 0, roomsWon: 0 };

/**
 * This account's record, or zeros.
 *
 * An account that has never played has NO ROW in the view rather than a row of zeros, so
 * "no row" is the ordinary case and is not an error. Failing to read it is not an error
 * worth a screen either: a record is a decoration beside the thing you came to do, so it
 * resolves to zeros and says nothing.
 */
export async function myRecord(): Promise<PvpRecord> {
    try {
        const { supabase } = await import('../auth');
        const client = supabase();
        const { data } = await client.auth.getSession();
        const id = data.session?.user?.id;
        if (!id) return NO_RECORD;
        const { data: row } = await client
            .from('pvp_records')
            .select('played, won, lost, rooms_won')
            .eq('user_id', id)
            .maybeSingle();
        const r = row as { played: number; won: number; lost: number; rooms_won: number } | null;
        return r
            ? { played: Number(r.played), won: Number(r.won), lost: Number(r.lost), roomsWon: Number(r.rooms_won) }
            : NO_RECORD;
    } catch {
        return NO_RECORD;
    }
}
