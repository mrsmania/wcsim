# NAS setup: self-hosted Supabase for accounts

Operational companion to `docs/cloud-sync-requirements.md` §8 (what the owner does) and
`docs/cloud-sync-design.md` §2 (the stack). This is the sit-at-the-box checklist.

**Deliberately not in this repo: a hand-written `docker-compose.yml`.** Supabase ships an
official one that is kept current with the image versions, and transcribing it here would
rot and be subtly wrong. Use theirs, apply the trims below. Where this file names an
environment variable, **the `.env.example` you actually get is the authority** if the two
ever disagree.

---

## 0. Before anything: can you be reached?

Two things to confirm, in this order:

1. **A real public address.** If your plan puts you behind shared address space (common on
   mobile and 5G), inbound port forwarding cannot work at all. Check your router's WAN
   address against what a "what is my IP" page reports. If they differ, stop here: the
   fallback is a tunnel (Cloudflare Tunnel needs no open port and hides your home address),
   which changes step 3 and nothing else.
2. **Port 443 is actually free and forwardable.** DSM itself may already want it.

Ten minutes now, rather than after the stack is built.

---

## 1. Hostname and certificate (DSM, before Google)

**What the hostname is, and is not.** It is the address of the **API only**: what the
browser calls in the background, once signed in, for the login handshake and for saving.
The **game itself does not move**: it stays on GitHub Pages at
`https://mrsmania.github.io/wcsim/`, which is the only URL a player ever sees, and guest
play never touches the NAS at all. Two different URLs, and mixing them up is the classic
configuration failure here: `SITE_URL` is the *game*, `API_EXTERNAL_URL` and
`VITE_SUPABASE_URL` are the *NAS*.

**If the NAS is already exposed** (a public address, 443 already forwarded, other services
behind the reverse proxy), this step is smaller: you need **one more hostname and one more
proxy rule**, not another port. DSM's reverse proxy keys on hostname, so several share 443.
Skip to "already exposed" below.

**Why a dedicated hostname** rather than a path under one you already serve: the Supabase
gateway expects to own root paths (`/auth/v1`, `/rest/v1`). Hosting it under a subpath means
rewriting paths in the proxy and configuring an external URL that contains a path, which the
self-hosted stack handles poorly. One extra DNS name avoids all of it.

### Already exposed

1. **Add a hostname** pointing at the same address: a subdomain of a domain you own
   (`wcsim-api.example.ch`) is tidiest, or a second `.synology.me` name via DDNS if you would
   rather not touch DNS.
2. **Extend or add a certificate** covering it. For your own domain that means port 80
   reachable during issuance and each renewal, or adding the name as a SAN to a certificate
   you already have. For `.synology.me`, DSM handles it.
3. **One reverse proxy rule** for that hostname on 443 → the gateway's port (§3). Existing
   rules are untouched.

Then carry on at §2. The rest of this section is for a NAS that is not yet reachable.

### From scratch

1. **Control Panel → External Access → DDNS.** Add a Synology account hostname, e.g.
   `something.synology.me`. DSM keeps it pointed at your changing address.
2. **Control Panel → Security → Certificate.** Add a Let's Encrypt certificate for that
   hostname. DSM renews it on its own. Watch the first renewal: a lapsed certificate blocks
   every signed-in player (D9).

TLS is **mandatory**, not a nicety: the game is served over `https` from GitHub Pages, and a
secure page may not call an insecure endpoint.

Write the final hostname down. Everything below refers to it as `HOST`, and it always means
the **NAS/API** hostname, never the game's Pages URL.

---

## 2. The Google OAuth client (desktop, needs HOST)

In the Google Cloud console:

1. Create a project (any name).
2. **OAuth consent screen.** External. You are requesting only name and email, the
   non-sensitive tier, so there is no verification review. Either add the handful of
   addresses as test users, or publish it.
3. **Credentials → Create OAuth client ID → Web application.**
   - Authorised redirect URI: `https://HOST/auth/v1/callback`
   - Keep the **client ID** and **client secret**.

Exact-match matters, scheme and path included. Most first-time OAuth failures are a
mistyped redirect URI.

---

## 3. Router and reverse proxy

1. **Router:** forward the chosen external port to the NAS. **Already forwarding 443 for
   something else? Nothing to do here** - the proxy rule below keys on hostname, so 443 is
   shared.
2. **DSM → Login Portal → Advanced → Reverse Proxy.** One rule: source `HOST` on 443
   (HTTPS, with the certificate from step 1) to destination `localhost` on the Supabase
   gateway's port (whatever the compose exposes, `8000` in the default).
3. **Studio.** The gateway serves the dashboard at the root of the same hostname, behind
   HTTP basic auth (`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`). **Decided 2026-08-17: it
   stays reachable from the internet**, because being able to open the SQL editor from
   anywhere is worth more here than shrinking the surface. Know what that means: the root
   URL is an admin console guarded by one password, and it fronts `postgres-meta`, which
   runs arbitrary SQL. Keep that password long, and if the calculus ever changes, stopping
   the `studio` container is the whole mitigation - the API paths the game uses are
   unaffected.

   **Always enter at the root, `https://HOST/`, and let it redirect.** Opening a deep
   Studio URL directly (`/project/default`, an SQL-editor link, a bookmark from inside the
   app) answers **"You do not have access to this project"**, which reads like a permissions
   problem on the database and is not one. Envoy's `basic_auth` filter builds the realm from
   the *full request URL*, so every path is a separate protection space: authenticate at
   `/project/default` and the browser holds credentials for that path only, then Studio's own
   `fetch` calls to `/api/platform/profile` and `/api/platform/projects` get a bare 401 - and a
   401 to `fetch` raises no password prompt, it just returns to the page, which renders it as
   no access. Authenticating at `/` instead covers the whole path tree, and `/` 307s to
   `/project/default` anyway. Verified 2026-08-20: with credentials supplied, `/project/default`,
   `/api/platform/profile` and `/api/platform/projects` are all 200, so nothing server-side is
   involved. The realm is not configurable on that filter, so entering at the root is the fix,
   not a workaround to remove later.
