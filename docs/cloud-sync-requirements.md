# Cloud Sync & Accounts — Requirements

**Status:** Requirements draft (output of `/sc:brainstorm`)
**Date:** 2026-07-02, revised 2026-08-11
**Next step:** `/sc:design` (architecture, data model, API, auth flows) — this document is
requirements only and deliberately contains no schema, endpoints, or implementation.

> **2026-08-11 revision.** The model changed from "local-first with background sync and
> reconcile" to **fully decoupled guest and account worlds** (D8, D9 below). Guests are
> local-only; a logged-in user reads and writes the database and nothing else. Since two
> copies can never diverge, the merge/reconcile problem is gone: the old open questions 1
> to 3 are settled, and FR-10 to FR-17 plus NFR-1 were rewritten accordingly. Rationale is
> in the D8/D9 rows. The first-login import is a **move**: local guest data is deleted once
> the server write is confirmed (FR-16a).

---

## 1. Goal

Today the World Cup Simulator is 100% client-side: all progress lives in `localStorage`
(`wcsim:game:v1` game state, `wcsim_album_v1` sticker album, `wcsim_album_stats_v1`
telemetry) and it deploys as a static site to GitHub Pages. This enhancement adds an
**optional account** that backs up and syncs a player's progress to a **self-hosted
PostgreSQL database** on the user's Synology DS723+ NAS, so a collection survives a
cleared browser and follows the player across devices — **without taking away offline,
no-account play**.

## 2. Locked decisions (from brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| D1 | What syncs | **Everything**: sticker album, active run (draft/group/knockout), stats, and settings |
| D2 | Account model | **Local-first + optional login**. Guests play fully offline as today; signing in backs up and syncs |
| D3 | Integrity | **Trust client + sanity limits**: client reports earned/traded stickers; server applies validity checks, rate limits, and an append-only audit log |
| D4 | Deployment | SPA stays on **GitHub Pages**; the API + Postgres run on the **NAS**, exposed via port-forward + **DSM reverse proxy + Let's Encrypt + DDNS** (two origins → CORS) |
| D5 | OTP delivery | 6-digit email codes sent via an **existing Gmail/SMTP** mailbox |
| D6 | Identity | **One account per verified email**; Google, GitHub, and email-OTP that share a verified email resolve to the same account |
| D7 | Audience | **Private now, public later**: build for a small known set first, but specify abuse/rate-limit/privacy controls so opening up is a config change, not a rewrite |
| D8 | Guest vs account | **Two separate worlds, never mixed.** Guest progress lives in `localStorage`; account progress lives **only** in the database. Nothing syncs or merges between them. The single crossing point is a **one-time, user-confirmed import** at first login |
| D9 | Server dependency when logged in | **Logged in requires the server.** If the API/DB is unreachable, a logged-in user **cannot play**: a blocking "server unreachable" state with a retry, plus a "continue as guest" escape hatch (which starts/resumes separate local progress and never copies account data down). No unsaved logged-in play, so no second copy ever exists to reconcile |

**Why D8/D9.** The reconcile policy for mutable data (duplicate counts, trade history, the
single active run) was the hardest question in this document and had no clean answer: union
is wrong for spendable currency, and last-write-wins silently destroys a trade the player
already saw succeed. Decoupling removes the question instead of answering it. The cost is
that the NAS becoming unreachable blocks logged-in play, which is acceptable because the app
is a static SPA with no service worker: with no connection at all the page does not load
anyway, so the only new failure mode is "page loads, NAS is down", and that is what D9's
blocking state plus guest escape hatch covers.

## 3. Scope

**In scope**
- Optional accounts with three sign-in methods: Google, GitHub, and email 6-digit code.
- Backup + cross-device sync of album, active run, stats, and settings.
- Guest-to-account migration (merge local progress on first login).
- Server-side integrity guard rails for the sticker economy.
- Self-hosted API + Postgres on the NAS; SPA continues to ship to GitHub Pages.

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
- **FR-2** A user may sign in via **Google**, **GitHub**, or **email 6-digit code**. All three are offered on one sign-in surface.
- **FR-3** Email login is passwordless: a **6-digit numeric code** is emailed on **every** login attempt. No password is ever stored.
- **FR-4** Email codes must **expire** after a short window, be **single-use**, and be **invalidated** on a successful login or when a newer code is issued for the same address.
- **FR-5** Social logins must yield a **verified email**; that email is the account's identity key (D6). If a provider does not return a verified email, the app must handle it gracefully (e.g. ask the user to verify / fall back to email login) rather than creating a broken account.
- **FR-6** Accounts sharing a verified email **link to one account** across all three methods (D6). A user must be able to see which sign-in methods are linked.
- **FR-7** Sessions must **persist across visits** (a user is not forced to re-authenticate every time) and must be **revocable** (sign out; ideally sign out of all devices).
- **FR-8** The whole accounts/sync feature must sit behind a **feature flag** and degrade cleanly: with the flag off, or the API unreachable, the app behaves exactly like today's static build.

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
  - **Keys cleared:** `wcsim:game:v1`, `wcsim_album_v1`, `wcsim_album_stats_v1`, `wcsim_career_v1`, `wcsim_run_v1`, `wcsim_run_reveal_v1`. Note this deliberately includes the **album** keys, which are otherwise kept separate precisely so a game reset never wipes the album (`clearAlbum()` in `state/albumStorage.ts`) — the import is the one case that clears them. Device-local settings (`wcsim_settings_v1`) are **not** cleared (see open question 7).
  - **No guest data is ever deleted without an import.** If a login offers no import (the account already has progress, FR-16), the device's guest progress is left intact: it was never banked anywhere, so deleting it would destroy the only copy. In that case "continue as guest" (FR-12) resumes it as normal, and the signed-in/guest distinction is carried by a **visible UI affordance**, not by the absence of data.
