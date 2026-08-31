-- 0024: a duel somebody walked out of counts on both records.
--
-- WHAT THIS IS FOR. Leaving a duel that somebody has taken up is a forfeit
-- (`forfeitDuel` in src/domain/pvpRoom.ts): the room ends there and then and the player who
-- stayed has won it. `pvp_records` reads `pvp_matches`, and a forfeit has no match - there
-- is no honest scoreline to record for a game nobody played - so without this the loss is
-- invisible and walking out is free again, which is the whole point of the rule.
--
-- IT ADDS NO COLUMN AND NO TABLE, which is the part worth reading before looking for one.
-- A WALKOVER IS A ROOM THAT WAS WON WITH NO MATCH UNDER IT, and that pair is a state a room
-- which actually played can never be in: a duel that finishes normally has its match, and
-- every other way a room ends without playing leaves no champion at all (`closeRoom`, the
-- `roomClosed` reading). So the encoding is already in the two columns 0016 wrote, and this
-- file is one `create or replace view`.
--
-- THREE THINGS IT DELIBERATELY DOES NOT DO:
--
--   * It does not read `pvp_bots`. The view is `security_invoker`, `authenticated` has no
--     grant at all on that table (0019, on purpose - a bot's XI is a draft secret), and a
--     reference to it would make the whole view raise permission denied for every player
--     rather than filtering anything. It filters on `pace = 'async'` instead, which is
--     exactly as strong: `setBots` refuses a duel, so a walkover can never have a bot in it.
--   * It does not touch how a PLAYED match is counted. The `pvp_matches` half below is
--     0019's body verbatim, `bot_sides = 0` included; only the union around it is new.
--   * It does not backfill anything. There is nothing to backfill - no room can be in this
--     state until the referee that forfeits is deployed.
--
-- ORDER: THIS FILE OR THE CONTAINER, EITHER WAY. It is not the usual "schema first" case,
-- because nothing about the referee's writes changes - a forfeited room is an ordinary
-- `ended` room with a champion, written by columns that have existed since 0016. Applied
-- before the rebuild it counts nothing, because nothing has forfeited yet; applied after,
-- it counts what already happened. Neither half can fail on the other.
--
-- HOW TO VERIFY AFTER APPLYING - do this, do not assume:
--   1. `select * from pvp_records limit 5;` - the view still answers and the numbers for
--      any account that had a record before are UNCHANGED. Nothing has forfeited yet, so
--      the new branch can only be a no-op today; if a number moved, the filter is wrong.
--   2. In a transaction: insert an async room with `status = 'ended'`, a `champion_id` and
--      two members, no `pvp_matches` row, and confirm `pvp_records` gives the champion a
--      win and the other member a loss, both with `played = 1`. Roll it back.
--   3. In the same transaction, add a `pvp_matches` row to that room and confirm the
--      walkover branch stops counting it (it is a played match now, counted once, not
--      twice). Roll it back. This is the one that catches a missing `not exists`.
--   4. Sign in as an ordinary player and read the versus page: the record line still shows.
--      The view is `security_invoker`, so a policy mistake here reads as permission denied
--      on a screen rather than as a wrong number.
--
-- ROLLBACK (complete):
--   begin;
--   create or replace view pvp_records with (security_invoker = true) as
--     -- 0019's body, verbatim.
--     with sides as (
--       select room_id, round, home_id as user_id, winner_id from pvp_matches where bot_sides = 0
--       union all
--       select room_id, round, away_id as user_id, winner_id from pvp_matches where bot_sides = 0
--     ),
--     finals as (select room_id, max(round) as last_round from pvp_matches group by room_id)
--     select s.user_id, count(*) as played,
--            count(*) filter (where s.winner_id = s.user_id) as won,
--            count(*) filter (where s.winner_id <> s.user_id) as lost,
--            count(*) filter (where s.winner_id = s.user_id and s.round = f.last_round) as rooms_won
--       from sides s join finals f on f.room_id = s.room_id group by s.user_id;
--   commit;

begin;

create or replace view pvp_records with (security_invoker = true) as
with match_sides as (
  select room_id, round, home_id as user_id, winner_id from pvp_matches where bot_sides = 0
  union all
  select room_id, round, away_id as user_id, winner_id from pvp_matches where bot_sides = 0
),
finals as (
  select room_id, max(round) as last_round from pvp_matches group by room_id
),
-- A tie that was played, and whether it was the room's last round.
match_rows as (
  select s.user_id, s.winner_id, (s.round = f.last_round) as is_final
    from match_sides s
    join finals f on f.room_id = s.room_id
),
-- A duel somebody walked out of: a winner, a loser, and no football. Both members are
-- still in the room (a forfeit removes nobody - the loser has to be able to read the
-- result), so this yields exactly the two rows a played tie would have.
walkover_rows as (
  select m.user_id, r.champion_id as winner_id, true as is_final
    from pvp_rooms r
    join pvp_members m on m.room_id = r.id
   where r.pace = 'async'
     and r.status = 'ended'
     and r.champion_id is not null
     and not exists (select 1 from pvp_matches x where x.room_id = r.id)
),
sides as (
  select * from match_rows
  union all
  select * from walkover_rows
)
select
  user_id,
  count(*)                                        as played,
  count(*) filter (where winner_id = user_id)     as won,
  count(*) filter (where winner_id <> user_id)    as lost,
  count(*) filter (where winner_id = user_id and is_final) as rooms_won
from sides
group by user_id;

-- `create or replace view` keeps the existing grants, but stating them costs nothing and
-- the Supabase image's blanket grants are why 0008 exists.
revoke all on pvp_records from anon;
grant select on pvp_records to authenticated;

commit;
