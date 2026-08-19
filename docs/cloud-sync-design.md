# Cloud Sync & Accounts - Design

**Status:** Shipped 2026-08-15 and running on the NAS; kept as the design record. The what
and why live in `docs/cloud-sync-requirements.md` (settled); the operational checklist is
`docs/nas-setup.md`. Migrations have moved on since (through `0011`), so read
`supabase/migrations/` for the current schema.
**Date:** 2026-08-11.
**Reads with:** requirement ids (FR-n, NFR-n) and decisions (D1 to D12) from that doc.

This document is decisions plus enough shape to implement. It does not contain final SQL or
TypeScript; it contains the tables, the function contracts, the client seams, and the order
to build them in.

---

## 1. Shape at a glance

```
GUEST (unchanged, no network at all)
  browser  ->  localStorage

SIGNED IN
  browser (github.io/wcsim)
     |  https, bearer token in an Authorization header
     v
  DSM reverse proxy  (TLS, Let's Encrypt, one rule)
     |
     v
  gateway  ->  Auth        (sign-in, OTP, sessions)
           ->  PostgREST   (tables + RPC functions)
                  |
                  v
              Postgres     (the only copy of account data)
```

Studio (the admin dashboard) runs in the same stack but has **no proxy rule**, so it is
reachable only from the LAN (NFR-2).

The browser holds a short-lived access token plus a refresh token. There is **no cookie**, so
the two origins never trip over third-party cookie policy (NFR-3).

---

## 2. The stack on the NAS

From the Supabase self-host compose, keep the minimum:

| Service | Keep | Why |
|---|---|---|
| Postgres | yes | the data |
| Auth | yes | Google + OTP, sessions, revocation (FR-2 to FR-7) |
| PostgREST | yes | tables and RPC over HTTP |
| Gateway | yes | one public entry point, CORS allowlist |
| Studio | yes, LAN-only | seeding the invite list, ad-hoc inspection |
| postgres-meta | yes | Studio depends on it |
| Supavisor (pooler) | optional | a solo game has trivial concurrency; skip until it hurts |
| Realtime | **no** | nothing subscribes to live changes |
| Storage + imgproxy | **no** | sticker art ships in the repo under `public/stickers/` |
| Edge Runtime | **no** | all server logic is Postgres functions (§6) |
| Analytics (Logflare) + Vector | **no** | not in the default compose either; container logs suffice |

**Public surface:** exactly one hostname, one path prefix set (`/auth/v1`, `/rest/v1`), TLS
mandatory (NFR-2). Postgres itself is never exposed (LAN only, for Studio and dumps).

---

## 3. The collectible catalogue: the one non-obvious problem

The server has to validate sticker earns and trades (FR-18 to FR-20), which means it must
know **who is collectible and at what tier**. Today that is derived at runtime from
`player.elo` against `STICKER_TIERS` (`src/config.ts`), out of `src/data/squads.ts`, which is
client-side TypeScript the database cannot read.

**Decision:** a generated, read-only `collectibles` table, seeded from the dataset.
**Built** as described:

- `scripts/gen-collectibles.ts` (`npm run gen:collectibles`, bundled and run like
  `scripts/checks.ts`) walks `ALL_PLAYERS`, applies `tierOf`, and writes
  `supabase/seed/collectibles.sql`: `player_id, tier, elo, name, squad_id, nation_code,
  year`, sorted by id so the output is byte-stable. It also mirrors `STICKER_TRADE_COST`
  and `INITIAL_SWAPS` into an `economy_constants` table, so the values the server
  validates against cannot drift from the client's either.
- The seed is **idempotent**: it upserts through a temporary table, and a player who
  falls out of the bands is marked `active = false` rather than deleted, so a sticker
  somebody already owns keeps its row (`album_stickers` references it).
