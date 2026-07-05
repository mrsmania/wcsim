import type { Player } from '../data/types';
import { categoryOf, primaryPosition, ATTACK_CATS, DEF_CATS } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';

/** Rarity ramp, mirrored on the sticker tiers for a consistent look. */
export type Rarity = 'common' | 'rare' | 'legendary';

/** A boon chosen between rounds of a Cup Run. `apply` is a pure transform of the XI
 *  (rating deltas), which flows into `xiStrength` and therefore the sim/odds. */
export interface Boon {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  apply: (xi: Player[]) => Player[];
}

const MIN = 60;
const MAX = 99;
const bump = (p: Player, d: number): Player => ({
  ...p,
  elo: Math.max(MIN, Math.min(MAX, p.elo + d)),
});
const isAttack = (p: Player) => ATTACK_CATS.includes(categoryOf(primaryPosition(p)));
const isDef = (p: Player) => DEF_CATS.includes(categoryOf(primaryPosition(p)));

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
    description: '+5 to your weakest player.',
    apply: (xi) => bumpLowest(xi, 1, 5),
  },
  {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    rarity: 'rare',
    description: '+4 to attackers, -3 to defenders. High risk.',
    apply: (xi) => xi.map((p) => (isAttack(p) ? bump(p, 4) : isDef(p) ? bump(p, -3) : p)),
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    rarity: 'common',
    description: '+2 to your three lowest-rated players.',
    apply: (xi) => bumpLowest(xi, 3, 2),
  },
  {
    id: 'attacking-masterclass',
    name: 'Attacking Masterclass',
    rarity: 'common',
    description: '+2 to your midfielders and forwards.',
    apply: (xi) => xi.map((p) => (isAttack(p) ? bump(p, 2) : p)),
  },
  {
    id: 'defensive-drills',
    name: 'Defensive Drills',
    rarity: 'common',
    description: '+2 to your goalkeeper and defenders.',
    apply: (xi) => xi.map((p) => (isDef(p) ? bump(p, 2) : p)),
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
];

const BY_ID = new Map(BOONS.map((b) => [b.id, b]));
export const boonById = (id: string): Boon | undefined => BY_ID.get(id);

/** Offer `n` distinct random boons (the 1-of-3 pick between rounds). */
export function offerBoons(n = 3): Boon[] {
  const pool = [...BOONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
