import type { Player } from '../data/types';
import { categoryOf, isAttacker, isDefender, primaryPosition } from '../data/types';
import { ALL_PLAYERS, SQUAD_BY_ID } from '../data/squads';
import { bump } from './effects';

/** Rarity ramp, mirrored on the sticker tiers for a consistent look. */
export type Rarity = 'common' | 'rare' | 'legendary';

/** Run context a boon may read. Everything here is resolved by `domain/run.ts` and handed
 *  in, so the catalogue can key off the run without importing it. */
export interface BoonContext {
  opponentSquadId: string | null;
  /** Who has scored most for the XI so far THIS RUN (In Form). Null before any goal. */
  topScorerId?: string | null;
  /** The career's all-time top scorer, snapshotted at kickoff (Old Guard). */
  careerTopScorerId?: string | null;
  /** The player the user named, for a card that asks (The Armband). */
  chosenId?: string | null;
  /** How many rounds SO FAR the user went in as the lower-rated side (Underdog's Purse).
   *  Counted off the run's own history, so it is a fact the draw decided and nobody
   *  controls. 0 at the first stop, where no knockout tie has been played. */
  underdogRounds?: number;
  /** Goals conceded so far this run, group matches included (Siege Mentality). Shootout
   *  kicks are not goals and never reach it, on the rule the whole codebase keeps. */
  goalsConceded?: number;
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
// (Catenaccio, Sold Out Stadium), or a condition nobody controls (the draw). Conditions
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
  /** How many rounds it lasts, counting the one it is granted on. Absent = the rest of
   *  the run, which is what most boosts do. */
  lasts?: number;
  /** How many rounds until it starts, counting from the one it is granted on. Absent or
   *  0 = immediately. A boost that borrows now and pays later sets this on its debt. */
  startsIn?: number;
}

/**
 * A change to the RUN rather than to a rating - the levers the sim reads that are not the
 * attack and defence averages.
 *
 * Declared here as plain data and interpreted by `domain/run.ts`, deliberately: the boon
 * catalogue should say what a card MEANS without importing the run's state machine, which
 * would be a cycle. Adding a lever is a case here plus a case there.
 */
export type RunModifier =
  /** Add `n` to the top `top` penalty takers, FOR SHOOTOUTS ONLY. Does not touch the
   *  attack or defence averages, so it does not move a match's scoreline at all. */
  | { what: 'penBonus'; n: number; top: number }
  /** The run pays no XP or Prestige at all unless it wins the cup. */
  | { what: 'mortgage' }
  /** Draw an alternative next opponent and keep the weaker of the two. */
  | { what: 'redrawOpponent' }
  /** Weaken the next opponent's attack and/or defence. Negative numbers weaken. */
  | { what: 'weakenOpponent'; attack: number; defense: number }
  /** How many stickers a cup win may pick, instead of the usual one. */
  | { what: 'cupPicks'; n: number }
  /** Multiply the run's XP payout, leaving its Prestige alone. */
  | { what: 'xpMult'; n: number }
  /** The run pays no Prestige, and the NEXT run starts with an extra boost applied. */
  | { what: 'youth' }
  /** Triple the payout on a cup win; pay nothing at all if the FINAL is the round lost. */
  | { what: 'allOrNothing' }
  /** The roster swap this card just made is a LOAN: the player who left comes back when
   *  the round advances. Carries no names of its own - it reads the swap the card's own
   *  roster effect performed, which is why Loan Deal declares both. */
  | { what: 'loan' };

/** The two things a boon can actually do, split so the rating half can be recorded rather
 *  than baked in (see `domain/effects.ts`).
 *
 *  - `rating` returns a PLAN. The run records it in its effect ledger and derives the XI.
 *  - `roster` changes WHO is in the XI, so it rewrites the base roster and is permanent by
 *    nature. Rating effects already granted keep their frozen ids, so an incoming player is
 *    not retroactively bumped - which is exactly what the old baked-in version did. */
