// The room, as rows, and back again.
//
// Wave 3 of docs/pvp-plan.md. Pure on purpose, and the only file that knows both shapes:
// `PvpRoom` (the state machine's, `src/domain/pvpRoom.ts`) and the seven tables of
// migrations 0016 and 0017. Everything else in the referee holds one or the other, so this
// is where a column that moved shows up as a type error rather than as a room that loads
// with a field quietly missing.
//
// IT IS PURE SO IT CAN BE CHECKED, and the check is a ROUND TRIP: a room built by playing a
// draft, written to rows, read back, and compared. That is worth more than reading the
// mapping, because the failure it catches is the silent one - a field the writer forgets is
// a field the reader cannot miss.
//
// TIMES ARE MILLISECONDS INSIDE THE ROOM AND `timestamptz` IN THE DATABASE. The state
// machine takes `now` as a number everywhere (that is what lets a twenty-second clock be
// tested in microseconds), and Postgres wants an instant. The conversion happens here and
// nowhere else; anything that formats a date somewhere else in the referee is a bug.

import type { Player } from '../../src/data/types';
import { datasetPlayer } from '../../src/data/squads';
import type { FormationName, Style } from '../../src/domain/formations';
import type { KoDecided } from '../../src/domain/knockout';
import type { MatchEvent } from '../../src/domain/match';
import type { ShootoutResult } from '../../src/domain/match';
import { botsIn, humansIn } from '../../src/domain/pvpRoom';
import type {
  PickRecord,
  PickSeconds,
  PvpRoom,
  PvpTie,
  RoomMember,
  RoomSize,
  RoomStatus,
} from '../../src/domain/pvpRoom';

// --- The rows, as Postgres hands them over -------------------------------

export interface RoomRow {
  id: string | number;
  code: string;
  visibility: 'public' | 'private';
  host_id: string;
  size: number;
  method: 'roll' | 'budget';
  budget: number;
  years: number[] | null;
  show_ratings: boolean;
  rerolls: number;
  pick_seconds: number;
  status: RoomStatus;
  round: number;
  champion_id: string | null;
  started_at: Date | string | null;
  swept_at: Date | string | null;
  /** What P31's lifecycle rules count from: the last time anything happened here. */
  touched_at: Date | string;
}

export interface MemberRow {
  user_id: string;
  seat: number;
  ready: boolean;
  budget: number;
  rerolls_used: number;
  out_in: number | null;
  /** P31's liveness, written by the client's ping and read by the lobby sweep. */
  last_seen: Date | string;
  window_ordinal: number | null;
  window_opened_at: Date | string | null;
  /** Joined from `profiles`, which the referee may read three columns of and no more. */
  display_name: string | null;
  formation_name: string | null;
  style: string | null;
}

/**
 * A practice opponent (migration 0019), which is a member of the room and NOT a row of
 * `pvp_members`.
 *
 * The reason is one column: `pvp_members.user_id` is a foreign key into `profiles`, and a
 * bot has no account to point at. Relaxing that key for every member so that a few of them
 * could be nobody is the wrong trade - it is the constraint that stops a room seating a
 * user id that does not exist - so a bot gets its own table, and its XI travels as one
 * jsonb column rather than as eleven `pvp_picks` rows for the same reason.
 */
export interface BotRow {
  bot_id: string;
  seat: number;
  name: string;
  formation_name: string;
  style: string;
  out_in: number | null;
  /** slotId -> player id. Empty until the host starts the room, which is when a bot's team
   *  is built (`domain/pvpBot.ts`). */
  xi: Record<string, string> | null;
}

export interface DealRow {
  user_id: string;
  dealt_seq: number;
  squad_id: string;
}

export interface PickRow {
  user_id: string;
  slot_id: string;
  player_id: string;
  ordinal: number;
  opened_at: Date | string;
  landed_at: Date | string;
  automatic: boolean;
}

export interface MatchRow {
  round: number;
  game: number;
  home_id: string;
  away_id: string;
  home_goals: number;
  away_goals: number;
  decided: KoDecided;
  events: MatchEvent[];
  pens: ShootoutResult | null;
  stoppage: number[] | null;
  winner_id: string;
  reveal_from: Date | string;
  reveal_ms: number;
}

