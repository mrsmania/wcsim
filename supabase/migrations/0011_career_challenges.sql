-- Accounts: the career carries its completed challenges.
--
-- Roadmap item 01. Challenges are permanent honours over a finished Cup Run, each
-- completable once and each worth Prestige. The completed set is career state, so it
-- rides the existing career row rather than earning a table of its own: one column,
-- and the two functions that write a career learn to carry it.
--
-- The client does not need this migration to work. `careerFromRow` reads the column as
-- optional and falls back to an empty set, and `save_career` ignores a key it does not
-- know about, so a signed-in player on a server without this simply does not have their
-- challenge progress persisted - guests, and every other feature, are unaffected. That
-- is deliberate: the client is deployed by pushing to main while migrations are applied
-- by hand on the NAS, so the two are never in lockstep and neither order may break.
--
-- Grants are not repeated here: `create or replace` keeps a function's ACL, and both
-- signatures are unchanged, so 0008's revoke-from-anon still stands. (0010 re-granted
-- because it introduced a new function NAME, which starts life PUBLIC.)

alter table career add column if not exists completed_challenges text[] not null default '{}';

-- --------------------------------------------------------------------------
-- save_career: as 0006, plus the completed set. Ids are opaque strings from the
-- catalogue in domain/challenges.ts; the server does not know them and does not need
-- to, exactly like `unlocked_boons`.
-- --------------------------------------------------------------------------

create or replace function save_career(p_career jsonb, p_expected_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
  new_xp integer := (p_career->>'xp')::integer;
  new_prestige integer := (p_career->>'prestige')::integer;
begin
  if new_xp is null or new_prestige is null then
    raise exception 'career payload must carry xp and prestige';
  end if;
  if new_xp < 0 or new_prestige < 0 then
    raise exception 'career values may not be negative';
  end if;

  v := bump_version(p_expected_version);

  insert into career (user_id, xp, prestige, perk_levels, unlocked_boons, ascension, last_ascension,
                      completed_challenges, stats)
  values (
    auth.uid(), new_xp, new_prestige,
    coalesce(p_career->'perkLevels', '{}'::jsonb),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_career->'unlockedBoons', '[]'::jsonb)) as value), '{}'),
    coalesce((p_career->>'ascension')::integer, 0),
    (p_career->>'lastAscension')::integer,
    coalesce((select array_agg(value::text)
              from jsonb_array_elements_text(coalesce(p_career->'completedChallenges', '[]'::jsonb)) as value), '{}'),
    coalesce(p_career->'stats', '{}'::jsonb)
  )
  on conflict (user_id) do update set
    xp = excluded.xp, prestige = excluded.prestige, perk_levels = excluded.perk_levels,
    unlocked_boons = excluded.unlocked_boons, ascension = excluded.ascension,
    last_ascension = excluded.last_ascension, completed_challenges = excluded.completed_challenges,
    stats = excluded.stats;

  perform audit('career_write', jsonb_build_object('xp', new_xp, 'prestige', new_prestige));
  return v;
end;
$$;

-- --------------------------------------------------------------------------
-- import_guest_progress: as 0003, plus the completed set, so a guest who signs in
-- keeps the honours they earned before they had an account.
-- --------------------------------------------------------------------------

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

  insert into career (user_id, xp, prestige, perk_levels, unlocked_boons, ascension, last_ascension,
                      completed_challenges, stats)
  values (
    uid,
    coalesce((p_payload->'career'->>'xp')::integer, 0),
    coalesce((p_payload->'career'->>'prestige')::integer, 0),
    coalesce(p_payload->'career'->'perkLevels', '{}'::jsonb),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'career'->'unlockedBoons', '[]'::jsonb)) as value), '{}'),
    coalesce((p_payload->'career'->>'ascension')::integer, 0),
    (p_payload->'career'->>'lastAscension')::integer,
    coalesce((select array_agg(value::text)
              from jsonb_array_elements_text(coalesce(p_payload->'career'->'completedChallenges', '[]'::jsonb)) as value), '{}'),
    coalesce(p_payload->'career'->'stats', '{}'::jsonb)
  )
  on conflict (user_id) do update set
    xp = excluded.xp, prestige = excluded.prestige, perk_levels = excluded.perk_levels,
    unlocked_boons = excluded.unlocked_boons, ascension = excluded.ascension,
    last_ascension = excluded.last_ascension, completed_challenges = excluded.completed_challenges,
    stats = excluded.stats;

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