export type BoonEffect =
  | { kind: 'rating'; plan: (xi: Player[], ctx: BoonContext) => RatingPlan[] }
  | { kind: 'roster'; apply: (roster: Player[], ctx: BoonContext) => Player[] }
  | { kind: 'run'; mod: RunModifier };

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
  /** The card asks the player to name someone before it applies. Picking it does not
   *  commit the stop: the run parks a `pendingChoice` and waits. The first card to do
   *  this is The Armband; everything before it committed on the click. */
  choice?: 'player';
  /** What the card does. A LIST, because a card can do two things at once - Mortgage the
   *  Future raises the XI and mortgages the payout, and Sold Out Stadium grants a bonus
   *  and a debt. Applied in order. */
  effects: BoonEffect[];
}

/** Prestige price to unlock a locked (non-starter) boon into the offer pool, by rarity. */
export const BOON_UNLOCK_COST: Record<Rarity, number> = { common: 15, rare: 30, legendary: 55 };

/**
 * The Coin Toss's result, DERIVED from the run rather than rolled.
 *
 * Every other random thing in a run is decided once and stored, because a reload must
 * never re-roll anything - otherwise reloading until you like the outcome is the optimal
 * way to play. A boon has nowhere of its own to store a pre-roll, so this takes the other
 * route to the same guarantee: it is a pure function of facts that are already fixed when
 * the card is picked (the XI's ratings and the opponent), so every replay gives the same
 * answer and the player cannot influence it.
 *
 * Not cryptographic and does not need to be. It only has to be unpredictable to a person
 * looking at their own team sheet, and stable across a reload.
 */
function coinFor(xi: Player[], ctx: BoonContext): boolean {
  let h = 2166136261;
  for (const ch of xi.map((p) => `${p.id}:${p.elo}`).join('|') + (ctx.opponentSquadId ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) & 1) === 1;
}

/** Every player by id, and the best-rated version of each PERSON across all tournaments.
 *  Built once: `ALL_PLAYERS` is ~6,270 rows and Prime Years would otherwise scan it eleven
 *  times per pick. */
const PLAYER_BY_ID = new Map(ALL_PLAYERS.map((p) => [p.id, p]));
const BEST_BY_PERSON = new Map<string, Player>();
for (const p of ALL_PLAYERS) {
  const best = BEST_BY_PERSON.get(p.personId);
  if (!best || p.elo > best.elo) BEST_BY_PERSON.set(p.personId, p);
}

