# Player versus Player: requirements and build plan

**Roadmap item 18.** Written 2026-08-25. **Revised 2026-08-26** (room visibility; the per-pick
draft clock; the clock length becoming the host's; hiding the ratings narrowed to roll rooms).
**Reviewed and revised again 2026-08-26** after three independent reviews (game design and
fairness, server architecture, product and mobile), whose findings were verified by hand
against the code and by measurement. That review changed real things: chemistry is off in a
room, the room gets its own build state, the referee holds no timers, and the build order is
now a vertical slice. **Revised once more the same day**: a room of more than two waits for
every draft and then draws the bracket at random (P47), and a player readies up in the lobby
(P48). **Status: ALL NINE WAVES BUILT, and the roadmap item is closed** (2026-08-27). The server
half is deployed through wave 8 and verified (roadmap items 41 and 43); every migration
through **0021** is applied, confirmed against the live database on 2026-08-30. Two, four or eight people play
a whole knockout - found on a public list or reached with a code - in either kind of room,
with or without the numbers, at either clock length, and whoever goes out first stays and
watches the rest. A room nobody is in closes itself. The one decision wave 3 reopened, the
career budget in P2, was settled on 2026-08-27 by dropping the option. **Duels were added
2026-08-30** (P51): a challenge to one person, answered in their own time, with a rematch on
the result. They are the ninth wave's shape rather than a tenth wave - one field on a room,
and four deadlines read past - and they are DARK until migration 0020 is applied and the
server rebuilt (roadmap item 46), as the practice opponents are (0019, item 45). **The budget
room's draft was rebuilt 2026-08-30** (P52): one clock over the whole draft instead of eleven
pick windows, the board submitted as a map, and a player free to move and un-buy until he says
he is done. It is dark on the same terms (0021, item 47) and degrades to the old per-pick
draft on a server that has not got it.

**Two locked decisions are deliberately NOT built and have their own roadmap item:** P41's
per-pick Skip and P42's move-a-placed-player. Both need an instruction the referee does not
have, so both are a server change plus a deploy rather than a screen. Everything else the
plan locks is live, and "every setting the referee accepts is reachable from the create form"
is now enforced by the client's types rather than left to memory - see wave 9.

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

**Your career decides nothing here**, and **the sticker album, perks, Ascension, difficulty,
boosts and chemistry are all switched off** inside a room. A versus match
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
| P2 | Budget source | **A fixed room budget of $70 to $200, chosen by the host. Nothing else.** *Settled 2026-08-27 by dropping the alternative. The host could originally price a room off each player's own career transfer budget, and wave 3 found that this contradicts P34 outright: the referee is forbidden any privilege on `career`, and snapshotting the figure at host-start does not dodge it, because the snapshot still has to be READ by the thing that may not read it. Two ways out existed (a narrow grant, or a `security definer` function the joining client calls on itself) and both were rejected in favour of deletion, because the option was already the weakest thing in the room settings on its own merits: measured at the optimum, $160 beats $70 **85.7%** of the time and $110 beats $70 **75.9%**, so a career-budget room is decided before a ball is kicked, and the plan was already suggesting confining it to private rooms where "we know each other's careers" is true. Deleting it answers the question the way the One-off run was answered: by deletion. It also makes P8 absolute rather than conditional, and it keeps the referee's blast radius exactly where P34 wants it. The `budget_source` column goes with it (migration 0017)* |
| P3 | The owned-sticker discount | **Never applies in PvP.** The raw `priceOf` curve is the price |
| P4 | Which World Cups | **A room-level pool set by the host.** Everyone in a room draws from the same cups |
| P5 | Ratings visible | **A host switch, in ROLL rooms only.** A budget room always shows ratings, because a price is calculated straight from a rating. See P40 for what the switch can and cannot enforce |
| P7 | Room sizes and format | **2, 4 or 8, and exactly full to start.** *Amended 2026-08-26: the host may **reduce** the size before the start (8 to 4, 4 to 2) so a room that will not fill can still be played. No byes are ever created* |
| P8 | Career effect on fairness | **None at all.** *Absolute since 2026-08-27: P2 held the only door open, and that door is now closed. A room is the same room whoever walks into it* |
| P9 | Stakes | **A win/loss record only.** A ladder is planned and this is built to accept one (see P36) |
| P15 | You draft once per room | **Your XI plays the whole tournament.** Confirmed against a between-rounds swap window and a full redraft; both add a phase and make somebody wait |
| P18 | Public and private rooms | **Both.** Public is listed; private is code-only. Both have a code |
| P19 | Formation and style | **Chosen in the lobby, before the clock starts** |
| P48 | Readying up | **You pick your formation and style, then press Ready**, and the lobby shows who has. The plan previously had no gate at all between choosing a shape and the host pressing Start, so a host could start on a player who had chosen nothing and the plan never said what that player got. **Ready is a signal, not a lock**: once the room is full the host may start whenever they like, and anyone not ready is given a default formation and style. Nobody can hold a room hostage by wandering off, and it needs no second clock. A player who readies may still change their shape until the start |
| P25 | Chemistry | **OFF inside a room** (2026-08-26). Measured: the same eleven players with the full bonus beat themselves without it **73.2%** of the time, because `userGroupTeam` adds it to attack AND defence, both of which the sim reads. In the single-player game that is a nudge helping a patchwork XI close on an intact national side, which is what it exists for. In a room both sides are patchwork, so it stops being a nudge and becomes the game, and it is a pure knowledge check: eleven men from one squad reach the cap, while **400 naively auto-filled XIs never reached it once** (0 to 5, most often 1). A versus match is the two numbers the sim reads and nothing else |
| P26 | The defence-stacking meta | **Accepted as skill, not designed against** (2026-08-26). See section 11 for the measurement and for exactly what is being accepted. No minimum spend per line, no formation restriction |
| P49 | Not enough people | **The host may fill the empty chairs with practice opponents** (2026-08-29, roadmap item 45). P7's play-it-smaller answers half of "a room of eight will not fill" and stops there, because dropping to two is a different evening from the tournament the host opened; this is the other half. Four rules make it a seat rather than a player: a bot **never keeps a person out** (somebody arriving at a full room takes the newest bot's chair), a bot **cannot hold a room open** (a lobby whose last human leaves closes, however many chairs are filled), a bot **cannot be host** and cannot be swept out for silence, and a tie with a bot in it is **excluded from `pvp_records`**, so a room full of them is not a record. It **builds a team worth playing** rather than drafting like an expired clock, which is deliberately random (P21) and would make a bot a free win: near the best XI its money can buy, minus `BOT_SPEND`. Measured at $110: the optimum rates 84.0, a bot rates 83.0, it beats the expired-window XI **80%** of the time and the transfer market's own one-tap auto-fill **57%**. It needs its own table (`pvp_bots`, migration 0019) because `pvp_members.user_id` is a foreign key into `profiles` and a bot has no account |
| P50 | Starting the draft | **The room starts itself once everybody is ready, three seconds after** (2026-08-29). P48 made Ready a signal and left the host as the only thing that could act on it, so a full room of ready players sat waiting for one person to notice and press a button. The countdown is **derived from the room every client already holds** - full, and everybody ready - so it needs no instruction and nothing deployed: each screen counts down on its own and the HOST'S client sends the Start at zero. The host's button stays, for a room where somebody has not readied (P48's whole point), and arms the same three seconds rather than dropping the draft on the room. Two failure modes were designed for and both are checked: the count **disarms** if a seat is lost or somebody un-readies, so it cannot fire a Start the referee would refuse; and it **gives up at zero** after a few seconds, because the only client that sends the Start is the host's, and a host whose tab dies in the last second would otherwise leave everybody on a screen that never changes. Accepted asymmetry: a host's press on a room that was not all-ready is not visible to the others, so they see the draft arrive rather than a count - making it visible needs a server instruction, which is where P41's Skip is |
| P51 | Playing somebody who is not online | **A duel: a room of two with its deadlines switched off** (2026-08-30, roadmap item 46). Every rule above about waiting exists because a live room cannot wait for a human (P12, P31) - the pick clock, the liveness sweep, the lobby that closes when it stops filling, the half-hour idle close. A duel is the same room with those four read past, so it is **one field (`pace`) rather than a second state machine**: the draft, the deal, the validation, the tie and the record are all the same code, which is the whole reason this is small. What differs: *(reshaped 2026-08-31, see the row below)* a duel **opens straight into its challenger's draft** (no lobby, no Ready and no Start, because there is nobody to wait with) and its **second seat stays open through that draft**, the invitation is a **link and nothing else**, finishing is **declared** in every duel rather than only in a budget one, a window **never expires** but still counts the picks and deals the squads, **P39 counts live rooms only** (holding five duels is the feature; a duel neither uses up nor is blocked by your one live room), and the idle bound is **a week** rather than half an hour. Declining is **leaving** rather than a command of its own, and it closes the duel. There is no mail and no push notification in this game, so the duels list on the versus page IS how a challenge arrives - which is why the challenger's screen carries the invitation link, and why a row leads with whose move it is rather than with a score. The result offers a **rematch**, which is a NEW duel with the same settings: the old one has a result, and a result that can change is not a result |
| P53 | Waiting to be accepted, and finding a score | **A duel drafts from the moment it is opened, is sent with a button, and is watched when you turn up** (2026-08-31, roadmap items 46 and 49). Three corrections to P51, all of them the same mistake in different places: it made one player wait on another for no reason. **The challenger drafted last** - the room sat in a lobby until somebody accepted, so the person who opened it could not touch the team they were challenging with, and the two drafts never interact anyway. A duel is created in `drafting` with one member now, and its second seat stays open through the draft (the one rule the state machine needed; a live room shuts because everybody is on one clock, and a duel has none). **Eleven picked ended the draft**, so in a roll duel the last pick kicked the match off under its owner with no last look at the team: finishing is DECLARED in every duel now (`declaresDone`), which is P52's rule reached from the other end. And **the match was revealed on the server's window** (P30), which is right when two people are watching the same match and wrong when the server plays it at three in the morning: a duel's reveal is a LOCAL fact now (`state/pvp/watched.ts`), so it plays the first time each viewer opens it, with a skip beside it. The invitation drops the addressed name with them - `invited_id`, a lookup, a refusal, a visibility exception and an accept screen, all to say what a private link already says - and the chrome grows a strip reading the most urgent row of your duels, because a duel is the one thing in this game somebody else can be waiting on. Versus is a **tab** for the same reason |
| P52 | The budget room's clock | **One clock over the whole draft, not eleven windows** (2026-08-30, roadmap item 47). The METHOD decides it rather than a setting, because the two are different games: a roll draft is eleven decisions about eleven dealt squads, so a window per squad is what it is; a budget draft is one decision about one pool of money, where the eleventh pick settles whether the first was affordable, so a clock that will not let you go back and sell is a trap rather than a clock. So a budget room runs one clock (three lengths, 3/5/8 minutes) and the board is submitted as a MAP - which makes buying, moving a player to another of his roles and taking one back out the same instruction, and so finally delivers P42 and the remove beside it. Finishing is **declared** and not inferred from a full XI: the last person to complete their team would otherwise end the room by completing it, making the two new gestures unusable by exactly the person who most wants them, so there is an "I'm done" and it is reversible while the draft is open. The room plays when everybody has declared, or the clock runs out and every empty slot is filled for its player, recorded as automatic exactly as an expired window's is. A duel is both clocks off at once (P51): no window and no whole-draft deadline, so only the declarations end it. Needs `pvp_rooms.draft_seconds` and `pvp_members.done` (migration 0021) and nothing else - `xi` has been a slot map since wave 1 and `pvp_picks` has been keyed on the slot since 0016, both put there for P42 |
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
| P30 | What advances a round | **A server-stamped reveal window, not the clients.** Each result carries a "revealing from T, for D" stamp and the round moves on when that window closes, whoever is watching. *Amended 2026-08-26 by P47: the earlier "simulate a tie the moment both its players are done" applies to a two-player room only, where it is the same thing.* Two things forced the server-stamped window. Playback is per-client and **not deterministic**: speed is a personal setting spanning 5x (`STEP_MS` 90/45/18 ms a minute) and `stoppage()` is rolled locally, so two people watching the same stored match see different added time and different lengths. And waiting for every client to report done means one closed laptop freezes the room forever, which is the stall P12 exists to prevent, reappearing in a phase nobody had checked. **The stoppage minutes come from the server with the result**, and the speed control is fixed inside a room, so section 1's "everyone watches the same match" is true rather than aspirational |
| P47 | When the draw happens, in a room of more than two | **Every draft finishes first, then the whole bracket is drawn at random in one go** (2026-08-26). Two things come free and both are worth having: **nobody knows who they are facing while they draft**, so no one can build to counter a particular opponent and the draft is the same problem for everyone; and **the draw cannot be arranged**, where pairing by seat would let two people who share a private code agree who joins first and so place themselves on opposite sides of the tree. One draw sets the whole tree, so the semi-final and final paths are visible from the first whistle, which is what the bracket screen is for. **The accepted cost is a wait**: a decisive player in an eight-player room can finish in half the time of the slowest and then has nothing to do until the last pick lands, up to about four minutes on the fast clock and five and a half on the slow one. That wait is now the natural place to show the draw being made, rather than a progress strip |
| P44 | Home and away | **Randomised per tie, and it is cosmetic.** Measured over 200,000 shootouts at three squad strengths: the home side wins **50.1%**. Home takes about a third of a kick more on average (it kicks first and the early-clinch test runs after its kick) and converts none of it. Recorded so that nobody later assumes there is an advantage to allocate |

### The server

| # | Decision | Choice |
|---|----------|--------|
| P10 | Live updates | **Supabase Realtime, back into the NAS stack.** See P33 for which half of it |
| P29 | The room's build state | **A room gets its OWN build state, and this is a requirement rather than a preference.** The app holds one reducer, and every path that starts a build calls `saveRun(null)`, so a room entering through the same door would **silently delete a live Cup Run** and overwrite a half-built solo XI. Worse, while signed in the whole game state is written to the server on **every** state change, a selection tap included, and one failed write raises the blocking unreachable screen (D9) full-screen **while the pick clock keeps running**. So the build has to become an instantiable unit that a room can hold with persistence and the run-clearing side effects off. This is a refactor of the app's most load-bearing composition root and it gets its own wave |
| P32 | The referee holds no timers | **A deadline is a stored timestamp**, evaluated when a pick arrives and by **one stateless sweeper** every second or two. The earlier draft said the referee holds a tick loop and per-player timers; nothing requires that, and a stateless sweeper is correct across a restart by construction (there is no state to lose), correct if two instances ever run at once (`for update skip locked`), and has no per-room memory |
| P45 | Surviving a referee outage | **On start, the referee reads its own heartbeat and reopens every window with the time it had LEFT**, which is `now - (heartbeat - openedAt)`. *Sharpened 2026-08-26 while building wave 1: "shift every window forward by the outage" is not the same rule and is wrong for a long outage - a 45-second restart on a 20-second clock leaves every window still expired, so the very first sweep auto-picks for everybody anyway. What is owed is the REMAINDER, not the gap.* The elapsed time is clamped into one window, so a window that had already run out before the crash comes back expired (it is not resurrected as thinking time) and repeated restarts preserve the remainder rather than accumulating it. Without this, a container restart of thirty seconds means every open window is already past its deadline and the referee auto-picks for every player in every drafting room the instant it returns, possibly cascading through a whole XI. "Deadlines recovered from the database" restores the data and not the fairness, and a done-when written around recovery would pass while every player lost their draft |
| P31 | Room lifecycle | **A heartbeat and a sweeper, with numbers.** Closing a tab fires no reliable event, so leaving has to be observed rather than announced: `pvp_members.last_seen`, and a member unseen for **five minutes** is dropped from a lobby. *Revised 2026-08-27 from ninety seconds, the first time a room was tested from a phone: a locked phone runs no JavaScript, so the ping stops, and the lobby is the one phase whose whole activity is waiting - so the rule took the host's seat in the room he had opened. Conflating "this tab is gone" with "this person is not looking" is the mistake; five minutes is longer than a screen lock plus a glance away and still three times faster than the fifteen-minute idle close, which is what actually keeps the list clean. The client also pings on `visibilitychange` now, so a phone woken inside the window never reaches it.* A lobby whose host is gone promotes the next seat or closes; a lobby untouched for 15 minutes closes; a drafting room is hard-bounded at eleven windows plus slack and force-completed past it; any room untouched for 30 minutes closes. Closed rooms and their picks and deals are deleted after 24 hours; matches and records are kept. Without this a public room whose host closed their tab sits in the lobby at 3 of 8 forever, and a lobby of dead rooms is indistinguishable from a lobby nobody uses |
| P33 | Broadcast, not change-capture | **The referee broadcasts room state; the client does not subscribe to table changes.** `postgres_changes` needs logical decoding, a publication and a **replication slot**, and a slot nothing drains pins write-ahead log forever: if the Realtime container is stopped or killed, the disk fills, Postgres refuses writes, and **every signed-in player gets the blocking unreachable screen for the single-player game** because of a versus feature nobody was using. Set `max_slot_wal_keep_size` regardless. Broadcast also removes a whole authorization surface: no per-row policy is evaluated over a change stream, so the column leak in P34 cannot happen by accident. The cost is that the referee must remember to publish after every write |
| P34 | Referee authorization | **Verify `role = authenticated`, a present `sub`, and a valid `exp` and `aud`, not merely a valid signature.** In self-hosted Supabase the anon key **is itself a JWT signed with the same secret** and it ships in the browser bundle by design, so a referee that only checks the signature accepts it from any visitor with no user id at all. A test that a request bearing the anon key is refused belongs in wave 1. Separately the referee gets **its own Postgres role**, holding no privilege on `career`, `album_stickers`, `settings`, `game_state`, `active_run` or `run_results`, and `select (id, display_name, name_key)` on `profiles`. *Amended 2026-08-26 by the apply (migration 0016): it does NOT own the pvp tables. Ownership was the first design and could not be applied - see the wave 2 notes in section 11 - so it has one `for all` policy per pvp table instead, which is the more auditable half of the trade.* It is the only component in the whole design that accepts un-RLS'd input from the internet, so it must not also be the one that can read every account |
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
| Draft method | Roll a squad, or buy with a budget | **Roll a squad** (2026-08-30) |
| Budget | Five rungs, $100 to $200 (`ROOM_BUDGETS`); the referee accepts $70 to $200 (P2) | $125 |
| Cups | Any subset of the World Cups, never empty | All of them |
| Pick clock | 20 or 30 seconds. **A ROLL room's only** (P52) | 20 seconds |
| Draft clock | 3, 5 or 8 minutes over the whole draft. **A BUDGET room's only** (P52) | 5 minutes |
| Show ratings | On or off. **Roll rooms only** (P5) | On |
| Re-rolls | 0 to 6, roll rooms only | 3 |

**Two of those defaults moved on 2026-08-30 and neither is a locked decision.** **Rolling is
the default method**, because it is the game this mode actually is - a squad you did not
choose, one man from it, and the same eleven decisions for everybody - where buying is the
variant in which knowing the price list is the skill; it is one tap away either way. And the
**budget ladder is five rungs from $100 to $200** rather than three from $90 to $150, with
the default one step up from the old $110 rather than at the middle of the row: the price
curve is convex, so defaulting to $150 would make what used to be the deliberate rich choice
the ordinary game. The rungs live in `domain/pvpRoom.ts` beside the two clocks, for the
reason wave 9 learned about `PICK_SECONDS` - a list typed out beside the referee's own rule
agrees with nothing and disagrees with nothing either.

**What each player chooses for themselves:** formation and style, in the lobby, and who they
pick.

**What is absent from a room:** Ascension, difficulty, boosts, perks, swaps, the sticker album,
**and chemistry** (P25). A versus match is the two numbers the simulator reads.

**Everyone in a room has the same money**, which is the whole of P2 now. The figures that
settled it are worth keeping, because they are the argument against ever reopening it:
measured at the optimum, $160 beats $70 **85.7%** of the time and $110 beats $70 **75.9%**.
A room where the budgets differ is decided before a ball is kicked.

**Two room settings interact in a way worth knowing.** In a **one-cup** room, "another cup"
(the same nation at a different World Cup) has zero candidates for every player, so one of the
three re-roll kinds is dead. Say so in the lobby rather than shipping a button that cannot fire.

---

## 4. The five phases of a room

1. **Lobby.** The host creates the room and gets a six-character code. A public room appears in
   the lobby list; a private one is joined only by code. Each player picks their formation and
   style and then presses **Ready** (P48); the lobby shows who has, and a shape can still be
   changed until the start. The host may reduce the size (P7) and starts when the room is full,
   ready or not. The listing shows liveness ("5 of 8, two joined in the last five minutes") so
   waiting is an informed choice, and a waiting player may keep browsing the app with a room
   strip pinned in the chrome.
2. **The draft.** Each player gets the room's clock per pick, on their own clock, restarting
   when their previous pick lands. A pick that does not arrive is made for them. **In a room of
   more than two, the phase ends when the LAST player's eleventh pick lands, and the bracket is
   then drawn at random** (P47). You can see how far along everyone else is, and the draw itself
   is what the room watches when the waiting ends. A two-player room has one possible pairing,
   so it simply plays as soon as both are done.
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

- **`pvp_rooms`** - code, visibility, host, size, draft method, budget, cup pool, ratings
  switch, re-rolls, pick clock, status, current round, timestamps. (0016 also carried a
  `budget_source`; 0017 drops it with P2's second option.)
- **`pvp_members`** - who, display name, seat, **ready** (P48), **snapshotted budget** (P2),
  `last_seen` (P31), and the round they went out in. A seat is join order and a label, and
  **decides nothing**: the bracket is drawn at random after the draft (P47), which is what stops
  two people who share a code from arranging the tree between them. **Formation and style are NOT plainly readable here**: they
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
- **`pvp_records`** - derived from `pvp_matches` (P36), not incremented. **A view, and it
  must be `security_invoker`**: without that a view runs with its OWNER's rights, and the
  owner is the migration's superuser, so `select * from pvp_records` would hand every
  account's record to anybody signed in, with the row-level security on `pvp_matches`
  bypassed by the thing reading it. That needs PostgreSQL 15 or newer, which is a stated
  requirement now rather than an assumption.
- **`pvp_lineups`** - formation and style, in their own table. Section 7 offered "column
  grants or a separate table" and the separate table won: a column grant has to be restated
  every time the member row changes shape, and row-level security is row-level either way.
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
*Amended 2026-08-30: the clock is a **bar that drains**, not a numeral. What it is read for
is a proportion - how much of the window is gone - and a bar answers that at a glance where
a number needs arithmetic against a window length nobody memorised. It is still the loudest
thing on the screen, by width rather than by type size, and the urgency is still in words as
well as in colour. The one thing it added is a dependency the numeral did not have: the
length of the room's own window (P20 allows two), because a proportion is meaningless
without it.*
**It needs its own build state** (P29).

**Hiding the ratings replaces rather than blanks.** Chemistry is off in a room anyway (P25), so
what is left to hide is the rating chips, the ratings strip, the line-up sheet's rating column
and the collectible tier stars. The strip keeps its three cells with a qualitative band, the
sheet keeps position, flag and year, and the numbers all return at the whistle (P38). The
owned-sticker tick should be off in **every** room, not only hidden-rating ones, since the album
has no business in a room at all.

**Write listings in outcomes, not settings.** "$125 buys an XI rating about 85" is derivable
from the price curve, and is what the create form's five rungs now say; "roll, ratings hidden" should read "you pick from
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
| 0 | **DONE 2026-08-26** (`src/domain/pvp.ts`, `scripts/checks/pvp.ts`, 23 checks). **The rules, as pure functions.** Is this XI legal, what did it cost, was it dealt, the auto-pick, and a **two-sided `GroupTeam` builder** (`userGroupTeam` hard-codes `id: USER_ID`, `name: 'Your XI'`, `code: 'YOU'`, `isUser: true`, so it cannot describe two opponents in one tie). Call `resolveKoTie` directly: it is **already exported** and already returns a definite winner on every path, so the earlier plan's "lift `simulateKoTie`" was wrong and that item is gone | Checks refuse an illegal XI for each reason; a thousand auto-picks from a one-dollar-per-slot corner never strand a slot |
| 1 | **DONE 2026-08-26** (`src/domain/pvpRoom.ts`, `src/domain/pvpAuth.ts`, `scripts/checks/pvpRoom.ts`, 25 checks). **The referee, offline.** Bundles the domain code, runs a whole draft against simulated players, deadlines as stored data plus a sweeper, auto-picks on expiry, returns a result | Over-budget, duplicated person, out-of-pool, undealt and **late** picks each refused, at both clock lengths; a request bearing the **anon key** is refused; a player who does nothing still ends with a legal XI |
| 2 | **DONE AND APPLIED 2026-08-26** (`supabase/migrations/0016_pvp_rooms.sql`; roadmap item 39, closed). **The migration**, parse-checked, dry-run, rollback block, roadmap item opened for the apply | `push:sql -- --dry-run` clean; parsed with the real Postgres grammar, and the rollback block parsed too |
| 3 | **DONE AND DEPLOYED 2026-08-26** (`referee/`, `src/domain/displayName.ts`, `src/domain/pvpVersion.ts`, `supabase/migrations/0017_pvp_referee.sql`, `scripts/checks/referee.ts`, 53 checks). The referee itself: the router, the Postgres store, the row mapping, the sweeper, the broadcast, the JWT, and **outage recovery**; plus the display-name rule and the version endpoint. The DEPLOY half - Realtime, the gateway route, the role's password, the migration - needs the NAS and is queued as its own roadmap item, exactly as 0016 was | Two browsers see each other, and the 45-second outage, are both asserted offline (the referee's real handlers over an in-memory store); the room lifecycle was also played through the real `pgStore` as the real `pvp_referee` role on a local PostgreSQL. The deployment is now proven too (roadmap item 41): the referee answers on the live gateway with a dataset hash matching the deployed client, refuses the anon key, and the WebSocket upgrade returns 101. Three things bit that this plan did not predict, and all three are written up in `docs/nas-setup.md`: the gateway's RBAC filter is a SECOND key gate and is default-deny, the `/referee/` prefix must not be rewritten because the referee matches full paths, and **container operations wipe the docker bridge firewall rules**, which takes the whole accounts stack down and is the finding that outlives this item |
| 4 | **DONE 2026-08-27** (`src/state/buildIo.ts`, `src/hooks/useBuild.ts`, `src/components/BuildSurface.tsx`, `scripts/checks/build.ts`, 4 checks). **The room's own build state** (P29): the build extracted into an instantiable unit, persistence and run-clearing off | Proven both ways in the real app, driving a second build beside the first: through `detachedBuildIo` the solo build's stored state came back byte-identical and the Cup Run key survived; through `soloBuildIo` the same taps overwrote the solo XI and deleted the run |
| 5 | **DONE 2026-08-27** (`src/state/pvp/referee.ts`, `src/hooks/useVersusRoom.ts`, `src/domain/pvpWire.ts`, `src/domain/pvpView.ts`, `src/nav/versusRoom.ts`, `src/components/versus/`, `src/components/buildControls.ts`, `scripts/checks/pvpView.ts`, 7 checks). **The vertical slice.** A private two-player budget room, code only, one clock length, no lobby list, no roll rooms, no ratings switch, no records: lobby, draft, tie, result | Proven: two real browsers, one code, a whole game against the REAL referee handlers - name, room, join, ready, start, eleven manual picks each with nothing auto-picked, the tie watched live in both, a champion crowned, both XIs revealed, and neither player's saved game touched |
| 6 | **DONE 2026-08-27** (`src/domain/pvpView.ts` gains `roomDisplay` / `ratingBand` / `offersRatingSwitch`; `BoxScore`, `XiTable`, `SquadPanel` and `MatchdayCard` learn to hide a number; `useSquadRoll` learns to stand down; 3 checks). **Roll rooms**, and the ratings switch inside them | Proven both ways in the real app: two browsers played a whole hidden-ratings roll room and a whole budget room, and NOT ONE rating appeared in the hidden one - empty board, three placed, or live match - with twenty-five on the result screen at the whistle. The switch is not offered for a budget room (`offersRatingSwitch`), and `roomDisplay` ignores the flag there rather than trusting it |
| 7 | **DONE 2026-08-27** (`src/domain/pvpView.ts` gains `roundsFor` / `roundLabel` / `gamesIn` / `roomBracket` / `spectateTie`; `src/components/versus/RoomBracket.tsx`; `RoomScreen`, `RoomLobby`, `RoomDraft`, `RoomResult` and `VersusHome` learn that a room is not two people; `MatchdayCard` / `FixtureHead` / `GoalList` learn to name both sides; 7 checks). **Four and eight player rooms**: the wait-for-all barrier, the **random bracket draw** (P47), the bracket screen, watching after elimination. The referee had taken all of it since wave 1, so this wave added no server behaviour at all - only the client's reading of it, plus the `size` command it had never called | Proven in real browsers against the REAL referee, in two passes. **The draft**, four browsers, a room of four: the size choice, four seats with the empty ones drawn out, all four joining, the draw on screen through the wait with every seat "not drawn" and every name in the pot, the tree filling when the last XI landed, both semi-finals played, and no scoreline printed on the tree while its own match was still revealing. **The end states**, browsers pointed at rooms the referee had already driven there (the draft is eleven twenty-second windows a player and is the pass above): the champion told they won, the loser told WHO won and which round their own run ended in, the finished tree carrying real scorelines (0-1, 1-0, then 0-1), and a knocked-out player watching the final with **both** finalists named and neither called "you". No seat's saved game or run was written in either pass. The random draw and the round-feeds-forward property are asserted offline over 60 rooms of eight |
| 8 | **DONE 2026-08-27** (`domain/pvpRoom.ts` gains `SEEN_GONE_MS` / `LOBBY_IDLE_MS` / `ROOM_IDLE_MS` / `DRAFT_SLACK_MS`, `tickLobby`, `closeRoom`, `roomClosed`, `RoomMember.lastSeen` and `PvpRoom.touchedAt`; `domain/pvpWire.ts` gains `LobbyRoom`; `domain/pvpView.ts` gains `lobbyLine` / `seatsLine` / `lobbyJoinable` / `agoLine`; `referee/src/api.ts` gains `GET /v1/lobby` and the store `publicLobbies`; `state/pvp/records.ts` is new; `VersusHome` gains the visibility choice, the list and the record; `versusUi` gains `ReportName`. 13 checks). **Public visibility**: the lobby list, liveness (P31), records (P9), reporting (P22), the signed-out entry. Size reduction went with wave 7. **No migration**: every column this reads - `pvp_rooms.touched_at`, `pvp_members.last_seen`, the `pvp_rooms_open_idx` partial index, the `pvp_records` view and `pvp_name_reports` - was written by 0016 and has been waiting for a caller | Proven: two real browsers, and the second one never sent the code - it opened `/versus`, the room was on the list with its host, its seats and what it plays, and taking a seat put it in the lobby. A private room opened beside it appeared on nobody else's list. A report reached the server once, with the reporter and the reported and nothing else. And the liveness sweep closed a lobby whose people had stopped pinging, with the room screen saying it closed rather than showing a result |
| 9 | **DONE 2026-08-27** (`VersusHome` gains the clock choice, built from the domain's own `PICK_SECONDS`; CLAUDE.md's versus section reconciled against the shipped code; this file's status, this row and section 11 brought up to date; roadmap item 18 closed and item 44 opened for the two deferred decisions). **Checks and documentation** - and an audit rather than a prose pass, which is what it was for: reading the section against the code found **P20 unbuilt**, the form sending a flat twenty with a comment calling that a decision and pointing at a note that did not exist, plus four claims that had gone stale (the redeploy still described as pending, wave 5's protocol note, "all still private", and `--verify` described without its read-back step) | `npm run checks` (351) and `npm run build` clean. The clock options are derived from `PICK_SECONDS` with the copy in a `Record<PickSeconds, ...>`, so a third value is a **type error** in the client rather than a setting the host silently cannot reach - verified by adding one. And the clock length is now pinned **absolutely**: the existing block loops over both lengths and is not vacuous, but it is RELATIVE - it asks each room to honour `deadlineOf`, and both sides of that read `room.pickSeconds`, so hardcoding twenty seconds inside `deadlineOf` kept them agreeing and passed. One instant, 25 seconds in, is late on a twenty and in time on a thirty; that mutation now goes red. It had never mattered before, because until this wave no host could choose the second value. The control itself is proven by the type and by the room checks rather than by a browser run, which is stated rather than implied: it is the same numeric `Choice` row as the size and budget controls, which two earlier waves drove in real browsers |

**Where the size really is.** Wave 4 was the largest unestimated piece in the whole plan and
a refactor rather than a feature; it came out at four new files, 366 lines off the
composition root, and no behaviour change at all. Wave 3 needs NAS access and cannot be done by a cloud
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

## 11. Nothing open. Four things to measure, and one accepted

Every question this document raised was answered before building started. Building wave 3
opened exactly one - the career budget - and it was settled by deletion on 2026-08-27; it is
kept below as the record of a decision rather than as a question. Wave 3 also found five
things worth recording.

### Found by playing a lobby (2026-08-30)

- **THE CLIENT HAD NO ORDERING ON ITS ANSWERS AT ALL, and it was reported as a formation
  bug.** "Changing the formation or style un-readies me" is true, intermittently, and has
  nothing to do with either: a room is read by a poll every few seconds, by a re-read
  whenever the broadcast says something changed, and by the answer to every command, and
  none of those is ordered against the others. A poll that left before Ready was pressed
  describes a room where you are not ready; landing after the Ready answer it puts that
  back, and the next shape you pick then honestly reports what the screen says. The reset
  sticks and looks like the shape caused it.
  The fix is a high-water mark on `RoomView.at` - the server's own clock, which the payload
  has carried since wave 5 for precisely this and which nothing was reading. It is not a
  `ready` fix: every field of every room had the same hole, and `ready` was only the one the
  player had just changed and so was watching. Worth knowing for any future field: the
  optimistic board (P36) is protected by its own in-flight guard, and this is what protects
  everything that is not the board.

### Found while building the whole-draft budget room (2026-08-30, P52)

- **THE PICK CLOCK WAS ALWAYS WRONG FOR A BUDGET ROOM, and it took playing one to see it.**
  A roll draft really is eleven decisions: eleven dealt squads, one man from each, and a
  window per squad is what that is. A budget draft is ONE decision about ONE pool of money -
  the eleventh pick is what settles whether the first was affordable - and a per-pick clock
  makes that unplayable, because there is no going back to sell the winger you overpaid for.
  The method decides the clock, not a setting, and that is why: they are different games.

- **THE SCHEMA WAS READY THREE WAVES EARLY, and the code was the thing in the way.** P42
  wanted a move and could not have one, and the reason was never storage: `xi` has been a
  slot map since wave 1, `pvp_picks` is keyed on the SLOT, and `pgStore.save` already deleted
  a slot that left the map - all of it put there for exactly this. What blocked it was the
  INSTRUCTION: the referee took picks, so a move had no way to be expressed and would have
  been reverted by the next answer. Submitting the board as a map makes buying, moving and
  selling one instruction rather than three, and the referee needed no new rule for any of
  them. Worth remembering as a shape: when a feature is "not built" for a protocol reason,
  check whether the data model has been waiting for it.

- **A FULL XI IS NOT A FINISHED ONE, and getting that wrong would have cancelled the
  feature out.** The obvious reading of "go ahead when all players are through" is "when
  everybody's eleventh slot is filled", which is what a per-pick room means by it. Here it
  would mean the last person to complete their XI ends the room by completing it - so the
  moving and the selling this whole change exists for would be unusable by exactly the
  person who most wants them. Finishing is declared, and reversible while the draft is open.

- **THE TWO EFFECTS THAT POST AND RECONCILE THE BOARD MUST BE DECLARED IN THAT ORDER.** The
  client posts the whole board when it changes and pulls it back when the server disagrees,
  and both watch the same signature. React runs a commit's effects in declaration order, so
  the posting one sets the in-flight ref synchronously before the reconciling one looks at
  it; the other way round the board is yanked back to the server's copy for one render on
  every single change. A pick never had this problem because it sets the ref inside the tap
  handler. Two more that are not obvious: a REFUSED board must not be re-sent for ever, so
  "differs from the server" is not on its own a reason to send (hence the last-posted
  signature); and a ref changing re-runs no effect, so a second change made while the first
  post is in flight needs a state tick or it is never sent at all.

- **AN OLD REFEREE NEEDS NO PROTOCOL BUMP HERE, and unlike duels it degrades correctly by
  itself.** It sends a budget room its eleven pick windows and no `draft` block, and the
  screen reads the presence of that block rather than the room's method - so it draws
  exactly the per-pick draft it always drew, with the move and the remove off. Reading the
  METHOD instead would look right and be wrong on every deployed server until the next NAS
  visit, which is why the check reads that line specifically.

### Found while reshaping duels (2026-08-31, P53)

- **A CLOSED ROADMAP ITEM IS THE DEPLOYMENT RECORD, NOT `CLAUDE.md`.** That file said duels
  were "written and dark" and needed 0020 applying; items 45, 46 and 47 had been closed the
  previous day with all three migrations applied and the referee rebuilt. Believing the wrong
  one led straight to editing an applied migration in place, which is the one edit that
  cannot be right. Check the item, and check `supabase/migrations/README.md`'s table, before
  believing any sentence about what is deployed.
- **THE SECOND VERSION SKEW IS THE INVISIBLE ONE.** `duelDowngraded` was written for a
  referee that had never heard of duels, which answers 201 with an ordinary live room. The
  referee deployed right now HAS duels and answers 201 with a duel in a LOBBY - a shape the
  screens no longer draw at all. Both are "success with the wrong game", and the probe that
  catches the first (`GET /v1/duels` answering `no-such-route`) cannot see the second, because
  that route exists. Testing the ANSWER rather than the request is what generalises; a probe
  for the shape of a feature only ever catches the version it was written against.
- **DROPPING A COLUMN CAN INVERT THE DEPLOY ORDER.** Schema first, then the container, is the
  standing rule and it holds because an old container never writes a new column. It does not
  hold in the other direction: the deployed referee wrote `invited_id` on every insert, so
  dropping it first would have stopped every room being created. Server first, then 0022;
  done in that order on 2026-08-31 (roadmap item 49) and nothing broke. **The verification
  that mattered was running the SERVER's own create-read-change-delete a second time, AFTER
  the drop** - the SQL rehearsal proves the migration is safe and says nothing whatever about
  whether the container can still insert a row.

### Found while building duels (2026-08-30, P51)

- **THE WHOLE FEATURE IS A LIST OF DEADLINES NOT TO CHECK.** Written out, the difference
  between a live room and a duel is four `if`s: the pick window's expiry, the liveness drop,
  the lobby idle close and the room idle close. Everything else - the draft, the deal, the
  auto-pick's own machinery, the validation, the draw, the tie, the reveal, the record - is
  the same code path. That is the finding rather than a design note: the first sketch had a
  parallel set of tables and a second state machine, which would have been a second copy of
  the draft, and the draft is the part with the rules in it.

- **A DUEL STILL NEEDS AN IDLE BOUND, and getting it wrong either way is bad.** `ROOM_IDLE_MS`
  is half an hour and would close a duel while both players were asleep, so it cannot be
  reused. But dropping the bound entirely is worse: an unanswered challenge and a draft
  nobody finishes are the two ways a duel becomes a row that never resolves, and without a
  bound the list they sit on fills with them for ever. A week, because every write stamps
  `touchedAt`, so a duel played over three evenings never reaches it.

- **ACCEPTING HAD TO START THE DRAFT, and that removed a screen rather than adding one.** The
  first version gave a duel the ordinary lobby, and it read as broken the moment it was
  described: a Ready button is one player pressing something and then leaving, and a host's
  Start is a second visit for no decision. Both shapes are already chosen by then - the
  challenger's when they sent it, the opponent's as they accept - so `joinRoom` starts the
  room when a duel's second seat is taken.

- **THE ONE ROOM A PLAYER DID NOT CHOOSE TO OPEN.** Wave 8 settled that arriving at a room IS
  taking the seat, and deleted a confirmation screen for saying otherwise - there is one door
  and every way through it is a decision already made (a code you typed, a lobby row you
  tapped, a link you followed). A challenge breaks that premise: it ARRIVED. So it is the one
  exception, and it is narrow - a duel with no name on it is a link like any other and joins
  on arrival, exactly as before.

- **P39 IS ABOUT LIVE ROOMS, and the two halves of that fail differently.** One is the
  store's (`activeRoomOf` filters on the pace, so holding duels blocks nothing) and one is
  the handler's (a duel does not ask the question, so being in a live room does not stop you
  sending a challenge). Only the first is testable through behaviour that the other also
  produces, which is why both have their own assertion.

