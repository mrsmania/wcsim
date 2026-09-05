# Mondialino on Android

A plan, not a change. Nothing here is built. Written 2026-09-05, measured against `42276ee`,
and **rewritten the same day after two independent reviews**: one overturned its
recommendation, the other found four things that would have failed a store submission after
the fourteen-day wait, plus two claims the first draft had taken from CLAUDE.md instead of
from the code. Both corrections are kept in the text where they are load-bearing. This is the
same lesson `docs/i18n-plan.md` was rewritten to learn, arrived at the same way.

The shape: **make the site work with no network and let Android install it. That is the whole
job, it is two to three days, and it is not the Play Store.** The store is a separate
decision with a permanent price, and section 4 states it in full.

---

## 0. The two decisions the owner owes

### D1. Play Store listing, or just installable?

**Recommendation: installable, and no store listing.**

Everything an Android player would actually notice comes from being installable: an icon on
the home screen, its own card in the app switcher, a splash screen, no browser bar, and full
offline play. **The store adds exactly one thing: someone can find it by searching.** Nobody
searches for Mondialino, and the traffic this game gets comes from a link being sent to
somebody, which works today.

What saying yes to the store commits you to, for ever:

- A paid developer account and an identity check that takes days.
- **Twelve real testers who install it and stay opted in for fourteen unbroken days**, before
  you may even apply to publish. This is the hard item, and it is a social task, not a timer.
- A signing key that can never be lost. Lose it and the listing can never be updated again.
- A hosted privacy policy, a data-safety declaration and a separate web page where somebody
  can ask for their account to be deleted, all kept true as the game changes.
- **Re-adding a way to report a display name**, which was deliberately deleted on 2026-09-02
  (see 4.3). Google requires it and the game no longer has it.
- **A release every year or so purely to keep up with Google's rising requirements**, or the
  listing is pulled. On a project whose whole virtue is that a push publishes the game.
- **A trademark and likeness exposure that a website does not carry** (4.6). A complaint
  against a store listing lands on the developer account, not just on the app.

"My game is on the Play Store" is a legitimate thing to want and only the owner can weigh it.
But it should be wanted on purpose, and **nothing is wasted if the answer changes later**:
every item in section 3 is a prerequisite of the store anyway.

### D2. Does offline play include a player who is signed in?

**It does not today, and this is the one thing that makes the headline false.** A signed-in
player launching with no network waits on one round trip to the account server and gets the
blocking screen. Its escape signs them out into an empty album, and signing back in needs a
network, so on an actual plane that door only opens one way. The players most likely to
install this are the ones with accounts, so the promise fails exactly where it is made.

That blocking rule is correct and deliberate: the alternative was inventing local progress and
reconciling it later, which loses data quietly instead of loudly. Three ways out, in
increasing size:

- **Let a session that has already loaded carry on** when the network drops, read only, and
  block only a cold start. Smallest, and it covers the plane.
- **Move the server** somewhere with an uptime promise. Nothing in the client changes; the
  address is already a build setting.
- **Soften the rule generally.** Do not do this casually to ship an app; it re-opens a settled
  design and risks two devices diverging.

**Recommendation: the first, as part of section 3.** It is the one that makes "plays on a
plane" true for everybody, and it changes no rule about how progress is stored.

**The honest cost, up front: two to three days, and no calendar at all,** if D1 is no. If D1
is yes, add about two days of work and **four to six weeks** of waiting.

---

## 1. What is actually being shipped

Built at `42276ee`:

| | |
| --- | --- |
| **A guest's first load** | **263 KB** over the wire |
| All game code and styles, every screen and route | 1.3 MB, 371 KB over the wire |
| Sticker artwork | 4.4 MB, 115 cards, already lazy |
| Shirt pictures under `public/jerseys/` | 70 MB, requested by nothing |
| Everything else the app actually asks for | 197 bytes (one Swiss cross) |

263 KB is the number that matters and it is a good one. The rest arrives per screen, and the
flags are compiled into the code rather than fetched.

**Neither route bundles any of this.** The recommended shapes both fetch the site from
`mondialino.ch`, so the 70 MB of shirt pictures is simply never requested and there is nothing
to exclude. The first draft of this plan said "the app is about 6 MB once the shirt pictures
are left out", which described work nobody does on either route. (Those pictures are also not
dead: `docs/missing-sticker-art.html` tells whoever is drawing to take the shirt from that
directory. And CLAUDE.md calls them 27 MB, which is stale by 43.)

