import type { Player } from '../data/types';
import { isAttacker, isDefender, categoryOf, primaryPosition } from '../data/types';
import { FEATURES } from '../config';
import type { BoonContext, RatingPlan } from './boons';
import { KO_ROUNDS } from './knockout';
import { shuffled } from './random';

/**
 * Run nodes: what sits between two rounds of a Cup Run.
 *
 * Every gap used to be the same gap - pick 1 of 3 boosts - which is what made a run a
 * sequence of results rather than a sequence of decisions. A node rotates that: a boost
 * pick, a **shop** (spend Form on something you choose), or an **event** (a themed
 * either/or, which is also where curses live).
 *
 * Each kind asks a different question, and that is the whole point of having more than
 * one:
 *
 * | node  | costs | chosen or dealt | the question                |
 * | boost | free  | dealt, 1 of 3   | which of these three?       |
 * | shop  | Form  | CHOSEN          | what do I actually need?    |
 * | event | free  | forced either/or| what am I willing to lose?  |
 *
 * The shop is the only node where the player chooses rather than picks, and that - not
 * the currency - is why it earns a place.
 *
 * **There are exactly four nodes in a winning run**, because `KO_ROUNDS` has four entries
 * and a node sits after a round that was survived, never before one, with nothing after
 * the Final. A run that goes out in the group sees none at all.
 */

/** What kind of stop this is. */
export type NodeKind = 'boon' | 'shop' | 'event';

/**
 * Which node follows the round just played. `round` is the `koRound` just completed, or
 * `GROUP_ROUND` for the after-group stop.
 *
 * **Fixed, not random**, and that matters more here than it would on a longer ladder: with
 * only four stops, a random rotation leaves some runs with no shop at all, and then the
 * Form earned across that whole run is unspendable. Fixed is also legible and testable, and
 * it removes a class of "the reload re-rolled my node" bugs outright. If run-to-run variety
 * is wanted later, shuffle the middle two and GUARANTEE at least one shop.
 *
 * With `FEATURES.runNodes` off every stop is a boost pick, which is exactly the run as it
 * was before this existed - the flag is the rollback.
 */
export function nodeKindFor(round: number): NodeKind {
  if (!FEATURES.runNodes) return 'boon';
  // -1 = after the group, 0 = after the Round of 16, 1 = after the Quarter-final,
  // 2 = after the Semi-final. (There is no stop after the Final.)
  if (round === 0) return 'shop';
  if (round === KO_ROUNDS.length - 2) return 'event';
  return 'boon';
}

// ---------------------------------------------------------------------------
// Effects a node can hand out
// ---------------------------------------------------------------------------

/**
 * What a shop item or an event option does. A superset of a boon's two shapes, because a
 * node can also hand out things that are not ratings at all.
 *
 * `lasts` on a rating effect is a number of rounds INCLUDING the one it is granted on, so
 * `lasts: 1` is "this round only". Absent means the rest of the run, which is what every
 * boost does.
 */
export type NodeEffect =
  | { kind: 'rating'; plan: (xi: Player[], ctx: BoonContext) => RatingPlan[]; lasts?: number }
  | { kind: 'roster'; apply: (roster: Player[], ctx: BoonContext) => Player[] }
  /** Boost-offer re-rolls, the same counter the Physio Table perk fills. */
  | { kind: 'reroll'; n: number }
  /** Widen every later boost offer by `n` cards. */
  | { kind: 'offerSize'; n: number }
  /** Hand back Form (an event that sells something). */
  | { kind: 'form'; n: number }
  /** Decline. Every event needs one, or it is a boost pick in a costume. */
  | { kind: 'none' };

// There was a `reveal` kind here, selling "see the full bracket", and it was deleted on
// 2026-08-22 for a reason worth not re-learning: **the full bracket is already free.** The
// accordion's chevron opens it and `Settings.showFullDraw` remembers that, so the item
// charged Form for a thing one click already did. It was also broken in a way that follows
// directly from that - forcing the accordion open left its own Hide button inert, because
// the purchase and the preference were fighting over one piece of state. Anything that
// sells INFORMATION here has the same problem: this game shows the player everything.

