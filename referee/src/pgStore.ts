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
import { createRoom } from '../../src/domain/pvpRoom';
import {
  atOf,
  dealWrites,
  matchWrites,
  memberWrites,
  msOf,
  msOrNull,
  pickWrites,
  roomFromRows,
  type DealRow,
  type MatchRow,
  type MemberRow,
  type PickRow,
  type RoomRow,
} from './rows';
import type { CreateInput, LobbyRow, Mutation, MutateContext, RoomStore } from './store';

/** One round trip per table rather than one join: the room row is a single row and the
 *  other four are small lists, and a join would multiply them together and then have to be
 *  un-multiplied in JavaScript. */
const SELECT_ROOM = `select id, code, visibility, host_id, size, method,
    budget, years, show_ratings, rerolls, pick_seconds, status, round, champion_id,
    started_at, swept_at, touched_at
  from pvp_rooms where code = $1`;

export function pgStore(pool: Pool): RoomStore {
  const load = async (db: PoolClient, code: string, lock: boolean): Promise<{ room: PvpRoom; sweptAt: number | null } | null> => {
    const roomRes = await db.query<RoomRow>(SELECT_ROOM + (lock ? ' for update' : ''), [code]);
    const row = roomRes.rows[0];
    if (!row) return null;
    const id = row.id;
    // One after another, not `Promise.all`. They share ONE client (they have to: the room
    // row is locked in this transaction), and issuing a second query on a client that is
    // still running one is deprecated in pg 8 and removed in pg 9 - it happens to serialise
    // today, so the concurrency was never real, only the deprecation warning was.
    const members = await db.query<MemberRow>(
        `select m.user_id, m.seat, m.ready, m.budget, m.rerolls_used, m.out_in,
                m.last_seen, m.window_ordinal, m.window_opened_at, p.display_name,
                l.formation_name, l.style
           from pvp_members m
           left join profiles p on p.id = m.user_id
           left join pvp_lineups l on l.room_id = m.room_id and l.user_id = m.user_id
          where m.room_id = $1`,
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
           (room_id, user_id, seat, ready, budget, rerolls_used, out_in,
            window_ordinal, window_opened_at, last_seen)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         on conflict (room_id, user_id) do update set
           seat = excluded.seat, ready = excluded.ready, budget = excluded.budget,
           rerolls_used = excluded.rerolls_used, out_in = excluded.out_in,
           window_ordinal = excluded.window_ordinal,
           window_opened_at = excluded.window_opened_at`,
        [id, m.userId, m.seat, m.ready, m.budget, m.rerollsUsed, m.outIn, m.windowOrdinal, m.windowOpenedAt],
      );
      await db.query(
        `insert into pvp_lineups (room_id, user_id, formation_name, style)
         values ($1,$2,$3,$4)
         on conflict (room_id, user_id) do update set
           formation_name = excluded.formation_name, style = excluded.style`,
        [id, m.userId, m.formationName, m.style],
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
    for (const m of room.members) {
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
            room_visibility, room_size, loser_auto_picks)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)
         on conflict (room_id, round, game) do nothing`,
        [
          id, x.round, x.game, x.homeId, x.awayId, x.homeGoals, x.awayGoals, x.decided,
          JSON.stringify(x.events), x.pens ? JSON.stringify(x.pens) : null, x.stoppage,
          x.winnerId, x.revealFrom, x.revealMs, x.roomVisibility, x.roomSize, x.loserAutoPicks,
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
              show_ratings, rerolls, pick_seconds, status, round, touched_at, swept_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'lobby',0, now(), now())
           returning id`,
          [
            input.code, input.visibility, input.hostId, input.size, input.method,
            input.budget, input.years, input.showRatings, input.rerolls, input.pickSeconds,
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
      }>(
        `select r.code, r.size, r.method, r.budget, r.pick_seconds, r.rerolls,
                r.show_ratings, r.created_at, p.display_name as host_name,
                (select count(*) from pvp_members m where m.room_id = r.id) as seated
           from pvp_rooms r join profiles p on p.id = r.host_id
          where r.visibility = 'public' and r.status = 'lobby'
          order by r.created_at desc
          limit $1`,
        [limit],
      );
      return res.rows.map((x) => ({
        code: x.code,
        size: x.size,
        seated: Number(x.seated),
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
        `select r.code from pvp_members m join pvp_rooms r on r.id = m.room_id
          where m.user_id = $1 and r.status <> 'ended' limit 1`,
        [userId],
      );
      return res.rows[0]?.code ?? null;
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
