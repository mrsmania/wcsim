# Run nodes and Form - roadmap item 04

**Career depth D: in-run economy (Form) + node variety.** Written 2026-08-22 against
`7cb870c`; **built the same day** (see "Status" below).

Everything a run does between rounds lives here: the effect ledger the boosts now run on,
the Form currency, and the shop / event nodes that replaced two of the four boost picks.

> **ROLLED BACK 2026-08-22, except slice 1.** Built in full, played, and reverted the same
> day - with one exception: **the effect ledger (slice 1) was kept** and is in the tree at
> `domain/effects.ts`. Form (slice 2) and the shop/event nodes (slices 3 to 5) are gone and
> recoverable only from git history (`6d345a0`, `40e6bd0`). Read slice 1 below as a
> description of shipped code; read everything after it as a record of an attempt.
>
> **Why it failed:** a currency needs enough transactions to be worth reasoning about, and a
> World Cup has **seven matches**. Earning Form in the semi-final is close to meaningless -
> one stop is left to spend it at and no time to plan around it. That is a fact about the
> format, not the prices, so no repricing fixes it. Form would work in a 20-plus game league.
>
> **And the diagnosis underneath was wrong.** This plan assumed the problem was too few node
> KINDS. It is not: all 19 boosts sit on one axis ("+N to some subset of the XI"), so an
> offer of three reduces to arithmetic, and a shop selling rating points is that same axis
> with a price on it. **`docs/run-decisions.md` is the corrected diagnosis and the live
> successor**, tracked as roadmap item 29.
>
> Three things below were wrong on their own terms and are worth reading for that alone: the
> shop wallet was measured at a median of **12**, not the "7 to 9" estimated here; the strict
> `cost = budget x rate` pricing rule in 3.3 was never adopted; and a `reveal` item selling
> "see the full bracket" had to be deleted because the bracket is already free behind the
> accordion's chevron - **nothing here can sell information.**

---

## 0. Read these first

| File | Why |
| --- | --- |
| `src/domain/run.ts` | `RunPhase` (l.48), `RunState` (l.111), `chooseBoon` (l.611), `rerollOffer` (l.602), `decideKoRound` (l.714), `prepareKnockoutRound` (the `phase: 'boon'` transition ~l.826) |
| `src/domain/boons.ts` | `Boon` (l.39-47), the `bump*` helpers (l.65-98), `BOONS` (l.100-293), the balance note (l.16-30) |
| `scripts/checks.ts` | the boon-power block (l.506-600): `BAND`, `EXEMPT`, the sampling method |
| `docs/career-depth-spec.md` | section D (l.566-574) is the one-paragraph origin of this item |
| `CLAUDE.md` | "Cup Run + Career", "Persistence", "Conventions" |

**Two standing rules in this repo that this item can violate silently, so read them twice:**

1. **Every roll is on the RUN; only playback is transient. A RELOAD MUST NOT RE-ROLL
   ANYTHING.** The dice are thrown in exactly two private helpers, `decideGroupExit` and
   `decideKoRound`, and their output is stored on `RunState.groupExit` / `RunState.koPending`.
   Anything this item adds that is random and outlives one function call - the node type,
   the shop's stock, an event's options - belongs in one of those, **not** in the live
   reveal and not computed at render time. Getting this wrong means reloading until you
   like the shop is the optimal way to play.
2. **`domain/` is pure and React-free.** All of the model below goes in `domain/`.

**There are no production users** (recorded in `CLAUDE.md` 2026-08-21). Do not write
migration code for a persisted `RunState` shape. The one exception worth the three lines is
in slice 1 (`roster`/`effects` absent -> derive from `xi`), purely so a run in the
developer's own browser survives the refactor.

---

## Slice 1 - the effect ledger (do this alone, ship it, change nothing visible)

This is the part that cannot be retrofitted, and the only part with a free regression test.

### 1.1 The problem, precisely

`Boon.apply` is `(xi: Player[], ctx: BoonContext) => Player[]` and `RunState.xi` is
documented as "the current XI, with any boon rating deltas baked in". A boost is applied by
**rewriting the player objects**. Nothing records what was applied or by how much, so
nothing can expire, nothing can be listed with its magnitude, and `run.xi` has drifted from
the dataset (which is why `basePlayer` exists in `src/data/squads.ts` for
`domain/challenges.ts` to work around).

