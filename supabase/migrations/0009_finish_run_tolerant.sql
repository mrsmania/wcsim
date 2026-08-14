-- Accounts: banking a run should not be all-or-nothing.
--
-- Bug found 2026-08-14, twice over. Cup Run boosts hand back modified copies of players
-- (Golden Generation is +2 to the whole XI), the client judged collectibility on the
-- boosted rating, and so submitted ids that the catalogue - generated from base ratings
-- - does not contain. finish_run raised, the whole bank was lost, and the client
-- reported the server as unreachable. The client now judges on base ratings, which is
-- the real fix and also the right game rule: a boost must not mint a sticker.
--
-- This is the second half. Raising on an unknown id punishes the legitimate part of a
-- run for one bad entry, and it will happen again for a legitimate reason: a rating
-- tweak can retire a collectible (active = false) while an in-progress run still holds
-- it. So unknown and retired ids are now DROPPED rather than fatal - which is equally
-- strict about what can be earned, since a dropped id grants nothing - and the dropped
-- ones are written to the audit log so a client bug is still visible afterwards.
--
-- The cup pick stays strict: it is an explicit choice from a list the server itself
-- constrains, so a bad one is a real error and worth refusing.

begin;

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
  submitted text[] := coalesce(p_collectible_ids, '{}');
  ids text[];
  dropped text[];
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

  if array_length(submitted, 1) > 12 then
    raise exception 'too many collectibles for one run: %', array_length(submitted, 1);
  end if;
  if coalesce(p_swaps_used, 0) > max_swaps then
    raise exception 'swaps_used % exceeds the cap of %', p_swaps_used, max_swaps;
  end if;

  -- Keep what is genuinely collectible; note the rest instead of failing.
  select coalesce(array_agg(s), '{}') into ids
  from unnest(submitted) as s
  where exists (select 1 from collectibles c where c.player_id = s and c.active);

  select coalesce(array_agg(s), '{}') into dropped
  from unnest(submitted) as s
  where not exists (select 1 from collectibles c where c.player_id = s and c.active);

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
    'earned', ids, 'newly', newly, 'dropped', dropped
  ));

  return newly;
end;
$$;

commit;
