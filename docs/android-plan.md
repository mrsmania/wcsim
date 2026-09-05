# Mondialino on Android

A plan, not a change. Nothing here is built. Written 2026-09-05, measured against `42276ee`
by building the site and reading the code rather than this repo's own prose, which is the
lesson `docs/i18n-plan.md` was rewritten to learn.

The shape: **make the site work with no network, then let Android install it. There is no
second codebase.** Everything else is consequence.

---

## 0. The decisions the owner owes

**One now, one before publishing.**

**Now: how native is native.** Recommendation: **the site, installed.** The game becomes a
real Play Store listing with its own icon, no browser bar, and full offline play, and it is
still one codebase that deploys on a push to `main` the way it does today. A rebuilt-from-
scratch Android app is two to four months and leaves you maintaining the game twice for ever;
section 2 states why it buys nothing a player can see.

**Before publishing: where the account server lives.** It is a NAS at home. On a website an
outage is a shrug. In a store it is a one-star review, and a signed-in player currently gets
a blocking screen rather than a quiet fallback, on purpose. Section 6 states the two ways out.
This is a product decision and it does not block any of the work below, but it does block the
release.

**The honest cost, up front: about a week of work, and two to three weeks of calendar**, the
gap being a Google testing period nobody can shorten (5.5).

---

## 1. What is actually being shipped

Built at `42276ee`:

| | |
| --- | --- |
| Game code and styles | 1.3 MB, about 350 KB over the wire |
| Sticker artwork | 4.4 MB, 115 cards, already lazy-loaded |
| Shirt pictures under `public/jerseys/` | **70 MB, referenced by nothing** |
| Everything else (flags, mail template, formation art) | ~120 KB |

So the app is **about 6 MB**, once the shirt pictures are excluded. They ship with the site
today by an explicit decision (CR-D3, keep-as-is) and nothing in `src/` imports them; leaving
them out of an app bundle re-opens no argument, because the site keeps them.

**The game needs no server to be played.** Every squad, player and rating is compiled in
(`src/data/squads.ts`, 486 KB of source), the simulation is pure, and the album, career, run
and settings are all local for a guest. What genuinely needs the network is accounts, versus
and duels.

**And one thing that needs it and should not:** the fonts. See 3.1.

---

## 2. The three routes, and why the middle one wins

| | What it is | Work | What it costs for ever |
| --- | --- | --- | --- |
| **A. Home-screen install** | The site, installable, offline, no store | ~3 days | nothing |
| **B. A. plus a store listing** | The same, wrapped for Play | ~1 week | a release train |
| **C. A native rebuild** | A second Mondialino in Kotlin | 2 to 4 months | two of everything |

**A is a strict prefix of B.** Every hour spent on A counts towards B and none of it is
thrown away, which is why section 5 orders the work this way rather than starting with the
store. It also means A can ship on its own and be judged on a real phone before anybody buys
a developer account.

**C is a rewrite, not a port.** The pure game logic under `src/domain/` would survive a move
to React Native and it is the smaller half; the pitch is an SVG board with HTML badges over
it, the bracket is drawn with CSS pseudo-element connectors, the market's rating band is a
hand-styled range input, the confetti is a canvas, and the whole look is Tailwind utilities
over a token file. All of that is the interface, all of it would be rewritten, and a player
would not be able to tell the result from route B. The only honest argument for C is
something the web genuinely cannot do, and this game asks for nothing of the kind.

### 2.1 Inside B there is a real fork, and it decides four other items

Two ways to put a web game in the Play Store:

- **A Trusted Web Activity.** The app is Chrome without the browser bar, pointed at
  `mondialino.ch`. It runs **on the real address**, updates the instant you push to `main`,
  and Chrome supplies the back button and the share sheet.
- **A bundled shell (Capacitor and its like).** The built site is copied inside the app and
  served from a local address. Every update needs a store release and a review.

**Recommendation: the Trusted Web Activity**, and the reason is not effort, it is that four
separate problems simply do not arise:

1. **The invitation link stays correct.** A duel link is built from the address the page is
   being served from (`window.location.origin`, in `RoomLobby` and `DuelPanels`). On the real
   address that is right. Inside a bundled shell it becomes `https://localhost/versus/ABC123`,
   which works for nobody, and the mode whose whole social mechanism is a pasted link would
   ship broken.
2. **The Share button survives.** It is feature-detected on `navigator.share`, which Android's
   plain web view does not provide, so a bundled shell would silently drop the share sheet
   from the one screen that exists to pass a link to somebody. A Trusted Web Activity is
   Chrome and has it.
3. **The back gesture is handled**, including within the app's own history.
4. **There is one release train.** The site deploys on every push today. A bundled shell would
   put every fix behind a store review, and the two copies would drift.

