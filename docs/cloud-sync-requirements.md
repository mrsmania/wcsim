# Cloud Sync & Accounts — Requirements

**Status:** Requirements **settled** (no open questions).
**Date:** 2026-07-02, revised 2026-08-11
**Design:** `docs/cloud-sync-design.md` (written 2026-08-11) covers the stack, schema, RLS,
the function surface and its validation rules, auth configuration, save points, the client
storage adapter, and a 7-step build order. This document stays requirements-only and
deliberately contains no schema, endpoints, or implementation.
**Next step:** build order step 1, the client storage adapter refactor, which needs no server.

> **2026-08-11 revision.** Two rounds of decisions closed this document out.
>
> 1. **Model:** from "local-first with background sync and reconcile" to **fully decoupled
>    guest and account worlds** (D8, D9). Guests are local-only; a logged-in user reads and
>    writes the database and nothing else. Two copies can never diverge, so the
>    merge/reconcile problem is gone. The first-login import is a **move**: local guest data
>    is deleted once the server write is confirmed (FR-16a). FR-10 to FR-17 and NFR-1 were
>    rewritten; old open questions 1 to 3 settled.
> 2. **Architecture and the remaining questions:** **self-hosted Supabase on the NAS**
>    (D10), **Google + email OTP only** (D11), **invite-only signup** (D12). All seven
>    remaining open questions are answered (see §7); what is left there is a deployment
>    checklist of values to supply, not decisions.

---

## 1. Goal

Today the World Cup Simulator is 100% client-side: all progress lives in `localStorage`
(`wcsim:game:v1` game state, `wcsim_album_v1` sticker album, `wcsim_album_stats_v1`
telemetry, `wcsim_career_v1` career, `wcsim_run_v1` the active Cup Run) and it deploys as a
static site to GitHub Pages. This enhancement adds an **optional account** whose progress
lives in a **self-hosted Postgres** on the owner's Synology DS723+ NAS, so a collection
survives a cleared browser and is the same on every device — **without ever forcing anyone
to sign in** (NFR-1). Guest play stays exactly as it is today and never touches the server.

## 2. Locked decisions (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| D1 | What syncs | **Everything**: sticker album, active run (draft/group/knockout), stats, and settings |
| D2 | Account model | **Guest-first + optional login** (see NFR-1). Guests play exactly as today with no server involved; signing in moves progress to the account |
| D3 | Integrity | **Trust client + sanity limits**: client reports earned/traded stickers; server applies validity checks, rate limits, and an append-only audit log |
| D4 | Deployment | SPA stays on **GitHub Pages**; the API + Postgres run on the **NAS**, exposed via port-forward + **DSM reverse proxy + Let's Encrypt + DDNS** (two origins → CORS) |
| D5 | OTP delivery | 6-digit email codes sent via **Gmail SMTP**, from a dedicated mailbox (`worldcupsim2026@gmail.com`-style). Needs 2FA + an **App Password**; ~500 sends/day is far above need. Accepted risk: a plain gmail.com sender sometimes lands in spam; a transactional sender is the upgrade path |
| D6 | Identity | **One account per verified email**; the offered sign-in methods (D11) that share a verified email resolve to the same account |
| D7 | Audience | **Private now, public later**: build for a small known set first, but specify abuse/rate-limit/privacy controls so opening up is a config change, not a rewrite |
| D8 | Guest vs account | **Two separate worlds, never mixed.** Guest progress lives in `localStorage`; account progress lives **only** in the database. Nothing syncs or merges between them. The single crossing point is a **one-time, user-confirmed import** at first login |
| D9 | Server dependency when logged in | **Logged in requires the server.** If the API/DB is unreachable, a logged-in user **cannot play**: a blocking "server unreachable" state with a retry, plus a "continue as guest" escape hatch (which starts/resumes separate local progress and never copies account data down). No unsaved logged-in play, so no second copy ever exists to reconcile |

