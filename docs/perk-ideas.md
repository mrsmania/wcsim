# Perk shop: ten suggestions

Written 2026-08-23, after the boost library was declared full (roadmap item 30) and three
cards were deleted from it. The perk shop is the layer that *did not* grow while the boost
pool went from 19 cards to 37 and back to 34, and it is now the thinner of the two.

## What the shop is today

Six tracks, seventeen tiers, **2585 Prestige** to buy out. A run pays a median of 9.

| Track | Tiers | What it does | Costs | Level gates |
| --- | --- | --- | --- | --- |
| Scout Network | 2 | Start with 1-2 common boosts applied | 25, 70 | 1, 5 |
| Deep Squad | 2 | +1 / +2 to the XI at kickoff | 45, 120 | 1, 4 |
| Extra Choice | 2 | 4 / 5 boosts offered per stop | 90, 150 | 3, 7 |
| Transfer Budget | 9 | $80 to $160 in the market | 20 to 520 | 2 to 40 |
| Extra Re-roll | 2 | A 4th / 5th squad re-roll | 30, 75 | 1, 4 |
| Physio Table | 2 | Re-roll a boost offer 1 / 2 times a run | 35, 85 | 2, 6 |

## The four problems worth naming first

These are what the suggestions below are aimed at, and they matter more than any single
idea in the list.

1. **Five of the six tracks are two tiers deep and then finished.** A career that has been
   playing for a while owns all of them, and from that point Prestige has only one sink
   left (the boost library) plus one long ladder. The shop stops being a decision.
2. **Level does almost nothing.** It gates perk tiers and Ascension tiers and is otherwise
   decorative. `XP_PER_LEVEL` is a flat 200, so levelling is linear forever, and the new
   level-40 gate on Transfer Budget tier 9 is the only thing in the game that reaches past
   level 30.
3. **Only two perks reach outside the run** (Transfer Budget and Extra Re-roll, both read
   in `App`). Everything else acts at kickoff or at a stop. The build page, the album, the
   cabinet and the challenge catalogue are all untouched by the shop.
4. **Nothing in the shop can be un-bought or re-aimed.** Every purchase is permanent and
   global, so there is no per-run decision anywhere in the career layer - which is exactly
   the thing that made the boost pool interesting.


---

## Ten new perk tracks

Concrete tracks, with tiers, Prestige costs and level gates on the existing curves, so
each could be pasted into `PERKS` and only its EFFECT needs wiring. Every one pulls a lever
the six current perks do not.

**The rule they are all written against:** a perk is PERMANENT and GLOBAL, so it is worth
far more than a boost of the same size. That is why Deep Squad stops at +2 - a permanent +3
to the whole XI beat every legendary boost and never wore off. Nothing below gives a flat
rating to the whole XI for the whole run.

### 1. Youth Academy

*The build page's collectible supply.* Every rolled squad is guaranteed to contain at least
N collectible players, so the roll draft can actually be played for the album rather than
hoping.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | Every drawn squad holds at least 1 collectible. | 60 | 3 |
| 2 | ...at least 2. | 140 | 9 |

Seam: `rollSquad` in `domain/draft.ts`, re-rolling until the guarantee is met (with a bail
-out, since a few squads have no 90+ player at all).

### 2. Agent's Contacts

*The swap counter.* `INITIAL_SWAPS` is 2 and has never moved; this is the Extra Re-roll perk
for the other half of the draft, and it works in BOTH build methods where Extra Re-roll only
works in one.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | A 3rd collectible swap each run. | 40 | 2 |
| 2 | A 4th. | 95 | 6 |

Seam: exactly Extra Re-roll's - the reducer takes the number on `START_DRAFT`, `App` reads
the perk. A checks assertion on the copy's ordinal comes with it.

### 3. Club Shop

*The album paying back harder.* `STICKER_DISCOUNT` is a flat 25% off any player whose
sticker you already own. Raising it makes a big album into a genuinely bigger XI, which is
the collection's only current route into the game.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | 30% off players already in your album. | 55 | 4 |
| 2 | 35% off. | 130 | 10 |