**The game needs no server to be played.** Every squad, player and rating is compiled in, the
simulation is pure, and a guest's album, career, run and settings are all local. What
genuinely needs the network is accounts, versus, duels, and D2 above.

**And one thing needs it that should not:** the fonts. See 3.1.

---

## 2. The three routes

| | What it is | Work | What it costs for ever |
| --- | --- | --- | --- |
| **A. Installable** | The site, installable, offline, no store | **2 to 3 days** | nothing |
| **B. A, plus a store listing** | The same, listed on Play | +2 days, +4 to 6 weeks | section 0's list |
| **C. A native rebuild** | A second Mondialino in Kotlin | 2 to 4 months | two of everything |

**A is a strict prefix of B**, which is what makes D1 safe to defer.

**C is a rewrite, not a port, and it buys nothing a player can see.** The pure game logic
would survive a move and it is the smaller half. The pitch is an SVG board with HTML badges
over it; the bracket's connectors are CSS pseudo-elements hung off the match box; the market's
rating band is eleven hand-written rules around a range input; the confetti is a bespoke
canvas; the whole look is utilities over a token file. All of that is interface, all of it
would be rewritten, and **a player would not be able to tell the result from route A.** The
only honest argument for C is something the web cannot do, and this game asks for nothing of
the kind.

### 2.1 If D1 is yes, point the listing at the real site

Two ways to put a web game in the Play Store: a **Trusted Web Activity**, which is Chrome
without the browser bar pointed at `mondialino.ch`, or a **bundled shell** which copies the
built site inside the app and serves it from a local address.

**Take the Trusted Web Activity**, and the first reason is the only permanent one:

1. **One release train.** The site deploys on every push today. A bundled shell puts every fix
   behind a store review and lets the two copies drift. (Even so, be precise: it is one train
   for the game plus a compliance release a year for the wrapper.)
2. **Duel invitations stay correct.** An invitation link is built from the address the page is
   served from, so on the real address it is right, and inside a bundled shell it becomes
   `https://localhost/versus/ABC123`, which works for nobody. It is a one-line fix, because
   the link builder already takes the address as an argument, so this is a cost rather than a
   blocker. It is listed because it is the sort of thing nobody notices until a real duel is
   sent from a real phone.

The share sheet is sometimes given as a third reason and should not be: it is already
feature-detected with a copy-link fallback this repo built on purpose, so a bundled shell
degrades rather than breaks. Nor should the back gesture, which every wrapper handles.

**If Google refuses the listing, the fallback is route A, not a bundled shell.** A refusal for
being a thin wrapper is about content; the same site in different packaging is the same
content, and re-submitting it spends a second review cycle learning that.

---

## 3. The work, and it is one wave

Everything here is worth doing whether or not the store ever happens. Three of the six items
fix things that are wrong on the live website today.

### 3.1 Ship the fonts, and fix the set while doing it

`index.html` pulls Archivo, Schibsted Grotesk and Spline Sans Mono from Google with a
stylesheet link that sits **above** the module script, and a pending stylesheet blocks the
script behind it. So a network that accepts the connection and then does not answer, which is
hotel wifi, a captive portal, a tunnel, leaves the page on its loading cover indefinitely with
nothing to say why. CLAUDE.md records this as the trap that cost an hour in a sandbox with no
egress.

**Be precise about the failure, because the first draft was not:** with the radio off the
request fails immediately, the link stops blocking, and the page boots in fallback fonts. So
aeroplane mode is the case this survives, and the flaky connection is the case it does not.
Fix it first either way. It is a live-site fix, not an Android one.

**And the requested set is wrong today.** The link asks for eleven faces; measured by which
weight utility sits beside which family in the same class string:

- **Spline Sans Mono is used at 400 and 800 and neither is requested.** The browser is faking
  both, which is what synthetic bold looks like on every mono numeral in the game.
- **Archivo 500 is requested and never used.**

So this is a correctness item, not a size optimisation. Note the method: the weight utilities
are family-blind, so counting them across the codebase says nothing about which family wants
600. Pair them per family, and expect to add faces as well as drop them. Keep both the `latin`
and `latin-ext` ranges whatever happens, or the next tournament added ships with empty boxes
in the squad list.