| D10 | Stack | **Self-hosted Supabase on the NAS** (Docker): Postgres + Auth + PostgREST + gateway, with Realtime / Storage / imgproxy / Edge Runtime **trimmed out**, and Studio **LAN-only**. Rejected: hosted Supabase free tier (**auto-pauses after 1 week of inactivity**, which under D9 means a sporadically-played game finds its DB asleep and needs a manual dashboard restore; the 2-free-project cap is also per user across all orgs, and the existing projects are themselves too idle to lean on) and a hand-rolled API (2 containers instead of ~5, but you then write Google OAuth, OTP issue/verify, sessions with revocation, and rate limits yourself, which is exactly what Auth gives for free) |
| D11 | Sign-in methods | **Google + email 6-digit OTP only. GitHub dropped for v1.** GitHub allows a private email and can return no email at all, which has nothing to key an account on under D6; Google always returns a verified email. Adding GitHub later reopens that edge case and needs an "enter an email, verify by OTP" fallback |
| D12 | Signup | **Invite-only / allowlist**, rate-limited, with the open-signup switch kept as **config** (D7). Note "public" here means open *account creation*: the game itself is already publicly playable as a guest on Pages |

**Why D8/D9.** The reconcile policy for mutable data (duplicate counts, trade history, the
single active run) was the hardest question in this document and had no clean answer: union
is wrong for spendable currency, and last-write-wins silently destroys a trade the player
already saw succeed. Decoupling removes the question instead of answering it. The cost is
that the NAS becoming unreachable blocks logged-in play, which is acceptable because the app
is a static SPA with no service worker: with no connection at all the page does not load
anyway, so the only new failure mode is "page loads, NAS is down", and that is what D9's
blocking state plus guest escape hatch covers.

**Why the SPA stays on GitHub Pages (D4 confirmed, not overturned).** Moving the whole app
onto the NAS was considered, purely to get a single origin and dodge the cross-site session
cookie problem (a `SameSite=None` cookie from github.io to the NAS host is a third-party
cookie, which **Safari blocks by default**, so cookie sessions would work on desktop Chrome
and silently fail on iPhone). Supabase's client authenticates with a **bearer token in a
header**, not a cookie, so that problem never arises and CORS is one gateway setting. Keeping
the SPA on Pages therefore costs nothing and is strictly better for NFR-1: guest play rides
on always-up hosting and only *logged-in* play depends on the NAS.

**Consequences of D10 to record:**
- **TLS on the API host is mandatory, not optional.** An HTTPS page cannot call an HTTP
  endpoint (mixed content is blocked), so DDNS + reverse proxy + certificate is required
  work, not a nice-to-have.
- **SMTP is on us** (a hosted Supabase would have sent the OTP mail), so D5 is load-bearing.
- **Only the anon/publishable key may reach the browser.** The secret/service key is
  server-side only, and **row-level security is the actual security boundary**.
- **Self-hosted upgrades are manual**, and occasionally need hand-applied migration steps.

## 3. Scope

**In scope**
- Optional accounts with **two** sign-in methods: Google and email 6-digit code (D11).
- Account-side storage of album, active run, stats, and settings, identical on every device.
- Guest-to-account **import** on first login (a move, FR-16a).
- Server-side integrity guard rails for the sticker economy.
- Self-hosted Supabase (Postgres + Auth + PostgREST) on the NAS; SPA continues to ship to
  GitHub Pages.

**Out of scope (for this feature)**
- Multiplayer, sharing, leaderboards, or trading between users. **Note:** leaderboards /
  highscores are an *intended future account-only* feature (see NFR-1), so the design must
  not preclude them: record finished-run results per account from the start rather than
  needing a migration later.
- Changing core gameplay rules or the sticker tiers/economy.
- Fully server-authoritative simulation / re-running matches on the server (see D3).
- A native/mobile app.

---

## 4. Functional requirements