// Plan builders, mirroring boons.ts. Kept here rather than exported from there because a
// node's catalogue is its own thing and the two lists should be free to diverge.
const catOf = (p: Player) => categoryOf(primaryPosition(p));
const planLowest = (xi: Player[], n: number, d: number): RatingPlan[] => [
  { ids: [...xi].sort((a, b) => a.elo - b.elo).slice(0, n).map((p) => p.id), delta: d },
];
const planHighest = (xi: Player[], n: number, d: number): RatingPlan[] => [
  { ids: [...xi].sort((a, b) => b.elo - a.elo).slice(0, n).map((p) => p.id), delta: d },
];
const planWhere = (xi: Player[], pick: (p: Player) => boolean, d: number): RatingPlan[] => [
  { ids: xi.filter(pick).map((p) => p.id), delta: d },
];
const planAll = (xi: Player[], d: number): RatingPlan[] => [{ ids: xi.map((p) => p.id), delta: d }];

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  /** Form. Priced against the MEASURED wallet at the shop stop, which `npm run checks`
   *  prints: median 12, and 7 to 20 across runs. (An earlier guess of "7 to 9" was wrong -
   *  the group pays three matchdays with margins, so most of the wallet is earned before
   *  the shop opens rather than after.) Re-read that figure before adding an item. */
  cost: number;
  effect: NodeEffect;
}

/**
 * The stock. Deliberately dull and reliable - the contrast with the random boost offer is
 * what the shop is for, so nothing here is a gamble.
 *
 * Priced so a MEDIAN wallet (12) buys two small things or one big one and always leaves
 * something behind, which is what makes it a choice rather than a checklist. A run that
 * won its group 3-0, 3-0, 3-0 arrives with 20 and can clear a whole stop - that is not a
 * hole, it is the reward for the margins that earned it, and it is rare by construction.
 */
export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'reroll-token',
    name: 'Re-roll Token',
    description: 'One more boost-offer re-roll this run.',
    // Costs nothing to build: `rerollsLeft` already exists and is already persisted, for
    // the Physio Table perk. The cheapest possible first item.
    cost: 4,
    effect: { kind: 'reroll', n: 1 },
  },
  {
    id: 'treatment',
    name: 'Treatment Table',
    description: '+4 to your lowest-rated player.',
    cost: 5,
    effect: { kind: 'rating', plan: (xi) => planLowest(xi, 1, 4) },
  },
  {
    id: 'extra-choice',
    name: 'Wider Shortlist',
    description: 'Every later boost offer shows one more card.',
    cost: 6,
    effect: { kind: 'offerSize', n: 1 },
  },
  {
    id: 'full-treatment',
    name: 'Sports Science',
    description: '+3 to your three lowest-rated players.',
    cost: 8,
    effect: { kind: 'rating', plan: (xi) => planLowest(xi, 3, 3) },
  },
  {
    id: 'targeted-signing',
    name: 'Marquee Window',
    description: '+7 to your best player and +3 to your keeper.',
    // The premium item: it costs a whole median wallet, so taking it means taking
    // nothing else. That is the trade this node exists to pose.
    cost: 12,
    effect: {
      kind: 'rating',
      plan: (xi) => [...planHighest(xi, 1, 7), ...planWhere(xi, (p) => catOf(p) === 'GK', 3)],
    },
  },
];

export const shopItemById = (id: string): ShopItem | undefined =>
  SHOP_ITEMS.find((i) => i.id === id);

/** What a shop stop is holding, and what has already been bought from it. */
export interface ShopStock {
  itemIds: string[];
  purchased: string[];
}

/** Draw a shop's stock. Called from the run's two decision helpers, never at render time:
 *  the stock has to be decided once and stored, or a reload re-rolls the shop. */
export function makeShop(size = 4): ShopStock {
  return { itemIds: shuffled(SHOP_ITEMS).slice(0, size).map((i) => i.id), purchased: [] };
}

// ---------------------------------------------------------------------------
// Events (and curses, which are event options rather than a node of their own)
// ---------------------------------------------------------------------------