Do **not** try to solve this with an inverse transform. `bump` clamps to
`[ELO_MIN, ELO_MAX]`, so a `+2` on a 98 is really a `+1` and subtracting 2 later is wrong.

### 1.2 The model

Split what a boon does into the two things it actually does, and make the rating half
declarative so it survives JSON and can be replayed.

```ts
// domain/effects.ts (new)

/** Who a rating effect hits. Resolved to concrete ids AT PICK TIME (see 1.4). */
export type EffectTarget = { t: 'players'; ids: string[] };

export interface RunEffect {
  /** Unique per application, so two Golden Generations are two effects. */
  id: string;
  /** What granted it: a boon id, a shop item id, an event option id. */
  source: string;
  target: EffectTarget;
  delta: number;
  /** `koRound` when it was applied (group = -1). Purely informational today. */
  appliedAt: number;
  /** Last `koRound` on which it still applies. Absent = lasts the run (today's
   *  behaviour: every boon is permanent). Slice 5 is the first thing to set it. */
  expiresAfter?: number;
}

/** The XI as it is actually played: base roster + active effects, in application order.
 *
 *  Folded IN ORDER and clamped at EVERY step, deliberately. That reproduces the current
 *  behaviour exactly, where each boon's `bump` clamped as it was applied. Summing the
 *  deltas and clamping once would differ: base 98, +2, -3 gives 96 today (clamp to 99,
 *  then subtract) and 97 if summed first. Do not "simplify" it to a sum. */
export function xiOf(roster: Player[], effects: RunEffect[], atRound: number): Player[] {
  let out = roster;
  for (const e of effects) {
    if (e.expiresAfter !== undefined && atRound > e.expiresAfter) continue;
    const ids = new Set(e.target.ids);
    out = out.map((p) => (ids.has(p.id) ? bump(p, e.delta) : p));
  }
  return out;
}
```

`bump` moves from `boons.ts` to `effects.ts` (or a shared `domain/rating.ts`) and both
import it. Keep the clamp identical.

### 1.3 `Boon` gains a discriminated effect

```ts
export type BoonEffect =
  | { kind: 'rating'; plan: (xi: Player[], ctx: BoonContext) => RatingPlan[] }
  | { kind: 'roster'; apply: (roster: Player[], ctx: BoonContext) => Player[] };

/** What a rating boon decides when it is picked: who, and by how much. */
export interface RatingPlan { ids: string[]; delta: number }
```

- **Rating boons** (14 of the 19) return a *plan* instead of a rewritten XI. The rewrite
  helpers become plan builders: `bumpLowest(xi, n, d)` -> `planLowest(xi, n, d)` returning
  `{ ids, delta }`. `glass-cannon` and `catenaccio` return **two** plans (a positive and a
  negative), which is why `plan` returns an array.
- **Roster boons** (`transfer`, `poach`, `wildcard`, `legends-reunion`) keep the current
  shape and mutate the **roster**, not the XI. They stay immediate and permanent.

Keep `Boon.apply` deleted rather than deprecated - `noUnusedLocals` will not catch a dead
field, and two ways to apply a boon is exactly the ambiguity this slice exists to remove.

### 1.4 Resolve targets at pick time (this is the behavioural crux)

`bumpLowest(xi, 1, 6)` picks the lowest-rated player **at the moment it is applied**. If
the ledger re-resolved "lowest" on every recompute, a later effect could move who that is,
and the run would change under the player. So `chooseBoon` calls `plan(xi, ctx)` **once**,
against the XI as it currently stands, and stores the resulting concrete ids.

This also gets the interaction with roster boons right for free: today, Golden Generation
(+2 to all) followed by a Transfer leaves the incoming player at his base rating, because
he was never bumped. With ids frozen at pick time, the incoming player is not in the id
list, so he is unaffected - identical behaviour. An id that no longer matches anyone
(swapped out) simply applies to nobody, which is correct and needs no special case.

### 1.5 `RunState` changes

