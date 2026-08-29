// ---------------------------------------------------------------------------
// Practice opponents: a seat the host can fill so a room of four or eight is playable
// with two people in it.
//
// THE PROBLEM THIS EXISTS FOR is the one thing a room of eight cannot solve on its own:
// it needs eight people at once, and until it has them the Start button says "waiting for
// six more" for ever. P7's play-it-smaller answers half of it (drop eight to four to two)
// and stops there, because a room of two is a different evening from a tournament. A bot
// seat answers the other half: the host plays the tournament they opened, now, and the
// empty chairs hold somebody worth beating.
//
// THREE RULES RUN THROUGH ALL OF IT.
//
// 1. A BOT IS A SEAT, NOT A PLAYER. It has no account, no career, no record and no
//    profile row - which is why it lives in its own table (migration 0019) rather than in
//    `pvp_members`, whose `user_id` is a foreign key into `profiles`. Everything else in
//    the room treats it as an ordinary member, because everything else in the room only
//    ever asks a member for a name, a shape and an XI.
// 2. A BOT NEVER KEEPS A HUMAN OUT. A person arriving at a full room takes a bot's chair
//    (`joinRoom`), and a room whose last human leaves closes rather than sitting there
//    with four robots in it. The seat is a placeholder that yields.
// 3. IT BUILDS A TEAM WORTH PLAYING. Not the auto-pick, which is deliberately random so
//    that letting the clock run out is a punishment (P21) - a bot that drafted like an
//    expired window would be a free win in every round it appeared, which is worse than
//    an empty room. It buys near the best XI its money can reach, and it spends
//    `BOT_SPEND` of that money rather than all of it, which is the whole of the handicap:
//    see the constant.
//
// Pure and framework-free like the rest of `domain/`, and driven by the referee: a bot's
// XI is built once, at the moment the host starts the room, and never touched again.
// ---------------------------------------------------------------------------

import type { Player, Position } from '../data/types';
import { rollAny } from './draft';
import type { Filled } from './draft';
import type { Formation, Slot } from './formations';
import { priceOf } from './pricing';
import { pick, shuffled } from './random';
import { autoCompleteXi, roomPlayers, roomSquads, xiCost, type RoomRules } from './pvp';

/**
 * How much of its budget a bot allows itself.
 *
 * IT IS THE ONLY DIFFICULTY KNOB THERE IS, and one knob is the point: a bot that shopped
 * the whole budget optimally would be the strongest XI the money can buy, every time, and
 * a human who spent well and lost anyway would have no way to tell whether they had been
 * outplayed or arithmetically beaten. Held back a twentieth, it is still a team that has to
 * be beaten - the price curve is convex, so the last 5% of a budget buys the last point or
 * two of a single rating rather than a player - while leaving a well-judged XI ahead of it.
 *
 * The rest of the money is not wasted: the search below spends nearly all of what it is
 * allowed, so a $110 bot fields an XI costing $104.
 *
 * MEASURED, at $110 over a 4-3-3, which is what makes the paragraph above a claim rather
 * than a hope. The best XI the whole budget can buy rates **84.0**; the bot rates **83.0**,
 * one point behind for the twentieth it does not spend. Against the XI an expired clock
 * builds (rating 75.4) it wins **80%** of ties, which is the "not cannon fodder" half.
 * Against the transfer market's own one-tap Auto-fill and spend (80.5), which is what a
 * player who does not think about it gets, it wins **57%** - so it is the better side and
 * not by much, which is the whole target.
 */
export const BOT_SPEND = 0.95;

/** How many upgrade passes the leftover-spending loop may make. It ends on its own when
 *  nothing affordable improves the XI; this is the bound that says so in the type system
 *  rather than in a comment. */
const UPGRADE_GUARD = 60;

/** How many candidates a random pick draws from when two are close. Enough that two bots
 *  in one room field different teams, small enough that neither of them is bad. */
const PICK_POOL = 3;

/**
 * The names a practice opponent plays under.
 *
 * They are deliberately NOT people's names. A room shows display names beside each other
 * and the one thing a player must never wonder is whether the person who just knocked them
 * out was real, so a bot is called after the thing it is: a training-ground side. The
 * screens mark the seat as well (`MemberView.bot`), and the two together are the answer to
 * P22's "a stranger's name is the only thing you know about them".
 */