- **AN ADDITIVE CHANGE IS NOT A SAFE ONE, and this was reported from the live site.** Not
  bumping `PVP_PROTOCOL` for duels is right - bumping takes the whole of Versus down for a
  feature nobody can use yet - but "the old referee simply never creates a duel" was wrong
  in the way that matters. It does not REFUSE one either: `pace` is a field it has never
  heard of, so `readCreate` reads past it and opens an ordinary live room of two, answers
  201, and the client navigates the player into a lobby with a Ready button wondering where
  their challenge went. The lesson generalises past duels: **when the handshake cannot tell
  the two versions apart, the caller has to test the ANSWER rather than the status**, because
  a field the server ignores is indistinguishable from one it honoured. `duelDowngraded` is
  that test, it closes the room it was handed (which would otherwise hold the account's one
  live seat until the sweeper), and the create form additionally greys the button out up
  front by probing `GET /v1/duels` for `no-such-route` - a hint, not the gate, since a
  timeout lands in the same `catch` and means nothing of the sort.

- **A NULL WINDOW REMAINDER, NEVER A LARGE NUMBER.** The wire could have sent a duel's window
  as a very long one and let the bar draw itself, and it would have looked fine and been a
  lie: a screen that forgot to ask would draw a clock counting down to a deadline nothing
  enforces. Null means "there is no clock", and the three consumers - the bar, the tab bar's
  inert-while-your-window-is-open rule, and the draft panel's copy - each answer it
  explicitly.

