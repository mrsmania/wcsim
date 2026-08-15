import type { Player } from '../data/types';
import { categoryOf, isAttacker, isDefender, primaryPosition, ELO_MAX, ELO_MIN } from '../data/types';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../data/squads';
import { CONFEDERATION } from '../data/confederations';

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

/** A boon chosen between rounds of a Cup Run. `apply` is a pure transform of the XI
 *  - either rating deltas (flowing into `xiStrength`/the sim) or a roster change (a
 *  player swapped in/out). Rating boons ignore the context.
 *
 *  Boons last the whole run: every one applies to the XI and stays applied. */
export interface Boon {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  /** In the offer pool from the start (no Prestige unlock needed). Locked boons are
   *  bought into the pool via career Prestige (see `BOON_UNLOCK_COST` / `unlockBoon`). */
  starter?: boolean;
  apply: (xi: Player[], ctx: BoonContext) => Player[];
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

const bump = (p: Player, d: number): Player => ({
  ...p,
  elo: Math.max(ELO_MIN, Math.min(ELO_MAX, p.elo + d)),
});

/** Bump the `n` lowest-rated players by `d`. */
function bumpLowest(xi: Player[], n: number, d: number): Player[] {
  const ids = new Set([...xi].sort((a, b) => a.elo - b.elo).slice(0, n).map((p) => p.id));
  return xi.map((p) => (ids.has(p.id) ? bump(p, d) : p));
}

/** Bump the `n` highest-rated players by `d`. */
function bumpHighest(xi: Player[], n: number, d: number): Player[] {
  const ids = new Set([...xi].sort((a, b) => b.elo - a.elo).slice(0, n).map((p) => p.id));
  return xi.map((p) => (ids.has(p.id) ? bump(p, d) : p));
}

/** Bump every player the predicate picks out. */
const bumpWhere = (xi: Player[], pick: (p: Player) => boolean, d: number) =>
  xi.map((p) => (pick(p) ? bump(p, d) : p));

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
    apply: (xi) => xi.map((p) => bump(p, 2)),
  },
  {
    id: 'marquee-signing',
    name: 'Marquee Signing',
    // Was legendary. One star can only move an average so far: +6 to a single
    // attacker is +1 attack, which a common already beats.
    rarity: 'rare',
    description: '+12 to your best player.',
    apply: (xi) => bumpHighest(xi, 1, 12),
  },
  {
    id: 'star-signing',
    name: 'Star Signing',
    // Was rare, for about a common's worth of movement.
    rarity: 'common',
    starter: true,
    description: '+6 to your weakest player.',
    apply: (xi) => bumpLowest(xi, 1, 6),
  },
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    rarity: 'rare',
    description: '+5 to attackers, -3 to defenders. High risk.',
    apply: (xi) => xi.map((p) => (isAttacker(p) ? bump(p, 5) : isDefender(p) ? bump(p, -3) : p)),
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    rarity: 'common',
    starter: true,
    description: '+3 to your three lowest-rated players.',
    apply: (xi) => bumpLowest(xi, 3, 3),
  },
  {
    id: 'attacking-masterclass',
    name: 'Attacking Masterclass',
    rarity: 'common',
    starter: true,
    description: '+2 to your midfielders and forwards.',
    apply: (xi) => xi.map((p) => (isAttacker(p) ? bump(p, 2) : p)),
  },
  {
    id: 'defensive-drills',
    name: 'Defensive Drills',
    rarity: 'common',
    starter: true,
    description: '+2 to your goalkeeper and defenders.',
    apply: (xi) => xi.map((p) => (isDefender(p) ? bump(p, 2) : p)),
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
    apply: (xi, ctx) => {
      const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
      const conf = opp ? CONFEDERATION[opp.code] : undefined;
      if (!conf) return xi;
      return bumpWhere(xi, (p) => CONFEDERATION[SQUAD_BY_ID[p.squadId]?.code ?? ''] === conf, 3);
    },
  },
  {
    id: 'transfer',
    name: 'Transfer',
    rarity: 'rare',
    starter: true,
    description: 'Swap your weakest player for a stronger one in the same position.',
    apply: (xi) => {
      const out = weakest(xi);
      const cat = catOf(out);
      const used = new Set(xi.map((p) => p.personId));
      const cands = ALL_PLAYERS.filter(
        (p) => catOf(p) === cat && p.elo > out.elo && !used.has(p.personId),
      );
      if (!cands.length) return xi;
      return swap(xi, out.id, cands[Math.floor(Math.random() * cands.length)]);
    },
  },
  {
    id: 'poach',
    name: 'Poach',
    rarity: 'rare',
    description: "Steal your next opponent's best player.",
    apply: (xi, ctx) => {
      const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
      if (!opp) return xi;
      const used = new Set(xi.map((p) => p.personId));
      const cands = opp.players.filter((p) => !used.has(p.personId));
      if (!cands.length) return xi;
      const inP = cands.reduce((hi, p) => (p.elo > hi.elo ? p : hi), cands[0]);
      const out = weakestOfCat(xi, catOf(inP)) ?? weakest(xi);
      return swap(xi, out.id, inP);
    },
  },
  {
    id: 'wildcard',
    name: 'Wildcard Legend',
    rarity: 'legendary',
    description: 'Add a random 90+ legend to your XI.',
    apply: (xi) => {
      const used = new Set(xi.map((p) => p.personId));
      const legends = ALL_PLAYERS.filter((p) => p.elo >= 90 && !used.has(p.personId));
      if (!legends.length) return xi;
      const inP = legends[Math.floor(Math.random() * legends.length)];
      const out = weakestOfCat(xi, catOf(inP)) ?? weakest(xi);
      return swap(xi, out.id, inP);
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
    apply: (xi) => bumpWhere(xi, (p) => catOf(p) === 'GK', 6),
  },
  {
    id: 'squad-rotation',
    name: 'Squad Rotation',
    rarity: 'common',
    description: '+4 to your two weakest players.',
    apply: (xi) => bumpLowest(xi, 2, 4),
  },
  {
    id: 'set-piece-drills',
    name: 'Set-Piece Drills',
    rarity: 'common',
    description: '+2 to your outfield defenders.',
    apply: (xi) => bumpWhere(xi, (p) => catOf(p) === 'DEF', 2),
  },
  {
    // The mirror of Glass Cannon, so the trade-off cuts both ways.
    id: 'catenaccio',
    name: 'Catenaccio',
    rarity: 'rare',
    description: '+4 to your defence, -2 to your attack. Win it 1-0.',
    apply: (xi) => xi.map((p) => (isDefender(p) ? bump(p, 4) : isAttacker(p) ? bump(p, -2) : p)),
  },
  {
    id: 'counter-attack',
    name: 'Counter Attack',
    rarity: 'rare',
    description: '+8 to your forwards, -2 to your midfielders.',
    apply: (xi) =>
      xi.map((p) => (catOf(p) === 'FWD' ? bump(p, 8) : catOf(p) === 'MID' ? bump(p, -2) : p)),
  },
  {
    // Conditional on the draw, so it cannot be set up in advance: strong when it fires,
    // nothing when it does not.
    id: 'underdog-spirit',
    name: 'Underdog Spirit',
    rarity: 'rare',
    description: '+3 to your entire XI, but only against a stronger opponent.',
    apply: (xi, ctx) => {
      const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
      if (!opp) return xi;
      const oppBest = [...opp.players].sort((a, b) => b.elo - a.elo).slice(0, 11);
      const mean = (ps: Player[]) => ps.reduce((s, p) => s + p.elo, 0) / (ps.length || 1);
      return mean(oppBest) > mean(xi) ? xi.map((p) => bump(p, 3)) : xi;
    },
  },
  {
    id: 'galacticos',
    name: 'Galacticos',
    rarity: 'legendary',
    description: '+6 to your three best players.',
    apply: (xi) => bumpHighest(xi, 3, 6),
  },
  {
    id: 'legends-reunion',
    name: "Legends' Reunion",
    rarity: 'legendary',
    // One swap, but from a rarer shelf than Wildcard's 90+, so the two are distinct
    // without stacking to twice a Golden Generation (which two 90+ swaps measured at).
    description: 'Your weakest player is replaced by a 93+ icon.',
    apply: (xi) => replaceWeakest(xi, 1, ALL_PLAYERS.filter((p) => p.elo >= 93)),
  },
];

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