### 4.1 Accounts & authentication
- **FR-1** The app must remain fully usable with **no account** (guest, local-only), exactly as today.
- **FR-2** A user may sign in via **Google** or **email 6-digit code** (D11). Both are offered on one sign-in surface. GitHub is deliberately not offered in v1.
- **FR-3** Email login is passwordless: a **6-digit numeric code** is emailed on **every** login attempt. No password is ever stored.
- **FR-4** Email codes must **expire** after a short window, be **single-use**, and be **invalidated** on a successful login or when a newer code is issued for the same address.
- **FR-5** Google sign-in yields a **verified email**, which is the account's identity key (D6). Should a provider ever return no verified email (the reason GitHub is out, D11), the app must ask for an email and verify it by OTP rather than creating an account with no identity key.
- **FR-6** Both methods on the same verified email **resolve to one account** (D6). The signed-in email must be **visible in the UI**, so a user who has two addresses can at least see which account they are in.
- **FR-7** Sessions **last 60 days** and persist across visits. Sign out must be available, and **"sign out everywhere" is in v1** — which rules out purely stateless tokens: revocation must actually revoke (server-side session records, or a per-user token version).
- **FR-8** The whole accounts feature must sit behind a **feature flag** and degrade cleanly: with the flag off the app behaves exactly like today's static build, and no account code runs.

### 4.2 Sync & storage
- **FR-9** For a signed-in user, the server persists their **album, active run, stats, and settings** (D1) in Postgres on the NAS.
- **FR-10** For a signed-in user the database is the **only** store (D8): the client reads from and writes to it, and does not keep a parallel local copy of account progress. Any on-device data for a signed-in session is a transient render cache, never a source of truth and never synced upward.
- **FR-11** Because there is only one copy, **no collected sticker can be lost to a merge**. Writes are **version-numbered per account** (optimistic concurrency): a write against a stale version is rejected, and that client reloads current state (this is the two-devices-signed-in-at-once case, D8 note).
- **FR-12** If the API/DB is **unreachable** while signed in, the app must show a **blocking, retryable "server unreachable" state** rather than continuing to play (D9). It must offer **"continue as guest"**, which switches to separate local progress and neither reads nor writes account data. The blocking state must be reachable mid-run, not only at load.
- **FR-13** The user must get clear, lightweight **status feedback**: signed-in identity, saved/last-saved indication, and an unmistakable indication when the server is unreachable (FR-12).
- **FR-14** Signing out returns the user to guest/local behavior. Account data is **not** copied down on sign-out (D8); any pre-existing guest data on the device is left intact and resumes.

### 4.3 Guest → account crossing (one-time import)
- **FR-15** On a login where the **account has no progress yet** and the device has guest progress, the app must offer a **one-time, explicitly confirmed import** ("bring your guest progress into this account" vs "start fresh"). It is never automatic and never silent.
- **FR-16** The import is **one-way and once per account** (guest → account, D8). After it, the two worlds are independent: later guest play does not flow into the account, and account progress never flows back to local storage. If the account already has progress, no import is offered.
- **FR-16a** The import is a **move, not a copy**: once the server write is **confirmed**, the device's guest data is **deleted**. Rationale: it prevents a stale twin of the account sitting in local storage, and it means an un-logged-in visit visibly starts from scratch, which is itself a signal that you are not signed in.
  - **Ordering is a hard requirement:** write to the server and confirm **first**, delete locally **second**. Never delete before a confirmed write, or a failed import destroys the only copy.
  - **Keys cleared:** `wcsim:game:v1`, `wcsim_album_v1`, `wcsim_album_stats_v1`, `wcsim_career_v1`, `wcsim_run_v1`, `wcsim_run_reveal_v1`. Note this deliberately includes the **album** keys, which are otherwise kept separate precisely so a game reset never wipes the album (`clearAlbum()` in `state/albumStorage.ts`) — the import is the one case that clears them. Settings (`wcsim_settings_v1`) are **not** cleared: they are per account (NFR-10), so the account copy supersedes the local one rather than being migrated from it, and leaving the file lets a later guest session keep its own preferences.
  - **No guest data is ever deleted without an import.** If a login offers no import (the account already has progress, FR-16), the device's guest progress is left intact: it was never banked anywhere, so deleting it would destroy the only copy. In that case "continue as guest" (FR-12) resumes it as normal, and the signed-in/guest distinction is carried by a **visible UI affordance**, not by the absence of data.
- **FR-17** There is at most **one active run** per account, held server-side. Two signed-in devices touching it are resolved by the version check in FR-11 (the stale device reloads), not by a merge.