### Found while building the practice opponents (2026-08-29, P49)

- **A BOT CANNOT BE A `pvp_members` ROW**, and that is the whole shape of the change.
  `user_id` is a foreign key into `profiles`, which is a foreign key into `auth.users`, so
  the three ways to seat one were: give bots real accounts (rows in a table GoTrue owns and
  lists - rejected outright), relax the key for every member so a few of them could be
  nobody (rejected: it is the constraint that stops a room seating a user id that does not
  exist), or give bots their own table. Migration 0019 is the third. The same key sits on
  `pvp_matches.home_id`, `away_id` and `winner_id` and on `pvp_rooms.champion_id`, and a bot
  plays ties and can win a room - so those four go, and a trigger does what they were
  actually for (deleting an account still takes its matches with it).
- **NOT THE AUTO-PICK, AND THAT IS THE POINT.** The obvious implementation is the thing the
  expired pick window already does, and it is exactly wrong: `autoPick` is random BY DESIGN
  (P21), so that a clock running out is a punishment. A bot that drafted that way would be a
  free win in every round it appeared, which is worse than the empty room it exists to fix.
  It rates 75.4 against a real bot's 83.0 and loses 80% of ties to it.
- **THE SEARCH IS A LAGRANGIAN, NOT A GREEDY FILL.** A greedy fill commits its money slot by
  slot in an order it cannot revisit, so it reliably overpays for whichever position it shops
  first. Instead: an exchange rate for a rating point, each slot independently taking whoever
  maximises `elo - lambda * price`, and thirty steps of bisection on lambda to land on the
  budget. It has no slot order at all, which is also the only reason the order is randomised
  - two slots can want the same multi-position player, and whoever asks first gets him, so
  randomising it is what makes two bots in one room different teams.