- Regenerate whenever `squads.ts` or `STICKER_TIERS` changes. This is the one place the
  dataset is duplicated outside the bundle, so `npm run checks` carries a **checksum
  assertion** (over `player_id|tier|elo`, ignoring display fields so a spelling fix is not
  a failure). Negative-tested both ways: a tampered checksum fails, and a rating tweak
  that promotes a player into a band fails until the seed is regenerated.
- Trade *options* stay client-side (`tradeOptions` is random and cosmetic); only the
  *outcome* is validated server-side.

Everything else the server needs (tier costs from `STICKER_TRADE_COST`, the 2-swaps-per-run
limit) is a handful of constants, mirrored as SQL constants in the same generated file so
they cannot drift either.

---

## 4. Data model

One row per account per bucket, keyed on the Auth user id. Blobs where only the owner reads
the data; normalized where something must be queried or validated.

| Table | Columns (essentials) | Shape |
|---|---|---|
| `profiles` | `id uuid pk -> auth.users`, `email text`, `created_at`, `state_version int not null default 0` | one per account |
| `allowed_emails` | `email text pk`, `note text`, `added_at` | the invite gate (D12), no client access |
| `collectibles` | `player_id text pk`, `tier text`, `elo int`, `name text`, `squad_id text`, `nation_code text`, `year int` | generated, read-only (§3) |
| `album_stickers` | `user_id`, `player_id -> collectibles`, `copies int not null check (copies >= 1)`, pk `(user_id, player_id)` | **normalized** |
| `album_stats` | `user_id pk`, `runs_played int`, `stickers_earned int`, `trades_completed int` | mirrors `AlbumStats` |
| `career` | `user_id pk`, `xp int`, `prestige int`, `perk_levels jsonb`, `unlocked_boons text[]`, `ascension int`, `last_ascension int null`, `stats jsonb` | mirrors `CareerState`; `level` is derived, never stored |
| `settings` | `user_id pk`, `data jsonb` | mirrors `Settings` (theme, difficulty, poolYears) |
| `game_state` | `user_id pk`, `data jsonb`, `updated_at` | the Quick Run `GameState` blob |
| `active_run` | `user_id pk`, `data jsonb`, `updated_at` | the in-progress `RunState` blob, at most one (FR-17) |
| `run_results` | `id`, `user_id`, `ended_at`, `outcome text`, `ascension int`, `score int`, `won_cup bool`, `rounds_won int`, `xi jsonb` | **append-only history**, the future leaderboard source (§3 of requirements) |
| `audit_log` | `id`, `user_id`, `kind text`, `payload jsonb`, `at` | append-only (FR-21), insert-only from functions |

**Album representation.** `AlbumState` is `{collected: string[], duplicates: Record<id,count>}`.
One row per owned sticker collapses both: the row existing means collected, and `copies - 1`
is the duplicate count. Reconstructing the client shape is a single select, and the trade
affordability check becomes `sum(copies - 1)`, which the server can verify (FR-20).

**`level` is not stored.** `careerStorage.ts` already recomputes it via `levelForXp(xp)`, so
storing it would create a second truth.

**Concurrency (FR-11).** One counter, `profiles.state_version`, bumped by every write
function. The client sends the version it last read; a mismatch raises and the client reloads.
Per-table versions were considered and rejected: the app treats an account as one document,
and the failure mode (a second device is told to reload) is acceptable and rare.

**Key mapping, for the adapter:**

| localStorage key | Table |
|---|---|
| `wcsim:game:v1` | `game_state.data` |
| `wcsim_album_v1` | `album_stickers` (rows) |
| `wcsim_album_stats_v1` | `album_stats` |
| `wcsim_career_v1` | `career` |
| `wcsim_run_v1` | `active_run.data` |
| `wcsim_run_reveal_v1` | **not persisted server-side** (transient; a refresh mid-reveal replays the current match, as today) |
| `wcsim_settings_v1` | `settings.data` |

---

## 5. Row-level security

RLS on every table. The browser uses the anon key, so RLS *is* the boundary (NFR-2).

- `profiles`, `album_stats`, `career`, `settings`, `game_state`, `active_run`, `run_results`:
  select and update where `user_id = auth.uid()`. No cross-account read is possible.