### 4.4 Integrity & anti-abuse (D3, D7)
- **FR-18** The server holds the **authoritative album** for signed-in users; trades and earns are validated against server state, not the client's word alone.
- **FR-19** Earned stickers are accepted only when **plausible**: valid collectible ids, cup-pick only after a recorded cup win, run-end applied **at most once per run**, and within the game's own limits (e.g. ≤ 2 collectible swaps/run) as reported.
- **FR-20** Trades are accepted only when **affordable per server-side duplicate totals** and follow the tier/cost rules.
- **FR-21** The server keeps an **append-only audit log** of earn/trade/merge events (for spotting abuse and debugging), and enforces **rate limits** on OTP requests, logins, and sync/earn calls.
- **FR-22** Abuse controls are **specified now but tunable**: relaxed for the private phase, tightenable for public without code changes (D7).

### 4.5 Account management & data rights
- **FR-23** A user can **sign out** on this device, **sign out everywhere** (FR-7), and see the email their account is keyed on (FR-6).
- **FR-24** A user can **delete their account and data** (needed before "public"; and reasonable under Swiss nFADP / GDPR-style expectations).
- **FR-25** A user should be able to **export** their collection. **Promoted from nice-to-have:** with NFR-6 backups deferred, this is the only route by which a player (including the owner) can hold a copy of their own album outside the single NAS.

---

## 5. Non-functional requirements

- **NFR-1 Guest-first (highest priority).** The **core game is fully playable without an account**, and guest play never contacts the server: drafting, the full dataset, the album, career progression, and challenges. An account adds **continuity and safety** (the same album, career, and challenges on every device, plus off-device backup), and **may also gate features that are inherently online or social, such as leaderboards / highscores**. It must not gate core single-player gameplay, content, or progression. (This replaces the earlier "offline-first" framing: the app is a static SPA with no service worker, so with no connectivity it does not load at all, making "offline play" moot; what matters is that no one is ever forced to sign in.)
  - **Consequence of D9:** for a *signed-in* user the NAS **is** on the critical path (unreachable = blocked, with a guest escape hatch). Guests are unaffected, because the SPA is served from GitHub Pages, not the NAS (D4).
- **NFR-2 Security.** OAuth handled via the provider (no passwords stored); OTP codes are short-lived, single-use, rate-limited, and lockout-protected against brute force; the API is **HTTPS-only and this is mandatory** (mixed content from the HTTPS SPA would be blocked outright, D10); secrets (OAuth client secret, SMTP credentials, DB credentials, the Supabase secret key) are server-side only and **never** in the bundle; the browser gets the anon/publishable key only, with **row-level security as the real boundary**; Studio is **LAN-only**, never exposed; sessions are revocable (FR-7).
- **NFR-3 Cross-origin (mechanism decided).** The SPA (Pages) and API (NAS) are **different origins** (D4), and auth is a **bearer token in a header**, not a cookie — so third-party-cookie policy (Safari blocks `SameSite=None` cookies by default) is irrelevant, and the requirement reduces to a **CORS allowlist** on the gateway for the Pages origin plus localhost for dev. Token storage in the client is an XSS exposure, mitigated by the app rendering no user-supplied HTML.
- **NFR-4 Privacy.** Store the **minimum**: identity (verified email + linked provider ids), the game data in D1, and audit/telemetry. A short privacy note is required before public launch; email addresses are treated as personal data.
- **NFR-5 Performance.** Auth is not on the hot path of play. For a signed-in user, saves happen at a **small number of defined points** (once per knockout round, and at run end for album/career), not continuously, so a save round-trip must feel instant on a home LAN and be tolerable over the exposed WAN link. The DS723+ (32 GB RAM) is comfortably oversized for the expected load.
- **NFR-6 Backups / durability — explicitly deferred, accepted risk.** The NAS Postgres is the **only** copy of account data (D8). **No backup is in scope for now** (decided 2026-08-11): a disk failure or a bad delete loses every account's album, including the owner's, permanently. Recorded so it is a known choice rather than an oversight. Cheapest future insurance, in order: keep **FR-25 (client-side export)** as the user-facing escape valve, then a scheduled `pg_dump` into a folder Hyper Backup already covers, then a restore test.
- **NFR-7 Scalability.** Private phase: tens of users. Public phase: design should hold to low thousands of accounts on the single NAS without re-architecture; concurrency is low (a solo game).
- **NFR-8 Observability / ops.** Basic health check, error logging, and the audit log (FR-21). The stack must be operable as containers on the NAS (DSM Container Manager) with straightforward start/stop/update and cert renewal. Under D10, self-hosted version bumps are a manual and occasionally hands-on step.
- **NFR-9 Consistency with the app's conventions.** Keep gameplay/domain logic framework-free and unchanged; the storage layer wraps it. Ship behind a `FEATURES`-style flag; keep the static build path (and the GitHub Pages deploy) intact.
- **NFR-10 Settings are per account (D1, decided 2026-08-11).** Every setting is held on the account from the start, not device-local. Known wrinkle, not a blocker: appearance (dark mode) then follows the account, so signing in on a bright office screen inherits a home preference. If that grates, add a device-local override on top of the account default rather than splitting the model.

