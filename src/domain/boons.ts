import type { Player } from '../data/types';
import { categoryOf, isAttacker, isDefender, primaryPosition } from '../data/types';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../data/squads';
import { CONFEDERATION } from '../data/confederations';
import { bump } from './effects';

/** Rarity ramp, mirrored on the sticker tiers for a consistent look. */
export type Rarity = 'common' | 'rare' | 'legendary';

/** Run context a boon may read (e.g. the upcoming opponent, for Poach). */
export interface BoonContext {
  opponentSquadId: string | null;
}

// ---------------------------------------------------------------------------
// Balance, 2026-08-15. What a boon is worth is what it does to the two numbers the
// match sim reads: the AVERAGE of your attack (MID/FWD, ~6 players) and the average
// of your defence (GK/DEF, ~5). Handing +6 to one attacker moves attack by 1, not 6.
// A boon's budget is the SUM of what it moves both averages, so Golden Generation
// (+2 attack, +2 defence) costs 4 and a common giving +2 to one line costs 2 - exactly
// half of it. `npm run checks` prints every boon's figure and fails on an overspend:
//
//   common     2.0
//   rare       3.2
//   legendary  4.5
//
// A boon may exceed its band when it pays for it: a trade-off that gives points back
// (Glass Cannon, Catenaccio), or a condition nobody controls (the draw). Conditions
// the player controls AT BUILD TIME are off-limits - that is what made the old
// Chemistry Catalyst a legendary in a common's clothing, since a single-nation XI is
// trivial to buy in the transfer market.
// ---------------------------------------------------------------------------

/** What a rating boon decides when it is picked: exactly who is affected, and by how
 *  much. Resolved ONCE, against the XI as it stands at the moment of the pick, and then
 *  stored as a `RunEffect`. It is deliberately not a predicate that could be re-evaluated
 *  later: "your weakest player" must mean who that was when you took the card, or the run
 *  would change under the player as other effects land. */
export interface RatingPlan {
  ids: string[];
  delta: number;
}

/** The two things a boon can actually do, split so the rating half can be recorded rather
 *  than baked in (see `domain/effects.ts`).
 *
 *  - `rating` returns a PLAN. The run records it in its effect ledger and derives the XI.
 *  - `roster` changes WHO is in the XI, so it rewrites the base roster and is permanent by
 *    nature. Rating effects already granted keep their frozen ids, so an incoming player is
 *    not retroactively bumped - which is exactly what the old baked-in version did. */
export type BoonEffect =
  | { kind: 'rating'; plan: (xi: Player[], ctx: BoonContext) => RatingPlan[] }
  | { kind: 'roster'; apply: (roster: Player[], ctx: BoonContext) => Player[] };

/** A boon chosen between rounds of a Cup Run.
 *
 *  Boons last the whole run: every one applies and stays applied. (The ledger supports
 *  expiry, but no boon uses it - only the temporary effects a run node can hand out.) */
export interface Boon {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  /** In the offer pool from the start (no Prestige unlock needed). Locked boons are
   *  bought into the pool via career Prestige (see `BOON_UNLOCK_COST` / `unlockBoon`). */
  starter?: boolean;
  effect: BoonEffect;
}

/** Prestige price to unlock a locked (non-starter) boon into the offer pool, by rarity. */
export const BOON_UNLOCK_COST: Record<Rarity, number> = { common: 15, rare: 30, legendary: 55 };

/** Relative offer weight by rarity, so legendaries turn up rarely in a 1-of-N offer. */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, rare: 3, legendary: 1 };

const catOf = (p: Player) => categoryOf(primaryPosition(p));
const weakest = (xi: Player[]) => xi.reduce((lo, p) => (p.elo < lo.elo ? p : lo), xi[0]);
const weakestOfCat = (xi: Player[], cat: ReturnType<typeof catOf>): Player | null => {
  const inCat = xi.filter((p) => catOf(p) === cat);
  return inCat.length ? inCat.reduce((lo, p) => (p.elo < lo.elo ? p : lo), inCat[0]) : null;
};
const swap = (xi: Player[], outId: string, inP: Player) =>
  xi.map((p) => (p.id === outId ? inP : p));