```ts
/** The roster as drafted plus any roster boost, at DATASET ratings. The identity of the
 *  XI; `effects` is what has been done to it. */
roster: Player[];
/** Active rating effects, oldest first. Order is load-bearing (see `xiOf`). */
effects: RunEffect[];
/** The XI as played: a CACHE of `xiOf(roster, effects, koRound)`, rewritten by
 *  `recomputeXi` at every transition that touches either input. Kept as a stored field
 *  rather than derived at each read so that the ~40 existing consumers (the sim,
 *  `xiStrength`, `chemistryOf`, `domain/challenges.ts`, the sticker banking, every
 *  component) are untouched by this slice. */
xi: Player[];
```

Add one private helper and route every mutation through it:

```ts
const recomputeXi = (run: RunState): RunState =>
  ({ ...run, xi: xiOf(run.roster, run.effects, run.koRound) });
```

Call sites: `beginRun` (roster = the drafted XI, effects = []), `chooseBoon`, and - once
slice 5 exists - the round transition in `prepareKnockoutRound` where an effect may expire.

**Compatibility shim (3 lines, the one exception to "no migration code"):** in
`state/runStorage.ts` on load, `roster ??= xi` and `effects ??= []`. A run saved before
this slice then resumes with its deltas already baked into the roster - the boosts are not
retroactively itemised, but the run finishes correctly instead of throwing.

### 1.6 The regression test is already written

`scripts/checks.ts` l.506-600 already prints every boon's measured attack/defence movement
against 12 budget-built XIs with `Math.random` seeded for that block. **That table must not
move.** Capture it before the refactor, diff it after, and treat any change as a bug in the
refactor rather than a rebalance.

Add to the harness:

- `xiOf` is **pure and order-stable**: same roster + effects + round gives an identical XI
  across repeated calls.
- **Per-step clamping is preserved**: a roster with a 98, effects `+2` then `-3`, gives 96,
  not 97. Assert the number literally - this is the trap the roadmap item names.
- **Frozen targets**: applying a rating effect then a roster boon leaves the incoming
  player unbumped.
- **`run.xi` equals `xiOf(run.roster, run.effects, run.koRound)` at every phase of a full
  simulated run.** This is the cache-coherence invariant; it is the one that will catch a
  future transition that forgets `recomputeXi`.

### 1.7 What slice 1 buys immediately, beyond enabling the rest

- `domain/challenges.ts` can read `run.roster` for dataset ratings instead of resolving
  every player through `basePlayer`. **Do this as a follow-up, not in this slice** - it
  changes challenge evaluation and wants its own before/after check.
- The XI panel can list "Golden Generation +2" per player rather than an opaque number.
  Also a follow-up.

**Ship slice 1 on its own.** No user-visible change, one green table, one new pure module.

---

## Slice 2 - Form as a faucet only (earn it, show it, spend it on nothing)

Deliberately shipped before any sink, so the faucet can be measured against real runs
before the shop's prices are invented. This is how Prestige and the challenge awards were
sized (see `CLAUDE.md`: the shop plus every locked boost is 2,525 and a run pays a median
of 9), and it is the only way to avoid guessing twice.

### 2.1 Model

```ts
/** In-run currency. Earned from results, spent at nodes, and DISCARDED with the run -
 *  unlike Prestige, which is the career-level currency that survives it. */
form: number;
```

Award it where the results are already committed, never at render time:

- `prepareGroupStage` - per matchday, from `userMatches`.
- `prepareKnockoutRound` - from `match`.

```ts
// domain/form.ts (new, pure)
export const FORM_WIN = 3, FORM_DRAW = 1, FORM_LOSS = 0;
export const FORM_MARGIN_CAP = 2;   // +1 per goal of margin, capped
export function formFor(us: number, them: number): number { ... }
```

Ascension should multiply it (the tier already multiplies XP and Prestige via
`ascensionAt(t).rewardMult`) - decide with the owner whether Form scales too. Recommended:
**no**. Ascension is a difficulty ladder that pays out at run END; scaling an in-run
currency by it makes a hard run easier mid-flight, which is backwards.

### 2.2 Surface

