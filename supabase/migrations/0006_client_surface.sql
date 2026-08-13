-- Accounts: align the function surface with what the client actually sends.
--
-- 0003 was written before the client existed and assumed one call could bank a run's
-- stickers AND compute its career award. In the app those are two different moments in
-- two different places: the album hook knows the sticker facts, while CupRunScreen owns
-- the career (`applyRunResult`). Forcing them together would have meant threading run
-- state through the album hook for no gain.
--
-- So finish_run keeps everything that protects the COLLECTION and gives up the career
-- award:
--   * every id must be an active collectible          (FR-19)
--   * a cup pick only on a win, never Monumental, never already owned
--   * the swap cap
--   * once per run, enforced by the run_key
-- and career progression becomes a client write, validated only for shape.
--
-- That is a deliberate step back from FR-18 on the career specifically, taken under D3
-- ("trust the client with sanity limits"): every career write is still audited, so
-- absurd values are visible after the fact. The sticker economy, which is the thing
-- worth protecting, is unchanged. Revisit if the audience ever stops being friends.

begin;

drop function if exists finish_run(text, text[], boolean, text, integer, text, integer, integer, integer, jsonb, integer, integer, integer);

create or replace function finish_run(
  p_run_key          text,
  p_collectible_ids  text[],
  p_won_cup          boolean,
  p_cup_pick         text,
  p_swaps_used       integer,
  p_outcome          text,
  p_expected_version integer
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
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- Claim the run first: a second submit for the same run hits the unique index and
  -- fails before a single sticker moves.
  insert into run_results (user_id, run_key, outcome, won_cup, xi)
  values (uid, p_run_key, coalesce(p_outcome, 'out'), coalesce(p_won_cup, false), '[]'::jsonb);

  if array_length(ids, 1) > 12 then
    raise exception 'too many collectibles for one run: %', array_length(ids, 1);
  end if;
  if coalesce(p_swaps_used, 0) > max_swaps then
    raise exception 'swaps_used % exceeds the cap of %', p_swaps_used, max_swaps;
  end if;

  select count(*) into bad_count
  from unnest(ids) as submitted(player_id)
  where not exists (
    select 1 from collectibles c where c.player_id = submitted.player_id and c.active
  );
  if bad_count > 0 then
    raise exception '% submitted id(s) are not active collectibles', bad_count;
  end if;

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

  perform bump_version(p_expected_version);

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

  delete from active_run where user_id = uid;

  perform audit('finish_run', jsonb_build_object(
    'run_key', p_run_key, 'outcome', p_outcome, 'won_cup', p_won_cup,
    'earned', ids, 'newly', newly
  ));

  return newly;
end;
$$;

-- Career: shape-validated, audited, no longer monotonic (see the note at the top).
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

  insert into career (user_id, xp, prestige, perk_levels, unlocked_boons, ascension, last_ascension, stats)
  values (
    auth.uid(), new_xp, new_prestige,
    coalesce(p_career->'perkLevels', '{}'::jsonb),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_career->'unlockedBoons', '[]'::jsonb)) as value), '{}'),
    coalesce((p_career->>'ascension')::integer, 0),
    (p_career->>'lastAscension')::integer,
    coalesce(p_career->'stats', '{}'::jsonb)
  )
  on conflict (user_id) do update set
    xp = excluded.xp, prestige = excluded.prestige, perk_levels = excluded.perk_levels,
    unlocked_boons = excluded.unlocked_boons, ascension = excluded.ascension,
    last_ascension = excluded.last_ascension, stats = excluded.stats;

  perform audit('career_write', jsonb_build_object('xp', new_xp, 'prestige', new_prestige));
  return v;
end;
$$;

commit;
