-- ---------------------------------------------------------------------------
-- 0018: drop `pvp_rooms.budget_source`, which 0017 already says to drop
--
-- WHY THIS FILE EXISTS AT ALL, since 0017 contains the identical statement: the live
-- server has the column. Every other part of 0017 is applied there and verified
-- (`pvp_members.window_ordinal`, `.window_opened_at`, `.rerolls_used`, `pvp_rooms.swept_at`,
-- `set_display_name`, `profiles_referee_read`), and this one statement is not. 0017 is
-- append-only history now and cannot be edited, so the fix is its own file.
--
-- WHAT IT COST TO FIND, because it is the argument for the two changes that went with it.
-- 0016 creates the column `not null` with a check and NO DEFAULT, and the referee's room
-- insert stopped supplying it when the career-budget option was deleted (P2). So every
-- attempt to open a room raised
--
--     null value in column "budget_source" of relation "pvp_rooms" violates not-null
--
-- and answered HTTP 500. Nothing upstream of the insert could see it: the version handshake
-- reads a bundled constant, both anon-key checks are refused before Postgres is touched, and
-- the deploy runbook's verification was exactly those three - so the deploy was called
-- verified and the FIRST DATABASE WRITE THIS FEATURE EVER MADE was made by a player in a
-- browser. `scripts/deploy-referee.sh --verify` now creates a real room and deletes it, and
-- the referee's 500 now carries the SQLSTATE and the column name so the next one is legible
-- from the page rather than only from `docker compose logs referee`.
--
-- The version handshake could never have caught it either, and that is worth stating: it
-- compares the protocol number and the dataset hash, and the commit that removed the column
-- from the insert moved neither.
--
-- SAFE AND IDEMPOTENT. `if exists`, so it is a no-op on a server where 0017's copy did land
-- (which is every server that applied 0017 whole, including a fresh one). It drops a column
-- holding one dead value: the option it recorded does not exist, nothing reads it, and the
-- referee does not write it.
--
-- VERIFY, after applying:
--   1. `select count(*) from information_schema.columns
--         where table_name = 'pvp_rooms' and column_name = 'budget_source';`  -> 0
--   2. Open a room in the browser. It should reach the lobby with a six-character code.
--      Or, without a browser: `bash scripts/deploy-referee.sh --verify user@host`, whose
--      step 4 mints a session on the box, creates a real room and deletes it again.
--   3. `docker compose logs --tail=20 referee` -> no new 500 for POST /referee/v1/rooms.
--   4. `select count(*) from pvp_rooms;` before and after, to prove nothing else moved.
--
-- REHEARSED against a database in the live server's exact state - 0016 applied whole, then
-- 0017 applied with this one statement removed - where the referee's own `create` handler
-- reproduced the production 500, and applying this file made the same call answer 201.
--
-- ROLLBACK (restores the column as 0016 defined it, which re-breaks room creation; there is
-- no reason to run this):
--   begin;
--   alter table pvp_rooms add column if not exists budget_source text not null default 'fixed'
--     check (budget_source in ('fixed', 'career'));
--   alter table pvp_rooms alter column budget_source drop default;
--   commit;
-- ---------------------------------------------------------------------------

begin;

alter table pvp_rooms drop column if exists budget_source;

commit;