export interface RoomRows {
  room: RoomRow;
  members: MemberRow[];
  bots: BotRow[];
  deals: DealRow[];
  picks: PickRow[];
  matches: MatchRow[];
}

// --- Times ----------------------------------------------------------------

/** A `timestamptz` as milliseconds. `pg` hands back a `Date` for a timestamptz column, but
 *  a string when the value came through `json_agg`, and both happen here - so this takes
 *  either rather than the caller having to remember which query it came from.
 *
 *  IT THROWS RATHER THAN HANDING BACK `NaN`, and that is the correction of a real production
 *  bug: `touched_at` and `last_seen` were read here and not named in the two `select`s that
 *  fill these rows, so `pg` handed over `undefined`, every time became `NaN`, and the
 *  consequences were all silent. `NaN > LOBBY_IDLE_MS` is false, so the whole of P31's
 *  lifecycle - the ninety-second drop, the fifteen-minute close, the thirty-minute close -
 *  simply never fired; and `atOf(NaN)` throws deep inside the WRITE instead, so the sweeper
 *  rolled back every room it touched and logged a code with no reason. A time that cannot be
 *  read is a bug in the query, not a value to carry, and it belongs at the load where the
 *  column name is still in view. */
export function msOf(at: Date | string): number {
  const ms = at instanceof Date ? at.getTime() : new Date(at as string).getTime();
  if (!Number.isFinite(ms)) throw new Error(`unreadable timestamp: ${String(at)}`);
  return ms;
}

export function msOrNull(at: Date | string | null): number | null {
  return at === null || at === undefined ? null : msOf(at);
}

/** Milliseconds as something Postgres will take. ISO, always UTC. */
export function atOf(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error(`unwritable timestamp: ${String(ms)}`);
  return new Date(ms).toISOString();
}

// --- Rows to a room -------------------------------------------------------

const DEFAULT_FORMATION = '4-3-3' as FormationName;
const DEFAULT_STYLE = 'bal' as Style;

/**
 * Rebuild the room the state machine works on.
 *
 * A player id that is not in the dataset is DROPPED rather than faked, and that is the one
 * decision in this file. It means a slot goes back to empty and the clock fills it again,
 * which is recoverable; the alternative is a room holding a player the referee's own
 * validator would refuse, which is not. It happens when the referee is rebuilt from a
 * commit whose dataset lost a player - which is exactly what the version handshake (P35)
 * exists to prevent, and this is what happens when it is bypassed.
 */
