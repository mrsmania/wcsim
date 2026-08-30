-- 0020_pvp_duels.sql
--
-- Duels: a challenge you send to somebody who is not online, answered whenever they get to
-- it (roadmap item 46, plan P51).
--
-- WHAT A DUEL IS, IN ONE LINE: a room of two whose deadlines are all switched off. Nobody
-- has to be present at the same time - you challenge a friend, they accept tomorrow, each
-- of you builds an XI whenever, and the match plays itself the moment the second XI lands.
--
-- WHY THIS IS TWO COLUMNS AND NOT A SECOND SET OF TABLES. Everything a duel does, a room
-- already does: the draft, the deal, the validation, the tie, the record. What differs is
-- entirely about WAITING - the pick clock, the liveness ping, the lobby that closes when it
-- stops filling, and the half-hour idle close, every one of which exists because a live room
-- cannot wait for a human (P12, P31). So the state machine takes a `pace`, reads past those
-- four rules when it is `async`, and the rest of the room is the same room. A parallel set
-- of tables would have been a second copy of the draft, and the draft is the part with the
-- rules in it.
--
-- WHAT IT ADDS
--   * `pvp_rooms.pace` - 'live' or 'async'. Every existing room is live, by default.
--   * `pvp_rooms.invited_id` - the account a challenge is ADDRESSED to. This is what makes
--     it a challenge rather than an open room: nobody else may take that seat, and it is
--     what puts the duel on their list before they have answered.
--   * one index, for the half of the duel list this table can answer.
--
-- THREE DECISIONS, all of the kind that decide behaviour rather than shape:
--
-- 1. `invited_id` IS NULLABLE AND THAT IS A FEATURE. A duel with a name on it is a
--    challenge to one person; a duel without one is a link you send to whoever you like,
--    which is the same shape as a private room and is how you play somebody who has not
--    chosen a display name yet. The referee enforces the difference (`joinRoom` refuses an
--    addressed seat to anybody else); the column just records it.
--
-- 2. A DUEL IS NEVER PUBLIC. The listing is for rooms anybody may walk into, and a duel is
--    aimed at one person - so the referee forces `visibility` to private and the lobby query
--    filters on `pace = 'live'`. The check constraint below states it once more, because the
--    lobby query is the kind of thing a later change edits without remembering why.
--
-- 3. ONE ACTIVE ROOM PER ACCOUNT (P39) COUNTS LIVE ROOMS ONLY. It exists because a live room
--    needs you present, so holding two holds one of them up; a duel needs nobody present, so
--    five at once is the feature working. That rule lives in the referee's query, not here -
--    it was never expressible as an index (see 0016's header) - and this note is where to
--    look when it seems to have gone missing.
--
-- IT NEEDS THE REFEREE REDEPLOYED, in that order: this file, then the container, then the
-- client. An old referee against this schema is harmless (it never writes `pace`, and the
-- default makes every room it creates live); a new referee against the old schema fails on
-- its first insert.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `\d pvp_rooms` - `pace` is `not null default 'live'` with a two-value check, and
--      `invited_id` is a nullable uuid referencing `profiles`.
--   2. `select pace, count(*) from pvp_rooms group by 1;` - every existing room is 'live'.
--      Any 'async' before the referee is redeployed means this ran twice against different
--      code, which is worth stopping to understand.
--   3. `select code from pvp_rooms where pace = 'async' and visibility = 'public';` - empty,
--      and it must stay empty: the check constraint refuses it outright.
--   4. In a transaction: insert an async room addressed to a second account, confirm it
--      does NOT appear in `select code from pvp_rooms where visibility = 'public' and
--      status = 'lobby' and pace = 'live'` (the lobby query), and roll back.
--   5. Sign in and play a normal single-player run to the end, banking stickers. Nothing
--      here touches that path and confirming it is untouched is the point of checking.
--
-- ROLLBACK (complete, and in this order). Note the one-way door: dropping `pace` takes
-- every duel's identity with it, so any duel in flight becomes a live room with a dead
-- clock, which the sweeper will then auto-pick to a finish. Delete the async rooms first if
-- that matters, which is what the first line does.
--   begin;
--   delete from pvp_rooms where pace = 'async';
--   drop index if exists pvp_rooms_invited_idx;
--   alter table pvp_rooms drop constraint if exists pvp_rooms_duel_is_private;
--   alter table pvp_rooms drop column if exists invited_id;
--   alter table pvp_rooms drop column if exists pace;
--   commit;

begin;

-- --------------------------------------------------------------------------
-- The pace, and who it is addressed to
-- --------------------------------------------------------------------------

alter table pvp_rooms
  add column if not exists pace text not null default 'live'
    check (pace in ('live', 'async'));

-- The account a challenge is aimed at. `on delete cascade` for the same reason `host_id`
-- has it: a duel addressed to an account that no longer exists is not a duel.
alter table pvp_rooms
  add column if not exists invited_id uuid references profiles (id) on delete cascade;

-- Decision 2, stated where it cannot be edited away by accident.
alter table pvp_rooms drop constraint if exists pvp_rooms_duel_is_private;
alter table pvp_rooms
  add constraint pvp_rooms_duel_is_private
  check (pace = 'live' or visibility = 'private');

-- --------------------------------------------------------------------------
-- The one read that needs an index
-- --------------------------------------------------------------------------

-- The duel list is two questions: "the ones I am in", which goes through `pvp_members` and
-- its own key, and "the ones aimed at me", which is this. Partial on the pace, because
-- duels are the smaller half by far and a live room must not pay for the index.
create index if not exists pvp_rooms_invited_idx
  on pvp_rooms (invited_id, touched_at desc)
  where pace = 'async';

-- NOTHING IS ADDED FOR THE SWEEPER, deliberately. It scans every unfinished room in
-- `touched_at` order with no pace predicate at all (`liveCodes`), so a partial index on the
-- pace could not be used for it - and duels change nothing about that scan except that a
-- few of its rows now sit in `lobby` for days. If that scan ever needs an index it needs a
-- whole one, over `status <> 'ended'`, which is a decision about every room rather than
-- about duels.

commit;