export interface EventOption {
  id: string;
  label: string;
  /** Shown under the label: what this option actually does, in the player's words. Keep it
   *  in step with `effects` - a promise the effects do not keep is the worst bug this file
   *  can have, and `npm run checks` cannot read English. */
  detail: string;
  /** An option can do several things at once ("-4 Form, +5 to your best player"), which is
   *  what makes a trade-off expressible at all. Applied in order. */
  effects: NodeEffect[];
  /** A curse: over-band power with a real cost attached. Drawn hotter in the UI. */
  curse?: boolean;
}

export interface EventCard {
  id: string;
  title: string;
  body: string;
  options: EventOption[];
}

/**
 * The event catalogue. Every card carries a way out, because an event with no decline is a
 * boost pick wearing a costume.
 *
 * Note a structural constraint on the curses: in the knockouts a loss already ends the run,
 * so "risk" can never mean "you might go out". It has to mean losing a resource - a player,
 * Form, or strength for a round.
 */
export const EVENTS: EventCard[] = [
  {
    id: 'media-storm',
    title: 'Media Storm',
    body: 'The press have turned on the squad. The federation will pay for a PR blitz, if you let them run it.',
    options: [
      {
        id: 'take-the-money',
        label: 'Let them run it',
        detail: '-2 to your XI, +8 Form.',
        effects: [
          { kind: 'rating', plan: (xi) => planAll(xi, -2) },
          { kind: 'form', n: 8 },
        ],
      },
      { id: 'ignore', label: 'Ignore the noise', detail: 'Nothing changes.', effects: [{ kind: 'none' }] },
    ],
  },
  {
    id: 'the-prodigy',
    title: 'The Prodigy',
    body: 'A teenager has torn up the domestic league, and every agent in the country wants the story.',
    options: [
      {
        id: 'call-him-up',
        label: 'Call him up',
        detail: '+8 to your weakest player.',
        effects: [{ kind: 'rating', plan: (xi) => planLowest(xi, 1, 8) }],
      },
      {
        id: 'sell-the-story',
        label: 'Sell the story instead',
        detail: '+6 Form.',
        effects: [{ kind: 'form', n: 6 }],
      },
    ],
  },
  {
    id: 'all-out',
    title: 'All Out',
    body: 'Your assistant wants to throw everyone forward and take the consequences.',
    options: [
      {
        id: 'go-for-it',
        label: 'Throw them forward',
        detail: '+10 to your attack, -6 to your defence.',
        curse: true,
        effects: [
          {
            kind: 'rating',
            plan: (xi) => [...planWhere(xi, isAttacker, 10), ...planWhere(xi, isDefender, -6)],
          },
        ],
      },
      { id: 'hold-shape', label: 'Hold the shape', detail: 'Nothing changes.', effects: [{ kind: 'none' }] },
    ],
  },
  {
    id: 'tired-legs',
    title: 'Tired Legs',
    body: 'The squad is running on fumes. The federation will cover a training camp, but only if you rest them now.',
    options: [
      {
        id: 'rest',
        label: 'Rest the squad',
        detail: '-4 to your XI for the next round only, +7 Form.',
        curse: true,
        // The first customer for expiry: `lasts: 1` is "this round and no further".
        effects: [
          { kind: 'rating', plan: (xi) => planAll(xi, -4), lasts: 1 },
          { kind: 'form', n: 7 },
        ],
      },
      { id: 'play-on', label: 'Play on', detail: 'Nothing changes.', effects: [{ kind: 'none' }] },
    ],
  },
  {
    id: 'contract-dispute',
    title: 'Contract Dispute',
    body: 'Your captain wants a new deal before he kicks another ball in this tournament.',
    options: [
      {
        id: 'pay-him',
        label: 'Pay him',
        detail: '-4 Form, +5 to your best player.',
        effects: [
          { kind: 'form', n: -4 },
          { kind: 'rating', plan: (xi) => planHighest(xi, 1, 5) },
        ],
      },
      {
        id: 'let-him-stew',
        label: 'Let him stew',
        detail: '-3 to your best player, +5 Form.',
        effects: [
          { kind: 'rating', plan: (xi) => planHighest(xi, 1, -3) },
          { kind: 'form', n: 5 },
        ],
      },
    ],
  },
];

export const eventById = (id: string): EventCard | undefined => EVENTS.find((e) => e.id === id);

/** Draw an event. Decided once and stored, like the shop's stock. */
export const makeEvent = (): string => shuffled(EVENTS)[0].id;
