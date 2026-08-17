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
4. **Control Panel → Security → Firewall:** allow the forwarded port, and keep Postgres
   (5432) LAN-only.

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
supabase/migrations/0001_schema.sql     tables
supabase/migrations/0002_rls.sql        row-level security
supabase/migrations/0003_functions.sql  the earn / trade / import functions
supabase/migrations/0004_signup.sql     invite gate + profile creation
supabase/seed/collectibles.sql          the catalogue (generated, re-runnable)
```

The seed is idempotent, so re-running it after a dataset change is the whole update
procedure. Regenerate it with `npm run gen:collectibles` whenever ratings or
`STICKER_TIERS` change; `npm run checks` fails while it is stale.

Then let yourself in, or nothing can sign up:

```sql
insert into allowed_emails (email, note) values ('you@example.com', 'owner');
```

One insert per person. Signup is refused for anything not in that table.

**Worth a look while you are in Studio,** because these are the checks that cannot be run
until the database exists:

- an uninvited address is refused at signup
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

**Apply:** `docker compose up -d --remove-orphans` (Container Manager: Project → Action →
Build). `--remove-orphans` is the part that deletes the four containers; without it they
keep running happily next to the trimmed project.

**Verify** - the first two must still work, the next two must no longer be served by a
storage or edge-runtime container:

```
curl -s -o /dev/null -w '%{http_code}\n' https://HOST/auth/v1/health
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: ANON_KEY" https://HOST/rest/v1/
curl -s -o /dev/null -w '%{http_code}\n' https://HOST/storage/v1/status
curl -s -o /dev/null -w '%{http_code}\n' https://HOST/functions/v1/hello
docker compose ps        # 6 services: db, auth, rest, api-gw, studio, meta
```

The last two now fall through to the catch-all Studio route, so they answer 401 (basic
auth) instead of 200 - the point is that there is nothing behind them any more. Then sign
in on the deployed game and finish a run: album, career and run state all go through
`/rest/v1/`, which is untouched.

**Rollback** is the `.bak` files plus `docker compose up -d`.

---

## The container firewall rules (and the DNS trap)

DSM's firewall applies to the docker bridges, so with it enabled containers cannot reach
each other and the stack breaks in a way that looks like the app's fault: the gateway
answers, every service behind it returns 503. The rules below fix it. They live in a
**boot-up task** (Control Panel → Task Scheduler → Triggered Task, user root), because
DSM rewrites these chains on boot *and* whenever firewall settings are edited - so if
container traffic dies right after you touch the firewall, re-run them.

```
sleep 60
/sbin/iptables -I FORWARD_FIREWALL 1 -i docker+ -o docker+ -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 2 -i docker+ -d 192.168.1.0/24 -p udp --dport 53 -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 3 -i docker+ -d 192.168.1.0/24 -p tcp --dport 53 -j ACCEPT
/sbin/iptables -I FORWARD_FIREWALL 4 -i docker+ -d 192.168.1.0/24 -j DROP
/sbin/iptables -I FORWARD_FIREWALL 5 -i docker+ -j ACCEPT
```

Order matters. Containers talk to each other (1), may ask the router for DNS (2, 3), may
not otherwise touch the LAN (4), and may reach the internet (5).

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

## Afterwards

- **Updates are manual.** Pull new images deliberately; self-hosted version bumps
  occasionally need a hand-applied step. Read their release notes before a jump.
- **Nothing is backed up** (NFR-6, an accepted decision). If you change your mind, a
  nightly `pg_dump` into a folder Hyper Backup already covers is the cheap version.
- **Rotating `JWT_SECRET` invalidates both keys and every session**, so it is not a casual
  change once people are signed in.