export function roomFromRows(rows: RoomRows): PvpRoom {
  const r = rows.room;
  const xi: PvpRoom['xi'] = {};
  const picks: PvpRoom['picks'] = {};
  const deals: PvpRoom['deals'] = {};

  for (const m of rows.members) {
    xi[m.user_id] = {};
    picks[m.user_id] = {};
    if (r.method === 'roll') deals[m.user_id] = [];
  }

  for (const d of [...rows.deals].sort((a, b) => a.dealt_seq - b.dealt_seq)) {
    (deals[d.user_id] ??= []).push(d.squad_id);
  }

  for (const p of rows.picks) {
    const player: Player | undefined = datasetPlayer(p.player_id);
    if (!player) continue;
    (xi[p.user_id] ??= {})[p.slot_id] = player;
    (picks[p.user_id] ??= {})[p.slot_id] = {
      ordinal: p.ordinal,
      openedAt: msOf(p.opened_at),
      landedAt: msOf(p.landed_at),
      automatic: p.automatic,
    };
  }

  // A bot's XI is one jsonb column rather than eleven pick rows, so it is resolved here.
  // Same rule as a pick: an id the dataset does not hold is dropped rather than faked.
  for (const b of rows.bots) {
    xi[b.bot_id] = {};
    picks[b.bot_id] = {};
    for (const [slotId, playerId] of Object.entries(b.xi ?? {})) {
      const player = datasetPlayer(playerId);
      if (player) xi[b.bot_id]![slotId] = player;
    }
  }

  const members: RoomMember[] = [
    ...rows.members.map((m) => ({
      userId: m.user_id,
      seat: m.seat,
      name: m.display_name ?? '',
      ready: m.ready,
      formationName: (m.formation_name ?? DEFAULT_FORMATION) as FormationName,
      style: (m.style ?? DEFAULT_STYLE) as Style,
      budget: m.budget,
      rerollsUsed: m.rerolls_used,
      lastSeen: msOf(m.last_seen),
      ...(m.out_in === null ? {} : { outIn: m.out_in }),
    })),
    ...rows.bots.map((b) => ({
      userId: b.bot_id,
      seat: b.seat,
      name: b.name,
      // Ready and never otherwise: there is nobody to press it, and a seat that read as
      // "choosing" would leave the host waiting on a robot.
      ready: true,
      formationName: b.formation_name as FormationName,
      style: b.style as Style,
      budget: r.method === 'budget' ? r.budget : 0,
      rerollsUsed: 0,
      // NEVER SEEN, and it has no column: `lastSeen` answers "has this person's tab said
      // anything lately", and there is no tab. `tickLobby` skips bots for exactly that
      // reason, so nothing reads this - storing a plausible-looking time would only invite
      // something to.
      lastSeen: 0,
      bot: true,
      ...(b.out_in === null ? {} : { outIn: b.out_in }),
    })),
  ].sort((a, b) => a.seat - b.seat);

  const windows: PvpRoom['windows'] = {};
  for (const m of rows.members) {
    windows[m.user_id] =
      m.window_ordinal === null || m.window_opened_at === null
        ? undefined
        : { ordinal: m.window_ordinal, openedAt: msOf(m.window_opened_at) };
  }

  const ties: PvpTie[] = rows.matches.map((x) => ({
    round: x.round,
    game: x.game,
    homeId: x.home_id,
    awayId: x.away_id,
    result: {
      homeGoals: x.home_goals,
      awayGoals: x.away_goals,
      decided: x.decided,
      events: x.events ?? [],
      ...(x.pens ? { pens: x.pens } : {}),
      homeWon: x.winner_id === x.home_id,
    },
    stoppage: [x.stoppage?.[0] ?? 0, x.stoppage?.[1] ?? 0],
    revealFrom: msOf(x.reveal_from),
    revealMs: x.reveal_ms,
    winnerId: x.winner_id,
  }));

  return {
    id: String(r.id),
    code: r.code,
    visibility: r.visibility,
    hostId: r.host_id,
    size: r.size as RoomSize,
    rules: { method: r.method, budget: r.budget, years: r.years ?? [] },
    pickSeconds: r.pick_seconds as PickSeconds,
    showRatings: r.show_ratings,
    rerolls: r.rerolls,
    status: r.status,
    members,
    xi,
    picks,
    deals,
    windows,
    ties,
    round: r.round,
    touchedAt: msOf(r.touched_at),
    ...(r.champion_id ? { championId: r.champion_id } : {}),
    ...(r.started_at ? { startedAt: msOf(r.started_at) } : {}),
  };
}

// --- A room to rows -------------------------------------------------------

/** How many of this player's slots the clock filled. `pvp_matches.loser_auto_picks` reads
 *  it, and that column exists because a ladder inherits this corpus and by then it is too
 *  late to tell a real win from two accounts and one person letting a side idle. */
export function autoPickCount(picks: Record<string, PickRecord> | undefined): number {
  return Object.values(picks ?? {}).filter((p) => p.automatic).length;
}

/** The member rows a save writes. `display_name` is absent: the referee may READ it off
 *  `profiles` and has no grant to write it anywhere (P34), so a room stores a seat and
 *  looks the name up. */
export function memberWrites(room: PvpRoom): {
  userId: string;
  seat: number;
  ready: boolean;
  budget: number;
  rerollsUsed: number;
  outIn: number | null;
  windowOrdinal: number | null;
  windowOpenedAt: string | null;
  formationName: string;
  style: string;
  /** Carried so the round trip is lossless. The DATABASE is the writer of `last_seen` -
   *  the ping goes through `store.seen`, not through a room transition - so `save` does
   *  not update this column; it is here for the reader and for the round-trip check. */
  lastSeen: string;
}[] {
  // PEOPLE ONLY. A practice opponent has no `profiles` row to point `user_id` at, so it is
  // written to `pvp_bots` by `botWrites` instead; writing one here is a foreign-key
  // violation that takes the whole save down with it.
  return humansIn(room).map((m) => {
    const w = room.windows[m.userId];
    return {
      userId: m.userId,
      seat: m.seat,
      ready: m.ready,
      budget: m.budget,
      rerollsUsed: m.rerollsUsed,
      outIn: m.outIn ?? null,
      windowOrdinal: w?.ordinal ?? null,
      windowOpenedAt: w ? atOf(w.openedAt) : null,
      formationName: m.formationName,
      style: m.style,
      lastSeen: atOf(m.lastSeen),
    };
  });
}