4. **Control Panel → Security → Firewall:** allow the forwarded port, and keep Postgres
   (5432) LAN-only. That single inbound port is all the game needs: the proxy reaches the
   gateway over loopback, which the firewall does not filter, and `db` publishes nothing
   once the pooler is dropped (§4). If a rule scopes 443 to selected countries, remember
   that it is the *player's* location being matched. **Enabling the firewall or editing any
   rule here breaks container-to-container traffic** and needs the recovery in "The
   container firewall rules" below, which is a different problem from a closed port and has
   its own one-command test.

---

## 4. The containers

1. Get the official compose:
   ```
   git clone --depth 1 https://github.com/supabase/supabase
   ```
   The stack lives in `supabase/docker`. Copy that folder onto the NAS (a share such as
   `/volume1/docker/wcsim-supabase`), including `docker-compose.yml` and `.env.example`.
2. **Trim what we do not use** (`docker-compose.yml`), per design §2. Delete the service
   blocks and any `depends_on` references to them:
   - `realtime` (nothing subscribes to live changes)
   - `storage` and `imgproxy` (sticker art ships in the repo)
   - `functions` / edge runtime (all server logic is Postgres functions)
   - `supavisor` / pooler is optional at this scale; on this NAS it was dropped during
     setup (it maps 5432 and 6543, which is where the port conflict came from)
   Keep: `db`, `auth`, `rest`, the gateway, `studio`, `meta`. Analytics and vector are not
   in the default compose. The gateway's own config lists those services too, so trim it
   in the same pass - see "Trimming a stack that is already running" below, which is the
   full recipe either way.
3. **Create `.env` from `.env.example`** and set:

   | Group | What |
   |---|---|
   | Postgres | `POSTGRES_PASSWORD` (invent a long one) |
   | Keys | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`: run **`node scripts/gen-supabase-keys.mjs`** and paste all three. The two keys are JWTs signed with the secret, so they are generated together and must be regenerated together. (Supabase's docs used to embed a web generator; the local script avoids pasting secrets into a website anyway.) |
   | Dashboard | `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` (basic auth on Studio) |
   | URLs | `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL` = `https://HOST`; `SITE_URL` = the game's URL on GitHub Pages |
   | Redirects | `ADDITIONAL_REDIRECT_URLS` = the Pages URL plus `http://localhost:5173` for dev |
   | Google | the client ID and secret from step 2, and its callback (the `*_EXTERNAL_GOOGLE_*` block) |
   | SMTP | the `SMTP_*` block: host `smtp.gmail.com`, port 465, the mailbox as user, the **App Password** as the password, and the sender name (this is what shows in the inbox) |
   | OTP | 6-digit numeric codes with a short expiry (the mailer OTP length / expiry settings) |
   | Sessions | 60 days. Self-hosted Auth expresses this as a **session timebox / inactivity pair** plus a short access-token expiry, not one value. Check the names in your `.env.example` |
   | Signups | leave open here; the invite gate is a database trigger (step 6), so it covers both sign-in methods in one place |

4. **Container Manager → Project → Create**, pointing at that folder. Start it.
5. Confirm from the LAN that Studio loads and the gateway answers.

### The sign-in email

GoTrue's stock template is a generic "Confirm your email" page. The game ships its own,
in the repo and deployed with the site:

- **`public/email/otp.html`** - the whole mail: the trophy tile and wordmark, one line,
  the six digits, and a line saying to delete it if it was not you. Nothing else, on
  purpose; a transactional mail nobody subscribed to needs no greeting, sign-off or
  unsubscribe footer.
- **`public/email/logo.png`** - the tile, as a PNG. Mail clients will not render the
  app's inline SVG (Gmail drops SVG and blocks `data:` URIs in images), so it is a
  hosted image referenced by absolute URL; the wordmark beside it is text, so a blocked
  image still leaves a legible header.

Both deploy with the Pages build, so GoTrue can point straight at them. **One mail, not
two:** GoTrue chooses a different template *slot* for a first-time address (confirmation)
than for a returning one (magic link), so both slots point at the same file - that is what
makes the two cases identical, and leaving either unset means half the players still get
the stock mail.

Four values, in the `.env` beside `docker-compose.yml` (the file `dkr/.env` is a copy of).
No quotes, no spaces around `=`:

```
GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Your Mondialino code
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Your Mondialino code
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://mrsmania.github.io/wcsim/email/otp.html
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://mrsmania.github.io/wcsim/email/otp.html
```

Then two things that are easy to get wrong, in this order:

1. **The `auth` service has to pass them through.** The official compose does not hand
   `.env` to containers wholesale; it lists an explicit `environment:` allowlist per
   service, and the mailer template keys ship commented out. A value in `.env` that no
   service references reaches nothing. `grep -n MAILER docker-compose.yml`, and if the
   keys are missing or commented, add them under the `auth` service's `environment:` as
   `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: ${GOTRUE_MAILER_TEMPLATES_MAGIC_LINK}` and so on.
   (A service with `env_file: .env` needs none of this.)
2. **Re-create the container, do not restart it.** Environment is fixed at creation, so
   `docker compose restart auth` comes back with the old values and looks like nothing
   happened. `docker compose up -d auth`, or in Container Manager use the Project's
   **Action → Build** rather than a container Restart.

Verify in that order too: `docker compose exec auth env | grep GOTRUE_MAILER_` proves the
values are *inside* the container, and `curl -sI https://mrsmania.github.io/wcsim/email/otp.html`
**from the NAS** proves it can fetch the template as it sends.

Worth knowing:

- **The subject line tells you which half failed.** Subjects are used verbatim while the
  body is fetched. Neither changed = the variables never arrived (allowlist, or a plain
  restart). Subject changed but the body is stock = the fetch failed, and GoTrue answers
  that by silently falling back to its built-in default;
  `docker compose logs --tail=200 auth | grep -i -e template -e mailer` shows it.
- Editing the mail afterwards is a push to `main` plus the Pages deploy; no restart is
  needed for content changes, only for these variables.
- Rolling back is deleting the four lines and `docker compose up -d auth`. No database
  state is involved.
