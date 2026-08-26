-- 0017_pvp_referee.sql
--
-- Roadmap item 18 (player versus player), wave 3 of docs/pvp-plan.md: the things the referee
-- cannot run without and that 0016 does not provide, plus one column that a settled decision
-- has made dead. Written and QUEUED, not
-- applied (CLAUDE.md, 2026-08-24): the session that wrote it is a cloud session with no
-- route to the NAS. See the roadmap item for the apply.
--
-- WHY THERE IS A SECOND PVP MIGRATION AT ALL. 0016 is the room's SHAPE and it is right; what
-- it is missing is four things that only appear once something actually drives a room, and
-- every one of them was found by building the referee rather than by re-reading the plan.
-- The fifth is a deletion the owner decided:
--
-- 1. THE OPEN PICK WINDOW HAS NOWHERE TO LIVE. `pvp_picks` records picks that LANDED, with
--    the ordinal and when the window opened - and the whole design turns on a deadline
--    being stored data rather than a timer (P32), so the window that is open RIGHT NOW is
--    the one row that has to survive a restart, and it is the one row 0016 has no column
--    for. It cannot be derived either: the obvious derivation (the last pick's `landed_at`)
--    is exactly the value P45's outage recovery has to rewrite, and rewriting `landed_at`
--    would be recording a lie about when a pick arrived. Two columns on `pvp_members`.
--
-- 2. THE REFEREE'S HEARTBEAT HAS NOWHERE TO LIVE. P45 is "on start, read your own heartbeat
--    and reopen every window with the time it had LEFT". `touched_at` is the wrong column to
--    reuse: P31 reads it to close a room nobody has touched, so a sweeper writing it every
--    second would mean no live room is ever collected. `swept_at` is per ROOM rather than
--    one global row, which is also strictly better than the plan's wording - a room the
--    sweeper never reached keeps its own last-seen time and is recovered against that.
--
-- 3. NOTHING CAN WRITE A DISPLAY NAME. 0016 added `profiles.display_name` and
--    `profiles.name_key` and the unique index over them, and there the trail stops:
--    `profiles` has been select-only for the client since 0002 ("bumped by the functions,
--    so profiles is not client-writable"), and the referee deliberately holds no write
--    grant on it (P34 - it must not be able to touch an account). So the columns exist and
--    no code path on either side can fill them, which makes P22 unimplementable as it
--    stands. A `security definer` function is the same answer 0003 gives for every other
--    client write, and it is the right one here for a second reason: the uniqueness check
--    and the insert have to be one statement or two players racing both succeed.
--
-- 4. THE REFEREE HOLDS A GRANT OVER ROWS IT CANNOT SEE. 0016 gives it
--    `select (id, display_name, name_key) on profiles` and stops there - and `profiles` has
--    row-level security on, whose only policy names `authenticated`. So every read came back
--    empty, the referee concluded every account was nameless, and it refused every room for
--    everybody. Found by rehearsing, not by reading; the rule it breaks is written down one
--    screen above the omission in 0016's own header. The policy is at the foot of this file.
--
-- 5. AND ONE DELETION: `pvp_rooms.budget_source`. P2's second option - a room priced off each
--    player's own career transfer budget - was dropped on 2026-08-27, so the column encodes a
--    choice that no longer exists. See it below for why the option went.
--
-- THE NORMALISATION IS THE CLIENT'S, AND THIS FUNCTION DOES NOT REDO IT. `name_key` is
-- computed by `src/domain/displayName.ts` (NFC, invisibles stripped, whitespace collapsed,
-- folded) and passed in, because the codepoint rule needs Unicode script properties that
-- SQL here does not have and a second, weaker copy in plpgsql would be the version that
-- decides - the same reason the collectible catalogue is generated from the dataset rather
-- than re-derived in SQL. What this function DOES enforce is the pair of facts SQL can
-- know on its own: that the key is not empty, that it is not longer than the display name
-- rule allows, and that nobody else holds it. A caller sending a key that does not match
-- its own name is only able to lie about ITSELF.
--
-- WHAT IT DOES NOT DO: it does not bump `state_version`. That counter guards the game-state
-- writes (FR-11) and a rename is not one of them; bumping it would make choosing a name
-- collide with a save that was already in flight.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `\d pvp_members` - `window_ordinal`, `window_opened_at` and `rerolls_used` exist,
--      the first two null for every row and the third 0. `\d pvp_rooms` - `swept_at`
--      exists and is null, and `budget_source` is GONE.
--   2. Signed in as an ordinary user in a browser session:
--      `select set_display_name('Mario', 'mario');` returns 'Mario', and
--      `select display_name, name_key from profiles where id = auth.uid();` shows both.
--   3. As a SECOND account, `select set_display_name('MARIO', 'mario');` is refused with
--      "that name is taken" and HTTP 409. **Needs two accounts**; with one, check the
--      unique index exists and come back to this when there is a second.
--   4. Re-running step 2 as the SAME account succeeds (a rename to the name you already
--      hold is not a collision, and a player pressing save twice must not see an error).
--   5. `select set_display_name('x', 'x');` is refused for length, and
--      `select set_display_name('Mario', '');` is refused for an empty key. Both prove the
--      function is not simply trusting its arguments.
--   6. As `anon` (no session): the call is refused. 0008's lesson is that a new function is
--      executable by PUBLIC until it is told otherwise.
--   7. `select polname, polroles::regrole[] from pg_policy where polrelid = 'profiles'::regclass;`
--      - two policies now: 0002's `profiles_own` for `authenticated`, and
--      `profiles_referee_read` for `pvp_referee`. Then, connected AS the referee role,
--      `select display_name from profiles limit 1;` returns a row rather than nothing, and
--      `select email from profiles limit 1;` is refused. Both halves matter: the first is
--      what was broken, the second is what keeps the referee narrow.
--   8. Play a normal single-player run to the end, banking stickers. Nothing here touches
--      that path and confirming it is untouched is the point of checking.
--
-- REHEARSED 2026-08-26, and again on 2026-08-27 after the budget_source deletion, on a local
-- PostgreSQL 16 with a stand-in for the parts of the stack
-- these two files reference (the two roles, `auth.uid()`, `profiles` as 0001 defines it):
-- 0016 then 0017 apply clean, all eight steps above pass, the rollback block above runs and
-- 0017 re-applies after it, and a whole room - create, join, ready, start, a pick, a draft
-- run out by the clock, a tie, a champion - was played through the real referee connected as
-- the real `pvp_referee` role. **The rehearsal is what found reason 4**; reading did not.
-- The NAS is on PostgreSQL 17.6, so this is evidence and not a substitute for applying it
-- there and repeating the steps.
--
-- ROLLBACK (complete, in this order; nothing outside this file is altered):
--   begin;
--   alter table pvp_rooms add column if not exists budget_source text not null default 'fixed'
--     check (budget_source in ('fixed', 'career'));
--   drop policy if exists profiles_referee_read on profiles;
--   drop function if exists set_display_name(text, text);
--   alter table pvp_rooms   drop column if exists swept_at;
--   alter table pvp_members drop constraint if exists pvp_members_window_ck;
--   alter table pvp_members drop column if exists rerolls_used;
--   alter table pvp_members drop column if exists window_opened_at;
--   alter table pvp_members drop column if exists window_ordinal;
--   commit;
-- (No `drop owned by` needed here: this file grants nothing to `pvp_referee` that is not
-- carried by 0016's table-level grants, which cover columns added later.)

begin;

-- --------------------------------------------------------------------------
-- The open pick window (reason 1 in the header)
-- --------------------------------------------------------------------------

-- Null while a player has no window: before the draft starts, and once their XI is full.
-- The DEADLINE is deliberately not stored - it is `window_opened_at + room.pick_seconds`,
-- and storing a derived value is how two truths appear (`domain/pvpRoom.ts` says the same).
alter table pvp_members add column if not exists window_ordinal   integer;
alter table pvp_members add column if not exists window_opened_at timestamptz;

-- And the re-roll allowance the host set, which 0016 stores on the room and nothing counted
-- against. A counter rather than a derivation off `pvp_deals`: a deal that finds no squad
-- writes no row, so the two would drift apart exactly when a room is under stress.
alter table pvp_members add column if not exists rerolls_used integer not null default 0;

alter table pvp_members drop constraint if exists pvp_members_window_ck;
alter table pvp_members add constraint pvp_members_window_ck check (
  (window_ordinal is null and window_opened_at is null)
  or (window_ordinal >= 1 and window_opened_at is not null)
);

-- --------------------------------------------------------------------------
-- The referee's heartbeat (reason 2)
-- --------------------------------------------------------------------------

-- When the sweeper last looked at this room. NOT `touched_at`, which P31's garbage
-- collection reads to find a room nobody has touched - a sweeper writing that every second
-- would mean a live room is never collected. Null means never swept, and recovery then has
-- nothing to give back, which is correct: a room that has never been swept has never had a
-- window opened by this process.
alter table pvp_rooms add column if not exists swept_at timestamptz;

-- --------------------------------------------------------------------------
-- The budget source, which is no longer a question (reason 5)
-- --------------------------------------------------------------------------

-- P2 originally let a host price a room off each player's own career transfer budget, and
-- **the option was dropped on 2026-08-27**. It contradicted P34 outright: the referee holds
-- no privilege on `career`, and snapshotting the figure at host-start does not dodge that,
-- because the snapshot still has to be READ by the thing that may not read it. It was also
-- the weakest setting in the room on its own merits - measured at the optimum, $160 beats
-- $70 85.7% of the time, so the match was decided in the lobby.
--
-- So the column goes rather than being left as a check constraint over a dead value. It is
-- free to drop: 0016 is applied and holds no rooms, and there are no production users
-- (CLAUDE.md, 2026-08-21), so this is a decision rather than a migration.
alter table pvp_rooms drop column if exists budget_source;

-- --------------------------------------------------------------------------
-- Letting the referee actually read the three columns it was granted (reason 4)
-- --------------------------------------------------------------------------

-- 0016 gives the referee `select (id, display_name, name_key) on profiles` and stops there,
-- and a grant is only half of it: `profiles` has row-level security enabled, security
-- denies by default, and the only policy on it is 0002's `profiles_own`, which names
-- `authenticated`. So the referee holds a grant over rows it can never see - every
-- `select display_name` comes back empty, which the referee reads as "this account has not
-- chosen a name" and refuses to open or join a room. Every room, for everybody, for ever.
--
-- FOUND BY REHEARSING, not by reading. The file it is in says "a grant and a policy answer
-- different questions, and the referee needs both", and then applies that to the seven pvp
-- tables and not to the one table it does not own. That is the whole failure: the rule was
-- known and written down one screen above the omission.
--
-- SELECT ONLY, and the column grant is what keeps it narrow: this policy says which ROWS
-- (all of them), the grant says which COLUMNS (three), and `email`, `state_version` and
-- everything else on an account stays out of reach. The referee still holds no privilege of
-- any kind on career, album_stickers, settings, game_state, active_run or run_results.
drop policy if exists profiles_referee_read on profiles;
create policy profiles_referee_read on profiles
  for select to pvp_referee
  using (true);

-- --------------------------------------------------------------------------
-- Claiming a display name (reason 3)
-- --------------------------------------------------------------------------

-- `security definer` for the same reason every other client write here is one: the table is
-- not client-writable, and the check-then-write has to be a single statement or two players
-- claiming the same name at the same moment both pass the check.
--
-- The `on conflict` does the work. Postgres evaluates the unique index at the moment of the
-- write, so the race cannot be lost between reading and writing, and a caller re-claiming
-- the key they already hold updates their own row rather than colliding with it.
create or replace function set_display_name(p_name text, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_holder uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = 'PT401';
  end if;

  -- What SQL can know on its own. The codepoint rule is the client's (see the header); this
  -- is the half that does not need Unicode script properties, and it exists so a caller
  -- cannot store an empty or oversized key by skipping the client.
  p_name := btrim(p_name);
  if p_name is null or p_key is null or length(p_key) = 0 then
    raise exception 'a display name is required' using errcode = 'PT422';
  end if;
  if char_length(p_name) < 3 or char_length(p_name) > 16
     or char_length(p_key) > 16 then
    raise exception 'a display name is 3 to 16 characters' using errcode = 'PT422';
  end if;

  select id into v_holder from profiles where name_key = p_key;
  if v_holder is not null and v_holder <> v_user then
    raise exception 'that name is taken' using errcode = 'PT409';
  end if;

  update profiles set display_name = p_name, name_key = p_key where id = v_user;
  return p_name;
exception
  -- The index is the real gate, and it is what a genuine race trips: two callers can both
  -- pass the select above and only one can pass this. Reported identically, so a player
  -- sees "that name is taken" either way rather than a raw constraint name.
  when unique_violation then
    raise exception 'that name is taken' using errcode = 'PT409';
end;
$$;

-- 0008's lesson, restated because it is exactly the kind of thing that is forgotten:
-- Postgres makes a new function executable by PUBLIC, and the Supabase image grants it to
-- `anon` and `authenticated` on top. So say it.
--
-- CORRECTED 2026-08-26 BEFORE THE FIRST APPLY, by rehearsing this file against the NAS
-- inside a rolled-back transaction and reading the resulting ACL. `revoke ... from public`
-- does NOT remove the image's explicit grant to `anon`, so the first version of these two
-- lines left `set_display_name` as the ONE function in the database that `anon` could
-- execute - measured, not guessed: every other security definer function there reads
-- `authenticated=X | service_role=X` and nothing else. Not exploitable, because the body's
-- first act is to refuse a null `auth.uid()` with PT401, but it is precisely the hole 0008
-- exists to close and the shape 0008 uses is `from public, anon`. `service_role` is granted
-- for the same consistency: every other function in 0008 carries it.
revoke all on function set_display_name(text, text) from public, anon;
grant execute on function set_display_name(text, text) to authenticated, service_role;

commit;
