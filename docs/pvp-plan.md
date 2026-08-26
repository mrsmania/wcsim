# Player versus Player: requirements and build plan

**Roadmap item 18.** Written 2026-08-25, **revised 2026-08-26** (room visibility; the draft
clock, which changed shape entirely - see the note on P12; and then the length of that clock
becoming the host's to set). **Status: shape settled, nothing built.**

Every decision below was taken by the owner in the sessions that wrote this document; the
item had been left deliberately open since 2026-08-18 and its six questions are now
answered. This is the requirements doc the roadmap asked for, in the shape of
`docs/cloud-sync-requirements.md`, plus a build order, because the two are short enough here
to live together.

**Read `docs/cloud-sync-requirements.md` and `docs/cloud-sync-design.md` first** if you are
picking this up. PvP sits on top of accounts and inherits their rules, and the two documents
together are why several things below are settled rather than open.

---

## 1. What this is, in plain English

Two to eight people, all signed in and all online at the same time, play a knockout
tournament against each other using teams they draft on the spot, under a fast clock.

One of them makes a room. A room is **public** or **private**: a public one is listed in a
lobby that anybody can browse and join, a private one is reachable only by the short code
its host shares with whoever they like, outside the game. Either way the host sets the
room's rules, and those rules are the whole point of the feature: whether everyone **buys**
a team from a budget or **rolls** random squads and picks from what they are dealt, how much
money there is, which World Cups the players may come from, and whether anybody can see
player ratings at all. That last one is the interesting switch. With ratings hidden you are
picking on what you actually know about the players rather than reading a number off the
card.

**Drafting is timed, and it is fast: twenty or thirty seconds a pick, whichever the host
chose.** You choose your formation and style in the lobby while the room fills, so the clock
only ever covers picking players. Then you have that long to place each of your eleven, on
your own clock rather than the room's, so nobody is waiting on anybody else's deliberating.
If it runs out, a player is put into one of your empty slots at random and the draft moves
on. That rule is what makes the whole thing work: a room can never stall, and a full draft
is always over inside four minutes at twenty seconds, or five and a half at thirty.

Then the tournament plays. With two people it is a single match. With four it is two
semi-finals and a final. With eight it is quarter-finals, semi-finals and a final. You keep
the team you drafted for the whole thing, the way a real tournament works. Everyone watches
the same matches play out at the same time, with the same live clock and goal feed the
single-player game already uses, and the room crowns a winner.

Nothing is won except the result. Wins and losses go on your record and that is all: no
Prestige, no XP, nothing that crosses back into your career. A proper ladder is the obvious
next step once enough people are playing, and everything here is built so that it can be
added without redoing any of it.

**Your career progress does not decide anything here unless the host wants it to.** The host
may choose to have everyone spend their own earned transfer budget, but the default is a
single budget the host sets for the room, the same for everyone. A three-year-old career and
a brand-new one are the same in a PvP room by default, which is the point.

**None of this touches the single-player game.** You cannot reach it without an account, and
a guest sees an invitation to sign in rather than a missing feature.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| P1 | What the team is made of | **The host decides per room.** Either the roll draft or the budget market, both as they work in the single-player build page. Not the album, not a separate roster |
| P2 | Budget source | **Host's choice**: a fixed room budget the host sets anywhere from $70 to $200, or each player's own career transfer budget. Fixed is the default, because it is the fair one |
| P3 | The owned-sticker discount | **Never applies in PvP.** A collection must not make a team cheaper here. `priceFor` is bypassed for a room; the raw `priceOf` curve is the price |
| P4 | Which World Cups | **A room-level pool set by the host**, the same idea as the `poolYears` setting but belonging to the room, not to the player. Everyone in a room draws from the same cups |
| P5 | Ratings visible | **A host switch.** Off hides every rating number in the room's draft screens. See P14 for the one thing it cannot hide |
| P6 | Live or asynchronous | **Live.** Everyone is present, the room moves through its phases together |
| P7 | Room sizes and format | **2 (one match), 4 (semi-finals then a final), or 8 (quarter-finals, semi-finals, final).** Exactly full to start |
| P8 | Career effect on fairness | **None by default.** Perks, level, Ascension and the album have no effect on a PvP match. P2 is the only door left open, and the host holds it |
| P9 | Stakes | **A win/loss record only.** Nothing transferable, nothing that reaches the career. A ladder is planned for later and this is built to accept one |
| P10 | Live updates | **Add Supabase Realtime to the NAS stack.** It was deliberately trimmed out (design D10); it comes back for this |
| P11 | Who decides the score | **The server.** A submitted XI is validated and every match simulated server-side. The client never decides a result |
| P12 | The draft clock | **A fixed number of seconds per pick, each player on their own clock.** When it expires the server places an eligible player at random into one of that player's empty slots and the next window begins. No forfeits, no waiting on anybody. *Revised 2026-08-26: this replaces a single shared build-phase countdown with an auto-complete at the end, which asked far less of the player and made a room's length unpredictable* |
| P13 | Roll rooms | **Each player rolls their own squads**, as in the single-player game. The deals come from the server so they can be checked (see section 5) |
| P14 | The price/rating leak | **Accepted.** In a budget room with ratings hidden, a player's price still reveals his rating to anyone who knows the pricing curve. Prices stay exact. Hiding the number still changes how the room plays for everyone else |
| P15 | You draft once per room | **Your XI plays the whole tournament.** No redrafting between rounds. It is how a tournament works, and it saves a great deal of waiting in an eight-player room. Reversible later if it plays badly |
| P16 | Leaving after you have drafted | **Your team plays on without you.** The server has everything it needs, so a dropped connection cannot stall a room or rob your opponent of a match. Rejoining rejoins the room in progress |
| P17 | Guests | **Account-only, and visibly so.** Permitted by NFR-1's "may gate genuinely online extras". The entry point shows a sign-in invitation when signed out; it never disappears and never blocks anything else |
| P18 | Public and private rooms | **Both.** A **public** room is listed in a lobby any signed-in player can browse and join. A **private** room is reachable only by its code, which the host shares outside the game. Both have a code; only one is advertised |
| P19 | Formation and style | **Chosen in the lobby, before the clock ever starts.** They shape all eleven picks, so rushing them would be the wrong decision to rush, and it keeps the pick clock meaning one thing only: pick a player |
| P20 | How long a pick gets | **The host chooses twenty or thirty seconds**, and nothing else. Two values, not a slider: they are the difference between hurried and considered, and any third would only be somebody splitting hairs about a number nobody can feel. It is **independent of the draft method** (P1), so a roll room may be the slow one and a budget room the fast one if that is what the host wants |

---

## 3. The room in detail

**What the host sets when creating a room:**

| Option | Values | Default |
|---|---|---|
| Visibility | Public (listed in the lobby) or private (code only) | Public |
| Size | 2, 4 or 8 players | 2 |
| Draft method | Roll a squad, or buy with a budget | Buy with a budget |
| Pick clock | 20 or 30 seconds per pick, set independently of the draft method | 20 seconds |
| Budget | A fixed room budget, $70 to $200 in $10 steps, or "each player's own career budget" | Fixed, $110 |
| Cups | Any subset of the World Cups in the dataset, never empty | All of them |
| Show ratings | On or off | On |
| Re-rolls | 0 to 6, roll rooms only | 3 (`INITIAL_REROLLS`) |

**The pick clock is two values and only two** (`PVP_PICK_SECONDS = [20, 30]`). Keeping it to
a pair rather than a free number matters for a reason beyond taste: a room's clock is part of
what a result means, so a lobby listing wants to say "fast" or "considered" at a glance, and
a ladder later can compare like with like instead of sorting through arbitrary durations.
Anything the host sets is enforced by the server (section 5) exactly as the constant would
have been; the only difference is where the number comes from.

**What each player still chooses for themselves:** formation and style, in the lobby (P19),
and of course who they pick. Nothing else.

**What is deliberately absent from a room:** Ascension, difficulty, boosts, perks,
career-derived state, swaps, and the sticker album. A PvP match is eleven players against
eleven players with the chemistry bonus the two XIs earn on their own. Chemistry stays on,
because it is a property of the XI you drafted and not of your career.

---

## 4. The five phases of a room

1. **Lobby.** The host creates the room and gets a six-character code. A **public** room
   appears at once in the lobby list, where any signed-in player can see its rules, how full
   it is and who is in it, and join with one tap. A **private** room is listed nowhere and is
   joined only by entering its code. Everyone picks their **formation and style** here, at
   their leisure, and the room shows who is ready. The host starts it when it is full.
   Anyone may leave; the host leaving before the start closes the room.
2. **The draft.** Each player gets the room's clock, twenty or thirty seconds, to make each
   of their eleven picks, on their own clock, starting when the host presses start and
   restarting the moment their previous pick lands. A pick that does not arrive in time is
   made for them (see below). You can see how far along everyone else is. The phase ends
   when the last player's eleventh pick lands, which is at most three minutes forty in a
   twenty-second room and five minutes thirty in a thirty-second one.
3. **Round.** The server pairs the players, validates every XI, simulates each tie and
   publishes the results. Everyone watches, with the same live clock, goal feed and match
   card the single-player game uses. A tie that is level goes to extra time and then
   penalties, exactly as a Cup Run knockout does.
4. **Next round, or the end.** Winners go through and their same XI plays again. Losers stay
   in the room and watch. Repeat until one player is left.
5. **Result.** The room shows its bracket and its winner, every player's record is updated,
   and the room is closed. There is no rematch button in the first version; make a new room.

### What happens when the pick clock runs out

**A random eligible player goes into a random empty slot.** Specifically, and these details
matter because getting any of them wrong produces an XI the server would then have to reject:

- **The slot** is drawn from that player's currently empty slots.
- **The player** is drawn from those who can legally fill it: in a roll room, from the squad
  currently on their screen; in a budget room, from the whole room pool.
- **In a budget room the auto-pick reserves money for the slots still to come.** The cheapest
  possible player is $1, so it may not spend more than the remaining budget less one dollar
  per remaining empty slot. Without that reserve an expiry near the start could leave a
  player unable to fill his last slots at all, which is a dead end the rules must not be able
  to create.
- **In a roll room the squad on screen always contains somebody eligible**, because
  `rollAny` and its two siblings only ever deal a squad that can fill an open slot. That is
  an existing guarantee and the auto-pick depends on it; if the rolling rules are ever
  loosened, this needs a fallback.
- **A re-roll does not restart the clock.** It happens inside the window you already have.
  Otherwise re-rolling would be a way to stall indefinitely, which is precisely the thing the
  clock exists to prevent.

---

## 5. What the server has to be trusted with, and why

**A submitted XI is a claim, not a fact.** The first thing anybody does with a
client-submitted team is submit eleven 99-rated players. That is the same problem
`finish_run` solved for stickers, and it wants the same answer: the server checks the claim
against rules the client cannot alter.

There are five things the server has to check or do, and all of them need the game's own
rules:

- **Is this XI legal?** Eleven players, every one in a slot his positions allow, no person
  used twice, every player from a cup the room allows, the formation and style the player
  declared in the lobby.
- **Could this player afford it?** Every price from the same convex curve the client uses,
  totalling no more than the room's budget, with no sticker discount.
- **In a roll room, was he even dealt these players?** A rolled XI can only contain players
  from the squads that player was actually shown.
- **Was each pick in time?** See the clock note below.
- **What is the score?** The match, extra time and the shootout.

**So the server has to run the game's own code.** Writing a second copy of the match
simulation in SQL would guarantee it drifts from the real one, and the whole `domain/`
directory is pure and React-free precisely so it can run anywhere. The plan is therefore a
small server-side service, **"the referee"**, that bundles the existing `domain/` and `data/`
code and does those jobs. Postgres stores rooms and results; the referee is the only thing
allowed to write a result.

**The clock belongs to the server too, and this is what the per-pick rule costs.**
A countdown drawn in a browser is a countdown that browser can slow down, so the referee
reads the room's own clock length, stamps when each player's pick window opened, refuses a
pick that arrives after it closed (with a small grace for network latency), and makes the
auto-pick itself when it expires. That turns the referee from something called on demand
into something that **holds timers**: it needs a tick loop and a per-player deadline, and it
must survive its own restart by recovering deadlines from the database rather than from
memory. The host's twenty-or-thirty choice costs nothing extra here, since the deadline was
always going to be a stored timestamp rather than a hard-coded one, but the referee must
take the length from the ROOM and never from the client's request. This is the single
biggest consequence of the per-pick decision and it should be built and proved first
(wave 1).

Two further practical consequences:

- **Clients read through the database and write through the referee.** Reading a room, its
  members and its results goes over the existing Postgres connection with row-level
  security, and Realtime pushes changes. Creating a room, joining, picking a player and
  starting a round are HTTP calls to the referee, which checks the caller's session token,
  validates, and writes with a privileged connection.
- **Roll deals come from the server.** The referee decides each player's own sequence of
  squads and hands each player theirs. Otherwise there is nothing to check a rolled XI
  against. Each player's sequence is independent (P13); it just is not the browser that
  rolls it.

**One piece of existing code needs lifting.** `simulateKoTie` is private inside
`domain/run.ts`. A knockout tie with extra time and penalties is exactly what a PvP round
needs, so it should move somewhere shared (`domain/knockout.ts` is the natural home) without
changing behaviour. `npm run checks` covers it already through the Cup Run.

---

## 6. What gets added to the stack

- **Realtime**, back into the NAS Docker compose (P10), enabled on the PvP tables only and
  filtered by the same row-level security, so you receive changes for rooms you can see and
  nothing else.
- **The referee**, a small container that bundles `src/domain` and `src/data` with the
  esbuild already in the repo, verifies the caller's Supabase session, holds a privileged
  database connection, and runs the pick-clock tick loop.
- **A display name on `profiles`.** An account currently has an email and nothing else, and
  a public lobby cannot show email addresses to strangers. A name is asked for once, the
  first time you enter PvP, defaulting to the part before the @.

Nothing else in the stack changes, and no part of the single-player game changes.

---

## 7. Data model

New tables, all owned by the room and none of them touching career, album or run:

- **`pvp_rooms`** - code, visibility, host, size, draft method, budget source and amount, the
  cup pool, the ratings switch, re-rolls, **the pick clock in seconds**, status, current
  round, timestamps.
- **`pvp_members`** - who is in a room, their display name, seat, formation and style, when
  they joined, which round they went out in.
- **`pvp_deals`** - a roll room's per-player squad sequence, written by the referee.
- **`pvp_picks`** - one row per pick: room, player, pick number, the slot, the player id,
  when the window opened, when it landed, and whether it was automatic. This is both the
  in-progress draft and the finished XI, which is what lets a rejoining player pick up
  mid-draft and the referee recover its deadlines after a restart.
- **`pvp_matches`** - one row per tie: round, the two players, the score, the goal events,
  the shootout if there was one, the winner.
- **`pvp_records`** - lifetime played, won, lost and rooms won, per account. The ladder,
  when it comes, sits beside this rather than replacing it.

**Row-level security:**

- **A public room in its lobby phase is readable by any signed-in player**, along with its
  members, because that is what a browsable lobby is. Once it starts, and always for a
  private room, the room and its members are readable only by the people in it.
- **Nobody may read another player's picks until the round they play in has been
  simulated**, or the ratings switch and the whole point of a blind draft are worthless.
- **Nobody can write a match row, a pick row or a deal at all.** Only the referee can.

**This is one migration and it must be queued, not applied.** The house rule (CLAUDE.md,
2026-08-24) is that a session which writes a migration and cannot apply it opens a roadmap
item for the apply, with a rollback block in the file header and the checks to run
afterwards. That applies here.

---

## 8. What the player sees

**Where it lives: a second segment under the Play tab**, the way Records already carries two
segments under one tab with `SubTabs`. The navigation bar stays at five tabs, which the
project has been firm about. Signed out, the segment shows a short sign-in invitation rather
than vanishing (P17).

**Screens:**

- **Versus home** - the **lobby list** of open public rooms (rules, how full, host), a
  create-a-room action, a join-by-code field, and your record. Signed-out state.
- **The room lobby** - the room's rules in plain words, who has joined, your formation and
  style picker, a share-the-code action, the host's Start button.
- **The draft** - the existing build page under the room's rules, with **the pick clock as
  the loudest thing on the screen** and a strip showing how many picks everyone else has
  made. Every piece of the page is reused: the pitch, the drawn-squad panel, the
  transfer market, the ratings strip, the line-up sheet.
- **The round** - the live match card and goal feed, everyone's ties, then the bracket.
- **The bracket** - a small 2/4/8 tree. The shipped `Bracket.tsx` models a 16-team knockout
  and does not fit; this wants its own small component rather than a special case in that
  one.

**Hiding the ratings is the widest-reaching client change** and deserves its own wave. It is
not one number in one place: it is the rating chips, the ratings strip, the line-up sheet's
rating column, the market rows, the market's sort-by-rating and sort-by-value options, the
chemistry card's effective overall, and the collectible tier stars (which are derived from
rating and so leak it). The clean way is a single "ratings are hidden" value carried down
the build tree, with a check that greps for any component that renders a rating and is not
wired to it.

