# The migrations, and where each thing is actually defined

Migrations are applied **in filename order, by hand**, with `npm run push:sql -- <file>`
(see `docs/nas-setup.md`). They are append-only: history is never rewritten, so a
function that has changed four times exists four times in this directory, and only the
last one is live.

That is the problem this file solves. `finish_run`'s body is written out in full in four
migrations, each a complete restatement to change one thing, so the rule "a banked
collectible must be in the active catalogue" now exists in four textually different
forms - and reading the earliest one tells you nothing about what the server does
(hygiene H103). **Before editing any function, find its current definition here, and
copy that body rather than an older one.**

Better still, and the habit CLAUDE.md records: take the body from the live server's
`pg_get_functiondef`, diff it against the file this index points at, and change only the
line you mean to. A restatement that silently reverts an intervening fix is the failure
mode, and it has happened.

## Where each function currently lives

| Function | Current definition | Superseded copies |
| --- | --- | --- |
| `bump_version(integer)` | **0007** | 0003 |
| `audit(text, jsonb)` | 0003 | - |
| `economy_constant(text)` | 0003 | - |
| `duplicate_pool(uuid)` | 0003 | - |
| `add_copy(uuid, text)` | 0003 | - |
| `save_game(jsonb, integer)` | 0003 | - |
| `save_run(jsonb, integer)` | 0003 | - |
| `save_settings(jsonb)` | 0003 | - |
| `save_career(jsonb, integer)` | **0011** | 0003, 0006 |
| `finish_run(...)` | **0010** | 0003, 0006, 0009 |
| `finish_run_v2(...)` | **0015** | 0010, 0012, 0014 |
| `execute_trade(text, text, integer)` | 0003 | - |
| `import_guest_progress(jsonb)` | **0011** | 0003 |
| `export_account()` | 0003 (execute revoked in 0014) | - |
| `delete_account()` | 0003 | - |
| `create_profile()` | 0004 | - |
| `enforce_invite()` | dropped in **0005** | 0004 |
| `pvp_is_member(bigint)` | 0016 | - |
| `pvp_tie_played(bigint, uuid)` | 0016 | - |
| `pvp_forget_account()` | 0019 | - |
| `set_display_name(text, text)` | 0017 | - |

`set_display_name` is the one client-callable function 0017 adds, and it exists because
0016 added `profiles.display_name` and `profiles.name_key` and nothing on either side could
write them: `profiles` has been select-only for the client since 0002, and the referee
deliberately holds no write grant on it (P34). The NORMALISATION is the client's
(`src/domain/displayName.ts`), and the function checks only what SQL can know on its own -
that the key is present, within length, and unclaimed.

The two `pvp_*` helpers are not part of the client surface and are not called by anything
yet. They exist because a row-level-security policy on `pvp_rooms` that reads `pvp_members`,
whose own policy reads `pvp_rooms`, recurses; a `security definer` helper breaks the cycle.
They are `stable` and read one table each. See `0016_pvp_rooms.sql`, and
`docs/pvp-plan.md` for what the tables are for.

`finish_run` and `finish_run_v2` are two live functions, not an old and a new one. The
client tries `v2` (one round trip, migration 0010) and falls back to `finish_run` once per
session if the server answers "no such function", because the client is deployed by pushing
to `main` while these are applied by hand - so the two are never in lockstep. 0010's own
header says to keep the pair in step, and it means it.

## Where the rest lives

| Thing | Defined in | Changed by |
| --- | --- | --- |
| Tables | 0001 | 0011 (`career.completed_challenges`), 0014 (four `run_results` columns dropped), 0016 (the seven `pvp_*` tables, and two columns on `profiles`), 0017 (the open pick window and the re-roll count on `pvp_members`, `swept_at` on `pvp_rooms`), 0019 (`pvp_bots`, `pvp_matches.bot_sides`, and four `profiles` foreign keys dropped for a trigger), 0020 (`pvp_rooms.pace` and `pvp_rooms.invited_id`, the duel), 0021 (`pvp_rooms.draft_seconds` and `pvp_members.done`, the whole-draft budget room), **0022** (`pvp_rooms.invited_id` dropped again: a duel is addressed by link and by nothing else) |
| Views | 0016 (`pvp_records`) | **0019** (ties with a practice opponent in them excluded) |
| Row-level security, enabled | 0002 | - |
| Policies | 0002 | 0013 (four `for all` policies narrowed to `for select`), 0014 (`run_results_read` dropped) |
| Function grants | 0008 | 0010 (`finish_run_v2`), 0014 (`export_account` revoked) |
| Signup trigger | 0004 | 0005 (the invite gate dropped, signup opened) |
| The collectible catalogue's ROWS | not here | `../seed/collectibles.sql`, generated - see below |

The catalogue is not a migration: `npm run gen:collectibles` writes
`../seed/collectibles.sql` from the TypeScript dataset and `npm run push:collectibles`
sends it. `npm run checks` fails while the generated file and the dataset disagree.

The same seed carries the **economy constants** (`economy_constants`): the three trade
costs, the swap cap and - since 0015 - the bank cap. They are written once in
`src/config.ts` and read back in SQL through `economy_constant(key)`, so neither side can
state a number of its own. A new one is one line in the generator plus one `coalesce` in
whichever function validates it, and the fallback in that `coalesce` is what makes the
order of "apply the migration" and "push the seed" not matter.

## Two traps, both of which have already cost a day

**"Nothing reads it" is not "nothing writes it."** 0014 was written to drop four
`run_results` columns that held nothing, and one of them (`xi`) was still written by
`finish_run_v2`. A plpgsql body is not checked when a column is dropped, so the migration
would have reported success and broken run banking for every account at the next run end.
It replaces the function before dropping the column, in the same transaction. Search for
both directions.

**Rehearse inside a transaction you roll back.** Parse-checking proves the SQL is well
formed and nothing more. Send `begin;` + the body (minus its own `begin`/`commit`) + the
checks that should pass afterwards + `rollback;` as one file: the post-migration state gets
exercised on the real server against real data and nothing is left behind. Put the results
in a temp table and `select` it at the end, since notices do not come back through
`push:sql`. Re-run the same probes after applying for real.

`npm run push:sql -- --dry-run <file>` needs no credentials and no network, and
`pglast` (`pip install pglast`) parses a file with the real Postgres grammar - so a syntax
error never has to reach the server. Validate the rollback block too; it is what someone
reaches for under pressure.

## Writing the next one

A session that adds a file here and cannot apply it (no `dkr/.env`, no LAN reach - a cloud
agent, typically) **opens a roadmap item for it**, saying what it does, how to verify it
worked, and carrying a rollback block in the file's own header, so the apply can be handed
to an agent that does have access.

One extraction is worth doing at the next career change rather than speculatively: the
career upsert is written three ways across 0003, 0006 and 0011, which is why adding
`completed_challenges` in 0011 needed three edits. An `upsert_career(uuid, jsonb)` would
make the next new column one edit.
