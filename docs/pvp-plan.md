# Player versus Player: requirements and build plan

**Roadmap item 18.** Written 2026-08-25. **Status: shape settled, nothing built.**
Every decision below was taken by the owner in the session that wrote this document; the
item had been left deliberately open since 2026-08-18 and its six questions are now
answered. This document is the requirements doc the roadmap asked for, in the shape of
`docs/cloud-sync-requirements.md`, plus a build order, because the two are short enough
here to live together.

**Read `docs/cloud-sync-requirements.md` and `docs/cloud-sync-design.md` first** if you are
picking this up. PvP sits on top of accounts and inherits their rules, and the two
documents together are why several things below are settled rather than open.

---

## 1. What this is, in plain English

Two to eight people, all signed in and all online at the same time, play a knockout
tournament against each other using teams they build on the spot.

One of them makes a room and gets a short code to share. The others join with it. The
person who made the room sets the rules for it, and those rules are the whole point of the
feature: they decide whether everyone **buys** a team from a budget or **rolls** random
squads and picks from what they are dealt, how much money there is, which World Cups the
players may come from, and whether anybody can see player ratings at all. That last one is
the interesting switch. With ratings hidden you are picking on what you actually know about
the players rather than reading a number off the card.

When the room is full, everyone builds their XI at the same time against a shared clock.
When the clock runs out, whatever you have is finished for you automatically, so nobody is
ever left waiting on somebody who walked away from their desk.

Then the tournament plays. With two people it is a single match. With four it is two
semi-finals and a final. With eight it is quarter-finals, semi-finals and a final. You keep
the team you built for the whole thing, the way a real tournament works. Everyone watches
the same matches play out at the same time, with the same live clock and goal feed the
single-player game already uses, and the room crowns a winner.

Nothing is won except the result. Wins and losses go on your record and that is all: no
Prestige, no XP, nothing that crosses back into your career. A proper ladder is the obvious
next step once enough people are playing, and everything here is built so that it can be
added without redoing any of it.

**Your career progress does not decide anything here unless the host wants it to.** The
host may choose to have everyone spend their own earned transfer budget, but the default is
a single budget the host sets for the room, the same for everyone. A three-year-old career
and a brand-new one are the same in a PvP room by default, which is the point.

**None of this touches the single-player game.** You cannot reach it without an account,
and a guest sees an invitation to sign in rather than a missing feature.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| P1 | What the team is made of | **The host decides per room.** Either the roll draft or the budget market, both exactly as they work in the single-player build page. Not the album, not a separate roster |
| P2 | Budget source | **Host's choice**: a fixed room budget the host sets anywhere from $70 to $200, or each player's own career transfer budget. Fixed is the default, because it is the fair one |
| P3 | The owned-sticker discount | **Never applies in PvP.** A collection must not make a team cheaper here. `priceFor` is bypassed for a room; the raw `priceOf` curve is the price |
| P4 | Which World Cups | **A room-level pool set by the host**, the same idea as the `poolYears` setting but belonging to the room, not to the player. Everyone in a room draws from the same cups |
| P5 | Ratings visible | **A host switch.** Off hides every rating number in the room's build screens. See P14 for the one thing it cannot hide |
| P6 | Live or asynchronous | **Live.** Everyone is present, the room moves through its phases together |
| P7 | Room sizes and format | **2 (one match), 4 (semi-finals then a final), or 8 (quarter-finals, semi-finals, final).** Exactly full to start |
| P8 | Career effect on fairness | **None by default.** Perks, level, Ascension and the album have no effect on a PvP match. P2 is the only door left open, and the host holds it |
| P9 | Stakes | **A win/loss record only.** Nothing transferable, nothing that reaches the career. A ladder is planned for later and this is built to accept one |
| P10 | Live updates | **Add Supabase Realtime to the NAS stack.** It was deliberately trimmed out (design D10); it comes back for this |
| P11 | Who decides the score | **The server.** A submitted XI is validated and every match simulated server-side. The client never decides a result |
| P12 | Someone stalls in the build phase | **A shared countdown, then their XI is completed automatically** from whatever they had. Never a forfeit, never an indefinite wait |
| P13 | Roll rooms | **Each player rolls their own squads**, as in the single-player game. The deals come from the server so they can be checked (see section 5) |
| P14 | The price/rating leak | **Accepted.** In a budget room with ratings hidden, a player's price still reveals his rating to anyone who knows the pricing curve. Prices stay exact. Hiding the number still changes how the room plays for everyone else |
| P15 | You build once per room | **Your XI plays the whole tournament.** No rebuilding between rounds. It is how a tournament works, and it halves the waiting in an eight-player room. Reversible later if it plays badly |
| P16 | Leaving after you have built | **Your team plays on without you.** The server has everything it needs, so a dropped connection cannot stall a room or rob your opponent of a match. Rejoining rejoins the room in progress |
| P17 | Guests | **Account-only, and visibly so.** Permitted by NFR-1's "may gate genuinely online extras". The entry point shows a sign-in invitation when signed out; it never disappears and never blocks anything else |