/** Every pick, flattened. Keyed by (user, slot) in the table, which is what makes a MOVE
 *  expressible: the same ordinal can end up against a different slot. */
export function pickWrites(room: PvpRoom): {
  userId: string;
  slotId: string;
  playerId: string;
  ordinal: number;
  openedAt: string;
  landedAt: string;
  automatic: boolean;
}[] {
  const out = [];
  const bots = new Set(botsIn(room).map((m) => m.userId));
  for (const [userId, slots] of Object.entries(room.xi)) {
    // A bot's XI rides in its own row (`botWrites`), for the foreign-key reason above -
    // and it is not a series of picks anyway: it was built in one go at the kick-off.
    if (bots.has(userId)) continue;
    for (const [slotId, player] of Object.entries(slots)) {
      if (!player) continue;
      const rec = room.picks[userId]?.[slotId];
      out.push({
        userId,
        slotId,
        playerId: player.id,
        // A pick with no record cannot happen through the state machine, which writes one
        // for every fill. The fallback exists so a room written by an older referee still
        // saves rather than throwing mid-transaction, and it is deliberately obvious:
        // ordinal 0 is outside the table's own check, so it would fail loudly on write.
        ordinal: rec?.ordinal ?? 0,
        openedAt: atOf(rec?.openedAt ?? Date.now()),
        landedAt: atOf(rec?.landedAt ?? Date.now()),
        automatic: rec?.automatic ?? false,
      });
    }
  }
  return out;
}

/** Every deal, in the order they were dealt. Bots have none: a practice opponent in a roll
 *  room rolls its whole team at the kick-off rather than being dealt one squad at a time,
 *  so there is nothing per-window to record. */
export function dealWrites(room: PvpRoom): { userId: string; seq: number; squadId: string }[] {
  const bots = new Set(botsIn(room).map((m) => m.userId));
  return Object.entries(room.deals)
    .filter(([userId]) => !bots.has(userId))
    .flatMap(([userId, squads]) => squads.map((squadId, i) => ({ userId, seq: i + 1, squadId })));
}

/** The practice opponents, as their own rows. The XI is a slot map of player IDS, like the
 *  wire and unlike `pvp_picks`: nothing about a bot's team needs an ordinal, a window or a
 *  landing time, because it was not drafted. */
export function botWrites(room: PvpRoom): {
  botId: string;
  seat: number;
  name: string;
  formationName: string;
  style: string;
  outIn: number | null;
  xi: Record<string, string>;
}[] {
  return botsIn(room).map((m) => ({
    botId: m.userId,
    seat: m.seat,
    name: m.name,
    formationName: m.formationName,
    style: m.style,
    outIn: m.outIn ?? null,
    xi: Object.fromEntries(
      Object.entries(room.xi[m.userId] ?? {})
        .filter(([, p]) => !!p)
        .map(([slotId, p]) => [slotId, p!.id]),
    ),
  }));
}

/**
 * The whole room as rows: what `pgStore`'s statements write, expressed as data.
 *
 * It exists so the mapping can be exercised without a database - the in-memory store the
 * checks drive the referee through is this function plus a `Map`, which means EVERY api
 * check round-trips the mapping rather than one dedicated test doing it. A field the writer
 * forgets is then a check failure somewhere unrelated, which is exactly where you want a
 * silent bug to surface.
 *
 * The heartbeat and the display names come in from outside because the room does not carry
 * them: the first belongs to the sweeper, and the second lives on `profiles`, which the
 * referee may read three columns of and write none of.
 */
