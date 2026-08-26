-- 0016_pvp_rooms.sql
--
-- Roadmap item 18 (player versus player), wave 2 of docs/pvp-plan.md. The tables a room
-- lives in, their row-level security, and the referee's own database role.
--
-- NOTHING READS OR WRITES THESE YET. The referee is wave 3 and the screens are waves 5 to
-- 8, so applying this file changes nothing a player can see. It is written now because the
-- house rule (CLAUDE.md, 2026-08-24) is that a migration is queued before the code that
-- needs it, and because the shape is the half of this feature that cannot be changed later
-- without a second migration.
--
-- WHAT IT ADDS
--   * `profiles.display_name` and `profiles.name_key` - a room cannot show strangers an
--     email address. Unique on the NORMALISED key, never on the raw text (plan P22).
--   * seven `pvp_*` tables, and `pvp_records` as a VIEW rather than a counter (plan P36).
--   * a `pvp_referee` role that owns them and can reach nothing else (plan P34).
--
-- FOUR THINGS HERE ARE DECISIONS, NOT SHAPES, and each is the kind that cannot be
-- retrofitted once there is data:
--
-- 1. UNIQUENESS IS ON A NORMALISED KEY. `name_key` is the display name folded to lower
--    case with whitespace collapsed; the client also strips zero-width characters and owns
--    the codepoint set, because SQL is the wrong place for that. Unique on raw text would
--    let `Mario`, `mario` and `Mario ` all coexist, indistinguishable in a lobby - the cheap
--    grief in a game whose only moderation is the owner renaming an account by hand.
--    Records key on the account, so a rename stays free.
--
-- 2. `pvp_records` IS A VIEW. A lifetime counter corrupted by a retried write cannot be
--    repaired from the data, and a ladder will be built on this. Deriving it costs a
--    slightly dearer query at a scale where that is nothing, and makes a double-counted win
--    impossible rather than unlikely. The same reasoning as `career.level`, which 0001
--    deliberately does not store because it is derived from xp.
--
-- 3. FORMATION AND STYLE LIVE IN THEIR OWN TABLE (`pvp_lineups`), not on the member row.
--    They are chosen in the lobby (P19) precisely because they shape all eleven picks, so a
--    member row readable by a whole public lobby would let the last person to choose
--    counter everyone else. Row-level security is row-level: you cannot hide two columns of
--    a row somebody may read. A separate table with its own policy can.
--
-- 4. THE VIEW IS `security_invoker`. Without it a view runs with its OWNER's rights, and
--    its owner here is the migration's superuser, so `select * from pvp_records` would
--    return every account's record to anybody signed in - row-level security on
--    `pvp_matches` silently bypassed by the thing reading it. **This needs PostgreSQL 15 or
--    newer.** If the server is on 14 the option is a syntax error, which is the loud
--    failure and the right one; see the verification steps.
--
-- WHAT THE REFEREE ROLE IS FOR. It OWNS the pvp tables, which is what lets it read and
-- write them past the policies below, and it has no privilege on `career`,
-- `album_stickers`, `settings`, `game_state`, `active_run`, `run_results` or `audit_log` at
-- all. It deliberately does NOT get `bypassrls`: that attribute is global, so it would hand
-- the referee every account's album and career - the exact opposite of the point. The
-- referee is the only component in this design that accepts un-RLS'd input from the
-- internet, so its blast radius is the thing to keep small.
--
-- It is created NOLOGIN and with no password on purpose: a credential does not belong in
-- version control. Wave 3 runs `alter role pvp_referee login password '...'` by hand on the
-- NAS, and until it does this role can do nothing at all.
--
-- ONE RULE THIS FILE DOES NOT ENFORCE, and says so rather than pretending. Plan P39 is one
-- active room per account. A unique index cannot express it (the "active" half lives in
-- another table's `status`) and a trigger would be a second place the rule lives. The
-- referee is the only writer, so the referee enforces it. `primary key (room_id, user_id)`
-- below does enforce the half that IS expressible: one seat per person per room, which is
-- what stops one account taking two seats from a phone and a laptop.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `select version();` first. If it is PostgreSQL 14 or older this file will have
--      failed on the view; see decision 4 above before doing anything else.
--   2. `select display_name, name_key from profiles limit 5;` - both columns exist and are
--      null for every existing account. Nothing should have been backfilled.
--   3. In a transaction, set two accounts' `name_key` to 'mario' and confirm the second is
--      refused by `profiles_name_key_uniq`. Roll it back.
--   4. `\dt pvp_*` then `\d pvp_rooms` - seven tables, and the owner is `pvp_referee`.
--   5. As an ORDINARY signed-in user (a browser session, not psql): `select * from
--      pvp_rooms` returns nothing, and `insert into pvp_rooms ...` is refused. Both matter:
--      the first proves the policy is not wide open, the second that there is no write path.
--   6. `select * from pvp_records;` - the view exists and is empty.
--   7. Sign in and play a normal single-player run to the end, banking stickers. NOTHING in
--      this file touches that path, and confirming it is untouched is the point of checking.
--
-- ROLLBACK (complete, and in this order - nothing outside this file is altered). The
-- `drop owned by` is not decoration: a role cannot be dropped while any privilege is still
-- granted to it, and this one holds a column grant on `profiles` and usage on the schema,
-- so `drop role` on its own fails with "objects depend on it" at the worst moment. Found by
-- parse-and-reason rather than by trying it in anger, which is the point of writing the
-- rollback out before it is needed.
--   begin;
--   drop view if exists pvp_records;
--   drop table if exists pvp_name_reports, pvp_matches, pvp_picks, pvp_deals,
--                        pvp_lineups, pvp_members, pvp_rooms cascade;
--   drop function if exists pvp_tie_played(bigint, uuid);
--   drop function if exists pvp_is_member(bigint);
--   alter table profiles drop column if exists name_key;
--   alter table profiles drop column if exists display_name;
--   drop owned by pvp_referee;
--   drop role if exists pvp_referee;
--   commit;
-- (`profiles_name_key_uniq` needs no line of its own: dropping `name_key` takes it.)

begin;

-- --------------------------------------------------------------------------
-- The referee's role
-- --------------------------------------------------------------------------

-- A `do` block because `create role if not exists` does not exist, and re-running a
-- migration should not be the thing that fails.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pvp_referee') then
    create role pvp_referee nologin;
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- A name a stranger can be shown
-- --------------------------------------------------------------------------

alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists name_key     text;

-- Unique on the folded key, and only where one is set: every existing account has none, and
-- a null name must not collide with another null.
create unique index if not exists profiles_name_key_uniq
  on profiles (name_key)
  where name_key is not null;

-- --------------------------------------------------------------------------
-- The room
-- --------------------------------------------------------------------------

create table if not exists pvp_rooms (
  id            bigserial primary key,
  -- Shared out of band for a private room, listed in the lobby for a public one.
  code          text not null unique,
  visibility    text not null check (visibility in ('public', 'private')),
  host_id       uuid not null references profiles (id) on delete cascade,
  size          integer not null check (size in (2, 4, 8)),
  -- The host's rules. `method` decides whether `budget` means anything at all.
  method        text not null check (method in ('roll', 'budget')),
  budget_source text not null check (budget_source in ('fixed', 'career')),
  budget        integer not null check (budget between 0 and 1000),
  -- The World Cups this room draws from. EMPTY means every tournament, exactly as the
  -- `poolYears` setting does - never a literal list of every current year, which is the bug
  -- that once hid a whole tournament from every existing save.
  years         integer[] not null default '{}',
  show_ratings  boolean not null default true,
  rerolls       integer not null check (rerolls between 0 and 6),
  -- 20 or 30 (plan P20). Two values and not a slider, so a listing can say fast or
  -- considered and a ladder can compare like with like.
  pick_seconds  integer not null check (pick_seconds in (20, 30)),
  status        text not null default 'lobby'
                  check (status in ('lobby', 'drafting', 'round', 'ended')),
  round         integer not null default 0 check (round >= 0),
  champion_id   uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  -- What P31's garbage collection reads to close a room nobody has touched, and the
  -- sweeper's cheap "is anything due here" filter.
  touched_at    timestamptz not null default now()
);

-- The lobby list: open public rooms, newest first.
create index if not exists pvp_rooms_open_idx
  on pvp_rooms (created_at desc)
  where visibility = 'public' and status = 'lobby';

-- What the sweeper scans.
create index if not exists pvp_rooms_live_idx
  on pvp_rooms (touched_at)
  where status in ('drafting', 'round');

create table if not exists pvp_members (
  room_id    bigint not null references pvp_rooms (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  -- Join order, and a LABEL that decides nothing: the bracket is drawn at random after the
  -- draft (P47), which is what stops two people sharing a private code from agreeing who
  -- joins first and so arranging the tree between them.
  seat       integer not null,
  ready      boolean not null default false,
  -- Snapshotted at the start (P2). Never read live from a career: that would need the
  -- referee to hold privileges on `career`, and a Transfer Budget perk bought mid-draft
  -- would change the budget an XI is validated against.
  budget     integer not null default 0,
  -- P31's liveness. Closing a tab fires no reliable event, so leaving has to be observed
  -- rather than announced.
  last_seen  timestamptz not null default now(),
  out_in     integer,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- Formation and style, apart from the member row. See decision 3 in the header.
create table if not exists pvp_lineups (
  room_id        bigint not null references pvp_rooms (id) on delete cascade,
  user_id        uuid not null references profiles (id) on delete cascade,
  formation_name text not null,
  style          text not null check (style in ('def', 'bal', 'off')),
  primary key (room_id, user_id)
);

-- --------------------------------------------------------------------------
-- The draft
-- --------------------------------------------------------------------------

-- One squad dealt to one player. One ROW at a time (P13): writing the whole sequence up
-- front would let a player read every future squad, re-roll outcomes included, straight off
-- their own row.
create table if not exists pvp_deals (
  room_id   bigint not null references pvp_rooms (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  dealt_seq integer not null check (dealt_seq >= 1),
  squad_id  text not null,
  dealt_at  timestamptz not null default now(),
  primary key (room_id, user_id, dealt_seq)
);

-- The CURRENT STATE of a player's XI, one row per filled slot - not an append-only pick log
-- (P42). Placing a player promotes the slot's role onto him, so moving two multi-position
-- players changes both of the numbers the simulator reads without changing who is in the
-- team; a log cannot express that and a slot map can.
create table if not exists pvp_picks (
  room_id     bigint not null references pvp_rooms (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  slot_id     text not null,
  player_id   text not null,
  -- The ordinal the client believed it was making. Unique per player, so a retry on a flaky
  -- link is idempotent rather than two spent windows (P36).
  ordinal     integer not null check (ordinal >= 1),
  opened_at   timestamptz not null,
  landed_at   timestamptz not null default now(),
  -- Whether the clock made this pick rather than the player. A ladder needs it to discount a
  -- farmed win (see pvp_matches).
  automatic   boolean not null default false,
  primary key (room_id, user_id, slot_id),
  unique (room_id, user_id, ordinal)
);

-- --------------------------------------------------------------------------
-- The rounds
-- --------------------------------------------------------------------------

create table if not exists pvp_matches (
  room_id          bigint not null references pvp_rooms (id) on delete cascade,
  round            integer not null check (round >= 1),
  game             integer not null check (game >= 0),
  home_id          uuid not null references profiles (id) on delete cascade,
  away_id          uuid not null references profiles (id) on delete cascade,
  home_goals       integer not null check (home_goals >= 0),
  away_goals       integer not null check (away_goals >= 0),
  decided          text not null check (decided in ('reg', 'aet', 'pens')),
  events           jsonb not null default '[]'::jsonb,
  pens             jsonb,
  -- Added time for each half, decided by the SERVER (P30). The single-player clock rolls its
  -- own in each browser, which is one of the two reasons "everybody watches the same match"
  -- was not true; the other is playback speed, which is fixed inside a room.
  stoppage         integer[] not null default '{}',
  winner_id        uuid not null references profiles (id) on delete cascade,
  reveal_from      timestamptz not null,
  reveal_ms        integer not null check (reveal_ms >= 0),
  -- The three facts a ladder will need to tell a real win from a farmed one. Two accounts
  -- and one person can collect wins from day one by letting one side idle; nothing is at
  -- stake yet (P9), but this is the corpus a ladder inherits and by then it is too late to
  -- separate them. Three columns now, impossible later.
  room_visibility  text not null check (room_visibility in ('public', 'private')),
  room_size        integer not null check (room_size in (2, 4, 8)),
  loser_auto_picks integer not null default 0 check (loser_auto_picks >= 0),
  created_at       timestamptz not null default now(),
  primary key (room_id, round, game)
);

create index if not exists pvp_matches_home_idx on pvp_matches (home_id);
create index if not exists pvp_matches_away_idx on pvp_matches (away_id);

-- --------------------------------------------------------------------------
-- Reporting a name
-- --------------------------------------------------------------------------

-- Insert-only from the client's point of view, read by the owner with psql. There is no
-- moderation screen and no automatic action (P22): the owner reads this and renames or
-- removes an account by hand, which is the right amount of machinery for a game this size.
create table if not exists pvp_name_reports (
  id           bigserial primary key,
  reporter_id  uuid not null references profiles (id) on delete cascade,
  reported_id  uuid not null references profiles (id) on delete cascade,
  room_id      bigint references pvp_rooms (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- One report per person per target: a report button is not a vote.
  unique (reporter_id, reported_id)
);

-- --------------------------------------------------------------------------
-- Row-level security
-- --------------------------------------------------------------------------

alter table pvp_rooms        enable row level security;
alter table pvp_members      enable row level security;
alter table pvp_lineups      enable row level security;
alter table pvp_deals        enable row level security;
alter table pvp_picks        enable row level security;
alter table pvp_matches      enable row level security;
alter table pvp_name_reports enable row level security;

-- Everything below is SELECT-only for the client. Every write goes through the referee,
-- which owns these tables and therefore bypasses these policies - the same shape
-- `album_stickers` has had since 0002 and for the same reason: the anon key ships in the
-- browser bundle by design, so a writable policy is a way around the rules.

-- Am I in this room? `security definer` avoids the recursion of a `pvp_rooms` policy that
-- reads `pvp_members` whose own policy reads `pvp_rooms`.
create or replace function pvp_is_member(p_room bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pvp_members where room_id = p_room and user_id = auth.uid()
  );
$$;

-- Has this player's tie been simulated? What gates reading somebody else's XI: before that,
-- a blind draft is the whole point.
create or replace function pvp_tie_played(p_room bigint, p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pvp_matches
    where room_id = p_room and (home_id = p_user or away_id = p_user)
  );
$$;

-- 0008's lesson: Postgres makes a new function executable by PUBLIC, and the Supabase image
-- grants to `anon` and `authenticated` on top, so the grants have to be stated.
revoke all on function pvp_is_member(bigint) from public;
revoke all on function pvp_tie_played(bigint, uuid) from public;
grant execute on function pvp_is_member(bigint) to authenticated;
grant execute on function pvp_tie_played(bigint, uuid) to authenticated;

create policy pvp_rooms_visible on pvp_rooms
  for select to authenticated
  using (
    (visibility = 'public' and status = 'lobby')
    or pvp_is_member(id)
  );

create policy pvp_members_visible on pvp_members
  for select to authenticated
  using (
    pvp_is_member(room_id)
    or exists (
      select 1 from pvp_rooms r
      where r.id = pvp_members.room_id
        and r.visibility = 'public'
        and r.status = 'lobby'
    )
  );

-- Only your own shape, and only ever your own. See decision 3 in the header.
create policy pvp_lineups_own on pvp_lineups
  for select to authenticated
  using (user_id = auth.uid());

-- Only your own deals, or a roll room's blind draft leaks in both directions.
create policy pvp_deals_own on pvp_deals
  for select to authenticated
  using (user_id = auth.uid());

-- Your own picks always; somebody else's once their tie has been played.
create policy pvp_picks_visible on pvp_picks
  for select to authenticated
  using (
    user_id = auth.uid()
    or (pvp_is_member(room_id) and pvp_tie_played(room_id, user_id))
  );

create policy pvp_matches_visible on pvp_matches
  for select to authenticated
  using (pvp_is_member(room_id) or home_id = auth.uid() or away_id = auth.uid());

-- A report goes in and never comes back out. No select policy at all, deliberately: the
-- reporter does not need to read it and the reported person must not.
create policy pvp_name_reports_insert on pvp_name_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and reported_id <> auth.uid());

-- --------------------------------------------------------------------------
-- The record, derived
-- --------------------------------------------------------------------------

-- `security_invoker` is load-bearing, not tidiness: see decision 4 in the header. Without
-- it this view reads `pvp_matches` as its own superuser owner and hands every account's
-- record to anybody signed in.
create or replace view pvp_records with (security_invoker = true) as
with sides as (
  select room_id, round, home_id as user_id, winner_id from pvp_matches
  union all
  select room_id, round, away_id as user_id, winner_id from pvp_matches
),
finals as (
  select room_id, max(round) as last_round from pvp_matches group by room_id
)
select
  s.user_id,
  count(*)                                    as played,
  count(*) filter (where s.winner_id = s.user_id)  as won,
  count(*) filter (where s.winner_id <> s.user_id) as lost,
  count(*) filter (
    where s.winner_id = s.user_id and s.round = f.last_round
  )                                           as rooms_won
from sides s
join finals f on f.room_id = s.room_id
group by s.user_id;

-- --------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------

-- Postgres makes a new table reachable by nobody but its owner, but the Supabase image adds
-- blanket grants to `anon` and `authenticated` for the public schema, which is how internal
-- helpers were briefly callable by anyone with the public key (0008). So these are explicit
-- and narrow: read for a signed-in user, insert on the one table that takes one, nothing at
-- all for `anon`, and no write anywhere else.
revoke all on pvp_rooms, pvp_members, pvp_lineups, pvp_deals, pvp_picks, pvp_matches,
  pvp_name_reports from anon, authenticated;
revoke all on pvp_records from anon, authenticated;

grant select on pvp_rooms, pvp_members, pvp_lineups, pvp_deals, pvp_picks, pvp_matches
  to authenticated;
grant insert on pvp_name_reports to authenticated;
grant select on pvp_records to authenticated;

-- The sequences behind the two `bigserial` columns. A client never inserts a room, so only
-- the referee needs them; stated rather than left to the image's blanket grants.
revoke all on sequence pvp_rooms_id_seq from anon, authenticated;
revoke all on sequence pvp_name_reports_id_seq from anon;
grant usage on sequence pvp_name_reports_id_seq to authenticated;

-- The referee OWNS the pvp tables, which is what lets it read and write them past the
-- policies above, and it holds no privilege on career, album_stickers, settings,
-- game_state, active_run, run_results or audit_log. Deliberately NOT `bypassrls`, which is
-- global and would hand it every account's album.
alter table pvp_rooms        owner to pvp_referee;
alter table pvp_members      owner to pvp_referee;
alter table pvp_lineups      owner to pvp_referee;
alter table pvp_deals        owner to pvp_referee;
alter table pvp_picks        owner to pvp_referee;
alter table pvp_matches      owner to pvp_referee;
alter table pvp_name_reports owner to pvp_referee;

-- The referee reads a display name to put in a room, and nothing else on profiles.
grant usage on schema public to pvp_referee;
grant select (id, display_name, name_key) on profiles to pvp_referee;

commit;
