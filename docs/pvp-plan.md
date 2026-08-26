# Player versus Player: requirements and build plan

**Roadmap item 18.** Written 2026-08-25. **Revised 2026-08-26** (room visibility; the per-pick
draft clock; the clock length becoming the host's; hiding the ratings narrowed to roll rooms).
**Reviewed and revised again 2026-08-26** after three independent reviews (game design and
fairness, server architecture, product and mobile), whose findings were verified by hand
against the code and by measurement. That review changed real things: chemistry is off in a
room, the room gets its own build state, the referee holds no timers, and the build order is
now a vertical slice. **Status: settled, nothing built.**

**Read `docs/cloud-sync-requirements.md` and `docs/cloud-sync-design.md` first** if you are
picking this up. PvP sits on top of accounts and inherits their rules.

---

## 1. What this is, in plain English

Two to eight people, all signed in and all online at once, play a knockout tournament against
each other using teams they draft on the spot, under a fast clock.

One of them makes a room. A room is **public** (listed in a lobby anyone can browse and join)
or **private** (reachable only by the short code its host shares outside the game). The host
sets the room's rules, and those rules are the point of the feature: whether everyone **buys**
a team from a budget or **rolls** random squads, how much money there is, which World Cups the
players may come from, how long a pick gets, and, in a roll room, whether anybody can see
player ratings at all.

**Drafting is timed: twenty or thirty seconds a pick, whichever the host chose.** Formation and
style are chosen in the lobby, so the clock only ever covers picking players. Each player runs
their own clock. If it runs out, a player goes into one of your empty slots and the draft moves
on, so a room can never stall.

Then the tournament plays. Two people play a match, four play semi-finals and a final, eight
play quarters, semis and a final. You keep the team you drafted for the whole thing. Everyone
watches the matches, and the room crowns a winner.

Nothing is won except the result. Wins and losses go on your record and that is all. A ladder
is the planned next step once enough people are playing.

**Your career decides nothing here unless the host wants it to**, and **the sticker album, perks,
Ascension, difficulty, boosts and chemistry are all switched off** inside a room. A versus match
is eleven players against eleven players and nothing else.

**It is built for a desktop or a laptop first** (P28). It is playable on a phone and it is not
designed around one, which is a deliberate trade and the one place this feature departs from
how the rest of the app is built.

**None of this touches the single-player game**, and a room can never alter or delete anything
you have (P29). You cannot reach it without an account, and a guest sees an invitation to sign
in rather than a missing feature.

---

## 2. Locked decisions

### The room and the game

| # | Decision | Choice |
|---|----------|--------|
| P1 | What the team is made of | **The host decides per room.** The roll draft or the budget market. Not the album, not a separate roster |
| P2 | Budget source | **Host's choice**: a fixed room budget of $70 to $200, or each player's own career transfer budget. Fixed is the default. *Amended 2026-08-26: a career budget is **snapshotted onto the member row at host-start**, by the referee. Otherwise the referee needs read access to every player's `career` row, which contradicts section 7's "these tables touch nothing else", and a player could buy a Transfer Budget perk tier mid-draft and change the budget their own XI is validated against* |
| P3 | The owned-sticker discount | **Never applies in PvP.** The raw `priceOf` curve is the price |
| P4 | Which World Cups | **A room-level pool set by the host.** Everyone in a room draws from the same cups |
| P5 | Ratings visible | **A host switch, in ROLL rooms only.** A budget room always shows ratings, because a price is calculated straight from a rating. See P40 for what the switch can and cannot enforce |
| P7 | Room sizes and format | **2, 4 or 8, and exactly full to start.** *Amended 2026-08-26: the host may **reduce** the size before the start (8 to 4, 4 to 2) so a room that will not fill can still be played. No byes are ever created* |
| P8 | Career effect on fairness | **None by default.** P2 is the only door left open and the host holds it |
| P9 | Stakes | **A win/loss record only.** A ladder is planned and this is built to accept one (see P36) |
| P15 | You draft once per room | **Your XI plays the whole tournament.** Confirmed against a between-rounds swap window and a full redraft; both add a phase and make somebody wait |
| P18 | Public and private rooms | **Both.** Public is listed; private is code-only. Both have a code |
| P19 | Formation and style | **Chosen in the lobby, before the clock starts** |
| P25 | Chemistry | **OFF inside a room** (2026-08-26). Measured: the same eleven players with the full bonus beat themselves without it **73.2%** of the time, because `userGroupTeam` adds it to attack AND defence, both of which the sim reads. In the single-player game that is a nudge helping a patchwork XI close on an intact national side, which is what it exists for. In a room both sides are patchwork, so it stops being a nudge and becomes the game, and it is a pure knowledge check: eleven men from one squad reach the cap, while **400 naively auto-filled XIs never reached it once** (0 to 5, most often 1). A versus match is the two numbers the sim reads and nothing else |
| P26 | The defence-stacking meta | **Accepted as skill, not designed against** (2026-08-26). See section 11 for the measurement and for exactly what is being accepted. No minimum spend per line, no formation restriction |
| P27 | Can two players pick the same man? | **Yes. The room pool is shared, not exclusive.** It is the only version compatible with eleven independent clocks (P12): under exclusivity two players claim the same man in overlapping windows and somebody has to be told no, which makes a fast connection an advantage. Named here as a decision rather than left as an assumption, because exclusivity is the largest single lever available if the mode ever plays flat |

### The draft

| # | Decision | Choice |
|---|----------|--------|
| P12 | The draft clock | **A fixed number of seconds per pick, each player on their own clock.** On expiry the server fills one of that player's empty slots and the next window begins. No forfeits. *Amended 2026-08-26: if the player is **holding a card** that is eligible for an empty slot when the window expires, that card is placed instead of a random one. It is the player's own expressed choice, so it cannot be gamed and it does not make timing out free; it only stops running out of time while deciding WHERE from being punished as hard as running out while deciding WHO* |
| P13 | Roll rooms | **Each player rolls their own squads.** The deals come from the server, **one at a time**: pre-generating the sequence would let a player read every future squad, including re-roll outcomes, off their own row |
| P20 | How long a pick gets | **The host chooses twenty or thirty seconds.** Two values, not a slider, so a listing can say fast or considered and a ladder can compare like with like. Independent of the draft method |
| P21 | Is the timeout pick random or good? | **Random.** A "best affordable" fallback would make timing out nearly free, and in a budget room often the smarter play. See section 11: a review measured that timing out is *already* cheap in attacking slots and expensive in defensive ones, which is accepted alongside P26 |
| P41 | What a room hides from the build page | **Auto-fill and spend, Clear, Start over, and the random-team shortcut are all absent in a room.** Auto-fill completes ten picks in one tap, which would skip the clock entirely and produce a better XI than timing out does. Start over runs the app's reset and would navigate out of the room. **A per-pick Skip replaces Auto-fill**: it takes the random pick immediately and starts the next window, which is the honest version of the same escape hatch at P21's price |
| P42 | Moving a placed player | **Allowed, and the XI is submitted as a slot map, not only as a list of picks.** Placing promotes the slot's role onto a player, so re-arranging multi-position players changes both averages. The referee validates the final map, and `pvp_picks` records the current state of the XI rather than an append-only log |
| P43 | A pick that fails validation | **Treated as no pick.** The window keeps running and the timeout fills the slot. Validation is per-pick, so an XI is legal by construction; a final XI that somehow fails is auto-completed rather than forfeited, because P12 promises no forfeits and that promise extends here |

### The rounds

| # | Decision | Choice |
|---|----------|--------|
| P6 | Live or asynchronous | **Live.** Everyone is present |
| P11 | Who decides the score | **The server.** Every XI validated and every match simulated server-side |
| P16 | Leaving after you have drafted | **Your team plays on without you** |
| P24 | What a knocked-out player sees | **They stay and watch the rest live**, then the final bracket, with a Leave that does not disturb the room |
| P30 | What advances a round | **A server-stamped reveal window, not the clients.** A tie is simulated **as soon as both its players have eleven legal picks** rather than at a whole-phase barrier, and each result carries a "revealing from T, for D" stamp. Two things forced this. Playback is per-client and **not deterministic**: speed is a personal setting spanning 5x (`STEP_MS` 90/45/18 ms a minute) and `stoppage()` is rolled locally, so two people watching the same stored match see different added time and different lengths. And waiting for every client to report done means one closed laptop freezes the room forever, which is the stall P12 exists to prevent, reappearing in a phase nobody had checked. **The stoppage minutes come from the server with the result**, and the speed control is fixed inside a room, so section 1's "everyone watches the same match" is true rather than aspirational |
| P44 | Home and away | **Randomised per tie, and it is cosmetic.** Measured over 200,000 shootouts at three squad strengths: the home side wins **50.1%**. Home takes about a third of a kick more on average (it kicks first and the early-clinch test runs after its kick) and converts none of it. Recorded so that nobody later assumes there is an advantage to allocate |

### The server

| # | Decision | Choice |
|---|----------|--------|
| P10 | Live updates | **Supabase Realtime, back into the NAS stack.** See P33 for which half of it |
| P29 | The room's build state | **A room gets its OWN build state, and this is a requirement rather than a preference.** The app holds one reducer, and every path that starts a build calls `saveRun(null)`, so a room entering through the same door would **silently delete a live Cup Run** and overwrite a half-built solo XI. Worse, while signed in the whole game state is written to the server on **every** state change, a selection tap included, and one failed write raises the blocking unreachable screen (D9) full-screen **while the pick clock keeps running**. So the build has to become an instantiable unit that a room can hold with persistence and the run-clearing side effects off. This is a refactor of the app's most load-bearing composition root and it gets its own wave |
| P32 | The referee holds no timers | **A deadline is a stored timestamp**, evaluated when a pick arrives and by **one stateless sweeper** every second or two. The earlier draft said the referee holds a tick loop and per-player timers; nothing requires that, and a stateless sweeper is correct across a restart by construction (there is no state to lose), correct if two instances ever run at once (`for update skip locked`), and has no per-room memory |
| P45 | Surviving a referee outage | **On start, the referee reads its own heartbeat, computes the outage, and gives every open window back the time it had left** (never less), bounded by the room's own wall clock. Without this, a container restart of thirty seconds means every open window is already past its deadline and the referee auto-picks for every player in every drafting room the instant it returns, possibly cascading through a whole XI. "Deadlines recovered from the database" restores the data and not the fairness, and a done-when written around recovery would pass while every player lost their draft |
| P31 | Room lifecycle | **A heartbeat and a sweeper, with numbers.** Closing a tab fires no reliable event, so leaving has to be observed rather than announced: `pvp_members.last_seen`, and a member unseen for 90 seconds is dropped from a lobby. A lobby whose host is gone promotes the next seat or closes; a lobby untouched for 15 minutes closes; a drafting room is hard-bounded at eleven windows plus slack and force-completed past it; any room untouched for 30 minutes closes. Closed rooms and their picks and deals are deleted after 24 hours; matches and records are kept. Without this a public room whose host closed their tab sits in the lobby at 3 of 8 forever, and a lobby of dead rooms is indistinguishable from a lobby nobody uses |
| P33 | Broadcast, not change-capture | **The referee broadcasts room state; the client does not subscribe to table changes.** `postgres_changes` needs logical decoding, a publication and a **replication slot**, and a slot nothing drains pins write-ahead log forever: if the Realtime container is stopped or killed, the disk fills, Postgres refuses writes, and **every signed-in player gets the blocking unreachable screen for the single-player game** because of a versus feature nobody was using. Set `max_slot_wal_keep_size` regardless. Broadcast also removes a whole authorization surface: no per-row policy is evaluated over a change stream, so the column leak in P34 cannot happen by accident. The cost is that the referee must remember to publish after every write |
| P34 | Referee authorization | **Verify `role = authenticated`, a present `sub`, and a valid `exp` and `aud`, not merely a valid signature.** In self-hosted Supabase the anon key **is itself a JWT signed with the same secret** and it ships in the browser bundle by design, so a referee that only checks the signature accepts it from any visitor with no user id at all. A test that a request bearing the anon key is refused belongs in wave 1. Separately the referee gets **its own Postgres role**, owning `pvp_*` and holding no privilege on `career`, `album_stickers`, `settings`, `game_state`, `active_run` or `run_results`, and `select (id, display_name)` on `profiles`. It is the only component in the whole design that accepts un-RLS'd input from the internet, so it must not also be the one that can read every account |
| P35 | Version handshake | **`GET /referee/version` returns a protocol number and a dataset hash**, checked when the Versus screen mounts; a mismatch shows "Versus is updating" rather than letting anyone into a room that will break. The client deploys on push to `main` and the referee is rebuilt by hand, so they are never in lockstep, and there are **two** drifts: the protocol, and the dataset. The referee bundles the squad data to validate picks and deal squads, and the dataset moved three times in one audit and gained five tournaments on consecutive days. Deploy the referee before pushing the client, always, the same rule migrations already follow |
| P36 | Idempotency, and the record | **A pick carries the ordinal the client believes it is making**, with a uniqueness constraint and conflict returning the existing row, so a retry on a flaky link is a no-op rather than two spent windows. A round advance takes an advisory lock on the room, so a double trigger writes one match. And **`pvp_records` is DERIVED from `pvp_matches`, never incremented**: a counter corrupted by a retry cannot be repaired, and a ladder will be built on this table |
| P39 | One room at a time | **One active room per account**, and one seat per room. Otherwise a player signed in on a phone and a laptop takes two seats in one room, or drafts in two rooms against two clocks at once |
| P46 | Where the referee lives | **A route on the existing gateway** (`/referee/v1/`), not a second hostname: one certificate, one reverse-proxy rule, and the existing allowlist covers it. A second hostname adds a renewal path that can take versus down on its own. The client needs its own `VITE_REFEREE_URL` passed by the deploy workflow, and **`FEATURES.pvp` derives from that**, not only from the account server, or a half-finished deployment shows a Versus tab whose every call fails |

### The player

| # | Decision | Choice |
|---|----------|--------|
| P17 | Guests | **Account-only, and visibly so.** A sign-in invitation, never a missing feature |
| P22 | Display names | **Unique and reportable, no word filter.** *Amended 2026-08-26: uniqueness is on a **normalised key** (NFC, casefolded, whitespace collapsed, zero-width stripped, a defined codepoint set, 3 to 16 characters), not on raw text. Otherwise `Mario`, `mario`, `Mario ` and a Greek-omicron `Mariο` all coexist and are indistinguishable in a lobby, which is the cheap grief in a game whose only moderation is the owner renaming an account by hand. Records key on the account, so a rename is free* |
| P23 | Somebody who joins and then idles | **No machinery, for now.** The timeout means they cannot stall anybody |
| P28 | Screen size | **Desktop and laptop first.** At three columns the pitch, the panel and the sheet are side by side and a pick needs no scrolling. On a phone they stack, and a single pick costs two animated full-page scrolls plus a hunt through a scrolling list inside a scrolling page, which does not fit a twenty-second window. A room therefore **says so on a small screen** rather than silently playing badly. Accepted trade: this is the one place the feature departs from how the rest of the app is built |
| P38 | The result screen | **Both XIs, side by side, at the final whistle, with the ratings revealed** even in a hidden-ratings room. Nothing else is at stake (P9), so the result IS the reward, and it was the thinnest thing in the plan. In a hidden-ratings room it is also the only way to learn whether you misjudged a player or the dice fell badly, which is the question the switch exists to make interesting. The data is already there: section 7 opens an opponent's picks the moment the tie is simulated |
| P40 | What the ratings switch can enforce | **It is a house rule, and it is honest about that.** The app ships `/squads`, whose stated purpose is to expose every rating, and `docs/players.html` holds the whole dataset; a second browser tab defeats the switch completely. Guarding `/squads` while your own draft is live is the cheap, enforceable half and is worth doing. But the switch must never be offered in a ranked or laddered room, and wave 6's check proves only that the room's own screens hide the number, not that the number is unreachable |

### Void

| # | Decision | Choice |
|---|----------|--------|
| P14 | The price/rating leak | **VOID, 2026-08-26.** It was an accepted hole: a budget room with ratings hidden still showed prices derived from ratings. P5 no longer offers the switch there, so the two cannot co-occur. Kept as a numbered row because voiding a decision is not the same as never having taken one |

---

## 3. The room in detail

| Option | Values | Default |
|---|---|---|
| Visibility | Public (listed) or private (code only) | Public |
| Size | 2, 4 or 8. Reducible before the start (P7) | 2 |
| Draft method | Roll a squad, or buy with a budget | Buy with a budget |
| Budget | A fixed $70 to $200 in $10 steps, or each player's own career budget | Fixed, $110 |
| Cups | Any subset of the World Cups, never empty | All of them |
| Pick clock | 20 or 30 seconds, set independently of the draft method | 20 seconds |
| Show ratings | On or off. **Roll rooms only** (P5) | On |
| Re-rolls | 0 to 6, roll rooms only | 3 |

**What each player chooses for themselves:** formation and style, in the lobby, and who they
pick.

**What is absent from a room:** Ascension, difficulty, boosts, perks, swaps, the sticker album,
**and chemistry** (P25). A versus match is the two numbers the simulator reads.

**A career-budget room must show every member's own figure in the listing and the lobby**
("your budget: $70; the largest in this room: $160"). Measured at the optimum, $160 beats $70
**85.7%** of the time and $110 beats $70 **75.9%**. That is the host's door to open, but a
joiner who cannot see what they are walking into will read a decided match as the mode being
broken. Consider offering career budgets in **private** rooms only, where "we know each other's
careers" is true.

**Two room settings interact in a way worth knowing.** In a **one-cup** room, "another cup"
(the same nation at a different World Cup) has zero candidates for every player, so one of the
three re-roll kinds is dead. Say so in the lobby rather than shipping a button that cannot fire.

---

## 4. The five phases of a room

1. **Lobby.** The host creates the room and gets a six-character code. A public room appears in
   the lobby list; a private one is joined only by code. Everyone picks formation and style
   here. The host may reduce the size (P7) and starts when the room is full. The listing shows
   liveness ("5 of 8, two joined in the last five minutes") so waiting is an informed choice,
   and a waiting player may keep browsing the app with a room strip pinned in the chrome.
2. **The draft.** Each player gets the room's clock per pick, on their own clock, restarting
   when their previous pick lands. A pick that does not arrive is made for them. The phase does
   not end in a barrier: **a tie is simulated as soon as both its players have eleven legal
   picks** (P30), so a decisive player is not left watching a progress strip for four minutes.
3. **Round.** Each tie is validated, simulated and published with a reveal stamp. Everyone
   watches, with the same live clock, goal feed and match card the single-player game uses.
   Level ties go to extra time and then penalties. At the whistle, both XIs are shown side by
   side with ratings revealed (P38).
4. **Next round, or the end.** Winners go through with the same XI. Losers stay and watch
   (P24). Repeat until one player is left.
5. **Result.** The bracket, the winner, and every player's record updated. No rematch in the
   first version.

### When the pick clock runs out

- **A held card that fits an empty slot is placed** (P12). Otherwise a random eligible player
  goes into a random empty slot.
- **The player** is drawn from the last squad **the referee dealt** in a roll room, or from the
  room pool in a budget room. Not "the squad on their screen": the referee cannot know what is
  on a screen, and a re-roll in flight when the deadline fires would make the two disagree. A
  re-roll arriving after the deadline is refused, which is the consistent reading of "a re-roll
  does not restart the clock".
- **A budget-room auto-pick reserves a dollar per remaining empty slot**, or one early expiry
  can leave an XI that cannot be finished.
- **A roll deal PREFERS a squad that can fill an open slot and falls back to the whole pool
  when none can.** The earlier draft of this plan called that a guarantee; it is not. It could
  not be made to bite in 221,760 deals across every single-cup pool and every formation, so it
  is vanishingly rare, but the auto-pick needs the fallback path anyway.
- **A re-roll does not restart the clock.**
- **Every auto-pick is announced** and the market is re-targeted explicitly. Otherwise a server
  pick landing mid-gesture fills a slot, silently re-points the market at another position,
  clears the filters, and leaves a held card eligible for nothing highlighted, which costs the
  following window too.

---

## 5. What the server is trusted with

A submitted XI is a claim, not a fact. The referee checks, using the game's own rules:

- **Is it legal?** Eleven players, each in a slot his positions allow, no person twice, every
  player from a cup the room allows, and the formation and style declared in the lobby.
- **Could he afford it?** The same price curve, no sticker discount, within the room's budget.
- **In a roll room, was he dealt these players?**
- **Was each pick in time?**
- **What is the score?**

**So the referee runs the game's own code**, bundling `domain/` and `data/`. A second copy of
the simulation in SQL would drift from the real one.

**The clock belongs to the server**, as a stored deadline evaluated lazily and by a sweeper
(P32), read from the ROOM and never from the client's request.

**What the client shows, and how it must not be computed.** The server sends **remaining
milliseconds** and the client counts down locally, never subtracting one clock from another: a
phone whose clock is two minutes fast would otherwise show a window that expired before it
opened. The countdown is recomputed on every tick and on `visibilitychange`, never accumulated,
or a backgrounded tab returns showing time that is gone. The client **hard-locks its own
controls slightly before the deadline**, by about a measured round trip, so it never lets you
submit something that will be refused; if a refusal does arrive it says the clock beat you and
names the pick that was made. A pick is rendered optimistically and reconciled, because on a
mobile link an unconfirmed tap looks like a tap that did nothing.

**Roll deals are dealt one at a time** (P13). Clients read through the database and write
through the referee.

---

## 6. What gets added to the stack

- **Realtime**, back into the NAS compose, used for **Broadcast** (P33). Undoing the trim
  touches three files (the compose service, the gateway's cluster list and four named routes),
  needs a tenant provisioned with the JWT secret, and needs **WebSocket upgrade enabled on the
  DSM reverse proxy**, which nothing has ever needed before. A missing upgrade header presents
  as "the lobby never updates" with a clean 200 in the logs.
- **The referee**, a container behind a route on the existing gateway (P46), bundling the
  domain code, holding its own narrow Postgres role (P34) and running one stateless sweeper.
- **A unique display name on `profiles`** (P22).

Load is not the concern: eight rooms of eight is 64 sockets and roughly 26 messages a second.
Memory and operational fragility are.

---

## 7. Data model

- **`pvp_rooms`** - code, visibility, host, size, draft method, budget source and amount, cup
  pool, ratings switch, re-rolls, pick clock, status, current round, timestamps.
- **`pvp_members`** - who, display name, seat, **snapshotted budget** (P2), `last_seen` (P31),
  and the round they went out in. **Formation and style are NOT plainly readable here**: they
  are in the room before it starts, and P19 puts them there precisely because they shape all
  eleven picks, so a member row readable by a whole public lobby would let the last chooser
  counter everyone. Row-level security cannot hide two columns of a row you may read, so this
  needs column grants or a separate table.
- **`pvp_deals`** - the squad dealt to one player for one pick. One row at a time.
- **`pvp_picks`** - the **current state** of a player's XI (P42): slot, player, pick ordinal,
  when the window opened, when it landed, whether it was automatic. Not an append-only log, or
  it cannot express a move.
- **`pvp_matches`** - round, the two players, score, goal events, stoppage minutes, shootout,
  winner, reveal stamp, **and the facts a ladder will need to discount a farmed win**: room
  visibility, room size, and how many of the loser's picks were automatic. Two accounts and one
  person can farm wins from day one by letting one side idle; nothing is at stake yet, but this
  is the corpus a ladder inherits and by then it is too late to tell them apart. One column now,
  impossible later.
- **`pvp_records`** - derived from `pvp_matches` (P36), not incremented.
- **`pvp_name_reports`** - insert-only from the client, read by the owner.

**Row-level security:** a public room in its lobby phase is readable by any signed-in player;
after it starts, and always for a private room, members only. Nobody reads another player's
picks until the tie they play in is simulated (which needs a correlated join, not a simple
policy). Nobody writes a match, pick or deal. Note the consequence of combining that with P15:
after round one, a surviving player's XI is public to the room, so the ratings switch protects
the draft only.

**This is one migration and it must be QUEUED, not applied** (CLAUDE.md, 2026-08-24): a
rollback block in the header, the checks to run afterwards, and a roadmap item for the apply.

---

## 8. What the player sees

**Its own routes, `/versus` and `/versus/:code`, reached from the front page**, not a second
segment under Play. The Records precedent does not transfer: Records is two read-only screens
of one shape, while Play covers three routes of three shapes, one of which is the marketing
hero the navigation rework deliberately preserved. A segment control would either sit on top of
that hero or be invisible to anyone not already on the build page. The tab bar stays at five.

**A live room is the top of the Continue precedence** - room, then run, then build - in both
the front page's Continue and the Play tab's destination. Otherwise you tap the crest out of
habit mid-room and land on your solo build with a clock running. **While you hold a live room a
one-line strip sits in the chrome** ("Versus, drafting, 4 of 11, 0:14") and returns you on tap.
**The tab bar goes inert during your own pick window**, the same mechanism the live match
already uses, with a confirming Leave inside the room.

**Screens:** Versus home (the public lobby list, create, join by code, your record, the
signed-out state); the room lobby; the draft; the round; the result.

**The draft screen is the existing build page with the room's rules**, minus the controls in
P41, with the clock as the loudest thing on screen and a strip showing everyone's progress.
**It needs its own build state** (P29).

**Hiding the ratings replaces rather than blanks.** Chemistry is off in a room anyway (P25), so
what is left to hide is the rating chips, the ratings strip, the line-up sheet's rating column
and the collectible tier stars. The strip keeps its three cells with a qualitative band, the
sheet keeps position, flag and year, and the numbers all return at the whistle (P38). The
owned-sticker tick should be off in **every** room, not only hidden-rating ones, since the album
has no business in a room at all.

**Write listings in outcomes, not settings.** "$110 buys about one 99-rated star and ten players
around 80" is derivable from the price curve; "roll, ratings hidden" should read "you pick from
random squads and you cannot see the numbers". A player can reach here having never built an XI,
since the mode is deliberately independent of the career.

**A new flag, `FEATURES.pvp`**, derived from the referee URL as well as the account server
(P46).

---

## 9. Build order

Reordered 2026-08-26 into a **vertical slice**: the earlier order put the lobby, the draft and
an optional polish wave before the first playable game, so the three biggest risks all landed
after most of the client work was done.

| Wave | What | Done when |
|---|---|---|
| 0 | **The rules, as pure functions.** Is this XI legal, what did it cost, was it dealt, the auto-pick, and a **two-sided `GroupTeam` builder** (`userGroupTeam` hard-codes `id: USER_ID`, `name: 'Your XI'`, `code: 'YOU'`, `isUser: true`, so it cannot describe two opponents in one tie). Call `resolveKoTie` directly: it is **already exported** and already returns a definite winner on every path, so the earlier plan's "lift `simulateKoTie`" was wrong and that item is gone | Checks refuse an illegal XI for each reason; a thousand auto-picks from a one-dollar-per-slot corner never strand a slot |
| 1 | **The referee, offline.** Bundles the domain code, runs a whole draft against simulated players, deadlines as stored data plus a sweeper, auto-picks on expiry, returns a result | Over-budget, duplicated person, out-of-pool, undealt and **late** picks each refused, at both clock lengths; a request bearing the **anon key** is refused; a player who does nothing still ends with a legal XI |
| 2 | **The migration**, parse-checked, dry-run, rollback block, roadmap item opened for the apply | `push:sql -- --dry-run` clean |
| 3 | **Deployed.** Realtime Broadcast, the gateway route, unique names, the version endpoint, and **outage recovery** | Two browsers see each other; killing the referee for 45 seconds returns every open window with roughly the time it had left, and fires no auto-pick for a window that was open when it died |
| 4 | **The room's own build state** (P29): the build extracted into an instantiable unit, persistence and run-clearing off | Entering a room leaves a Cup Run and a half-built solo XI untouched, and no per-tap server write happens inside a room |
| 5 | **The vertical slice.** A private two-player budget room, code only, one clock length, no lobby list, no roll rooms, no ratings switch, no records: lobby, draft, tie, result | Two people with a code play a whole game end to end |
| 6 | **Roll rooms**, and the ratings switch inside them | The check proves the room's own screens hide every rating; the switch is not offered when the room buys |
| 7 | **Four and eight player rooms**, the bracket, watching after elimination | A room of 8 plays to a winner and the first player out sees every remaining match |
| 8 | **Public visibility**: the lobby list, liveness, size reduction, records, reporting, the signed-out entry | A public room is found and joined by someone never sent a code |
| 9 | **Checks and documentation.** CLAUDE.md gains its section; the roadmap item closes | `npm run checks` and `npm run build` clean |

**Where the size really is.** Wave 4 is the largest unestimated piece in the whole plan and it
is a refactor rather than a feature. Wave 3 needs NAS access and cannot be done by a cloud
session. The earlier claim that waves 4 to 8 were "ordinary client work on top of components
that already exist" rested on "every piece of the page is reused", and that sentence does not
survive: the state is a singleton, three of the panel's controls break the clock, and part of
the right-hand column has to be replaced.

**There is no practice mode and no bot in these waves.** Both testing the clock alone and
filling an empty lobby would want one. A solo practice draft against the same rules is small,
because wave 0 already makes them pure functions, and it is the obvious first addition if the
lobby proves thin.

---

## 10. Deliberately not in the first version

A ladder or rating; anything at stake; rematch; spectating a room you are not in; chat;
notifications; tournaments larger than eight; asynchronous play; guests; a phone-first draft
(P28); and a practice mode. All additive. The one that constrains the design is the ladder,
which is why P11 puts the score on the server and P36 derives the record rather than counting
it.

---

## 11. Nothing is open. Four things to measure, and one thing accepted

Every question this document raised has been answered. What follows is not open questions.

### Accepted, with the measurement: the mode is low-scoring at the top (P25, P26)

The simulator reads exactly two numbers a side, and expected goals is linear in their sum. So
"build the best team" has a closed form: attack is an average over the midfield and forward
slots and defence an average over the keeper and defenders, so the **smaller** group is cheaper
to lift, and only two formation families field four defensive slots. Measured at $110 over the
whole dataset, building greedily for attack plus defence:

| Build | Attack | Defence | Sum |
|---|---|---|---|
| **3-4-3 and 3-5-2** (four defenders near 91, seven attackers near 78) | 78 | 91 | **169** |
| every four-at-the-back formation | 82 | 85 | 167 |
| 5-3-2 | 85 | 82 | 167 |

**3-4-3 beats 4-3-3 head to head 56.6%**, decided in the lobby before a ball is kicked. And
when both finalists have found it:

| Mirror match | Goals per tie | To penalties |
|---|---|---|
| two optimal 3-4-3s | **0.62** | **54.4%** |
| two optimal 4-3-3s | 2.35 | 16.9% |

So the strongest build empties the live goal feed, which is the mode's flagship screen, and
sends more than half of top-level ties to a shootout. **This is accepted as skill rather than
designed against** (P26), and turning chemistry off (P25) sharpens it, because chemistry was
the one axis competing with it. The cheapest reversal, if it plays badly, is a **minimum spend
per line** enforced in wave 0's legality rules and nowhere else.

A related measurement, accepted alongside it: **timing out is not uniformly expensive**, so it
is a strategy. Against a fully optimal opponent, an optimal build wins 50%; skipping the
**seven attacking picks** still wins 34.4%, while skipping the four defensive ones wins 10.1%
and doing nothing at all wins 7.1%. A random attacker is nearly the player you would have
bought; a random defender is sixteen rating points short. P21's stated reason ("nobody lets it
run on purpose") therefore does not hold for seven of the eleven slots. Drawing the timeout
pick from **cheap** players rather than uniformly would make it bad in every slot, and is the
fix if this is ever worth closing.

### To measure once it is playable

- **Goals per tie in real rooms** (P26). The table above comes from a solver, not from people.
  Find out whether anybody discovers it.
- **Does drafting once feel thin over three rounds?** (P15.) Watch an eight-player room. The fix
  is a short swap window between rounds, which is a phase-machine change and nothing else.
- **How often does anybody time out, and does it decide matches?** (P12, P20, P21.) Frequent
  timeouts on the twenty-second clock would mean twenty is too fast, not that players are
  careless.
- **Does the public lobby fill?** (P18, P23, P28.) It is the half of the feature that depends on
  other people. Note the self-fulfilling risk: joining an eight-player room as the second person
  means waiting for six strangers with nothing to do, and the rational move is to leave, which
  is why P7 now lets a host shrink a room and why the listing shows liveness.

### Deferred rather than decided

**Rate limits** on room creation and joining. The account layer already specifies abuse controls
(cloud-sync D7) and PvP reuses whatever exists rather than inventing a second set. A wave-8
item, not a design question.

### A defect found during the review, worth fixing whether or not PvP ships

**The build page and a Cup Run do not agree on chemistry.** The build page scores "In position"
against a player's real primary role, while the run maps every player's slot onto him, so once a
run starts that category is free and always full. Measured here over 400 auto-filled XIs: the
two disagree in **358 of them**, and always in the same direction, the run reading **exactly one
higher**. PvP no longer cares (P25 turns chemistry off in a room), but the single-player game
shows one number while you are drafting and uses another in the match, and that is its own bug.
It is worth a roadmap item of its own.