// Plan builders. Each resolves a predicate to concrete ids against the XI in hand, so
// what the effect ledger stores is "these eleven players, +2" rather than a rule that
// could pick different players later.

/** The `n` lowest-rated players, by `d`. */
const planLowest = (xi: Player[], n: number, d: number): RatingPlan[] => [
  { ids: [...xi].sort((a, b) => a.elo - b.elo).slice(0, n).map((p) => p.id), delta: d },
];

/** The `n` highest-rated players, by `d`. */
const planHighest = (xi: Player[], n: number, d: number): RatingPlan[] => [
  { ids: [...xi].sort((a, b) => b.elo - a.elo).slice(0, n).map((p) => p.id), delta: d },
];

/** Everyone the predicate picks out, by `d`. An empty selection is a legal no-op plan. */
const planWhere = (xi: Player[], pick: (p: Player) => boolean, d: number): RatingPlan[] => [
  { ids: xi.filter(pick).map((p) => p.id), delta: d },
];

/** The whole XI, by `d`. */
const planAll = (xi: Player[], d: number): RatingPlan[] => [{ ids: xi.map((p) => p.id), delta: d }];

/** Replace the `n` weakest players with picks from `pool`, cheapest slot first. Used by
 *  the legend boons; skips anyone already in the XI (by person, not card). */
function replaceWeakest(xi: Player[], n: number, pool: Player[]): Player[] {
  let out = xi;
  for (let i = 0; i < n; i++) {
    const used = new Set(out.map((p) => p.personId));
    const cands = pool.filter((p) => !used.has(p.personId));
    if (!cands.length) break;
    const inP = cands[Math.floor(Math.random() * cands.length)];
    const target = weakestOfCat(out, catOf(inP)) ?? weakest(out);
    out = swap(out, target.id, inP);
  }
  return out;
}

