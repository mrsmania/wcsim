# Boost ideas that are not "strength + X"

Roadmap item 30. **Round 7**, written 2026-08-23. Fourteen cards have shipped across six
rounds; **139 ideas have been rejected**. This is the next 25.

## The method

Round 4's note said an open-ended 25 was hitting diminishing returns, and round 5 replaced
it with **named surfaces**: pick a part of the engine no card has ever touched, and write
only for that. It has worked twice, so round 7 does it again with four more.

1. **The group stage.** Three matches, a live table, a finishing position and a goal
   difference. Every card in the pool is taken at a stop, and the first stop is *after* the
   group, so nothing in the game has ever reached into it.
2. **The match itself.** The scoreline, extra time, and the shootout's own rules. Ice Veins
   is the only card that has ever touched a match rather than a rating, and it only makes
   the takers better.
3. **The dataset as history.** Nine real tournaments, real nations, real years. Prime Years
   walks `personId` and is the only card that has ever read the dataset as anything other
   than a bag of ratings.
4. **The XI as a squad.** The sim reads two averages. The XI is eleven people with shirt
   numbers, nations, ages and clubs, and almost nothing reads any of it.

## Shipped (37 cards)

golden-generation, marquee-signing, star-signing, veteran-core, attacking-masterclass,
defensive-drills, transfer, poach, wildcard, keeper-coach, squad-rotation, set-piece-drills,
catenaccio, counter-attack, underdog-spirit, galacticos, legends-reunion, prime-years,
in-form, old-guard, armband, away-days, man-marking, double-print, ice-veins, kind-draw,
second-wind, sold-out-stadium, coin-toss, mortgage-future, full-backs, loan-deal,
underdogs-purse, siege-mentality, **sponsorship**, **youth-development**, **all-or-nothing**.

## Do not re-propose (139)

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
- **Round 6:** Giant Killing, Rigged Draw, Chaos, Scouting the Field, Old Rivals, Attrition,
  Golden Boot Race, Set Piece Threat, Keeper Up For Corners, Share the Goals, The Poacher,
  Own Goals, Settled Side, Club Football, International Break, Passport Office, Same
  Generation, Bad Blood, Appearance Money, Play Up a Level, Testimonial, Agent Fees.
- **Never buildable:** anything selling INFORMATION, and anything conditioned on what the
  player picks at BUILD time.

---

## The group stage (6)

Three matches, a table, a finishing position and a goal difference - and the first boost is
picked *after* all of it, so no card in the game has ever reached into the group. These
would all have to be offered before it, which is a shape the pool does not currently have:
a card taken at kickoff rather than at a stop.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **Slow Starters** | Your first group match is played at -6 and the other two at +6. The group is survivable on two wins, so it is a real trade rather than a wash. | medium |
| 2 | **Must Not Lose** | Draws count as wins in your group only. Changes what "survive" means rather than how strong you are. | medium |
| 3 | **Group of Death** | Your three group opponents are drawn from the strongest squads in the pool, and surviving pays double XP and Prestige. The first card that makes the game harder on purpose. | medium |
| 4 | **Easy Draw** | One of your three group opponents is replaced by a weaker side. Kind Draw for the stage Kind Draw cannot reach. | cheap |
| 5 | **Top of the Group** | +8 for the rest of the run if you finish the group first. A condition decided by three matches you have not yet played. | medium |
| 6 | **Dead Rubber** | Your third group match is skipped and counted as a 1-0 win. Removes the variance of a match you may not need. | medium |

## The match itself (7)

Ice Veins is the only card in the game that touches a match rather than a rating, and all
it does is make the takers better. The scoreline, extra time and the shootout's own rules
are three levers with one card between them.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 7 | **The Away Goal** | If your next tie is drawn, you win it. The oldest tiebreak in the game, and the only card that could decide a tie without touching a rating. | expensive |
| 8 | **Park the Bus** | Your next tie is capped at one goal each. Turns a match you would probably lose into a shootout you might win. | medium |
| 9 | **End to End** | Both sides score at double their usual rate in your next tie. Variance as a weapon: it favours the underdog because it widens the distribution. | medium |
| 10 | **Extra Time** | Your XI gets +10 from the 90th minute on. Nothing in most ties and decisive in the ones that go long. | medium |
| 11 | **Sudden Death** | Your next shootout is decided by the first pair of kicks. Removes four rounds of variance from a coin flip you were going to take anyway. | cheap |
| 12 | **Twelve Yards** | Your keeper faces one fewer kick in a shootout, and your takers one more. A one-kick head start rather than a rating. | medium |
| 13 | **Late Show** | Any goal you concede after the 80th minute is disallowed. The first card that reads the clock a match already keeps. | expensive |