- `album_stickers`: **select only.** No client insert, update, or delete. Every mutation goes
  through a function (§6), so the economy rules cannot be bypassed by writing rows directly.
- `collectibles`: select for any authenticated user, no writes.
- `allowed_emails`, `audit_log`: **no client policy at all** (invisible). Functions write the
  audit log; the invite list is maintained in Studio.

Rationale: D3 tolerates a client that lies, but RLS alone would let a signed-in user insert
themselves any sticker in their own account. Routing the economy through functions costs
little and removes that, which is what FR-18 asks for.

---

## 6. The function surface (RPC)

All `security definer`, all validating before writing, all bumping `state_version`, all
writing an `audit_log` row. Names are contracts, not final signatures.

| Function | Does | Validates |
|---|---|---|
| `import_guest_progress(payload jsonb, ...)` | the one-time move (FR-15, FR-16) | account has **no** existing data; payload passes the same checks as a normal write; runs once, in one transaction, so a failure leaves nothing behind (the client only deletes local data after this returns, FR-16a) |
| `save_game(data jsonb, expected_version int)` | Quick Run state | version match |
| `save_run(data jsonb, expected_version int)` | in-progress Cup Run | version match; at most one row per user |
| `finish_run(result jsonb, collectible_ids text[], won_cup bool, cup_pick text, swaps_used int, career_delta jsonb, expected_version int)` | the big one: banks stickers, appends `run_results`, updates `career` and `album_stats`, clears `active_run` | see §7; **idempotent per run** |
| `execute_trade(target_tier text, chosen_player_id text, expected_version int)` | spend duplicates, collect one sticker | affordable from server totals; target is that tier; not already collected |
| `save_settings(data jsonb)` | preferences | shape only; no version check needed (last write wins is fine here) |
| `save_career(career jsonb, expected_version int)` | perk buys and boost unlocks | **xp and prestige may only decrease** outside `finish_run` (see §7) |
| `export_account()` | returns everything as one json document (FR-25) | own account only |
| `delete_account()` | removes the account and all rows (FR-24) | own account only |

**The Prestige invariant.** Perk purchases and boost unlocks are ordinary client actions that
*spend* currency. Rather than re-implementing the perk tables server-side, `save_career`
enforces one rule: **`xp` and `prestige` may never rise** except inside `finish_run`, which
computes the award itself from the submitted run result. A client that wants to cheat can
still under-spend, which is a rounding error next to inventing stickers, and D3 accepts it.

---

## 7. Validation rules (FR-18 to FR-21)

`finish_run`:

1. Every id in `collectible_ids` exists in `collectibles` (rejects invented players and
   non-collectible ones).
2. `count <= 11 + 1` (an XI plus the cup pick).
3. `cup_pick` is non-null only if `won_cup`, is **not** Monumental tier, and is not already
   collected (FR-3 of the album spec, D-1).
4. `swaps_used <= 2` (`INITIAL_SWAPS`).
5. **Once per run:** the submitted run has an id, and a `run_results` row for it must not
   already exist. This is the server-side twin of the `stickersApplied` flag and the reason
   the flag alone is not enough.
6. Career award is computed **server-side** from `outcome` + `ascension` + `score`, not taken
   from the client.
7. Applying stickers: insert or bump `copies` per id; increment `album_stats`.

`execute_trade`:

1. `sum(copies - 1) >= STICKER_TRADE_COST[target_tier]`, from server rows.
2. `chosen_player_id` is in `collectibles` at `target_tier` and has no row for this user.
3. Deduct the cost across duplicate rows, insert the new sticker, bump
   `trades_completed`.

**Rate limits** (FR-21): OTP requests and logins are handled by Auth's own limiter; the
write functions get a coarse per-user cap (writes per minute) sufficient to stop a script,
tunable per D7 without code changes (FR-22).

---

## 8. Auth configuration