### 3.2 Declare the app, and choose one theme colour

Name, short name, the icon set Android asks for including a maskable one, a start address,
`display: standalone`.

**One decision hides in here.** A manifest carries a single splash and status-bar colour, with
no way to vary by theme. This app has two, paper and graphite, and they are already held in
step with the design tokens by the checks. So somebody has to choose which one every launch
uses, and **half the players will get the wrong one.** Recommendation: the light one, since it
is the default and the boot cover already paints it before anything else loads.

### 3.3 Cache the shell, and decide how to undo it

A service worker, and the smallest one that does the job:

- **Code and styles: cache first**, refreshed behind the player. They are content-hashed, so
  this is safe.
- **The page shell: network first, cached fallback.** Cache first on the shell is how a
  deployed fix never reaches a player, and this site deploys on every push.
- **Every navigation is answered with the cached shell whatever the path.** The copied
  `404.html` that makes a deep path work on refresh today is a server arrangement and there is
  no server offline, so without this a cold launch on a run, a room or a squad page is a
  broken page. This is also the first thing an offline test will hit.
- **Sticker art: on demand, kept once fetched.** Precaching 4.4 MB buys 115 cards a player
  mostly does not own, and a card whose image is missing already draws a correct silhouette.
- **The account server and the referee: never cached.** A stale room is worse than no room.

**This is the only irreversible thing in this document, and it is risk one.** Every other item
here fails safely and is fixed by the next push. A returning player holds the cache, so if
what they hold is wrong, the fix has to arrive through the very thing that is wrong. Decide
the way out before the first one ships, not after: a version stamp the shell checks, and a
tested way to unregister and start clean.

### 3.4 Turn the safe areas on, because they are off

The phone tab bar already pads for the bottom inset, and **that padding is doing nothing
today**, because the viewport tag does not opt in to drawing under the system bars. The first
draft credited it as done. So this is one item, not one line: opt in, then handle the top
where the masthead would otherwise sit under the clock, then re-check the bottom bar and every
overlay layer. Worth knowing which shape you are in: a store-listed wrapper is forced
edge to edge by current Android, while a plain installed site is not, so the two need testing
separately if both happen.

### 3.5 Let a signed-in player play offline

D2's answer, and without it the headline of this plan is untrue for anybody with an account.
Recommended scope: a session that has already loaded keeps playing when the network drops,
read only, and only a cold start with no cached account state is blocked.

### 3.6 Prove it on a phone

Not "the manifest validates". Aeroplane mode, force stop, cold launch, then build an XI and
play a run to a cup, signed in and signed out, and open a deep link while offline. This
repo's own browser-testing notes apply: drive the real thing, and distrust a green check that
never opened the app.

---

## 4. If D1 is yes: what the store actually costs

Almost none of it is code, and four of these were missing from the first draft.

1. **The developer account**, its fee, and an identity check measured in days. Nothing below
   can start until it exists.
2. **The twelve testers for fourteen unbroken days.** Currently required of personal accounts
   registered since November 2023; organisation accounts are exempt, and the figure was 20
   until December 2024, so **read the current policy rather than this line**. The days only
   start once twelve people are opted in and stay opted in.
3. **A way to report a display name, which this game deliberately removed.** Versus names are
   user-chosen and appear in a lobby list any signed-in player can read, which makes them
   publicly visible user content, and Google requires both a report path and a block. The
   report was dropped on 2026-09-02 on the reasoning that the host throwing somebody out of a
   room is enough. **It is not enough for this purpose**, because it only works if the
   offender happens to be in a room you opened. Either bring the report back for the listing
   or argue in the review notes that names are unique, capped at sixteen characters, and not
   free text. This reverses a decision taken three days before this plan, which is why it is
   listed rather than buried.
4. **Account deletion needs a web page as well.** Deleting from inside the app is built and
   works. Google separately requires a publicly reachable page where somebody can ask for the
   same thing without reinstalling, and it is a declared field you cannot skip.
5. **A privacy policy, hosted and linked from inside the app.** Required of every listing, not
   only ones that collect an address, and required in both places. There is no such page or
   link anywhere today, and the data-safety form must then agree with it line for line. An
   emailed code, a display name and gameplay progress is the whole list to declare.