One number in `cupRun/RunXiPanel`, beside `score`. Nothing else. A "+4 Form" line in the
post-match banner if it reads well.

### 2.3 Checks

- Form is never negative and never decreases while there is no sink.
- **Print the distribution**, as the boon-power block prints its table: median and spread
  of total Form earned over N simulated runs, split by outcome (group exit / R16 / ... /
  champion). This number is the input to slice 3's pricing and should be in the log where
  the next person can find it.

---

## Slice 3 - the shop node

### 3.1 Phase machine

```ts
export type RunPhase = 'group' | 'boon' | 'shop' | 'event' | 'match' | 'ended';
```

`prepareKnockoutRound` currently hard-codes `phase: 'boon'` as the thing that follows a
survived tie. It becomes `phase: decided.nodeKind`, where **`nodeKind` was chosen inside
`decideKoRound` and stored on `KoPending`** - re-read rule 1 at the top. Same for
`decideGroupExit` / `GroupExit` for the after-group node.

```ts
export type NodeKind = 'boon' | 'shop' | 'event';

// on KoPending and GroupExit, alongside the existing `offer`:
nodeKind: NodeKind;
shop?: ShopStock;     // present iff nodeKind === 'shop'
event?: EventOffer;   // present iff nodeKind === 'event'
```

### 3.1.1 How many nodes there are, and when

`KO_ROUNDS` is `['Round of 16', 'Quarter-final', 'Semi-final', 'Final']` - **four** knockout
rounds, not five or six. A node sits **after** a round that was survived, never before one,
and `decideKoRound` deliberately offers nothing after the Final
(`if (!match.userWon || round >= KO_ROUNDS.length - 1) return pending`). So a full winning
run has exactly **four** decision points, and a group exit has none:

```
GROUP --v--> [1] --> R16 --v--> [2] --> QF --v--> [3] --> SF --v--> [4] --> FINAL --v--> champion
```

**This item does not change that count. It changes what each slot contains.** Recommended
rotation, **fixed rather than random** at first:

| Slot | After | Kind |
| --- | --- | --- |
| 1 | the group | boost |
| 2 | Round of 16 | **shop** (four matches played, so there is Form to spend) |
| 3 | Quarter-final | boost |
| 4 | Semi-final | **event** (the last decision before the Final) |

Fixed matters more here than it would with a longer ladder: with only four slots, a random
rotation leaves some runs with **no shop at all**, and the Form earned across that whole run
is then unspendable. It is also legible, testable, and removes a class of "the reload
re-rolled my node" bugs while the rest is being built. If run-to-run variety is wanted later,
shuffle slots 2 and 3 while **guaranteeing at least one shop**.

Curses are not a slot of their own: a curse is an option inside an event (see A.5).

**Do not add a fifth node before kickoff.** A pre-run shop between the build page and the
group draw is the obvious place to want one, and item 28 deliberately deleted the pre-run
screen on 2026-08-21 ("Start run goes straight into the draw", the Ascension picker having
moved to the build page). Re-opening that is a navigation decision, not a slice of this item.

### 3.2 Stock

```ts
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;                    // Form
  /** Same two shapes as a boon, so a shop item IS a boon effect with a price. */
  effect: BoonEffect;
}
export interface ShopStock { items: ShopItem[]; purchased: string[] }
```

Reuse, do not reinvent: **`rerollOffer` and `RunState.rerollsLeft` already exist** for the
Physio Table perk and are already persisted. The shop's re-roll item is a Form-priced
`rerollsLeft += 1`, which is the cheapest possible first item and needs no new machinery.

Starting stock, three items, deliberately dull:
- **Re-roll token** - `rerollsLeft += 1`.
- **Treatment** - +N to the lowest-rated player (a `rating` effect, `planLowest(xi,1,N)`).
- **Extra choice** - the next offer is 1-of-4 (touch `offerSize` to read a run-level bump).

### 3.3 Pricing - the part that can invalidate an existing assertion

`scripts/checks.ts` asserts boon budgets of **common 2.0 / rare 3.2 / legendary 4.5**,
where a boon's budget is *the sum of what it moves the attack average and the defence
average*. A shop that **sells rating points** must be priced in the same unit or it
invalidates that assertion by the back door.

