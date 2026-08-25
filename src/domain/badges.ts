import { ASCENSIONS } from './ascension';
import { lockableBoons } from './boons';
import { PERKS, type CareerState } from './career';
import { FAMILIES, CHALLENGES } from './challenges';
import { FORMATIONS_DATA } from './formations';

// ---------------------------------------------------------------------------
// Badges - the trophy cabinet's long tail (roadmap item 06, option C).
//
// A badge asks a question about what a CAREER HOLDS, where a challenge asks what one
// RUN did. That is the whole of the distinction, and it is what keeps the two from
// being the same list twice: nothing here could be phrased as "win the cup with...".
//
// Three rules, each load-bearing:
//
//  1. NOTHING IS RECORDED. A badge is a pure function of the career and the album, so
//     it is recomputed on render and a career that predates this file lights up its
//     badges retroactively. There is no id list to persist, no migration, and no way
//     for the display and a stored set to disagree.
//  2. NOTHING IS PAID. Challenges are the Prestige faucet (docs/challenges-spec.html
//     sized the catalogue against the shop deliberately); a second faucet would need
//     the same arrears reasoning FEATURES.challengeAwards carries, for no gain.
//  3. NO EXACT LIFETIME COUNTS. Every predicate is a threshold or a set-coverage
//     count, never `=== n` on a monotonic counter - the First Blood bug (see the trap
//     note in challenges.ts) is the reason, and being derived rather than stored makes
//     an exact count strictly worse here: it would flicker as the counter passed.
//
// `progress` is the only thing a badge defines. "Earned" is derived from it, so a
// badge can never claim to be earned while showing an incomplete fraction.
// ---------------------------------------------------------------------------

/** Everything a badge may look at. Passed in, never read from storage or the dataset,
 *  so this module stays pure and `data/squads`-free like the rest of `domain/`. */
export interface BadgeCtx {
  career: CareerState;
  /** Album completion over the CURRENT pool: `squadsInPool` narrows what is
   *  collectible, so the target moves with the year filter and the caller owns it. */
  album: { collected: number; total: number };
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  /** How far along this career is. `have` is clamped to `need` by `badgeRows`, so a
   *  predicate may over-count freely (a stale formation name, say). */
  progress: (ctx: BadgeCtx) => { have: number; need: number };
}

/** Total purchasable perk tiers across every track (Fully Kitted's target). */
export const PERK_TIERS_TOTAL = PERKS.reduce((n, p) => n + p.tiers.length, 0);
/** Perk tiers this career owns, clamped per track so an old save claiming a higher
 *  tier than exists cannot read as more than complete. */
export const perkTiersOwned = (c: CareerState): number =>
  PERKS.reduce((n, p) => n + Math.min(c.perkLevels[p.id] ?? 0, p.tiers.length), 0);

export const BADGES: Badge[] = [
  {
    id: 'half-way',
    name: 'Half Way',
    description: 'Half the sticker album collected.',
    progress: ({ album }) => ({ have: album.collected, need: Math.ceil(album.total / 2) }),
  },
  {
    id: 'complete-set',
    name: 'Complete Set',
    description: 'Every sticker in the album.',
    progress: ({ album }) => ({ have: album.collected, need: album.total }),
  },
  {
    id: 'full-house',
    name: 'Full House',
    description: 'At least one honour completed in every family.',
    progress: ({ career }) => {
      const done = new Set(career.completedChallenges);
      const families = new Set(CHALLENGES.filter((c) => done.has(c.id)).map((c) => c.family));
      return { have: families.size, need: FAMILIES.length };
    },
  },
  {
    id: 'perfect-ledger',
    name: 'Perfect Ledger',
    description: 'Every honour in the catalogue completed.',
    progress: ({ career }) => ({
      // Counted against the catalogue rather than the stored list, so ids retired from
      // CHALLENGES cannot inflate it past complete.
      have: CHALLENGES.filter((c) => career.completedChallenges.includes(c.id)).length,
      need: CHALLENGES.length,
    }),
  },
  {
    id: 'every-tier',
    name: 'Every Tier',
    description: 'A cup won at every Ascension tier.',
    progress: ({ career }) => {
      const cups = career.stats.cupsByAscension ?? [];
      return {
        have: ASCENSIONS.filter((a) => (cups[a.tier] ?? 0) > 0).length,
        need: ASCENSIONS.length,
      };
    },
  },
  {
    id: 'all-formations',
    name: 'All Formations',
    description: 'A cup won with each of the formations.',
    progress: ({ career }) => {
      const names = new Set(FORMATIONS_DATA.names);
      const won = new Set((career.stats.cupFormations ?? []).filter((f) => names.has(f)));
      return { have: won.size, need: names.size };
    },
  },
  {
    id: 'full-library',
    name: 'Full Library',
    description: 'Every boost unlocked into the offer pool.',
    progress: ({ career }) => {
      const lockable = lockableBoons();
      const ids = new Set(career.unlockedBoons);
      return { have: lockable.filter((b) => ids.has(b.id)).length, need: lockable.length };
    },
  },
  {
    id: 'fully-kitted',
    name: 'Fully Kitted',
    description: 'Every perk track at its top tier.',
    progress: ({ career }) => ({ have: perkTiersOwned(career), need: PERK_TIERS_TOTAL }),
  },
  {
    id: 'big-spender',
    name: 'Big Spender',
    description: 'Spend 1,000 Prestige across the shop and the boost library.',
    progress: ({ career }) => ({ have: career.stats.prestigeSpent, need: 1000 }),
  },
];

/** One badge resolved against a career: the fraction to show and whether it is done.
 *  `have` is clamped, so `have === need` and `done` can never disagree. */
export interface BadgeRow {
  badge: Badge;
  have: number;
  need: number;
  done: boolean;
}

export function badgeRows(
  career: CareerState,
  album: { collected: number; total: number },
): BadgeRow[] {
  const ctx: BadgeCtx = { career, album };
  return BADGES.map((badge) => {
    const { have, need } = badge.progress(ctx);
    // A need of 0 (an empty pool, so nothing is collectible) reads as complete rather
    // than dividing by zero downstream.
    const done = have >= need;
    return { badge, have: Math.min(have, need), need, done };
  });
}

export const badgesEarned = (rows: BadgeRow[]): number => rows.filter((r) => r.done).length;