---

## 3. The room in detail

**What the host sets when creating a room:**

| Option | Values | Default |
|---|---|---|
| Size | 2, 4 or 8 players | 2 |
| Build method | Roll a squad, or buy with a budget | Buy with a budget |
| Budget | A fixed room budget, $70 to $200 in $10 steps, or "each player's own career budget" | Fixed, $110 |
| Cups | Any subset of the World Cups in the dataset, never empty | All of them |
| Show ratings | On or off | On |
| Re-rolls | 0 to 6, roll rooms only | 3 (`INITIAL_REROLLS`) |
| Build time | 3, 5 or 10 minutes | 5 minutes |

**What each player still chooses for themselves:** formation and style, and of course who
they pick. Nothing else.

**What is deliberately absent from a room:** Ascension, difficulty, boosts, perks,
chemistry-affecting career state, swaps, and the sticker album. A PvP match is eleven
players against eleven players with the chemistry bonus the two XIs earn on their own.
Chemistry stays on, because it is a property of the XI you built and not of your career.

---

## 4. The five phases of a room

1. **Lobby.** The host creates the room and gets a six-character code. Others join by
   entering it. Everyone sees the room's rules and who has joined, updating live. The host
   starts it when it is full. Anyone may leave; the host leaving before the start closes the
   room.
2. **Build.** Everyone builds at once, on the build page they already know, under the
   room's rules and a visible shared countdown. Submitting early is allowed and shows the
   others that you are done. On expiry, an unfinished XI is completed automatically (the
   budget market's existing auto-fill for a budget room, best-available placement for a roll
   room) and submitted for you.
3. **Round.** The server pairs the players, validates every XI, simulates each tie and
   publishes the results. Everyone watches, with the same live clock, goal feed and match
   card the single-player game uses. A tie that is level goes to extra time and then
   penalties, exactly as a Cup Run knockout does.
4. **Next round, or the end.** Winners go through and their same XI plays again. Losers stay
   in the room and watch. Repeat until one player is left.
5. **Result.** The room shows its bracket and its winner, every player's record is updated,
   and the room is closed. There is no rematch button in the first version; make a new room.

---

## 5. What the server has to be trusted with, and why

**A submitted XI is a claim, not a fact.** The first thing anybody does with a
client-submitted team is submit eleven 99-rated players. That is the same problem
`finish_run` solved for stickers, and it wants the same answer: the server checks the claim
against rules the client cannot alter.

There are four things the server has to check or do, and all four need the game's own rules:

- **Is this XI legal?** Eleven players, every one placed in a slot his positions allow, no
  person used twice, every player from a cup the room allows.
- **Could this player afford it?** Every price from the same convex curve the client uses,
  totalling no more than the room's budget, with no sticker discount.
- **In a roll room, was he even dealt these players?** A rolled XI can only contain players
  from the squads that player was actually shown.
- **What is the score?** The match, extra time and the shootout.