Seam: `priceFor` / `pricerFor` in `domain/pricing.ts` already take the owned set; the
constant becomes a parameter. Mind that **every** money path must use it (the market rows,
the two sort comparators, the budget bar, `XiTable`'s total, `autoFillBudget`).

### 4. Home Advantage

*The group stage, which no perk and no boost touches.* +N to your XI in the three group
matches only. Aimed exactly where runs die: the first boost is picked AFTER the group, so a
weak XI never gets to use the boost pool at all.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | +2 to your XI in the group stage. | 50 | 2 |
| 2 | +4 in the group stage. | 125 | 7 |

Seam: a `RunEffect` with `expiresAfter` set - the ledger has supported windows since the
boost work and this would be its first non-boost user.

### 5. Cup Specialist

*Home Advantage's mirror, and the one a strong career wants.* +N to your XI in the FINAL
only. Small, late, and it does nothing at all in the four runs out of five that never get
there.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | +4 to your XI in the final. | 65 | 5 |
| 2 | +8 in the final. | 150 | 12 |

Seam: the same ledger window, opened at `koRound` 3 rather than closed after the group.

### 6. Penalty Coach

*The shootout, permanently.* Ice Veins does this for one run as a card; this is the standing
version, and deliberately smaller (+3 against +8) for exactly that reason.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | +3 to your five best penalty takers, shootouts only. | 45 | 3 |
| 2 | +6. | 110 | 8 |

Seam: `RunState.penBonus` already exists and is already kept off the ledger so it cannot
reach a scoreline. `beginRun` sets it from the perk instead of only from a card.

### 7. Analytics Department

*The opponent, permanently.* -1 or -2 to every knockout opponent's overall. Tiny per tie and
it compounds across four of them, which is the shape a perk should have where a card should
not.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | -1 to every knockout opponent. | 70 | 4 |
| 2 | -2. | 165 | 11 |

Seam: `weakenOpponent` in `domain/run.ts` already does this and already moves the bracket
with it. Applied in `decideKoRound` rather than by a card.

### 8. Director of Football

*The offer's RARITY, where Extra Choice only touches its size.* One card in every offer is
guaranteed to be rare or better. `RARITY_WEIGHT` is common 6 / rare 3 / legendary 1, so a
three-card offer is usually three commons.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | One card in each offer is rare or better. | 100 | 6 |
| 2 | One card in each offer is legendary. | 200 | 14 |

Seam: `offerBoons` in `domain/boons.ts`, drawing one card from a filtered pool first. It
gets better the more of the library you have unlocked, which is a good interaction with the
other Prestige sink.

### 9. Contract Renewal

*Continuity between runs, which nothing has.* The last boost you took in your previous run
is applied at kickoff to the next one. Different every time, earned rather than chosen, and
worth exactly what your last run's final decision was worth.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | Start each run with the last boost of your previous run. | 130 | 8 |

One tier only, because "carry two" starts to be a second XI. Seam: `CareerStats` (a new
field there survives a signed-in save; a new `CareerState` key does not - the trick
`bonusStartBoosts` uses), read by `beginRun` like Scout Network's.

### 10. Board Backing

*The payout, which only Ascension scales.* +10% / +20% Prestige from every finished run.
The shop's own income, and the only perk that pays for the rest of the shop.

| Tier | Effect | Cost | Level |
| --- | --- | --- | --- |
| 1 | +10% Prestige from every run. | 90 | 5 |
| 2 | +20%. | 210 | 13 |

**This one needs simulating before it ships**, the way `AWARD` was: it is a compounding
faucet, and the property to keep is that runs stay clearly the primary source of Prestige.
Note it must NOT touch XP, or it would erode the one thing level gates are for. Seam: the
payout block in `applyRunResult`, beside the four boost cards that already live there.

---

## What these ten cost, and what to build first

All nineteen tiers come to **2030 Prestige**, which would take the shop from 2585 to
**4615** and roughly double what a long career has to aim at. That is the point: the shop is
currently buyable out. (It would also move the challenge-award anchor again, so re-derive
that ratio rather than trusting the sentence in `domain/challenges.ts`.)

If only three are built, build **Agent's Contacts** (cheapest, exact copy of an existing
seam, and it fixes the build page having one perk), **Home Advantage** (aimed at where runs
actually die, and it is the ledger's first non-boost user), and **Director of Football**
(the only idea here that gets better as the other Prestige sink is filled).