---

## 6. User stories & acceptance criteria

- **US-1 — Guest keeps playing.** As a visitor with no account, I can draft, play, and build my album with no server involved at all. *AC:* no login prompt blocks play; nothing regresses vs today; no network calls are made on a guest's behalf.
- **US-2 — Back up my collection.** As a player, I can sign in (Google or email code) so my album lives off my browser. *AC:* on first login I am offered the one-time import of my guest progress (FR-15); after that, clearing the browser and logging back in restores the account collection.
- **US-3 — Play on a second device.** As a signed-in player, my collection is the same everywhere. *AC:* a sticker earned on device A is present on device B on next load, because both read the one server-side collection.
- **US-4 — Email code login.** As a player, I enter my email, receive a 6-digit code, and enter it to sign in. *AC:* a fresh code arrives each login; it expires and is single-use; wrong/expired codes are rejected with a clear message; repeated requests are rate-limited.
- **US-5 — Linked identity.** As a player who used Google once, logging in later with an email code on the same address lands me in the **same** account. *AC:* one collection, not two; the signed-in email is visible so a mismatch is at least diagnosable.
- **US-6 — Honest failure when the server is down.** As a signed-in player, if the NAS is unreachable I am told clearly and not allowed to play on into a void; I can retry, or continue as a guest. *AC:* a blocking retryable state appears (at load or mid-run); no account progress is invented locally; "continue as guest" gives separate local progress and leaves the account untouched.
- **US-7 — Fair economy.** As a player, I can't gain stickers I didn't legitimately earn by poking the API. *AC:* invalid/duplicate/unaffordable earn/trade calls are rejected and audited.
- **US-8 — My data is mine.** As a player, I can delete my account (and ideally export my collection). *AC:* deletion removes my personal data; export produces a portable copy.

---

## 7. Open questions — none. All resolved 2026-08-11.

Kept with their answers so the reasoning is not re-litigated.

**Closed by the decoupled model (D8/D9):**

- ~~Conflict resolution for mutable data.~~ No longer applicable: one store per world, so
  duplicate counts and trade history cannot diverge. Concurrent signed-in devices are
  handled by version-numbered writes (FR-11), which is a rejection, not a merge.
- ~~Active-run conflict.~~ Same: the run lives server-side; the stale device reloads (FR-17).
- ~~Earn model (run result vs per-event deltas).~~ Falls out of D8: the client writes to the
  server at its defined save points and the server validates each write (§4.4 unchanged),
  so there is no offline delta queue to replay.
- ~~Guest data after import.~~ The import is a **move**, so the local copy is deleted once
  the server write is confirmed (FR-16a). An un-logged-in visit then starts from scratch,
  which doubles as the signal that you are not signed in.

**Closed by the second round:**

- ~~Session persistence.~~ **60 days**, and **"sign out everywhere" is in v1** (FR-7).
- ~~Provider email edge cases.~~ Removed by dropping GitHub (D11): Google always returns a
  verified email. Returns only if GitHub is added later.