6. **The trademark and likeness question.** The game ships nearly ten thousand real
   footballers by name with ratings, real national teams, 115 commissioned player cards, and
   listing copy that will want to say World Cup. A fan site with a footer disclaimer and a
   store listing are not the same exposure, and a complaint lands on the developer account
   rather than only on the app. The answer may well be "accepted", but it should be an
   answer.
7. **The link declaration, and the fingerprint trap.** A file served from `mondialino.ch`
   naming the app, and the app naming the addresses it handles. Two rules: the file has to be
   live before the app is verified, and **it must carry the fingerprint of the key Google
   signs with, not the one you upload with.** Get that wrong and it works perfectly on your
   own phone and shows a browser address bar during review, which is after the fourteen days.
   List both. (The site half will ship: this repo's publishing step copies hidden folders and
   runs no Jekyll.)
8. **The content rating questionnaire**, listing assets, screenshots at phone and tablet
   sizes, a feature graphic and store copy. The screenshots are a design job for the owner and
   are usually what actually holds a submission up.
9. **The signing key, kept somewhere it cannot be lost**, and a target level that has to keep
   moving.

**Calendar: four to six weeks**, and the work inside it is about two days. Verification, then
recruiting testers, then fourteen days, then a review, then a separate application to publish.

---

## 5. What does not need doing

Recorded so nobody has to check again.

- **Sign-in.** It is a six-digit code typed into the app, and the mail contains no link at
  all, so there is no trip out to a mail client and back to plumb, and no deep-link handshake.
  This is the single biggest thing this game got right for a phone, by accident.
- **Storage.** An installed web app keeps the storage a browser tab has, and everything
  persisted already goes through one seam if it ever has to become something else.
- **Versus and duels.** Both ride ordinary web connections.
- **Copying an invitation.** The clipboard needs a secure address and gets one, and the older
  fallback covers the rest.
- **Deep links on the network.** The copied `404.html` is unchanged. Offline is 3.3's job.
- **The 70 MB of shirt pictures.** Never requested on either route.
- **Screen sizes.** The game is already phone-first: a bottom tab bar, a two-sided phone
  bracket, a phone-first build page, and a scroll dance between the panel and the pitch.

---

## 6. Two things found while writing this, which are not this plan's work

Both are pre-existing and neither is about Android. Raise them on their own merits.

- **The crest leaves a live match without asking.** The tab bar goes inert while a match is
  revealing, because the playback is not persisted; the wordmark's link home does not, so the
  hole the first draft blamed on the Android back gesture already exists in the website. It is
  smaller than it sounds: a guest's playback pointer is saved, so re-entering replays the
  match, and only a signed-in player drops back to the button. Which is also why the back
  gesture is **not** in section 3: blocking a back swipe is a thing Android players hate, and
  the real question is whether a reveal should survive being left at all.
- **CLAUDE.md is stale about the shirt pictures**, calling them 27 MB against a measured 70.

---

## 7. The risks, in the order they will bite

1. **The offline cache (3.3).** The only irreversible item here, and the only one a push to
   `main` cannot fix.
2. **The fonts (3.1).** Not fatal on a plane, as the first draft claimed, and genuinely fatal
   on a flaky connection. Also wrong in its weights today.
3. **The offline promise for signed-in players (D2).** Missed, the app fails for exactly the
   people who install it, and the store's own thin-wrapper defence fails with it, because a
   reviewer who signs in and then goes offline sees a blocking screen.
4. **(Store) The twelve testers.** The hardest item in section 4 and the one always stated
   most softly. It is not a waiting period, it is twelve people.
5. **(Store) The name-reporting requirement (4.3).** Reverses a three-day-old decision.
6. **(Store) Trademark and likeness (4.6).** The only risk on this list that could end the
   listing permanently.
7. **(Store) The signing fingerprint (4.7).** Fails after the fourteen days, not before.

---

## 8. How this becomes work

Roadmap item **59**, in **Later**, with D1 as the thing it is waiting on. Section 3 can be
picked up without answering D1; section 4 cannot be started without it.

**And 3.1 is worth doing this week regardless of everything above**, because it takes a single
point of failure out of the live website and fixes two faces the browser is currently faking.
