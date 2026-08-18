-- Accounts: bank a run in ONE round trip instead of three.
--
-- Roadmap item 08, "saving new stickers takes 1-2 seconds". Profiled 2026-08-18 rather
-- than guessed at, because the four candidates had four different fixes:
--
--   * the deliberate wait (BANK_WAIT_MS)  not it. That timer caps how long the
--     "Draft a new XI" button reads "Saving stickers..."; the summary itself renders
--     when the promise resolves.
--   * this function                       not it. Measured on a local Postgres with
--     the real migrations and the real 81-row catalogue: 8.8 ms on a cold plan,
--     1.3-1.9 ms warm, for a full 11-sticker haul.
--   * the write queue                     a contributor: the bank is serialized behind
--     whatever writes are already in flight, one round trip each.
--   * the round trip                      the cause - and the client was paying it
--     THREE times per bank.
--
-- Three, because this function returned only the newly-collected ids, so the client had
-- to follow it with a read of `profiles.state_version` and then a read of the album plus
-- album_stats. Sequential, since the version read gates nothing else but had to land
-- before the client could write again. Measured client-side against a fake transport at
-- 100 ms/request: 302 ms for a bank on an idle queue, 502 ms with two writes in flight.
-- On a NAS over LAN or VPN that multiplier is the whole complaint.
--
-- So: a variant that returns everything the client needs to update itself. The client
-- keeps its "the server counted, do not guess" rule - these are still the server's
-- numbers, read inside the same transaction - it just stops paying two extra round
-- trips to hear them.
--
-- Why a new NAME rather than changing the return type of finish_run (which 0006 was
-- happy to do): the client is deployed by pushing to main, this migration is applied by
-- hand on the NAS, and those two never happen at the same instant. A rename keeps both
-- orders working. The old function stays as a thin wrapper, so there is still only one
-- implementation, and a client that has not learned about v2 (or is running against a
-- server that has not been migrated yet) behaves exactly as it does today.

begin;

-- The whole of 0009's finish_run, with the client's follow-up reads folded into the
-- return value. Keep this and the wrapper below in step; the wrapper has no logic.
create or replace function finish_run_v2(
  p_run_key          text,
  p_collectible_ids  text[],
  p_won_cup          boolean,
  p_cup_pick         text,
  p_swaps_used       integer,
  p_outcome          text,
  p_expected_version integer
)
returns jsonb
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
  v integer;
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

  -- Keep what is genuinely collectible; note the rest instead of failing (0009).
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

  -- Captured, not discarded: handing the new version back is one of the two round
  -- trips this variant saves.
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

  delete from active_run where user_id = uid;

  perform audit('finish_run', jsonb_build_object(
    'run_key', p_run_key, 'outcome', p_outcome, 'won_cup', p_won_cup,
    'earned', ids, 'newly', newly, 'dropped', dropped
  ));

  -- Everything the client used to fetch afterwards. `album` carries the same two
  -- columns the client's own reader takes, so it parses the payload with the function
  -- it already had.
  return jsonb_build_object(
    'newly', to_jsonb(newly),
    'version', v,
    'album', (
      select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'copies', copies)
                                order by player_id), '[]'::jsonb)
      from album_stickers where user_id = uid
    ),
    'stats', (
      select coalesce(jsonb_build_object(
               'runs_played', runs_played,
               'stickers_earned', stickers_earned,
               'trades_completed', trades_completed), '{}'::jsonb)
      from album_stats where user_id = uid
    )
  );
end;
$$;

-- The original, now delegating. Same signature, so its grants from 0008 survive the
-- replace, and any client still calling it is unaffected.
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
language sql
security definer
set search_path = public
as $$
  select coalesce(array(
    select jsonb_array_elements_text(
      finish_run_v2(p_run_key, p_collectible_ids, p_won_cup, p_cup_pick,
                    p_swaps_used, p_outcome, p_expected_version) -> 'newly'
    )
  ), '{}');
$$;

-- Grants, the 0008 way: a new function is executable by PUBLIC unless told otherwise,
-- and the Supabase base image additionally grants EXECUTE on new functions to anon,
-- authenticated and service_role by default, so each role has to be named.
revoke all on function finish_run_v2(text, text[], boolean, text, integer, text, integer)
  from public, anon;
grant execute on function finish_run_v2(text, text[], boolean, text, integer, text, integer)
  to authenticated, service_role;

commit;