- **FR-17** There is at most **one active run** per account, held server-side. Two signed-in devices touching it are resolved by the version check in FR-11 (the stale device reloads), not by a merge.

### 4.4 Integrity & anti-abuse (D3, D7)
- **FR-18** The server holds the **authoritative album** for signed-in users; trades and earns are validated against server state, not the client's word alone.
- **FR-19** Earned stickers are accepted only when **plausible**: valid collectible ids, cup-pick only after a recorded cup win, run-end applied **at most once per run**, and within the game's own limits (e.g. ≤ 2 collectible swaps/run) as reported.
- **FR-20** Trades are accepted only when **affordable per server-side duplicate totals** and follow the tier/cost rules.
- **FR-21** The server keeps an **append-only audit log** of earn/trade/merge events (for spotting abuse and debugging), and enforces **rate limits** on OTP requests, logins, and sync/earn calls.
- **FR-22** Abuse controls are **specified now but tunable**: relaxed for the private phase, tightenable for public without code changes (D7).

### 4.5 Account management & data rights
- **FR-23** A user can **sign out**, and view their linked sign-in methods (§4.1).
- **FR-24** A user can **delete their account and data** (needed before "public"; and reasonable under Swiss nFADP / GDPR-style expectations).
- **FR-25** A user should be able to **export** their collection (nice-to-have; strengthens the "it's my data" story and de-risks the NAS being the only copy).

---

## 5. Non-functional requirements

- **NFR-1 Guest-first (highest priority).** The **core game is fully playable without an account**, and guest play never contacts the server: drafting, the full dataset, the album, career progression, and challenges. An account adds **continuity and safety** (the same album, career, and challenges on every device, plus off-device backup), and **may also gate features that are inherently online or social, such as leaderboards / highscores**. It must not gate core single-player gameplay, content, or progression. (This replaces the earlier "offline-first" framing: the app is a static SPA with no service worker, so with no connectivity it does not load at all, making "offline play" moot; what matters is that no one is ever forced to sign in.)
  - **Consequence of D9:** for a *signed-in* user the NAS **is** on the critical path (unreachable = blocked, with a guest escape hatch), which raises the importance of NFR-6 backups and open questions 4 and 5 (exposure, backup/restore).
