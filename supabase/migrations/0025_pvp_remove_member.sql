-- 0025_pvp_remove_member.sql
--
-- The host can throw somebody out of the lobby, and the throw sticks.
--
-- WHY THIS NEEDS SQL AT ALL, when the rule itself is four lines of the state machine. A
-- code gets passed around and a public lobby is open to anybody signed in, so the person
-- who opened the room needs a way to say "not you". The rule is easy; making it MEAN
-- anything is what needs a column. Arriving at a room is taking the seat (`RoomScreen`,
-- 2026-08-29: there is one door and walking through it is the answer), so the screen the
-- removed player is looking at re-joins on its very next read - about two seconds later,
-- for as long as the tab is open. Without somewhere to record the removal, the button is
-- decoration and the host watches them walk back in.
--
-- WHAT IT ADDS
--   * `pvp_rooms.removed` - the accounts the host has thrown out of THIS room.
--
-- A COLUMN AND NOT A TABLE, which is the one decision here. `pvp_bots` earned its own
-- table because a bot is an entity with a name, a shape and an XI; this is a set of at most
-- seven ids, written whole by the same `update pvp_rooms` that already writes the status
-- and the round, read by the same select, and never queried on its own. A table would be a
-- fifth round trip per room load and a policy and a grant, to store less than `years`
-- already stores. `years integer[]` is the precedent and it is the same shape of thing.
--
-- WHAT IS GIVEN UP BY NOT MAKING IT A TABLE, stated rather than discovered later: there is
-- no foreign key, so deleting an account leaves its id sitting in the arrays of any room it
-- was thrown out of. That is harmless in both directions - an id matching nobody can never
-- refuse anybody, and the rooms themselves are swept away by P31's lifecycle - and the
-- alternative is a `references profiles (id) on delete cascade` on a table that exists for
-- no other reason.
--
-- IT DISCLOSES A UUID AND NOTHING ELSE. `pvp_rooms` is selectable by the room's members and,
-- for an open public lobby, by anybody signed in (0016's `pvp_rooms_visible`), so this
-- column is readable by them too. It carries account ids, which a member list already
-- carries, and no name, no reason and no time. Nothing in the client reads it: a room
-- reaches the browser through the referee, and `RoomView` does not carry this.
--
-- IT NEEDS THE REFEREE REDEPLOYED, and in that order: this file first, then the container
-- (`scripts/deploy-referee.sh --verify`), then the client. That is the standing direction
-- and it holds here for the standing reason - an old container never writes a NEW column,
-- so it is unaffected (it never selects `removed`, and the default fills it on insert),
-- while a new container against the old schema fails on its first save of any room at all.
-- The one migration that had to be reversed, 0022, was reversed because it DROPPED a column
-- the running referee was writing; nothing is dropped here.
--
-- HOW TO KNOW IT WORKED
--   1. `select removed from pvp_rooms limit 1;` - the column exists and every existing row
--      is an empty array rather than null.
--   2. `\d pvp_rooms` shows `removed uuid[] not null default '{}'::uuid[]`.
--   3. Open a room of two, have somebody take the seat, remove them: their screen says
--      "You were removed" within a couple of seconds and offers no Try again, and
--      `select removed from pvp_rooms where code = '<CODE>';` holds exactly their id.
--   4. Follow the link again as that account: the seat is free and the join is still
--      refused, which is the whole point of the column.
--
-- ROLLBACK
--   begin;
--   alter table pvp_rooms drop column if exists removed;
--   commit;
--   -- Redeploy the referee FIRST if it is already running this schema: it writes the
--   -- column on every save, so dropping it under a running container breaks every room.

begin;

alter table pvp_rooms
  add column if not exists removed uuid[] not null default '{}';

commit;