**So the server has to run the game's own code.** Writing a second copy of the match
simulation in SQL would guarantee it drifts from the real one, and the whole `domain/`
directory is pure and React-free precisely so it can run anywhere. The plan is therefore a
small server-side service, **"the referee"**, that bundles the existing `domain/` and
`data/` code and does those four jobs. Postgres stores rooms and results; the referee is the
only thing allowed to write a result.

Two practical consequences:

- **Clients read through the database and write through the referee.** Reading a room, its
  members and its results goes over the existing Postgres connection with row-level
  security, and Realtime pushes changes. Creating a room, joining, submitting an XI and
  starting a round are HTTP calls to the referee, which checks the caller's session token,
  validates, and writes with a privileged connection.
- **Roll deals come from the server.** The referee decides each player's own sequence of
  squads when the build phase opens and hands each player theirs. Otherwise there is nothing
  to check a rolled XI against. Each player's sequence is independent (P13); it just is not
  the browser that rolls it.

**One piece of existing code needs lifting.** `simulateKoTie` is private inside
`domain/run.ts`. A knockout tie with extra time and penalties is exactly what a PvP round
needs, so it should move somewhere shared (`domain/knockout.ts` is the natural home)
without changing behaviour. `npm run checks` covers it already through the Cup Run.

---

## 6. What gets added to the stack

- **Realtime**, back into the NAS Docker compose (P10), enabled on the PvP tables only and
  filtered by the same row-level security, so you receive changes for rooms you are in and
  nothing else.
- **The referee**, a small container that bundles `src/domain` and `src/data` with the
  esbuild already in the repo, verifies the caller's Supabase session, and holds a
  privileged database connection. Reached through the existing DSM reverse proxy, so it
  needs no new port or certificate.
- **A display name on `profiles`.** An account currently has an email and nothing else, and
  a room cannot show email addresses to strangers. A name is asked for once, the first time
  you enter PvP, defaulting to the part before the @.

Nothing else in the stack changes, and no part of the single-player game changes.

---

## 7. Data model

New tables, all owned by the room and none of them touching career, album or run:

- **`pvp_rooms`** - code, host, size, build method, budget source and amount, the cup pool,
  the ratings switch, re-rolls, build seconds, status, current round, timestamps.
- **`pvp_members`** - who is in a room, their seat, when they joined, which round they went
  out in.
- **`pvp_deals`** - a roll room's per-player squad sequence, written by the referee when the
  build phase opens.
- **`pvp_entries`** - one submitted XI per player per room: formation, style, the eleven
  placements, what it cost, whether it was auto-completed.
- **`pvp_matches`** - one row per tie: round, the two players, the score, the goal events,
  the shootout if there was one, the winner.
- **`pvp_records`** - lifetime played, won, lost and rooms won, per account. The ladder,
  when it comes, sits beside this rather than replacing it.

**Row-level security:** you can read a room you are a member of and your own record;
you can read another player's entry only once the round it plays in has been simulated, or
the ratings switch is worthless. Nobody can write a match row at all; only the referee can.

**This is one migration and it must be queued, not applied.** The house rule (CLAUDE.md,
2026-08-24) is that a session which writes a migration and cannot apply it opens a roadmap
item for the apply, with a rollback block in the file header and the checks to run
afterwards. That applies here.

---

## 8. What the player sees

**Where it lives: a second segment under the Play tab**, the way Records already carries
two segments under one tab with `SubTabs`. The navigation bar stays at five tabs, which the
project has been firm about. Signed out, the segment shows a short sign-in invitation
rather than vanishing (P17).

**Screens:**

- **Versus home** - create a room, or join with a code. Your record. Signed-out state.
- **The room lobby** - the room's rules in plain words, who has joined, a share-the-code
  action, the host's Start button.
- **The build** - the existing build page, unchanged in structure, under the room's rules,
  with a countdown and a submitted-players strip. Every piece of it is reused: the pitch,
  the setup panel, the drawn-squad panel, the transfer market, the ratings strip, the
  line-up sheet.
- **The round** - the live match card and goal feed, everyone's ties, then the bracket.
- **The bracket** - a small 2/4/8 tree. The shipped `Bracket.tsx` models a 16-team knockout
  and does not fit; this wants its own small component rather than a special case in that one.