/** The smallest upgrade Transfer will accept, in rating points. */
const TRANSFER_MIN_GAIN = 8;

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
    effects: [{ kind: 'rating', plan: (xi) => planAll(xi, 2) }],
  },
  {
    id: 'marquee-signing',
    name: 'Marquee Signing',
    // Was legendary. One player can only move an average so far: +12 to a single
    // player is about +2 on his side, which a common already beats.
    rarity: 'rare',
    // Retargeted 2026-08-22 from the BEST player to the WORST. On the best it was
    // usually wasted - a top XI's star is near the 99 ceiling, so most of the +12
    // evaporated - and it duplicated Galacticos. On the worst it is the same card as
    // Star Signing scaled up, and it always lands in full.
    description: '+12 to your weakest player.',
    effects: [{ kind: 'rating', plan: (xi) => planLowest(xi, 1, 12) }],
  },
  {
    id: 'star-signing',
    name: 'Star Signing',
    // Was rare, for about a common's worth of movement.
    rarity: 'common',
    starter: true,
    description: '+6 to your weakest player.',
    effects: [{ kind: 'rating', plan: (xi) => planLowest(xi, 1, 6) }],
  },
  {
    id: 'veteran-core',
    name: 'Veteran Core',
    rarity: 'common',
    starter: true,
    description: '+3 to your three lowest-rated players.',
    effects: [{ kind: 'rating', plan: (xi) => planLowest(xi, 3, 3) }],
  },
  {
    id: 'attacking-masterclass',
    name: 'Attacking Masterclass',
    rarity: 'common',
    starter: true,
    description: '+2 to your midfielders and forwards.',
    effects: [{ kind: 'rating', plan: (xi) => planWhere(xi, isAttacker, 2) }],
  },
  {
    id: 'defensive-drills',
    name: 'Defensive Drills',
    rarity: 'common',
    starter: true,
    description: '+2 to your goalkeeper and defenders.',
    effects: [{ kind: 'rating', plan: (xi) => planWhere(xi, isDefender, 2) }],
  },
  {
    id: 'transfer',
    name: 'Transfer',
    rarity: 'rare',
    starter: true,
    description: 'Swap your weakest player for one at least 8 rating better, same position.',
    effects: [
      {
        kind: 'roster',
        apply: (roster) => {
          const out = weakest(roster);
          const cat = catOf(out);
          const used = new Set(roster.map((p) => p.personId));
          // At least +8, not merely "better": a 1-point upgrade satisfied the old rule
          // and made the card read as broken. If nobody clears the bar it does nothing,
          // which is only reachable with a weakest player already near the ceiling.
          const cands = ALL_PLAYERS.filter(
            (p) => catOf(p) === cat && p.elo >= out.elo + TRANSFER_MIN_GAIN && !used.has(p.personId),
          );
          if (!cands.length) return roster;
          return swap(roster, out.id, cands[Math.floor(Math.random() * cands.length)]);
        },
      },
    ],
  },
  {
    id: 'poach',
    name: 'Poach',
    rarity: 'rare',
    description: "Steal your next opponent's best player.",
    effects: [
      {
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
    ],
  },
  {
    id: 'wildcard',
    name: 'Wildcard Legend',
    rarity: 'legendary',
    description: 'Add a random 90+ legend to your XI.',
    effects: [
      {
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
    ],
  },
  // --- added 2026-08-15: the pool was 11 with 5 starters, so early runs saw the same
  // handful every time. Three of these hang on the draw rather than on your build.
  {
    id: 'keeper-coach',
    name: 'Keeper Coach',
    rarity: 'common',
    starter: true,
    description: '+6 to your goalkeeper.',
    effects: [{ kind: 'rating', plan: (xi) => planWhere(xi, (p) => catOf(p) === 'GK', 6) }],
  },
  {
    id: 'catenaccio',
    name: 'Catenaccio',
    rarity: 'rare',
    description: '+4 to your defence, -2 to your attack.',
    effects: [
      {
        kind: 'rating',
        plan: (xi) => [...planWhere(xi, isDefender, 4), ...planWhere(xi, isAttacker, -2)],
      },
    ],
  },
  {
    // Conditional on the draw, so it cannot be set up in advance: strong when it fires,
    // nothing when it does not.
    id: 'underdog-spirit',
    name: 'Underdog Spirit',
    rarity: 'rare',
    description: '+3 to your entire XI, but only against a stronger opponent.',
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) => {
          const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
          if (!opp) return [];
          const oppBest = [...opp.players].sort((a, b) => b.elo - a.elo).slice(0, 11);
          const mean = (ps: Player[]) => ps.reduce((s, p) => s + p.elo, 0) / (ps.length || 1);
          return mean(oppBest) > mean(xi) ? planAll(xi, 3) : [];
        },
      },
    ],
  },
  {
    id: 'galacticos',
    name: 'Galacticos',
    rarity: 'legendary',
    description: '+6 to your three best players.',
    effects: [{ kind: 'rating', plan: (xi) => planHighest(xi, 3, 6) }],
  },
  {
    id: 'legends-reunion',
    name: "Legends' Reunion",
    rarity: 'legendary',
    // One swap, but from a rarer shelf than Wildcard's 90+, so the two are distinct
    // without stacking to twice a Golden Generation (which two 90+ swaps measured at).
    description: 'Your weakest player is replaced by a 93+ icon.',
    effects: [
      {
        kind: 'roster',
        apply: (roster) => replaceWeakest(roster, 1, ALL_PLAYERS.filter((p) => p.elo >= 93)),
      },
    ],
  },
  // --- added 2026-08-22 (roadmap item 29). Every card above moves a rating average and
  // nothing else, which is what made an offer of three a sum rather than a choice. These
  // six reach for the levers the sim has and the catalogue never used: the shootout, the
  // draw, the run's payout, and time itself.
  {
    id: 'prime-years',
    name: 'Prime Years',
    rarity: 'legendary',
    description: 'Every player is replaced by his own best tournament.',
    // Walks `personId`, which links the same human across tournaments and which nothing
    // else has ever read. The XI keeps its identity and gets better, which feels quite
    // different from being handed strangers - and the slot each player fills is preserved,
    // so the formation and the chemistry "in position" count are untouched.
    effects: [
      {
        kind: 'roster',
        apply: (roster) =>
          roster.map((p) => {
            const best = BEST_BY_PERSON.get(p.personId);
            return best && best.elo > p.elo ? { ...best, positions: p.positions } : p;
          }),
      },
    ],
  },
  {
    id: 'in-form',
    name: 'In Form',
    rarity: 'rare',
    description: '+12 to your leading scorer this run.',
    // Names a player the RUN chose rather than the draft: whoever has actually been
    // scoring. Worth nothing before a goal is scored, which is only the first stop.
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) =>
          ctx.topScorerId && xi.some((p) => p.id === ctx.topScorerId)
            ? [{ ids: [ctx.topScorerId], delta: 12 }]
            : [],
      },
    ],
  },
  {
    id: 'old-guard',
    name: 'Old Guard',
    // Legendary, like Wildcard Legend: adding one strong player to the XI is the same
    // shape and the same size. It measured 4.8 as a rare.
    rarity: 'legendary',
    description: "Your career's all-time top scorer joins the XI.",
    // The first card that reaches back into the CAREER. Different for every player, and
    // better the longer they have played - progression that is earned rather than bought.
    // Does nothing on a first run, which is the honest cost of that.
    effects: [
      {
        kind: 'roster',
        apply: (roster, ctx) => {
          const id = ctx.careerTopScorerId;
          if (!id) return roster;
          const inP = PLAYER_BY_ID.get(id);
          if (!inP || roster.some((p) => p.personId === inP.personId)) return roster;
          const out = weakestOfCat(roster, catOf(inP)) ?? weakest(roster);
          return swap(roster, out.id, { ...inP, positions: out.positions });
        },
      },
    ],
  },
  {
    id: 'armband',
    name: 'The Armband',
    rarity: 'rare',
    // The first card that asks a question. Everything else in the pool decides for you.
    choice: 'player',
    description: 'Name your captain: +6 to him, +1 to everyone else.',
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) => {
          const captain = ctx.chosenId && xi.find((p) => p.id === ctx.chosenId);
          if (!captain) return [];
          return [
            // +6, not +8: at +8 it measured 3.3 against a rare's band of 3.2. The card's
            // point is the question it asks, not the size of the number.
            { ids: [captain.id], delta: 6 },
            { ids: xi.filter((p) => p.id !== captain.id).map((p) => p.id), delta: 1 },
          ];
        },
      },
    ],
  },
  {
    id: 'away-days',
    name: 'Away Days',
    rarity: 'common',
    starter: true,
    description: "-5 to your next opponent's defence.",
    // Weakening THEM is not the same card as strengthening you: it helps in exactly one
    // tie, and it moves one of their two numbers rather than both of yours. Good when you
    // need goals, useless when you need a clean sheet - the mirror of every card you own.
    effects: [{ kind: 'run', mod: { what: 'weakenOpponent', attack: 0, defense: -5 } }],
  },
  {
    id: 'man-marking',
    name: 'Man-Marking',
    rarity: 'common',
    starter: true,
    description: "-5 to your next opponent's attack.",
    // Away Days' mirror, and the pair is the point: which of the two you want depends on
    // whether this tie is one you expect to win by scoring or by holding out.
    effects: [{ kind: 'run', mod: { what: 'weakenOpponent', attack: -5, defense: 0 } }],
  },
  {
    id: 'double-print',
    name: 'Double Print',
    rarity: 'rare',
    description: 'Win the cup and pick two stickers instead of one.',
    // Reaches the sticker album, which no other card touches, and pays nothing at all
    // unless the run is won - so it is a card you take when you already believe.
    effects: [{ kind: 'run', mod: { what: 'cupPicks', n: 2 } }],
  },
  {
    id: 'kind-draw',
    name: 'Kind Draw',
    rarity: 'rare',
    description: 'Re-draw your next opponent and keep the weaker of the two.',
    // Acts on the DRAW. Two cards read the next opponent (Poach did, Familiar Foes did
    // before it was cut); none changed it. Worth nothing when the draw was already kind,
    // which is what keeps it honest - and it is exempt from the bands for the same reason
    // the other draw-conditional cards are.
    effects: [{ kind: 'run', mod: { what: 'redrawOpponent' } }],
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    // Rare, not common. Measured at 9.9 against a common's band of 2.0: for the one round
    // it lasts it is worth more than twice a legendary, and taken before the Final that
    // round is the one that matters. The duration is the price, not a discount.
    rarity: 'rare',
    description: '+4 to your entire XI, for this round only.',
    // The first card in the game that wears off. A big number you have to spend at the
    // right moment rather than bank, which is a different decision from every permanent
    // card above.
    effects: [{ kind: 'rating', plan: (xi) => planAll(xi, 4).map((p) => ({ ...p, lasts: 1 })) }],
  },
  {
    id: 'sold-out-stadium',
    name: 'Sold Out Stadium',
    rarity: 'rare',
    description: '+6 to your XI this round, then -6 in the round after it.',
    // Borrow from your future self. Take it in the semi-final and you play the Final
    // weakened - which is exactly the point, and why it is exempt: it gives the points
    // back, in full, one round later.
    effects: [
      {
        kind: 'rating',
        plan: (xi) => [
          ...planAll(xi, 6).map((p) => ({ ...p, lasts: 1 })),
          ...planAll(xi, -6).map((p) => ({ ...p, startsIn: 1, lasts: 1 })),
        ],
      },
    ],
  },
  {
    id: 'coin-toss',
    name: 'The Coin Toss',
    rarity: 'rare',
    description: 'Heads +8 to your XI, tails -4. The coin is already in the air.',
    // Genuine variance in a game that otherwise has none. The result is DERIVED from the
    // run rather than rolled (see `coinFor`), so a reload cannot change it - the whole
    // card would be broken if reloading until it lands right were the optimal play.
    // Exempt: it gives points back half the time.
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) => planAll(xi, coinFor(xi, ctx) ? 8 : -4),
      },
    ],
  },
  {
    id: 'loan-deal',
    name: 'Loan Deal',
    // COMMON, and a starter, precisely because Poach exists. Measured at 4.0 against
    // Poach's 3.9 the two are the same swing, so at the same rarity this would have been
    // Poach with an expiry date - strictly worse, and a card nobody would ever take. As a
    // common starter it is instead the cheap version you have from run one, and Poach is
    // the rare you unlock to keep him.
    rarity: 'common',
    starter: true,
    description: "Borrow your next opponent's best player for this round. He then goes back.",
    // Poach without keeping him. The first TEMPORARY roster change in the game: the
    // effect ledger has always handled temporary ratings, and never temporary people, so
    // the run records the loan (`RunState.loan`) and hands the departing player back when
    // the round advances.
    //
    // Two effects, in this order and deliberately so. The roster half picks and swaps
    // exactly as Poach does, so every existing rule comes free (no duplicated person, the
    // outgoing slot preserved, the arrival tagged in `boostedIds` so a borrowed player
    // banks no sticker). The run half only records that the swap was a loan, reading the
    // pair the first half produced.
    effects: [
      {
        kind: 'roster',
        apply: (roster, ctx) => {
          const opp = ctx.opponentSquadId ? SQUAD_BY_ID[ctx.opponentSquadId] : undefined;
          if (!opp) return roster;
          const used = new Set(roster.map((p) => p.personId));
          const cands = opp.players.filter((p) => !used.has(p.personId));
          if (!cands.length) return roster;
          const inP = cands.reduce((hi, p) => (p.elo > hi.elo ? p : hi), cands[0]);
          const out = weakestOfCat(roster, catOf(inP)) ?? weakest(roster);
          // Only if he is actually an upgrade. Their best is not always better than the
          // player he would displace, and a "boost" that weakens the XI and then has to
          // be undone a round later is the worst of both halves.
          if (inP.elo <= out.elo) return roster;
          return swap(roster, out.id, { ...inP, positions: out.positions });
        },
      },
      { kind: 'run', mod: { what: 'loan' } },
    ],
  },
  {
    id: 'siege-mentality',
    name: 'Siege Mentality',
    rarity: 'legendary',
    description: '+1 to your XI for every goal you have conceded this run.',
    // Reads the DAMAGE. Every card in the pool is taken at a stop, and you only reach a
    // stop by going through, so the whole catalogue is priced for a run that is going
    // well - this is the first one that pays a run that has been leaking. Self-correcting
    // by construction: conceding a lot means the defence is poor, and this is what hands
    // it back. Exempt from the bands, like Underdog's Purse: what it is worth is decided
    // by matches already played rather than by anything on offer.
    //
    // A note for whoever tunes it: an XI could in principle be built with a deliberately
    // terrible defence to farm this. It is not a real exploit - the XI has to survive the
    // group first, the card has to actually be offered, and the points come back to the
    // whole XI rather than to the line that gave them away - but at +2 a goal it would
    // have been one, which is why it is +1.
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) => (ctx.goalsConceded ? planAll(xi, ctx.goalsConceded) : []),
      },
    ],
  },
  {
    id: 'underdogs-purse',
    name: "Underdog's Purse",
    rarity: 'legendary',
    description: '+2 to your XI for every round you went in as the lower-rated side.',
    // Pays a run that has been SURVIVING rather than dominating, and it is the first card
    // that reads the run's own history rather than its XI or its next opponent. Worth
    // nothing at the first stop (no knockout tie has been played) and worth nothing at all
    // to a run that was favourite every time, which is what makes it a gamble rather than
    // a number. Exempt from the bands for the same reason Underdog Spirit is: the draw
    // decides it, and the draw is the one thing nobody controls.
    effects: [
      {
        kind: 'rating',
        plan: (xi, ctx) => (ctx.underdogRounds ? planAll(xi, 2 * ctx.underdogRounds) : []),
      },
    ],
  },
  {
    id: 'sponsorship',
    name: 'Sponsorship',
    rarity: 'common',
    starter: true,
    description: 'Double the XP this run pays. Prestige is unchanged.',
    // The only card that touches the LEVEL rather than the wallet, which matters because
    // levels are the one thing Prestige cannot buy: the dearest perk tiers are gated on
    // them and challenge awards grant no XP, so playing is the only way through. In
    // exchange it does nothing whatsoever for the round in front of you, which is what
    // makes taking it a real decision rather than a free pick.
    effects: [{ kind: 'run', mod: { what: 'xpMult', n: 2 } }],
  },
  {
    id: 'youth-development',
    name: 'Youth Development',
    rarity: 'rare',
    description: 'This run pays no Prestige. Your next run starts with an extra boost.',
    // Spends this run's wallet on the next run's kickoff. The extra boost is dealt the
    // way Scout Network's are, from COMMONS only, for the reason that perk already
    // records: a free legendary before kick-off outweighs every choice the run itself
    // offers. Carried on the career (`CareerStats.bonusStartBoosts`) and spent by the
    // next `beginRun`, so it survives the run that bought it.
    effects: [{ kind: 'run', mod: { what: 'youth' } }],
  },
  {
    id: 'all-or-nothing',
    name: 'All or Nothing',
    rarity: 'rare',
    description: 'Triple the payout if you win the cup. Lose the FINAL and it pays nothing.',
    // Mortgage the Future with the failure condition narrowed to one round and the reward
    // raised to match: every exit but the final pays exactly what it would have, so the
    // card is a bet on the last game rather than on the whole run. Taken at the last stop
    // it is the sharpest decision in the pool - by then the final is the only round left.
    effects: [{ kind: 'run', mod: { what: 'allOrNothing' } }],
  },
  {
    id: 'mortgage-future',
    name: 'Mortgage the Future',
    rarity: 'legendary',
    description: '+4 to your XI. The run pays nothing at all unless you win the cup.',
    // The only card whose cost lands on the CAREER rather than inside the run, so what it
    // is worth depends on how the run is already going: cheap when you were winning the
    // cup anyway, ruinous when you were not. Exempt for that reason - the points are paid
    // for outside the sim, where the balance harness cannot see them.
    effects: [
      { kind: 'rating', plan: (xi) => planAll(xi, 4) },
      { kind: 'run', mod: { what: 'mortgage' } },
    ],
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
  let out = xi;
  for (const eff of boon.effects) {
    if (eff.kind === 'roster') {
      out = eff.apply(out, ctx);
    } else if (eff.kind === 'rating') {
      // Measured at the round it is granted, so a `startsIn` plan (a debt that lands
      // later) contributes nothing here - which is correct: this measures what the card
      // does to the XI that plays the next match.
      for (const plan of eff.plan(out, ctx)) {
        if (plan.startsIn) continue;
        const ids = new Set(plan.ids);
        out = out.map((p) => (ids.has(p.id) ? bump(p, plan.delta) : p));
      }
    }
    // `run` effects touch no rating, so the measurement path ignores them entirely.
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
