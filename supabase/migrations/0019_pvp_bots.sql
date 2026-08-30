-- 0019_pvp_bots.sql
--
-- Practice opponents: the seats a host can fill so a room of four or eight is playable
-- before four or eight people have turned up.
--
-- WHY THIS NEEDS SQL AT ALL. A bot is a member of the room in every way the state machine
-- cares about - a seat, a name, a shape, an XI, a place in the draw - and `pvp_members`
-- cannot hold one: `user_id` is a foreign key into `profiles`, and a practice opponent has
-- no account to point at. There were three ways out of that and only one of them is
-- reversible:
--
--   * Give bots real `profiles` rows. That means rows in `auth.users`, which GoTrue owns
--     and lists, so the account server would grow eight fake accounts nobody can sign in
--     as. Rejected outright.
--   * Relax `pvp_members.user_id` so any uuid may sit in a room. That is the constraint
--     which stops a room seating a user id that does not exist, weakened for every member
--     so that a few of them could be nobody. Rejected.
--   * Give bots their own table. That is this file.
--
-- WHAT IT ADDS
--   * `pvp_bots` - one row per practice opponent, its XI as a single jsonb slot map.
--   * `pvp_matches.bot_sides` - how many of the two sides were bots, which is the fourth
--     column in the same family as `room_visibility`, `room_size` and `loser_auto_picks`
--     (0016): the facts a ladder needs and cannot recover once the room is gone.
--   * `pvp_records` restated, EXCLUDING ties with a bot in them.
--   * The four `profiles` foreign keys that a bot cannot satisfy, dropped, and a trigger
--     that keeps what they were actually for.
--
-- THREE DECISIONS, each of the kind that cannot be retrofitted once there is data:
--
-- 1. A BOT'S XI IS ONE JSONB COLUMN, not eleven `pvp_picks` rows. Those rows carry an
--    ordinal, a window and a landing time, and record which of them the CLOCK filled - all
--    of it about drafting against a deadline, and none of it true of a team that was built
--    in one step at the kick-off. Eleven rows of zeroes and nulls would be a lie in the
--    shape of a record.
--
-- 2. A BOT TIE IS NOT A RECORD. `pvp_records` is what "your record" reads (P36, and it is
--    a VIEW precisely so it cannot be corrupted), and a room of one human and seven bots
--    would otherwise be three wins for turning up. So the view filters on `bot_sides = 0`,
--    while `finals` still reads every match - or a final played against a bot would promote
--    the semi-final into "rooms won" and credit somebody with a tournament they did not
--    win. Beating a robot in the final is not winning a room.
--
-- 3. THE FOREIGN KEYS ON `pvp_matches` AND `pvp_rooms.champion_id` GO, and a trigger
--    replaces what they did. A bot plays ties and can win a room, so `home_id`, `away_id`,
--    `winner_id` and `champion_id` can all name something that is not an account. They stay
--    `uuid`; what is lost is the ON DELETE CASCADE that removed an account's matches when
--    the account went, so `pvp_forget_account()` does that explicitly. That is a strictly
--    smaller mechanism than it looks: the room itself is still deleted by `host_id`'s
--    cascade, and every other pvp table still cascades on `room_id`.
--
-- WHAT IS DELIBERATELY NOT GRANTED. `pvp_bots` gives `authenticated` nothing at all - not
-- even `select`. Nothing in the client reads it (the room arrives from the referee, which
-- applies `view.ts`'s rules), and a bot's XI is a draft secret exactly like a person's: a
-- select policy would hand it to every member of the room while they are still picking.
-- The referee gets its usual `for all` policy and nothing else changes.
--
-- IT NEEDS THE REFEREE REDEPLOYED, and in that order: this file first, then the container
-- (`scripts/deploy-referee.sh --verify`), then the client. An old referee against this
-- schema is harmless - it never selects `pvp_bots` and `bot_sides` defaults to 0 - while a
-- new referee against the old schema fails on its first write of a room with a bot in it.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `\d pvp_bots` - the table exists, `bot_id` is a uuid with NO foreign key, and
--      (room_id, seat) is unique.
--   2. `select count(*) from pg_policies where tablename = 'pvp_bots';` - one policy, and
--      `\dp pvp_bots` shows a grant to `pvp_referee` and none to `anon` or `authenticated`.
--   3. `select bot_sides from pvp_matches limit 1;` - the column exists and every existing
--      row is 0.
--   4. `select conname from pg_constraint where conrelid = 'pvp_matches'::regclass and
--      contype = 'f';` - only `room_id` is left.
--   5. `select * from pvp_records;` - the view still answers, and any account that had a
--      record before this file still has the same one (no room has bots in it yet, so the
--      new filter can only be a no-op today; if it is not, the filter is wrong).
--   6. In a transaction: insert a room, a bot, a match with `bot_sides = 1`, and confirm
--      `pvp_records` does NOT count it. Roll it back.
--   7. Sign in and play a normal single-player run to the end, banking stickers. Nothing
--      here touches that path and confirming it is untouched is the point of checking.
--
-- ROLLBACK (complete, and in this order):
--   begin;
--   drop table if exists pvp_bots;
--   drop trigger if exists profiles_forget_pvp on profiles;
--   drop function if exists pvp_forget_account();
--   alter table pvp_matches drop column if exists bot_sides;
--   alter table pvp_matches
--     add constraint pvp_matches_home_id_fkey   foreign key (home_id)   references profiles (id) on delete cascade,
--     add constraint pvp_matches_away_id_fkey   foreign key (away_id)   references profiles (id) on delete cascade,
--     add constraint pvp_matches_winner_id_fkey foreign key (winner_id) references profiles (id) on delete cascade;
--   alter table pvp_rooms
--     add constraint pvp_rooms_champion_id_fkey foreign key (champion_id) references profiles (id) on delete set null;
--   create or replace view pvp_records with (security_invoker = true) as
--     -- 0016's body, verbatim.
--     with sides as (
--       select room_id, round, home_id as user_id, winner_id from pvp_matches
--       union all
--       select room_id, round, away_id as user_id, winner_id from pvp_matches
--     ),
--     finals as (select room_id, max(round) as last_round from pvp_matches group by room_id)
--     select s.user_id, count(*) as played,
--            count(*) filter (where s.winner_id = s.user_id) as won,
--            count(*) filter (where s.winner_id <> s.user_id) as lost,
--            count(*) filter (where s.winner_id = s.user_id and s.round = f.last_round) as rooms_won
--       from sides s join finals f on f.room_id = s.room_id group by s.user_id;
--   commit;
-- (Re-adding the foreign keys fails if any room has already played a bot tie, which is the
-- correct behaviour: delete those rooms first, or keep this file.)

begin;

-- --------------------------------------------------------------------------
-- The practice opponents
-- --------------------------------------------------------------------------

create table if not exists pvp_bots (
  room_id        bigint not null references pvp_rooms (id) on delete cascade,
  -- A uuid because a bot is addressed exactly like a member everywhere above the database,
  -- and NOT a foreign key because there is no account behind it. See decision 3.
  bot_id         uuid not null,
  -- The same seat counter the members use, so a person taking a bot's chair gets a fresh
  -- number and nothing collides across the two tables.
  seat           integer not null,
  -- What the room shows. Not a person's name and deliberately not shaped like one, so
  -- nobody has to wonder whether the seat that knocked them out was real.
  name           text not null,
  formation_name text not null,
  style          text not null check (style in ('def', 'bal', 'off')),
  out_in         integer,
  -- slotId -> player id. One column rather than eleven pick rows: see decision 1. Empty
  -- until the host starts the room, which is when a bot's team is built.
  xi             jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  primary key (room_id, bot_id),
  unique (room_id, seat)
);

alter table pvp_bots enable row level security;

-- The referee, and nobody else. There is deliberately no `authenticated` policy and no
-- select grant: see "what is deliberately not granted" in the header.
--
-- DROPPED FIRST BECAUSE `create policy` HAS NO `if not exists`, and every other statement in
-- this file does. Without this the file is the one migration in the tree that cannot be
-- re-run: `create table if not exists` no-ops on a second pass and then the policy raises
-- 42710, which reads as "this is already applied" and is indistinguishable from "this is
-- half applied". Found 2026-08-30, by exactly that error.
drop policy if exists pvp_bots_referee on pvp_bots;
create policy pvp_bots_referee on pvp_bots
  for all to pvp_referee using (true) with check (true);

revoke all on pvp_bots from anon, authenticated;
grant select, insert, update, delete on pvp_bots to pvp_referee;

-- --------------------------------------------------------------------------
-- A tie with a bot in it
-- --------------------------------------------------------------------------

alter table pvp_matches
  add column if not exists bot_sides integer not null default 0
    check (bot_sides between 0 and 2);

-- --------------------------------------------------------------------------
-- The four keys a bot cannot satisfy
-- --------------------------------------------------------------------------

alter table pvp_matches drop constraint if exists pvp_matches_home_id_fkey;
alter table pvp_matches drop constraint if exists pvp_matches_away_id_fkey;
alter table pvp_matches drop constraint if exists pvp_matches_winner_id_fkey;
alter table pvp_rooms   drop constraint if exists pvp_rooms_champion_id_fkey;

-- What those keys were actually for. Deleting an account cascades from `auth.users` into
-- `profiles`, and from there into every pvp table by `room_id` or by `host_id`; the only
-- rows the cascade reached through the four keys above are matches in somebody ELSE's room,
-- and a champion pointer in one. This does that, and nothing else.
create or replace function pvp_forget_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from pvp_matches where home_id = old.id or away_id = old.id;
  update pvp_rooms set champion_id = null where champion_id = old.id;
  return old;
end;
$$;

revoke all on function pvp_forget_account() from public;

drop trigger if exists profiles_forget_pvp on profiles;
create trigger profiles_forget_pvp
  before delete on profiles
  for each row execute function pvp_forget_account();

-- --------------------------------------------------------------------------
-- The record, derived, and honest about practice
-- --------------------------------------------------------------------------

-- SUPERSEDES the view in 0016. Two changes and one deliberate non-change: `sides` skips
-- any tie with a bot in it, `finals` still reads every match so the last round of a room is
-- the last round of that room, and `security_invoker` stays load-bearing (without it this
-- runs as its superuser owner and hands every account's record to anybody signed in).
create or replace view pvp_records with (security_invoker = true) as
with sides as (
  select room_id, round, home_id as user_id, winner_id from pvp_matches where bot_sides = 0
  union all
  select room_id, round, away_id as user_id, winner_id from pvp_matches where bot_sides = 0
),
finals as (
  select room_id, max(round) as last_round from pvp_matches group by room_id
)
select
  s.user_id,
  count(*)                                         as played,
  count(*) filter (where s.winner_id = s.user_id)  as won,
  count(*) filter (where s.winner_id <> s.user_id) as lost,
  count(*) filter (
    where s.winner_id = s.user_id and s.round = f.last_round
  )                                                as rooms_won
from sides s
join finals f on f.room_id = s.room_id
group by s.user_id;

-- `create or replace view` keeps the existing grants, but stating them costs nothing and
-- the Supabase image's blanket grants are why 0008 exists.
revoke all on pvp_records from anon;
grant select on pvp_records to authenticated;

commit;
