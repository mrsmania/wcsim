import type { Player } from '../data/types';
import { categoryOf, isAttacker, isDefender, primaryPosition, ELO_MAX, ELO_MIN } from '../data/types';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../data/squads';

/** Rarity ramp, mirrored on the sticker tiers for a consistent look. */
export type Rarity = 'common' | 'rare' | 'legendary';

/** Run context a boon may read (e.g. the upcoming opponent, for Poach). */
export interface BoonContext {
  opponentSquadId: string | null;
}

/** A boon chosen between rounds of a Cup Run. `apply` is a pure transform of the XI
 *  - either rating deltas (flowing into `xiStrength`/the sim) or a roster change (a
 *  player swapped in/out). Rating boons ignore the context. */
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

/** The nation code most represented in the XI (for the chemistry boon). */
function topNationCode(xi: Player[]): string | null {
  const counts = new Map<string, number>();
  for (const p of xi) {
    const code = SQUAD_BY_ID[p.squadId]?.code;
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [code, c] of counts) if (c > top) ((top = c), (best = code));
  return best;
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
    rarity: 'legendary',
    description: '+6 to your best player.',
    apply: (xi) => bumpHighest(xi, 1, 6),
  },
  {
    id: 'star-signing',
    name: 'Star Signing',
    rarity: 'rare',
    starter: true,
    description: '+5 to your weakest player.',
    apply: (xi) => bumpLowest(xi, 1, 5),
  },
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    rarity: 'rare',
    description: '+4 to attackers, -3 to defenders. High risk.',
    apply: (xi) => xi.map((p) => (isAttacker(p) ? bump(p, 4) : isDefender(p) ? bump(p, -3) : p)),
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    rarity: 'common',
    starter: true,
    description: '+2 to your three lowest-rated players.',
    apply: (xi) => bumpLowest(xi, 3, 2),
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
    id: 'chemistry-catalyst',
    name: 'Chemistry Catalyst',
    rarity: 'common',
    description: '+2 to players from your most-represented nation.',
    apply: (xi) => {
      const code = topNationCode(xi);
      return code ? xi.map((p) => (SQUAD_BY_ID[p.squadId]?.code === code ? bump(p, 2) : p)) : xi;
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
