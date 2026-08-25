-- 0014_drop_dead_surface.sql
--
-- Hygiene decisions D12 and D16 (docs/hygiene-audit.html), taken 2026-08-24, plus one
-- stale read policy found by the sweep D12 asked for.
--
-- Everything here is a REMOVAL of surface nothing uses. No client change accompanies it, and
-- no function signature moves, so there is no PGRST202 / deploy-order hazard.
--
-- ---------------------------------------------------------------------------------------
-- 1. D12: four columns on run_results that have recorded nothing since migration 0006.
--
-- `ascension`, `score` and `rounds_won` sit at their `default 0` for every row of every
-- account, and `xi` is always the literal `'[]'::jsonb`. Only 0003's version of finish_run
-- ever populated them; 0006 narrowed the function when career progression moved to the
-- client and said why in its own header, and 0006 / 0009 / 0010 / 0012 have all carried the
-- narrowed five-column insert forward. Confirmed against every live insert:
--   insert into run_results (user_id, run_key, outcome, won_cup, xi)
-- Nothing reads them either - there is no `.from('run_results')` anywhere in src/.
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
-- it costs nothing and re-granting is one line on the day a button wants it.
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
-- HOW TO VERIFY AFTER APPLYING:
--   1. Finish a run signed in. It should bank stickers exactly as before - that exercises
--      finish_run_v2's insert into run_results, which is what these columns hang off.
--   2. Finish a second run without leaving. The unique (user_id, run_key) still has to reject
--      a double submit, which is the reason the table exists.
--   3. `select * from run_results limit 1;` in Studio - seven data columns become four.
--
-- ROLLBACK: the columns can be re-added with their original defaults, but any rows written
-- in between will carry those defaults rather than real values - which is exactly the
-- "cannot be back-filled" point above, so a rollback restores the shape, not the data.
--   alter table run_results add column if not exists ascension  integer not null default 0;
--   alter table run_results add column if not exists score      integer not null default 0;
--   alter table run_results add column if not exists rounds_won integer not null default 0;
--   alter table run_results add column if not exists xi         jsonb   not null default '[]'::jsonb;
--   grant execute on function export_account() to authenticated;
--   create policy run_results_read on run_results for select using (user_id = auth.uid());

begin;

-- 1. D12. `xi` is dropped last so the four read as one group in the diff.
alter table run_results drop column if exists ascension;
alter table run_results drop column if exists score;
alter table run_results drop column if exists rounds_won;
alter table run_results drop column if exists xi;

comment on table run_results is
  'Idempotency ledger for banking a run: the unique (user_id, run_key) rejects a double '
  'submit before a sticker moves, and import_guest_progress reads it to decide whether an '
  'account is empty. NOT a per-run archive - that lives on career.stats (CareerStats.history) '
  'so it works for guests too. Four columns that recorded only zeroes were dropped in 0014; '
  'see that file before adding any.';

-- 2. D16. The function stays; only the grant goes.
revoke execute on function export_account() from authenticated;

-- 3. The stale read policy.
drop policy if exists run_results_read on run_results;

commit;
