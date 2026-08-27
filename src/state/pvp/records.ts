// The two things a room writes about a PERSON rather than about a room: their record, and
// a report of somebody's name.
//
// Wave 8 of docs/pvp-plan.md. Both go straight to the account server rather than through
// the referee, and that is the plan's own split rather than a shortcut: `pvp_records` is a
// `security_invoker` VIEW with `select` granted to `authenticated`, and `pvp_name_reports`
// is the one table the client may `insert` into (migration 0016). The referee is the only
// writer of rooms; neither of these is a room.
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

/** What happened to a report. `already` is not a failure: one report per person per target
 *  is a unique index (P22 - a report button is not a vote), so pressing it twice is a
 *  no-op that should read as "yes, we have it". */
export type ReportOutcome = 'sent' | 'already' | 'failed';

/**
 * Report a display name (P22).
 *
 * NO WORD FILTER AND NO AUTOMATIC ACTION. The owner reads these and renames or removes an
 * account by hand, which is the right amount of machinery for a game this size, and it is
 * why the only thing sent is who and by whom: there is no category to choose and no free
 * text to write, because neither would change what happens next.
 */
export async function reportName(reportedId: string): Promise<ReportOutcome> {
    try {
        const { supabase } = await import('../auth');
        const client = supabase();
        const { data } = await client.auth.getSession();
        const id = data.session?.user?.id;
        if (!id || id === reportedId) return 'failed';
        const { error } = await client
            .from('pvp_name_reports')
            .insert({ reporter_id: id, reported_id: reportedId });
        if (!error) return 'sent';
        // 23505 is the unique index doing its job.
        return error.code === '23505' ? 'already' : 'failed';
    } catch {
        return 'failed';
    }
}
