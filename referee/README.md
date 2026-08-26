# The referee

The server half of player versus player (roadmap item 18, wave 3 of `docs/pvp-plan.md`).
It is the only thing allowed to write a room: clients read through PostgREST under the
policies in migrations 0016 and 0017, and write by asking this.

**Nothing in the game imports it and nothing deploys it yet.** It is built, type-checked by
`npm run build` and exercised by `npm run checks`; putting it on the NAS is the queued half
of this wave. See `docs/nas-setup.md`, "The referee (versus)".

## What it is

Eight small files, each with its own header saying why it is the shape it is:

| File | What |
| --- | --- |
| `src/main.ts` | The HTTP server, the wiring, and the startup order (recover, then sweep, then listen) |
| `src/api.ts` | Every instruction it takes. Pure over a store and a clock, so the checks drive it |
| `src/store.ts` | What it needs from a database, as an interface |
| `src/pgStore.ts` | That interface over Postgres, as the narrow `pvp_referee` role |
| `src/rows.ts` | The room as rows and back. The only file that knows both shapes |
| `src/sweeper.ts` | The stateless pass that moves a room forward, and boot recovery |
| `src/outage.ts` | When P45's recovery applies, which is emphatically not "every sweep" |
| `src/jwt.ts` | The signature. Who to act for is `src/domain/pvpAuth.ts`, deliberately elsewhere |
| `src/broadcast.ts` | The nudge, over Realtime Broadcast |
| `src/view.ts` | What one player may see of a room |

**It bundles the game's own `src/domain` and `src/data`** rather than reimplementing
anything, which is decision P11: a second copy of the rules in SQL or in a server language
would drift from the real one, and the dataset moved three times in a single audit.

## Configuration

| Variable | Required | What |
| --- | --- | --- |
| `REFEREE_DATABASE_URL` | yes | `postgres://pvp_referee:PASSWORD@db:5432/postgres` |
| `SUPABASE_JWT_SECRET` | yes | The stack's `JWT_SECRET`. Sessions are verified here, not by a round trip |
| `SUPABASE_JWT_AUD` | no | Set it if the deployment sets an audience; a token must then carry it |
| `REALTIME_URL` | no | e.g. `http://api-gw:8000`. Absent means rooms poll, which works |
| `REALTIME_SERVICE_KEY` | with `REALTIME_URL` | The service-role key Broadcast is posted with |
| `PORT` | no | 8787 |
| `SWEEP_MS` | no | 1000 |

A missing variable names **all** of them at once, rather than one per container restart.

## Building and running

```bash
npm run referee:build                 # -> dist/referee.mjs, one file
docker build -f referee/Dockerfile -t wcsim-referee .   # FROM THE REPOSITORY ROOT
```

The Dockerfile builds from the root because the bundle reaches into `src/`. It runs
`tsc -b` before bundling: esbuild strips types without looking at them, so without that the
image would build cleanly from code that does not compile.

## Routes

Everything is under `/referee/`, which is what the gateway forwards (P46: a route on the
existing gateway, not a second hostname with its own certificate to let lapse).

| Route | Auth | What |
| --- | --- | --- |
| `GET /referee/version` | none | `{protocol, dataset}`. The handshake (P35) |
| `GET /referee/v1/health` | none | For the gateway |
| `POST /referee/v1/rooms` | session | Create. Answers the room |
| `GET /referee/v1/rooms/:code` | session | The room, as you may see it |
| `POST /referee/v1/rooms/:code/join` | session | Take a seat |
| `POST /referee/v1/rooms/:code/lineup` | session | Formation, style, ready (P48) |
| `POST /referee/v1/rooms/:code/size` | session, host | Shrink a room that will not fill (P7) |
| `POST /referee/v1/rooms/:code/start` | session, host | Begin the draft |
| `POST /referee/v1/rooms/:code/pick` | session | `{ordinal, slotId, playerId}` |
| `POST /referee/v1/rooms/:code/reroll` | session | Deal another squad, against the allowance |
| `POST /referee/v1/rooms/:code/seen` | session | Liveness (P31) |

**A pick carries a player ID, not a player.** The plan speaks of the client posting an XI;
it never has to be trusted, so it does not arrive. An id is looked up in the bundled
dataset, which means a submitted rating cannot decide a price and a submitted `positions`
cannot decide eligibility.

**A session is the player's own token.** The one thing the referee refuses is the anon key,
which in self-hosted Supabase is a valid signature from the same secret and ships in the
browser bundle by design. `src/domain/pvpAuth.ts` is that rule, and it is checked.

## Two things to know before changing it

**Recovery is conditional and the reason is not obvious.** Handing back the time since the
last sweep, every sweep, freezes the elapsed time at its previous value and the pick clock
stops dead. `src/outage.ts` says it at length; `npm run checks` asserts both directions.

**There are no timers.** A deadline is `openedAt` plus the room's clock length, stored, and
evaluated in two places: when a pick arrives, and by the sweeper. That is what makes the
service correct across a restart by construction, and what lets a twenty-second clock be
tested in microseconds.