- There is deliberately **no copy button** in the mail: mail clients do not run
  JavaScript, and no HTML or CSS writes to the clipboard. The code is instead large,
  letter-spaced and selectable, so tap-and-hold copies it on a phone and the OS's own
  one-time-code suggestion can pick it up (the app's code field carries
  `autocomplete="one-time-code"`, and a complete code submits itself, so accepting the
  suggestion is the whole sign-in). There is no link in the mail either: the only
  placeholder is the token, and the app verifies with the code alone.
- **Two obstacles from the shell**, if you are doing this over SSH rather than in Container
  Manager: `docker` is not on a non-root PATH (it is `/usr/local/bin/docker`), and a
  non-root account cannot reach the daemon socket at all, so `sudo -i` first. Editing
  `.env` and `docker-compose.yml` needs neither - they are owner-writable - and the edits
  are inert until the re-create, which makes preparing them and rebuilding two separable
  jobs.

**Applied on this NAS 2026-08-18** and confirmed: all four values present inside the
container, and the mail arrives as designed. The pre-change files are kept beside
themselves as `.env.pre-mailer` and `docker-compose.yml.pre-mailer`, which is what the
rollback above restores.

**AND IT WAS SILENTLY UNDONE ON 2026-08-26, by the referee deploy.** Worth reading before
touching this stack again, because nothing about it looked like a failure at the time.
`scripts/deploy-referee.sh --config` REPLACES the NAS's `docker-compose.yml` with the local
`dkr/docker-compose.yml`, and that local copy was a stock-derived file that had never
carried the four keys: the mailer edits of 2026-08-18 were made by hand ON THE NAS, so the
laptop's staging copy never learned about them. The deploy verified its md5, reported
success, re-created `auth`, and every player went back to GoTrue's built-in "Magic Link"
mail, complete with a login link the app cannot even use.

Three things this settles:

- **The rename was not involved**, which is the first place suspicion lands. `otp.html` is
  fetched by URL from the Pages build and was serving correctly throughout; the Mondialino
  commit changed one word of wordmark text inside it and nothing else.
- **`.env` was never the problem, and still is not.** The script only appends
  `PVP_REFEREE_PASSWORD` there, so the four values survived on the NAS. What was lost is the
  compose ALLOWLIST that hands them to the container, which is the failure mode this section
  already warned about: a value in `.env` that no service references reaches nothing.
- **A hand edit on the NAS that the laptop's staging copy does not carry will be reverted by
  the next deploy.** Anything edited directly on the box belongs in `dkr/` the same day.

Fixed in two places, so it cannot happen a third time: the four keys are in
`dkr/docker-compose.yml` under the `auth` service with a comment saying why they are not in
the stock file, and `require_local_files` in `scripts/deploy-referee.sh` now refuses to run
any stage while they are absent. That guard was mutation-tested (strip one key, confirm it
goes red) and it fires before the first ssh, so a bad file cannot reach the NAS.

**Restored on the NAS 2026-08-27**, and the rename was finished in the same re-create so it
cost one outage rather than two. `SMTP_SENDER_NAME` and both subject lines said "World Cup
Simulator" right up to that point: the 2026-08-26 rename reached the wordmark inside
`otp.html` and nothing else, because those three live on the NAS rather than in the repo.
They now read `Mondialino` and `Your Mondialino code`. The sender ADDRESS is unchanged and
is not a rename job: `worldcupsim@gmail.com` is a real mailbox, so it can only be replaced.

Worth copying if you ever do this again, because it made the whole thing verifiable before
anything restarted. `docker compose config` resolves the `.env` against the compose file and
prints what a service WOULD receive, and it creates nothing, so the fix was proved while the
old container was still serving. Then `up -d --no-deps auth` to touch exactly one container,
`docker compose exec auth env` for what actually landed inside it, and only then plain HTTPS
against `/auth/v1/settings` with the anon key. The bridge firewall rules survived this one,
with the Task Scheduler job open and ready as a belt-and-braces measure beside its 5-minute
schedule.

---

## 5. Point the game at it

The game keeps deploying to GitHub Pages exactly as it does today; it just learns where the
API is. Two values, neither secret (the anon key is designed to ship in a browser; row-level
security is what protects data):

- `VITE_SUPABASE_URL` = `https://HOST` (the NAS)
- `VITE_SUPABASE_ANON_KEY` = the anon key

Add both as **repository variables** in GitHub (Settings → Secrets and variables →
Actions), so the Pages build picks them up. Absent values leave the accounts flag off and
the build behaves exactly as today, which keeps a fork of the repo working.

---

## 6. Schema, and letting yourself in

The SQL is in the repo. Apply it in order, either by pasting into Studio's SQL editor or
with `psql` from the NAS:

```
supabase/migrations/0001_schema.sql              tables
supabase/migrations/0002_rls.sql                 row-level security
supabase/migrations/0003_functions.sql           the earn / trade / import functions
supabase/migrations/0004_signup.sql              invite gate + profile creation
supabase/migrations/0005_open_signup.sql         drops the invite gate
supabase/migrations/0006_client_surface.sql      finish_run as the client calls it
supabase/migrations/0007_conflict_status.sql     a version conflict answers 409
supabase/migrations/0008_function_grants.sql     who may call what
supabase/migrations/0009_finish_run_tolerant.sql an unknown id is dropped, not fatal
supabase/migrations/0010_finish_run_one_trip.sql banking costs one round trip
supabase/migrations/0011_career_challenges.sql   the career carries its completed challenges
supabase/seed/collectibles.sql                   the catalogue (generated, re-runnable)
```

Every file is `begin; ... commit;`, so a failed one leaves nothing behind and can be
re-run once fixed. **A new migration on a stack that is already serving** is the same
paste: they are written to be safe against a client that has not caught up yet, and the
newest (`0011`) is deliberately additive - the client keeps working before it is applied
and persists challenge progress afterwards, in either order.

Rather than pasting, you can send a file from a machine that can reach the NAS. It goes
the same way `push:collectibles` does (Studio's pg-meta endpoint, service key read from
`dkr/.env`), and prints whatever the server answers:

