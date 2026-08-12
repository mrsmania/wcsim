-- Accounts: row-level security. See docs/cloud-sync-design.md §5.
--
-- The browser holds the anon key, so RLS is not a nicety, it IS the security boundary
-- (NFR-2). Shape:
--   * own-row read/write for the buckets only their owner cares about
--   * album_stickers is SELECT-only: every mutation goes through a function in 0003,
--     so the economy rules cannot be sidestepped by writing rows directly (FR-18)
--   * collectibles / economy_constants are read-only reference data
--   * allowed_emails and audit_log have no client policy at all, so they are invisible

begin;

alter table profiles          enable row level security;
alter table allowed_emails    enable row level security;
alter table collectibles      enable row level security;
alter table economy_constants enable row level security;
alter table album_stickers    enable row level security;
alter table album_stats       enable row level security;
alter table career            enable row level security;
alter table settings          enable row level security;
alter table game_state        enable row level security;
alter table active_run        enable row level security;
alter table run_results       enable row level security;
alter table audit_log         enable row level security;

-- --------------------------------------------------------------------------
-- Own row, read and write
-- --------------------------------------------------------------------------

create policy profiles_own on profiles
  for select using (id = auth.uid());

-- `state_version` is bumped by the functions, so profiles is not client-writable.

create policy career_own on career
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy settings_own on settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy game_state_own on game_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy active_run_own on active_run
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Read-only for the client
-- --------------------------------------------------------------------------

-- The album: readable, never writable. Earns and trades are functions (0003).
create policy album_stickers_read on album_stickers
  for select using (user_id = auth.uid());

create policy album_stats_read on album_stats
  for select using (user_id = auth.uid());

-- Run history: readable (the trophy cabinet), appended only by finish_run.
create policy run_results_read on run_results
  for select using (user_id = auth.uid());

-- Reference data: any signed-in user may read the catalogue and the constants.
create policy collectibles_read on collectibles
  for select to authenticated using (true);

create policy economy_constants_read on economy_constants
  for select to authenticated using (true);

-- --------------------------------------------------------------------------
-- No client access whatsoever
-- --------------------------------------------------------------------------

-- allowed_emails: maintained in Studio, checked by the signup trigger (0004).
-- audit_log: written by the functions.
-- Both have RLS enabled and no policy, which denies everything through the API.

commit;