**A new feature flag, `FEATURES.pvp`**, derived like `accounts`: it needs a configured
server, and it can be switched off cleanly on its own. With it off, nothing renders and no
call is made.

---

## 9. Build order

Each wave is a commit to `main`, buildable and checked. The waves are ordered so that the
riskiest and least visible parts are proved before any screen is built on top of them.

| Wave | What | Done when |
|---|---|---|
| 0 | **Lift `simulateKoTie`** into `domain/knockout.ts` unchanged, and add as pure functions the rules the referee needs: is this XI legal, what did it cost, was it dealt, and **the auto-pick** (a random eligible player into a random empty slot, with the budget reserve) | `npm run checks` covers all of them, including that an illegal XI is refused for each reason and that a thousand auto-picks from a $1-per-slot corner never produce an unfillable XI |
| 1 | **The referee, offline.** The service, bundling the domain code, with no server and no database: it runs a whole draft against simulated players, holds the per-pick deadlines at the room's own length, auto-picks on expiry, and returns a result | Runs from the command line; checks assert an over-budget XI, a duplicated person, an out-of-pool player, an undealt player and a **late pick** are each refused, at both clock lengths, and that a player who does nothing at all still ends with a legal XI |
| 2 | **The schema migration**, written, parse-checked with `pglast`, dry-run, rollback block in its header, and a roadmap item opened for the apply | The migration file exists and `npm run push:sql -- --dry-run` is clean |
| 3 | **Realtime and the referee, deployed.** Compose changes, reverse proxy, display names on `profiles`, and **deadline recovery across a referee restart** | Two browsers see each other join a room, and killing the referee mid-draft does not lose anybody's clock |
| 4 | **The lobby.** Create public or private, the pick-clock choice, the browsable list of open public rooms, join by code, live membership, formation and style, host start, leave | A public room can be found and joined by someone who was never sent a code, and its listing says which clock it runs |
| 5 | **The draft.** The build page under room rules: room budget, room cup pool, no sticker discount, the room's pick clock, the progress strip, auto-pick on expiry, rejoining mid-draft | Two players draft a full XI, and one who does nothing at all still ends with eleven legal players |
| 6 | **Hidden ratings** | The check greps every rating-rendering component and fails on one that is not wired to the switch |
| 7 | **The round.** Pairing, simulation, the shared live reveal, extra time and penalties, advancing, crowning a winner | A room of 8 plays through to a winner |
| 8 | **Records**, the Versus home screen, the signed-out state, and the entry point | A win appears on both players' records |
| 9 | **Checks and documentation.** CLAUDE.md gets its section, the roadmap item is closed into the shipped history | `npm run checks` and `npm run build` clean |

