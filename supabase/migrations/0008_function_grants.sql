-- Accounts: lock down who may call which function.
--
-- Security review, 2026-08-14. In Postgres a new function is executable by PUBLIC
-- unless you say otherwise, and I never said otherwise. Every function in 0003 was
-- therefore callable by anyone holding the anon key - which is public by design, it
-- ships inside the browser bundle. Most of them check auth.uid() and refuse, but the
-- internal helpers do not, because they were written to be called by the other
-- functions and take the account to act on as a parameter:
--
--   add_copy(p_user uuid, p_player_id text)   -- insert a sticker into ANY account
--   duplicate_pool(p_user uuid)               -- read ANY account's trade currency
--   audit(p_kind text, p_payload jsonb)       -- append unlimited rows to the log
--
-- So a stranger could hand themselves stickers in someone else's album, or fill the
-- disk with audit rows. No route to the NAS itself, but it defeats the whole point of
-- validating the economy server-side (FR-18).
--
-- The fix is grants, not rewrites. A SECURITY DEFINER function runs as its owner, so
-- when finish_run calls add_copy the privilege check is against the owner, not the
-- caller - revoking costs the internal calls nothing.
--
-- Revoking from PUBLIC alone is NOT enough, which the first attempt got wrong: the
-- Supabase base image sets ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions
-- to anon, authenticated and service_role, so each role holds its own explicit grant.
-- They have to be named.
--
-- While here, the client-facing functions move from "anyone" to "signed-in users",
-- which is what they were always meant to be. They already refused an anonymous
-- caller; now they are not reachable by one at all.

begin;

-- --------------------------------------------------------------------------
-- Internal helpers: owner only, no API surface at all.
-- --------------------------------------------------------------------------

revoke all on function bump_version(integer) from public, anon, authenticated, service_role;
revoke all on function audit(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function economy_constant(text) from public, anon, authenticated, service_role;
revoke all on function duplicate_pool(uuid) from public, anon, authenticated, service_role;
revoke all on function add_copy(uuid, text) from public, anon, authenticated, service_role;
revoke all on function create_profile() from public, anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- The client-facing surface: signed-in users (and the service role for admin work).
-- --------------------------------------------------------------------------

revoke all on function save_game(jsonb, integer) from public, anon;
revoke all on function save_run(jsonb, integer) from public, anon;
revoke all on function save_settings(jsonb) from public, anon;
revoke all on function save_career(jsonb, integer) from public, anon;
revoke all on function finish_run(text, text[], boolean, text, integer, text, integer) from public, anon;
revoke all on function execute_trade(text, text, integer) from public, anon;
revoke all on function import_guest_progress(jsonb) from public, anon;
revoke all on function export_account() from public, anon;
revoke all on function delete_account() from public, anon;

grant execute on function save_game(jsonb, integer) to authenticated, service_role;
grant execute on function save_run(jsonb, integer) to authenticated, service_role;
grant execute on function save_settings(jsonb) to authenticated, service_role;
grant execute on function save_career(jsonb, integer) to authenticated, service_role;
grant execute on function finish_run(text, text[], boolean, text, integer, text, integer) to authenticated, service_role;
grant execute on function execute_trade(text, text, integer) to authenticated, service_role;
grant execute on function import_guest_progress(jsonb) to authenticated, service_role;
grant execute on function export_account() to authenticated, service_role;
grant execute on function delete_account() to authenticated, service_role;

commit;

-- Not addressed here, because they are configuration rather than schema (see the
-- review notes): the firewall rule allowing containers to reach the whole LAN, Studio
-- being reachable from the internet behind basic auth alone, and the unused storage /
-- functions / realtime services still being exposed.
