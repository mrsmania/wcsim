# Boost ideas that are not "strength + X"

Roadmap item 30. **Round 2**, written 2026-08-22 after the first 25 were reviewed: three
were built (Away Days, Man-Marking, Double Print) and **the other 22 were discarded**. This
file is the next 25, drawn from angles the first round did not look at.

## Do not re-propose

The following were considered and rejected, either by the owner or by a build that failed.
They are listed so the same ideas do not come back a third time.

- **From item 29 (mechanisms, rejected):** wagering the run's payout, choosing your own path
  through the bracket, committing to a tactic before the draw, a squad of 14 instead of an XI.
- **From this file's first round (cards, discarded):** Nervy Spot-Kicks, Rotation Forced,
  Seeded, Continental Draw, Upset Special, Rematch, Bye, Straight to Penalties, Golden Goal,
  Replay, Fast Starters, Talisman, Nerves of Steel, Smash and Grab, Team Talk, Naturalised,
  Clique, Sponsor Deal, Youth Policy, Insurance, Legacy, Panini Deal, Sell the Star,
  Burn a Sticker.
- **Never buildable:** anything that sells INFORMATION (the game shows everything), and
  anything conditioned on what the player picks at BUILD time (the Chemistry Catalyst trap).

## What is untapped after round one

Round one worked through the *simulation's* levers. This round goes at three surfaces the
game already has and no card has ever read:

1. **The dataset's own structure.** Jersey numbers, `personId` linking the same human across
   tournaments, real squad-mates sharing a `squadId`, nations, eras. All of it is loaded and
   none of it is a card.
2. **The run's own history.** `run.history` holds every round's scoreline, `RunTally` holds
   appearances and goals per player, the group holds a finishing position and a goal
   difference. A card can read what already happened.
3. **The career reaching back in.** The cabinet knows your all-time top scorer, the runs you
   have won, the challenges you have not completed. None of it touches a run.

`cheap` = a catalogue entry, maybe a `RunModifier` case. `medium` = a new field something
reads. `hard` = the match sim changes shape.

---

## The dataset's hidden structure (5)

Every one of these is already in `squads.ts` and has never been used for anything.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **The Number Ten** | +10 to whoever wears number 10 in your XI, whatever his rating. Jersey numbers are in the dataset, shown on every roster, and read by nothing. Sometimes your 10 is your star and it is a big card; sometimes he is a squad player and it is nearly nothing - decided by a draft you already made, but not one you could have aimed. | cheap |
| 2 | **Prime Years** | Each player is replaced by his own best version from any tournament - Ronaldo '02 for Ronaldo '06. `personId` already links them and nothing has ever walked that link. The XI keeps its identity and gets better, which is a different feeling from being handed strangers. | medium |
| 3 | **Club Connection** | Add the highest-rated player who shared a real squad with someone in your XI. Not a random legend - his actual team-mate. | medium |
| 4 | **Compatriots** | +6 to every player who shares a nation with at least one other in your XI. Rewards a draft you did not plan for; a scattered XI gets nothing at all. | cheap |
| 5 | **Golden Era** | +8 to every player from the single most-represented tournament year in your XI. Same shape, keyed on the year instead. | cheap |

## The match's shape (5)

The sim is 90 minutes of Poisson for both sides. Changing its *shape* rather than its inputs
is untouched.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 6 | **Open Game** | Both sides get +6 attack for this tie. More goals in both directions - which is what an underdog wants, because variance is the underdog's friend, and what a favourite should refuse. | medium |
| 7 | **Attritional** | Both sides get +6 defence. The mirror: a card the favourite wants. The pair is the decision. | medium |
| 8 | **Red Card** | Your next opponent plays the last third of the tie a man down: their strength drops sharply, but only after the 60th minute. | hard |
| 9 | **Home Crowd** | This tie is played at home. The sim has no home advantage at all today, so this invents one - a lever that could then be reused for the whole tournament. | medium |
| 10 | **Two Legs** | Your next tie is played over two matches on aggregate. Halves the variance, which favours whoever is better. | hard |

