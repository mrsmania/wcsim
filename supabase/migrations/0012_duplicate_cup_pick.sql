-- Accounts: the cup-win pick is allowed to be a DUPLICATE.
--
-- Bug found 2026-08-20. With every pickable sticker already collected, the reward picker
-- deliberately offers the whole Legendary/Iconic list and says so ("your pick will add a
-- duplicate to the trade pool") - album spec FR-3, and what the guest store has always
-- done. The server refused it ("cup pick bra-1998-9 is already collected"), which raised,
-- rolled the entire bank back, and - because a signed-in write failure is the blocking
-- unreachable state (D9) - left the player on "can't reach your account" with a Try Again
-- that could only fail the same way. So a full album made winning the cup unplayable for
-- an account, while a guest was fine.
--
-- The pick is no longer required to be new. The other three guards stay exactly as they
-- were: only on a cup win, only an active collectible, never Monumental.
--
-- Why not the narrower "allow it only once nothing is left to collect", which is how the
-- copy reads? Because the server cannot answer "left to collect" the way the client asks
-- it. The picker draws from the player's SELECTED WORLD CUPS (`poolYears`), a legitimately
-- smaller set than the catalogue, so someone who has finished the 2022 collectibles is
-- offered duplicates while uncollected 1990 cards still exist. An exhaustion test here
-- would refuse that legal pick, i.e. re-open this bug for everyone who narrows the pool.
-- And it guards little: the reward is one duplicate, one per cup win, of a card already
-- owned - the same currency a banked XI mints for free every run, and the currency trades
-- are priced in.
--
-- Only the cup-pick block changes; the rest is 0010's function verbatim. `finish_run`
-- stays the thin wrapper 0010 made it, so both entry points are fixed at once, and
-- `create or replace` keeps 0008's grants.

begin;

-- SUPERSEDED BY 0014. Do not copy this body; see README.md in this directory.
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
    -- An already-collected pick is fine: it becomes a duplicate (FR-3). See the header.
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

commit;
