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

## The ten

### 1. A third tier on every two-tier track

The cheapest fix for problem 1, and the one that needs no new mechanism at all: the shop is
data-driven off `PERKS`, so a tier appears by being added. Scout Network 3 (three commons),
Extra Choice 3 (six boosts offered), Physio Table 3 (three re-rolls), Extra Re-roll 3 (a
6th). **Deep Squad is the exception and must stay at +2** - the note in `career.ts` records
that +3 to the whole XI, permanently, beat every legendary boost and never wore off.

Cost: trivial. Risk: Extra Choice 3 makes a six-card offer, which starts to be a wall
rather than a choice.

### 2. Prestige Reset

Spend a large sum to refund every perk you own and re-spend it. Answers problem 4 without
touching any other system: nothing in the career layer can currently be undone, so a player
who bought Transfer Budget tiers and then discovered they prefer the roll draft is stuck
with them forever. Priced so it is a real decision (say 200), not a free re-plan.

### 3. Perk loadout: own many, equip few

The bigger version of the same idea. Perks become things you own permanently but **equip
per run**, with a slot count that itself grows with level. Turns the shop from a checklist
into a build, and makes the tenth perk as interesting as the first - because owning
everything no longer means playing with everything.

This is the largest change on the list and the one that most directly fixes problems 1 and
4. It also makes every future perk safe to add: power creep stops mattering once you cannot
run them all at once.

### 4. Level actually paying something

Problem 2, addressed directly: every level grants a small permanent something (say +1
Prestige per run, or +$1 of market budget per two levels). Levels currently gate and
nothing else, so a career that is over every gate it cares about has no reason to notice
them. Careful: this is a compounding faucet, so it wants simulating the way `AWARD` was.

### 5. Ascension Insurance

A perk that lets a run at Ascension II or higher keep its reward multiplier after a group
exit. The Ascension ladder is where a career's difficulty lives, and nothing in the shop
interacts with it at all - which is odd, given it is the one part of the layer that makes
runs harder on purpose.

### 6. Album perks

The album is a whole subsystem the shop cannot see. Three obvious tiers: **a bigger owned
-sticker discount** in the market (it is a flat `STICKER_DISCOUNT` of 25% today), **a
cheaper trade** (`STICKER_TRADE_COST` is 10/20/50 duplicates), or **a second cup-win pick**
(what Double Print does as a boost). All three already have a constant to move, so the
implementation is a lookup rather than a mechanism.

### 7. Challenge perks

Same argument for the other subsystem: a perk that pays challenge awards at 1.5x, or that
shows which challenges the run in progress is *close* to completing. The second is
information rather than power, which the boost pool banned for good reasons - but a perk is
bought once and known about, so it does not have the same problem a hidden card does.

### 8. Draft perks (the build page)

Only Extra Re-roll touches the build, and only the roll half of it. Candidates: **an extra
collectible swap** (`INITIAL_SWAPS` is 2), **pick your formation after seeing the first
squad**, or **one guaranteed collectible in the first rolled squad**. The build is half the
game and the shop currently has one perk pointed at it.

### 9. Rarity weighting

A perk that shifts the offer's rarity weights (`RARITY_WEIGHT`, common 6 / rare 3 /
legendary 1) rather than its size. Extra Choice widens the offer; nothing deepens it. This
is a strictly different lever and a cheap one, and it gets better the more of the boost
library you have unlocked - which is a nice interaction with the other Prestige sink.

### 10. A capstone that costs more than everything else

One very expensive endgame purchase (1000+) that does something a career can aim at for a
long time: a seventh Ascension tier, a permanent extra boost slot, or the right to carry
one boost between runs. Right now the most expensive thing in the game is a $160 transfer
budget, and 3500 Prestige buys out every sink there is. A career past that has nothing left
to want.

---

## Notes for whoever builds these

- **The shop is data-driven off `PERKS`**, so a new track or tier appears by being added
  there. What needs wiring is only its EFFECT.
- **A perk that reaches outside the run must be read in `App`**, like `transfer-budget` and
  `extra-reroll` are: the reducer knows nothing about the career, which is why the numbers
  are passed in.
- **`npm run checks` asserts a track's copy matches its effect** - the Extra Re-roll
  ordinal and, since 2026-08-23, the Transfer Budget dollar figure. Any new perk whose
  description states a number should get the same assertion, because the number and the
  sentence live in different files.
- **A perk that pays Prestige or XP is a FAUCET**, and the challenge awards were sized by
  simulating 16 careers of 150 runs before being switched on. Do the same rather than
  guessing; the property to keep is that runs stay clearly the primary faucet.
- **Deep Squad tier 3 is off-limits** for the reason already recorded: a permanent +3 to
  the whole XI beat every legendary boost and never wore off.
- **Level requirements are the one thing challenge Prestige cannot buy**, since challenge
  awards grant no XP. That is deliberate and is what keeps the dearest tiers earned by
  playing - do not add an XP faucet outside runs without deciding to give that up.