- ~~SMTP specifics.~~ **Gmail SMTP from a dedicated mailbox** (D5), App Password, spam risk
  accepted. Note this is now load-bearing: self-hosted Auth means we send the mail (D10).
- ~~NAS exposure.~~ Path confirmed: **DSM reverse proxy + Let's Encrypt + DDNS**, and TLS is
  **mandatory** rather than optional (D10). The remaining items are values to fill in, below.
- ~~Backup/restore.~~ **Explicitly deferred**, accepted risk (NFR-6).
- ~~"Public later" trigger.~~ **Invite-only for now**, rate-limited, with the open-signup
  switch kept as config (D12).
- ~~Settings scope.~~ **Everything per account** from the start (NFR-10). FR-16a still leaves
  `wcsim_settings_v1` on the device at import time, since it is superseded by the account copy
  rather than migrated into it.

### To supply at implementation time (values, not decisions)

- DDNS provider + hostname for the API, and the router port to forward.
- Google OAuth client id + secret (redirect URL = the API host).
- The Gmail mailbox, and its App Password (needs 2FA enabled on that account).
- How the invite allowlist is seeded (default: an `allowed_emails` table, one insert per
  person; adding someone is a one-line SQL statement).

**§8 walks through all of this in plain English, in the order it has to happen.**

### Delegated to `docs/cloud-sync-design.md` (design decisions, not open requirements)

Recorded here so nothing is silently forgotten:

- **Schema shape.** Recommended: **normalized** album and finished-run results (so
  leaderboards are possible without a migration, per §3), the **in-progress run as a blob**
  (only its owner ever reads it), settings as a blob.
- **How economy writes are enforced.** Recommended: deny direct client writes to album
  tables via RLS and expose **Postgres functions (RPC)** for run-end earns, the cup pick,
  and trades, so the §4.4 rules live server-side. RLS alone would let a user write
  implausible rows into their *own* account, which D3 tolerates but the functions make
  unnecessary.
- **The concrete validation list** implementing FR-18 to FR-21 (valid collectible ids, at
  most one run-end application per run, cup pick only after a recorded win, trades affordable
  against server duplicate totals, at most 2 collectible swaps per run).
- **Client storage adapter.** The four storage modules (`persist.ts`, `albumStorage.ts`,
  `careerStorage.ts`, `runStorage.ts`) behind one interface with a local and a remote
  implementation. **Shippable now, before any server exists**, as a pure refactor with the
  existing localStorage code as the only implementation.
- **Container set** kept from the Supabase compose, and the trimmed-out services.
- **Local dev story** (point dev at the NAS instance vs a local compose) and **migrations**
  (the career state already has a v1→v2 client-side migration; the server needs its own).

---

## 8. What the owner has to do by hand (plain English)

> **Sit-at-the-box version:** `docs/nas-setup.md` is the same ground as an operational
> checklist (exact DSM pages, which compose services to delete, which environment values to
> set, the invite-list insert, the phone test). This section is the why and the shape.

Everything in this list needs a human with passwords and a router. None of it can be written
in code, and most of it has to exist **before** the app code can be tested against anything.
Roughly in order.

### Step 0: the one thing to check first

**Can you actually be reached from the internet?** Some internet plans (especially mobile or
5G ones) put you behind shared address space, and then no amount of router configuration will
let a phone on mobile data reach your NAS. Before anything else, confirm your connection has
a real public address and that your router lets you forward a port to a device on your
network. If it does not, the whole plan still works, but you would reach the NAS through a
tunnel service (Cloudflare Tunnel is the usual answer, needs no open port and hides your home
address) instead of opening a port. Worth ten minutes now rather than discovering it after
everything else is built.

### Step 1: accounts to create, outside the NAS

1. **A Gmail mailbox for the game** (the `worldcupsim2026@gmail.com` idea). This is the
   address the login codes are sent *from*. Turn on two-factor on it, then generate what
   Google calls an **App Password**: a one-off password that a program can use to send mail,
   because Google will not let software log in with your normal one. Save that password
   somewhere safe. You will paste it into the NAS configuration once.