```
npm run push:sql -- supabase/migrations/0010_finish_run_one_trip.sql
npm run push:sql -- --query "select count(*) from profiles"     # any one-off query
npm run push:sql -- --dry-run supabase/migrations/0010_...sql   # show, do not send
```

The seed is idempotent, so re-running it after a dataset change is the whole update
procedure. Regenerate it with `npm run gen:collectibles` whenever ratings or
`STICKER_TIERS` change; `npm run checks` fails while it is stale.

**"could not reach the server - fetch failed" is not always the network.** It said that on
2026-08-25 while `curl https://wcsim-api.mariosmania.ch/` from the same shell answered 401,
which is the server being perfectly up. The cause was TLS trust: **Node ships its own CA
list and does not read the Windows certificate store**, so a chain the OS (and curl) accepts
comes back to `fetch` as *unable to get local issuer certificate*. The fix is one env var,
on Node 22.15 or newer:

```
NODE_OPTIONS=--use-system-ca npm run push:collectibles
NODE_OPTIONS=--use-system-ca npm run push:sql -- --query "select count(*) from profiles"
```

`scripts/dkr-env.mjs` recognises that error and prints the same line, so the message is on
the failure rather than only here. Check `curl` before concluding the NAS is down. Do **not**
reach for `NODE_TLS_REJECT_UNAUTHORIZED=0`: it disables verification for the whole process,
including the request that carries the service-role key.

**There is no invite step any more.** An `insert into allowed_emails` used to go here, one
row per person, without which nobody could sign up. Migration `0005` opened signup and
`drop table`d it, so that insert now fails with *relation "allowed_emails" does not exist*
(confirmed against the server 2026-08-20). Nothing needs doing: signup is open, and the only
trigger left on `auth.users` is `create_profile_on_signup`, which gives each new account its
`profiles` row.

**That trigger is load-bearing, and it only fires on INSERT.** An `auth.users` row without a
matching `profiles` row cannot save anything - every per-user table is
`references profiles (id)`, so each write is a foreign-key violation, which the client shows
as the blocking "can't reach your account" screen rather than as a fault. Nothing back-fills
a profile at sign-in. Four accounts on this server predated the trigger and were exactly that
broken until the 2026-08-20 reset cleared them, so if you ever restore or hand-insert an auth
user, insert its profile row too.

**Worth a look while you are in Studio,** because these are the checks that cannot be run
until the database exists:

