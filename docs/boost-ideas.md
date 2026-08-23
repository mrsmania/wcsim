# Boost ideas that are not "strength + X"

Roadmap item 30. **Round 6**, written 2026-08-23. Eleven cards have shipped across five
rounds; **117 ideas have been rejected**. This is the next 25.

## The method

Round 4's note said an open-ended 25 was hitting diminishing returns, and round 5 replaced
it with **named surfaces**: pick a part of the engine no card has ever touched, and write
only for that. It works, so round 6 does the same with four more.

1. **The rest of the tree.** Fourteen other teams play a tie every round. The bracket
   resolves them, the screen draws them, and no card has ever looked at them.
2. **Who scores.** `POSITION_WEIGHT` and `scorerWeight` decide the name beside each goal.
   Nothing writes them, and the trophy cabinet now has a top-scorer board that reads them.
3. **Chemistry.** Six categories, a bonus capped at 6, computed live every round. No card
   has ever moved it. (Careful: the old Chemistry Catalyst was cut for keying off something
   the player buys at build time. Everything here keys off the RULES, not the XI.)
4. **The payout.** Mortgage the Future is the only card whose cost lands on the career.
   XP, Prestige, the Ascension multiplier and the album are four levers with one card
   between them.

## Shipped (34 cards)

golden-generation, marquee-signing, star-signing, veteran-core, attacking-masterclass,
defensive-drills, transfer, poach, wildcard, keeper-coach, squad-rotation, set-piece-drills,
catenaccio, counter-attack, underdog-spirit, galacticos, legends-reunion, prime-years,
in-form, old-guard, armband, away-days, man-marking, double-print, ice-veins, kind-draw,
second-wind, sold-out-stadium, coin-toss, mortgage-future, full-backs, loan-deal,
underdogs-purse, **siege-mentality**.

## Do not re-propose (117)

- **Mechanisms (item 29, rejected):** wagering the payout, choosing your own path, committing
  to a tactic before the draw, a squad of 14.
- **Round 1:** Nervy Spot-Kicks, Rotation Forced, Seeded, Continental Draw, Upset Special,
  Rematch, Bye, Straight to Penalties, Golden Goal, Replay, Fast Starters, Talisman, Nerves of
  Steel, Smash and Grab, Team Talk, Naturalised, Clique, Sponsor Deal, Youth Policy, Insurance,
  Legacy, Panini Deal, Sell the Star, Burn a Sticker.
- **Round 2:** The Number Ten, Club Connection, Compatriots, Golden Era, Open Game,
  Attritional, Red Card, Home Crowd, Two Legs, Form Guide, Backs to the Wall, Group Winners,
  Ever Present, Call Up a Legend, Swap Shop, Complete the Set, Collector's Run, Title Defence,
  Unfinished Business, Step Up, Sweeper Keeper.
- **Round 3:** Understudy, Specialist, Scapegoat, Mentor, Target Man, Momentum, Clean Sheet
  Bonus, Snowball, Cup Fever, Deja Vu, Second Opinion, Wildcard Slot, Switch Formation, Total
  Football, False Nine, The Veteran, The Debutant, Squad Number One, Journeymen, Continental
  Rivals, Bogey Team, Class of Their Own, Physio, Fresh Start, Contract Rebel.
- **Round 4:** Squad Harmony, Wage Bill, Meritocracy, The Spine, Percentages, Compound
  Interest, Diminishing Returns, Halve the Gap, Regulation, Star Power, Balanced Books, Even
  Spread, Thin Squad, Poach the Keeper, Mirror Match, Ringer, Goal Difference, Clean Slate,
  Minutes in the Legs, Extra Time Specialists, Sudden Death, Lucky Shirt.
- **Round 5:** Number One, Understudy Called Up, Sweeper, Penalty Specialist, The Cat,
  Outfield Keeper, Nothing to Lose, Rock Bottom, Last Legs, Insurance Policy, Reputation,
  Written Off, Emergency Loan, Ringer (loan), Cup-Tied, Double Loan, Permanent Deal, Rotation,
  Take Two, Deep Bench, Scout's Hunch, Buy the Rights, Second Thoughts, Stubborn.
- **Never buildable:** anything selling INFORMATION, and anything conditioned on what the
  player picks at BUILD time.

---

## The rest of the tree (6)

Fourteen other teams play every round. `playRound` resolves their ties from their own
ratings, `Bracket.tsx` draws them, and in eleven cards nothing has ever touched them. The
tree is the one part of a run that happens without the player.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **Giant Killing** | The highest-rated team left in the tree, other than you, is knocked out this round regardless of its tie. Removes the team you were dreading before you ever meet it. | medium |
| 2 | **Rigged Draw** | The two strongest remaining teams are moved into the same half. They eliminate each other, and you meet only one of them. | medium |
| 3 | **Chaos** | Every other tie this round is decided by a coin flip rather than by rating. Ruins the favourites and cannot hurt you, since your own tie is untouched. | medium |
| 4 | **Scouting the Field** | +1 to your XI for every team still in the tree that is rated below you. Pays a soft half of the draw, and reads a fact the tree already knows. | cheap |
| 5 | **Old Rivals** | If a team from your XI's most-represented nation is still in the tree, +6. A condition the DRAW controls, unlike the Chemistry Catalyst it superficially resembles. | cheap |
| 6 | **Attrition** | -3 to every remaining team in the tree, permanently. Weakens the whole field rather than one opponent, and is worth more the further you go. | expensive |

## Who scores (6)