export function rowsFromRoom(
  room: PvpRoom,
  extra: {
    sweptAt: number | null;
    displayNames: Record<string, string | null>;
  },
): RoomRows {
  const members = memberWrites(room);
  return {
    room: {
      id: room.id,
      code: room.code,
      visibility: room.visibility,
      host_id: room.hostId,
      size: room.size,
      method: room.rules.method,
      budget: room.rules.budget,
      years: [...room.rules.years],
      show_ratings: room.showRatings,
      rerolls: room.rerolls,
      pick_seconds: room.pickSeconds,
      status: room.status,
      round: room.round,
      champion_id: room.championId ?? null,
      started_at: room.startedAt ? atOf(room.startedAt) : null,
      swept_at: extra.sweptAt === null ? null : atOf(extra.sweptAt),
      touched_at: atOf(room.touchedAt),
    },
    members: members.map((m) => ({
      user_id: m.userId,
      seat: m.seat,
      ready: m.ready,
      budget: m.budget,
      rerolls_used: m.rerollsUsed,
      out_in: m.outIn,
      window_ordinal: m.windowOrdinal,
      window_opened_at: m.windowOpenedAt,
      last_seen: m.lastSeen,
      display_name: extra.displayNames[m.userId] ?? null,
      formation_name: m.formationName,
      style: m.style,
    })),
    bots: botWrites(room).map((b) => ({
      bot_id: b.botId,
      seat: b.seat,
      name: b.name,
      formation_name: b.formationName,
      style: b.style,
      out_in: b.outIn,
      xi: b.xi,
    })),
    deals: dealWrites(room).map((d) => ({
      user_id: d.userId,
      dealt_seq: d.seq,
      squad_id: d.squadId,
    })),
    picks: pickWrites(room).map((p) => ({
      user_id: p.userId,
      slot_id: p.slotId,
      player_id: p.playerId,
      ordinal: p.ordinal,
      opened_at: p.openedAt,
      landed_at: p.landedAt,
      automatic: p.automatic,
    })),
    matches: matchWrites(room).map((x) => ({
      round: x.round,
      game: x.game,
      home_id: x.homeId,
      away_id: x.awayId,
      home_goals: x.homeGoals,
      away_goals: x.awayGoals,
      decided: x.decided,
      events: x.events,
      pens: x.pens,
      stoppage: x.stoppage,
      winner_id: x.winnerId,
      reveal_from: x.revealFrom,
      reveal_ms: x.revealMs,
    })),
  };
}

/** Every played tie, as a match row. Only ties that have a result: a drawn-but-unplayed tie
 *  cannot happen (the draw plays the round in the same step) and writing one would put a
 *  row with no winner into a table whose `winner_id` is not null. */
export function matchWrites(room: PvpRoom): {
  round: number;
  game: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  decided: KoDecided;
  events: MatchEvent[];
  pens: ShootoutResult | null;
  stoppage: number[];
  winnerId: string;
  revealFrom: string;
  revealMs: number;
  roomVisibility: 'public' | 'private';
  roomSize: number;
  loserAutoPicks: number;
  /** How many of the two sides were practice opponents (migration 0019). It is the fourth
   *  fact in the same family as the three above, and it is the one that keeps `pvp_records`
   *  honest: a tie with a bot in it is excluded from the view, so a room full of them
   *  cannot be used to build a record. Recording it rather than deriving it later is the
   *  same reasoning - by the time a ladder wants to know, the room is gone. */
  botSides: number;
}[] {
  const bots = new Set(botsIn(room).map((m) => m.userId));
  return room.ties
    .filter((t) => t.result && t.winnerId)
    .map((t) => {
      const loserId = t.winnerId === t.homeId ? t.awayId : t.homeId;
      return {
        round: t.round,
        game: t.game,
        homeId: t.homeId,
        awayId: t.awayId,
        homeGoals: t.result!.homeGoals,
        awayGoals: t.result!.awayGoals,
        decided: t.result!.decided,
        events: t.result!.events,
        pens: t.result!.pens ?? null,
        stoppage: [t.stoppage?.[0] ?? 0, t.stoppage?.[1] ?? 0],
        winnerId: t.winnerId!,
        revealFrom: atOf(t.revealFrom ?? 0),
        revealMs: t.revealMs ?? 0,
        roomVisibility: room.visibility,
        roomSize: room.size,
        loserAutoPicks: autoPickCount(room.picks[loserId]),
        botSides: (bots.has(t.homeId) ? 1 : 0) + (bots.has(t.awayId) ? 1 : 0),
      };
    });
}