Do this:

1. Extract the existing measurement into a reusable helper (it currently lives inline in
   the checks block) - `budgetOf(effect, sampleXis)` returning the attack/defence movement.
2. Express every shop item's cost as **Form per budget point**, one constant:
   `FORM_PER_BUDGET_POINT`.
3. Add a check that **every shop item's cost is consistent with its measured budget**, to
   the same 0.1 precision the boon bands use, and that the total Form a median run earns
   buys strictly less than one legendary boon's worth of budget. That last one is the
   guard against the shop quietly becoming the strongest boost in the game.

Note the existing `EXEMPT` set exists for effects that give points back or depend on the
draw. A shop item that gives points back (a curse-priced bargain) belongs there too, with a
comment saying why, exactly as the six current entries do.

---

## Slice 4 - the event node (and curses folded into it)

An event is a themed either/or with no cost, where at least one option gives something back.
A "curse" is just an event option with a negative component and a large positive one -
`glass-cannon` (+5 attackers / -3 defenders) is the working template and is already
`EXEMPT` from the band check for exactly the reason a curse needs to be.

```ts
export interface EventOption { id: string; label: string; effect: BoonEffect | null }
export interface EventOffer { id: string; title: string; body: string; options: EventOption[] }
```

Keep the catalogue tiny (4 to 6 events) and always include a **decline** option
(`effect: null`). An event with no way out is a boon pick wearing a costume.

Decided in `decideKoRound`, stored on `KoPending`, per rule 1.

---

## Slice 5 - expiring effects

Only now is this cheap: set `expiresAfter` on a `RunEffect` and `xiOf` already ignores it.
The work is not the model, it is:

- calling `recomputeXi` on the round transition in `prepareKnockoutRound`;
- showing remaining duration in `RunXiPanel`'s active-boost chips, or the expiry is invisible
  and reads as a bug;
- a check asserting an effect with `expiresAfter: 1` is in the XI at round 1 and gone at
  round 2, and that the un-bumped value equals the base (which per-step clamping does
  **not** guarantee if the effect is in the middle of a stack - assert the actual expected
  number, do not assume reversibility).

---

## Build order and stopping points

| # | Slice | Visible? | Ship alone? |
| --- | --- | --- | --- |
| 1 | Effect ledger | No | **Yes - do this and stop** |
| 2 | Form faucet | A counter | Yes |
| 3 | Shop node | Yes | Yes |
| 4 | Event node | Yes | Yes |
| 5 | Expiring effects | Yes | Yes |

Slice 1 is worth doing even if the owner never approves slices 2 to 5: it removes the
`basePlayer` workaround's cause, makes boosts itemisable in the UI, and is verified by a
table that already exists.

---

## Standing constraints for whoever implements this

- `npm run build` (tsc + vite) and `npm run checks` before every commit. 102 checks pass on
  `7cb870c`; that number should only go up.
- 2-space indent, match the surrounding file. No reformatting as a side effect.
- **No em-dashes** in code, comments, commit messages or UI copy.
- User-facing copy says **"boost"**, never "boon"; **"rating"**, never "elo". Pick a
  user-facing word for Form and use it consistently - "Form" is fine and is not jargon.
- New optional/experimental behaviour goes behind a `FEATURES` flag in `src/config.ts`.
  Slices 3 to 5 want one (`FEATURES.runNodes`); slice 1 does not, because it changes
  nothing observable.
- Commit messages end with the `Co-Authored-By` trailer. Push to `main`.

## Two errors in the roadmap entry itself, worth fixing while here

1. Its `files` list names `src/components/RunLadder.tsx`, which **was deleted by item 28**
   on 2026-08-21. The ladder is gone; its round-review role is now the bracket's own cells
   plus `cupRun/GroupCell`.
2. Its "next step" says to land item 27 first and warns that this piles Cup-Run-only
   machinery onto the heavier side of a two-engine duplication. **Both have expired**: item
   27 shipped on 2026-08-21 and item 28 deleted the second engine the same day. The stated
   reasons to wait are gone; only the cost remains.

---

# Appendix A - content suggestions