- **Providers:** Google, plus email OTP. GitHub deliberately absent (D11).
- **OTP:** 6 digits, short expiry (10 minutes), single-use, invalidated by a newer code
  (FR-3, FR-4). Delivered over Gmail SMTP (D5).
- **Sessions:** access token short (1 hour), refresh token **60 days**, rolling. "Sign out
  everywhere" is the client calling sign-out with global scope, which revokes every refresh
  token for the user (FR-7). This is why sessions are server-side records rather than
  stateless tokens.
- **The invite gate (D12):** a trigger on user creation that rejects an email absent from
  `allowed_emails`. One place, both providers, no client involvement. Opening signup later is
  disabling the trigger (config, per FR-22), not a rewrite.
- **CORS:** the gateway allowlists the Pages origin plus `http://localhost:5173` for dev.
  Auth's site URL and redirect allowlist name the same origins, so Google returns to the
  right place.

---

## 9. Save points

The client writes at these moments and no others (NFR-5):

| Moment | Call |
|---|---|
| Quick Run state changes (draft, group, knockout) | `save_game`, debounced |
| Cup Run advances a round or a boost is picked | `save_run` |
| A run ends (champion, knocked out, group exit) | `finish_run` |
| A trade completes | `execute_trade` |
| A perk or boost unlock is bought | `save_career` |
| Settings change | `save_settings` |
| First login with local progress | `import_guest_progress` |

A handful of calls per run, not a stream. Every one of them can fail, and a failure means the
blocking unreachable state (§10), never silent loss (D9).

---

## 10. Client architecture

### 10.1 The adapter

Today four modules talk to `localStorage` directly and `App` calls them synchronously inside
`useState` initializers. That is the seam.

```
src/state/store/
  types.ts        the interface (below)
  localStore.ts   today's localStorage code, moved
  remoteStore.ts  Supabase-backed, dynamically imported
  index.ts        picks one, exposes it
```

As built (see `state/store/types.ts` for the documented version):

```ts
export interface Store {
  load(): Promise<AccountSnapshot>;   // one round trip, not seven
  peek(): AccountSnapshot;            // latest in-memory values, sync
  saveGame(game: GameState): Promise<void>;
  saveAlbum(album: AlbumState, stats: AlbumStats): Promise<void>;
  clearAlbum(): Promise<void>;
  saveCareer(career: CareerState): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  saveRun(run: RunState | null): Promise<void>;      // null drops run + reveal
  saveReveal(reveal: Reveal | null): Promise<void>;
}
```

**Everything is async.** This is the real cost of the refactor and the reason to do it first:
the local implementation resolves immediately, but the signatures have to be async now, or
adding the remote one later touches every call site twice. `load` returns one snapshot so
signed-in boot is a single request.

