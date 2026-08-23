# Boost ideas that are not "strength + X"

Roadmap item 30. **Round 5**, written 2026-08-23. Ten cards have shipped across four
rounds; **93 ideas have been rejected**. This is the next 25.

## What changed about the method

Round 4's own note said a round 5 would be better aimed at a **named surface** than at
another open-ended 25, because four rounds in the levers this engine exposes have mostly
been proposed at least once and the discard list is three times the catalogue. So this
round is four named surfaces rather than a sweep:

1. **The goalkeeper.** One of the eleven, in his own category of one, and Keeper Coach is
   the only card in the game that has ever addressed him.
2. **A run that is LOSING.** Every card in the pool is priced for a run that is winning:
   it is taken at a stop, and you only reach a stop by going through. Nothing helps a run
   that is barely surviving, and nothing at all happens when one ends.
3. **Temporary people.** Loan Deal built the machinery (`RunState.loan`), and it currently
   has exactly one user. These are now the cheapest cards on the list.
4. **The stop itself** - the offer, the re-roll, the act of choosing. Physio Table is a
   perk; nothing in the catalogue has ever looked at the catalogue.

## Shipped (33 cards)

golden-generation, marquee-signing, star-signing, veteran-core, attacking-masterclass,
defensive-drills, transfer, poach, wildcard, keeper-coach, squad-rotation, set-piece-drills,
catenaccio, counter-attack, underdog-spirit, galacticos, legends-reunion, prime-years,
in-form, old-guard, armband, away-days, man-marking, double-print, ice-veins, kind-draw,
second-wind, sold-out-stadium, coin-toss, mortgage-future, **full-backs**, **loan-deal**,
**underdogs-purse**.

## Do not re-propose (93)

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
- **Never buildable:** anything selling INFORMATION, and anything conditioned on what the
  player picks at BUILD time.

---

## The goalkeeper (6)

He is one player in a category of one, he is the whole of your defensive floor, and he is
the only position on the pitch that cannot score. Keeper Coach (+6) is the sum of what has
ever been said about him.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **Number One** | Your keeper is set to the rating of the best goalkeeper in your XI's own nations. Not a flat +N: what it is worth depends entirely on who you already picked. | cheap |
| 2 | **Understudy Called Up** | Your keeper is replaced by the best keeper in the dataset for one round, then the original returns. Loan Deal's machinery, aimed at the one position where a single player is the whole line. | cheap |
| 3 | **Sweeper** | +10 to your keeper and -2 to your defenders. He comes off his line: the floor rises and the line in front of him thins. | cheap |
| 4 | **Penalty Specialist** | Your keeper saves markedly better in a shootout. Ice Veins is about the takers; nothing has ever been about the man in goal. | cheap |
| 5 | **The Cat** | +15 to your keeper, but he is the only player any later card can touch for the rest of the run. A huge number bought with every future choice. | medium |
| 6 | **Outfield Keeper** | Your worst outfield player goes in goal and your keeper plays out. Almost always terrible, occasionally correct when your keeper is your best player and your defence is thin. | medium |

## A run that is LOSING (7)

Every card is taken at a stop, and you only reach a stop by winning. So the pool is priced
for runs that are going well, and a run that scrapes through three ties is offered exactly
what a run that has swept them is. These read the damage.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 7 | **Siege Mentality** | +2 to your XI for every goal you have conceded this run. Pays a leaky run and nothing else. | medium |
| 8 | **Nothing to Lose** | +10 to your XI if you have won no tie by more than one goal. A card only a run that has been hanging on can take. | cheap |
| 9 | **Rock Bottom** | +20 to your XI, but you skip the next stop entirely - no offer at all. A run that needs one big round and can afford to pay for it with the one after. | medium |
| 10 | **Last Legs** | The three worst players in your XI are replaced by the three best players from the squads you have already beaten. Reads `facedIds`, which nothing does. | medium |
| 11 | **Insurance Policy** | If you lose your next tie, the run continues anyway - you play the round again against a new opponent. The first card that touches the run's ENDING. | expensive |
| 12 | **Reputation** | +1 to your XI for every round you have won by exactly one goal. The mirror of Underdog's Purse: that one reads the draw, this one reads how close it was. | medium |
| 13 | **Written Off** | +8 to your XI for the rest of the run if your title odds are below 10%. Reads `domain/odds.ts`, which is already computed and shown and which no card has ever consulted. | medium |

## Temporary people (6)

`RunState.loan` exists now, and Loan Deal is its only user. Everything here is a variation
on "someone is in your XI for exactly one round", which was not expressible a day ago.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 14 | **Emergency Loan** | Borrow the best player from the squad that knocked you out in your LAST run, for one round. Reads the career, like Old Guard. | medium |
| 15 | **Ringer** | The best player from any squad in your selected World Cups joins for one round. Wildcard Legend with an expiry date, and correspondingly cheaper. | cheap |
| 16 | **Cup-Tied** | Your best player is unavailable for the next round only, and your XI gets +6 for it. A cost paid in the one currency the pool has never charged: a player. | cheap |
| 17 | **Double Loan** | Borrow their two best players for one round. Loan Deal doubled, which is a bigger swing and a bigger hole when they go back. | medium |
| 18 | **Permanent Deal** | Whoever you currently have on loan stays for good. Worth nothing unless a loan is active, which makes it a card that only exists in combination with another. | cheap |
| 19 | **Rotation** | Every player in your XI plays at his SECOND position for one round (`positions[1]`), which changes the shape, the chemistry and the scorer weights all at once. The dataset carries these and only the draft reads them. | medium |

## The stop itself (6)

Physio Table re-rolls an offer, and it is a perk. Nothing in the catalogue has ever looked
at the catalogue, and the moment of choosing is one of only four in a whole run.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 20 | **Take Two** | You keep this card AND one other from the same offer. The only card whose effect is the offer it came in. | medium |
| 21 | **Deep Bench** | Every offer for the rest of the run has one more card in it. Extra Choice as a boost rather than a perk, earned in-run rather than bought. | cheap |
| 22 | **Scout's Hunch** | Your next offer is drawn from legendaries only. Pays one round later, which is a shape no card in the pool has. | medium |
| 23 | **Buy the Rights** | Take this and one boost you do not own is unlocked into the pool permanently, for free. The first card that reaches the CAREER's Prestige economy rather than the run. | medium |
| 24 | **Second Thoughts** | Discard a boost you took earlier this run and take a fresh offer in its place. Every card in the pool only adds; nothing has ever been undoable. | medium |
| 25 | **Stubborn** | Refuse the offer entirely and take +5 to your XI instead. The card for an offer of three you do not want, which is a real and currently unanswerable situation. | cheap |

---

## Notes for whoever builds these

- **The balance harness hands every card a firing context** (`topScorerId`,
  `careerTopScorerId`, `chosenId`, `underdogRounds`). Anything conditional needs its
  condition represented there, or it measures 0.0 and goes unbanded - which is exactly how
  an over-band card gets into the pool. It caught two in round 2.
- **A card on a lever the table cannot see** (the shootout, the draw, the album, the payout,
  the offer) correctly reads 0.0 and needs its own assertion instead.
- **Check the card is not a worse copy of one already in the pool.** Loan Deal measured 4.0
  against Poach's 3.9, which at the same rarity would have made it Poach with an expiry
  date. It is a common starter and Poach is the rare precisely because of that reading.
- **Anything random must be decided when the offer is dealt**, not when the card is clicked,
  or reloading until you like the result is the optimal play.
- **Anything touching the opponent must move the bracket with it.**
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