**Read the design rule before the lists.** Nineteen boosts already exist and the item's own
diagnosis is that every pick "reduces to taking the biggest number". Adding a twentieth card
of the same shape makes the list longer, not the run more skilful. So each node type below
answers a **different question**, and content is chosen to fit its node rather than to pad a
catalogue:

| Node | Costs | Chosen or dealt | Power | The question it asks |
| --- | --- | --- | --- | --- |
| **Boost** | free | dealt (1 of 3) | high | which of these three do I want? |
| **Shop** | Form | **chosen** from stock | low per point | what do I actually need? |
| **Event** | free | forced either/or | medium | what am I willing to give up? |
| **Curse** | a real cost | opt-in | over-band | how far ahead am I willing to get? |

The shop is the only node where the player **chooses rather than picks**, and that - not the
currency - is why it earns its place. Price it weakly per point; its value is that it is
targeted.

## A.1 Budget arithmetic, so proposals can be sanity-checked on paper

A boost's budget is the sum of what it moves the **attack average** (MID/FWD, about 6
players) and the **defence average** (GK/DEF, about 5). Bands: common 2.0, rare 3.2,
legendary 4.5.

- `+N` to all 11 -> `2N` (Golden Generation +2 = 4, legendary).
- `+N` to all attackers -> `N`. To all defenders -> `N`.
- `+N` to one attacker -> `N/6`. To one defender -> `N/5`. To the keeper -> `N/5`.

Figures below are estimates to be replaced by the harness's measured number. **Do not ship
any of these on the estimate**; `npm run checks` prints the real one.

## A.2 New boosts (the free, dealt node)

Existing pool for reference - 19 boons, 6 of them starters: Golden Generation, Marquee
Signing, Star Signing, Glass Cannon, Veteran Core, Attacking Masterclass, Defensive Drills,
Familiar Foes, Transfer, Poach, Wildcard Legend, Keeper Coach, Squad Rotation, Set-Piece
Drills, Catenaccio, Counter Attack, Underdog Spirit, Galacticos, Legends' Reunion.

Everything in that pool moves a rating average. **The unexplored space is the levers that
are not rating averages at all**, and there are exactly three in the engine: the **shootout**
(`penTakersFrom` sorts takers by rating; `penProb` is linear in rating), the **opponent
draw** (`drawOpponent` takes a slope), and **chemistry** (`MAX_BONUS = 6`, added to overall).
Boosts built on those are novel by construction and mostly cost nothing against the bands.

| Name | Rarity | Effect | Budget | Notes |
| --- | --- | --- | --- | --- |
| **Ice Veins** | common | +8 to your five best players **for shootout purposes only** | ~0 measured | Needs `penTakersFrom` to read a separate figure from `elo`. Real skill expression: it does nothing in 80% of ties and wins the other 20%. |
| **Kind Draw** | rare | Re-draw your next opponent and keep the weaker of the two | 0 measured | Draw-conditional, so **EXEMPT**. The pre-rolled result must live in `KoPending` (see A.5). |
| **Dressing Room** | rare | +2 chemistry bonus, capped at `MAX_BONUS` | ~4 raw | Careful: chemistry adds to overall, so it hits attack *and* defence. Worth 4 at full value, but caps out on a cohesive XI, so it is a *worse* pick the better you built. That inversion is the interesting part. |
| **Rotation Policy** | common | +6 to your three weakest, -2 to your three best | ~1.5 net | Gives back, so **EXEMPT**. Compresses the XI; strong for a lopsided budget build, weak for a national side. |
| **Homecoming** | rare | +4 to players whose nation is in your next opponent's group... | - | **Do not build this.** Reads as draw-conditional but the player controls their nations at build time. Same trap that killed Chemistry Catalyst. Listed here so nobody re-invents it. |
| **Second Wind** | common | +5 to the XI, expiring after one round | ~10 for one round | Requires slice 5. A good first customer for expiry, and the reason expiry is worth having. |

**Ice Veins is the pick of these** if only one gets built: it is genuinely orthogonal to the
existing 19, it is budget-free by the current measure, and shootouts already exist with a
rating-linear model waiting to be tapped.

## A.3 Shop stock (costs Form, chosen)