**`peek()` earns its place.** Three call sites re-read persisted state during render rather
than at boot: `App`'s `buildCareer` (so buying a perk in the hub then returning to the build
applies the new budget) and `resumeCupRun` (the launcher's resume button), plus
`CupRunScreen`'s mount reads. They were synchronous localStorage reads; they are now reads of
the store's in-memory cache, which every save updates. The remote store keeps the same
contract: load once, hold in memory, write through.

**Where `finishRun` / `trade` go.** The design's account-level operations (§6) do not exist in
the local implementation, because locally there is nothing to validate: `useStickerAlbum`
computes the next album with the pure `domain/album.ts` helpers and calls `saveAlbum`. When
the remote store lands, those two call sites become `finishRun` / `trade` on the interface,
with `localStore` implementing them as the same compute-then-save it does today. That is the
one place step 5 will widen the interface rather than just implement it.

**Guests never download the auth SDK.** `remoteStore.ts` is dynamically imported only when
accounts are on and a session exists, the same pattern as the lazy `CupRunScreen`.

### 10.2 Boot

**As built:** `main.tsx` awaits `store.load()` and passes the snapshot to `App` as a prop, so
`App` still seeds its reducer and hooks synchronously and needs no loading state. For the
local store this resolves in a microtask, before paint, so there is no flash.

**When the remote store lands,** the same seam carries it: `main.tsx` is where a real round
trip is awaited, where a splash goes if it is slow, and where a failure renders the blocking
**"server unreachable"** screen with a retry and a "continue as guest" action (FR-12, D9)
instead of the app. Mid-run save failures need the same overlay reachable from inside `App`,
which is the part step 6 adds.

### 10.3 Stale version

Every write carries the last-read `state_version`. On mismatch, the overlay says the account
moved on elsewhere and offers reload, which re-runs `loadAll` (FR-11).

### 10.4 The import prompt

Shown once, on a login where the account is empty and the device has guest data: "bring your
progress in" or "start fresh" (FR-15). On confirm: `import_guest_progress`, wait for success,
**then** clear the local keys (FR-16a ordering). On failure, nothing is deleted.

### 10.5 Flag and surfaces

`FEATURES.accounts`. Off means no auth UI, no dynamic import, no network, byte-identical
behaviour to today (FR-8). New UI: a sign-in surface (two buttons plus an email field), an
account line in settings showing the signed-in email with sign out and sign out everywhere,
the import prompt, and the unreachable overlay.

---

## 11. Configuration

**On the NAS** (`.env` beside the compose, never in the repo): Postgres password, JWT secret
and derived keys, dashboard credentials, Google client id and secret, SMTP host/user/App
Password/from-address, site URL and additional redirect URLs, the CORS allowlist.

**In the repo build** (GitHub Actions variables, injected at build): `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Neither is secret in the hide-it sense, since the anon key is
designed to ship to browsers; RLS is what protects data. Absent values mean the flag stays
off and the build behaves as today, which keeps the Pages deploy working for anyone who forks
the repo.

---

## 12. Local development

Point `npm run dev` at the NAS instance over the same public hostname (localhost is on the
CORS and redirect allowlists for this reason). One instance, no second set of secrets, and it
exercises the real path including TLS. A local compose stays possible for schema work but is
not the default.

---

## 13. Migrations

Plain numbered SQL files in `supabase/migrations/`, applied deliberately. Two things to keep
straight:

- **Client-side state migrations already exist** (`careerStorage.ts` migrates v1 to v2 on
  read). Those still apply to the *blob* columns, which means blobs must keep tolerating old
  shapes exactly as they do now.
- **The `collectibles` seed is generated, not migrated** (§3). Dataset changes regenerate it;
  `npm run checks` fails if the seed and the dataset disagree.

---

## 14. Build order

Each step is independently shippable and verifiable.

1. ~~**Storage adapter refactor.**~~ **Done 2026-08-11.** `state/store/` (`types.ts`,
   `localStore.ts`, `index.ts`), all five per-key modules now internal to it, every call site
   async, no server, no flag, no behaviour change. `main.tsx` loads the snapshot before the
   first render and passes it to `App`, so hooks and the reducer still seed synchronously.
   Verified by `npm run build`, `npm run checks`, and a browser pass (fresh boot, draft
   surviving a refresh with the same squad in hand, budget autofill into a Cup Run, career
   read and written, mid-run refresh resuming with the reveal intact, reset clearing run +
   reveal while keeping career and settings, settings round-tripping).
   Deviations from the plan as written, both deliberate: the snapshot is passed **as a prop
   from `main.tsx`** rather than App gaining `loading`/`ready` states (the local read is
   synchronous, so a loading state would have been dead code until the remote store lands,
   and the boot-time gate belongs at the entry point either way); and `Store` gained
   **`peek()`** for the three places that re-read persisted state on navigation.
2. **The stack on the NAS.** Compose, trimmed services, proxy rule, certificate, Google and
   SMTP configured, invite list seeded. **Checklist: `docs/nas-setup.md`.** Verified by
   signing in from a phone on mobile data with wifi off.
3. ~~**Schema, RLS, and the generated catalogue.**~~ **Written 2026-08-11**, awaiting a
   database to run against. `supabase/migrations/0001_schema.sql`, `0002_rls.sql`,
   `supabase/seed/collectibles.sql` (generated: 81 rows, 58 legendary / 18 iconic /
   5 monumental), plus `scripts/gen-collectibles.ts` (`npm run gen:collectibles`) and the
   drift guard in `npm run checks`. The guard is negative-tested: a rating tweak that
   promotes a player into a collectible band fails the checks until the seed is
   regenerated. Still to verify on the box: that it applies cleanly, and that a second
   account cannot see the first's rows.
4. ~~**Functions and validation.**~~ **Written 2026-08-11**, awaiting a database.
   `0003_functions.sql` (§6, §7) and `0004_signup.sql` (invite gate + profile creation).
   Still to verify on the box, with deliberately hostile calls: invented player ids, an
   unaffordable trade, a second `finish_run` for the same run key, a stale
   `expected_version`, a career write that raises its own xp, and a signup from an
   uninvited address.
5. ~~**`remoteStore` plus auth UI, behind the flag.**~~ **Done 2026-08-13/14.** Email-code
   sign-in only (Google deferred: one less moving part, and it can be added without
   touching this). `FEATURES.accounts` is derived from the build env, so an unconfigured
   build is the guest-only game. Verified in play on desktop and phone.
6. ~~**Import, unreachable state, stale-version reload.**~~ **Done 2026-08-14/15**, with two
   changes of plan. The guest import lost its prompt and now happens automatically on first
   sign-in (asking added nothing: signing in on a device with progress means you want it).
   The stale-version case got its own screen, since "the server is unreachable" is the wrong
   story for "another device moved ahead".
7. ~~**Account management.**~~ **Sign out / sign out everywhere / delete account done
   2026-08-15**; delete verified end to end on a throwaway account (career, sticker and run
   created, then deleted by the account itself: auth user gone, every table cascaded clean).
   **Export (FR-25) deliberately not built**: a download with no way to load it back is a
   souvenir, not a restore path, and a scheduled `pg_dump` protects every account without
   anyone pressing a button. Revisit if the data-rights angle matters more than the backup one.

### What the first real play-through cost, worth reading before the next feature

Every one of these shipped broken and was found by playing, not by types or checks. They are
in CLAUDE.md as gotchas; the pattern is what matters here.

- **Collectibility judged on a boosted copy** rather than the dataset player, so ids the
  catalogue never contained were submitted and the whole bank was refused.
- **A version conflict raised as SQLSTATE 40001**, which PostgREST retries - a deterministic
  failure retried until the gateway timed out, reported to the player as "unreachable".
- **Concurrent writes each carrying their own last-read version**, making conflicts routine
  rather than the multi-device rarity they were designed for.
- **A run key derived from the XI + outcome**, which collided the second time two runs ended
  the same way.
- **The "already banked" flag set before the call**, so a failure lost the run's stickers.
- **An async result landing in the next run**, showing the previous run's summary mid-play.

Three of the six were only visible on the *second* run, which is the lesson: a single
happy-path play-through proves very little about state that carries across runs.

---

## 15. What will bite

- **The async conversion is the largest diff** and touches `App` hardest. Doing it as step 1,
  with no server in play, keeps it reviewable.
- **The `collectibles` seed is a second copy of dataset truth.** It is generated and checked,
  but a forgotten regeneration after a rating tweak would make a newly-collectible player
  unbankable. The `npm run checks` assertion is not optional.
- **Google's redirect URL must match exactly**, including scheme and path. Most first-time
  OAuth failures are this.
- **First OTP mail lands in spam** more often than not (D5). Check the folder before
  debugging the SMTP configuration.
- **`finish_run` is the only place currency is created.** Everything about the economy's
  integrity rests on that being true, so it deserves the most scrutiny in review.
- **No backups** (NFR-6, accepted). Until FR-25 export exists, a lost volume is a lost album
  for everyone, so step 7 is not really optional in spirit.