export const BOONS: Boon[] = [
  {
    id: 'golden-generation',
    name: 'Golden Generation',
    rarity: 'legendary',
    description: '+2 rating to your entire XI.',
    effect: { kind: 'rating', plan: (xi) => planAll(xi, 2) },
  },
  {
    id: 'marquee-signing',
    name: 'Marquee Signing',
    // Was legendary. One star can only move an average so far: +6 to a single
    // attacker is +1 attack, which a common already beats.
    rarity: 'rare',
    description: '+12 to your best player.',
    effect: { kind: 'rating', plan: (xi) => planHighest(xi, 1, 12) },
  },
  {
    id: 'star-signing',
    name: 'Star Signing',
    // Was rare, for about a common's worth of movement.
    rarity: 'common',
    starter: true,
    description: '+6 to your weakest player.',
    effect: { kind: 'rating', plan: (xi) => planLowest(xi, 1, 6) },
  },
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    rarity: 'rare',
    description: '+5 to attackers, -3 to defenders. High risk.',
    effect: {
      kind: 'rating',
      plan: (xi) => [...planWhere(xi, isAttacker, 5), ...planWhere(xi, isDefender, -3)],
    },
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    rarity: 'common',
    starter: true,
    description: '+3 to your three lowest-rated players.',
    effect: { kind: 'rating', plan: (xi) => planLowest(xi, 3, 3) },
  },
  {
    id: 'attacking-masterclass',
    name: 'Attacking Masterclass',
    rarity: 'common',
    starter: true,
    description: '+2 to your midfielders and forwards.',
    effect: { kind: 'rating', plan: (xi) => planWhere(xi, isAttacker, 2) },
  },
  {
    id: 'defensive-drills',
    name: 'Defensive Drills',
    rarity: 'common',
    starter: true,
    description: '+2 to your goalkeeper and defenders.',
    effect: { kind: 'rating', plan: (xi) => planWhere(xi, isDefender, 2) },
  },
  {
    // Replaces Chemistry Catalyst ("+2 to your most-represented nation"), which was a
    // legendary effect at common rarity: a single-nation XI is trivial to buy in the
    // transfer market, and the chemistry bonus already rewards cohesion at build time.
    // This hangs on the draw instead, which nobody controls.
    id: 'familiar-foes',
    name: 'Familiar Foes',
    rarity: 'rare',
    description: '+3 to players from the same continent as your next opponent.',
    effect: {
      kind: 'rating',
      plan: (xi, ctx) => {
        const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
        const conf = opp ? CONFEDERATION[opp.code] : undefined;
        if (!conf) return [];
        return planWhere(xi, (p) => CONFEDERATION[SQUAD_BY_ID[p.squadId]?.code ?? ''] === conf, 3);
      },
    },
  },
  {
    id: 'transfer',
    name: 'Transfer',
    rarity: 'rare',
    starter: true,
    description: 'Swap your weakest player for a stronger one in the same position.',
    effect: {
      kind: 'roster',
      apply: (roster) => {
        const out = weakest(roster);
        const cat = catOf(out);
        const used = new Set(roster.map((p) => p.personId));
        const cands = ALL_PLAYERS.filter(
          (p) => catOf(p) === cat && p.elo > out.elo && !used.has(p.personId),
        );
        if (!cands.length) return roster;
        return swap(roster, out.id, cands[Math.floor(Math.random() * cands.length)]);
      },
    },
  },
  {
    id: 'poach',
    name: 'Poach',
    rarity: 'rare',
    description: "Steal your next opponent's best player.",
    effect: {
      kind: 'roster',
      apply: (roster, ctx) => {
        const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
        if (!opp) return roster;
        const used = new Set(roster.map((p) => p.personId));
        const cands = opp.players.filter((p) => !used.has(p.personId));
        if (!cands.length) return roster;
        const inP = cands.reduce((hi, p) => (p.elo > hi.elo ? p : hi), cands[0]);
        const out = weakestOfCat(roster, catOf(inP)) ?? weakest(roster);
        return swap(roster, out.id, inP);
      },
    },
  },
  {
    id: 'wildcard',
    name: 'Wildcard Legend',
    rarity: 'legendary',
    description: 'Add a random 90+ legend to your XI.',
    effect: {
      kind: 'roster',
      apply: (roster) => {
        const used = new Set(roster.map((p) => p.personId));
        const legends = ALL_PLAYERS.filter((p) => p.elo >= 90 && !used.has(p.personId));
        if (!legends.length) return roster;
        const inP = legends[Math.floor(Math.random() * legends.length)];
        const out = weakestOfCat(roster, catOf(inP)) ?? weakest(roster);
        return swap(roster, out.id, inP);
      },
    },
  },
  // --- added 2026-08-15: the pool was 11 with 5 starters, so early runs saw the same
  // handful every time. Three of these hang on the draw rather than on your build.
  {
    id: 'keeper-coach',
    name: 'Keeper Coach',
    rarity: 'common',
    starter: true,
    description: '+6 to your goalkeeper.',
    effect: { kind: 'rating', plan: (xi) => planWhere(xi, (p) => catOf(p) === 'GK', 6) },
  },
  {
    id: 'squad-rotation',
    name: 'Squad Rotation',
    rarity: 'common',
    description: '+4 to your two weakest players.',
    effect: { kind: 'rating', plan: (xi) => planLowest(xi, 2, 4) },
  },
  {
    id: 'set-piece-drills',
    name: 'Set-Piece Drills',
    rarity: 'common',
    description: '+2 to your outfield defenders.',
    effect: { kind: 'rating', plan: (xi) => planWhere(xi, (p) => catOf(p) === 'DEF', 2) },
  },
  {
    // The mirror of Glass Cannon, so the trade-off cuts both ways.
    id: 'catenaccio',
    name: 'Catenaccio',
    rarity: 'rare',
    description: '+4 to your defence, -2 to your attack. Win it 1-0.',
    effect: {
      kind: 'rating',
      plan: (xi) => [...planWhere(xi, isDefender, 4), ...planWhere(xi, isAttacker, -2)],
    },
  },
  {
    id: 'counter-attack',
    name: 'Counter Attack',
    rarity: 'rare',
    description: '+8 to your forwards, -2 to your midfielders.',
    effect: {
      kind: 'rating',
      plan: (xi) => [
        ...planWhere(xi, (p) => catOf(p) === 'FWD', 8),
        ...planWhere(xi, (p) => catOf(p) === 'MID', -2),
      ],
    },
  },
  {
    // Conditional on the draw, so it cannot be set up in advance: strong when it fires,
    // nothing when it does not.
    id: 'underdog-spirit',
    name: 'Underdog Spirit',
    rarity: 'rare',
    description: '+3 to your entire XI, but only against a stronger opponent.',
    effect: {
      kind: 'rating',
      plan: (xi, ctx) => {
        const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
        if (!opp) return [];
        const oppBest = [...opp.players].sort((a, b) => b.elo - a.elo).slice(0, 11);
        const mean = (ps: Player[]) => ps.reduce((s, p) => s + p.elo, 0) / (ps.length || 1);
        return mean(oppBest) > mean(xi) ? planAll(xi, 3) : [];
      },
    },
  },
  {
    id: 'galacticos',
    name: 'Galacticos',
    rarity: 'legendary',
    description: '+6 to your three best players.',
    effect: { kind: 'rating', plan: (xi) => planHighest(xi, 3, 6) },
  },
  {
    id: 'legends-reunion',
    name: "Legends' Reunion",
    rarity: 'legendary',
    // One swap, but from a rarer shelf than Wildcard's 90+, so the two are distinct
    // without stacking to twice a Golden Generation (which two 90+ swaps measured at).
    description: 'Your weakest player is replaced by a 93+ icon.',
    effect: {
      kind: 'roster',
      apply: (roster) => replaceWeakest(roster, 1, ALL_PLAYERS.filter((p) => p.elo >= 93)),
    },
  },
];