- **`BOT_SPEND` IS THE ONLY DIFFICULTY KNOB, and the check has to assert the CONSTANT.** The
  first version measured the spend against `BOT_SPEND` and passed happily when `BOT_SPEND`
  was mutated to 1 - the one edit that turns every practice opponent into the strongest XI
  the money can buy. Measuring a thing against the number that produced it is not a check.
- **THE LOBBY RULES ARE ABOUT PEOPLE, NOT SEATS**, and every one of them had to be re-read
  that way: a lobby closes when the last HUMAN leaves (or a host who walks away leaves three
  robots holding a listed room for fifteen minutes), the host promotion skips bots (a bot
  cannot press Start, so a room it hosted could never begin), the liveness sweep skips them
  (there is no tab to hear from), and the public listing counts people and chairs apart (a
  bot yields its seat, so folding them together prints "Full" over a room anybody can walk
  into).

### Reported after playing it: the deal had no moment (2026-08-30)

**THE SCRAMBLE WAS SWITCHED OFF WITH THE REST OF THE LOCAL ROLL, and it should not have
been.** Wave 6 stood `useSquadRoll` down for a dealt room, correctly for the draw policy and
the three re-rolls - each of those decides a squad, and in a room the squad is the referee's.
The animation decides nothing: the target is the same either way. So a room's draft skipped
the one beat a roll draft is about and each squad simply appeared. It plays the single-player
animation now, unchanged and at the same length: a room's draft is the same draft, and a
shorter beat for a room would be a second scramble to keep in step with the first. It costs
part of a pick window and that is accepted rather than overlooked.