## What already happened (5)

`run.history` and `RunTally` are written every round and read only by the review screens.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 11 | **Form Guide** | +2 for every goal your XI scored in the previous round. A blowout pays; a nervy 1-0 barely does. | cheap |
| 12 | **Backs to the Wall** | +8, but only if you conceded first in your last match. A comeback card that a comfortable run cannot use. | medium |
| 13 | **Group Winners** | +5 if you topped your group, nothing if you scraped through second. Pays off a result you already earned and had no other use for. | cheap |
| 14 | **In Form** | +12 to whoever has scored most for you this run. Names a player the run itself chose. | cheap |
| 15 | **Ever Present** | +4 to every player who has played every match so far - which is all of them today, and becomes a real condition the moment a squad or an injury card exists. | cheap |

## The album as a resource (4)

A collection the player has been building across runs, which no run has ever been able to
reach into.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 16 | **Call Up a Legend** | Add any player whose sticker you already own. The reward for collecting stops being cosmetic, and a long-running album makes this card better - progression that is *earned* rather than bought. | medium |
| 17 | **Swap Shop** | Trade two duplicates from your album for a permanent +5 to the XI. The duplicate pool exists and does nothing between trades. | medium |
| 18 | **Complete the Set** | +3 for every sticker you own from your next opponent's squad. You have been unknowingly preparing for this tie for weeks. | medium |
| 19 | **Collector's Run** | Every player in your final XI banks as a sticker, whatever his rating - but the run pays half XP. Turns a run you are losing into a run worth finishing. | medium |

## The career reaching in (4)

The cabinet already records all of this and nothing reads it back.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 20 | **Old Guard** | Add your career's all-time top scorer to this XI. Different for every player and better the longer they have played. | medium |
| 21 | **Title Defence** | Add one player from the XI that won your last cup. Meaningless on a first career, evocative on a tenth. | medium |
| 22 | **Unfinished Business** | Names one challenge you have not completed; complete it and the run pays double Prestige. A card that hands you an objective rather than a number. | medium |
| 23 | **Step Up** | Play the next round one Ascension tier higher: a harder tie, and the whole run's reward multiplier rises. Opting into difficulty for pay, mid-run. | medium |

## Role and identity (2)

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 24 | **The Armband** | Nominate a captain: +8 to him, and +1 to everyone else. A small choice that is yours rather than the card's, and the first card that asks the player a question at pick time. | medium |
| 25 | **Sweeper Keeper** | Your goalkeeper counts as an outfield player for the attack average, and your worst defender covers in goal. A deliberate distortion of the two numbers the sim reads, using players you already have. | medium |

---

## Notes for whoever builds these

Carried from the three cards already shipped, each of which cost a build to learn:

- **The balance table only measures attack and defence.** A card on any other lever reads
  0.0 there, which is correct - it means the card is free against the rarity bands and needs
  its own assertion instead. Ice Veins, Kind Draw, Away Days and Double Print are the worked
  examples.
- **Anything random must be decided when the offer is dealt, not when the card is clicked**,
  or reloading until you like the result is the optimal play. The Coin Toss dodges this by
  being *derived* (`coinFor`); a card that cannot be derived needs its roll stored on the run.
- **Anything that touches the opponent has to move the bracket with it.** `run.nextOpponent`
  is what the tie reads; the tree is what the player sees. Away Days and Kind Draw both move
  both.
- **A card that asks the player a question at pick time** (#24 is the first) needs a UI that
  does not exist yet: the offer picks a card and commits immediately. Budget for that.
- **`finish_run` caps a run at 12 banked ids** and rolls the whole bank back over it, which
  for a signed-in player is the blocking unreachable screen. Anything that adds stickers
  (#16, #19) has to stay under `BANK_CAP`.
