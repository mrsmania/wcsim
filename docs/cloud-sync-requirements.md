# Cloud Sync & Accounts — Requirements

**Status:** Requirements draft (output of `/sc:brainstorm`)
**Date:** 2026-07-02
**Next step:** `/sc:design` (architecture, data model, API, auth flows) — this document is
requirements only and deliberately contains no schema, endpoints, or implementation.

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

## 3. Scope

**In scope**
- Optional accounts with three sign-in methods: Google, GitHub, and email 6-digit code.
- Backup + cross-device sync of album, active run, stats, and settings.
- Guest-to-account migration (merge local progress on first login).
- Server-side integrity guard rails for the sticker economy.
- Self-hosted API + Postgres on the NAS; SPA continues to ship to GitHub Pages.

**Out of scope (for this feature)**
- Multiplayer, sharing, leaderboards, or trading between users.
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
- **FR-10** On sign-in and thereafter, local and server state are **reconciled** so the user sees a single, consistent collection on any device.
- **FR-11** **No collected sticker is ever lost** in a reconcile: the set of collected stickers across devices is preserved (union semantics at minimum).
- **FR-12** Sync must be **resilient to the API being offline**: local play continues, and changes are pushed when connectivity returns (queue/retry). The user is never blocked by a down NAS.
- **FR-13** The user must get clear, lightweight **status feedback**: signed-in identity, last-synced indication, and a visible "offline / not synced" state when applicable.
- **FR-14** Signing out returns the user to guest/local behavior without destroying on-device data unexpectedly (define what remains local vs cleared).

### 4.3 Guest → account migration & conflicts
- **FR-15** On a guest's **first login**, their existing local progress must be **merged into the account** (D2, "not only locally") rather than discarded or blindly overwritten.
- **FR-16** When a device's local state and the account state **diverge** (e.g. played offline on two devices), the system must reconcile **deterministically** and never silently lose collected stickers. The exact policy for spendable/mutable data (duplicate counts, trade history, the single active run) is an **open question** (§7).
- **FR-17** There is at most **one active run** per account; the reconcile policy for a conflicting active run on two devices must be defined (candidate: most-recently-updated wins, with the other discarded — TBD in §7).

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