The general lesson is the one the `dealt` flag was named for and then over-applied: **stand
down what decides, not what shows.**

### Reported after playing it: three things about the lobby (2026-08-29)

- **A ROOM FULL OF READY PLAYERS STILL WAITED FOR A BUTTON.** P48 settled that Ready is a
  signal rather than a lock and left the host as the only thing that could act on it, which
  is right for a room where somebody has NOT readied and wrong for the ordinary case. The
  fix costs no server change because the condition is already on every screen: see P50.
- **THE LOBBY SHOWED THE PEOPLE, NOT THE ROOM.** A list of who is present cannot say who is
  missing, which is most of what a lobby is about. Every chair is a row now, and the empty
  ones say so - which also makes the practice opponents legible as the thing that fills
  exactly those rows rather than as names that appeared from nowhere.
- **THE ROOM POINTER OUTLIVED THE ACCOUNT.** It lives in `sessionStorage` and signing out
  reloads the page, so a guest was left with "Back to your room" on the front page and a
  room strip in the chrome, for a room only an account can read. The lesson is the general
  one about a pointer to something you do not own: the fix is to gate the READ on the thing
  it depends on, which covers every way it can go stale, and to clear it at the sites you
  know about as well - not one or the other.

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

### Found by PLAYING it: a sleeping phone is not a closed tab (2026-08-27)

The first time a room was tested from a phone, the host was thrown out of the room he had
opened. He made a room of four on the phone, joined it from a laptop as the second player,
and the phone slept while he did that; ninety seconds later the liveness rule took his seat.

- **The rule conflated "this tab is gone" with "this person is not looking".** Closing a tab
  fires no reliable event, which is true and is why P31 observes rather than listens - but a
  phone locks its screen after thirty seconds, a locked phone runs no JavaScript at all, so
  the ping stops for a reason that has nothing to do with leaving.
- **And it applied only to lobbies, which is the worst possible place for it.** The lobby is
  the one phase whose entire activity is waiting for other people to arrive, which is to say
  putting the phone down. The rule was at its most aggressive in the situation it was least
  entitled to judge.
- **Being the host was no protection**, because P31 promotes the host away rather than
  sparing them - correct in itself, and it meant the person who opened the room was as
  droppable as anybody.
- **The window is five minutes now**: longer than a screen lock plus a glance away, and still
  three times faster than `LOBBY_IDLE_MS`, which is the rule that actually keeps the public
  list clean (a lobby where nothing HAPPENS closes at fifteen minutes whoever is watching).
  The cost is one stale seat held a few minutes longer on a public row, against a host losing
  his own room.
- **The half that matters more is in the client**: `useVersusRoom` pings on
  `visibilitychange`, so a phone woken inside the window never reaches it. `visibilitychange`
  rather than `focus`, because a phone waking to an already-focused tab fires the first and
  not always the second.
- **And the screen was lying about it.** A dropped player gets "no such room", which is the
  same answer a private room gives somebody who has never joined - so they were told that a
  private room is invisible until you are in it, of a room they had opened. The per-tab room
  pointer tells the two apart at no cost, since it is written on every answer and cleared
  only by pressing Leave.
- **The check is the reported case, not the constant.** Two minutes of silence must leave a
  lobby of four intact; against ninety seconds the room closes instead. Three existing
  fixtures had hardcoded two minutes as "gone" and went red on the change, which is the
  fixture being wrong rather than the rule: they derive from `SEEN_GONE_MS` now.

**It needs the referee redeployed**, because the sweeper is what reads the number. The two
client halves ship with the site.

### Deferred with a reason, not dropped: P41's Skip and P42's move

Both are locked decisions in section 2 and neither is built, so they are stated here rather
than left to be discovered. **The referee's instruction set is picks and re-rolls**: a Skip
has to end the current window and open the next one, and a move has to rewrite the slot map,
and neither is expressible as a pick. So both are a server change plus a deploy rather than a
screen, which is why they did not fit inside a client wave, and both are one roadmap item.

What their absence costs today. **Skip**: the clock is the only way a window ends early, so a
player who has decided cannot hand the time back, and a room of eight waits out the slowest
of eight people at every one of eleven windows (P47's accepted cost, now with no release
valve). **Move**: `ROOM_CONTROLS` turns the gesture off, so a multi-position player placed in
the wrong slot stays there - the honest alternative was leaving it on and having the next
answer from the referee silently undo it, which is worse than not offering it.

Neither is load-bearing for anything shipped, and the seams they need are already in place:
`pvp_picks` records the CURRENT state of an XI rather than an append-only log (P42's whole
reason), and `buildControls.ts` is a list precisely so one entry can be turned back on.

### Found while building, and worth knowing

- **A roll room can be stuck, and it is not exotic.** The auto-pick fills from the last
  squad dealt, and **345 of the (squad, position) pairs in the dataset are empty** - most
  1970s squads list no wide midfielder at all - so a dealt squad routinely has nobody for
  the slots still open. Left alone, the window reopens onto the same squad for ever: a
  stall, in the phase built to be unstallable. The sweeper therefore guarantees progress.
  Mutation testing is what found it; nothing about the design said it was there.
- **Anything the auto-pick reaches for is RECORDED as dealt.** "Was he dealt this player"
  is one of the rules the referee enforces, so a fallback that filled from a squad the
  referee never handed over would build an XI the referee itself then refuses. That was a
  live bug for about ten minutes and a check caught it.
- **Two overlapping guarantees are worse than one testable one.** The stuck-room fix first
  had a retry loop AND a pool fallback, and each masked the other under mutation, so
  neither was individually covered. Collapsed to one path.

### Found while writing the migration (wave 2)

- **The rollback block was wrong, and parsing it is what showed that.** `drop role` fails
  while the role still holds any privilege, and this one holds a column grant on `profiles`
  and usage on the schema, so the rollback needed a `drop owned by` first. A rollback that
  fails is worse than none, because it fails at the worst moment. Parse it, every time.
- **`bypassrls` would have defeated P34 entirely.** It is the obvious way to let the referee
  past its own tables' policies, and it is global: it would hand the referee every account's
  album and career, which is the exact opposite of narrowing its blast radius. Owning the
  `pvp_*` tables gives the same access to those tables and to nothing else.
- **The house convention is `bigserial`, not `gen_random_uuid`.** Nothing in the existing
  migrations generates a uuid, so following the instinct would have added a pgcrypto
  dependency for no reason.
