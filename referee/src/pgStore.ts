// The `RoomStore`, over Postgres.
//
// Wave 3 of docs/pvp-plan.md. It connects as `pvp_referee` (migration 0016), which may
// write the seven `pvp_*` tables and read exactly three columns of `profiles` - and holds
// no privilege at all on `career`, `album_stickers`, `settings`, `game_state`,
// `active_run` or `run_results`. The referee is the only component in this design that
// takes un-RLS'd input from the internet, so that narrowness is the point of it (P34).
//
// WHY EVERY COMMAND REWRITES THE WHOLE AGGREGATE. A room is one object to the state machine
// and a diff across five tables to the database. Writing the whole thing under a row lock
// costs a handful of statements against tables holding at most eight members and eighty-
// eight picks, and it removes a class of bug entirely: a transition that changes two things
// and a save that remembers one. The measurement that would change this is a room taking
// long enough to write that a pick waits on it, and it is nowhere near.
//
// `select ... for update` ON THE ROOM ROW is what serialises two picks arriving together.
// The plan asks for an advisory lock on a round advance (P36); the room row is the same
// lock with one fewer concept, since every write in this file goes through it.

import type { Pool, PoolClient } from 'pg';
import type { PvpRoom } from '../../src/domain/pvpRoom';
import { createRoom, humansIn } from '../../src/domain/pvpRoom';
import {
  atOf,
  botWrites,
  dealWrites,
  matchWrites,
  memberWrites,
  msOf,
  msOrNull,
  pickWrites,
  roomFromRows,
  type BotRow,
  type DealRow,
  type MatchRow,
  type MemberRow,
  type PickRow,
  type RoomRow,
} from './rows';
import type {
  CreateInput,
  DuelListRow,
  LobbyRow,
  Mutation,
  MutateContext,
  RoomStore,
} from './store';

/** One round trip per table rather than one join: the room row is a single row and the
 *  other four are small lists, and a join would multiply them together and then have to be
 *  un-multiplied in JavaScript. */
// A COLUMN THE ROW MAPPER READS AND THIS DOES NOT ASK FOR IS A SILENT DISASTER - `pg` hands
// over `undefined` and every consequence is quiet (see `msOf`). `rows.ts`'s `RoomRow` is the
// list this has to match, and `npm run checks` reads the two against each other.
const SELECT_ROOM = `select r.id, r.code, r.visibility, r.host_id, r.pace, r.invited_id,
    p.display_name as invited_name,
    r.size, r.method, r.budget, r.years, r.show_ratings, r.rerolls, r.pick_seconds,
    r.draft_seconds,
    r.status, r.round, r.champion_id, r.started_at, r.swept_at, r.touched_at
  from pvp_rooms r
  left join profiles p on p.id = r.invited_id
  where r.code = $1`;

