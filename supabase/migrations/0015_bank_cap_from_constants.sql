-- 0015_bank_cap_from_constants.sql
--
-- Roadmap item 37. The bank cap becomes data the client sends, like every other economy
-- number, instead of a figure both sides state on their own.
--
-- WHAT IT IS. How many collectible ids one finished run may bank. The client trims a haul
-- to it before submitting; this function refuses anything over it, and that refusal rolls
-- the whole bank back - which for a signed-in player is the blocking "cannot reach the
-- server" screen. So the two sides disagreeing costs somebody a run they actually played.
--
-- WHY IT NEEDED A MIGRATION. The trade costs and the swap cap already work the right way:
-- `gen-collectibles` writes them into `economy_constants` from `src/config.ts` and the SQL
-- reads them back through `economy_constant(key)`, so they cannot drift. This one number
-- never got that treatment - it was `BANK_CAP = 12` on the client and a bare `> 12` in the
-- body of this function. Hygiene H135 held them together with a check over every cap
-- literal in this directory, which closed the drift without touching the server; this is
-- the real fix, and the check changes shape with it (see scripts/checks/state.ts).
--
-- WHAT CHANGES. Three lines of finish_run_v2, and nothing else. The body is 0014's
-- verbatim, confirmed byte-identical to the live server's `pg_get_functiondef` before
-- editing:
--   * one `declare` line, `max_bank`, beside the `max_swaps` that already does this;
--   * the comparison reads that variable instead of the literal;
--   * the raise says which cap it used, the way the swap raise beside it does. Without
--     that, a server running on a stale constant refuses a haul and says nothing about
--     why, which is the failure this file exists to make visible.
-- The signature does not move, so `create or replace` keeps 0008's grants and there is no
-- PGRST202 / deploy-order hazard. `finish_run` is a thin wrapper over this function and
-- carries no cap of its own, so it needs no change (verified against the live server).
--
-- ORDER DOES NOT MATTER, deliberately. The fallback is the current value, so applying this
-- before the seed carrying the new row behaves exactly as today; and the seed is a plain
-- upsert, so pushing it before this file is inert. Neither half is a flag day.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `select value from economy_constants where key = 'max_collectibles_per_run';`
--      after `npm run push:collectibles`. It should read 12.
--   2. Set it to 3 in a transaction, bank 4 ids, and confirm the raise names the cap of 3;
--      bank 3 and confirm it goes through. That is the only proof the server is genuinely
--      reading the row rather than the fallback. Roll that transaction back.
--   3. Finish a run signed in. It banks exactly as before.
--
-- ROLLBACK: restore 0014's body, which puts the literal back and ignores the row. The row
-- itself can stay: nothing else reads it, and the seed would only put it back.
--   (copy the finish_run_v2 body from 0014_drop_dead_surface.sql)
--   delete from economy_constants where key = 'max_collectibles_per_run';   -- optional

begin;

-- 0014's body, with the cap read from economy_constants. See the header for the three
-- lines that differ.
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
  max_bank integer := coalesce(economy_constant('max_collectibles_per_run'), 12);
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
  insert into run_results (user_id, run_key, outcome, won_cup)
  values (uid, p_run_key, coalesce(p_outcome, 'out'), coalesce(p_won_cup, false));

  if array_length(submitted, 1) > max_bank then
    raise exception 'too many collectibles for one run: % exceeds the cap of %',
      array_length(submitted, 1), max_bank;
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
