-- Wipe every account and all per-user progress from the account server.
--
-- NOT A MIGRATION. It lives outside supabase/migrations/ on purpose: migrations are
-- applied in order on every server, and this must only ever run when somebody types
-- the command. Run it with:
--
--     npm run push:sql -- --dry-run supabase/maintenance/reset-user-data.sql   # show it
--     npm run push:sql --          supabase/maintenance/reset-user-data.sql   # do it
--
-- Needs dkr/.env and LAN/VPN reach to the NAS, like every other push:* script.
--
-- --------------------------------------------------------------------------
-- WHAT THIS DELETES
-- --------------------------------------------------------------------------
-- `auth.users` is the root: `profiles.id` references it `on delete cascade`, and every
-- per-user table references `profiles (id) on delete cascade`. So one delete takes:
--
--     profiles, album_stickers, album_stats, career, settings, game_state,
--     active_run, run_results
--
-- ...and the accounts themselves, so a previously signed-in player starts from a clean
-- sign-up rather than an account holding nothing. Their sessions and refresh tokens go
-- with it, so anything still signed in lands on the guest/unreachable path until it
-- signs in again. That is the point of a reset, but it is worth knowing before running.
--
-- `audit_log` is the one exception: it references profiles `on delete set null`, so its
-- rows SURVIVE the cascade with a null user_id. It is the FR-21 audit trail, so losing
-- it is a decision rather than a side effect - it is deleted here because "empty db for
-- testing" means empty, but comment the line out to keep the history.
--
-- --------------------------------------------------------------------------
-- WHAT THIS MUST NOT TOUCH, AND WHY
-- --------------------------------------------------------------------------
-- These three tables are NOT user data. They are reference data the app needs to work,
-- and wiping them is the likely mistake in a "delete everything" pass:
--
--   collectibles       Who is collectible, generated from the TypeScript dataset by
--                      `npm run gen:collectibles`. `finish_run` validates every banked
--                      id against it, so an empty table makes EVERY run bank nothing
--                      and the album silently stops filling. If it is ever lost, run
--                      `npm run push:collectibles` to restore it.
--   economy_constants  Trade costs and the swap cap, mirrored from src/config.ts by the
--                      same generator.
--   allowed_emails     The old invite gate. Unused since 0005 opened signup, and empty.
--
-- --------------------------------------------------------------------------
-- GUEST DATA IS NOT HERE
-- --------------------------------------------------------------------------
-- Guest progress is localStorage in the browser, never the server (design decision D8:
-- two worlds, never mixed). This script cannot reach it. To clear a browser too, run
-- this in its console on the app's origin:
--
--   ['wcsim:game:v1','wcsim_album_v1','wcsim_album_stats_v1','wcsim_career_v1',
--    'wcsim_run_v1','wcsim_run_reveal_v1','wcsim_settings_v1']
--     .forEach((k) => localStorage.removeItem(k)); location.reload();
--
-- (The first six are the app's own GUEST_KEYS; wcsim_settings_v1 is the seventh, kept
-- out of that list because a reset deliberately preserves theme/difficulty/year pool.
-- Drop it from the array to keep your settings.)

begin;

delete from auth.users;
delete from audit_log;

commit;

-- Confirmation: every one of these must read 0, and the last two must NOT.
select 'auth.users'        as table_name, count(*) as rows from auth.users
union all select 'profiles',          count(*) from profiles
union all select 'album_stickers',    count(*) from album_stickers
union all select 'album_stats',       count(*) from album_stats
union all select 'career',            count(*) from career
union all select 'settings',          count(*) from settings
union all select 'game_state',        count(*) from game_state
union all select 'active_run',        count(*) from active_run
union all select 'run_results',       count(*) from run_results
union all select 'audit_log',         count(*) from audit_log
union all select 'collectibles (keep!)',      count(*) from collectibles
union all select 'economy_constants (keep!)', count(*) from economy_constants;