The cost of that choice: the app needs Chrome present (true on effectively every phone that
matters), and native platform features are out of reach. Nothing in this game wants one.

**If Google refuses the listing** (see 5.6), the fallback is the bundled shell, and items 1
and 2 above become real work: half a day each.

---

## 3. Wave 1: make it work with no network

**This is the whole of route A, it is the majority of the work, and it is also the argument
that gets route B accepted.** A game that plays on a plane is not a thin wrapper.

### 3.1 Ship the fonts. This one is fatal and it is already documented.

`index.html` pulls Archivo, Schibsted Grotesk and Spline Sans Mono from Google Fonts with a
stylesheet link that sits **above** the module script. A pending stylesheet blocks script
execution, so with no route to `fonts.googleapis.com` the page sits on its loading cover for
ever: `#root` empty, nothing stamped, **no console error and no failed request to say why.**
CLAUDE.md already records this as the trap that cost an hour in a sandbox with no egress. On
a phone it is a tunnel, a lift, or aeroplane mode, and it is the first thing a store reviewer
will do.

The fix is to serve the font files ourselves. Two things to settle while doing it:

- **Which weights.** The link asks for Archivo 500/700/800/900, Schibsted 400/500/600/700 and
  Spline Mono 500/600/700, ten faces. Count the weights actually used in `src/` before
  shipping ten; each unused face is dead weight in a 6 MB app.
- **Which character ranges.** `latin` and `latin-ext` cover every accent in the dataset's
  player and nation names. Keep both. Do not subset by the characters present today, or the
  next tournament added ships with tofu in the squad list.

Rough size: 150 to 400 KB depending on the weight count, self-hosted as woff2.

**This item is worth doing whatever else is decided.** It removes a single point of failure
from the live website too.

### 3.2 Declare the app: a manifest and icons

Name, short name, the icon set Android asks for (including a maskable one, or the icon gets
cropped into a circle badly), `display: standalone`, start address, and the two theme colours.
The colours already exist twice over as literals in the boot cover and once as tokens, and
`npm run checks` already holds those two copies against each other. **A third copy joins that
check or it will drift**, which is exactly the failure that check was written for.

### 3.3 Cache the shell so a second launch needs nothing

A service worker, and the smallest one that does the job rather than a framework:

- **The built code and styles: cache first**, refreshed in the background. They are
  content-hashed, so this is safe.
- **The page shell: network first with a cached fallback.** Cache-first on the shell is how a
  deployed fix never reaches a player, and this site deploys on every push.
- **Sticker art: on demand, kept once fetched.** Precaching 4.4 MB at install is 4.4 MB spent
  on 115 cards a player mostly does not own yet, and the app already draws a silhouette for a
  card whose image will not load, so the offline gap has a correct rendering already
  (`STICKER_PLACEHOLDER_SRC`). A card fetched once is then owned for good.
- **The account server and the referee: never cached.** A stale room is worse than no room.

### 3.4 Prove it

Not "the manifest validates". Aeroplane mode, force-stop, cold launch, then build an XI and
play a whole run to a cup. The known trap from this repo's own browser testing applies:
drive the real thing, and do not trust a green check that never opened the app.

---

## 4. Wave 2: make it feel like a phone app

Small, and only one item is more than an hour.

### 4.1 The status bar

An installed app owns the whole screen. The phone tab bar already pads for the bottom inset
(`navUi.tsx` carries `pb-[env(safe-area-inset-bottom)]`), and nothing pads for the top, so the
masthead would sit under the clock. One inset on the page container.

### 4.2 The back gesture during a live match

Chrome maps back onto history, so ordinary navigation is free. **One case is not free:** the
app already treats the navigation as busy while a match is revealing, because the live
playback is deliberately not persisted and leaving the screen loses it. The tab bar goes inert
on that signal; a back swipe would not, so a player can lose a match they are watching with a
gesture the app has no opinion about. Either the same signal blocks it, or the reveal survives
a leave. **Blocking a back gesture is a thing Android users hate**, so the honest answer may
be the second one, which is a bigger change and belongs in its own item rather than smuggled
in here.

### 4.3 Let a duel link open the app

An invitation is pasted into a message and tapped on a phone, and it should land in the app
rather than a browser tab. That is a two-sided declaration: a file served from
`mondialino.ch` naming the app, and the app naming the addresses it handles. The site half
ships with the site, which the custom domain move already proved works.

**This is the one item with an ordering rule:** the file has to be live on the site before the
app is verified, or the link opens a browser and the app looks broken.

---

## 5. Wave 3: the store

