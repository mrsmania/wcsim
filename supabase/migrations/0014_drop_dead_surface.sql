-- 0014_drop_dead_surface.sql
--
-- Hygiene decisions D12 and D16 (docs/hygiene-audit.html), taken 2026-08-24, plus one
-- stale read policy found by the sweep D12 asked for.
--
-- CORRECTED 2026-08-25, BEFORE IT WAS EVER APPLIED. The first version of this file dropped
-- all four columns and nothing else, on the finding that all four "recorded nothing". That
-- finding is true of the DATA and false of the WRITE: `xi` is still named by the live
-- `finish_run_v2`, which inserts the literal `'[]'::jsonb` into it on every banked run.
-- Dropping the column alone would therefore have left a function that no longer matches its
-- own table - and a plpgsql body is not checked when a column is dropped, so the migration
-- would have reported success and the breakage would have surfaced at the next run end, as
-- "column xi of relation run_results does not exist". Because a failed signed-in write is
-- the blocking unreachable screen (D9), finishing a run would have become unplayable for
-- every account, with no way out but a rollback. Verified against the LIVE server before
-- correcting, not inferred from this repo.
--
-- So the column drop is now preceded by a `create or replace` that narrows the insert to the
-- columns carrying real values. The signature does not move, so `create or replace` keeps
-- 0008's grants and there is still no PGRST202 / deploy-order hazard. The body is 0012's
-- verbatim - confirmed byte-identical to the live server's `pg_get_functiondef` before
-- editing - and the ONLY change is the insert's column list and values list.
--
-- Everything else here is a REMOVAL of surface nothing uses, and no client change accompanies
-- any of it.
--
-- ---------------------------------------------------------------------------------------
-- 1. D12: four columns on run_results that have recorded nothing since migration 0006.
--
-- `ascension`, `score` and `rounds_won` sit at their `default 0` for every row of every
-- account, and `xi` is always the literal `'[]'::jsonb`. Only 0003's version of finish_run
-- ever populated the first three; 0006 narrowed the function when career progression moved to
-- the client and said why in its own header, and 0006 / 0009 / 0010 / 0012 have all carried
-- the narrowed insert forward - which still names `xi`, hence the replacement above.
-- Nothing READS any of the four: there is no `.from('run_results')` anywhere in src/, and the
-- only two other functions touching the table are column-agnostic (`import_guest_progress`
-- asks `exists (select 1 ...)`, `export_account` takes `to_jsonb(r)` of the whole row).
--
-- THE TABLE STAYS, and this is the part not to get wrong: its `unique (user_id, run_key)` is
-- what rejects a double submit before a single sticker moves, and `import_guest_progress`
-- reads it to decide whether an account is empty. Only the four columns are dead weight.
--
-- The alternative was reviving them (a real per-run archive, founding a server-side
-- leaderboard). Rejected because item 06 already shipped that archive on `CareerStats`,
-- riding the existing save_career jsonb, which means it works for guests too - and
-- guest-first is the project rule. Reviving would also have cost a finish_run_v3, since a
-- changed signature has the same deploy-order problem a changed return shape had, and it
-- could only ever cover runs from the change onward: the rows already there cannot be
-- back-filled, because the numbers were never sent.
--
-- ---------------------------------------------------------------------------------------
-- 2. D16: export_account() is granted to `authenticated` and has no caller.
--
-- Not in src/, not in scripts/, not in any other function. It returns only the caller's own
-- rows, so the exposure is limited to self - but 0008 exists precisely to stop granting API
-- surface that nothing calls, and this slipped through it. FR-25 (data export) is recorded in
-- docs/cloud-sync-requirements.md as knowingly not built.
--
-- The FUNCTION stays, revoked: it is the whole implementation of that requirement, so keeping
-- it costs nothing and re-granting is one line on the day a button wants it. It reads
-- run_results as a whole row, so the dropped columns simply stop appearing in its output.
--
-- ---------------------------------------------------------------------------------------
-- 3. The sweep D12 asked for: `run_results_read`.
--
-- 0002 created it with the comment "Run history: readable (the trophy cabinet)". The cabinet
-- does not read it - item 06 put its run archive on CareerStats instead - so this policy
-- permits a read that no code performs, on per-user data.
--
-- What the sweep found and deliberately does NOT touch:
--   * `collectibles_read` / `economy_constants_read` - also reads the client never performs,
--     but they cover REFERENCE data (the catalogue and the economy constants), not user data,
--     and both are derived from a dataset that already ships inside the public bundle. Kept
--     as plausible future surface; re-examine if that stops being true.
--   * `collectibles.elo` / `squad_id` / `nation_code` / `year` - written by the generated
--     seed, read by nothing. NOT dead in the D12 sense (they are populated, and they are what
--     makes the catalogue table legible by hand). Note the checksum guard in
--     scripts/collectibles.ts covers only playerId|tier|elo, so `name`, `nation_code` and
--     `year` can go stale until someone regenerates - that is recorded, not fixed here.
--   * `profiles.created_at`, `audit_log` - bookkeeping with defaults, correctly unreferenced.
--   * All 9 granted-and-called RPCs verified as genuinely called by the client, and every
--     internal helper (add_copy, audit, bump_version, duplicate_pool, economy_constant)
--     verified as still revoked from every role by 0008. `enforce_invite` and the 13-arg
--     `finish_run` were properly dropped by 0005 and 0006, and `allowed_emails` by 0005.
--     So export_account was the ONLY granted function without a caller.
--
-- ---------------------------------------------------------------------------------------
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. Finish a run signed in. It should bank stickers exactly as before. That exercises
--      finish_run_v2's insert into run_results, which is the statement this file rewrites,
--      so it is the one thing here that MUST be exercised rather than reasoned about.
--   2. Finish a second run without leaving. The unique (user_id, run_key) still has to reject
--      a double submit, which is the reason the table exists.
--   3. `select * from run_results limit 1;` in Studio - ten columns become six
--      (id, user_id, run_key, ended_at, outcome, won_cup).
--
-- ROLLBACK: re-add the columns with their original defaults, then restore 0012's function if
-- you want the old insert back. Note the narrowed function keeps working WITHOUT that last
-- step, because every re-added column carries a default - so this rollback is safe to apply
-- in part. What no rollback can restore is data: any rows written in between carry the
-- defaults rather than real values, which is exactly the "cannot be back-filled" point above.
--   alter table run_results add column if not exists ascension  integer not null default 0;
--   alter table run_results add column if not exists score      integer not null default 0;
--   alter table run_results add column if not exists rounds_won integer not null default 0;
--   alter table run_results add column if not exists xi         jsonb   not null default '[]'::jsonb;
--   grant execute on function export_account() to authenticated;
--   create policy run_results_read on run_results for select using (user_id = auth.uid());

