-- Accounts: tables. See docs/cloud-sync-design.md §4.
--
-- One row per account per bucket, keyed on the Auth user id. Normalized where
-- something has to be queried or validated server-side (the album, finished runs);
-- a jsonb blob where only its owner ever reads it (the game, the in-progress run,
-- settings). Blobs keep tolerating older shapes, exactly as the client's storage
-- modules already do (e.g. the career v1 -> v2 read migration).

begin;

-- --------------------------------------------------------------------------
-- Identity
-- --------------------------------------------------------------------------

-- One profile per Auth user. `state_version` is the concurrency counter (FR-11):
-- every write function bumps it, and a write carrying a stale value is rejected so
-- the second signed-in device reloads instead of overwriting.
create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  state_version integer not null default 0,
  created_at    timestamptz not null default now()
);

-- The invite gate (D12). Signup is refused for any address absent here; opening
-- signup later is dropping the trigger in 0004, not a code change.
create table if not exists allowed_emails (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Reference data (generated: supabase/seed/collectibles.sql)
-- --------------------------------------------------------------------------

-- Who is collectible, and at what tier. Derived from player ratings in the
-- TypeScript dataset, which SQL cannot read - hence the generated seed and the
-- `npm run checks` drift guard (design §3). `active` goes false when a rating tweak
-- drops someone out of the bands: no new copies can be earned, but albums that
-- already hold them keep working.
create table if not exists collectibles (
  player_id   text primary key,
  tier        text not null check (tier in ('legendary', 'iconic', 'monumental')),
  elo         integer not null,
  name        text not null,
  squad_id    text not null,
  nation_code text not null,
  year        integer not null,
  active      boolean not null default true
);

create index if not exists collectibles_tier_idx on collectibles (tier) where active;

-- Economy constants mirrored from src/config.ts by the same generator, so the trade
-- costs and the swap cap cannot drift from the client's copy.
create table if not exists economy_constants (
  key   text primary key,
  value integer not null
);

-- --------------------------------------------------------------------------
-- The album (normalized)
-- --------------------------------------------------------------------------

-- The client's AlbumState is {collected: id[], duplicates: {id: n}}. One row per
-- owned sticker collapses both: the row existing means collected, and `copies - 1`
-- is the duplicate count. So the trade currency is a sum the server can verify
-- (FR-20) rather than a number the client asserts.
create table if not exists album_stickers (
  user_id   uuid not null references profiles (id) on delete cascade,
  player_id text not null references collectibles (player_id),
  copies    integer not null default 1 check (copies >= 1),
  primary key (user_id, player_id)
);

-- Trade-cost telemetry (the client's wcsim_album_stats_v1).
create table if not exists album_stats (
  user_id          uuid primary key references profiles (id) on delete cascade,
  runs_played      integer not null default 0,
  stickers_earned  integer not null default 0,
  trades_completed integer not null default 0
);

-- --------------------------------------------------------------------------
-- Career, settings, and the two blobs
-- --------------------------------------------------------------------------

-- Mirrors CareerState. `level` is deliberately absent: it is derived from xp
-- (`levelForXp`), and storing it would be a second truth.
create table if not exists career (
  user_id        uuid primary key references profiles (id) on delete cascade,
  xp             integer not null default 0 check (xp >= 0),
  prestige       integer not null default 0 check (prestige >= 0),
  perk_levels    jsonb not null default '{}'::jsonb,
  unlocked_boons text[] not null default '{}',
  ascension      integer not null default 0,
  last_ascension integer,
  stats          jsonb not null default '{}'::jsonb
);

create table if not exists settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  data    jsonb not null
);

-- The Quick Run GameState.
create table if not exists game_state (
  user_id    uuid primary key references profiles (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- At most one in-progress Cup Run per account (FR-17), enforced by the primary key.
-- The in-flight match reveal is deliberately NOT stored: as today, a refresh
-- mid-reveal replays the current match.
create table if not exists active_run (
  user_id    uuid primary key references profiles (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- History and audit (append-only)
-- --------------------------------------------------------------------------

-- Finished runs. Append-only, and the reason leaderboards will not need a migration
-- later (§3 of the requirements): the result of every run is already recorded per
-- account. `run_key` is the client's run identity, and the unique constraint is what
-- makes banking a run's stickers idempotent (FR-19, once per run).
create table if not exists run_results (
  id         bigserial primary key,
  user_id    uuid not null references profiles (id) on delete cascade,
  run_key    text not null,
  ended_at   timestamptz not null default now(),
  outcome    text not null,
  ascension  integer not null default 0,
  score      integer not null default 0,
  won_cup    boolean not null default false,
  rounds_won integer not null default 0,
  xi         jsonb not null,
  unique (user_id, run_key)
);

create index if not exists run_results_user_idx on run_results (user_id, ended_at desc);

-- Every earn, trade, import and account deletion (FR-21). Written by the functions,
-- never by a client.
create table if not exists audit_log (
  id      bigserial primary key,
  user_id uuid references profiles (id) on delete set null,
  kind    text not null,
  payload jsonb not null default '{}'::jsonb,
  at      timestamptz not null default now()
);

create index if not exists audit_log_user_idx on audit_log (user_id, at desc);

commit;
