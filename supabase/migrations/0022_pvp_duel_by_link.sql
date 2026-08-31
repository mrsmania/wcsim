-- 0022_pvp_duel_by_link.sql
--
-- A duel is addressed by LINK and by nothing else (roadmap item 46's reshape, 2026-08-31).
--
-- WHAT IT DROPS: `pvp_rooms.invited_id`, added by 0020 three days ago, and the partial index
-- over it. Nothing else.
--
-- WHY. 0020 let a challenge be addressed to one account by display name: nobody else could
-- take that seat, and the duel appeared on the named player's list before they had answered
-- anything. It bought a name on a screen, and it cost four separate pieces of machinery -
-- a name lookup on the normalised key, a `not-invited` refusal for anybody else opening the
-- link, a visibility exception so the recipient could read a private room, and an
-- accept-or-decline screen. That last one was the real cost, because it also stopped the
-- CHALLENGER touching their own team until somebody answered: a duel now opens straight into
-- its challenger's draft, so there is nothing left to accept. A private link already says
-- who you are playing, and unlike a name it works for somebody who has not chosen one yet.
--
-- THE OTHER HALF OF THE SAME CHANGE NEEDS NO SQL AT ALL, which is worth stating so nobody
-- goes looking for it: a duel is now inserted with `status = 'drafting'` and one member, and
-- its second seat stays open through the draft. `status` has taken that value since 0016 and
-- the schema has never had an opinion about seats - the rule lives in the state machine
-- (`domain/pvpRoom.ts`) and the referee enforces it.
--
-- IT NEEDS THE REFEREE REDEPLOYED, and here the usual order is REVERSED, so read this twice.
-- The standing rule is schema first, then the container: an old referee against a new schema
-- is normally harmless. NOT HERE. The deployed referee WRITES `invited_id` on every room it
-- creates (it is a column in its insert), so dropping the column first breaks room creation
-- outright until the container catches up. **Rebuild and deploy the referee FIRST, confirm it
-- creates a room, then apply this.** Between the two the column simply sits there unwritten,
-- which is harmless, and that is the safe order.
--
-- ANY DUEL IN FLIGHT WITH A NAME ON IT loses only the addressing: whoever holds the link can
-- take the seat instead of the named account. Nothing about a duel already under way changes,
-- and no room is deleted.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `\d pvp_rooms` - no `invited_id` column, and no `pvp_rooms_invited_idx`.
--   2. `select count(*) from pvp_rooms;` before and after - unchanged. This drops a column,
--      never a row.
--   3. Open a duel from the versus page. It must land you on your own draft immediately,
--      with the invitation link on screen and the other chair empty.
--   4. Open that link from a second account: it takes the seat mid-draft and starts a draft
--      of its own. A third account is then told the room has started.
--   5. `select code, pace, status from pvp_rooms where pace = 'async' order by touched_at
--      desc limit 5;` - the new one reads `async` / `drafting` with one member until the
--      second account arrives.
--   6. Sign in and play a normal single-player run to the end, banking stickers. Nothing here
--      touches that path and confirming it is untouched is the point of checking.
--
-- ROLLBACK (complete). It restores the column empty, which is what a rollback of this can
-- honestly do: the addressing it held is gone from every room and cannot be recovered, so a
-- referee rolled back with it would treat every existing duel as open to whoever has the
-- link - which is exactly what the current one does anyway.
--   begin;
--   alter table pvp_rooms
--     add column if not exists invited_id uuid references profiles (id) on delete cascade;
--   create index if not exists pvp_rooms_invited_idx
--     on pvp_rooms (invited_id, touched_at desc)
--     where pace = 'async';
--   commit;

begin;

-- The index first: dropping the column would take it with it, but naming it here keeps the
-- rollback above a mirror of this file rather than a thing to work out under pressure.
drop index if exists pvp_rooms_invited_idx;

alter table pvp_rooms drop column if exists invited_id;

commit;
