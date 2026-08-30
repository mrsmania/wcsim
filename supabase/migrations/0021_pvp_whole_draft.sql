-- 0021_pvp_whole_draft.sql
--
-- One clock over the whole draft, for a budget room (roadmap item 47, plan P52).
--
-- WHAT CHANGES FOR A PLAYER: buying an XI in a room stops being eleven twenty-second picks
-- and becomes one clock over the lot. Inside it you may buy, move a player to another of
-- his roles, and take one back out, as often as you like; you press "I'm done" when you are
-- happy, and the room plays as soon as everybody has. If the clock runs out with slots
-- still open they are filled for you. A ROLL room is completely unchanged: it still deals a
-- squad per window and still runs a per-pick clock, because there the eleven decisions
-- really are separate.
--
-- WHY THE METHOD DECIDES IT, rather than a setting. Buying is ONE decision about ONE pool of
-- money: the eleventh pick is what settles whether the first was affordable, so a clock that
-- will not let you go back and sell the winger you overpaid for is not a clock, it is a
-- trap. Rolling is eleven decisions about eleven dealt squads, and a window per squad is
-- what it is.
--
-- WHAT IT ADDS - two columns, and that is the whole schema change:
--   * `pvp_rooms.draft_seconds` - how long the whole draft gets. Three lengths, so a lobby
--     row can say what kind of evening this is (the same reason `pick_seconds` has two).
--   * `pvp_members.done` - "I am through". A whole-draft room CANNOT read a full XI as a
--     finished one: if the eleventh slot filling ended the room, the moving and the selling
--     this change exists for would be unusable by whoever fills their last slot last. So
--     finishing is declared, and it is reversible while the draft is open.
--
-- NOTHING IS ADDED FOR THE BOARD ITSELF, and that is worth saying because it looks like the
-- big part. `pvp_picks` is already keyed on (room, user, SLOT) and the writer already
-- deletes a slot that is no longer in the map - both of them put there for P42, which said
-- a room should allow a move and could not have one while the referee took picks. Moving a
-- player is a row under a different slot id; selling one is a row that is gone. The schema
-- was ready for this three waves before the code was.
--
-- TWO DECISIONS:
--
-- 1. THE COLUMNS ARE ON EVERY ROOM, not on the budget ones. A room can never change method,
--    so a roll room stores a `draft_seconds` nothing reads exactly as a budget room now
--    stores a `pick_seconds` nothing reads, and both columns stay `not null`. A partial
--    constraint would be a second place for the method to be recorded, and the second place
--    is always the one that is wrong.
--
-- 2. `done` DEFAULTS FALSE AND IS RESET AT KICK-OFF by the referee, not here. The lobby's
--    `ready` is a different signal about a different gate - one is "start it", this is
--    "play it" - and a room that carried the lobby's answer into the draft would have
--    everybody through before anybody had bought a player.
--
-- IT NEEDS THE REFEREE REDEPLOYED, in that order: this file, then the container, then the
-- client. An old referee against this schema is harmless (it never writes either column and
-- both have defaults); a new referee against the old schema fails on its first read.
--
-- AND UNTIL THE CONTAINER IS REBUILT THE CLIENT FALLS BACK, which is why this is not
-- urgent: `PVP_PROTOCOL` is unchanged, an old referee sends a budget room its eleven pick
-- windows and no `draft` block, and the screens draw exactly the per-pick draft they always
-- have. Nothing is broken in the meantime; the new draft simply is not there yet.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `\d pvp_rooms` - `draft_seconds` is `not null default 300` with a three-value check.
--      `\d pvp_members` - `done` is `not null default false`.
--   2. `select draft_seconds, count(*) from pvp_rooms group by 1;` - every existing room is
--      300. Anything else before the referee is redeployed means this ran twice against
--      different code, which is worth stopping to understand.
--   3. `select count(*) from pvp_members where done;` - zero.
--   4. In a transaction: insert a room with `draft_seconds = 240` and confirm the check
--      refuses it, then roll back.
--   5. Open a budget room of two from two accounts and play a draft: one clock counting for
--      both of you, a player who can be dragged between two of his positions, an "x" that
--      takes him back out, and a room that plays the moment the second person presses done.
--      Then let one run out with slots open and confirm they are filled.
--   6. Play a ROLL room as well, and confirm it still runs a twenty-second window per pick.
--      That is the half this must not touch.
--
-- ROLLBACK (complete, and in this order). No one-way door here: a room mid-draft when this
-- is undone loses its declarations and its clock, so an old referee would run it under the
-- hard bound instead and finish it - untidy for those rooms, harmless for the rest.
--   begin;
--   alter table pvp_members drop column if exists done;
--   alter table pvp_rooms drop constraint if exists pvp_rooms_draft_seconds_ck;
--   alter table pvp_rooms drop column if exists draft_seconds;
--   commit;

begin;

-- --------------------------------------------------------------------------
-- The whole draft's clock
-- --------------------------------------------------------------------------

alter table pvp_rooms
  add column if not exists draft_seconds integer not null default 300;

-- Named rather than inline, so the rollback above can drop it by name and so a fourth
-- length is one visible statement rather than a column rewrite.
alter table pvp_rooms drop constraint if exists pvp_rooms_draft_seconds_ck;
alter table pvp_rooms
  add constraint pvp_rooms_draft_seconds_ck
  check (draft_seconds in (180, 300, 480));

-- --------------------------------------------------------------------------
-- "I am through"
-- --------------------------------------------------------------------------

-- Not nullable, because there is no third state: you have said so or you have not. The
-- referee clears it at kick-off for everybody, so the lobby's `ready` can never be read as
-- this one.
alter table pvp_members
  add column if not exists done boolean not null default false;

commit;
