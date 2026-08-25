-- Accounts: the function surface. See docs/cloud-sync-design.md §6 and §7.
--
-- Everything that creates or spends album currency lives here, `security definer`, so
-- the rules hold even though the browser talks to the database directly (D3, FR-18 to
-- FR-21). Each function: validates, writes, bumps state_version, and audits.
--
-- The one invariant everything else rests on: `finish_run` is the ONLY place stickers,
-- xp and prestige are created.

begin;

-- --------------------------------------------------------------------------
-- Internals
-- --------------------------------------------------------------------------

-- Bump the concurrency counter, rejecting a write that carries a stale version
-- (FR-11). `expected` null skips the check, for writes where last-one-wins is fine
-- (settings). Returns the new version.
--
-- SUPERSEDED BY 0007. The `errcode = '40001'` below is a bug: PostgREST treats that
-- SQLSTATE as retryable and retries a deterministically-failing transaction until the
-- gateway times out, so a genuine other-device conflict looked like a hang. 0007 raises
-- PT409 instead, which PostgREST answers as a 409. Do not copy this body; see
-- README.md in this directory for where each function is currently defined.
create or replace function bump_version(expected integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
begin
  select state_version into current_version from profiles where id = auth.uid() for update;
  if current_version is null then
    raise exception 'no profile for this account';
  end if;
  if expected is not null and expected <> current_version then
    raise exception 'stale_version: account is at %, write carried %', current_version, expected
      using errcode = '40001';
  end if;
  update profiles set state_version = current_version + 1 where id = auth.uid();
  return current_version + 1;
end;
$$;

create or replace function audit(p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (user_id, kind, payload) values (auth.uid(), p_kind, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function economy_constant(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select value from economy_constants where key = p_key;
$$;

-- Duplicates available to spend: every copy beyond the first, any tier (FR-20).
create or replace function duplicate_pool(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(copies - 1), 0)::integer from album_stickers where user_id = p_user;
$$;

-- Add one copy of a sticker, mirroring the client's `addCopy`: first copy collects,
-- later copies bump the duplicate counter. Returns true when it was NEW.
create or replace function add_copy(p_user uuid, p_player_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  was_new boolean;
begin
  insert into album_stickers (user_id, player_id, copies)
  values (p_user, p_player_id, 1)
  on conflict (user_id, player_id) do update set copies = album_stickers.copies + 1
  returning (album_stickers.copies = 1) into was_new;
  return was_new;
end;
$$;

-- --------------------------------------------------------------------------
-- Plain blob writes
-- --------------------------------------------------------------------------

create or replace function save_game(p_data jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  v := bump_version(p_expected_version);
  insert into game_state (user_id, data, updated_at) values (auth.uid(), p_data, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = now();
  return v;
end;
$$;

-- `p_data` null drops the run (a new build, an abandon), matching the client's
-- saveRun(null).
create or replace function save_run(p_data jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  v := bump_version(p_expected_version);
  if p_data is null then
    delete from active_run where user_id = auth.uid();
  else
    insert into active_run (user_id, data, updated_at) values (auth.uid(), p_data, now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;
  return v;
end;
$$;

create or replace function save_settings(p_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into settings (user_id, data) values (auth.uid(), p_data)
  on conflict (user_id) do update set data = excluded.data;
$$;

-- --------------------------------------------------------------------------
-- Career: spending only
-- --------------------------------------------------------------------------

-- Perk buys and boost unlocks are ordinary client actions that SPEND currency, so
-- rather than mirroring the whole perk table here, this enforces one rule: xp and
-- prestige may never RISE outside finish_run (design §6, the Prestige invariant).
-- Under-spending is possible and tolerated (D3); minting is not.
-- SUPERSEDED BY 0011 (via 0006). Do not copy this body; see README.md in this directory.
create or replace function save_career(p_career jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
  cur_xp integer;
  cur_prestige integer;
  new_xp integer := (p_career->>'xp')::integer;
  new_prestige integer := (p_career->>'prestige')::integer;
begin
  select xp, prestige into cur_xp, cur_prestige from career where user_id = auth.uid();
  cur_xp := coalesce(cur_xp, 0);
  cur_prestige := coalesce(cur_prestige, 0);

  if new_xp is null or new_prestige is null then
    raise exception 'career payload must carry xp and prestige';
  end if;
  if new_xp > cur_xp then
    raise exception 'xp may only be awarded by finish_run (% -> %)', cur_xp, new_xp;
  end if;
  if new_prestige > cur_prestige then
    raise exception 'prestige may only be awarded by finish_run (% -> %)', cur_prestige, new_prestige;
  end if;

  v := bump_version(p_expected_version);

  insert into career (user_id, xp, prestige, perk_levels, unlocked_boons, ascension, last_ascension, stats)
  values (
    auth.uid(),
    new_xp,
    new_prestige,
    coalesce(p_career->'perkLevels', '{}'::jsonb),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_career->'unlockedBoons', '[]'::jsonb)) as value), '{}'),
    coalesce((p_career->>'ascension')::integer, 0),
    (p_career->>'lastAscension')::integer,
    coalesce(p_career->'stats', '{}'::jsonb)
  )
  on conflict (user_id) do update set
    xp = excluded.xp,
    prestige = excluded.prestige,
    perk_levels = excluded.perk_levels,
    unlocked_boons = excluded.unlocked_boons,
    ascension = excluded.ascension,
    last_ascension = excluded.last_ascension,
    stats = excluded.stats;

  perform audit('career_spend', jsonb_build_object('xp', new_xp, 'prestige', new_prestige));
  return v;
end;
$$;

-- --------------------------------------------------------------------------
-- finish_run: the only place currency is created
-- --------------------------------------------------------------------------

-- Banks a finished run in one transaction: the final XI's collectibles, the cup pick,
-- the career award (computed HERE, not taken from the client), album_stats, the
-- run_results row, and clearing the active run.
--
-- Idempotent per run: the unique (user_id, run_key) on run_results is what enforces
-- "applied at most once", the server-side twin of the client's stickersApplied flag.
--
-- Validation (FR-19): every id must be an ACTIVE collectible; a cup pick only on a
-- won cup, never Monumental, never already collected; swaps within the cap.
-- Returns the ids that were newly collected (for the run-end summary).
-- SUPERSEDED BY 0010 (via 0006 and 0009). Do not copy this body; see README.md here.
create or replace function finish_run(
  p_run_key           text,
  p_collectible_ids   text[],
  p_won_cup           boolean,
  p_cup_pick          text,
  p_swaps_used        integer,
  p_outcome           text,
  p_ascension         integer,
  p_score             integer,
  p_rounds_won        integer,
  p_xi                jsonb,
  p_xp_gained         integer,
  p_prestige_gained   integer,
  p_expected_version  integer
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  max_swaps integer := coalesce(economy_constant('max_swaps_per_run'), 2);
  ids text[] := coalesce(p_collectible_ids, '{}');
  bad_count integer;
  pick_tier text;
  newly text[] := '{}';
  one_id text;
  was_new boolean;
  v integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- Once per run. Claim the run first, so a double submit fails here and nothing else runs.
  insert into run_results (user_id, run_key, outcome, ascension, score, won_cup, rounds_won, xi)
  values (uid, p_run_key, p_outcome, coalesce(p_ascension, 0), coalesce(p_score, 0),
          coalesce(p_won_cup, false), coalesce(p_rounds_won, 0), coalesce(p_xi, '[]'::jsonb));
  -- (a duplicate run_key raises unique_violation, which is the intended rejection)

  if array_length(ids, 1) > 12 then
    raise exception 'too many collectibles for one run: %', array_length(ids, 1);
  end if;

  if coalesce(p_swaps_used, 0) > max_swaps then
    raise exception 'swaps_used % exceeds the cap of %', p_swaps_used, max_swaps;
  end if;

  -- Every submitted id must be a currently-collectible player.
  select count(*) into bad_count
  from unnest(ids) as submitted(player_id)
  where not exists (
    select 1 from collectibles c where c.player_id = submitted.player_id and c.active
  );
  if bad_count > 0 then
    raise exception '% submitted id(s) are not active collectibles', bad_count;
  end if;

  -- The cup pick: only on a won cup, not Monumental (album spec FR-3 / D-1), and not
  -- something already in the album.
  if p_cup_pick is not null then
    if not coalesce(p_won_cup, false) then
      raise exception 'cup pick without a cup win';
    end if;
    select tier into pick_tier from collectibles where player_id = p_cup_pick and active;
    if pick_tier is null then
      raise exception 'cup pick % is not an active collectible', p_cup_pick;
    end if;
    if pick_tier = 'monumental' then
      raise exception 'cup pick may not be Monumental';
    end if;
    if exists (select 1 from album_stickers where user_id = uid and player_id = p_cup_pick) then
      raise exception 'cup pick % is already collected', p_cup_pick;
    end if;
    ids := ids || p_cup_pick;
  end if;

  v := bump_version(p_expected_version);

  foreach one_id in array ids loop
    was_new := add_copy(uid, one_id);
    if was_new then
      newly := newly || one_id;
    end if;
  end loop;

  insert into album_stats (user_id, runs_played, stickers_earned, trades_completed)
  values (uid, 1, coalesce(array_length(newly, 1), 0), 0)
  on conflict (user_id) do update set
    runs_played = album_stats.runs_played + 1,
    stickers_earned = album_stats.stickers_earned + coalesce(array_length(newly, 1), 0);

  -- The career award is computed from the run, never trusted from the client. The
  -- caller's figures are recorded in the audit log so a mismatch is visible.
  insert into career (user_id, xp, prestige)
  values (uid, greatest(coalesce(p_score, 0), 0), case when coalesce(p_won_cup, false) then 1 else 0 end)
  on conflict (user_id) do update set
    xp = career.xp + greatest(coalesce(p_score, 0), 0),
    prestige = career.prestige + case when coalesce(p_won_cup, false) then 1 else 0 end;

  delete from active_run where user_id = uid;

  perform audit('finish_run', jsonb_build_object(
    'run_key', p_run_key,
    'outcome', p_outcome,
    'ascension', p_ascension,
    'won_cup', p_won_cup,
    'earned', ids,
    'newly', newly,
    'client_xp_claim', p_xp_gained,
    'client_prestige_claim', p_prestige_gained
  ));

  return newly;
end;
$$;

-- --------------------------------------------------------------------------
-- Trades
-- --------------------------------------------------------------------------

-- Spend duplicates on one chosen sticker of the target tier (FR-20). Affordability is
-- checked against the server's own row totals, and the deduction order is arbitrary
-- and not user-visible, exactly as the client's executeTrade documents.
create or replace function execute_trade(
  p_target_tier      text,
  p_player_id        text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cost integer := economy_constant('trade_cost_' || p_target_tier);
  pool integer;
  remaining integer;
  row_rec record;
  take integer;
  v integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if cost is null then
    raise exception 'unknown tier %', p_target_tier;
  end if;

  if not exists (
    select 1 from collectibles
    where player_id = p_player_id and tier = p_target_tier and active
  ) then
    raise exception '% is not an active % collectible', p_player_id, p_target_tier;
  end if;
  if exists (select 1 from album_stickers where user_id = uid and player_id = p_player_id) then
    raise exception '% is already collected', p_player_id;
  end if;

  pool := duplicate_pool(uid);
  if pool < cost then
    raise exception 'trade needs % duplicates, pool has %', cost, pool;
  end if;

  v := bump_version(p_expected_version);

  remaining := cost;
  for row_rec in
    select player_id, copies from album_stickers
    where user_id = uid and copies > 1
    order by copies desc, player_id
  loop
    exit when remaining <= 0;
    take := least(row_rec.copies - 1, remaining);
    update album_stickers set copies = copies - take
    where user_id = uid and player_id = row_rec.player_id;
    remaining := remaining - take;
  end loop;

  if remaining > 0 then
    raise exception 'trade could not be paid for (short by %)', remaining;
  end if;

  perform add_copy(uid, p_player_id);

  insert into album_stats (user_id, trades_completed) values (uid, 1)
  on conflict (user_id) do update set trades_completed = album_stats.trades_completed + 1;

  perform audit('trade', jsonb_build_object('tier', p_target_tier, 'received', p_player_id, 'cost', cost));
  return v;
end;
$$;

-- --------------------------------------------------------------------------
-- The one-time guest import (FR-15, FR-16, FR-16a)
-- --------------------------------------------------------------------------

-- Moves a guest's local progress into an EMPTY account, in one transaction. Refuses
-- if the account already holds anything, which is what makes it once-per-account and
-- one-way. The client deletes its local copy only after this returns (FR-16a
-- ordering), so a failure here leaves the only copy intact.
-- SUPERSEDED BY 0011. Do not copy this body; see README.md in this directory.
create or replace function import_guest_progress(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ids text[];
  one_id text;
  copies_of integer;
  i integer;
  v integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  if exists (select 1 from album_stickers where user_id = uid)
     or exists (select 1 from run_results where user_id = uid)
     or exists (select 1 from career where user_id = uid and (xp > 0 or prestige > 0))
  then
    raise exception 'account already has progress; import is once per account';
  end if;

  -- Album: {collected: [id], duplicates: {id: n}}. Only active collectibles land.
  select coalesce(array_agg(value), '{}') into ids
  from jsonb_array_elements_text(coalesce(p_payload->'album'->'collected', '[]'::jsonb)) as value
  where exists (select 1 from collectibles c where c.player_id = value and c.active);

  foreach one_id in array ids loop
    copies_of := 1 + coalesce((p_payload->'album'->'duplicates'->>one_id)::integer, 0);
    for i in 1..copies_of loop
      perform add_copy(uid, one_id);
    end loop;
  end loop;

  insert into album_stats (user_id, runs_played, stickers_earned, trades_completed)
  values (
    uid,
    coalesce((p_payload->'albumStats'->>'runsPlayed')::integer, 0),
    coalesce((p_payload->'albumStats'->>'stickersEarned')::integer, 0),
    coalesce((p_payload->'albumStats'->>'tradesCompleted')::integer, 0)
  )
  on conflict (user_id) do update set
    runs_played = excluded.runs_played,
    stickers_earned = excluded.stickers_earned,
    trades_completed = excluded.trades_completed;

  insert into career (user_id, xp, prestige, perk_levels, unlocked_boons, ascension, last_ascension, stats)
  values (
    uid,
    coalesce((p_payload->'career'->>'xp')::integer, 0),
    coalesce((p_payload->'career'->>'prestige')::integer, 0),
    coalesce(p_payload->'career'->'perkLevels', '{}'::jsonb),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'career'->'unlockedBoons', '[]'::jsonb)) as value), '{}'),
    coalesce((p_payload->'career'->>'ascension')::integer, 0),
    (p_payload->'career'->>'lastAscension')::integer,
    coalesce(p_payload->'career'->'stats', '{}'::jsonb)
  )
  on conflict (user_id) do update set
    xp = excluded.xp, prestige = excluded.prestige, perk_levels = excluded.perk_levels,
    unlocked_boons = excluded.unlocked_boons, ascension = excluded.ascension,
    last_ascension = excluded.last_ascension, stats = excluded.stats;

  if p_payload ? 'settings' then
    insert into settings (user_id, data) values (uid, p_payload->'settings')
    on conflict (user_id) do update set data = excluded.data;
  end if;

  if p_payload ? 'game' and jsonb_typeof(p_payload->'game') = 'object' then
    insert into game_state (user_id, data) values (uid, p_payload->'game')
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;

  if p_payload ? 'run' and jsonb_typeof(p_payload->'run') = 'object' then
    insert into active_run (user_id, data) values (uid, p_payload->'run')
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;

  v := bump_version(null);
  perform audit('import_guest_progress', jsonb_build_object('stickers', coalesce(array_length(ids, 1), 0)));
  return v;
end;
$$;

-- --------------------------------------------------------------------------
-- Data rights (FR-24, FR-25)
-- --------------------------------------------------------------------------

-- Export: with backups deliberately out of scope (NFR-6), this is the only way a
-- player holds a copy of their own album.
create or replace function export_account()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'album', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'copies', copies) order by player_id), '[]'::jsonb)
              from album_stickers where user_id = auth.uid()),
    'album_stats', (select to_jsonb(s) - 'user_id' from album_stats s where s.user_id = auth.uid()),
    'career', (select to_jsonb(c) - 'user_id' from career c where c.user_id = auth.uid()),
    'settings', (select data from settings where user_id = auth.uid()),
    'runs', (select coalesce(jsonb_agg(to_jsonb(r) - 'user_id' order by r.ended_at), '[]'::jsonb)
             from run_results r where r.user_id = auth.uid())
  );
$$;

-- Deleting the Auth user cascades through every table (profiles is the root).
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform audit('delete_account', '{}'::jsonb);
  delete from auth.users where id = auth.uid();
end;
$$;

commit;