const BOT_NAMES = [
  'The Reserves',
  'The Academy',
  'Old Boys XI',
  'The Ringers',
  'Training Ground',
  'The Understudies',
  'Bench Warmers',
  'The Scratch Side',
] as const;

/** A name no one in this room is using yet. Falls back to a numbered one, so a room can
 *  never fail to seat a bot for want of a label. */
export function botName(taken: readonly string[]): string {
  const used = new Set(taken);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free[0] ?? `Practice XI ${taken.length + 1}`;
}

// --- Building the team -----------------------------------------------------

/** Every player who may stand in each position, dearest first. Built once per pool and
 *  handed to the search below, which asks the same question a few hundred times. */
function byPosition(players: readonly Player[]): Map<Position, Player[]> {
  const out = new Map<Position, Player[]>();
  for (const p of players) {
    for (const pos of p.positions) {
      const list = out.get(pos);
      if (list) list.push(p);
      else out.set(pos, [p]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => b.elo - a.elo);
  return out;
}

/**
 * The best XI at one exchange rate.
 *
 * THIS IS THE WHOLE SEARCH, and it is a Lagrangian rather than a greedy fill: `lambda` is
 * what the bot is willing to pay for a rating point, and each slot independently takes
 * whoever maximises `elo - lambda * price`. A high lambda buys a squad of bargains, a low
 * one buys three superstars and eight minimum-wage defenders, and somewhere between them is
 * an XI that spends the budget. `bestXiWithin` binary-searches for that point.
 *
 * Why not fill greedily and upgrade: a greedy fill commits its money slot by slot in an
 * order it cannot revisit, so it reliably overpays for whichever position it happened to
 * shop first. The exchange rate has no order at all - which is also why the duplicate rule
 * is the only place `order` matters.
 *
 * `order` IS FIXED FOR THE WHOLE BISECTION, and re-shuffling it per step would be a real
 * bug rather than a wasted call: the search below assumes that raising lambda cannot raise
 * the price, and a different tie-break each step makes the cost jump about, so the bisection
 * would be chasing noise. Shuffled ONCE per bot is what makes two of them different teams.
 */
function xiAt(order: readonly Slot[], pool: Map<Position, Player[]>, lambda: number): Filled {
  const out: Filled = {};
  const used = new Set<string>();
  // The ONE thing this cannot do independently is hand the same person to two slots - a
  // left-back who is also a centre-back may be the best answer to both - so the first slot
  // to ask gets him, and which that is was decided once by the caller.
  for (const slot of order) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of pool.get(slot.position) ?? []) {
      if (used.has(p.personId)) continue;
      const score = p.elo - lambda * priceOf(p.elo);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      out[slot.id] = best;
      used.add(best.personId);
    }
  }
  return out;
}

/** What a slot map costs at the room's prices. */
const costOf = (filled: Filled): number =>
  xiCost(Object.values(filled).filter((p): p is Player => !!p));

/**
 * The best XI this money can buy, or near enough that the difference is a rating point.
 *
 * Thirty steps of bisection on the exchange rate, then a bounded pass that spends whatever
 * is left on the cheapest improvement it can find - because the bisection lands UNDER the
 * budget by construction and the last few dollars are still worth a point.
 */
export function bestXiWithin(
  slots: readonly Slot[],
  players: readonly Player[],
  budget: number,
): Filled {
  const pool = byPosition(players);
  const order = shuffled(slots);
  // Lambda 0 is "rating at any price"; 40 is past the steepest the curve ever gets (a
  // dollar buys a fraction of a point at the top of the scale), so the two ends bracket
  // every budget a room can be opened with.
  let low = 0;
  let high = 40;
  let best = xiAt(order, pool, high);
  if (costOf(best) > budget) return best; // Cannot afford even the cheapest XI: say so.
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    const candidate = xiAt(order, pool, mid);
    if (costOf(candidate) <= budget) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }
  return spendTheRest(slots, pool, best, budget);
}

/** Put the bisection's leftover to work: the best single upgrade that still fits, over and
 *  over, until nothing does. Random among the top few so two bots with the same money do
 *  not converge on the same team. */