2. **A Google sign-in registration.** In Google's developer console you create a project and
   register the game as an application that people can sign in to. It gives you two strings,
   an ID and a secret, and it asks you for the web address it should send people back to
   after they sign in (that will be your NAS address plus a fixed path, so this step comes
   after step 2 below, or you come back and edit it). You are only asking Google for a
   person's name and email address, which is the least sensitive category, so there is no
   review process to sit through. You can either list the handful of email addresses that are
   allowed to test it, or publish it so anyone can use it.
3. **A hostname.** Your home address changes, so you need a name that follows it. Synology
   gives you one free (something like `yourname.synology.me`) and it keeps the name pointed
   at you automatically. Use that unless you would rather use a domain you own.

### Step 2: the NAS, roughly an evening's work

4. **Turn on the hostname and get a certificate.** Both are pages in the DSM control panel:
   register the free hostname, then request a free Let's Encrypt certificate for it. The
   certificate is what makes the address `https://`, and that is not optional here: the game
   is served over `https` from GitHub, and a secure page is forbidden by browsers from talking
   to an insecure one. DSM renews the certificate on its own once it is set up.
5. **Open one port on your router** and point it at the NAS, then set up a **reverse proxy
   rule** in DSM. A reverse proxy is just a receptionist: everything arriving at your
   hostname gets handed to the right program inside the NAS. You add exactly one rule, for
   the database's front door. You deliberately do **not** add a rule for the admin dashboard,
   so that stays reachable only from inside your own home network.
6. **Install Container Manager** (DSM's Docker app) if it is not already there, and create a
   project from the compose file that will be in the repo. This is the part that actually
   starts the database and the login service.
7. **Fill in the configuration file** that sits next to the compose file. It holds: the
   database password, a long random signing secret and the two keys derived from it, the
   dashboard login, your Gmail address and its App Password, the Google ID and secret from
   step 1, your hostname, and the web address of the game so logins are allowed to come from
   it. All of these are invented or pasted by you, they live only on the NAS, and none of them
   goes into the repository.
8. **Pick where the database files live** on the NAS volume, and leave it alone thereafter.

### Step 3: connect the game to it

9. **Two values go into the app's build:** the address of your NAS service and the public key
   that the browser is allowed to use. Because the game is built and deployed by GitHub
   automatically, these have to be added in the repository's settings so the build can see
   them. Neither is dangerous to expose, the public key is designed to ship inside the
   browser, and the actual protection is the database's own per-user rules.
10. **Say who is allowed in.** Signup is invite-only, so allowed addresses live in a small
    table. Adding a friend is one line of SQL in the dashboard. Adding yourself is the first
    thing you will do.

### Step 4: prove it works

11. **Sign in from a phone on mobile data**, not on your home wifi. That is the only test
    that proves the outside world can reach the NAS, that the certificate is trusted, and
    that the login mail arrives. Check the spam folder for that first code.

### Ongoing, and deliberately small

12. **Occasionally update the containers.** Self-hosted updates are manual and once in a
    while need a hand-applied step.
13. **Nothing is backed up.** That is a decision on the record (NFR-6), not an oversight. If
    you change your mind, the cheap version is a scheduled nightly dump into a folder Hyper
    Backup already covers.
14. **Watch the certificate renewal** the first time it comes around, since a lapsed
    certificate means signed-in players are blocked until it is fixed.

### What is *not* on your list

Writing the database tables and their per-user rules, the login screens, the import prompt,
the server-unreachable state, the rules that stop someone awarding themselves stickers, and
the client rework that lets the app talk to either storage. That is all implementation work,
covered by the design doc.

---

## 9. Explicit non-goals for this document

No data model/schema, API contracts, auth-flow diagrams, RLS policies, or code. Those belong
in `docs/cloud-sync-design.md`. This document defines **what** the feature must do and the
**constraints** it operates under, not **how** it is built. The one exception is
**stack-level choices** (D10 to D12): they are recorded here because they were traded off
against the requirements themselves (pausing versus D9, cookies versus NFR-1), and the detail
that follows from them lives in the design doc.
