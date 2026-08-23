# Boost ideas that are not "strength + X"

Roadmap item 30. **Round 3**, written 2026-08-22. Round 1 shipped 3 of 25; round 2 shipped 4
of 25 (Prime Years, In Form, Old Guard, The Armband). This is the next 25.

## The new seam round 2 opened

**The Armband is the first card that asks a question**, and building it left behind
machinery worth reusing: `Boon.choice` parks `RunState.pendingChoice` instead of committing
the stop, and `resolveChoice` applies the card once the player answers. A reload lands back
on the question.

That unlocks a family nothing else could express: a card whose effect the *player* aims. The
first five ideas below are all of that shape, and they are cheap now in a way they were not
yesterday.

## Do not re-propose

Considered and rejected or discarded. Three rounds in, this list is the most useful part of
the document.

- **Mechanisms (item 29, rejected by the owner):** wagering the payout, choosing your own
  path through the bracket, committing to a tactic before the draw, a squad of 14.
- **Round 1 (discarded):** Nervy Spot-Kicks, Rotation Forced, Seeded, Continental Draw, Upset
  Special, Rematch, Bye, Straight to Penalties, Golden Goal, Replay, Fast Starters, Talisman,
  Nerves of Steel, Smash and Grab, Team Talk, Naturalised, Clique, Sponsor Deal, Youth Policy,
  Insurance, Legacy, Panini Deal, Sell the Star, Burn a Sticker.
- **Round 2 (discarded):** The Number Ten, Club Connection, Compatriots, Golden Era, Open
  Game, Attritional, Red Card, Home Crowd, Two Legs, Form Guide, Backs to the Wall, Group
  Winners, Ever Present, Call Up a Legend, Swap Shop, Complete the Set, Collector's Run,
  Title Defence, Unfinished Business, Step Up, Sweeper Keeper.
- **Never buildable:** anything selling INFORMATION (the game shows everything), and anything
  conditioned on what the player picks at BUILD time (the Chemistry Catalyst trap).

`cheap` = a catalogue entry, maybe a `RunModifier` case. `medium` = a new field something
reads. `hard` = the sim or the draft changes shape.

---

## Cards that ask a question (5)

The seam The Armband opened. Each of these hands the player the aim rather than the number.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **Understudy** | Name a player; he is replaced by the best player in the whole dataset who plays his position and is rated below him. A guaranteed upgrade you *aim*, rather than one the card picks. | cheap |
| 2 | **Specialist** | Name a position; every player in your XI who can play it gets +6. Rewards knowing your own squad's secondary positions, which the draft already shows you. | cheap |
| 3 | **Scapegoat** | Name a player; he leaves the XI and the other ten get +3. You choose who is expendable, which is a harder question than it sounds on a balanced side. | cheap |
| 4 | **Mentor** | Name two players; the weaker rises halfway to the stronger. The only card where the size of the effect is entirely the player's doing. | medium |
| 5 | **Target Man** | Name a player; +4 to him, and he is credited with far more of your goals. Aims the record books as well as the rating. | medium |

## Conditional on how this round goes (4)

Nothing in the pool is contingent on a result that has not happened yet.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 6 | **Momentum** | Win this tie and the XI keeps +4 for the rest of the run. Nothing if you lose - but if you lose, there is no rest of the run. | medium |
| 7 | **Clean Sheet Bonus** | Keep a clean sheet in this tie and your defence keeps +5 permanently. | medium |
| 8 | **Snowball** | +1 for every round already survived, this round only. Weak in the Round of 16, strong in the Final - the opposite shape to everything in the pool. | cheap |
| 9 | **Cup Fever** | +2 for every round still to come. Strong early, nothing in the Final. Snowball's mirror, and an offer holding both is a real fork. | cheap |

## The offer itself (3)

The pool has never contained a card about the pool.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 10 | **Deja Vu** | Take the same boost you took last round, again. Its value is entirely what you chose before. | medium |
| 11 | **Second Opinion** | Skip this offer and take next round's instead, seeing it now. Trades a boost you have for a boost you might prefer. | medium |
| 12 | **Wildcard Slot** | Every later offer contains at least one legendary. Changes what the rest of the run will look like rather than the XI. | medium |

## Formation and shape (3)

The XI has a formation and a style, and no card has ever touched either.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 13 | **Switch Formation** | Change formation mid-run; players re-slot into the new shape. Chemistry's "in position" count moves with it, so it is two decisions in one. | hard |
| 14 | **Total Football** | Every player counts as in-position for chemistry, whatever slot he fills. | cheap |
| 15 | **False Nine** | Your striker counts toward the defence average and your holding midfielder toward the attack. A deliberate distortion of the two numbers the sim reads, using players you already have. | medium |

## The dataset's extremes (4)

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 16 | **The Veteran** | +10 to the player from the oldest tournament in your XI. | cheap |
| 17 | **The Debutant** | +10 to the player from the newest. The Veteran's mirror; which is worth more depends on a draft you did not aim. | cheap |
| 18 | **Squad Number One** | +8 to whoever wears the lowest shirt number. Numbers are in the dataset, printed on every roster, and read by nothing. | cheap |
| 19 | **Journeymen** | +1 for every DISTINCT squad represented in your XI, to everyone. The exact inverse of the chemistry bonus, so the two cards pull against each other. | cheap |

## Who you are playing (3)

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 20 | **Continental Rivals** | +5 when your opponent is from another confederation, nothing when they are neighbours. Keyed on the draw, so nobody controls it. | cheap |
| 21 | **Bogey Team** | +6 against a nation that has knocked you out before in this career. Needs the career to remember who beat it, which it does not yet. | hard |
| 22 | **Class of Their Own** | +4 for every player in your XI older, by tournament year, than every player in theirs. Experience against youth, decided by two squads neither of you chose. | medium |

## Undoing things (3)

Every card so far only adds. Nothing removes.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 23 | **Physio** | Remove one negative effect currently on your XI. Worthless unless you took a curse - and the pool now has several. | cheap |
| 24 | **Fresh Start** | Clear every effect on the XI, good and bad, then +3 to everyone. A reset that is worth taking only when the run has gone wrong. | cheap |
| 25 | **Contract Rebel** | Your worst player walks out. The XI plays with ten, and the ten get +5. Genuinely two-sided: a thin squad cannot afford it. | medium |

---

## Notes for whoever builds these

- **The balance harness hands every card a firing context** (`topScorerId`,
  `careerTopScorerId`, `chosenId`). Anything conditional needs its condition represented
  there, or it measures 0.0 and goes unbanded - which is exactly how an over-band card gets
  into the pool. It caught two in round 2.
- **A card on a lever the table cannot see** (the shootout, the draw, the album, the payout)
  correctly reads 0.0 and needs its own assertion instead.
- **Anything random must be decided when the offer is dealt**, not when the card is clicked,
  or reloading until you like the result is the optimal play.
- **Anything touching the opponent must move the bracket with it.**
- **A card that swaps more than one player must tag them all** in `boostedIds`, or the
  arrivals bank stickers they were handed rather than drafted. Prime Years is why
  `Granted.incomingIds` is a list.
- **A card that asks a question** parks `pendingChoice` and must not commit the stop. Give it
  no cancel: backing out prices the card against the whole XI and then takes another, which
  is a free re-roll of the offer.
