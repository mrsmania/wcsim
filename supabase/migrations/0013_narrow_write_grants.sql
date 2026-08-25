-- 0013_narrow_write_grants.sql
--
-- Hygiene decision D10 (docs/hygiene-audit.html), taken 2026-08-24.
--
-- WHAT THIS CHANGES
-- Four tables - career, settings, game_state, active_run - carried `for all` policies from
-- 0002, so the browser could write them directly. This narrows all four to `for select`.
--
-- WHY
-- The app never used that permission. Every one of the client's table accesses is a
-- `.select()` (verified: no `.insert(`, `.update(`, `.upsert(` or `.delete(` anywhere in
-- src/state/store/remoteStore.ts or src/state/auth.ts). Every write goes through a
-- `security definer` RPC that also calls `bump_version`, which is the FR-11 concurrency
-- counter, and for the career writes an `audit_log` row.
--
-- So the write half of these four policies was not just unused, it was the way around both.
-- The anon key ships inside the browser bundle by design (RLS is what protects the data), so
-- anyone holding it could `PATCH /rest/v1/career` straight past `bump_version` - after which
-- another device's next write sees no version conflict where it should. 0002 had already
-- applied exactly this reasoning to `profiles` ("state_version is bumped by the functions, so
-- profiles is not client-writable") and simply did not carry it across.
--
-- The design doc (docs/cloud-sync-design.md §5) specifies select + update for these tables;
-- `for all` additionally granted insert and delete, so the implementation was wider than the
-- decision it was meant to implement.
--
-- WHY THIS CANNOT BREAK THE WRITE PATH
-- `security definer` functions execute as their owner and bypass row-level security
-- altogether, so none of save_game / save_run / save_settings / save_career / finish_run_v2 /
-- execute_trade / import_guest_progress is affected. They also handle the first write
-- themselves (`insert ... on conflict (user_id) do update`), so no pre-existing row and no
-- client insert is required.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. Sign in on a fresh browser profile. The account should load, not show the
--      "cannot reach the server" screen (a broken read policy looks exactly like that).
--   2. Change a setting, build an XI, start a run, buy a perk. Each is a different RPC:
--      save_settings, save_game, save_run, save_career.
--   3. Reload. Everything should come back - that proves the reads still work.
--   4. Finish a run so finish_run_v2 banks stickers, and run one trade.
-- If any of that fails, 0013_rollback below restores the previous state exactly.
--
-- ROLLBACK (paste as its own statement if needed):
--   drop policy if exists career_read     on career;
--   drop policy if exists settings_read   on settings;
--   drop policy if exists game_state_read on game_state;
--   drop policy if exists active_run_read on active_run;
--   create policy career_own     on career      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--   create policy settings_own   on settings    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--   create policy game_state_own on game_state  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--   create policy active_run_own on active_run  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

begin;

-- Named `_read` rather than `_own`, so the policy name says what it permits.
drop policy if exists career_own on career;
create policy career_read on career
  for select using (user_id = auth.uid());

drop policy if exists settings_own on settings;
create policy settings_read on settings
  for select using (user_id = auth.uid());

drop policy if exists game_state_own on game_state;
create policy game_state_read on game_state
  for select using (user_id = auth.uid());

drop policy if exists active_run_own on active_run;
create policy active_run_read on active_run
  for select using (user_id = auth.uid());

commit;