Reliable and dull on purpose - the contrast with the random offer is the point.

| Item | Cost (Form) | Effect | Machinery needed |
| --- | --- | --- | --- |
| **Re-roll token** | low | `rerellsLeft += 1` | **None. Already built and already persisted** for the Physio Table perk. Build this first. |
| **Treatment** | low | +4 to your lowest-rated player | `planLowest(xi, 1, 4)` |
| **Full treatment** | mid | +3 to your three lowest | `planLowest(xi, 3, 3)` |
| **Extra choice** | mid | next offer is 1 of 4 | `offerSize` reads a run-level bump |
| **Scouting report** | low | reveal the next TWO rounds of the bracket | pure UI; zero budget |
| **Targeted signing** | high | buy one **named** boost from a fixed 3-item list | the headline item: turns Form into *targeted* power where the offer is *random* power. Price at a clear premium over its band. |

**Targeted signing is what makes the shop a shop.** Without it the stock is just a weaker
boost offer that charges you.

Rules for pricing, per slice 3.3: every item's cost is `budgetOf(effect) x
FORM_PER_BUDGET_POINT`, asserted in the harness, and a median run's total Form must buy
**less than one legendary boost's worth of budget**.

## A.4 Events (free, forced either/or)

Always include a decline option. An event with no way out is a boost pick in a costume.

| Event | Option A | Option B | Shape |
| --- | --- | --- | --- |
| **Contract Dispute** | Pay 4 Form, he stays | He leaves; a random 85+ replaces him | currency vs roster |
| **The Prodigy** | +8 to your weakest player | Take 6 Form instead | power now vs power later |
| **Media Storm** | -2 to the XI, take 8 Form | Decline | sell rating for currency |
| **Old Rivals** | +5 against your next opponent only | Re-draw the opponent | known fight vs unknown fight |
| **Federation Politics** | +4 to one nation's players in your XI | +2 to everyone else | rewards a cohesive XI vs a scattered one - and unlike Chemistry Catalyst it is symmetric, so neither build is punished |
| **Tired Legs** | Rest: -3 this round, +6 the next | Play on: nothing | needs slice 5 |

## A.5 Curses (opt-in, over-band, cost something real)

A curse is over-powered **and** carries a cost the player accepts knowingly. Glass Cannon is
the working template and is already `EXEMPT` for the right reason.

Note a structural constraint: **in the knockouts a loss already ends the run**, so "risk" can
never mean "you might go out". It has to mean losing a *resource*.

| Curse | Gain | Cost |
| --- | --- | --- |
| **Sell the Star** | +12 Form | Your best player leaves, replaced by a random 75+ |
| **Sold Out Stadium** | +6 to the XI | -6 to the XI in the following round (slice 5) |
| **Devil's Bargain** | +10 to your attack | -6 to your defence |
| **Mortgage the Future** | +4 to the XI | The run pays no Prestige at all if you do not win the cup |
| **The Coin Toss** | pre-rolled: +8 to the XI, or -4 | see the trap below |

**Mortgage the Future is the most interesting** because it is the only one whose cost lands
on the *career* layer rather than inside the run, which makes the decision differ by how the
run is already going.

### The trap in every random curse

**The Coin Toss's result must be rolled in `decideKoRound` and stored on `KoPending`,
alongside the offer.** If it is rolled when the player clicks, a reload re-rolls it and
reload-scumming is the optimal play. This is the same rule that already governs the group
draw, the boost offer and the opponent - re-read rule 1 at the top of this plan. The
harness should assert it the way the existing checks do: prepare, reload, prepare again,
and the stored outcome must be identical.

## A.6 What NOT to add

- Anything conditional on a property the player picks at **build time** (nation, formation,
  average rating). That is the Chemistry Catalyst trap: a legendary effect at a common price,
  because the transfer market makes the condition trivial to satisfy.
- Anything that changes a **scoreline** directly. The sim decides how many goals from the two
  strength numbers and only then credits a scorer; a boost that edits the score bypasses every
  balance measurement the harness makes.
- A second **permanent** currency. Form must die with the run, or it is Prestige with extra
  steps and needs the whole arrears argument `challengeAwards` carries.