Almost none of this is code, and it is the part that is always underestimated.

1. **A developer account.** One-off fee, and an identity verification that takes days.
2. **Listing assets.** Icon, feature graphic, phone screenshots and tablet screenshots, short
   and full description. The game photographs well: the pitch, the album, a bracket, a result.
3. **A privacy policy, hosted.** Required because the game asks for an email address. It has
   to say what is collected, why, where it is held, and how to be deleted. **The hard half is
   already built:** the game deletes an account on request.
4. **The data safety declaration**, which must agree with that policy line for line. An
   emailed sign-in code, a display name and gameplay progress is the whole list.
5. **The closed-testing gate.** A personal developer account must run a closed test with a
   minimum number of testers for a minimum period before it may apply for production. Numbers
   move, so read the current policy rather than this line; the last published figures were
   **12 testers for 14 days**. **This is the whole reason the calendar is longer than the
   work**, and it cannot be compressed, so start it early and do the listing copy while it
   runs.
6. **The thin-wrapper risk, and the defence.** Play rejects apps that are a website in a
   frame with nothing added. The defence is wave 1: this one installs, plays a full game with
   the network off, and has its own icon and offline art. Say so in the review notes. If it is
   refused anyway, section 2.1 has the fallback and its price.
7. **Signing, target level, release track.** A key kept somewhere it cannot be lost, since
   losing it means the listing can never be updated again.

---

## 6. The server question, which is a product decision and not a task

A signed-in player whose server is unreachable currently gets a blocking screen with a
"continue as guest" escape (cloud-sync D9). That rule is **correct and deliberate**: the
alternative was inventing local progress and then having to reconcile it, which loses data
quietly instead of loudly.

A store listing changes what that rule costs, not whether it is right. Two ways out:

- **Move the server** somewhere with an uptime promise. Nothing in the client changes; the
  address is already a build variable.
- **Soften the rule** so an unreachable server drops to reading the last known state rather
  than blocking. This is a real design change with a real risk (two devices diverging), and it
  is the thing the D8 two-worlds rule exists to prevent. **Do not do this casually to ship an
  app.**

Recommendation: **move the server.** It is the smaller change and the only one that does not
re-open a settled design.

---

## 7. What does not need doing

Recorded so nobody has to check again.

- **Sign-in.** It is a six-digit code typed into the app, not a link followed out to a mail
  client and back, so there is no return trip to plumb and no deep-link handshake. This is the
  single biggest thing this game got right for a phone, by accident.
- **Storage.** An installed web app keeps the same storage a browser tab has. If it ever needs
  to become something else, everything persisted already goes through one seam
  (`state/store/`), which is one implementation behind an interface that exists.
- **Versus and duels.** Both ride ordinary web connections and both work.
- **Copying a link.** The clipboard needs a secure address and gets one; the older fallback
  already there covers the rest.
- **Deep links inside the app.** The `404.html` copy is a GitHub Pages arrangement for
  refreshing a deep path, and nothing about it changes.
- **The 70 MB of shirt pictures.** An exclusion, not a decision.
- **Screen sizes.** The game is already built for phones, with a bottom tab bar, a two-sided
  phone bracket and a phone-first build page.

---

## 8. Order of work, and what each wave is worth alone

| Wave | Days | What a player gets |
| --- | --- | --- |
| 1. Offline and installable (3.1 to 3.4) | 2 to 3 | An icon on the home screen, full screen, plays on a plane |
| 2. Phone manners (4.1 to 4.3) | 1 | Correct under the status bar, duel links open the app |
| 3. The store (section 5) | 1 to 2, plus a two-week gate | A Play Store listing |
| The server (section 6) | separate | Nothing visible, until it is everything |

**3.1 alone is worth shipping this week**, whatever is decided about the rest: it takes a
single point of failure out of the live website.

---

## 9. The risks, in the order they will bite

1. **The fonts (3.1).** Missed, the app is a blank screen offline, and it fails silently.
2. **The closed-testing gate (5.5).** Not a risk to the work, a risk to the promise. Two weeks
   of calendar appear from nowhere if nobody reads it first.
3. **Store rejection as a thin wrapper (5.6).** Mitigated entirely by wave 1 having been done
   properly, which is the argument for doing it first.
4. **The bundled-shell fallback.** If the recommendation in 2.1 is overturned, the invitation
   link and the share sheet both break, and neither breaks in a way anybody notices until a
   real duel is sent from a real phone.
5. **The back gesture during a match (4.2).** The only item here that touches game behaviour
   rather than packaging, and the only one that could turn into a bigger change.
6. **Server uptime (section 6).** Last to bite, hardest to fix afterwards, and the only one on
   this list that a review cannot catch.