**Rough size.** Waves 0 to 2 are a day of careful work each, and wave 1 is now the heaviest
of the three because of the clock. Wave 3 depends on access to the NAS and cannot be done by
a cloud session. Waves 4 to 8 are the bulk of the feature and are ordinary client work on top
of components that already exist.

---

## 10. Deliberately not in the first version

A ladder or rating; anything at stake; rematch; spectating a room you are not in; chat;
notifications when a room fills; tournaments larger than eight; asynchronous play; and
guests. Each of these is additive and none of them requires anything above to be built
differently, with one exception worth stating: **the ladder is why P11 says the server
decides the score.** If results could be authored by a browser, every ladder built on them
later would be worthless.

---

## 11. Questions left open, none of them blocking

- **The clock against the transfer market.** It suits the roll draft exactly: you are handed
  a squad and you pick from it. The budget market is a search over more than eight thousand
  players, and although it is always filtered to one position and sorted by rating, twenty
  seconds is tight and with ratings hidden as well it is very tight indeed. **P20 puts the
  answer in the host's hands rather than the designer's**, which is most of the worry gone,
  but it does not settle whether even thirty seconds is enough for a hidden-rating budget
  room. That is the thing to actually play. If thirty is still not enough, the next move is a
  shortlist per slot rather than a third number on the dial.
- **Whether the auto-pick should be random or good.** Random is the rule as decided, and it
  is the right default because it punishes running out of time. A "best affordable" fallback
  would be kinder and would make timing out much less costly, which is exactly the argument
  against it.
- **Display names.** Whether they must be unique, and what happens about offensive ones. A
  public lobby makes this land sooner than a private-only feature would.
- **Rate limits** on room creation and joining, and whether a public room needs any guard
  against being joined by somebody who then sits out the draft. The auto-pick means they
  cannot stall it, so this is about quality of game rather than safety.
- **What the loser sees while the rest of the room plays on.** Watching is the obvious
  answer, and a "leave" that does not disturb the room is the safety valve.
- **Whether P15 survives contact.** Drafting once and playing three rounds may feel thin in
  an eight-player room. The alternative (a short redraft between rounds) is a change to the
  room's phase machine and nothing else, which is why it is safe to defer.
