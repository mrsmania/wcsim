# Meaningful decisions in a Cup Run

Written 2026-08-22, after roadmap item 04 was built, played and **rolled back in full**.

> **First six cards SHIPPED 2026-08-22.** Ice Veins, Kind Draw, Second Wind, Sold Out
> Stadium, The Coin Toss and Mortgage the Future are in the game, along with the removal of
> Glass Cannon and Familiar Foes and three retunes (Marquee Signing now targets the worst
> player, Transfer demands at least +8, Catenaccio's description lost its tagline). The
> catalogue is 23 cards.
>
> **CLOSED 2026-08-22, and this file is now a record.** The six cards shipped; the four
> MECHANISM ideas below - A (wager the payout), B (choose your own path), D (commit before
> the draw) and F (a squad of 14) - were **rejected by the owner**. Each would have changed
> the shape of a stop rather than its contents, and none is wanted. Do not re-propose them
> without a new reason.
>
> Three ideas outlived the item and moved to **`docs/boost-ideas.md`** (roadmap item 30),
> which pursues the same goal entirely through cards: C (Sell the Star), E (Burn a Sticker)
> and G (show the chemistry delta). H shipped as Ice Veins.

**Note on what exists.** Item 04's **effect ledger was kept** when the rest of it was rolled
back (`domain/effects.ts`): a run holds `roster` + `effects` and derives `xi`, so what a boost
did is recorded rather than baked in, and `RunEffect.expiresAfter` is wired though nothing
sets it yet. That matters to several ideas below - anything TEMPORARY, and anything that wants
to show the player what a boost did, is a caller change rather than a redesign. What is gone
is Form, the shop and event nodes, and the `runNodes` flag.

## What went wrong, stated precisely

The problem was never that a run had too few node KINDS. It is that **all 19 boosts sit on
one axis.** Every one of them is "+N to some subset of the XI", so any offer of three
reduces to arithmetic: work out which moves your attack and defence averages most, take it.
That is a calculation, not a decision.

Form did not fix it and could not. A currency needs enough transactions to be worth
reasoning about, and **a World Cup has seven matches** (three group, four knockout). Earning
Form in the semi-final is close to meaningless - one stop is left to spend it at and no time
to plan around it. That is a fact about the format.

So the test a new decision has to pass is not "is it interesting". It is:

1. **Incomparable options.** No common scale to rank them on. The moment two options are
   both "+N", the bigger N wins and the decision evaporates.
2. **The right answer depends on YOUR situation** - your XI's shape, the opponent drawn, how
   far the run has got, what the odds readout says. Two players facing the same card should
   correctly choose differently.
3. **It costs something you feel.** Not a resource invented for the purpose; something the
   player already cares about.

And one hard-won constraint, from the Scouting Report that was deleted:

4. **Nothing can sell INFORMATION.** This game shows the player everything - the full
   bracket, the title odds, every rating. There is no fog to lift.

## The axes the engine actually has

Worth listing, because every idea below is "a decision on an axis that is not the rating
average", and the list is short:

| Axis | Where it lives | Used by a boost today? |
| --- | --- | --- |
| attack / defence average | `match.ts`, the Poisson sim | **all 19** |
| chemistry | `chemistry.ts`, capped at 6, added to overall | no |
| the shootout | `penTakersFrom`, `penProb` (linear in rating) | no |
| the opponent draw | `drawOpponent(faced, pool, slope)` | Poach + Familiar Foes read it, none CHANGE it |
| roster identity | `RunState.roster` (the ledger's base) | 4 roster boosts |
| the run's payout | `applyRunResult`: `score x ascensionAt().rewardMult` | no |
| the sticker album | banked at run end | no |

The last two are the interesting ones, because **a decision about the payout needs no new
power at all** - which means no balance risk against the boost bands, and no new currency.

---

## A. Wager the payout (recommended first) - REJECTED

**The idea.** After a round, offer a bet on the rest of the run.

- **Double or Nothing** - from here on the run pays **2x** XP and Prestige if you win the
  cup, and **nothing at all** if you do not.
- **Take the money** - bank **half** the payout now, guaranteed, whatever happens next.
- **Decline.**

**Why it passes the test.** The options are genuinely incomparable: one is variance, one is
certainty, one is neither. The right answer depends entirely on your title odds - which
`domain/odds.ts` already computes and `RunXiPanel` already displays, so the player has the
exact number the decision turns on. And it costs something real without inventing a
currency.

**Why it is cheap.** It touches no rating, no roster, no chemistry. One field on `RunState`
(a payout multiplier, plus a "banked early" amount) read by `applyRunResult`, which already
multiplies by `ascensionAt(run.ascension).rewardMult` and is the single place a run's reward
is computed. No new balance surface: `npm run checks` measures boost POWER, and this has
none.

**The trap to design around.** It must be offered **after** the odds are visible and
**before** the tie is decided, or it is not a bet. And it should not stack with Ascension's
multiplier without thought - two multipliers on the same number compound faster than they
read.

## B. Choose your own path - REJECTED

**The idea.** Instead of the bracket handing you an opponent, choose one of three - and the
stronger the pick, the larger the run's reward multiplier.

**Why it passes.** Safe path against rich path is the oldest real decision there is, and it
is different every run because the field is different. It also gives the bracket, which is
currently scenery you scroll past, something to do.

**Why it is cheap-ish.** `bracketSeedFromGroup` + `buildBracket` already build the field and
`drawOpponent` already takes a slope. The work is letting the user's own seed be placed
rather than fixed, and keeping the tree honest afterwards - `advanceBracket` splices the
user's result in by index, so the invariant that **the user is game 0 of their round** has
to survive.

## C. Sell the star - moved to item 30

**The idea.** "Your best player is sold. The other ten get +4."

**Why it passes.** Concentration against spread, and the right answer depends on a shape the
player can see: a top-heavy XI (one 95 and ten 70s) loses more than a flat one does. It is
also the first boost whose value can be NEGATIVE for some XIs, which is what makes it a
decision rather than a gift.

**Note.** It could ship as a plain boost with no node machinery at all: the ledger already
takes a roster change and a rating plan, so the whole card is a `BoonEffect` and a catalogue
entry.

## D. Commit before the draw - REJECTED

**The idea.** Pick a tactic - attacking (+4 attack, -3 defence), balanced, defensive (the
mirror) - **before** the next opponent is revealed.

**Why it passes.** A pure commitment under uncertainty, and the sim reads exactly these two
numbers so the effect is real rather than flavour. It is the cheapest way to make Catenaccio
and Glass Cannon, which already exist as cards, into a decision instead of a calculation:
today you take them knowing who you face.

**The trap.** The opponent is currently decided in `decideKoRound` **with** everything else,
so "before the draw" means holding the reveal, not re-ordering the dice. The stored decision
must not move, or reloading re-rolls your opponent after you have committed.

## E. Burn a sticker - moved to item 30

**The idea.** Give up a sticker you own, permanently, for a large boost this run.

**Why it passes.** It costs something the player demonstrably cares about, which no invented
currency can. It is the only idea here where the cost outlives the run.

**Why it is risky.** The album is the game's other progression, and letting a run eat it may
simply feel bad rather than tense. It also interacts with the owned-sticker price discount
in the market. Worth prototyping small - one card, high cost - rather than as a node.

## F. A squad, not an XI (the big one) - REJECTED

**The idea.** Draft **14**, field 11 each round.

**Why it is the strongest long-term answer.** It makes every round a decision with no number
to rank, and it unlocks a whole family of them that are currently impossible:

- an injury or suspension forces a real replacement choice;
- a strong-attacking opponent makes your defensive spare worth fielding;
- fatigue could force rotation across a tournament rather than being an event card.

**Why it is not first.** It touches the draft, the pitch, the persisted `RunState`, the
challenge catalogue's `shape` record and the sticker banking rule (which XI is banked - the
squad or the eleven who played?). It is a project, not a card. But every other idea here
gets better if it lands.

## G. Two axes moving opposite ways - moved to item 30

**The idea.** Any option that moves **rating one way and chemistry the other**, with both
deltas shown.

**Why it passes.** Chemistry is the one second axis the engine already reads and no boost
touches. "Swap in a 92 from a nation nobody else in your XI plays for" is +rating and
-chemistry, and which side wins depends on how cohesive the XI already is - visible, in the
box score, before the choice.

**Note.** Poach already does this by accident. Making the chemistry delta explicit in the
card would turn an existing boost into an existing decision, at near-zero cost.

## H. The shootout - SHIPPED as Ice Veins

Not a decision on its own, but the cleanest unused axis: `penTakersFrom` sorts takers by
rating and `penProb` is linear in it. A card that helps **only in a shootout** does nothing
in most ties and wins the rest - genuinely orthogonal to every existing boost, and free
against the balance bands because it moves neither average.

---

---

# Cards carried over from item 04

Item 04's plan came with a content catalogue (its Appendix A) and the plan is now filed as a
record of a failed attempt, so anything still usable had to move here or it would be lost.

Most of that catalogue died with Form: every shop item was priced in it, and four of the five
events paid or charged it. **These ten did not** - they are plain boosts, buildable today with
no currency and no node machinery. The ideas above (A to H) are MECHANISMS; this is a list of
individual cards.

## Still buildable, and worth it

**SHIPPED 2026-08-22**, all but Sell the Star. What follows is the design note each was
built from; `CLAUDE.md` has what the code actually does.

| Card | What it does | Why it is not just another "+N" |
| --- | --- | --- |
| **Ice Veins** | +8 to your five best players, **for penalty shootouts only** | The pick of the list. Nothing in the existing 19 touches the shootout, and the model is already there (takers are sorted by rating, and scoring chance is linear in it). It does nothing in most ties and wins the rest, which no rating card can say. |
| **Kind Draw** | Re-draw your next opponent, keep the weaker | Acts on the DRAW, which no card does today - two read it, none change it. Free against the balance bands because it moves neither average. |
| **Dressing Room** | +2 team chemistry, capped as chemistry always is | The only card on the chemistry axis, and it has a lovely inversion: the better you built your XI, the closer to the cap you already are, so **the more cohesive your team the worse this card is**. |
| **Rotation Policy** | +6 to your three weakest, -2 to your three best | Compresses the squad. Strong for a lopsided budget build, weak for a national side - so its value depends on a shape you can see. |
| **Second Wind** | +5 to the XI, **for one round only** | The obvious first customer for the ledger's expiry, which is wired and waiting. A big number you have to spend at the right moment rather than bank. |
| **Sold Out Stadium** | +6 now, **-6 the round after** | Borrow from your future self. Take it in the semi-final and you play the Final weakened. |
| **Devil's Bargain** | +10 to your attack, -6 to your defence | Glass Cannon turned up. Already-proven shape, and it gives points back so it is allowed to exceed its band. |
| **Mortgage the Future** | +4 to the whole XI, but the run pays **no Prestige at all** unless you win the cup | **The most interesting of the lot**, and it pairs directly with idea A above: it is the only card whose cost lands on the CAREER rather than inside the run, so what it is worth depends on how the run is already going. |
| **The Coin Toss** | Either +8 to the XI or -4, decided when the card is dealt | Genuine variance in a game that has none. **See the trap below** - this one is easy to build wrong. |
| **Sell the Star** | Your best player leaves, the other ten get +4 | Also listed as idea C above. The item 04 version paid Form for it; without Form it is simply a card, and a better one for it. |

## The one to never build

**Homecoming** - "+4 to players from the same continent as your next opponent's group". It
reads as draw-conditional, which would make it fair, but **you choose your nations at build
time**, so a transfer-market XI can be set up to trigger it every run. That is exactly the
trap that killed the old Chemistry Catalyst. It is written down here so it does not get
re-invented a third time.

## The trap in The Coin Toss (and any random card)

Its result must be decided **when the offer is dealt** and stored with the run - never when
the player clicks. Decide it on the click and reloading the page until the coin lands right
becomes the best way to play. This is the same rule that already governs the group draw, the
knockout bracket and the boost offer itself, and it is the single easiest thing to get wrong
about a card with randomness in it.

## What died with Form, for the record

Every shop item (Re-roll Token, Treatment Table, Wider Shortlist, Sports Science, Marquee
Window) was priced in Form and has no meaning without it. So did four of the five events -
Media Storm, The Prodigy, Contract Dispute and Tired Legs all pay or charge it. And the
Scouting Report was deleted before that on its own merits: **it sold information, and this
game has none to sell.**

---

## Recommendation

**A first.** It is the cheapest to build, has no balance surface at all, uses a number the
player is already looking at, and is a pure decision by construction. If it lands, the
premise is proved for the format.

**Then C and G**, because both are single cards that need no node machinery and turn
existing mechanics into decisions.

**F when there is appetite for a project.** It is the only idea that changes what a run *is*
rather than what it offers.

**Not E without a prototype**, and **never anything that sells information.**