- a new signup lands a `profiles` row (the trigger above; there is no invite gate to test)
- a second `finish_run` with the same run key is refused (that is what makes banking a
  run's stickers once-per-run)
- a trade the duplicate pool cannot afford is refused
- a `save_career` that raises its own xp or prestige is refused
- signing in as a second account cannot see the first account's rows

---

## 7. The test that actually proves it

**Sign in from a phone on mobile data, with wifi off.** Nothing else exercises the whole
chain: DNS resolving your DDNS name, the router forwarding, the certificate being trusted
by a device that has never seen your network, the CORS allowlist, and the OTP mail landing.

Check the spam folder for that first code. A plain gmail.com sender lands there more often
than not (D5, accepted).

---

## Trimming a stack that is already running

The setup above says to trim before starting; the stack that actually went up in August
2026 was the full default set, so `storage`, `imgproxy`, `realtime` and the edge runtime
have been running (and reachable at `/storage/v1/` and `/functions/v1/`, the bundled
example function included) with nothing using them. The game never calls any of the three:
`supabase-js` only opens a realtime socket or a storage client when the code asks for one,
and nothing does.

**The one-minute mitigation, if you want the exposure gone before the tidy-up:** Container
Manager → Container, stop `supabase-storage`, `supabase-imgproxy`,
`realtime-dev.supabase-realtime` and `supabase-edge-functions`. Play a run to confirm
nothing missed them. Reversible in a click, but a project rebuild brings them back, so
follow it with the edits.

**The durable version.** Three files in the project folder, and the gateway's config is the
half that is easy to forget:

1. `docker-compose.yml` - delete the four service blocks and the now-unused `deno-cache:`
   entry under `volumes:`. Nothing else has to change: `storage`'s `depends_on` goes with
   its own block, and Studio's read-only `./volumes/functions` mount is inert once no
   runtime executes them.
2. `volumes/api/envoy/cds.yaml` - delete the `realtime`, `storage` and `functions`
   clusters.
3. `volumes/api/envoy/lds.template.yaml` - delete the six routes pointing at them:
   `functions-v1-all`, the unnamed `/storage/v1/` route,
   `realtime-v1-api-openapi-blocked`, `realtime-v1-api-tenants-blocked`,
   `realtime-v1-api-protected`, `realtime-v1-ws-protected`.

Routes and clusters go together. Both are loaded dynamically (xDS from those two files),
so a route left pointing at a deleted cluster answers 503 rather than stopping envoy from
starting - it will not lock you out, but do not leave it that way. The embedded Lua filters
keep naming `functions-v1-all` and `realtime-v1-ws-protected`; those branches simply never
match once no route carries the name, and rewriting 300 lines of Lua buys nothing.

A prepared copy of all three sits in this repo's `dkr/` folder (untracked), with the
originals kept beside them as `*.bak`.

**Copying the files up.** `scp` may fail with `subsystem request failed on channel 0`: DSM
ships with the SFTP subsystem off and modern `scp` uses it by default. Add `-O` to fall back
to the old protocol (`scp -O file user@nas:path/`), or stream the file instead with
`ssh user@nas "cat path/file" > local`. Paste one `scp` line at a time in Git Bash; a
multi-line paste can be eaten by bracketed paste, which skips commands without saying so.
**Confirm every upload by hash** (`md5sum` on the NAS against `md5sum` locally) before
applying, rather than trusting that all three transfers happened.

**Apply:** `docker compose up -d --remove-orphans`, then `docker compose restart api-gw`
(Container Manager: Project → Action → Build). `--remove-orphans` is the part that deletes
the four containers; without it they keep running happily next to the trimmed project. The
restart matters: envoy reads its route config at startup, so an edited `lds.template.yaml`
changes nothing until then.

**Verify.** Both `/auth/v1/` and `/rest/v1/` sit behind an apikey gate in the gateway, so a
bare `curl` answers 401 whether or not anything is wrong - send the anon key. And `/rest/v1/`
*root* answers 403 to the anon key by design (that route wants the service-role key, so the
schema is not published), which is why the check reads a table instead:

```
docker compose ps        # 6 services: db, auth, rest, api-gw, studio, meta

curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: ANON_KEY" \
  https://HOST/auth/v1/health                                    # 200
curl -s -w '\n%{http_code}\n' -H "apikey: ANON_KEY" \
  'https://HOST/rest/v1/collectibles?select=player_id&limit=1'   # 200, body []
curl -s -D - -o /dev/null https://HOST/functions/v1/hello | grep -i www-authenticate
curl -s -D - -o /dev/null https://HOST/storage/v1/status  | grep -i www-authenticate
```

The empty `[]` is correct: `collectibles` is readable by signed-in users only, so an anon key
sees no rows, and the 200 proves gateway → PostgREST → Postgres. For the last two the status
code alone proves nothing (401 is also what the apikey gate returns) - the
`www-authenticate: Basic` header is the evidence, because it means the request reached
Studio's basic-auth wall through the catch-all route, there being no `/storage/v1/` or
`/functions/v1/` route left to match. Then sign in on the deployed game and finish a run:
album, career and run state all go through `/rest/v1/`, which is untouched.

**Rollback** is the `.pre-trim` copies plus `docker compose up -d` and
`docker compose restart api-gw`.

**Applied 2026-08-18.** The four containers are gone, `docker compose ps` shows the six
above, and every check listed here passes on the live stack. One surprise worth keeping:
the NAS copy of `docker-compose.yml` had no `supavisor` block (dropped during setup, since
it is the service that maps 5432 and 6543), so the prepared file had to be re-merged onto
it. Comparing hashes before uploading is what caught that.

---

## The container firewall rules (and the DNS trap)

DSM's firewall applies to the docker bridges, so with it enabled containers cannot reach
each other and the stack breaks in a way that looks like the app's fault: the gateway
answers, every service behind it returns 503. The rules below fix it. They live in a
**boot-up task** (Control Panel → Task Scheduler → Triggered Task, user root), because
DSM rewrites these chains on boot *and* whenever firewall settings are edited.

```
# At boot, let DSM finish writing its own chains first (see below); run by hand
# later there is nothing to wait for, so it heals the stack immediately.
[ "$(cut -d. -f1 /proc/uptime)" -lt 300 ] && sleep 60
# Firewall off means the chain does not exist, and there is nothing to do.
/sbin/iptables -L FORWARD_FIREWALL -n >/dev/null 2>&1 || exit 0
# Already in place: a re-run is a no-op rather than a second copy of each rule.
/sbin/iptables -C FORWARD_FIREWALL -i docker+ -o docker+ -j ACCEPT 2>/dev/null && exit 0
/sbin/iptables -I FORWARD_FIREWALL 1 -i docker+ -o docker+ -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 2 -i docker+ -d 192.168.1.0/24 -p udp --dport 53 -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 3 -i docker+ -d 192.168.1.0/24 -p tcp --dport 53 -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 4 -i docker+ -d 192.168.1.0/24 -j DROP
/sbin/iptables -I FORWARD_FIREWALL 5 -i docker+ -j ACCEPT
logger -t docker-bridge-firewall "re-inserted docker bridge FORWARD rules" 2>/dev/null
exit 0
```

Order matters. Containers talk to each other (1), may ask the router for DNS (2, 3), may
not otherwise touch the LAN (4), and may reach the internet (5). Everything around them is
scaffolding over the original version, which opened with a blind `sleep 60`.

**What that delay is for is DSM, not Docker.** `iptables` inserts a rule naming an
interface that does not exist yet quite happily, so nothing here waits on dockerd; the wait
is for DSM to finish writing its own firewall chains at boot, since these five have to land
on top of that rather than be wiped by a rewrite arriving afterwards. Hence the uptime gate
rather than a test for `docker0`, which can appear first and would silently cost the boot
path what it is waiting for. Below 300 seconds of uptime means "this is boot", so the
proven 60-second settle stands; a manual run skips it and heals the stack at once.

The rest keeps DSM from reporting the task as terminated abnormally, which is what it does
when the last command fails: `-L` exits cleanly when the firewall is off and the chain does
not exist, `-C` makes a re-run a no-op instead of a second copy of every rule, and `logger`
is redirected with an explicit `exit 0` after it, so a missing `logger` cannot look like a
failed run. Its lines land in `/var/log/messages`, which is how to see how often this
actually fires.

**The trigger is Boot-up, so nothing re-applies these after a firewall edit** (found
2026-08-19, the second time this bit). Enabling the profile or changing a single rule makes
DSM rewrite the chain, the boot task does not fire, and the stack is down until you go to
Task Scheduler and press **Run** on it. That is the whole recovery. Turning the firewall
off also "fixes" it, which misleads: it removes the blocking chain rather than restoring
these rules. **The job ALSO runs on a 5-minute schedule** (confirmed in place 2026-08-27),
which is what makes the outage self-healing rather than lasting until somebody notices. This
paragraph used to argue the opposite, that a repeating task was not worth a job running
forever for something you do twice a year: that reasoning died when the rules turned out to
be wiped by ANY container operation and not just by boots and firewall edits, which is many
times a year and always during work that hides the symptom. Press **Run** anyway when you
know you have just caused it, rather than waiting out the window.

**Watched working, 2026-08-27**, which is the first measurement of it rather than a claim.
Re-creating `auth` for the mailer fix left the stack healthy for several minutes and then
took it down anyway: `/auth/v1/settings` went 503 at 22:23:33 and was back at **22:24:44**,
about a minute, with nobody touching DSM. `/rest/v1/` stayed 403 throughout, so a single
endpoint is not enough to see this. Two things worth taking from it. The wipe does **not**
have to be simultaneous with the container operation, so a health check taken straight
afterwards can pass and mean nothing - which is exactly how this stayed hidden before the
schedule existed. And the referee is the clearest tell: it answered `upstream connect error
... connection timeout` while auth was still merely 503.

**So `--verify` WAITS for it now** (2026-08-27, after the third deploy in one day tripped it
and reported the image as unreachable). The deploy causes the wipe itself, so failing on the
first probe is the script blaming the image for its own footprint: it retries the version
probe twelve times thirty seconds apart, says why it is waiting, and reports how long the
rules took to come back. It waits only for that symptom - a wrong image, a refused token or a
database fault still answer at once and are reported at once. Pressing **Run** on the Task
Scheduler job skips the wait.

**This cannot be fixed in the app or the compose file.** The block is in the host's
`FORWARD` chain, below anything a container can influence: envoy must reach `rest`/`auth`
and they must reach `db` over the bridge. Sharing one network namespace
(`network_mode: service:db`) would put that traffic on loopback and out of iptables' way,
but PostgREST and studio both listen on 3000, so they collide, and it forks the upstream
compose that setup relies on. Nor is an extra open port the answer: 443 in, the reverse
proxy reaching the gateway on loopback, and a `db` that publishes nothing (the pooler was
dropped) are all unaffected by this.

**The DNS trap**, found 2026-08-17 the hard way. Rules 2 and 3 are not optional. Without
them, rule 4 also blocks the DNS queries Docker's internal resolver forwards to the
router, and the symptom points nowhere near the firewall:

```
Error sending magic link email
error: dial tcp: lookup smtp.gmail.com on 127.0.0.11:53: server misbehaving
```

Sign-in emails stop, the credentials test fine from anywhere else, and it reads as a Gmail
or password problem. `docker run --rm --network supabase_default busybox nslookup
smtp.gmail.com` settles it in one command.

Two other symptoms of the same class, worth recognising:
- **All services 503 while the gateway answers** - rules missing entirely. Re-add them, then
  `docker compose restart api-gw`: envoy marks upstreams dead during the outage and does not
  always recover on its own.
- **Sign-in works but nothing loads** - PostgREST holding a dead connection pool after the
  network was cut under it. `docker compose restart rest`.

**Telling this apart from a closed port takes one command**, and it is worth doing before
touching any firewall rule, since the two look identical in a browser (the app sits on its
boot spinner for five seconds, then shows the "can't reach your account" screen):

```
curl -s -w "\n[%{http_code} in %{time_total}s]\n" -H "apikey: $ANON_KEY" \
  https://HOST/auth/v1/health
```

- `upstream connect error or disconnect/reset before headers. reset reason: connection
  timeout` with a **503 in ~5s** is this section: 443 and envoy are fine, the bridge is
  blocked. Press Run on the task.
- A **timeout or refused connection** is the inbound path instead: router forward, the
  reverse proxy rule, or the DSM firewall's own allow rule for 443 (§3).
- A version JSON means the server is healthy and the problem is elsewhere.

Note that the port list in a DSM rule scoped to `172.17.0.0-172.31.255.255` covers only
container → host traffic. Container → container never appears in the firewall UI at all,
which is why the console shows every `/rest/v1/*` read failing while the gateway itself
answers instantly.

## The referee (versus)

Roadmap item 18, wave 3 of `docs/pvp-plan.md`. This is the sit-at-the-box checklist for it.
Everything below is additive: nothing here touches the accounts stack the game already uses,
and stopping at any step leaves the game exactly as it is, because `FEATURES.pvp` is off
until the last one.

> **STATE, 2026-08-26.** A session with HTTPS reach to the server but no shell on the box
> did the half that can be done over `push:sql`:
>
> - **Step 1's migration is APPLIED and verified** against the real PostgreSQL 17.6. It was
>   rehearsed first inside a rolled-back transaction, as the house rule requires, and the
>   rehearsal **found a defect that was corrected before the apply**: `revoke ... from
>   public` does not remove the Supabase image's explicit grant to `anon`, so
>   `set_display_name` would have been the one function in the database that `anon` could
>   execute. It reads `from public, anon` now, and its ACL matches every other function
>   there.
> - **Verification steps 1, 2, 4, 5, 6 and 7 pass.** Step 3 (a second account cannot take a
>   held name) is **not runnable: the server has exactly one profile**, which the migration
>   header anticipated - its stated fallback, that the unique index exists, is confirmed
>   (`profiles_name_key_uniq` on `name_key where name_key is not null`). Step 8 is a browser
>   check and was not driven; all six single-player functions are present and untouched.
> - **Step 1's PASSWORD is deliberately NOT set.** `pvp_referee` is still `nologin` exactly
>   as 0016 left it. A login-capable role with no container using it is surface for nothing,
>   and the credential has to be carried to the box by hand anyway - so do it in the same
>   sitting as steps 2 to 4. `dkr/.env` carries a commented `PVP_REFEREE_PASSWORD=`
>   placeholder saying the same.
> - **Steps 2 and 4's file edits are STAGED in `dkr/`**, unapplied: realtime is restored
>   into `docker-compose.yml`, `cds.yaml` and `lds.template.yaml` **verbatim from the `.bak`
>   originals** (verified byte-identical), and a `referee` service, cluster and route are
>   added beside them. All three edits are purely additive. **They have never been parsed by
>   a YAML reader or seen by envoy** - no parser was installable on that machine - so treat
>   them as a draft to read, not a tested artifact.
> - **Steps 3, 5 and 6 are untouched**, and the DSM WebSocket header in step 2 is a GUI
>   action nobody without the console can do.
>
> **DEPLOYED 2026-08-26, and three things bit that this runbook did not predict.** All
> three presented as the referee being broken and none of them was. In the order they
> appeared:
>
> 1. **The gateway's RBAC filter is DEFAULT DENY, and step 4 above does not mention it.**
>    "no apikey filter" describes the Lua filter, which is opt-IN by route name via
>    `PROTECTED_ROUTES`. There is a SECOND gate: the global
>    `envoy.filters.http.rbac` is `action: ALLOW` with policies naming `/auth/v1/`,
>    `/rest/v1/`, `/realtime/v1/` and `/graphql/v1`, so a path matching no policy is
>    refused outright. `/referee/` matched none. Symptom: **`RBAC: access denied`**, with
>    the referee never seeing the request. The fix is a per-route `RBACPerRoute` allow_all,
>    exactly as `/auth/v1/verify` and the OAuth callback already carry.
> 2. **Do NOT rewrite the `/referee/` prefix.** Every other route here sets
>    `prefix_rewrite`, so it is the natural thing to copy, and it is wrong: the referee's
>    own router matches the FULL path (`/referee/version`, `/referee/v1/rooms/...`).
>    Stripping the prefix makes every request miss the two unauthenticated routes, fall
>    through to the session check and return **401** - which reads as a credential problem.
>    It also fails the container's health check, so the container goes **unhealthy**, envoy
>    drops its only endpoint, and the route then answers 503. Both health checks must ask
>    for **`/referee/v1/health`**, which is the one path that answers without a session.
> 3. **The docker bridge firewall rules are wiped by CONTAINER OPERATIONS, not only by
>    boots and firewall edits.** This is the one that matters beyond versus. Creating and
>    removing containers during the deploy wiped them twice, and each time **the whole
>    accounts stack went down**: `/auth/v1/settings` and `/rest/v1/` both 503, which is the
>    blocking unreachable screen for every signed-in player of the SINGLE-PLAYER game. It
>    is invisible from the gateway's side - envoy keeps serving on connections it already
>    holds, so a casual check looks fine while new connections all fail.
>    **It is wiped by creating or removing ANY container**, which makes it a trap during
>    exactly the work that provokes it: a throwaway `docker run --rm` used to CHECK whether
>    the stack is healthy wipes the rules again as it exits, so the stack recovers for a few
>    minutes and then fails, and it reads as a flapping network. Diagnose this with plain
>    HTTPS calls, never with a throwaway container. The Task Scheduler job is on a
>    **5-minute schedule** as well as its triggers (done, confirmed 2026-08-27) - it is a
>    no-op when the rules are there, and it turns a silent outage lasting until somebody
>    notices into one that heals itself.
>    **Re-run the job after any container work, and check a real upstream
>    call afterwards.** Not `/auth/v1/health` without a key, which returns 401 from the
>    gateway itself and proves nothing; use `/auth/v1/settings` with the anon key and
>    require a 200.
>
> The script's `--verify` now names which of the three it is looking at rather than
> blaming the image, which it did on the first run and which cost two pointless rebuilds.
>
> **And `--verify` used to ABORT SILENTLY at step 4, which is worth knowing because the
> symptom is indistinguishable from finishing.** Its last two steps reach the database
> through compose on the NAS, and Synology needs a full path and sudo for that, so the
> script probes four spellings and remembers the one that works - except `--verify` never
> ran the probe and its two calls were written as a bare `docker compose`. Under
> `set -euo pipefail` that fails inside a command substitution and takes the whole script
> with it: the step-4 heading prints, nothing follows, and the shell reports success. Fixed,
> and `npm run checks` now asserts that every stage touching the NAS's docker detects it
> first and that none names it directly.

> **THERE IS A SCRIPT FOR THE MECHANICAL HALF: `scripts/deploy-referee.sh`.** Run it from
> the repository root in Git Bash, on a machine that can reach the NAS, one stage at a
> time - `--check` changes nothing anywhere, and prints what the rest would do:
>
> ```
> bash scripts/deploy-referee.sh --check  user@192.168.1.115
> bash scripts/deploy-referee.sh --build  user@192.168.1.115
> bash scripts/deploy-referee.sh --config user@192.168.1.115
> bash scripts/deploy-referee.sh --up     user@192.168.1.115
> bash scripts/deploy-referee.sh --verify user@192.168.1.115
> ```
>
> **The thing it exists to solve is where the image gets built.** The referee is the first
> locally built image this stack has ever had - every other container pulls a published
> one - and there is no repository checkout on the NAS. So `--build` streams `git archive
> HEAD` up and builds there, which needs no Node or toolchain on the box because the
> Dockerfile is multi-stage. If that account cannot reach the Docker socket (on Synology it
> usually needs `administrators`), the source is already sitting in `/tmp` for Container
> Manager to build from instead.
>
> It backs up every file it replaces, verifies each transfer by `md5sum`, never takes the
> password as an argument, and refuses to restart anything if `docker compose config`
> rejects the edited YAML. It does NOT run the `alter role` (it prints it for Studio), and
> it cannot do the two GUI steps.
>
> **`--verify` compares the served `dataset` hash against what this checkout computes**,
> which is the check that catches the failure nothing else will: a referee built from the
> wrong commit is healthy, serving, and refusing every room with "Versus is updating". That
> hash moved on 2026-08-26 when the 2026 World Cup was added, so an image built before that
> is wrong.

> **A note on the referee route, since it saves reading the Lua:** the apikey gate is
> **opt-in by route name**, via the `PROTECTED_ROUTES` table in `lds.template.yaml`. So the
> staged `referee` route is ungated simply by not being listed there, which is what the
> step 4 warning asks for - and restoring the two realtime routes re-gates *them*
> automatically, because their names are already in that table. Neither needed a Lua edit.

**Do it in this order.** The client is deployed by pushing to `main` and the server is not,
so the server goes first, always - the same rule migrations already follow.

### 1. The migration, and the role's password

```
npm run push:sql -- --dry-run supabase/migrations/0017_pvp_referee.sql   # no credentials needed
npm run push:sql -- supabase/migrations/0017_pvp_referee.sql
```

Then work the eight verification steps in that file's own header. They are written to be
run, not read; step 7 in particular is the one this migration exists for.

The `pvp_referee` role from 0016 is `nologin` with no password, because a credential does
not belong in a public repository. Give it one, at the SQL editor:

```
alter role pvp_referee login password 'something long and random';
```

Nothing else in the stack uses that role, so rotating it later is one `alter role` and one
container restart.

### 2. Realtime, back into the stack

The trim above removed it. Undo that removal **for Realtime only** - storage, imgproxy and
the edge runtime stay out.

1. `docker-compose.yml`: put the `realtime` service block back.
2. `volumes/api/envoy/cds.yaml`: put the `realtime` cluster back.
3. `volumes/api/envoy/lds.template.yaml`: put back `realtime-v1-api-protected` and
   `realtime-v1-ws-protected`. The two `*-blocked` routes are a deliberate omission: they
   exist to refuse the tenant-administration paths, and nothing here needs them.
4. **WebSocket upgrade on the DSM reverse proxy**, which nothing in this stack has ever
   needed before. Control Panel → Login Portal → Advanced → Reverse Proxy → the rule for
   `HOST` → Custom Header → Create → WebSocket. **A missing upgrade header presents as "the
   lobby never updates", with a clean 200 in the logs**, so check this before suspecting the
   referee.
5. Realtime needs a **tenant provisioned with the JWT secret**. Follow the Supabase
   self-hosting notes for the image version you are running rather than a recipe copied
   here, which would rot.

Then `docker compose up -d` and `docker compose restart api-gw` (envoy reads its routes at
startup, so an edited `lds.template.yaml` changes nothing until then).

**Broadcast only** (P33). Do not enable `postgres_changes`: it needs a replication slot, and
a slot nothing drains pins the write-ahead log until the disk fills and Postgres refuses
writes - which would give **every signed-in player the blocking unreachable screen for the
single-player game**, because of a versus feature nobody was using. Set
`max_slot_wal_keep_size` regardless.

### 3. The referee container

Build from the repository root (the image reaches into `src/` - it bundles the game's own
rules rather than reimplementing them):

```
docker build -f referee/Dockerfile -t wcsim-referee .
```

Add it to the same compose project, on the same network as `db` and `api-gw`, with the
environment listed in `referee/README.md`. It needs no volume and no port published to the
host: the gateway reaches it by service name.

### 4. The gateway route

One cluster and one route (P46: a route on the existing gateway, not a second hostname -
another hostname is another certificate renewal that can take versus down on its own).

1. `volumes/api/envoy/cds.yaml`: a `referee` cluster pointing at the container's port.
2. `volumes/api/envoy/lds.template.yaml`: a route with prefix `/referee/` to that cluster,
   **with no apikey filter**. The referee verifies the player's own session itself and
   refuses the anon key on purpose, so an apikey gate in front of it would be checking the
   one credential it exists to reject.
3. `docker compose restart api-gw`.

> **IF ROOMS 500 ON A SERVER THAT WAS SET UP BEFORE 2026-08-27, THIS IS WHY.** 0017's
> `alter table pvp_rooms drop column if exists budget_source` did not land on the live
> server, while the rest of 0017 did. 0016 creates that column `not null` with no default and
> the referee stopped supplying it, so every room insert raised `null value in column
> "budget_source" ... violates not-null` and answered HTTP 500. Apply
> `0018_drop_budget_source_for_real.sql`; **no rebuild is needed**, because the running image
> already omits the column. One statement:
> `docker compose exec -T db psql -U postgres -c 'alter table pvp_rooms drop column if exists budget_source;'`

### 5. Verify, before pointing the client at it

**THE FIRST THREE CHECKS NEVER TOUCH THE DATABASE, AND THAT IS HOW A DEPLOY THIS RUNBOOK
CALLED VERIFIED HANDED A PLAYER A 500.** `/referee/version` reads a constant the image
bundles; both 401s are refused before Postgres is reached. So passing them proves the
routing and the JWT and says nothing at all about whether a room can be written. `--verify`
now mints a session on the box from the stack's own `JWT_SECRET`, creates a real room,
**changes it**, and deletes it again; do that, or open a room in a browser with
`docker compose logs -f referee` running beside you. **A version endpoint answering is not a
working referee.**

**AND CREATING A ROOM IS NOT READING ONE BACK**, which is a second deploy this runbook
called verified and a second thing it could not see. Creating builds the room in memory and
inserts it; every other operation LOADS one out of Postgres first. On 2026-08-27 two columns
the row mapper needs were missing from the two queries that fetch a room, so the referee
opened rooms happily and then failed on every join, ready, start and pick, and swept every
room into a rollback once a second. Step 5 of `--verify` is now one more call that changes
the room it just made, which is the whole load-mutate-save path. If it ever reports a throw
on a room the same run created, the fault is that path and the log names it.

Note what the version handshake CANNOT catch: an image built one commit early. It compares
the protocol and the dataset hash, so a referee whose *code* is stale but whose squads are
identical passes it and then fails on its first write. `41d8d67` removed a column from the
room insert and `0017` dropped that column, and neither moved the dataset hash.

```
curl -s https://HOST/referee/version                          # {"protocol":1,"dataset":"..."}
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://HOST/referee/v1/rooms                        # 401, no token
curl -s -X POST -H "Authorization: Bearer ANON_KEY" \
  https://HOST/referee/v1/rooms                                # 401 - and this is the one
                                                               #   that matters
```

The third is the check worth doing by hand: the anon key is a **valid signature from the
same secret** and it ships in the browser bundle, so a referee that only verifies signatures
accepts it from anybody on the internet. The response's `detail` should say
`not-authenticated`.

The `dataset` hash must equal what the deployed client computes. It is
`datasetHash()` in `src/domain/pvpVersion.ts`; the client compares them when the Versus
screen mounts and shows "Versus is updating" rather than letting anybody into a room that
will break halfway through a draft.

### 6. Turn it on for the client

Set the repository **variable** `VITE_REFEREE_URL` to `https://HOST/referee` and push (or
re-run the deploy workflow). `FEATURES.pvp` derives from it and the two account variables
together, so until this is set the deployed game has no Versus at all - which is what makes
every step above safe to do in advance.

### If it goes wrong

- **Unset `VITE_REFEREE_URL` and redeploy.** Versus disappears from the client and nothing
  else changes; the containers can stay up.
- The full undo is the rollback block in `0017_pvp_referee.sql`, then 0016's, then stopping
  the two containers and reverting the three envoy files.

## Afterwards

- **Updates are manual.** Pull new images deliberately; self-hosted version bumps
  occasionally need a hand-applied step. Read their release notes before a jump.
- **Nothing is backed up** (NFR-6, an accepted decision). If you change your mind, a
  nightly `pg_dump` into a folder Hyper Backup already covers is the cheap version.
- **Rotating `JWT_SECRET` invalidates both keys and every session**, so it is not a casual
  change once people are signed in.