- **THE REFEREE OWNS NOTHING, and the route to that was two dead ends.** Ownership was the
  first design, because a table's owner bypasses its own row-level security, which is a neat
  way to let the referee write what the client may only read. But migrations here are applied
  as `postgres`, which on self-hosted Supabase is **not a superuser**, so it cannot hand a
  table to a role it is not a member of: every `owner to` was refused. The obvious repair,
  `grant pvp_referee to current_user`, **crashed the database** on PostgreSQL 17.6 - the
  backend died, the server went into recovery, and it returned within seconds with every row
  intact and the transaction rolled back whole. So the referee gets **seven `for all`
  policies naming it** instead, one per table, which is the more auditable half of the trade:
  what it may do is written down rather than implied by who owns a table. Do not put that
  `grant` back to see whether it still happens.
- **A grant and a policy answer different questions, and the referee needs both.** A grant
  decides whether a role may issue the statement at all; a policy decides which rows it sees.
  Row-level security denies by default, so grants alone leave the referee running an `update`
  that matches nothing.

### Found while building the referee (wave 3)

- **P45 APPLIED ON EVERY SWEEP STOPS THE CLOCK DEAD.** The sweeper knows when it last swept,
  so the obvious shape is "hand back the remainder since then, every sweep". Recovery sets
  `openedAt = now - (lastSeen - openedAt)`, so the elapsed time freezes at whatever it was
  at the previous sweep and freezes there again on the next one: **no window ever expires**,
  the auto-pick never fires, and a room with an absent player waits for ever. That is the
  exact stall the no-timers design exists to prevent, reintroduced by the mechanism meant to
  be fair about it. Recovery is therefore unconditional at BOOT (which is what P45 actually
  says) and conditional during a sweep, on a gap of four sweep intervals **and** at least ten
  seconds. The floor is not belt and braces: without it a sweeper persistently slower than
  its own interval hands time back on every pass and freezes the clock just the same.
- **0016 GRANTS THE REFEREE THREE COLUMNS OF `profiles` AND NO POLICY**, and `profiles` has
  row-level security on with one policy naming `authenticated`. So the referee could read no
  rows at all: every `select display_name` came back empty, which it reads as "this account
  has not chosen a name", so **every room was refused, for everybody**. The rule it breaks is
  written down one screen above the omission, in 0016's own header ("a grant and a policy
  answer different questions, and the referee needs both") - applied there to the seven pvp
  tables and not to the one table it does not own. Found by rehearsing, not by reading.
- **Three things the state machine was not recording**, none of them visible until something
  had to persist a room: a pick's ordinal, timing and automatic flag (so `pvp_picks`'s
  idempotency key and `pvp_matches.loser_auto_picks` had nothing to write); the host's
  **re-roll allowance**, which nothing read, so a room set to zero re-rolls offered unlimited
  ones; and the ratings switch, which had nowhere to sit. A lobby control that does nothing
  is worse than no control.
