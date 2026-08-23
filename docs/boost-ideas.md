# 25 boost ideas that are not "strength + X"

Written 2026-08-22, replacing roadmap item 29 (closed: its six card-shaped ideas shipped,
its four mechanism-shaped ones were rejected by the owner).

**The brief.** Every card in the pool for most of this project's life read "+N to some
subset of the XI". Six cards on 2026-08-22 broke out of that. This is the next 25, and none
of them is *only* a rating bump.

## The levers, and which are still untouched

Everything below is a decision on one of these. It is a short list, which is why the same
few ideas keep recurring - and why the unused rows are where the interesting cards are.

| Lever | Where it lives | Used today? |
| --- | --- | --- |
| your attack / defence average | `match.ts`, the Poisson sim | 17 cards |
| the **opponent's** strength | same numbers, other side | **nothing** |
| the shootout | `penTakersFrom`, `penProb` | Ice Veins |
| **how a tie is decided** (reg / aet / pens) | `resolveKoTie` | **nothing** |
| **goal minutes** | `MatchEvent.minute` | **nothing** |
| **who is credited with a goal** | `scorerPool`, weighted by position x rating | **nothing** |
| the opponent draw | `drawOpponent(faced, pool, slope)` | Kind Draw |
| **the rest of the bracket** | the other 14 teams auto-resolve | **nothing** |
| chemistry | `chemistry.ts`, 6 named categories, capped at 6 | **nothing** |
| roster identity | `RunState.roster` | 4 cards |
| the run's payout | `applyRunResult` | Mortgage the Future |
| **the sticker album** | banked at run end by rating tier | **nothing** |
| **the offer itself** | `offerBoons`, `rerollsLeft` | perks only, no card |

**Build cost** below is honest: `cheap` = a catalogue entry and maybe a `RunModifier` case;
`medium` = a new field the sim or the bracket reads; `hard` = the sim has to change shape.

---

## The opponent, not you (4)

Weakening them is not the same card as strengthening yourself, because it does not help you
in any *other* round, and it targets one of their two numbers rather than both of yours.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 1 | **Away Days** | Your next opponent loses 5 defence for that tie only. Good when you need goals, useless when you need a clean sheet - the mirror decision to every card you own. | cheap |
| 2 | **Man-Marking** | Your next opponent's best player is removed from their strength for that tie. Worth most against a top-heavy side, nearly nothing against a flat one - so its value is a fact about *them*, readable before you choose. | medium |
| 3 | **Nervy Spot-Kicks** | Your next opponent converts penalties 10% worse. Does nothing in 80% of ties. Pairs with Ice Veins into an actual shootout build. | medium |
| 4 | **Rotation Forced** | Your next opponent fields their second XI (players 12 and below). A big swing against a nation with a deep squad, small against a thin one. | medium |

## The draw and the rest of the tree (5)

The other 14 teams resolve themselves from their ratings and nothing has ever touched them.
Your *path* is a whole axis nobody has played on.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 5 | **Seeded** | You cannot be drawn against a team rated above 85 for the rest of the run. Caps your worst case rather than raising your average. | medium |
| 6 | **Continental Draw** | Your next opponent is drawn from one confederation. Combines with a squad built from that continent - and against it. | medium |
| 7 | **Upset Special** | The strongest team in the *other* half of the bracket loses their next tie. Does nothing for this round and may decide the Final. | medium |
| 8 | **Rematch** | Your next opponent is a team you already beat this run. You know exactly what you are facing, which is worth more the better the run has gone. | medium |
| 9 | **Bye** | Skip the next round entirely - advance without playing. Legendary. No rating card can do this, and it is strongest exactly when you are weakest. | medium |

## How the tie is decided (3)

`resolveKoTie` runs regulation, then extra time, then penalties. Which of those a tie ends
in is a lever, and no card has ever pulled it.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 10 | **Straight to Penalties** | A draw after 90 goes to the shootout, skipping extra time. Extra time favours the stronger side, so this is a card an underdog wants and a favourite refuses. | medium |
| 11 | **Golden Goal** | The first goal in extra time ends the tie. Variance, and a period ends abruptly rather than being played out. | medium |
| 12 | **Replay** | If you lose your next tie, it is replayed once. A second chance, not a bigger number - and the only card in the game that undoes a result. | medium |