begin;

-- 1a. Stop writing the column before dropping it, in the same transaction. This is 0012's
-- body verbatim; the insert is the only line that differs, and a `create or replace` on an
-- unchanged signature keeps 0008's grants.
-- SUPERSEDED BY 0015 (the bank cap moved into economy_constants, three lines). Do not copy
-- this body; see README.md in this directory.
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
  insert into run_results (user_id, run_key, outcome, won_cup)
  values (uid, p_run_key, coalesce(p_outcome, 'out'), coalesce(p_won_cup, false));

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

-- 1b. D12. `xi` is dropped last so the four read as one group in the diff.
alter table run_results drop column if exists ascension;
alter table run_results drop column if exists score;
alter table run_results drop column if exists rounds_won;
alter table run_results drop column if exists xi;

comment on table run_results is
  'Idempotency ledger for banking a run: the unique (user_id, run_key) rejects a double '
  'submit before a sticker moves, and import_guest_progress reads it to decide whether an '
  'account is empty. NOT a per-run archive - that lives on career.stats (CareerStats.history) '
  'so it works for guests too. Four columns that recorded only zeroes were dropped in 0014, '
  'which also narrowed finish_run_v2 to stop writing one of them; see that file before '
  'adding any.';

-- 2. D16. The function stays; only the grant goes.
revoke execute on function export_account() from authenticated;

-- 3. The stale read policy.
drop policy if exists run_results_read on run_results;

commit;