**Hiding the ratings is the widest-reaching client change** and deserves its own wave. It
is not one number in one place: it is the rating chips, the ratings strip, the line-up
sheet's rating column, the market rows, the market's sort-by-rating and sort-by-value
options, the chemistry card's effective overall, and the collectible tier stars (which are
derived from rating and so leak it). The clean way is a single "ratings are hidden" value
carried down the build tree, with a check that greps for any component that renders a
rating and is not wired to it.

**A new feature flag, `FEATURES.pvp`**, derived like `accounts`: it needs a configured
server, and it can be switched off cleanly on its own. With it off, nothing renders and no
call is made.

---

## 9. Build order

Each wave is a commit to `main`, buildable and checked. The waves are ordered so that the
riskiest and least visible parts are proved before any screen is built on top of them.

| Wave | What | Done when |
|---|---|---|
| 0 | **Lift `simulateKoTie`** into `domain/knockout.ts` unchanged, and add the referee's validation rules to `domain/` as pure functions (is this XI legal, what did it cost, was it dealt) | `npm run checks` covers all three, including that an illegal XI is refused for each reason |
| 1 | **The referee, offline.** The service, bundling the domain code, with no server and no database: given two XIs and a room's rules it validates and returns a result | Runs from the command line; checks assert an over-budget XI, a duplicated person, an out-of-pool player and an undealt player are each refused |
| 2 | **The schema migration**, written, parse-checked with `pglast`, dry-run, rollback block in its header, and a roadmap item opened for the apply | The migration file exists and `npm run push:sql -- --dry-run` is clean |
| 3 | **Realtime and the referee, deployed.** Compose changes, reverse proxy, display names on `profiles` | Two browsers see each other join a room |
| 4 | **The lobby.** Create, join by code, live membership, host start, leave | A room of two can be created, joined and started |
| 5 | **The build phase.** The build page under room rules: room budget, room cup pool, no sticker discount, the countdown, submit, auto-complete on expiry | Two players can both submit a legal XI, and one who does nothing is auto-completed |
| 6 | **Hidden ratings** | The check greps every rating-rendering component and fails on one that is not wired to the switch |
| 7 | **The round.** Pairing, simulation, the shared live reveal, extra time and penalties, advancing, crowning a winner | A room of 8 plays through to a winner |
| 8 | **Records**, the Versus home screen, the signed-out state, and the entry point | A win appears on both players' records |
| 9 | **Checks and documentation.** CLAUDE.md gets its section, the roadmap item is closed into the shipped history | `npm run checks` and `npm run build` clean |

**Rough size.** Waves 0 to 2 are a day of careful work each. Wave 3 is the one that depends
on access to the NAS and cannot be done by a cloud session. Waves 4 to 8 are the bulk of the
feature and are ordinary client work on top of components that already exist.

---

## 10. Deliberately not in the first version

A ladder or rating; anything at stake; rematch; spectating a room you are not in; chat;
notifications when a room fills; private or friends-only rooms beyond the code itself;
tournaments larger than eight; asynchronous play; and guests. Each of these is additive and
none of them requires anything above to be built differently, with one exception worth
stating: **the ladder is why P11 says the server decides the score.** If results could be
authored by a browser, every ladder built on them later would be worthless.

---

## 11. Questions left open, none of them blocking

- **Display names.** Whether they must be unique, and what happens about offensive ones. A
  small known group makes this cheap to ignore for now.
- **Rate limits** on room creation and joining. The account layer already specifies abuse
  controls (D7); PvP should reuse whatever exists rather than invent its own.
- **What the loser sees while the rest of the room plays on.** Watching is the obvious
  answer, and a "leave" that does not disturb the room is the safety valve.
- **Whether the build clock should pause** if everyone has submitted early. Almost certainly
  yes, and it is a one-line rule, but it is a feel question and worth playing before deciding.
- **Whether P15 survives contact.** Building once and playing three rounds may feel thin in
  an eight-player room. The alternative (a short rebuild between rounds) is a change to the
  room's phase machine and nothing else, which is why it is safe to defer.
