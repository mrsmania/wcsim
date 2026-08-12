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

1. **Control Panel → External Access → DDNS.** Add a Synology account hostname, e.g.
   `something.synology.me`. DSM keeps it pointed at your changing address.
2. **Control Panel → Security → Certificate.** Add a Let's Encrypt certificate for that
   hostname. DSM renews it on its own. Watch the first renewal: a lapsed certificate blocks
   every signed-in player (D9).

TLS is **mandatory**, not a nicety: the game is served over `https` from GitHub Pages, and a
secure page may not call an insecure endpoint.

Write the final hostname down. Everything below refers to it as `HOST`.

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

1. **Router:** forward the chosen external port to the NAS.
2. **DSM → Login Portal → Advanced → Reverse Proxy.** One rule: source `HOST` on 443
   (HTTPS, with the certificate from step 1) to destination `localhost` on the Supabase
   gateway's port (whatever the compose exposes, `8000` in the default).
3. **Do not add a rule for Studio.** The dashboard stays LAN-only, reached by the NAS's
   local address. This is the difference between an admin panel on your network and one on
   the internet.
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
   - `supavisor` / pooler is optional at this scale; leaving it in is also fine
   Keep: `db`, `auth`, `rest`, the gateway, `studio`, `meta`. Analytics and vector are not
   in the default compose.
3. **Create `.env` from `.env.example`** and set:

   | Group | What |
   |---|---|
   | Postgres | `POSTGRES_PASSWORD` (invent a long one) |
   | Keys | `JWT_SECRET` (long random), and the **anon** + **service** keys derived from it. Supabase's self-hosting page has the generator; the two keys are JWTs signed with that secret, so they must be regenerated together if the secret changes |
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

Two values, neither secret (the anon key is designed to ship in a browser; row-level
security is what protects data):

- `VITE_SUPABASE_URL` = `https://HOST`
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

## Afterwards

- **Updates are manual.** Pull new images deliberately; self-hosted version bumps
  occasionally need a hand-applied step. Read their release notes before a jump.
- **Nothing is backed up** (NFR-6, an accepted decision). If you change your mind, a
  nightly `pg_dump` into a folder Hyper Backup already covers is the cheap version.
- **Rotating `JWT_SECRET` invalidates both keys and every session**, so it is not a casual
  change once people are signed in.