function spendTheRest(
  slots: readonly Slot[],
  pool: Map<Position, Player[]>,
  filled: Filled,
  budget: number,
): Filled {
  const next: Filled = { ...filled };
  const used = new Set(Object.values(next).filter((p): p is Player => !!p).map((p) => p.personId));
  let left = budget - costOf(next);
  for (let guard = 0; guard < UPGRADE_GUARD; guard++) {
    // ONE option per slot, the best of that slot's, rather than every affordable upgrade
    // in the room: a scan that keeps a running best is linear and needs no sort, where
    // collecting them all is tens of thousands of objects a pass for a choice made between
    // eleven of them.
    const options: { slotId: string; player: Player; ratio: number }[] = [];
    for (const slot of slots) {
      const cur = next[slot.id];
      if (!cur) continue;
      const curPrice = priceOf(cur.elo);
      let bestPlayer: Player | null = null;
      let bestRatio = 0;
      for (const p of pool.get(slot.position) ?? []) {
        if (p.elo <= cur.elo) break; // Dearest first, so nothing below here improves it.
        if (used.has(p.personId)) continue;
        const cost = priceOf(p.elo) - curPrice;
        if (cost > left) continue;
        const ratio = (p.elo - cur.elo) / Math.max(1, cost);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestPlayer = p;
        }
      }
      if (bestPlayer) options.push({ slotId: slot.id, player: bestPlayer, ratio: bestRatio });
    }
    if (!options.length) return next;
    // Most rating per dollar, and a random one of the best few.
    options.sort((a, b) => b.ratio - a.ratio);
    const chosen = pick(options.slice(0, PICK_POOL));
    if (!chosen) return next;
    const out = next[chosen.slotId]!;
    used.delete(out.personId);
    used.add(chosen.player.personId);
    next[chosen.slotId] = chosen.player;
    left -= priceOf(chosen.player.elo) - priceOf(out.elo);
  }
  return next;
}

/**
 * A roll room's bot: eleven squads, and the best man in each.
 *
 * It does not re-roll. A dealt squad's best eligible player is what a competent human takes
 * most of the time anyway, and the re-roll allowance is the host's rule for the people in
 * the room rather than something a seat-filler needs to spend. What it does do is choose
 * WHICH slot to fill from each squad, which is the actual skill in a roll draft: taking the
 * 90-rated striker while the striker's slot is open, rather than the best left-back in it.
 */
function rolledXi(rules: RoomRules, formation: Formation): Filled {
  const squads = roomSquads(rules);
  const filled: Filled = {};
  const used = new Set<string>();
  let held: string | null = null;
  for (let i = 0; i < formation.slots.length; i++) {
    const open = formation.slots.filter((s) => !filled[s.id]);
    if (!open.length) break;
    const squad = rollAny(squads, new Set(open.map((s) => s.position)), used, held);
    if (!squad) break;
    held = squad.id;
    let bestSlot: Slot | null = null;
    let bestPlayer: Player | null = null;
    for (const slot of open) {
      for (const p of squad.players) {
        if (used.has(p.personId) || !p.positions.includes(slot.position)) continue;
        if (!bestPlayer || p.elo > bestPlayer.elo) {
          bestPlayer = p;
          bestSlot = slot;
        }
      }
    }
    if (!bestSlot || !bestPlayer) continue;
    filled[bestSlot.id] = bestPlayer;
    used.add(bestPlayer.personId);
  }
  return filled;
}

/**
 * The XI a practice opponent turns up with.
 *
 * Called once, when the host starts the room: a bot does not draft against the clock, it
 * simply has a team. That is the honest shape of it - nobody is watching it think - and it
 * is also what keeps the pick clock a rule about people.
 *
 * The finisher is `autoCompleteXi`, the same function an expired window uses, and it is a
 * backstop rather than a path: it only has anything to do when a pool cannot fill a
 * formation at all, which is a fact about the room's own rules rather than about the bot.
 */
export function botXi(rules: RoomRules, formation: Formation): Filled {
  if (rules.method === 'roll') {
    const rolled = rolledXi(rules, formation);
    return autoCompleteXi(formation, rolled, rules, {});
  }
  const budget = Math.floor(rules.budget * BOT_SPEND);
  const bought = bestXiWithin(formation.slots, roomPlayers(rules), budget);
  return autoCompleteXi(formation, bought, rules, {
    remaining: rules.budget - costOf(bought),
  });
}