- **NFR-1 Availability / offline-first (highest priority).** The playable app must never depend on the NAS being up. Frontend availability is decoupled from home-network/NAS uptime (Pages hosts the SPA per D4); the API is best-effort. A down API degrades to guest/local play + deferred sync, never a broken app.
- **NFR-2 Security.** OAuth handled via the providers (no passwords stored); OTP codes are short-lived, single-use, rate-limited, and lockout-protected against brute force; the API is HTTPS-only (Let's Encrypt via DSM per D4); secrets (OAuth client secrets, SMTP creds, DB creds) are kept server-side only; sessions are revocable.
- **NFR-3 Cross-origin.** Because the SPA (Pages) and API (NAS) are **different origins** (D4), the auth/session mechanism and CORS policy must work across origins and survive the DDNS hostname. (Mechanism = design; the constraint is a requirement.)
- **NFR-4 Privacy.** Store the **minimum**: identity (verified email + linked provider ids), the game data in D1, and audit/telemetry. A short privacy note is required before public launch; email addresses are treated as personal data.
- **NFR-5 Performance.** Sync and auth are not on the hot path of play; sync happens in the background. Target: login/OTP verification and a sync round-trip feel instant on a home LAN and are tolerable over the exposed WAN link. The DS723+ (32 GB RAM) is comfortably oversized for the expected load.
- **NFR-6 Backups / durability.** The NAS Postgres is the system of record for accounts; it must be **backed up** (the album is the whole point of the feature — losing it is the worst failure). Define backup cadence/retention and a restore test. Client export (FR-25) is a secondary safety net.
- **NFR-7 Scalability.** Private phase: tens of users. Public phase: design should hold to low thousands of accounts on the single NAS without re-architecture; concurrency is low (a solo game).
- **NFR-8 Observability / ops.** Basic health check, error logging, and the audit log (FR-21). The stack should be operable as containers on the NAS (Docker/Container Manager) with straightforward start/stop/update and cert renewal.
- **NFR-9 Consistency with the app's conventions.** Keep gameplay/domain logic framework-free and unchanged; the sync layer wraps it. Ship behind a `FEATURES`-style flag; keep the static build path intact.

---

## 6. User stories & acceptance criteria

- **US-1 — Guest keeps playing.** As a visitor with no account, I can draft, play, and build my album offline. *AC:* no login prompt blocks play; nothing regresses vs today.
- **US-2 — Back up my collection.** As a player, I can sign in (Google/GitHub/email code) so my album is saved off my browser. *AC:* after login, my current local album is preserved on the server; clearing the browser and logging back in restores it.
- **US-3 — Play on a second device.** As a signed-in player, my collection appears on another device. *AC:* stickers collected on device A show on device B after sync; no collected sticker is lost.
- **US-4 — Email code login.** As a player, I enter my email, receive a 6-digit code, and enter it to sign in. *AC:* a fresh code arrives each login; it expires and is single-use; wrong/expired codes are rejected with a clear message; repeated requests are rate-limited.
- **US-5 — Linked identity.** As a player who used Google once, logging in later with email-code or GitHub on the same address lands me in the **same** account. *AC:* one collection, not two.
- **US-6 — Offline resilience.** As a signed-in player, if the NAS/home internet is down I can still play; my progress syncs later. *AC:* play is unaffected; a clear "not synced" indicator shows; changes reconcile when the API returns with no lost stickers.
- **US-7 — Fair economy.** As a player, I can't gain stickers I didn't legitimately earn by poking the API. *AC:* invalid/duplicate/unaffordable earn/trade calls are rejected and audited.
- **US-8 — My data is mine.** As a player, I can delete my account (and ideally export my collection). *AC:* deletion removes my personal data; export produces a portable copy.

---

## 7. Open questions (to resolve before/at `/sc:design`)

1. **Conflict resolution for mutable data.** Collected = union is clear (FR-11). But **duplicate counts and trade history** can legitimately diverge across offline devices — what's the merge rule (e.g. server is authoritative and the client replays intent; or last-write-wins per run/event; or an event-log the server folds)? This is the hardest design question.
2. **Active-run conflict (FR-17).** Confirm: most-recently-updated run wins and the other is dropped? Or prompt the user to pick? Or don't sync mid-run and only sync at run boundaries?
3. **Earn model.** Does the client send a compact "run result" (final XI collectibles + cup pick) that the server applies, or does it send per-event deltas? (Affects FR-18–21 and the audit.)
4. **Session persistence details.** How long do sessions last, and is "sign out everywhere" in v1?
5. **Provider email edge cases.** What if GitHub/Google returns no verified email, or a user's provider email differs from a prior email-OTP identity — auto-link, prompt to link, or keep separate?
6. **SMTP specifics (D5).** Which mailbox/from-address, and are we OK with Gmail's daily send caps and spam-folder risk for the private phase (with a note that a transactional email service is the upgrade path if it becomes public)?
7. **NAS exposure specifics (D4).** DDNS provider + hostname, which port, DSM reverse proxy vs. a container-level proxy, and cert auto-renewal — confirm the chosen path (open port to the internet is a security surface to review).
8. **Backup/restore (NFR-6).** Cadence, retention, off-NAS copy (so a NAS failure doesn't lose everyone's album), and a tested restore.
9. **"Public later" trigger (D7).** What must be true (rate limits, privacy note, abuse handling, backups) before flipping from allowlist/invite to open signup?
10. **Settings sync (D1).** Which settings actually matter to sync (speed, auto-play, and any future ones) vs. leave device-local?

---

## 8. Explicit non-goals for this document

No architecture, data model/schema, API contracts, auth-flow diagrams, or code. Those
belong in `/sc:design`. This document defines **what** the feature must do and the
**constraints** it operates under, not **how** it is built.