`POSITION_WEIGHT` decides the name beside each goal - a striker at 4.4x a full-back, a
keeper never. It cannot change a scoreline, only who is credited. That used to be
cosmetic; the trophy cabinet's top-scorer board and two challenges now read it.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 7 | **Golden Boot Race** | Your leading scorer is three times as likely to score each remaining goal. Cannot change a single result, and decides who ends the run with the record. | cheap |
| 8 | **Set Piece Threat** | Your defenders score at a midfielder's rate. Changes nothing about winning and everything about the cabinet. | cheap |
| 9 | **Keeper Up For Corners** | Your goalkeeper can score, at a centre-back's rate. The one thing the weighting has always forbidden outright. | cheap |
| 10 | **Share the Goals** | Every player in your XI is equally likely to score. Flattens the whole weighting to 1.0, which nothing else can do. | cheap |
| 11 | **The Poacher** | Name a player: he scores at four times his usual rate. A question card (`Boon.choice`), aimed at a lever no card has ever aimed at. | cheap |
| 12 | **Own Goals** | Your opponents' goals are credited to their defenders. Pure flavour on their side of the sheet, and the first card that writes anything about THEM beyond a rating. | cheap |

## Chemistry (6)

Six categories summing to a bonus capped at 6, recomputed live every round, feeding attack
and defence alike. Not one card touches it. Everything here changes the RULES rather than
the XI, which is what keeps it clear of the build-time trap that killed Chemistry Catalyst.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 13 | **Settled Side** | The chemistry cap rises from 6 to 10 for the rest of the run. Worth a lot to a cohesive XI and nothing to a scattered one, and you can read which you are off the box score. | medium |
| 14 | **Club Football** | Your "same squad" chemistry counts double. Aims at one of the six categories rather than the total. | cheap |
| 15 | **International Break** | Chemistry is fixed at its cap for the rest of the run, whatever the XI becomes. Frees every later roster card from wrecking it. | medium |
| 16 | **Passport Office** | Every player in your XI is treated as sharing the most common nation among them, for chemistry only. Their ratings and flags are untouched. | medium |
| 17 | **Same Generation** | Every player is treated as being from the same era. Fixes the one category a legends XI always fails. | cheap |
| 18 | **Bad Blood** | Chemistry is 0 for the rest of the run, and your XI gets +5 flat. A straight trade of a variable bonus for a fixed one. | cheap |

## The payout (7)

Mortgage the Future is the only card whose cost lands on the career rather than inside the
run. XP, Prestige, the Ascension multiplier and the album are four separate levers with a
single card between them.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 19 | **Appearance Money** | The run pays Prestige for every round survived, whether or not you win the cup. Turns a doomed run into a paid one. | cheap |
| 20 | **Sponsorship** | Double XP from this run, no change to Prestige. Levels gate the dearest perk tiers and only playing earns them, so this is the only card that touches the gate. | cheap |
| 21 | **Play Up a Level** | The run is scored as if it were one Ascension tier higher: the reward multiplier and the handicap both. A tier you have not unlocked, for one run. | medium |
| 22 | **Youth Development** | The run pays no Prestige, and the next run starts with an extra boost already applied. Scout Network for one run, bought with the payout. | medium |
| 23 | **Testimonial** | Name a player: if he is still in your XI at the end, he is added to the album whatever happens. The album is currently reachable by exactly one card. | medium |
| 24 | **Agent Fees** | Every boost from here on costs 5 Prestige off the run's payout, and the offers are one card wider. Pay per stop for a better choice at it. | medium |
| 25 | **All or Nothing** | Triple the payout if you win the cup, and the run pays nothing if you lose the FINAL specifically. Mortgage the Future with a narrower, crueller failure condition. | medium |

---

## Notes for whoever builds these

- **The balance harness hands every card a firing context** (`topScorerId`,
  `careerTopScorerId`, `chosenId`, `underdogRounds`, `goalsConceded`). Anything conditional
  needs its condition represented there, or it measures 0.0 and goes unbanded - which is
  exactly how an over-band card gets into the pool. It caught two in round 2.
- **A card on a lever the table cannot see** (the shootout, the draw, the album, the payout,
  the offer, the tree, the scorer weighting) correctly reads 0.0 and needs its own assertion
  instead.
- **Check the card is not a worse copy of one already in the pool.** Loan Deal measured 4.0
  against Poach's 3.9, which at the same rarity would have made it Poach with an expiry
  date. It is a common starter and Poach is the rare precisely because of that reading.
- **A card that reads a run's own numbers must be sized for the extreme, not the average.**
  Siege Mentality is +1 a goal rather than +2 because at +2 a deliberately poor defence
  would have been worth building.
- **Anything random must be decided when the offer is dealt**, not when the card is clicked,
  or reloading until you like the result is the optimal play.
- **Anything touching the opponent must move the bracket with it**, and anything touching
  the tree must leave `run.nextOpponent` agreeing with it.
- **A card that swaps more than one player must tag them all** in `boostedIds`, or the
  arrivals bank stickers they were handed rather than drafted. Prime Years is why
  `Granted.incomingIds` is a list.
- **A card that asks a question** parks `pendingChoice` and must not commit the stop. Give it
  no cancel: backing out prices the card against the whole XI and then takes another, which
  is a free re-roll of the offer.
- **A temporary PERSON is `RunState.loan`**, undone by `prepareKnockoutRound` when the round
  advances. A `RunModifier` that has to see its own card's roster swap reads `granted`, which
  is why `commitBoon` applies the modifiers over the merged state and not over the run as it
  arrived.
- **Shootout kicks are never goals**, anywhere. They live in `KoMatch.pens` and never in a
  scoreline, which is what lets Siege Mentality and the cabinet's tally both stay honest
  without a filter.
