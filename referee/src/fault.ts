// A failure, named by its schema identifiers and nothing else.
//
// Every field this returns is in `supabase/migrations/`, i.e. already public: an SQLSTATE, a
// column, a constraint, a table, a function. It is the difference between "the referee hit
// an error" and "42703 column=budget_source", which is a fix rather than a mystery.
//
// Deliberately NOT `err.detail`: Postgres puts the offending row's values in there ("Key
// (code)=(RM0001) already exists"), which is the one part of a database error that is nobody
// else's business. The message is not in here either, for the same reason - it can carry a
// query, a row value or a connection string.
//
// It lives in its own file because the SWEEPER needs it too, and learning that cost a
// production morning: a sweep that threw logged the room's code and no reason at all, once a
// second, which is undiagnosable by the only person who can see it. That is the same mistake
// the 500 handler had already been corrected for. A log line either names the fault or it is
// noise.

export function faultOf(err: unknown): string {
  const e = err as {
    code?: unknown;
    column?: unknown;
    constraint?: unknown;
    table?: unknown;
    routine?: unknown;
    name?: unknown;
  } | null;
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && /^[A-Za-z0-9_]{1,63}$/.test(v) ? v : null;
  const bits = [
    pick(e?.code) ?? pick(e?.name),
    pick(e?.column) ? `column=${pick(e?.column)}` : null,
    pick(e?.constraint) ? `constraint=${pick(e?.constraint)}` : null,
    pick(e?.table) ? `table=${pick(e?.table)}` : null,
    pick(e?.routine) ? `in=${pick(e?.routine)}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' ') : 'unclassified';
}