- **NFR-2 Security.** OAuth handled via the providers (no passwords stored); OTP codes are short-lived, single-use, rate-limited, and lockout-protected against brute force; the API is HTTPS-only (Let's Encrypt via DSM per D4); secrets (OAuth client secrets, SMTP creds, DB creds) are kept server-side only; sessions are revocable.
- **NFR-3 Cross-origin.** Because the SPA (Pages) and API (NAS) are **different origins** (D4), the auth/session mechanism and CORS policy must work across origins and survive the DDNS hostname. (Mechanism = design; the constraint is a requirement.)
- **NFR-4 Privacy.** Store the **minimum**: identity (verified email + linked provider ids), the game data in D1, and audit/telemetry. A short privacy note is required before public launch; email addresses are treated as personal data.
- **NFR-5 Performance.** Auth is not on the hot path of play. For a signed-in user, saves happen at a **small number of defined points** (once per knockout round, and at run end for album/career), not continuously, so a save round-trip must feel instant on a home LAN and be tolerable over the exposed WAN link. The DS723+ (32 GB RAM) is comfortably oversized for the expected load.
- **NFR-6 Backups / durability.** The NAS Postgres is the system of record for accounts; it must be **backed up** (the album is the whole point of the feature — losing it is the worst failure). Define backup cadence/retention and a restore test. Client export (FR-25) is a secondary safety net.
- **NFR-7 Scalability.** Private phase: tens of users. Public phase: design should hold to low thousands of accounts on the single NAS without re-architecture; concurrency is low (a solo game).
- **NFR-8 Observability / ops.** Basic health check, error logging, and the audit log (FR-21). The stack should be operable as containers on the NAS (Docker/Container Manager) with straightforward start/stop/update and cert renewal.
- **NFR-9 Consistency with the app's conventions.** Keep gameplay/domain logic framework-free and unchanged; the sync layer wraps it. Ship behind a `FEATURES`-style flag; keep the static build path intact.

---

## 6. User stories & acceptance criteria

- **US-1 — Guest keeps playing.** As a visitor with no account, I can draft, play, and build my album with no server involved at all. *AC:* no login prompt blocks play; nothing regresses vs today; no network calls are made on a guest's behalf.
- **US-2 — Back up my collection.** As a player, I can sign in (Google/GitHub/email code) so my album lives off my browser. *AC:* on first login I am offered the one-time import of my guest progress (FR-15); after that, clearing the browser and logging back in restores the account collection.
- **US-3 — Play on a second device.** As a signed-in player, my collection is the same everywhere. *AC:* a sticker earned on device A is present on device B on next load, because both read the one server-side collection.
- **US-4 — Email code login.** As a player, I enter my email, receive a 6-digit code, and enter it to sign in. *AC:* a fresh code arrives each login; it expires and is single-use; wrong/expired codes are rejected with a clear message; repeated requests are rate-limited.
- **US-5 — Linked identity.** As a player who used Google once, logging in later with email-code or GitHub on the same address lands me in the **same** account. *AC:* one collection, not two.
- **US-6 — Honest failure when the server is down.** As a signed-in player, if the NAS is unreachable I am told clearly and not allowed to play on into a void; I can retry, or continue as a guest. *AC:* a blocking retryable state appears (at load or mid-run); no account progress is invented locally; "continue as guest" gives separate local progress and leaves the account untouched.
- **US-7 — Fair economy.** As a player, I can't gain stickers I didn't legitimately earn by poking the API. *AC:* invalid/duplicate/unaffordable earn/trade calls are rejected and audited.
- **US-8 — My data is mine.** As a player, I can delete my account (and ideally export my collection). *AC:* deletion removes my personal data; export produces a portable copy.

---

## 7. Open questions (to resolve before/at `/sc:design`)

**Settled on 2026-08-11 by D8/D9** (kept here so the reasoning is not re-litigated):

- ~~Conflict resolution for mutable data.~~ No longer applicable: one store per world, so
  duplicate counts and trade history cannot diverge. Concurrent signed-in devices are
  handled by version-numbered writes (FR-11), which is a rejection, not a merge.
- ~~Active-run conflict.~~ Same: the run lives server-side; the stale device reloads (FR-17).
- ~~Earn model (run result vs per-event deltas).~~ Falls out of D8: the client writes to the
  server at its defined save points and the server validates each write (§4.4 unchanged),
  so there is no offline delta queue to replay.
- ~~Guest data after import.~~ Settled: the import is a **move**, so the local copy is
  deleted once the server write is confirmed (FR-16a). An un-logged-in visit then starts
  from scratch, which doubles as the signal that you are not signed in.

**Still open:**

1. **Session persistence details.** How long do sessions last, and is "sign out everywhere" in v1?
2. **Provider email edge cases.** What if GitHub/Google returns no verified email, or a user's provider email differs from a prior email-OTP identity — auto-link, prompt to link, or keep separate?
3. **SMTP specifics (D5).** Which mailbox/from-address, and are we OK with Gmail's daily send caps and spam-folder risk for the private phase (with a note that a transactional email service is the upgrade path if it becomes public)?
4. **NAS exposure specifics (D4).** DDNS provider + hostname, which port, DSM reverse proxy vs. a container-level proxy, and cert auto-renewal — confirm the chosen path (open port to the internet is a security surface to review). **Weightier under D9:** an unreachable NAS now blocks signed-in play.
5. **Backup/restore (NFR-6).** Cadence, retention, off-NAS copy (so a NAS failure doesn't lose everyone's album), and a tested restore. **Weightier under D8:** the DB is the *only* copy of an account's collection, not a backup of a local one.
6. **"Public later" trigger (D7).** What must be true (rate limits, privacy note, abuse handling, backups) before flipping from allowlist/invite to open signup?
7. **Settings scope (D1).** Which settings are worth holding per account (speed, auto-play) vs. left device-local (dark mode arguably belongs to the device)? FR-16a currently leaves `wcsim_settings_v1` untouched by the import on the assumption they are device-local.
10. **Settings sync (D1).** Which settings actually matter to sync (speed, auto-play, and any future ones) vs. leave device-local?

---

## 8. Explicit non-goals for this document

No architecture, data model/schema, API contracts, auth-flow diagrams, or code. Those
belong in `/sc:design`. This document defines **what** the feature must do and the
**constraints** it operates under, not **how** it is built.