## The dataset as history (6)

Nine real tournaments with real nations and real years. Prime Years walks `personId` and is
the only card that has ever read the dataset as anything but a bag of ratings.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 14 | **Host Nation** | Every player from the nation that hosted his tournament gets +8. A real historical fact the dataset already implies and nothing reads. | cheap |
| 15 | **World Champions** | Every player who actually won the World Cup he is drafted from gets +6. Rewards knowing the history rather than the ratings. | medium |
| 16 | **The Class of '98** | Name a tournament: everyone in your XI from it gets +10, and everyone else -2. A question card aimed at the dataset. | medium |
| 17 | **Time Zones** | Your XI is replaced, man for man, by the same shirt numbers from a single randomly chosen tournament. The most disruptive card in any round so far. | medium |
| 18 | **Retro Kit** | The oldest player in your XI is replaced by the best player from his own tournament. Reads a year, not a rating. | cheap |
| 19 | **Debutants** | Every player from a nation appearing in only one World Cup in the dataset gets +12. Pays a genuinely obscure fact about the data. | cheap |

## The XI as a squad (6)

The sim reads two averages. The XI is eleven people with shirt numbers, nations, positions
and tournaments, and beyond chemistry almost nothing reads any of it.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 20 | **Squad Numbers** | Every player wearing 1 to 11 gets +6. A fact the dataset carries, the roster sheet shows, and nothing has ever used. | cheap |
| 21 | **The Spine** | +10 to whoever wears 1, 5, 9 and 10, if anyone does. Squad Numbers with the same idea sharpened to the four famous shirts. | cheap |
| 22 | **Captain's Nation** | +4 to every player sharing a nation with your highest-rated player. A condition the XI decides, not the player - a roster boost can move it. | cheap |
| 23 | **Odd One Out** | The only player in your XI from his nation gets +15. Rewards exactly the shape chemistry punishes, so the two pull against each other. | cheap |
| 24 | **Understrength** | Play the next round with ten men, and the ten get +12 each. The first card that changes how many players you have. | medium |
| 25 | **Two Keepers** | Your worst outfield player is replaced by the best available goalkeeper, playing outfield at his own rating. Absurd, legal, and occasionally correct. | medium |

---

## Notes for whoever builds these

- **The balance harness hands every card a firing context** (`topScorerId`,
  `careerTopScorerId`, `chosenId`, `underdogRounds`, `goalsConceded`). Anything conditional
  needs its condition represented there, or it measures 0.0 and goes unbanded - which is
  exactly how an over-band card gets into the pool. It caught two in round 2.
- **A card on a lever the table cannot see** (the shootout, the draw, the album, the payout,
  the offer, the tree, the scorer weighting, the clock) correctly reads 0.0 and needs its own
  assertion instead. All three round-6 cards are of this kind.
- **Check the card is not a worse copy of one already in the pool.** Loan Deal measured 4.0
  against Poach's 3.9, which at the same rarity would have made it Poach with an expiry
  date. It is a common starter and Poach is the rare precisely because of that reading.
- **A card that reads a run's own numbers must be sized for the extreme, not the average.**
  Siege Mentality is +1 a goal rather than +2 because at +2 a deliberately poor defence
  would have been worth building.
- **A card that pays the CAREER goes through `applyRunResult`'s one payout block**, where
  the four existing ones compose (a "pays nothing" test, a multiplier, then the XP and
  Prestige halves). Anything that has to outlive the run belongs on `CareerStats`, never on
  `CareerState`: `save_career` merges `stats` as jsonb and silently drops top-level keys it
  does not know, which is why `bonusStartBoosts` needed no SQL.
- **The group stage cards need a shape the pool does not have**: a card taken at KICKOFF
  rather than at a stop, since the first stop comes after the group. Scout Network's starter
  boosts are the closest existing mechanism.
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