## When goals happen, and who scores them (4)

`MatchEvent` already carries a minute and a scorer's name. Both are decided after the
scoreline and neither has ever been touched, so cards here change the *story* of a match
without touching the balance table at all.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 13 | **Fast Starters** | Your first goal in every match lands before the 20th minute. Pure re-timing, zero rating cost, and it completes several existing challenges. | cheap |
| 14 | **Talisman** | Nominate a player: every goal you score is credited to him. Costs nothing and feeds the cabinet's top-scorer board and the album. A vanity card, and vanity is a motivation the game does not currently serve. | cheap |
| 15 | **Nerves of Steel** | You concede no goals after the 80th minute - a late equaliser is simply deleted. Changes results without changing strength, and only in the games that were already close. | medium |
| 16 | **Smash and Grab** | Your goals are all re-timed into the last 15 minutes. Flavour, plus it is the exact opposite of Fast Starters, so an offer holding both is a real fork. | cheap |

## Chemistry (3)

Six named categories, capped at 6, feeding the overall rating - and **not one card touches
it**. It is the single largest untouched surface in the game.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 17 | **Team Talk** | Chemistry counts as maxed for the rest of the run. Worth a lot to a scattered XI and nothing to a cohesive one, so the better you drafted the worse this card is. | cheap |
| 18 | **Naturalised** | Every player counts as the same nation for chemistry. Fixes one category outright. | cheap |
| 19 | **Clique** | +3 chemistry, but you lose the "in position" category entirely. Two chemistry numbers moving opposite ways, both visible in the box score before you choose. | cheap |

## The payout and the career (4)

Mortgage the Future proved this axis works. It has room for four more.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 20 | **Sponsor Deal** | +50% Prestige, -50% XP. You buy sooner and level slower - and which you want depends on whether you are saving for a perk tier or chasing a level gate. | cheap |
| 21 | **Youth Policy** | Extra XP for every player under 75 in your final XI. Rewards the run you were already having rather than changing it. | cheap |
| 22 | **Insurance** | If the run ends before the Final, it pays as though you had gone one round further. Softens a loss without making you likelier to win. | cheap |
| 23 | **Legacy** | One effect from this run carries into your *next* run. The only card whose value lands outside the run entirely. | medium |

## The album (2)

A persistent collection the run can reach, and never does.

| # | Card | What it does | Cost |
| --- | --- | --- | --- |
| 24 | **Panini Deal** | Your whole final XI banks as stickers, regardless of rating. Turns a weak XI into a collection run - a completely different reason to keep playing a losing run out. | medium |
| 25 | **Double Print** | Win the cup and pick two rewards instead of one. | cheap |

---

## Carried over from item 29

Three ideas outlived that item and belong here rather than in a closed one:

- **Sell the Star** - your best player leaves, the other ten get +4. The first card whose
  value can be NEGATIVE, decided by a shape you can see on your own team sheet. `cheap`.
- **Burn a Sticker** - give up a card you own, permanently, for a large boost this run. The
  only idea where the cost outlives the run. Prototype it as one card, not a system. `medium`.
- **Show the chemistry delta** - not a card at all, a UI change: any card that moves rating
  and chemistry in opposite directions should show both numbers. Poach already does this by
  accident. `cheap`.

## Notes for whoever builds these

- **The balance table only measures attack and defence.** A card on any other lever reads as
  0.0 there, which is correct and not a bug - it means the card is free against the rarity
  bands and needs its own assertion instead. Ice Veins is the worked example.
- **Anything random must be decided when the offer is dealt, not when the card is clicked.**
  Reloading until you like the result is otherwise the optimal way to play. The Coin Toss
  dodges this by being *derived* rather than rolled (`coinFor`); a card that cannot be
  derived needs its roll stored on the run.
- **Anything that touches the opponent has to move the tree with it**, the way Kind Draw
  does: `run.nextOpponent` is what the tie reads, but the bracket is what the player sees,
  and `prepareKnockoutRound` splices by opponent id.
- **A card conditioned on something the player controls at BUILD time is a trap.** That is
  what killed Chemistry Catalyst and what "Homegrown"-style cards keep re-inventing. Draw
  conditions are fine; nation conditions are not.