/**
 * Apply a boon straight to an XI and hand back the result, the way `Boon.apply` used to.
 *
 * The run itself does NOT use this - it goes through the effect ledger (`grantBoon` in
 * domain/run.ts), so it can record what was applied. This exists for callers that only
 * want the resulting XI and have no run to record against: the balance harness, which
 * measures a boon by the movement it causes, and anything else measuring rather than
 * playing. Same fold, same per-step clamp, so the two agree by construction.
 */
export function applyBoon(xi: Player[], boon: Boon, ctx: BoonContext): Player[] {
  if (boon.effect.kind === 'roster') return boon.effect.apply(xi, ctx);
  let out = xi;
  for (const plan of boon.effect.plan(xi, ctx)) {
    const ids = new Set(plan.ids);
    out = out.map((p) => (ids.has(p.id) ? bump(p, plan.delta) : p));
  }
  return out;
}

const BY_ID = new Map(BOONS.map((b) => [b.id, b]));
export const boonById = (id: string): Boon | undefined => BY_ID.get(id);

/** The offer pool for a career: the always-available starters plus everything the
 *  player has unlocked with Prestige. Pure; the caller passes its unlocked ids. */
export function availableBoons(unlockedBoonIds: string[] = []): Boon[] {
  const unlocked = new Set(unlockedBoonIds);
  return BOONS.filter((b) => b.starter || unlocked.has(b.id));
}

/** Every locked (non-starter) boon, for the unlock library UI. */
export function lockableBoons(): Boon[] {
  return BOONS.filter((b) => !b.starter);
}

/** Offer `n` distinct boons drawn from `available`, weighted by rarity so legendaries
 *  turn up rarely (weighted sampling without replacement). `n` is clamped to the pool
 *  size. Uses Math.random intentionally, matching the sim. */
export function offerBoons(available: Boon[], n = 3): Boon[] {
  const pool = [...available];
  const out: Boon[] = [];
  const take = Math.min(n, pool.length);
  for (let k = 0; k < take; k++) {
    const total = pool.reduce((s, b) => s + RARITY_WEIGHT[b.rarity], 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= RARITY_WEIGHT[pool[idx].rarity];
      if (r <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