export function pgStore(pool: Pool): RoomStore {
  const load = async (db: PoolClient, code: string, lock: boolean): Promise<{ room: PvpRoom; sweptAt: number | null } | null> => {
    // `for update of r`, naming the table: a plain `for update` over a join would try to
    // lock the joined `profiles` row as well, which the referee has no privilege to lock
    // and has no business locking either.
    const roomRes = await db.query<RoomRow>(SELECT_ROOM + (lock ? ' for update of r' : ''), [code]);
    const row = roomRes.rows[0];
    if (!row) return null;
    const id = row.id;
    // One after another, not `Promise.all`. They share ONE client (they have to: the room
    // row is locked in this transaction), and issuing a second query on a client that is
    // still running one is deprecated in pg 8 and removed in pg 9 - it happens to serialise
    // today, so the concurrency was never real, only the deprecation warning was.
    const members = await db.query<MemberRow>(
        `select m.user_id, m.seat, m.ready, m.done, m.budget, m.rerolls_used, m.out_in,
                m.last_seen, m.window_ordinal, m.window_opened_at, p.display_name,
                l.formation_name, l.style
           from pvp_members m
           left join profiles p on p.id = m.user_id
           left join pvp_lineups l on l.room_id = m.room_id and l.user_id = m.user_id
          where m.room_id = $1`,
      [id],
    );
    const bots = await db.query<BotRow>(
      `select bot_id, seat, name, formation_name, style, out_in, xi
         from pvp_bots where room_id = $1`,
      [id],
    );
    const deals = await db.query<DealRow>(
      `select user_id, dealt_seq, squad_id from pvp_deals where room_id = $1`,
      [id],
    );
    const picks = await db.query<PickRow>(
      `select user_id, slot_id, player_id, ordinal, opened_at, landed_at, automatic
         from pvp_picks where room_id = $1`,
      [id],
    );
    const matches = await db.query<MatchRow>(
      `select round, game, home_id, away_id, home_goals, away_goals, decided, events,
              pens, stoppage, winner_id, reveal_from, reveal_ms
         from pvp_matches where room_id = $1 order by round, game`,
      [id],
    );
    return {
      room: roomFromRows({
        room: row,
        members: members.rows,
        bots: bots.rows,
        deals: deals.rows,
        picks: picks.rows,
        matches: matches.rows,
      }),
      sweptAt: msOrNull(row.swept_at),
    };
  };

  /** The whole aggregate, in one transaction the caller already opened. */
  const save = async (db: PoolClient, room: PvpRoom, now: number): Promise<void> => {
    const id = Number(room.id);
    await db.query(
      `update pvp_rooms set size = $2, status = $3, round = $4, champion_id = $5,
              started_at = $6, touched_at = $7, swept_at = $7
         where id = $1`,
      [
        id,
        room.size,
        room.status,
        room.round,
        room.championId ?? null,
        room.startedAt ? atOf(room.startedAt) : null,
        atOf(now),
      ],
    );

    // A LOBBY CAN NOW LOSE SOMEBODY (P31), so a member row that is no longer in the room
    // has to go - and it has to go BEFORE the upserts below, or a seat number that moved
    // would collide with the row still holding it under `unique (room_id, seat)`.
    await db.query(
      `delete from pvp_members where room_id = $1 and not (user_id = any($2::uuid[]))`,
      [id, room.members.map((m) => m.userId)],
    );

    for (const m of memberWrites(room)) {
      await db.query(
        `insert into pvp_members
           (room_id, user_id, seat, ready, done, budget, rerolls_used, out_in,
            window_ordinal, window_opened_at, last_seen)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         on conflict (room_id, user_id) do update set
           seat = excluded.seat, ready = excluded.ready, done = excluded.done,
           budget = excluded.budget,
           rerolls_used = excluded.rerolls_used, out_in = excluded.out_in,
           window_ordinal = excluded.window_ordinal,
           window_opened_at = excluded.window_opened_at`,
        [id, m.userId, m.seat, m.ready, m.done, m.budget, m.rerollsUsed, m.outIn, m.windowOrdinal, m.windowOpenedAt],
      );
      await db.query(
        `insert into pvp_lineups (room_id, user_id, formation_name, style)
         values ($1,$2,$3,$4)
         on conflict (room_id, user_id) do update set
           formation_name = excluded.formation_name, style = excluded.style`,
        [id, m.userId, m.formationName, m.style],
      );
    }

    // The practice opponents (migration 0019), the same shape as the member write above
    // and for the same reason: a seat that is no longer in the room has to go before the
    // upserts, or the seat number it still holds collides under `unique (room_id, seat)` -
    // which is exactly what a person taking a bot's chair does.
    const bots = botWrites(room);
    await db.query(`delete from pvp_bots where room_id = $1 and not (bot_id = any($2::uuid[]))`, [
      id,
      bots.map((b) => b.botId),
    ]);
    for (const b of bots) {
      await db.query(
        `insert into pvp_bots
           (room_id, bot_id, seat, name, formation_name, style, out_in, xi)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         on conflict (room_id, bot_id) do update set
           seat = excluded.seat, name = excluded.name,
           formation_name = excluded.formation_name, style = excluded.style,
           out_in = excluded.out_in, xi = excluded.xi`,
        [id, b.botId, b.seat, b.name, b.formationName, b.style, b.outIn, JSON.stringify(b.xi)],
      );
    }

    for (const d of dealWrites(room)) {
      await db.query(
        `insert into pvp_deals (room_id, user_id, dealt_seq, squad_id)
         values ($1,$2,$3,$4) on conflict (room_id, user_id, dealt_seq) do nothing`,
        [id, d.userId, d.seq, d.squadId],
      );
    }

    const picks = pickWrites(room);
    for (const p of picks) {
      await db.query(
        `insert into pvp_picks
           (room_id, user_id, slot_id, player_id, ordinal, opened_at, landed_at, automatic)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (room_id, user_id, slot_id) do update set
           player_id = excluded.player_id, ordinal = excluded.ordinal,
           opened_at = excluded.opened_at, landed_at = excluded.landed_at,
           automatic = excluded.automatic`,
        [id, p.userId, p.slotId, p.playerId, p.ordinal, p.openedAt, p.landedAt, p.automatic],
      );
    }
    // A move empties a slot (P42), so a slot that is no longer in the map has to go. One
    // statement per member rather than one clever one over the whole room: a statement that
    // ERRORS inside a transaction poisons every statement after it, so a "try the neat
    // version and fall back" would take the whole save down rather than degrade.
    for (const m of humansIn(room)) {
      const keep = picks.filter((p) => p.userId === m.userId).map((p) => p.slotId);
      await db.query(
        `delete from pvp_picks where room_id = $1 and user_id = $2 and not (slot_id = any($3))`,
        [id, m.userId, keep],
      );
    }

    for (const x of matchWrites(room)) {
      await db.query(
        `insert into pvp_matches
           (room_id, round, game, home_id, away_id, home_goals, away_goals, decided,
            events, pens, stoppage, winner_id, reveal_from, reveal_ms,
            room_visibility, room_size, loser_auto_picks, bot_sides)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)
         on conflict (room_id, round, game) do nothing`,
        [
          id, x.round, x.game, x.homeId, x.awayId, x.homeGoals, x.awayGoals, x.decided,
          JSON.stringify(x.events), x.pens ? JSON.stringify(x.pens) : null, x.stoppage,
          x.winnerId, x.revealFrom, x.revealMs, x.roomVisibility, x.roomSize, x.loserAutoPicks,
          x.botSides,
        ],
      );
    }
  };

  return {
    async create(input: CreateInput, now: number): Promise<PvpRoom> {
      const db = await pool.connect();
      try {
        await db.query('begin');
        const name = await db.query<{ display_name: string | null }>(
          'select display_name from profiles where id = $1',
          [input.hostId],
        );
        const res = await db.query<{ id: string }>(
          `insert into pvp_rooms
             (code, visibility, host_id, size, method, budget, years,
              show_ratings, rerolls, pick_seconds, draft_seconds, pace, invited_id,
              status, round, touched_at, swept_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'lobby',0, now(), now())
           returning id`,
          [
            input.code, input.visibility, input.hostId, input.size, input.method,
            input.budget, input.years, input.showRatings, input.rerolls, input.pickSeconds,
            input.draftSeconds, input.pace, input.invitedId,
          ],
        );
        const room = createRoom({
          id: String(res.rows[0]!.id),
          code: input.code,
          hostId: input.hostId,
          hostName: name.rows[0]?.display_name ?? '',
          visibility: input.visibility,
          size: input.size as 2 | 4 | 8,
          rules: { method: input.method, budget: input.budget, years: input.years },
          pickSeconds: input.pickSeconds as 20 | 30,
          hostBudget: input.method === 'budget' ? input.budget : 0,
          showRatings: input.showRatings,
          rerolls: input.rerolls,
          draftSeconds: input.draftSeconds,
          pace: input.pace,
          ...(input.invitedId ? { invitedId: input.invitedId } : {}),
          now,
        });
        await save(db, room, now);
        await db.query('commit');
        return room;
      } catch (err) {
        await db.query('rollback').catch(() => {});
        throw err;
      } finally {
        db.release();
      }
    },

    async read(code: string): Promise<PvpRoom | null> {
      const db = await pool.connect();
      try {
        return (await load(db, code, false))?.room ?? null;
      } finally {
        db.release();
      }
    },

    async mutate<T>(
      code: string,
      now: number,
      fn: (room: PvpRoom, ctx: MutateContext) => Mutation<T>,
    ): Promise<Mutation<T> | null> {
      const db = await pool.connect();
      try {
        await db.query('begin');
        const loaded = await load(db, code, true);
        if (!loaded) {
          await db.query('rollback');
          return null;
        }
        const out = fn(loaded.room, { sweptAt: loaded.sweptAt });
        // A sweep over an idle room writes nothing but its own heartbeat, which is what
        // P45's recovery reads and therefore the one thing that must always land.
        if (out.unchanged) {
          await db.query('update pvp_rooms set swept_at = $2 where code = $1', [code, atOf(now)]);
        } else {
          await save(db, out.room, now);
        }
        await db.query('commit');
        return out;
      } catch (err) {
        await db.query('rollback').catch(() => {});
        throw err;
      } finally {
        db.release();
      }
    },

    async liveCodes(): Promise<string[]> {
      // LOBBIES ARE IN HERE, and P31 is why: the liveness sweep is this same sweeper, so a
      // lobby it never looks at is a lobby whose host can close their laptop and leave the
      // room in the list at 3 of 8 for ever.
      const res = await pool.query<{ code: string }>(
        `select code from pvp_rooms where status in ('lobby','drafting','round')
          order by touched_at`,
      );
      return res.rows.map((r) => r.code);
    },

    async publicLobbies(limit: number): Promise<LobbyRow[]> {
      // The room plus a count, never the room's contents: see `LobbyRoom`. The partial
      // index `pvp_rooms_open_idx` is exactly this predicate and ordering.
      const res = await pool.query<{
        code: string;
        size: number;
        seated: string;
        method: 'roll' | 'budget';
        budget: number;
        pick_seconds: number;
        rerolls: number;
        show_ratings: boolean;
        host_name: string | null;
        created_at: Date | string;
        bots: string;
      }>(
        // `seated` counts PEOPLE and `bots` the chairs the host filled, because a bot yields
        // its seat to anybody who turns up (`joinRoom`): folding the two together would
        // print "Full" over a room that is open.
        `select r.code, r.size, r.method, r.budget, r.pick_seconds, r.rerolls,
                r.show_ratings, r.created_at, p.display_name as host_name,
                (select count(*) from pvp_members m where m.room_id = r.id) as seated,
                (select count(*) from pvp_bots b where b.room_id = r.id) as bots
           from pvp_rooms r join profiles p on p.id = r.host_id
          where r.visibility = 'public' and r.status = 'lobby' and r.pace = 'live'
          order by r.created_at desc
          limit $1`,
        [limit],
      );
      return res.rows.map((x) => ({
        code: x.code,
        size: x.size,
        seated: Number(x.seated),
        bots: Number(x.bots),
        method: x.method,
        budget: x.budget,
        pickSeconds: x.pick_seconds,
        rerolls: x.rerolls,
        showRatings: x.show_ratings,
        hostName: x.host_name ?? '',
        openedAt: msOf(x.created_at),
      }));
    },

    async activeRoomOf(userId: string): Promise<string | null> {
      const res = await pool.query<{ code: string }>(
        // LIVE ROOMS ONLY (P51): a duel needs nobody present, so holding several is the
        // feature rather than the thing P39 exists to stop.
        `select r.code from pvp_members m join pvp_rooms r on r.id = m.room_id
          where m.user_id = $1 and r.status <> 'ended' and r.pace = 'live' limit 1`,
        [userId],
      );
      return res.rows[0]?.code ?? null;
    },

    async myDuels(userId: string, limit: number): Promise<DuelListRow[]> {
      // ONE QUERY, and everything on the row is counted in it: a duel list is read by
      // somebody deciding what to open, so it needs whose move it is, which needs the
      // picks - and handing the client the picks to count them there is handing it both
      // drafts. `pvp_picks` is counted per side instead and only the totals come back.
      //
      // The `union` is the two ways a duel is yours: you are in it, or it was addressed to
      // you and you have not answered. Both, because an unanswered challenge is exactly
      // the row this list exists to show.
      const res = await pool.query<{
        code: string;
        status: 'lobby' | 'drafting' | 'round' | 'ended';
        method: 'roll' | 'budget';
        budget: number;
        host_id: string;
        opponent_name: string | null;
        your_picks: string;
        their_picks: string;
        your_goals: number | null;
        their_goals: number | null;
        winner_id: string | null;
        created_at: Date | string;
        touched_at: Date | string;
      }>(
        `with mine as (
           select r.*
             from pvp_rooms r
            where r.pace = 'async'
              and (r.invited_id = $1
                   or exists (select 1 from pvp_members m
                               where m.room_id = r.id and m.user_id = $1))
         )
         select r.code, r.status, r.method, r.budget, r.host_id, r.created_at, r.touched_at,
                (select count(*) from pvp_picks p
                  where p.room_id = r.id and p.user_id = $1) as your_picks,
                (select count(*) from pvp_picks p
                  where p.room_id = r.id and p.user_id <> $1) as their_picks,
                -- The other person: whoever is in it and is not you, else the account it
                -- was addressed to. One of the two is always set for a duel that has a
                -- second side at all.
                coalesce(
                  (select pr.display_name from pvp_members m
                     join profiles pr on pr.id = m.user_id
                    where m.room_id = r.id and m.user_id <> $1 limit 1),
                  (select pr.display_name from profiles pr where pr.id = r.invited_id)
                ) as opponent_name,
                (select case when x.home_id = $1 then x.home_goals else x.away_goals end
                   from pvp_matches x where x.room_id = r.id limit 1) as your_goals,
                (select case when x.home_id = $1 then x.away_goals else x.home_goals end
                   from pvp_matches x where x.room_id = r.id limit 1) as their_goals,
                (select x.winner_id from pvp_matches x where x.room_id = r.id limit 1)
                  as winner_id
           from mine r
          order by r.touched_at desc
          limit $2`,
        [userId, limit],
      );
      return res.rows.map((x) => ({
        code: x.code,
        opponentName: x.opponent_name ?? '',
        yours: x.host_id === userId,
        status: x.status,
        method: x.method,
        budget: x.budget,
        yourPicks: Number(x.your_picks),
        theirPicks: Number(x.their_picks),
        yourGoals: x.your_goals,
        theirGoals: x.their_goals,
        won: x.winner_id === null ? null : x.winner_id === userId,
        openedAt: msOf(x.created_at),
        touchedAt: msOf(x.touched_at),
      }));
    },

    async findByName(nameKey: string): Promise<string | null> {
      // On the NORMALISED key, which is what uniqueness is on (P22) - so a challenge
      // addressed to "mario" reaches Mario, and there is exactly one of him.
      const res = await pool.query<{ id: string }>(
        'select id from profiles where name_key = $1',
        [nameKey],
      );
      return res.rows[0]?.id ?? null;
    },

    async displayName(userId: string): Promise<string | null> {
      const res = await pool.query<{ display_name: string | null }>(
        'select display_name from profiles where id = $1',
        [userId],
      );
      return res.rows[0]?.display_name ?? null;
    },

    async seen(code: string, userId: string, now: number): Promise<void> {
      await pool.query(
        `update pvp_members set last_seen = $3
           from pvp_rooms r where r.id = pvp_members.room_id
            and r.code = $1 and pvp_members.user_id = $2`,
        [code, userId, atOf(now)],
      );
    },
  };
}