- **0016 has nowhere to put the OPEN pick window.** `pvp_picks` records picks that landed,
  and the whole design turns on a deadline being stored data - so the one row that must
  survive a restart is the one row there was no column for. It cannot be derived either: the
  obvious derivation (the last pick's `landed_at`) is exactly the value recovery has to
  rewrite, and rewriting it would be recording a lie about when a pick arrived.
- **The broadcast carries no state, only a nudge.** What each player may see of a room
  differs, and a broadcast goes to one channel for everybody, so a payload carrying the room
  would either leak the draft or need a message per member. It says "this room changed" and
  each client asks for its own view. That also makes P33's chief benefit structural rather
  than careful: there is no private data in the stream at all.

### Found while building the build's own state (wave 4)

- **THE BUG P29 DESCRIBES IS REAL, AND IT WAS REPRODUCED BEFORE IT WAS FIXED.** A second
  build mounted beside the first and handed the app's own writes did exactly what the
  decision predicted: three picks in the second one overwrote the solo XI (one player at
  4-3-3 became three at 3-5-2) and **deleted the active-run key outright**, because
  `START_DRAFT` calls `saveRun(null)`. Handed a detached io the same taps left the solo
  build byte-identical and the run untouched. Running the failing version first is what
  turns "the plan says so" into a done-when.
- **The two writes are the whole of it, and that is worth knowing before wave 5.** The
  build reaches outside itself in exactly two places - mirroring the whole state on every
  tap, and dropping the run whenever a fresh XI starts. Everything else it does is its own
  reducer and its own transient state, so a second instance needed no coordination, no
  keying and no cleanup. The refactor was large because the file was large, not because
  the coupling was deep.
- **A no-op cannot be told from a mis-wire by testing it.** `createBuildIo(null)` writes
  nothing because it has nothing to write to, so a copy-paste making the detached export
  `createBuildIo(store)` passes every behavioural assertion there is. The check that
  catches it reads the export line. The general shape: when the safe version of something
  is the ABSENCE of a dependency, the test has to look at where the dependency comes from.
- **The import rule is the part that has to survive wave 5.** A room's io intercepts the
  two writes it is given and can intercept nothing else, so the build unit must not import
  the store, the router, the career or the album at all. That is asserted over both files,
  with the composition root as the vacuity guard - the same scan has to find all five of
  those in `App.tsx` or it is not reading imports.
- **What wave 5 still has to add, and wave 4 deliberately did not.** The P41 controls
  (auto-fill, Clear, Start over, the random-team shortcut) are still unconditional in
  `BuildSurface`, because a switch with no room behind it cannot be tested and would have
  been speculation. Turning them off is a prop apiece when the room screen exists.

### Reported and fixed the same day: leaving a room did not leave it

"When I leave my own room I'm still in the room when trying to create a new room." Exactly
right, and it is worth writing up because the fault is one the plan invited.

- **Leaving was a NAVIGATION and nothing else.** The Leave button cleared the local pointer
  and routed back to `/versus`; the seat stayed taken, so P39's one-room-at-a-time refused the
  next room with `already-in-a-room`. P31's liveness sweep would free it ninety seconds later,
  which is why this looked like a *sometimes* bug rather than a permanent one - and ninety
  seconds is a very long time to be told you are somewhere you just left.
- **The plan's own words are where it came from.** P31 says leaving "has to be observed rather
  than announced", because closing a tab fires no reliable event. That is true of the tab
  closing and it does NOT follow that a player pressing Leave should be treated the same way:
  a button press is exactly an announcement, and throwing it away in favour of inferring the
  same fact ninety seconds later is strictly worse. **Observing what cannot be announced is not
  a reason to ignore what can.**
- **`leaveRoom` only works in a LOBBY**, which is the same rule the sweep keeps and for the
  same reason: past the start your XI is in a bracket other people are playing (P15, P24), so
  there is nothing to remove you from without voiding their tournament. It shares
  `withoutMembers` with the sweep, because a lobby that promotes a host one way and closes the
  other is two rules wearing one name.
- **The navigation does not wait for the answer.** A player who pressed Leave is leaving, and
  the worst a lost request costs is the liveness window it used to cost every time - which is
  the floor, not the design.
- **The refusal needed an answer, not just a sentence.** "You are already in a room" with no
  route to that room is a dead end, and it stays reachable for legitimate reasons (a room you
  left that has already started, a stale tab). The referee was already sending the room's code
  as its `detail`; the message now names it and the screen puts a "Go to room X" button on it.
- **Five checks go red if the bug is put back**, and the sharpest is the end-to-end one, which
  reads `409 already-in-a-room` on the second create with the fix removed and `201` with it in.
  **It needs the referee redeployed** along with the rest of wave 8: the `/leave` route is new
  server code.

### The buttons, and the button nobody could explain (2026-08-27)

Asked for after playing it: "fix the button design all over the pvp pages, remove text that
is unnecessary or very obvious, and what is the button *Change my shape* for?"

- **The buttons had no padding, and the token's NAME was the trap.** `SECONDARY_BTN` was
  identity only - colours, border, font - with the layout left to each caller, exactly as
  `PRIMARY_BTN_BASE` is. Ten versus buttons used it bare, so they shipped with no padding and
  no text size, which reads as a mistake rather than as a smaller button. The fix is the
  naming: the plain name is now the SIZED one and the deliberate choice carries `_BASE`,
  mirroring the primary pair. `dist/assets/*.css` is byte-identical across the rename, which
  is the cheap proof that nothing moved but the names.
- **"Change my shape" was a button whose job was to send a choice the chips looked as though
  they had already made.** The lobby held the formation and style locally until you pressed
  something, so the primary action read "I'm ready" and then became that. The question "what
  is it for?" is the correct reaction: a chip that is lit and not yet sent is a lie. Picking
  posts now, and Ready is one toggle labelled for what it does, with the seat list carrying
  the state. P48 already allows a ready player to keep changing shape, so nothing had to lock.
- **Two dead ends went with it.** Changing formation could make the current style illegal, and
  the old screen left the impossible pair on screen with a disabled button under it; it falls
  back to the first legal style instead. And the shape posts had shared the host's `busy`
  flag, which made Start flicker disabled every time anybody tapped a formation.
- **Seven rows of "Empty seat"** in a room of eight was most of the lobby card's height
  saying what "1 of 8 here" and "Waiting for 7 more" already said twice. They went, and the
  card is now short enough that the two columns balance.
- **What the copy pass cut, as a rule rather than a list**: anything the control beside it
  already said. "Somebody sent you six characters. Put them in." under a heading reading
  "Join with a code" above a box showing `ABC234`. "You get a six-character code" on a page
  whose next screen is the code. A third heading reading "Line-up confirmed" under
  `BuildSurface`'s own "Confirmed line-up / Your XI is set". "Waiting for the room to fill"
  beside a seat count. What stayed is every sentence that says something a player could not
  work out from the screen: the ratings house rule, why a private room answers "no room",
  that a score waits for its own match to finish.

### Found by DEPLOYING it (wave 8, the same day)

- **THE FIRST DEPLOY BROKE VERSUS OUTRIGHT, and every check in the suite was green.** The
  container went up, reported itself healthy, and then logged `sweep failed for E7AYHR` once
  a second for ever. `referee/src/rows.ts` reads `pvp_rooms.touched_at` and
  `pvp_members.last_seen`; the two `select`s in `referee/src/pgStore.ts` named neither, and
  `pg` hands over `undefined` for a column it was not asked for.
- **The two halves failed in OPPOSITE directions, which is why it was invisible.** On the
  read, `msOf(undefined)` was `NaN` and nothing threw: `NaN > SEEN_GONE_MS` is false, so
  P31's entire lifecycle - the liveness drop, the fifteen-minute lobby close, the
  thirty-minute room close - was dead and said nothing about it. On the write, `atOf(NaN)`
  throws `RangeError: Invalid time value` from inside `save`, so **every mutation of an
  existing room rolled back**. A room could still be created (the object is built in memory
  with a real `now`) and then nothing could be done to it: no join, no ready, no start, no
  pick.
- **NO BEHAVIOURAL CHECK COULD HAVE CAUGHT THIS, and that is the interesting part.** The
  offline store deliberately keeps rooms AS ROWS and converts on every load and save, which
  is the highest-value decision in `scripts/checks/referee.ts` and it worked exactly as
  intended for everything except this. It builds those rows with `rowsFromRoom`, which by
  construction fills every field of every interface - so the mapping was exercised thousands
  of times and **the list of column names in the query was the only untested thing in the
  whole path**. It is text, so it is now checked as text: every field of every row interface
  must be named in the `select` that fills it. Mutation-tested by removing each of the two
  columns; it names the missing one.
- **A time that cannot be read is now a failure, not a value.** `msOf` and `atOf` throw. The
  alternative is what happened: an unreadable time is silently never older than anything, so
  it turns rules off rather than breaking them, and the eventual complaint surfaces two
  layers away inside a write.
- **And a failed sweep names its fault.** `faultOf` moved to `referee/src/fault.ts` and the
  sweep result carries a reason per room. A room code once a second with no reason beside it
  is undiagnosable by the only person who can see it, which is the same correction the 500
  handler had already had - the header of that handler says so at length, and the sweeper
  four files away had the identical hole.
- **The lesson for the next wave that touches the store: `--verify` proves the container
  answers, not that it works.** It mints a session, creates a real room and deletes it,
  which is why it passed - creating is the one operation the bug did not break. A probe that
  creates a room, joins it as a second account and reads it back would have caught this in
  the deploy script rather than in the log.

### Found while building the public half (wave 8)

- **IT NEEDED NO MIGRATION, and that is 0016 having been written properly rather than luck.**
  Every column this wave reads was already there and had been waiting for a caller:
  `pvp_rooms.touched_at` (which the migration's own comment says is what P31's garbage
  collection reads), `pvp_members.last_seen`, the partial index `pvp_rooms_open_idx` whose
  predicate is exactly the lobby query, the `pvp_records` view and `pvp_name_reports`. Two of
  them were not even mapped into the room yet. **A column added with a stated purpose and no
  caller is worth the line it costs.**
- **The sweeper had to start visiting LOBBIES**, and it was only looking at rooms that were
  drafting or revealing. So every liveness rule in P31 would have been unreachable code: a
  lobby the sweeper never visits is a lobby whose host can close their laptop and leave the
  room in the list at 3 of 8 for ever, which is the exact state that makes a public list
  worthless. One word in one query, and it is the whole wave.
- **The writer had never DELETED a member**, because until now nobody ever left a room. It
  upserts every member and deleted none, so a member the lobby sweep dropped would come
  straight back on the next read. And the delete has to run BEFORE the upserts, for the same
  reason the picks cleanup does: `pvp_members` has a unique index on (room, seat).
- **A dropped member leaves a SEAT GAP, and `joinRoom` was counting members.** Seats decide
  nothing (P47), so a gap is free - but the next joiner was being handed `members.length`,
  which is a number somebody else still holds the moment there is a gap. The mutation test for
  it produces two members on seat 3, which is precisely the unique-index violation. **A
  derived key stops being derivable the moment rows can be removed.**
- **"Closed" is `ended` with no champion**, rather than a fifth status. The status column takes
  four values under a check constraint and a fifth would need a migration; meanwhile a room
  that was actually WON can never be in that state, because `playRound` eliminates exactly one
  player per tie so exactly one survives. `roomClosed` is that reading, shared by the referee
  and the screens, and the screens use it to say "the room closed" rather than "the result".
- **The fifteen-minute lobby timeout deliberately ignores the pings.** A lobby where everybody
  is present and nobody has done anything for a quarter of an hour closes, and that is P31 as
  written: `touched_at` moves on every join, every ready and every size change, so fifteen
  minutes of literally nothing is abandoned however many tabs are still open. The liveness
  rule (five minutes) is what handles people leaving; this one is what handles a tab left
  open overnight.
- **A `Math.max(0, ...)` clamp was deleted because a mutation test proved it did nothing.**
  `agoLine` compares two different clocks (a server stamp against the browser's reading), so
  it can be asked about the future - and every negative gap already floors to under a minute
  and falls out as "just now". Guarding it twice reads as though the second guard mattered.
- **The records and the report do NOT go through the referee**, and that is the plan's own
  split rather than a shortcut: `pvp_records` is a `security_invoker` view with `select`
  granted to `authenticated`, and `pvp_name_reports` is the one table the client may insert
  into. The referee is the only writer of ROOMS, and neither of these is a room.
- **What the offline check cannot cover, said plainly.** The listing's visibility rule lives in
  each store's query - SQL in `pgStore`, a filter in the in-memory double - so the check
  exercises the double. What it does prove is the route, the payload shape, the seat count and
  that a private room never reaches the listing code path at all; the SQL predicate is proven
  the way the rest of 0016 was, by rehearsal on a real Postgres.

### Found while building rooms of four and eight (wave 7)

- **THE WAVE ADDED NO SERVER BEHAVIOUR AT ALL, and that is the design paying out.** The
  referee has taken 2, 4 and 8 since wave 1: `drawRound` shuffles the survivors, `playRound`
  plays every tie of the round, and `tickRoom` advances until one player is left, all of it
  already asserted over sixty rooms of eight. What wave 7 had to build was the client's
  READING of that - the tree, the wait, the spectator - plus one command the client had
  never called (`size`, P7's play-it-smaller). A wave that touches only one side is the
  reward for having put the rules in `domain/` first.
- **THERE IS NO "THE OTHER PLAYER".** Every versus screen was written with `others[0]` as
  the opponent, which is exactly right in a room of two and wrong in three different ways in
  a room of eight: the opponent is whoever the DRAW paired you with, it changes every round,
  and after you go out there is nobody. So the opponent comes off the tie, the tie comes off
  the round, and the screen grew a third state besides playing and finished: watching.
- **A SCORELINE HAS TO BE HELD BACK UNTIL ITS OWN REVEAL WINDOW CLOSES.** Every tie of a
  round is stamped at the same instant (P30) and they run for different lengths, so a tree
  that printed results as it had them would show a player the outcome of the tie they are
  about to be shown, in the box next to the one they are watching. `roomBracket` takes the
  server's clock and reads a scoreline only once `revealFrom + revealMs` has passed. It is
  the same rule the single-player bracket keeps for the user's own ties, arrived at again.
- **THE WAIT IS THE PLACE FOR THE DRAW, which is what P47 says and it is right.** A decisive
  player in a room of eight can sit on a finished XI for four minutes. What fills it is the
  tree with every seat reading "not drawn" and every name in the pot - the thing that is
  about to happen - and it fills in front of them when the last pick lands. A progress strip
  would have spent the same minutes saying less. It appears only once YOUR XI is in: while
  you are still picking, the board is what the screen is for.
- **Watching two other people needed three shared components to stop saying "you".**
  `FixtureHead` hard-codes "Your XI" and the red YOU badge, and `GoalList` tags the home
  side "You" in pitch green. One optional prop each (`MatchdayCard`'s `sides`) names both
  sides instead, and the tie is turned round for its own HOME player - which is the
  identity, so nothing is relabelled and the card written for "you and them" takes a
  neutral match unchanged. The check asserts that identity, with the away flip as its
  vacuity guard.
- **The default spectated game is the one your conqueror is in.** It is the single match in
  the round a knocked-out player has a reason to care about, and choosing it needs no
  control at all. If their conqueror went out too it falls back to the first game rather
  than to a blank screen. Checkable only in a room of EIGHT, whose second round has two
  ties: in a room of four "the conqueror's tie" and "the first tie" are the same answer.
- **The chrome was writing its own second version of the room's own sentence.** `roomLine`
  (domain) said "match on" and `App` composed "match on" from a status and a pick count, so
  the same job was done twice and both were wrong the moment a room had more than one round.
  The held pointer carries the LINE now, written by `roomLine` when the answer arrives, so
  "quarter-final on" reaches the chrome without the chrome knowing what a quarter-final is.
- **A browser check in a sandbox with no egress never boots the app, and the reason is not
  the app.** The Google Fonts `<link>` sits above the module script in the built HTML, and a
  pending stylesheet BLOCKS script execution - so with no route to `fonts.googleapis.com`
  the page sits on its boot cover for ever, with no console error and no failed request to
  say why. Stub it. And stub it with a REGEX: a `*` in a playwright glob does not match
  across a `/`, so `**fonts.g*` matches nothing and looks like it worked.

### Found while building roll rooms and the switch (wave 6)

- **A DEFAULT IS NOT A GUARANTEE, and this is the whole shape of the wave.** `BoxScore`,
  `XiTable` and `SquadPanel` all default `ratings` to true, because every single-player
  caller must read unchanged - which means a room that simply forgot to pass it would show
  every number and look completely fine. So the two doors a room renders them through,
  `BuildSurface` and `VersusMatch`, take `ratings` as a REQUIRED prop, and the check reads
  those two type lines. Making it optional again, or drawing a `RatingChip` straight into a
  versus screen, turns the suite red. **When the safe state is the non-default one, the type
  has to demand an answer.**
- **The whole local roll has to stand down, not just be pointed elsewhere.** A roll room's
  squads are dealt by the referee one at a time (P13), and `useSquadRoll` holds a scramble
  animation, a draw-next-squad policy with four refs, and three kinds of re-roll - every one
  of which would decide something the server owns. `squads: 'dealt'` switches all of it off
  and the dealt squad is pushed in with `ROLL_SETTLE`, so every screen below reads exactly
  the state a single-player draft would. Rolling locally as well would have raced the server
  and offered a squad the referee would then refuse to take a pick from.
- **A room's re-roll is ONE button.** The referee's instruction takes no argument saying
  which kind, so "another team" and "another cup" have nothing to send. `SquadPanel` takes
  the list of kinds as data rather than growing a flag, which is also where plan section 3's
  "say so rather than shipping a button that cannot fire" will land for a one-cup room.
- **The count comes from the referee, never the reducer.** A re-roll it refused - none left,
  or a deal that found no squad - must not read as spent on the panel, so the draft screen
  overrides the local `rerollsLeft` with `you.rerollsLeft`.
- **Two things only LOOKING at it would have found**, both from one screenshot of a real
  hidden-ratings draft: the clock still said "buy a player" in a room where you are dealt
  one, and the drawn-squad list was underlining each player's natural position with its
  chemistry tooltip - in a room where chemistry is off entirely (P25), so it was promising a
  bonus the simulator never receives. Neither is visible in the code; both are obvious on
  screen. **Screenshot the thing.**
- **The album needed a THIRD switch, not two.** `collectibles` hides the stars and the
  filter, but the two per-run swaps come from the reducer's initial state, so a roll room
  that only hid the marks would still have let a player use them. `swap` is its own entry in
  the controls list for exactly that reason - which is the argument for the list being a list
  rather than one flag, made a second time.
- **The band words reuse `STRENGTH_BANDS`.** The random-XI helper has had thresholds for the
  same 60-to-99 scale since long before any of this, and inventing a second set would mean
  two answers in the codebase to "is 83 strong". Only the labels are new, because
  `very-strong` is a key and not something to show a player. The check asserts the whole
  scale is covered, every band is reachable, and each word owns one contiguous run.

### Found while building the first playable room (wave 5)

- **A VERSION ENDPOINT ANSWERING IS NOT A WORKING REFEREE, and the deploy runbook's
  verification could not tell the difference.** Its three checks are `/referee/version` (a
  bundled constant) and two 401s (refused before Postgres is touched), so a deploy passed
  all three and the FIRST DATABASE WRITE THIS FEATURE EVER MADE was made by a player in a
  browser - and it 500'd. `--verify` now mints a session on the box from the stack's own
  `JWT_SECRET`, creates a real room and deletes it. Related, and worth stating because it is
  the one drift the handshake is blind to: **the version check cannot catch an image built
  one commit early.** It compares the protocol and the dataset hash, and a commit that
  changes the referee's SQL without touching the squads moves neither.
- **The code and the schema were cleared together, on a real PostgreSQL.** All seventeen
  migrations applied in order to an empty database over a stand-in for the Supabase pieces
  they assume; a user was created through the real signup trigger and named through the real
  `set_display_name`; then create / join / lineup / start / read / seen were replayed through
  the REAL `pgStore` as the real `pvp_referee` role. Every step answered 200. So a 500 in
  production is that deployment, not this repository - which is a much smaller place to look.
- **THE SECOND PRODUCTION FAILURE WAS A SENTENCE, NOT A BUG.** Opening a room answered
  "The referee would not open a room just now", which is the least useful thing the screen
  could have said: it is what a wrong JWT secret, a display name the referee cannot read, a
  full room, a bad setting and a database error all look like. The referee had already sent
  its own name for the refusal AND, for the token faults, the reason - its own header says
  those are returned "because they are how a deployment is debugged" - and the client threw
  all of it away. Every screen goes through one mapping now
  (`components/versus/refereeMessage.ts`), an unmapped code still shows itself, and the
  refusals that are the OWNER's to fix say so rather than inviting a retry. `npm run checks`
  holds the mapping against the `fail(...)` calls in `referee/src/api.ts` and against the
  two token-fault unions, so a refusal added to the referee without a sentence fails the
  suite. **A client that cannot repeat what the server told it makes every server-side
  problem undiagnosable by the only person who can see it.**
- **The schema was cleared as a suspect by rehearsing, not by reading.** `pvp_rooms.budget_source`
  is `not null` with a check and NO DEFAULT in 0016, and the referee's insert does not
  supply it, so a server missing 0017's drop would fail every create - a perfect match for
  the symptom. Applying 0016 and 0017 to a local PostgreSQL over a stand-in for the stack
  and replaying create / join / lineup / start / pick through the REAL `pgStore` as the real
  `pvp_referee` role showed the whole sequence answering 200. That is twenty minutes and it
  is the difference between a hypothesis and a fact.
- **THE ONE THING THAT BROKE IN PRODUCTION, and no amount of local testing had a chance
  of catching it.** `VITE_REFEREE_URL` is `https://HOST/referee` - it points at the
  gateway ROUTE, because P46 puts the referee on the account server's gateway rather than
  on a hostname of its own - and the client appended `/referee/v1/...` to it. Every call
  asked for `/referee/referee/v1/...`, Envoy matched nothing, and the handshake read the
  404 as "the referee is not answering": the Versus screen said it was updating, with a
  deployed referee answering perfectly on the other side of the wrong door. Two things
  came out of it. The client's paths are now `/version` and `/v1/...`, and `npm run checks`
  reads both halves of the contract - the paths in `state/pvp/referee.ts` AND the sentence
  in `docs/nas-setup.md` that sets the variable - so changing the deployment shape without
  changing the client fails in the suite. And **the end-to-end harness now mounts the
  referee behind a `/referee/` route with the variable pointing at that route**, which is
  how it is deployed; the first version served it at the origin root and configured the
  origin, so the doubled prefix cancelled out and every assertion passed. **A harness that
  does not reproduce the deployment's SHAPE is not testing the deployment.**
- **A PRIVATE ROOM IS INVISIBLE UNTIL YOU TAKE A SEAT, and the first screen built got that
  wrong.** Reading a room you are not in answers 404 rather than 403, so a private code
  cannot be confirmed by probing - which is the policy working. But it means arriving with
  a code is ALWAYS refused first, and the room screen read that as "no room with that
  code" and offered a way back. The code IS the join: the answer to that 404 is a Join
  button, not an error. Anybody tempted to "fix" the 404 should read this first.
- **The chemistry card was showing in a room, and it was a lie rather than clutter.**
  `pvpTeam` takes no chemistry argument at all, so a room's match is played on the plain
  eleven ratings - and the build page's right-hand column was promising an effective
  overall four points higher than the number the simulator would receive. P25 says
  chemistry is off in a room; that has to mean the readout too. Found by looking at a
  screenshot of the draft, not by reading the code.
- **P41's list needed three more entries than P41 names**, and each is broken for its own
  reason: the badge's remove "x" (the referee has no instruction for taking a player back
  out, so the tap undoes itself on the next reconcile), **moving a placed player** (P42
  says a room should allow it and the referee takes picks and nothing else, so a move is
  reverted by the next answer - it needs an instruction that does not exist), and the
  album's marks (P3 keeps the discount out; a tier star beside a name is then only a
  distraction that says "this player is rated 90 or more"). They are all in
  `components/buildControls.ts` as data, with a check that the app's set and the room's are
  the same shape and opposite.
- **A tie is turned round for the viewer rather than teaching five components that a side
  is a parameter.** Home is randomised and cosmetic (P44), while `USER_SIDE` is a constant
  and every match component is written as "you and them". One pure relabelling of stored
  data does it, and it is checked both ways plus the identity.
- **The reveal-join window is set by the POLL, not by taste.** `REALTIME_URL` is optional
  in the referee's configuration and a room must work without it, so a client can learn
  about a kick-off up to a poll interval after the stamp. Refusing to reveal anything not
  seen stamped shows a result nobody watched; four seconds covers the poll and still
  finishes inside the server's window, which is the playback plus its own hold.
- **The end-to-end proof did not need the NAS.** `api.handle` is pure over a store and a
  clock (wave 3's decision), so a throwaway harness wired the REAL handlers over an
  in-memory store, stubbed the twelve PostgREST calls the account layer makes, minted two
  session tokens, and drove two Chromium contexts through a whole game against the real
  production bundle. That is what "two people with a code play a whole game end to end"
  was verified against, and it is repeatable in any session.
- **What wave 5 deliberately did not build:** P41's per-pick **Skip**. It is meant to
  replace auto-fill at P21's price, and the referee has no instruction for it, so the clock
  is the only way a window ends early. It is a referee change plus a button, and it should
  go in whichever wave next touches the referee.

### Settled by deletion: the career budget (P2), 2026-08-27

Wave 3 opened one question and the owner closed it the same way item 28 closed the One-off
run: **the option is gone.** A room's budget is a fixed figure the host picks, everybody in
the room has the same money, and no part of a career reaches a room at all.

What made it a question: P2 let a host price a room off each player's own career transfer
budget, and P34 forbids the referee any privilege on `career`. Snapshotting the figure at
host-start does not dodge that, because the snapshot still has to be READ by the thing that
may not read it. Two repairs existed - a narrow `select` grant on `career`, or a
`security definer` function each joining client calls on itself - and both were rejected,
because the option was the weakest thing in the room settings before any of this came up:
$160 beats $70 **85.7%** of the time at the optimum, so the match was decided in the lobby.

**What went with it**, so that nothing is left half-removed: the `budgetSource` field on the
create request, the `budget_source` column (dropped by migration 0017 - 0016 is applied but
holds no rooms, so it is free), and the paragraph in section 3 about showing every member's
figure in the listing. P8 is now absolute rather than "none by default".

**Reopening it means reopening P34**, and that is the sentence to read first if it is ever
tempting: the referee is the only component in this design that takes un-RLS'd input from
the internet, and the whole reason it can be trusted with that is the length of the list of
things it cannot reach.

### What the rehearsal is for, stated once because it keeps paying

Parse-checking a migration proves it is well formed. **Rehearsing it inside a transaction on
the real server is what finds the things reading cannot**, and on this one it found both a
refused statement and a database crash before either could matter. The single-transaction
shape is what made the crash survivable: nothing was left behind, and the check afterwards
was not "did it work" but a row count on every table that already had data in it.

The verification that mattered afterwards was not the catalogue queries either. It was
inserting one public and one private room and reading them back **as an ordinary signed-in
user**, who saw the public one, could not see the private one, and was refused an insert.
A policy nobody has exercised is a policy nobody has checked.

### To measure once it is playable

- **Goals per tie in real rooms** (P26). The table above comes from a solver, not from people.
  Find out whether anybody discovers it.
- **Does drafting once feel thin over three rounds?** (P15.) Watch an eight-player room. The fix
  is a short swap window between rounds, which is a phase-machine change and nothing else.
- **How often does anybody time out, and does it decide matches?** (P12, P20, P21.) Frequent
  timeouts on the twenty-second clock would mean twenty is too fast, not that players are
  careless.
- **Does the wait after drafting bite in an eight-player room?** (P47.) Finishing early and
  then waiting several minutes for the slowest drafter is the accepted cost of a blind draft and
  an unriggable draw. If it is worse than it reads on paper, the draw ceremony is the thing to
  make more of, not the barrier to remove: removing it gives back the information advantage and
  the arrangeable bracket that P47 exists to close.
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
