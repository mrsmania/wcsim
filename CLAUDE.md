# CLAUDE.md

Project context for AI assistants and developers. Read this first when working in
this repo. (User-facing setup/hosting notes live in `README.md`.)

## READ THIS FIRST: WORK LANDS ON `main`. ALWAYS.

**Every change ends up committed and pushed to `main`. There are no exceptions and you do
not need to ask.** No feature branch, no pull request, no "pushed to a branch for review" -
that is not a smaller version of the job, it is an unfinished one, and it has had to be
corrected over and over.

- If your harness or task setup hands you a branch to work on, that branch is a **staging
  area, not the destination**. Finish by fast-forwarding or rebasing onto `main` and
  pushing `main`.
- Only open a pull request if the user asks for one **in those words**, in the request you
  are working on. A branch name in your instructions is not such a request.
- `npm run build` before you commit; `npm run checks` too if you touched `domain/`. Then
  push to `main`.

The same rule, with the surrounding workflow detail, is under "Conventions and working
agreements" below. It is stated twice on purpose.

## ALSO READ THIS FIRST: HOW TO TALK TO THE HUMAN

**This codebase is ~99% written and maintained by agents. The human behind it is not
interested in the code.** They own the product decisions; they do not review diffs. So:

- **Write every reply, summary and status in plain English, about the GAME.** No file
  names, no symbol names, no class strings, no hashes, no line counts, no framework talk.
  "The album screen's progress bar and the five others like it are now one thing" - not the
  identifiers involved.
- **If nothing needs deciding or answering, keep it to a couple of lines.** "Wave 3 done and
  pushed. Nothing needed from you." is a complete report. Length is not diligence.
- **When something DOES need a decision, that is the whole message**: what the choice is and
  what changes for the player either way, stated so it can be answered without opening a
  file. If two readings of a request would produce different work, ask - briefly.
- **The technical record goes in the repo, not in chat.** Commit messages carry the
  reasoning, `docs/hygiene-audit.html` and `docs/ROADMAP.html` carry the state, and this
  file carries the conventions. Write the detail there, at whatever length it deserves, and
  refer to it. Anything an agent will need later belongs in a file; anything only the human
  reads belongs in one short paragraph.
- **Report honestly and plainly.** If something failed, was skipped, or is blocked, say so
  in a sentence. Plain English is not a licence to round "mostly working" up to "done".

This applies to every session on this project, local or cloud, from now on.

**Where to pick up work:** `docs/ROADMAP.html` is the single list of open work (next up,
later, loose ends, with what shipped collapsed at the bottom as decision history). Open it
in a browser and check it first if you are continuing the project. It replaced the old
`docs/ROADMAP.md` + `docs/todo/TODO.html` pair, which held overlapping copies of the same
items and drifted apart.

**Cleanup work has its own list:** `docs/hygiene-audit.html` (roadmap item 23) is a
wave-by-wave backlog of dead code and behaviour-preserving refactorings, **H1 to H158**, plus
the sixteen decisions they need, an explicit list of what not to touch, and a section of
measured negative results. **Re-audited 2026-08-24** against `c4f1512`, by the same method
(six independent parallel reviews, merged, load-bearing claims verified by hand). The first
pass was written on 2026-08-20 and never executed, and fifty commits moved the tree under it:
reconciled item by item, its 105 items came out 73 standing, 24 shrunk, 7 void and 1 already
done, with a dozen counts materially wrong. **Two of the void items would break the build if
executed as written.** The old numbering is preserved so references here still resolve; new
findings start at H106. Its "item 27 owns these" list is gone - that item shipped and its
losing chrome was deleted, so all five things it named are settled.

**ALL SEVEN WAVES ARE DONE** (2026-08-24/25), and so are all sixteen decisions. Item 23 is
closed and sits in the roadmap's shipped history; the audit stays as the record of what was
done and why. What that means for anyone working in this tree now:

- **The gate is repaired and it now runs in CI.** The audit opened on the finding that
  `npm run checks` failed at random about one run in twelve, and that the `prime-years`
  check was **vacuous** - proved by reintroducing the sticker exploit it exists to catch
  and still getting 132 passed / 0 failed. Both are fixed (H106-H109), `npm run checks`
  runs in `.github/workflows/deploy.yml` before the build (H91), and the suite is **179
  checks**. Five of them assert that a number and the sentence promising it agree
  (H132 the chemistry thresholds, H138 the shop copy, H139 the boot palette, H65 the perk
  shop's advice, H146 the market's budget lookup), and one asserts a shape guard in both
  directions (H70/H73's `isRoundRecord`).
- **The truth sweep landed**, so the wrong figures and the deleted boosts and doors this
  file used to describe as live are corrected (H128-H131, H154). Treat any dataset count
  here as a measurement with a date on it regardless: the dataset moved three times during
  the audit.
- **`0013` and `0014` are APPLIED** (2026-08-25): `0013` narrowed four `for all` policies to
  `for select`, `0014` dropped the dead `run_results` columns, revoked `export_account` and
  dropped `run_results_read`. **The server matches `supabase/migrations/` through 0016**
  (0015 the bank cap, 0016 the PvP room tables, both applied 2026-08-26).
  **0014 had to be corrected before it could be applied**, and the trap is worth carrying:
  the audit found four columns holding nothing and concluded all four were dead, but `xi` was
  still WRITTEN by `finish_run_v2` (the literal `'[]'::jsonb` on every banked run). A plpgsql
  body is not checked when a column is dropped, so the migration would have reported success
  and broken run banking for every account at the next run end - which is the blocking
  unreachable screen (D9). **"Nothing reads it" is not "nothing writes it": check both.**
  0014 now replaces the function before dropping the column, in the same transaction. Still
  do not assume the server matches `supabase/migrations/`: check it, the way roadmap item 35
  (closed, in the shipped history) records.
- **Reach for the shared atoms before writing a class string.** Wave 3 gave names to the
  things that were typed out over and over, and the point is lost if the next component
  re-inlines them: `matchUi.tsx` has `CARD` / `CARD_SM` / `CARD_FLAT` (the flat card),
  `MONO_CAP` and `PAGE_EYEBROW` (the two mono captions), `CHIP_ON` / `CHIP_OFF`, `Meter`,
  `CardDisclosure`, `GROUP_OUTCOME`; `components/stickerTheme.ts` owns the sticker tier
  ramp (`TIER_META`, `TIER_ORDER`, the `GOLD_*` accents, `stickerArtSrc`) so nothing has to
  import `StickerCard` to get a hex; and `--color-grass` / `--color-grass-stripe` are the
  board's two greens.
- **`RoundRecord` is a DISCRIMINATED UNION** (`GroupRecord | KoRecord` on `stage`), and so
  are `RunBuild`, `KoPending` and `LiveMatchInput`. Test the discriminant and the compiler
  gives you the fields; do not add a `??` fallback for one that the variant guarantees.
  The persisted JSON did not change - each stored record always carried one variant's
  fields - but `runStorage` cannot validate history per field, so `isRoundRecord` gates
  every entry on load and DROPS a malformed one. That guard is what makes reading fields
  bare safe: keep it if you add a variant.
- **The game's catalogues are `readonly`** (`SQUADS`, `BOONS`, `CHALLENGES`, `PERKS`,
  `ASCENSIONS`, `WORLD_CUP_YEARS`, ...) and `pool` / `poolYears` parameters take
  `readonly` arrays throughout. If a new signature wants a mutable array, it almost
  certainly wants a copy instead.
- **Logic now lives where it belongs, so look there before writing a derivation.** Wave 4
  moved it: `domain/market.ts` (the transfer market's sorts, facets and filter pipeline),
  `domain/archive.ts` (the squad browser's five dataset queries), `domain/formations.ts`
  (`assignNearest`, the board's slot-to-slot matching), `domain/draft.ts` (`moveOptions`,
  `homeViewOf`), `domain/album.ts` (`cupRewardPool`, `swapEligibleIds`, `swapTargetSlots`),
  `domain/career.ts` (`budgetOf`, `startRunCareer`, `perkPurchaseState`, `boonUnlockState`),
  `domain/match.ts` (`lineAverages`, which is NOT `xiStrength` - its docstring says why),
  `domain/run.ts` (`runShapeOf`, `runBuildOf`, `Reveal`, and `runMatches` - the ONE reading
  of a run's own history, which the career's archive, Siege Mentality and the challenge
  catalogue all sum), `domain/tournament.ts`
  (`playWholeGroup`, `splitGroup`), `domain/clock.ts` (`maxMinute`), plus `hooks/useToast`
  and `hooks/useRoundReview`.
- **A token migration has a cheap and near-total proof, and it is worth using.** Tailwind
  emits utilities from the SET of classes it finds, not their order inside a `className`,
  so replacing an identical substring with a constant leaves `dist/assets/*.css`
  **byte-identical**. Build, hash, change, build, hash. Every wave-3 commit records the
  hash it held; the two that could not claim it say exactly which rule moved and why.
- **App and the run screen are composition roots again, and the things that left them are
  where to look first.** Wave 6 moved out everything that was never composition:
  `hooks/useSquadRoll` (the scramble animation, the draw-next-squad policy and its four
  refs - the subtlest code in the build), `hooks/useBudgetBuild` + `hooks/useMovePlayer`
  (the market's held card and the move-a-player gesture, which cross-cancel), `hooks/useCareer`,
  `hooks/useCupRun`, `hooks/useStackedScroll` (the mobile there-and-back), `hooks/usePool`,
  `state/routes.ts` (`screenOf(path)`), `state/resume.ts`, `state/storage/kv.ts`,
  `state/store/cache.ts`, `components/Masthead`, `components/BuildPage`, and
  `components/cupRun/{PreRunPanel,GroupRevealPanel,RunPhasePanel}`. **App.tsx is 849 lines
  and CupRunScreen 626**, from 1,129 and 907.
- **The career is owned in ONE place; the RUN deliberately is not.** `useCareer` lives in
  App, so the build page prices the transfer market off the same value the run screen
  spends from. `useCupRun` stays inside the run screen, and the reason is in its header:
  `remoteStore.finishRun` clears the server's active run and then re-saves whatever the
  cache holds, which has to be the run already carrying `stickersApplied` - set in the same
  effect that reports the run's end, relying on **a child's effect running before its
  parent's**. Lifting that state inverts the ordering and the failure is a run banked twice
  on a reload. The one `store.peek()` left in App reads the run for the front page's
  Continue line, and that is the price.
- **Everything that talks to `localStorage` goes through `state/storage/kv.ts`**
  (`readJson` / `writeJson` / `removeKeys` / `hasAnyKey`), and **every storage key is
  exported by the module that owns it**, with `GUEST_KEYS` built from those exports rather
  than re-typed. A version bump used to break the guest-to-account import for that slice
  with no type error. Each module keeps its own revive function - that is where the logic
  is - and the revive runs inside the same `try` as the read and the parse.
- **A career arriving from outside is built by `hydrateCareer`** (domain/career.ts), the one
  place that knows the field list. The guest loader adds only its v1-to-v2 perk migration and
  the account loader only its snake_case conversion. `level` is derived from XP, never read;
  `stats` merges over the initial counters (which is what lets a new counter appear with no
  migration); and `completedChallenges` tolerates being absent, because a server without
  migration 0011 has no such column.
- **Browser checks on this app: use `page.evaluate`, not Playwright locators.** Locator
  auto-waiting never settles here and hangs the run; plain DOM clicks and reads work. Two
  more traps that cost time twice: the tab bar's PLAY / CAREER / ALBUM / RECORDS / SQUADS
  buttons match almost any CTA regex, so a clicker must skip them explicitly; and the static
  test server has no SPA fallback, so reloading a deep path serves its own 404 page - go to
  the base path and push the route instead. Every wave-6 item was verified by driving the
  real app against the pre-change build served side by side; the scratch harnesses are
  disposable, but that method is the one worth repeating.
- **The checks harness is a small index over `scripts/checks/`** (one module per concern
  plus `harness.ts`), not one file. Three conventions came with the split and each one used
  to be an accident of file position: `check(name, ok, detail?)` takes **thunks** and
  reports a throw against the check that caused it (before this, one exception aborted the
  run and every later block silently never executed); seeding is `withSeed(seed, fn)`, a
  lexical wrapper that restores the real generator in a `finally`, rather than a block that
  had to stay contiguous; and the shared runs and dataset fixtures are named
  (`FIXTURE.home` / `.away` / `.third`, pinned by **id**, as getters so a fixture that
  leaves the dataset fails inside its concern instead of at import). `checks/meta.ts`
  asserts the index names every module, because a module that is not wired in contributes
  zero assertions and says nothing about it. Add a concern as a module, not a block. A
  concern may be `async` and the index awaits it; `referee` is the one that is.
- **A new check needs a vacuity guard, and it is not optional.** The audit's first finding
  was a check that had been guarding a known exploit and was guarding nothing, and two more
  that could pass on zero observations. So: assert the sample is non-empty, and if the check
  greps for something, fail when it finds nothing rather than passing. Every check added
  during the audit carries one, and each was **mutation-tested** - break the thing it
  guards, confirm it goes red, put it back.
- **A check for a shared helper cannot be a comparison between the things now sharing it.**
  When `runMatches` folded three readings of a run's history into one, comparing the three
  afterwards became tautological. The harness keeps its own independent walk instead. Same
  shape for any future DRY change: the proof has to sit outside the thing being shared.
- **`tsconfig` is a solution file with two projects** (`tsconfig.app.json` for `src`,
  `tsconfig.node.json` for the config and the scripts), and `npm run build` / `typecheck`
  run `tsc -b`. The trap that made the first attempt a no-op: **an absent `"types"` field is
  not empty, it auto-includes every `@types/*` in the tree**, so browser code still had
  Node's globals. Naming the list then surfaced a real error it had been hiding -
  `domain/challenges.ts` uses ES2022 `Array.prototype.at` against a declared ES2020 `lib`,
  which only compiled because `@types/node` was supplying it.
- **The base path is `VITE_BASE`**, read in `vite.config.ts`, defaulting to `/wcsim/` for a
  build and `/` in dev. `npm run build -- --base=/` does NOT work and never did: the flag
  lands on the last command in the `&&` chain, which ignores it and exits 0, so it produced
  a wrong artifact cheerfully. The Docker image passes `ARG VITE_BASE=/` because nginx serves
  from the root.
- **`supabase/migrations/README.md` is the index of which migration holds each function's
  live definition**, and `npm run checks` asserts it cannot drift. Migrations are
  append-only and applied by hand, so a function that changed four times exists four times
  on disk and only the last one is live; every superseded body carries a forward pointer.
  Note a **dropped** function's live answer is the drop, not its last definition.
- **The house rules are checked now, not just written down.** "No em-dashes" had been in
  this file since the start and there were 19 of them in two design docs; one assertion
  sweeps 194 source, script, SQL, markdown and root files. (The HTML docs are out of scope:
  they use the `&mdash;` entity as a heading separator.)

## What this is

**Mondialino** - a single-page game. You draft an XI of real World Cup
players (one position at a time, each drawn from a randomly rolled national-team
squad), then play a simulated group stage and knockout run, trying to win the cup.
Pure client-side: no backend, no database. All player data is hardcoded in
`src/data/squads.ts`.

**It was called World Cup Simulator until 2026-08-26.** The rename is user-facing ONLY -
the page title, the boot cover, the masthead wordmark, the sign-in email and the player
index. Everything named `wcsim` internally is deliberately untouched and should stay that
way unless there is a reason beyond tidiness: the repository and the GitHub Pages base
path (`/wcsim/`, and changing it means rebuilding every deployed asset URL, see
"Hosting"), the npm package name, the Docker image, and above all the **localStorage keys**
(`wcsim_album_v1` and its four siblings) - renaming those orphans every save on the
machine that holds them, including the author's own. The wordmark is one word in two tones
(`Mondial` + a green `ino`); the tagline is unchanged.

**It was Mundialito for a few hours of the same day, and the swap to Mondialino is a
measured decision worth not re-opening.** `Mundialito` is the better-known word and that is
exactly the problem: `mundialito.ch` is a live Swiss children's football tournament (Zurich,
since 2009), and the word is also the 1980 Uruguay tournament, a women's tournament, a
beach-soccer series and two existing apps, so the name could never have been ours and the
`.ch` was not for sale. `Mondialino` is the Italian for the same thing (`mondiale` plus the
`-ino` diminutive), and it checked out clean: no app or game, no trademark filing found, no
GitHub repository, the npm name free, and every domain unused. Italian being a Swiss
national language is a bonus rather than the reason. Two things known and accepted: the
word's existing Italian meaning is a 49cc **F.B. Mondial moped** from the 1950s (a vintage
niche, no overlap with a football game), and players will mistype it as `Mundialito`, which
is why the wordmark splits on `MONDIAL` + `ino` rather than leaving the word plain. Neither
is a reason to revisit the name; the crowded ground is.

## Tech stack

- **Vite** + **React** + **TypeScript** (strict).
- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin.
- State is a single `useReducer` phase machine; all game logic is pure functions in
  `src/domain/`. No state-management library. Routing is `react-router-dom`
  (`BrowserRouter`, clean paths) - see "Routing & persistence" below.
- Flags from `country-flag-icons`; icons from `lucide-react`; the win-celebration
  confetti is a small self-contained canvas renderer (`Confetti.tsx`, no dependency);
  routing from `react-router-dom`.
- Fonts: **Archivo** (display), **Schibsted Grotesk** (body), **Spline Sans Mono**
  (data/numerals), loaded via a Google Fonts `<link>` in `index.html`.

## Visual design (turf-flat)

The UI was redesigned in 2026 to the **"turf-flat"** look: a flat matchday-programme
take on the football-green identity, with a top-down tactics-board pitch. The app
matches the static mockups in `docs/redesign-2026/turf-flat/`.

- **Tokens** live in `src/index.css` `@theme` (single source of truth; Tailwind v4
  generates the utilities). Palette: `--color-ground` (paper), `--color-panel`,
  `--color-chalk`, `--color-ink`, `--color-muted`, `--color-line`, `--color-pitch`,
  `--color-pitch-dark`, `--color-amber`, `--color-loss`, plus the greys and the three
  the ledger and the cabinet added: `--color-dim` (unearned text, held at AA on every
  surface), `--color-hair` (the row rule), `--color-faint` (the unearned SURFACE),
  `--color-amber-ink` (amber as text, since the surface amber fails AA on paper) and
  `--color-cup-deep` (the trophy shelf's top rank step - it cannot reuse `ink`, which
  is near-white in dark and would invert the ramp). Shadows: `--shadow-hard`
  (the signature tifo hard offset card shadow, used via `shadow-hard`), a 4px
  `--shadow-hard-sm` for cards stacked many-to-a-page, + a soft one.
- **Cards** are flat: `rounded-md` (6px) + 1px `border-line` + `shadow-hard`.
- **Pitch** (`Pitch.tsx`) is **2D only** (the old 3D/perspective pitch and its
  `pitch3d` flag were removed). It draws an SVG board in a fixed 480x640 box, markings
  inset 3.5% for a grass margin, grass stripes over a solid base, white markings
  (centre circle, penalty boxes/arcs/spots, corner arcs), and HTML player badges
  placed over the "meet"-fitted board. Open slots show a "+" only when the selected
  player can fill them (amber = natural/best position, white = a secondary one).
  A **placed** badge can be tapped to move that player to another of his roles
  (`FEATURES.movePlayers`): his eligible slots light up - empty ones as a "+",
  team-mates as an amber badge - and tapping him again puts him back. A player
  with nowhere to go is not clickable at all, so the gesture is never a dead end.
  **The two selections override each other, in both directions:** taking a card out of
  the drawn squad or the market drops a move in progress, and picking a placed player up
  drops the held card (`SELECT_PLAYER` accepts `null` for exactly that). The one
  exception is precedence rather than asymmetry: a filled slot the held **collectible**
  can swap into keeps the swap, since that is the specific thing the card is for, while
  every other badge picks its own player up. Mind that the effect cancelling a move is
  keyed on the formation and phase only, never on the selection - watching the selection
  would have a move cancel itself the moment it cleared the card. While a player is held
  for a move the budget market's "next position to shop" highlight also drops back to a
  quiet dashed circle, since that slot is inert unless it is a destination and a pulsing
  white "+" that ignores the click was the loudest thing on the pitch. **A move is not always two players.** `planMove`
  (domain/draft) runs a bipartite augmenting-path search (Kuhn), so besides an empty
  slot and a straight trade it also finds **rotations of three or more** - which is the
  only legal rearrangement more often than you would guess (9.3% of all legal moves,
  measured over every formation). Real case: Knoflicek [LW,ST] at LW, Burruchaga
  [AM,RW,ST] at ST, Donadoni [LW,RW,AM] at RW - no pair can trade, yet rotating all
  three round is fine. The badge glyph and label say which: an arrows icon and "trade
  places with X" for two, a rotate icon and "take X's spot, rotating N players" beyond
  that. `planMove` returns the whole resulting `Filled`, and `MOVE_PLAYER` just stores
  it, so the reducer never has to know the shape of the chain.
- **Layout** (`App.tsx`): a 3-column grid (settings/squad/complete | pitch |
  ratings+chemistry+line-up) using the comps' breakpoints (1 col < 760px, 2 col
  760-1080, 3 col >= 1080). A masthead (gold-trophy logo, the amber `lucide` `Trophy` on
  a pitch-dark tile matching the champion node, doubling as the favicon in `index.html` +
  MONDIALINO wordmark + tagline
  + phase status stamp) and a phase-aware section header sit above it.

The comps (`home`, `selected-xi`, `tournament`, `index` launcher) carry a live
5-scheme colour switcher that is deliberately **comp-only**; the app ships the single
default green scheme. Earlier explorations live alongside: `option-{1,2,3}-*.html`
and the brutalist `tifo/` set (the hard-shadow idea came from there).

## Commands

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173, bumps to 5174 if busy)
npm run build      # tsc -b && vite build -> dist/   (run this to verify changes)
npm run typecheck  # tsc -b   (both projects: src, and the config + scripts)
npm run preview    # serve the production build
npm run checks     # run the characterization checks (scripts/checks.ts + scripts/checks/)
VITE_BASE=/ npm run build      # build for a host serving from the root, e.g. the Docker image
npm run gen:collectibles   # regenerate supabase/seed/collectibles.sql from the dataset
npm run push:collectibles  # send that seed to the account server (needs dkr/.env, LAN/VPN;
                           #   prefix NODE_OPTIONS=--use-system-ca if it says "fetch failed"
                           #   while curl reaches the host - see docs/nas-setup.md)
npm run push:sql -- <file.sql>   # apply a migration / run a query on that server (same
                           #   credentials and route; -- --dry-run shows without sending)
npm run gen:players        # regenerate docs/players.html (it carries both datasets)
npm run album:fill         # print a console snippet that fills the album (guest only;
                           #   -- --leave=N / --dupes=N / --clear)
python scripts/build-sticker-art.py   # art/stickers-src/*.png -> public/stickers/*.webp
```

**After changing ratings in `squads.ts` or `STICKER_TIERS`, run `npm run
gen:collectibles` and `npm run push:collectibles`.** The accounts feature needs a
server-side copy of who is collectible (SQL cannot read the TypeScript dataset), so
`supabase/seed/collectibles.sql` is generated from it and `npm run checks` fails while
the two disagree. See "Accounts" below.

There is **no unit-test runner**. Verify changes with `npm run build` (type-check +
bundle). For the deterministic domain core there is a committed characterization
harness, run via `npm run checks`: a small index at `scripts/checks.ts` over one module
per concern in `scripts/checks/`, currently **293 checks**. It exercises the sim, penalty
shootout, knockout bracket, standings, and chemistry thousands of times and asserts
invariants (a shootout always has a winner, a bracket always crowns one champion,
standings totals reconcile, chemistry sums to its capped bonus, etc.), exiting non-zero on
any violation. It also asserts things outside `domain/`: the generated collectible seed
against the dataset, the boot cover's palette literals against their tokens, the migrations
index, and the house no-em-dashes rule. **A concern may be async** (`referee` is: it drives
the referee's real handlers, which take a store returning promises), so the index awaits
each one and then asserts on the outcome. Run it after touching anything in `domain/`,
`scripts/` or `referee/`, and read the conventions note at the top of this file before
adding a check -
in particular that every new one needs a vacuity guard and is worth mutation-testing. For
one-off logic probes you can still bundle a throwaway script with the bundled esbuild
and run it in node, e.g.
`npx esbuild --bundle --format=esm --platform=node tmp_x.ts | node --input-type=module`
(name scratch files `tmp_*`; they are gitignored).

## Architecture (layers)

```
src/
  data/        types.ts (domain types + helpers), format.ts (name/position display
               formatters), squads.ts (the dataset + SQUAD_BY_ID)
  domain/      pure, framework-free logic (no React imports):
               formations.ts (formation -> pitch slot coordinates)
               draft.ts      (placement rules, rolling/re-rolling squads)
               match.ts      (xiStrength, Poisson match sim, penalty shootout)
               tournament.ts (group build, fixtures, standings, simulateMatchday,
                              qualifiers, bracket seeding, groupAsOf)
               knockout.ts   (opponent draw + shared KO round labels: drawOpponent,
                              KO_ROUNDS, KoDecided)
               bracket.ts    (the 16-team knockout bracket model; see below)
               clock.ts      (live-reveal playback step sequence)
               chemistry.ts  (cohesion scoring -> strength bonus; gated by a flag)
               album.ts      (sticker collectibility/tiers, trade, run-end apply;
                              pure; gated by a flag - see below)
               odds.ts       (simulateTitleOdds: Monte-Carlo an XI's cup-win % over
                              many simulated tournaments; drives the Cup Run readout)
               pricing.ts    (budget-draft price by rating; convex; BUDGET from config)
               budget.ts     (the market's randomized "Auto-fill & spend")
               boons.ts      (Cup Run boons: rating PLANS + roster transforms)
               effects.ts    (the effect ledger: xiOf(roster, effects, round))
               run.ts        (Cup Run state machine; chemistryOf; gated - see below)
               career.ts     (Cup Run career: XP/level/Prestige/perks; gated)
               ascension.ts  (the Cup Run difficulty ladder: handicap, draw slope,
                              reward multiplier, level gate - see below)
               difficulty.ts (the casual/normal/hard setting: +3/0/-3 to the user's
                              own attack + defense, nothing else)
               challenges.ts (the 130-entry catalogue + completedIn; gated - see below)
               badges.ts     (the trophy cabinet's lifetime badges: pure predicates over
                              the career + album, derived not stored, unpaid - see below)
               cabinet.ts    (cabinetView: the whole trophy-cabinet readout, derived
                              from CareerState + AlbumState; gated)
               random.ts     (shuffled + pick, the shared Math.random helpers)
               pvp.ts        (the PvP room rules: validateXi, autoPick, pvpTeam)
               pvpRoom.ts    (the PvP room as a state machine, driven by the referee: no
                              timers, deadlines are stored data + one sweeper)
               pvpAuth.ts    (who the referee takes an instruction from)
                              -- all three are waves 0 and 1 of roadmap item 18 and
                              NOTHING IMPORTS THEM YET, see below
               validateSquads.ts (dev-time dataset integrity checks)
  state/       gameReducer.ts (the phase machine + Action union; AUTOFILL loads a
               fully built XI; a `build` "roll|budget" field with START_BUDGET/BUY_PLAYER
               for the in-page budget build); store/ (the persistence seam - see below);
               and behind it the per-key modules store/ delegates to: persist.ts (the
               whole game <-> localStorage, so routes survive a refresh), albumStorage.ts
               (the sticker album <-> its own localStorage keys), careerStorage.ts
               (the Cup Run career <-> wcsim_career_v1), runStorage.ts, settingsStorage.ts
  hooks/       useFollowBottom.ts (auto-scroll), useMatchClock.ts (the shared
               match-reveal clock, used by every live match), useSettings.ts
               (theme / difficulty / year pool, through the store), useStickerAlbum.ts
               (the album + the run-end banking rule, see below), motion.ts
               (prefersReducedMotion)
  nav/         liveMatch.ts ("a match is revealing", published by useMatchClock),
               pendingRun.ts (a kickoff is REQUESTED, never inferred - see below)
  components/  presentational React (App composes them); the tournament is drawn by
               GroupDrawReveal / StandingsTable / MatchdayCard / Bracket, with
               matchUi.tsx + matchView.ts holding the shared presentational atoms and
               the per-match view-model;
               SquadBrowser + TeamRoster are the read-only squad archive (see below);
               CupRunScreen (Cup Run + career) is a lazy-loaded (React.lazy) route
               screen, as are ChallengesScreen and CabinetScreen (the trophy cabinet);
               BudgetMarket is the budget build's left-column panel (shares
               the home page's Pitch + ratings/line-up, not a separate screen);
               navUi.tsx holds the tabs navigation's atoms (TabRow, TabBottomBar, SubTabs)
  config.ts    FEATURES flags (chemistry, teamRatings, removePlayers, movePlayers,
               randomTeam, squadBrowser, stickerAlbum, stickersOnCupWinOnly,
               stickerImages, budgetDraft, challenges,
               trophyCabinet;
               plus `accounts`, which is DERIVED from the build env, see below) +
               STICKER_TIERS / STICKER_TRADE_COST / STICKER_DISCOUNT +
               BUDGET_BY_TIER (BUDGET_DRAFT is checks-only now) + BANK_CAP (how many
               stickers one run may bank; the server states it too, see below)
  App.tsx      owns the reducer, the roll animation, and responsive-scroll effects;
               branches its screen by the URL (react-router)
  main.tsx     entry (wraps App in React.StrictMode + BrowserRouter)
```

**There is ONE way to play, and one tournament.** `/` is the front page (`ModeSelect`),
`/play` the build page, `/cup-run` the run. Build an XI (roll a squad or buy within a
budget - both are always available), then the single `CompletePanel` "Start Run" CTA
requests a kickoff and goes to `/cup-run`. The front page surfaces one **Continue**: a
live Cup Run, else a **half-finished build** ("Finish your XI - 4-3-3 - 7 of 11 picked",
or "Your XI is ready" for a complete XI that never kicked off). `handleReset` always
returns to `/play`.

This used to be two of everything - a Quick Run playing a plain World Cup on
`TournamentScreen`/`KnockoutScreen`, and a Career Mode Cup Run - chosen on a launcher with
two door cards, with a `FEATURES.careerMode` flag switching the whole career layer off.
**All of it was deleted on 2026-08-21** (roadmap item 28), because once a Cup Run became a
real tournament (the group draw, a live table, a 16-team bracket) a career run at Base
Ascension with no boost taken *was* the World Cup, only with progression attached. What
went: the two screens plus `TournamentSummary`, the reducer's `group`/`knockout` phases and
their state and actions, the `/group` + `/knockout` routes (they now hit the catch-all and
redirect to `/`), the `careerMode` flag, `RunLadder`, the `buildMode` / `mode` /
`startMode` plumbing that told the two modes apart, the `auto` playback state and its
settings control, and the sticker hook's separate World-Cup banking path. The
**engine was never duplicated** and is untouched: `domain/tournament`, `bracket`,
`knockout` and `match`, and the shared `GroupDrawReveal` / `StandingsTable` /
`MatchdayCard` / `Bracket` components, were always one copy used by both.

**Data flow / phases.** `gameReducer` drives `phase: setup -> draft -> complete`, i.e. the
build only; the tournament itself lives in `RunState` (`domain/run.ts`, its own storage
key), not in the reducer. Components dispatch actions; `App` runs side effects (the roll
scramble animation, scroll follow) and the phase transitions. The `domain/` modules are
deterministic except where they intentionally call `Math.random` (match sim, opponent
draw, roll). Strong pattern: **each match's result is computed up front, then the
clock only reveals it** (`clock.ts` + `useMatchClock`) - simulation is separate
from playback.

**Routing & persistence.** The URL is the source of truth for *which screen*; the
reducer stays the source of truth for *the build*. `App` branches on
`location.pathname`: `/` (the front page), `/play` (the build page =
setup/draft/complete, sub-view derived from `formation` + `isComplete`, not `phase`),
`/cup-run`, `/career`, `/album`, `/records` + `/records/cabinet`, and
`/squads/*`. Anything else hits a catch-all `<Navigate to="/">`, which is what the
deleted `/group`, `/knockout` and the four legacy aliases now do. Navigation happens via `useNavigate` in the tab
bar and the transition handlers (`handleReset`), which never rebuild existing state, so
Back/Forward move between screens without losing progress. The whole `GameState` is
mirrored to storage and restored on load, so a refresh mid-build resumes it (transient
draft fields are reset on restore); the run in flight has its own key.
`SquadBrowser` derives its view from route params via `useMatch`
(`/squads/by-world-cup/:year`, `/squads/by-team/:code`, `/squads/team/:squadId`); team
codes in URLs are lowercase and matched case-insensitively.

**The persistence seam (`state/store/`).** Everything persisted goes through **one
`store`** (`state/store/index.ts`), never the per-key modules directly - those are the
local implementation's internals now. `main.tsx` calls `store.load()` **once before the
first render** and passes the resulting `AccountSnapshot` to `App`, so every hook and the
reducer still seed synchronously (no loading state, no flash: localStorage resolves in a
microtask, before paint). Afterwards the store holds the latest values in memory, so the
two places that re-read on navigation (`App`'s `buildCareer`, `resumeCupRun`) and
`CupRunScreen`'s mount reads use the synchronous `store.peek()`. Writes go through
`saveGame` / `saveAlbum` / `saveCareer` / `saveSettings` / `saveRun` / `saveReveal`
(`saveRun(null)` drops the run *and* its reveal, as `clearRun` always did) and are
`void`-ed at call sites, since nothing awaits a local write.
Every method is a **Promise** even though the local implementation resolves immediately:
that is deliberate, so an account-backed implementation slots in behind the same
interface without touching call sites again (`docs/cloud-sync-design.md`, build order
step 1 of 7). Known, accepted difference: a second browser tab no longer sees the first
tab's writes on navigation, because reads come from the in-memory cache. Multi-tab was
never coherent (each tab holds its own React state); it is now uniformly incoherent
rather than partially.

## Core concepts

- **Position vocabulary** (`Position`): `GK LB CB RB DM LM CM RM AM LW RW ST`.
  `categoryOf()` buckets these into `GK | DEF | MID | FWD`.
- **Player** (`data/types.ts`): `id`, `personId`, `squadId`, `number`, `name`,
  `positions` (ordered - **`positions[0]` is the player's natural/primary role**),
  `elo` (strength rating, ~60-99; shown in the UI as "rating", never "elo").
- **Squad**: `id` = `` `${code}-${year}` `` (e.g. `bra-2002`), `code`, `nation`,
  `year`, `players`. There is **no squad-level rating**: a team's strength is derived
  from its players (`squadOverall` = avg elo of the best XI), so every rating shown
  (the `/squads` table, roster header, in-game chips) tracks the player elos.
- **`personId` = slug of the name**, shared across tournaments, so the same human
  (e.g. Messi in 2006 and 2022) is **one identity and can be drafted only once**.
  Therefore name spellings MUST be identical across squads for the same person, and
  distinct people MUST have distinct names (the dataset disambiguates collisions
  like Amadou Onana vs Andre Onana, Marcus Thuram vs Lilian Thuram).
- **Formations**: `RAW_FORMATIONS` in `formations.ts`; the layout engine derives
  pitch coordinates from role counts. Style (`def | bal | off`) changes shape (def
  adds a DM, off adds an AM) and vertical placement. Vertical `BANDS` run forwards to
  keeper on even spacing; each row spreads horizontally - rows with flanking wide
  roles (e.g. a back 5) distribute evenly between the touchline anchors, purely
  central lines cluster around the middle.
- **Draft**: roll a squad -> pick an eligible player -> place into a position-matching
  open slot. `canPlace` allows any slot whose role is in `positions`; re-rolls are
  "another team" (same year), "another cup" (same nation), or "any".
- **Who scores a goal** (`match.ts` `POSITION_WEIGHT` / `scorerWeight` / `scorerPool`):
  the sim decides HOW MANY goals from the two sides' strengths, then credits each one to
  a weighted random player, so nothing here can change a scoreline - only the name beside
  it. Weight is **per position, tilted by rating**: read against a full-back at 1.0, a
  striker is 4.4x, a winger 3.6x, an AM 3x, a CM 2x, a DM 1.2x, a centre-back 0.8x, and a
  keeper never scores from open play. The tilt is `1 + (elo - 75) * 0.02`, so a 99 is
  1.48x a 75 and 2.1x a 60.
  - It replaced a flat four-band weighting by CATEGORY (FWD 4 / MID 2 / DEF 1 / GK 0),
    which measured out at exactly 4x / 2x / 1x per player but had two consequences that
    only became visible when the cabinet started showing a top-scorer board: **an AM
    scored at a DM's rate** (both MID), and **rating was ignored entirely** - a 99 striker
    and an 80 striker in the same XI were equally likely, while penalty takers were
    already sorted by rating.
  - **The weight keys off `positions[0]`, which is the SLOT** (`placedPlayers` promotes
    it), so it is where a player is played, not what the dataset calls him.
  - **Bounded, not neutralised:** no rating gap the dataset allows can turn a defender
    into an attacker (asserted), but adjacent lines are deliberately crossable - a 99
    full-back edges a 60 central midfielder.
  - **`Side.scorers` tolerates the old `string[]` shape**, because a `GroupTeam` is
    persisted (the game state, the active run, a run's drawn `nextOpponent`): the old pool
    repeated a name once per point of weight, so reading each entry as weight 1
    reproduces the old distribution exactly for a match that was already in flight.
  - Measured side effect, for the two challenges that read scorer identity: a hat-trick in
    a match went 1.76% -> 2.11%, distinct scorers per match 1.659 -> 1.639, and goals per
    match did not move (1.868 -> 1.865), which is the "scorelines are untouched" claim.
- **Chemistry** (`chemistry.ts`, see below).

## Settings (theme, difficulty, year pool, speed)

`SettingsModal.tsx` is the sheet behind the masthead's settings button. It shows four
controls, and they do **not** all live in the same place, which is the thing to know before
looking for one. (There was a fifth - an Auto-play / Manual toggle for tournament rounds -
read only by the two deleted World Cup screens; it went with them on 2026-08-21, along with
the reducer's `auto` field and `SET_AUTO`.)

- **Persisted preferences** (`hooks/useSettings.ts` over `state/settingsStorage.ts`, key
  `wcsim_settings_v1`, through the store seam, seeded from the boot snapshot): `theme`
  (`light | dark`, applied to the document by the hook), `difficulty`
  (`casual | normal | hard` -> `domain/difficulty.ts`, which adds +3 / 0 / -3 to the
  **user's own** attack and defense in their matches and touches nothing else), and
  `poolYears`. **`difficulty` really does touch nothing else**: it persists the preference
  and stops. It used to wipe the sticker album, on the rule that the album was "scoped to
  the difficulty it was earned under", and that rule was **dropped 2026-08-20** - nothing
  wipes the career or the challenges, which are earned under a difficulty just as much
  (challenge Prestige especially, since a casual run completes the same entries for the
  same award). So the album now spans difficulties, a casual run can fill it, and the
  settings sheet has no danger dialog. Do not reinstate it for one of the three without
  the other two.
- **One preference has no control in the sheet:** `showFullDraw`, whether a Cup Run's
  bracket shows the full 16-team draw or just your own path. Its control is the accordion's
  own chevron (see "Runs as tournaments" below); it lives here so it survives navigation.
- **Match `speed`** is reducer state (`SET_SPEED`, default `fast`), not a preference,
  because it belongs to playback of the run in progress. The modal just receives it.

**`poolYears` is the one with reach.** It is which World Cups the game draws from, and
`squadsInPool(years)` (data/squads.ts) narrows the pool that `App` derives once and hands
to the squad rolls, the transfer market, the opponents, and the sticker album's completion
target. Defaults to every year; it is **never empty** (an empty selection falls back to
all), and loading tolerates years that are not in the dataset. Keeping settings on their
own key is deliberate: resetting the game, album, career or run never touches them.

**"Every tournament" is stored as `null`, NEVER as a list of every current year**, and this
was a real bug that hid a whole tournament. `useSettings` persists on mount, so every player
has a saved `poolYears` whether or not they ever opened the sheet; the old shape wrote "all"
as a literal list of the years that existed at that moment, so **adding 1986 turned every
existing save into "all except 1986"** - and it was silent on every surface at once, because
a nine-year list is a perfectly valid narrowing and `loadSettings` had nothing to check it
against. It was reported as "the album is not up to date" (Maradona's placeholder missing
from `/album`), but the rolls, the market and the opponents had lost 1986 too.
So `settingsStorage` now owns the stored shape for **both** stores: `toStored` writes
`poolYears: null` when the selection covers every year, `normalizeSettings` reads it back,
and a `v` field marks the shape - a save without one (v1) **gets its whole pool back**,
since it cannot say whether its list meant "these" or "all", and reopening a pool costs a
tick-box while the other direction hides a tournament and never mentions it. Three call
sites had to go through it, and the account path had **no** normalisation at all before
(`remoteStore` cast the jsonb straight across): `loadSettings`/`saveSettings`,
`remoteStore.load`/`saveSettings`, and `moveGuestProgressIn`, which posts the blob
`import_guest_progress` inserts verbatim. `npm run checks` asserts the round trip, including
that a deliberate narrowing still survives it.

## Navigation: five tabs

Roadmap item 27, **shipped 2026-08-21 and now the only navigation.** It went in behind a
runtime switch (`?nav=tabs`), was compared against the old chrome for a day, and the
switch, the old chrome and `src/nav/navMode.ts` were deleted once it won. There is no
`TABS` branch and no preview toggle any more: if you find one, it is a leftover.

- **What replaced what:** the footer text nav (four of eleven destinations, 11px, below the
  fold) is gone, and so are the two launcher door cards and the two navigation cards that
  sat inside the build page's left column. In their place: five tabs - **Play, Career,
  Album, Records, Squads** - as a row that carries the masthead's ink rule from 700px up
  and a fixed bottom bar below it. Settings and account stay masthead buttons: they are
  sheets you adjust without leaving, not places you go. A route crumb shipped alongside
  the tabs as a second "where am I" signal (the active tab being the first) and was
  **removed 2026-08-23**, `RouteCrumb` with it: it restated the tab and spent a line on a
  right-aligned count ("0 of 11 picked", "272 squads") that the panel below it already
  shows.
- **A tab is its label and nothing else** (2026-08-25). The desktop row carried a mono
  sub-line per tab - where the run is, "Lv 26 · 303", album completion, challenges earned,
  cups in the pool - so the chrome restated four live counters at once, each of them
  printed again on the screen the tab leads to. `TabItem.sub` and its rendering are gone,
  and with them `albumSummary` in `App` and `resumeCupRun.round`; the phone bar never had
  the sub-line. This is the same reading that removed the crumb's right-aligned count
  above: navigation is for getting there, and the destination does the reporting.
- **Routes:** `/play` (the one build route), `/career` (the hub, split off the live run -
  a shop and a step of play cannot be the same address), `/records` +
  `/records/cabinet` (the two honours screens as segments of one destination, which is
  what keeps the bar at five). `/group` and `/knockout` are **gone** (see "There is one way
  to play" above); they hit the catch-all and redirect to `/`.
- **The four legacy aliases went on 2026-08-24** (hygiene D14): `/quick-run` and
  `/career-mode` for the build, `/challenges` and `/cabinet` for the two honours screens.
  They existed to protect bookmarks made before the navigation rework, and the app has
  never been live, so there were none to protect. They now hit the catch-all like `/group`.
  The two honours aliases were also carrying a latent bug: `App`'s route branch tested
  `tabsRecords` FIRST and its definition already matched both aliases, so their own render
  arms were unreachable - which meant the standalone header and Back crumb this file used
  to say they carried had in fact never rendered. `ChallengesScreen` and `CabinetScreen`
  therefore have no `heading` or `onClose` prop any more: `/records` puts one
  `StageHeader` above its `SubTabs` and that is the only way in.
- **The mode doors go, the front page stays.** `/` is still `ModeSelect` - the hero
  tactics board, the three beats and the "Chase the legends" showcase are what sell the
  game - but the two door cards went, and the three resume buttons collapsed into one
  **Continue**: a live Cup Run, else a half-built XI. "Build a new XI" beside it confirms
  first, because it discards whichever of the two that is.
- **There is one kind of run.** A Career run / One-off control shipped here briefly and
  was **removed 2026-08-21** (roadmap item 28): a career run at Base Ascension with no
  boost taken is the same tournament, so One-off was a strictly dominated choice, and
  deleting it answers "should a one-off pay?" by deletion. The plain World Cup it led to
  was deleted with it later the same day, along with the `careerMode` flag.
- **Every destination carries the same header**, an eyebrow + display title (`StageHeader`),
  since the tab row alone does not name the page: `/career` gained one on 2026-08-23
  ("Your career" / "Cup Run Career") and `/records` one for the destination rather than
  for each half ("Your honours" / "Records"), sitting ABOVE the `SubTabs` the way `/squads`
  puts its Display toggle under its header. `ChallengesScreen` and `CabinetScreen`
  therefore render no header of their own at all - the `heading` and `onClose` props they
  used to take for the deleted aliases are gone (see the alias note above). The album's own
  "Back to game" crumb went at the same time: the tabs are the way out, so it was a second
  answer to a question the bar already answers.
- **The bar goes inert while a match reveals** (`nav/liveMatch.ts`), because the live
  playback is transient state that is deliberately not persisted - leaving the screen
  loses it. Published from `useMatchClock`, so it covers every live match; the tree's
  review cells go inert on the same signal, for the same reason.
- **The two navigation cards leave the build page's left column.** The phone build page
  briefly went **pitch first** too (item 27's decision D, on the reasoning that the thing
  you tap was sandwiched between the panel you pick from and the ratings you check).
  **Reverted 2026-08-21:** that problem was already solved by motion rather than by order -
  picking a player scrolls the pitch up, placing him scrolls the panel back - and
  pitch-first breaks the pairing, because scrolling "to the pitch" is a no-op when the
  pitch is already at the top and the return scroll then travels the wrong way. The source
  panel (setup / drawn squad / market / complete, all one grid area) is first again.
- **Layering:** the bottom bar is `z-20`, under every overlay - the group draw is its own
  centred `z-40`, the shared `Overlay` is `z-[80]` and confetti `z-[90]`, all over a
  full-screen backdrop. Nothing here is bottom-anchored, so there is no conflict to
  design around.
- **One run at a time is now TRUE**, and by deletion rather than by a rule: there was only
  ever one way for two runs to be live at once (a World Cup in the game state alongside a
  Cup Run in `wcsim_run_v1`), and the World Cup is gone. `wcsim_run_v1` holds the only run
  there is, and every path that starts a build clears it.
- **Not decided by the preview:** the six-overlay pile, and per-screen adaptations now that
  the chrome around them changed. Comps: `docs/redesign-2026/turf-flat/nav2/` (ten pages),
  audit: `docs/redesign-2026/turf-flat/nav-options.html`.
- **What the deletion took with it**, for anyone reading old commits: `navMode.ts` and
  every `TABS` branch, the Settings "Navigation (preview)" group, `modeOfPath` and the
  quick/career route split, the footer nav array and its markup, `ModeSelect`'s `launcher`
  variant (with `ResumeButton` and its five props), `CupRunScreen`'s `stages` prop and
  `RunState.useStages` (every run is a tournament, so there is nothing to record), and the
  pre-run Ascension picker with its `ascSel` state - the tier is chosen on the build page
  and read from the career's `lastAscension`.

## The dataset (`src/data/squads.ts`)

**Adding a tournament has a written method: `docs/adding-a-world-cup.md`.** It is the
distillation of the five drops below (1986 re-sourced, then 1982, 1978, 1974, 1970) and it
exists because each of them rediscovered something the last one had already learned. It
carries the three sources in order, the tooling traps (RSSSF serves latin-1; the name
matcher's failure modes; the MediaWiki 429s), the three identity scans `validateSquads`
cannot do, the paired-rater / reconciler structure, the per-half 81-84 band self-check that
stopped three drops running from coming in light, the finishing checklist, and why **2026 is
a different problem** from every backward drop. It ends with a ready-to-use prompt.

- Tournaments: **all fifteen (1970-2026)** are full researched datasets. 1970, 1974 and
  1978 are 16-nation fields; 1982, 1986, 1990 and 1994 are 24 nations; 1998-2022 are 32;
  **2026 is the first 48-nation field**. Squad sizes: 22-man for 1970-1998, 23-man for
  2002-2018, 26-man for 2022 (Iran 25) and 2026 (every one of the 48 a full 26).
  **9,625 player rows** across 416 squads. Three squads are short and all three are real:
  **Morocco brought 19 men to 1970** and **El Salvador 20 to 1982**, neither filling the
  roster, and Iran registered 25 in 2022.
  (1990/1994/1998/2002 were researched in 2026, replacing the earlier placeholders; 1986
  was added 2026-08-23 as the first step of roadmap item 03, and its positions and ratings
  were re-authored 2026-08-25 as roadmap item 33; **1982 was added 2026-08-25** by the same
  route, which is now the documented method - see below; **2026 was added 2026-08-26**, the
  first drop made FORWARDS - see its own note below.)
- **1986's sourcing is the template for 1982, and it changed on 2026-08-25.** The first
  drop took the rosters from **`openfootball/world-cup`** (`1986--mexico/squads.txt`, **CC0**)
  because the session that built it could not reach Wikipedia, and it inferred the twelve
  specific positions and 255 of the ratings from a distribution rule. **Wikipedia and RSSSF
  turned out to be reachable after all** - `curl` and the MediaWiki API both work from a
  local session, whatever a cloud session's egress proxy blocks - so the whole tournament was
  re-sourced under item 33 and nothing in it is inferred any more. **Try the fetch before
  believing it is blocked.** What each source gives:
  - **Wikipedia `1986 FIFA World Cup squads`** (raw wikitext through
    `?action=raw`): names, shirt numbers, the GK/DF/MF/FW split, plus **caps and club at the
    time**, which is the single best rating signal for a player nobody has written about.
    It also settled a real error: **Morocco registered 22, not 23** (the openfootball list
    carried a phantom 23rd, "Abderrazak Dinar", who appears in no other source), so the
    dataset is **528 rows** and every 1986 squad is a plain 22.
  - Each player's own article, fetched in batches of 40 through the **MediaWiki API**
    (`prop=revisions&rvsection=0`), for the infobox `position` field - "Left-back",
    "Defensive midfielder", "Sweeper" - which is what turns DF into one of the twelve.
    527 of 528 had one.
  - **RSSSF `tables/86full.html`** for every match line-up, printed as
    `keeper - defence - midfield - attack`. That is what says which role a man **actually
    filled in Mexico** (Brehme played left MIDFIELD, Júnior played left midfield with Branco
    behind him, Gallego played centre-back for Spain, Zavarov played off Belanov), and it
    separates starters from the bench for the ratings.
  **The convention that came out of it:** `positions[0]` is the role he filled in Mexico
  where he played, with his other real roles after it; a man who never got on the pitch
  carries the role he was picked for. Ratings are a judgement call as always, anchored to
  the same player's rows in other tournaments where he has them - but **not by a fixed
  offset**. The first drop put everyone who also appears in 1990 at a flat "minus two",
  which is wrong in both directions and produced its worst misses there: Cha Bum-kun (a
  Bundesliga star at Leverkusen) at 67, Zavarov (Soviet Footballer of the Year 1986) at 74,
  Madjer and Belloumi (two of the greatest African players ever) at 67.
- **1982 was added 2026-08-25 by that same route, and the route is now the method for
  1978 and earlier.** Same three sources in the same order (Wikipedia squad list ->
  per-player infobox -> RSSSF `tables/82full.html` line-ups), same `positions[0]` rule,
  same anchor discipline. **526 rows, not 528: El Salvador brought 20 men** and never
  filled the roster (Wikipedia and planetworldcup agree, and the note is explicit). Only
  two nations were new to the dataset, El Salvador (`SLV`) and Kuwait (`KUW`), both of
  which needed a `country-flag-icons` entry and a confederation.
  **What was done differently, and it is worth repeating:** the ratings were authored by
  **six independent raters working in pairs** over three groups of eight squads, then
  merged by **three reconcilers** who saw both proposals plus a line-by-line diff, and
  finally checked by a **calibration reviewer** measuring the finished tournament against
  the other ten. The pairs converged hard - **no single player's rating differed by five
  or more anywhere in the tournament**, and every squad's best XI agreed within about a
  point - which is the evidence that the numbers are a reading of the football rather than
  one model's noise. Two raters also caught a real defect in the source data that I had
  missed (RSSSF serves **ISO-8859-1**, and decoding it as UTF-8 silently dropped the
  appearance data for every accented name), and three independently flagged the same
  wrong-person anchors.
  **The trap that is now guaranteed to recur:** an ANCHOR matched by name is often a
  different human. 1982 needed six `personId` overrides (Brazil's Eder, Paulo Sergio and
  Juninho; Spain's Juanito and Joaquin; Czechoslovakia's Jan Kozak, whose namesake in
  2010 is his son), plus two rows that had to **reuse** an existing override because they
  are the same man as a 1986 row that already carries one (Oscar, Junior), plus two
  spellings unified with the dataset or the same human would have become two drafted-once
  identities (Bezsonov, Blokhin). Run the collision and near-miss scans before believing a
  tournament is done; `validateSquads` cannot see any of it.
- **1978 was added 2026-08-25 and is the drop where the method finally landed first time.**
  Same three sources, same paired-rater / reconciler structure (four raters over two groups
  of eight, two reconcilers), **352 rows across 16 nations**, no new countries and no new
  confederations. It needed **no calibration correction afterwards**, which 1986 and 1982
  both did, and the reason is one number: the raters were given the **81-84 band share**
  as an explicit self-check up front rather than having a reviewer find it missing later.
  It came out at 12.2% against a family range of 10.1-16.4%.
  **The per-half figures are what to hand the next set of raters**, because a
  whole-tournament band target is not something the weaker half can carry and one rater
  correctly refused to inflate to reach it. Measured over five fields, splitting each by
  best XI: the **strong half** runs 19-22% in the 81-84 band with a best-XI mean of
  81.1-82.1, the **weak half** 2.3-7% with 73.8-76.5.
  **Two things about 1978 specifically.** It is now the OLDEST tournament in the file, so
  **every anchor points forward** - a later row is a decline number for anyone at his peak
  here (Kempes, Passarella, Cubillas, Fillol, Dalglish) and a target for anyone young
  (Platini at 22, Rossi at 21, Hugo Sanchez at 19). That inversion is the single most
  likely systematic error and it is worth stating to raters in those words. And only
  **two players reach 90** (Kempes 91, Rensenbrink 90), the fewest of any tournament,
  which is right: 1978 had no all-time great at his peak and Cruyff refused to travel.
  **`validateSquads` earned its place again**: Wikipedia spells 1978's Jorge Olguin without
  the accent while our 1982 row has Olguín, so the same slug carried two display names. The
  slug-collision scan lists that pair as "the same man, fine" and says nothing about the
  spelling, so the harness is the only thing that catches it.
- **1974 was added 2026-08-25 and confirms the method is now repeatable.** Same three
  sources, four raters over two groups of eight, two reconcilers, **352 rows across 16
  nations**, and - like 1978 - **no calibration correction was needed afterwards**. Both
  group A raters checked their own 81-84 band, found it light (15.3% and 17.6%), and fixed
  it before finishing (21.6% and 20.5%). **That self-check is the single highest-value thing
  to give a rater**, and it is why the last two drops landed first time where 1986 and 1982
  both needed a reviewer afterwards.
  **Three nations arrived and none has a flag in `country-flag-icons`:** East Germany (GDR)
  and Zaire (ZAI) borrow a successor's exactly as YUG, TCH and URS already do, Haiti (HAI)
  has its own. Both German sides therefore fly the same flag in 1974; there is no better
  option that ships.
  **1974 has the highest ceiling of the pre-1986 drops**: Cruyff 95 is the dataset's first
  new Iconic card in a while, with Beckenbauer 92 level with Matthaus 1990, and five players
  at 90+. That is correct rather than generous - 1974 is the strongest field of the decade
  and Cruyff was at the exact peak of a three-Ballon-d'Or run.
  **A remaining hole in the dossier tooling, and the reason to keep reading the line-ups.**
  The fuzzy surname fallback was tightened for this drop so it refuses ambiguous matches,
  and that worked. But the **exact-substring** branch still mis-fires on short one-word
  names: Brazil's `Cesar` was handed `Cesar Carpegiani`'s appearances because "cesar" is a
  substring of "cesarcarpegiani", and the same class of error hit both Marinhos, Edu,
  Farias and Sven-Gunnar Larsson. Four agents caught it independently. **Treat any short
  mononym's `apps` line as unreliable in both directions.**
- **1970 was added 2026-08-25 and the matcher hole above is now closed.** RSSSF prints
  short forms of long names, never the reverse, so only `rsssf ⊂ player` is legitimate
  containment; the other direction is refused outright. It immediately earned it by
  **declining to choose between Jack and Bobby Charlton in the same squad**, which the old
  version would have merged silently. The cost is real and accepted: it now misses genuine
  starters (a dozen in 1970) and reports them as "none found", which the raters recover from
  the printed line-ups. **An honest miss beats a false positive**, because a rater can read
  a line-up but cannot un-see a wrong appearance count.
  **1970 is the third drop running to need no calibration correction**: mean 74.9, median
  75, floor 63, band 12.3%, best XI from El Salvador 67.5 to **Brazil 86.8** - the highest
  pre-1990 side in the file and second only to Brazil 2002 (89.1).
  **Pele 97 is the seventh Monumental card**, and both group A raters chose it independently
  with the same reasoning, which is worth keeping: a rating is the player's STRENGTH at that
  tournament, not the size of the load he carried, so "he had Jairzinho, Tostao and Gerson
  beside him" argues against a 98, not against a 97.
  **The era needs its own position note.** 1970 pre-dates modern position language - articles
  say "inside forward", "wing half" or just "forward" - so each was mapped onto the twelve by
  where the man actually lined up: inside forward is usually AM or ST, wing half DM or CM,
  full-back LB or RB, libero CB. Expect the same for 1966 and earlier, more so.
  **One override, and nothing but the article titles separates them:** Sweden's 1970 Jan
  Olsson is born 1944 (a VfB Stuttgart midfielder who won **Guldbollen** for 1970 and
  man-marked Riva); the 1974 Jan Olsson is born 1942, the man Cruyff turned. Two raters
  reached that independently. Sweden's Claes Cronqvist looked like the same problem and is
  not - one man, and the 1970 squad list's "DF" is the outlier against his own infobox and
  the line-up, which both have him as a striker.
- **2026 was added 2026-08-26, and it is the first drop made FORWARDS.** Spain won it,
  beating Argentina 1-0 after extra time in the final and conceding **one goal in eight
  matches**. **1,248 rows across 48 nations**, every squad a full 26 and half again the
  size of any previous drop. Five nations were new (**Curacao, Cape Verde, Jordan, DR Congo,
  Uzbekistan**) and all five have a real flag in `country-flag-icons`, so none had to borrow
  a successor's. DR Congo is `COD`, its own code beside 1974's `ZAI`, the same period
  identity treatment `YUG` and `SCG` get. **Nothing in the app needed changing for a
  48-team field**: the checks read `WORLD_CUP_YEARS.length` and the game draws its own group
  of four and its own 16-team bracket from the pool, so "32 nations" was never assumed.
  - **The sources are different and BETTER than the backward route, and `docs/adding-a-world-cup.md`
    section 1d is the record.** RSSSF has no line-ups for modern tournaments (`22full.html`
    and `2026full.html` both 404). Wikipedia's twelve per-group and four per-round articles
    instead carry **FIFA's own tactical line-ups** for all 104 matches, which print each
    starter's specific role in almost exactly this game's vocabulary, plus substitutions,
    cards and the Man of the Match. So `positions[0]` is the role he actually filled, from
    the primary source rather than from a reading of it.
  - **Name matching is EXACT here**, because both the squad list and the line-ups are
    Wikipedia links: 104 matches joined to 1,248 rows with five misses, all resolved inside
    one squad. The whole class of fuzzy-matcher bugs that dominates the backward drops does
    not arise.
  - **What replaces it is LABEL DRIFT, and there were nine.** A man the dataset already
    holds can be labelled differently by the new squad list, so the slug misses, he becomes
    a new person with no anchor, and the album gains a duplicate card. Fixed by respelling
    the 2026 row to the existing label, never by an override: `Trézéguet` = `Mahmoud
    Trézéguet`, `Cammy Devlin` = `Cameron Devlin`, `Kanaanizadegan` = `Kanaani`, `Abdul
    Fatawu` = `Abdul Fatawu Issahaku`, `Abdul Rahman Baba` = `Baba Rahman`, `Mahdi` =
    `Mehdi Torabi`, and Brazil's source disambiguates three Edersons and two Danilos where
    the dataset carries plain `Ederson` and `Danilo` (the other two of each really are
    different, younger men). **An edit-distance scan finds none of these** - the two labels
    are not near-misses. The scan that does is exact surname within one nation.
  - **Four MORE were caught only by `validateSquads` after splicing**, which is why the doc
    now says to splice a draft in before believing anything: Wikipedia's 2026 squads article
    accents `Ricardo Rodriguez`, `Théo Hernandez`, `Lucas Hernandez` and `Julián Alvarez`
    differently from the articles the existing rows came from. One personId with two display
    names is a hard failure, and the dataset's own consistency wins over Wikipedia's.
  - **Five genuine collisions needed a personId override**, all different men: Uruguay's
    Emiliano Martinez (not Argentina's keeper), Colombia's Luis Suarez (not Uruguay's
    striker), South Africa's Teboho Mokoena (a different man from the 2002 one, who was five
    years old then), Qatar's Ahmed Fathy (not Egypt's), and Panama's Jose Luis Rodriguez,
    which was a **double** trap - left alone his slug both merged him with Uruguay's man and
    split him from his own 2018 row as `Jose Luis Rodriguez Puma`.
  - **Where it landed:** mean 74.5, median 74, p90 82, floor 61, 81-84 band 11.9%, ten rows
    at 90+, best XI from Qatar 67.9 to Spain 87.1. The mean is the second-lowest in the file
    and the floor the lowest, both of which are right: a 48-team field reaches down to sides
    no 32-team field ever contained. Strong half 78.2 mean / 20.7% band, weak half 70.8 /
    3.0%, and **no player outside the strong half reaches 90**, as in every other tournament.
  - **The per-half band targets do not transfer to a 48-team field and three reconcilers
    said so independently.** The weak half of 48 is weaker than the weak half of 32, and a
    rater group holding ranks 4, 9, 16 and 21 has no elite side to supply an 85+ row. They
    refused to inflate and were right. **The check that does transfer is the best-XI mean.**
    Also: the "16-22 distinct ratings per squad" figure handed to the raters was **wrong** -
    the shipped dataset runs 5 to 17 with a median of 12, and three raters measured it and
    told me so.
  - **Two numbers were set by the integrator against a reconciler's call**, both cross-group
    facts no rater could see. Haaland 95 to 94: all sixteen rows at 95+ in fifteen
    tournaments belong to a player who reached the FINAL, and the stated case for 95 was
    that he carried a bigger load, which is the reasoning the Pele 97 note rejects. Rodri 92
    to 93: at 92 the Golden Ball winner sat level with a round-of-16 exit on the same +2
    anchor movement.
- **Six name collisions came in with 1986 and one was already shipped.** A `personId` is
  the name slug, so two different people sharing a display name silently merge into one
  drafted-once identity. 1986 brought six (Brazil's 1986 Oscar / Júnior / Júlio César are
  not the 2014 AM, the 2002 left-back or the keeper; Spain's Víctor is not Brazil's 2014
  goalkeeper Victor; Mexico's Javier Hernández is Chicharito's **father**; Portugal's João
  Pinto is João Domingos, not the 2002 João Manuel), each given an explicit personId
  override like the two "Luis Marín". Finding them also turned up a **pre-existing** one:
  **"Carlos Aguilera" was Uruguay's 1990 striker AND a different Spaniard in 1998** sharing
  one id. Fixed at the same time (`carlos-aguilera-esp`). Three source spellings were also
  respelled to ours so the same human stays one person: Vasyl Rats, Oleksandr Zavarov,
  Paulo Silas.
  Historical nations keep their period identity: the 1990 champions (West Germany) are
  recorded as Germany on code `GER`;
  Soviet Union (`URS`), Czechoslovakia (`TCH`) and Yugoslavia (`YUG`) are their own
  codes. A player who continued for a successor nation (Prosinecki YUG->Croatia,
  Gorlukovich URS->Russia) shares one `personId` across both, so the cross-nation
  dedup check intentionally lists them.
- **Every name and shirt number was checked against Wikipedia on 2026-08-26**, all
  fourteen tournaments, 368 of 368 squads, 8,375 of 8,377 rows paired. **The shirt
  numbers were wrong in 66 places and are fixed.** Every one was a permutation inside a
  squad, and they clustered in the five tournaments whose numbers were never re-sourced
  (2002, 2006, 2010, 2014, 2018); nothing from 1970-1998 or 2022 moved. Two independent
  sources agree on all 66 and nothing anywhere backed us, so do not "restore" one: the
  common cause was assuming the first-choice keeper wears 1, and he often does not
  (Barthez 16, Subasic 23, Kingson 22, Julio Cesar 12, Keller 18).
  **The names were mostly right.** 86 of 117 differences are house style and are
  deliberate: we carry the fuller name where Wikipedia's squad list prints a short label
  (Alfonso Perez for "Alfonso", the whole Iraq 1986 squad), or a spelling that is itself
  the article with the other redirecting to it (Bezsonov, Mboma, Valery Karpin, Preki).
  **A fuller correct name is not a wrong one**; only 33 were errors, four of them a
  different human altogether.
  **The three squad MEMBERSHIP findings it turned up are now all corrected** (2026-08-26),
  each confirmed by en and es wikipedia independently and each rated off the 7a0 figure
  where that dataset carries the man: Ivory Coast 2010 had Bakari Kone and Abdoulaye Meite
  where the squad played Emmanuel Kone and Abdul Kader Keita; Nigeria 1998 had Ike
  Shorunmu, who belongs to the 2002 squad, for Willy Okpara; and South Africa 1998 had
  **Andre Arendse, who never went** - he was injured before the tournament, his
  replacement Paul Evans was injured on arrival, and Simon Gopane was called up and sat on
  the bench, so Gopane is the man in the file. **Gopane wears 22 on purpose**: wikipedia
  prints him at 23 because it lists all three keepers of that one slot, and a 1998 squad
  had 22 shirts, the footnote itself calling Arendse "#22". Do not "correct" it back.
  A fourth finding is a judgement rather than an error and is left as it is: France 2022
  has 25 men because Benzema withdrew before playing.
  **Two squads look short against Wikipedia and are NOT wrong** - Argentina and England
  1990 both list a footnoted mid-tournament replacement as a 23rd row.
  Saudi Arabia 2022's #26 kept the `['LB','CB']` of the man who had been wrongly in that
  row; **fixed to `['DM','CM']`** on the same day, since en, es and fr wikipedia all put
  Riyadh Sharahili in midfield and fr says defensive midfielder specifically. His 64 is
  kept rather than re-derived: it was already the squad's floor, which is where a 26th man
  with two caps who never played belongs either way.
  **POSITIONS have NOT been swept the way names and numbers have.** The one line-level
  disagreement left in that squad is the honest kind: Nawaf Al-Abed is `['ST','AM']` here
  and MF on the squad list, and wikipedia contradicts itself about him (infobox
  "Midfielder", lead "plays as a winger"), so he is left alone. A full sweep of
  `positions[0]` against the GK/DF/MF/FW split of all fourteen articles is the obvious
  next check and has not been run.
- **Ratings** are a holistic judgement of each player's strength *at the time of
  that tournament* on the 60-99 scale (not current ability, not a FIFA-game number).
  For **1998 and 2002** the rating is a *blend* of pre-tournament ability and how the
  player actually performed at that World Cup (standouts up, heavy-defeat/flop players
  down, bench/unused left at baseline).
- The `squad(code, nation, year, rows)` helper builds the `Player[]`;
  `SQUAD_BY_ID` is the lookup table. **Editing `squads.ts` is the only thing needed
  to change rosters/ratings** - `App`, the draft, and the sim all derive everything
  at runtime (re-roll "another team/cup" is computed from `.year` / `.code`). No
  build step or other file needs updating.

## Chemistry feature (flagged)

A cohesion bonus added to the **user XI's strength** (attack, defense, and overall
alike, so it actually reaches the attack-vs-defense match sim, not just the ratings
display; opponents are real, intact squads with innate chemistry). Lives in
`domain/chemistry.ts`; surfaced in `BoxScore` (live during draft) and
`CompletePanel`. Design docs:
`docs/chemistry-requirements.md`, `docs/chemistry-design.md`.

- Six categories, each contributing a **small integer that sums to the bonus**
  (capped at `MAX_BONUS = 6`): **Same squad, Same nation, Same tournament, Same
  continent, Same era, In position** (the last needs `FIT_MIN` = 10 of the XI standing in
  their natural role). Category names are identical in the rules tooltip and the breakdown,
  and the per-category points add up to the displayed bonus (with an explicit "capped" note
  when the raw total exceeds the cap) - keep it that way; transparency is the point.
- **"In position" needs TWO different readings of a player, and confusing them was a real
  bug** (roadmap 38, fixed 2026-08-26). The category compares where a man is STANDING
  against what he IS, and a run's XI can only answer the first: `placedPlayers` promotes
  the filled slot to `positions[0]`, so `primaryPosition(p)` on a run's copy is the slot
  and the natural role has been overwritten. `chemistryOf` (domain/run.ts) read the run's
  copy on both sides, which asked whether each player was standing where he was standing -
  so **In position was 11 out of 11 for every XI that ever started a run**, and the run
  scored a point higher than the build page had promised on 374 of 400 sampled XIs. It
  resolves the player through **`basePlayer`** now, the same tool and the same reason as the
  challenge catalogue and the sticker banking. `npm run checks` asserts the two paths agree
  on the same XI, plus two vacuity guards: that the pre-fix reading would have disagreed on
  the sample, and that the sample can actually FAIL the category (a check that the category
  is earnable is worthless if nothing in the sample loses it).
- **The fix was a balance change and is deliberately NOT compensated.** Chemistry reaches
  attack and defence alike, so the lost point cost real runs: measured over 40 budget XIs at
  $110, average chemistry went 2.52 -> 1.52, cup wins 6.1% -> 4.1%, out of the group 71.0%
  -> 66.3%. It stands because `FIT_MIN` was tuned against the build page's (correct)
  reading, so the post-fix number is the balance the game was designed for - runs had been
  easier than intended - and because the category is genuinely earnable: an XI built by
  shopping each slot's natural role hit 11/11 in 200 of 200 attempts, where a random
  auto-fill averages 7.3 and earns it 6% of the time. Widening `FIT_MIN` to hand the point
  back would just re-grant the free point. The levers for run difficulty are `ASCENSIONS`
  and the difficulty setting.
- **The transfer market shows no positions at all, which is now a gap** (roadmap 40).
  `SquadPanel` underlines `positions[0]` and its tooltip says only placing a player there
  earns positional chemistry; `BudgetMarket` prints name, flag, year, rating and price and
  never references `positions`. Since the market filters by every position a player can
  fill, all sixty visible rows are eligible and an unknown subset are naturally in the slot,
  so the category is aimable in the roll draft and blind in the market.
- Entirely behind **`FEATURES.chemistry`** in `src/config.ts`. With it `false`, the
  bonus is 0 and all chemistry UI (box, "?" rules, breakdown, the underlined primary
  position in the draft chip, the per-player flag/year in the box) disappears.

## Knockout bracket

`domain/bracket.ts` is the 16-team knockout model. A run builds one the moment the group
is survived (see "Runs as tournaments" below) and plays it out in `CupRunScreen`; the tree
itself is drawn by `Bracket.tsx`. It used to have its own screen
(`KnockoutScreen.tsx`, deleted 2026-08-21) - the notes below are about the model, which
is unchanged, and the renderer.

- **Field**: a 16-team bracket. Seed 0 is the user; the team that qualified alongside
  them in the group is seeded into the opposite half; the other 14 are drawn
  elo-weighted via `drawOpponent` (seeded to exclude the group opponents, so no
  immediate rematches).
- **Lazy, round by round**: only the current round exists until it is played. The user
  plays their own tie (Round of 16 -> Final) with the same live clock / goal feed as
  the group; the other ties in that round auto-resolve to fill the tree. The user's own
  scores stay hidden until each round is played; the next opponent is always shown.
- **A champion is always crowned**: if the user loses, `bracket.ts` simulates the
  remaining rounds (higher elo more likely to advance) so the tree still completes and
  the trophy is awarded.
- **`Bracket.tsx`** takes `reviewableRounds` + `onOpenReview` so a Cup Run can
  make the user's own played tie a click target (see "Runs are tournaments" below). Its one
  caller (`cupRun/RunBracket`) always passes both; what makes a box an inert `div` is an
  EMPTY `reviewableRounds`, which is how the tree goes inert while a match reveals. (The
  props read as optional because the caller that omitted them was the deleted
  `KnockoutScreen`, a plain read-only tree.) It
  renders the tree responsively: a wide left-to-right layout on
  desktop and a two-sided vertical tree (top-down + bottom-up, converging on the cup)
  on mobile so there is no horizontal scroll (toggled at max-width 900px; `bkt-`
  prefixed CSS in `index.css`, with desktop and mobile connectors scoped separately so
  they cannot cross-contaminate). Mobile uses 3-letter country codes; the year stays
  visible. The desktop match box stacks the two teams as rows (`Seed`); the mobile box
  (`MobileMatch` / `MSide`, `.bkt-vs`) instead sets them side by side (home | away),
  each a column of flag / code+year / goals with a result dash between the goals (three
  rows, not four, kept narrow so the four Round-of-16 boxes still fit one phone row).
  The mobile centre shows the actual final match box next to the champion box (`Cup`);
  desktop keeps them as separate `Final` and `Champion` columns.
- **Champion box** (`Cup`): the green node crowning the winner. It carries a gold
  `Trophy` icon; hovering it fires a one-shot confetti burst originating at the trophy
  (`confettiBurst(x, y)` from `Confetti.tsx`, which appends its own throwaway
  full-viewport canvas and removes it once the pieces fall out; gated on a champion
  existing + `prefers-reduced-motion`).
- **Confetti** (`Confetti.tsx`) rains when the user wins the cup. It is a small,
  self-contained canvas animation (no `canvas-confetti` dependency): a pool of falling
  rectangles/circles it draws each frame, kept heavy for `RAIN_MS` (3s, a deliberate
  choice - decision CR-D1 in `docs/code-review-2026-07-round2.md`) then drained.
  It is pointer-events-none (never blocks "Draft a new XI" or the cup-reward modal
  under it) and sits at `z-[90]`, above the sticker modals (`Overlay` is `z-[80]`), so
  on a cup win the rain falls in front of the reward picker. It fills
  the viewport via `fixed inset-0 h-full w-full` (a bare `<canvas>` is a replaced
  element, so `inset-0` alone leaves it at its intrinsic 300x150 and confines the rain
  to the top-left); the backing store is sized to the canvas's rendered box x
  `devicePixelRatio` so it stays crisp on high-DPI screens. It respects
  `prefers-reduced-motion` and scales piece size / density down on narrow screens.
  (The earlier `canvas-confetti`-backed version was dropped: driving its scoped
  instance with a per-frame `fire()` stopped adding particles after the first frames,
  so the rain drained out early instead of lasting its full configured duration.)

## Squad browser (flagged)

A read-only reference view over the whole dataset, reached from the **Squads tab**
(`/squads/*`). It is separate from the game:
the in-progress reducer state is untouched while browsing, so Back returns to it.

- **`SquadBrowser.tsx`** derives its view from the URL (`useMatch` + `useNavigate`;
  `query`/search stays local) over `SQUADS` / `SQUAD_BY_ID`. A **Display** toggle picks
  the entry point: *By World Cup* (a year's nation grid, cards
  sorted by rating, `< 32`-team years flagged as approximate placeholders) or *By Team*
  (every nation with its participation count = occurrences in the dataset, drilling into
  the World Cups it played via the `TeamCups` list, which also shows a "Legends of
  <nation>" top-10 ranked by each player's single best rating across appearances). Both
  land on a squad roster. A cross-tournament search (diacritic-insensitive over player
  name + nation/code/year, capped at 80 rows) overrides either mode.
- **`TeamRoster.tsx`** renders one squad grouped GK -> DEF -> MID -> FWD (styled like
  `XiTable`, GK on `bg-chalk`), each row showing the four required fields: jersey number,
  full name, **main position only** (`primaryPosition` = `positions[0]`), and rating.
- Ratings here are plain always-visible mono numbers, deliberately **not** `RatingChip`
  (which is `sm`-only and gated by `FEATURES.teamRatings`) - the point of this view is to
  expose the numbers.
- Entirely behind **`FEATURES.squadBrowser`**; with it `false` the tab and the whole view
  disappear and the game is unchanged.

## The player index (`docs/players.html`) - outside the app

A single generated page holding **every player of every squad of every tournament** in one
sortable, filterable table. It is deliberately **not part of the app**: no route, no flag,
nothing in `src/` imports it and it imports nothing - `docs/` is not under `public/`, so
`npm run build` never sees it. Open the file straight off disk. `/squads` stays the
in-app, read-only browser; this is the whole dataset at once, for looking things up.

- **Generated, never hand-edited.** `npm run gen:players` bakes the data in:
  `scripts/players-data-game.ts` and `scripts/players-data-other.ts` supply the two
  datasets, `scripts/players-page.ts` the encoding and the flags,
  `scripts/players-page.template.html` the markup, CSS and behaviour, and they meet at
  the `__DATA__` / `__FLAG_CSS__` placeholders. **Re-run it after any change to
  `squads.ts` or `STICKER_TIERS`**, the same way `gen:collectibles` has to be re-run -
  nothing fails while it is stale, because it is not in the build.
- **Shows** jersey number, name, country, year, main position, additional positions,
  rating, **what the other game rates the same man at** (their number, with the gap in
  brackets after it - "99 (+2)" is their 99 against our 97 - green where they are higher
  and red where they are lower), and collectible (yes, with the tier's colour, or no). **Filters** for main position,
  additional position, position (either), country, World Cup and collectible are all
  multi-select; rating is a two-handle range; **"Difference to <the other game>" is a
  one-handle slider that keeps only the players the two disagree about by at least that
  much** (either way, and a player the other dataset does not carry is out as soon as it
  is on - he has no difference, not a small one); the search box matches the name only,
  diacritic-insensitively. Every column sorts, rating descending by default.
- **It carries TWO datasets and a toggle** (top right of the page header): **WCS**, the
  game's own, and **7a0**, the other game's ratings. See the section below - that toggle
  is the reason there is no second file.
- **The dropdowns narrow EACH OTHER**, the way the transfer market's facets do
  (`marketFacets`, and the same reasoning): each one is counted over the rows that pass
  every filter except its own, so picking 1970 leaves the sixteen nations that were
  there, picking Wales leaves 2022 alone, and every option carries its live count
  (Morocco 19, because that is the squad they brought). One pass over the dataset does
  it: a row records WHICH filters it fails as a bitmask, and counts towards a dropdown
  when it fails at most that dropdown's own. **The World Cup dropdown counts TEAMS**,
  not players (1970 is 16), since a tournament's size is its field; the player figure is
  in the option's hover text. **The search box and the two sliders are
  deliberately left out** - what you type and where you drag a handle would otherwise
  reshuffle every list under your hand. An option is dropped when it would empty the
  table, **unless it is already ticked**, or a selection made before the query narrowed
  could neither be seen nor cleared.
- **A player who appears in more than one tournament carries an `x N` mark**, and hovering
  any one of his rows shows all of them (year, nation, main role, rating) with the row you
  are on picked out - plus every other row of the same man currently on screen. That is
  the one thing the table cannot show in a row, since a row is one appearance.
- **It stays fast by never holding the dataset as objects.** The 8,028 rows decode into
  flat typed arrays (person, nation, year, number, position combo, rating, tier), so a
  filter is an integer scan and the name query is answered once per PERSON and read per
  row. The body is virtualised at a fixed row height, so only the visible window plus a
  small overscan is ever in the DOM. Measured in Chromium: a scroll frame repaints in
  ~1 ms, a full re-filter and re-sort of all 8,028 rows in ~5 ms.
- **Two copies to keep in step by hand**, both deliberate and both cheap: the turf-flat
  colour tokens (copied out of `src/index.css`, light and dark) and the row/eyebrow/card
  styling, since the page ships no Tailwind. The FIFA-code-to-flag mapping is **not** a
  copy - the generator parses it out of `src/components/Flag.tsx` and inlines the SVGs as
  data URIs, so the page cannot drift from the game's own flags.

### The second dataset, and the toggle (`Dataset: WCS | 7a0`)

The same page also carries **another game's ratings** (`docs/player-ratings-other-game.csv`,
6,864 players, 302 squads, 56 nations, 1950 to 2026 including a predicted field), and a
toggle in the page header switches the whole table over to it. It shipped first as a
second FILE (`docs/players-other-game.html`, deleted 2026-08-26); one file with a toggle
replaced it, because two windows of one page do the side-by-side reading just as well and
there is only one artifact to keep in step.

- **THE QUERY SURVIVES THE SWITCH**, which is the whole point of both datasets living in
  one page. The filter state is held as VALUES (a nation code, a year, a position index),
  never as indices into one dataset's own tables, so flipping asks the other dataset the
  same question: "Brazil, 1970" reads 22 players either way. A value the incoming set
  does not hold (2026, or a nation it never lists) is dropped, and the count line says
  how many. A sort on a column the other set has not got falls back to rating.
- **An UNTOUCHED rating range opens to the incoming dataset's own scale**; only a range
  the reader actually moved is carried and clamped. The two floors differ (62 here, 64
  there), so clamping an untouched range quietly dropped 63 rows nobody had filtered out.
  `state.rangeSet` is the distinction.
- **Each dataset is decoded once and kept**, so a toggle back is instant; a switch
  rebuilds the header, the filter controls, the title and the masthead tile from the
  incoming set's `page` block, and costs about 15 ms.
- **The visible window is measured after the body's height is set**, inside `render`, not
  when a dataset loads. Measuring it first read the height of whatever narrow result was
  on screen (four rows, mid-search), and the next full list then drew fourteen rows with a
  hole under them.
- **The other source's twelve position names map one-for-one onto ours**
  ("Defensive midfielder" is DM, "Centre-forward" is ST), which is what lets a position
  filter mean the same thing on both sides of the toggle. An unknown wording throws
  rather than being bucketed.
- **THE UI IS THE SAME FOR BOTH**, which is the whole point of a toggle rather than two
  pages: the same nine columns at the same widths (one `GRID` in `players-page.ts`, not
  one per dataset), the same six filters in the same order. Only what a label NAMES
  changes - the other dataset, and whether the last column marks a sticker tier or 7a0's
  own **Legend** flag.
- **7a0 gives a player ONE position**, so the additional / any-position filters cannot be
  answered there. They are **greyed out, not removed**: the row of controls stays put, the
  control says why on hover, the selection is KEPT (so it is still there when you go back
  to WCS), and it simply stops filtering while it is inert. 7a0's "Also" column prints a
  dash for every row for the same reason.
- **The "vs" column is a real join, not a name lookup at read time.** `players-page-match.ts`
  matches the two datasets player for player at generation time, keyed on (nation,
  tournament, name) - never a name on its own, because a squad at one World Cup is a
  closed pool of 22 to 26 men, which is what makes a fuzzy comparison safe. Three passes,
  each **mutually unique** (this row's only candidate must have no other claimant): exact
  folded name, then token subset ("Piazza" in "Wilson Piazza"), then an edit distance of 2
  over the name or 1 over the surname, which is the transliteration pass
  (Rivelino/Rivellino, Mihaylov/Mikhailov, Haaland/Haland). Mutual uniqueness is what stops
  7a0's "Paulo Cesar Caju" and "Cesar Maluco" both landing on WCS's single "Cesar".
  Measured: **5,017 players matched**, 99.5% of the 7a0 rows whose squad WCS also has;
  894 are rated identically and WCS runs 0.60 lower on average. The column prints the
  OTHER dataset's rating with the gap in brackets after it, and **the bracket reads FROM
  this dataset TO the other** ("99 (+2)" is their 99 against our 97), so the sign belongs
  to the number it sits beside - which is why only the bracket is coloured and why
  `D.diff`, stored as ours-minus-theirs for the join and the filter, is flipped at the
  point of display. Sorting the column uses the rating, not the gap, since that is the
  figure on screen; a row with no counterpart prints a dash and sorts last in both
  directions, an absent rating being no kind of low one. The **Difference** filter still
  reads the real gap - to rank by disagreement, narrow with that slider.
- **The names were aligned in three passes, and the third is the one to repeat.** The
  source publishes short display names (bare surnames, or a given name alone). The first
  pass (2026-08-25) took full names from Wikipedia and left 488 rows single-token; a second
  (2026-08-26) cut that to 421 from `squads.ts` and openfootball alone, because that cloud
  session's egress proxy answered 403 for every football site. **Try the fetch before
  believing it is blocked**: from a local session Wikipedia and RSSSF both answer, which is
  what the third pass (2026-08-26, `docs/player-names-alignment.md`) used to finish the job.
  It took the **116 disagreements down to 1** and every "X. Surname" row in either dataset
  down to none. The rule it settled on:
  - **The Wikipedia squad list's DISPLAY name decides**, because it is the only source that
    separates a genuine mononym from a bare surname: it renders "Leao", "Pele" and "Zague",
    and it renders "Juninho Paulista" and "Harold Lozano". A **piped** `[[Article|Display]]`
    is an editorial statement of the common name; an **unpiped** link is only the article
    title, so it does not turn an agreed mononym into a full name (that is why Alisson and
    Nouhou stayed, and the 2026 article piping `[[Alisson Becker|Alisson]]` confirms it).
  - **Wikipedia is the tie-breaker, not an override.** The two datasets agreeing, and each
    staying internally consistent across tournaments, comes first - Wikipedia contradicts
    itself between years (Leo/Lei Clijsters, Emile Mbouh/M'Bouh, Caju/Paulo Cezar), so
    following it row by row would have split men in two.
  - Match within ONE squad; take the name only when it is the single unclaimed candidate;
    and **never use the shirt number** (7a0's "O. Berg" is Orjan and WCS's Henning Berg is
    a different man, both #20 in Norway 1994).
  **A rule that looks obvious and is wrong**, tried and rejected in the second pass: "the
  file spells this token out in another year, so copy it". Common given names collide across
  eras - it wanted 1950's Ademir (Marques de Menezes) to become Ademir da Guia, 2002's
  Raul (Gonzalez) to become Raul Albiol and 2022's Fred to become Fred Guedes.
- **A rename in `squads.ts` is an identity change, and it cuts both ways.** `personId` is
  the name slug, so a rename can **split** one man across tournaments or **merge** two. The
  third pass ran both scans over every proposed rename before applying any: seven merges
  were the point (Bremer, Sol Bamba, Roman Burki, Freddie Ljungberg, Harold Lozano, Jorge
  Luis Campos and Paulo Cezar Caju had each been two people), one was a real collision -
  Colombia's and Uruguay's **Carlos Sanchez**, two different men in the same 2018
  tournament, now told apart by `carlos-sanchez-uru`. Sixteen `<surname>-<nation>-1998`
  overrides existed only because a row displayed a bare surname; with the full names in
  place two of them (`okafor-nga-1998`, `sarabia-par-1998`) were splitting a man from his
  own other appearance, so all sixteen went.
- **It has no player id**, which the "x N appearances" mark needs. Appearances are
  matched by name **within a nation**, split wherever two are more than 24 years apart
  (`MAX_CAREER`; the longest real span in the data is Buffon's 20). Name alone merged
  147 pairs of different men - Gerd Muller's 1970 with Thomas Muller's 2014 among them,
  read out as one seven-cup career. What it still cannot separate is two men of the same
  name in the same era (England's several Wrights) or in one squad (Serbia named two
  Mitrovic in 2022); the page's footer says so rather than implying the grouping is exact.
- **Told apart at a glance** by an amber masthead tile and its own display title, so a
  second window flipped to it is never mistaken for the first.

## Sticker album (flagged)

A persistent Panini-style collection of the elite players you draft across runs.
Spec: `docs/sticker-album-spec.html`; design: `docs/sticker-album-design.md`; comps:
`docs/redesign-2026/turf-flat/{sticker-album,draft-stickers}.html`. Entirely behind
**`FEATURES.stickerAlbum`**.

- **What's collectible.** A player is collectible iff their `elo` falls in a
  `STICKER_TIERS` range (config.ts): **Legendary** 90-92, **Iconic** 93-96,
  **Monumental** 97-99 (currently 83 / 24 / 8 = **115** across the dataset; it was 53 before
  the 1990-2002 squads were researched, 81 before 1986, 84 before 1986's ratings were
  re-authored, 87 before 1982, 92 before 1982's hand-tuning put Platini over 90, 93 before
  1978, 95 before 1974, 100 before 1970 and 105 before 2026, so re-derive a count rather
  than trusting one written down here - this figure has been wrong nine times).
  **2026 added ten**, the most of any single drop: Mbappe 97 (the eighth Monumental, and
  his second card at that rating), Haaland 94 and Messi 94, Lamine Yamal 93, Rodri 93,
  Bellingham 92, Vinicius Junior 92, Hakimi 90, Dembele 90 and Courtois 90. Norway had
  never produced a collectible before. Collectibility is derived at runtime (`domain/album.ts` `tierOf`), so
  adding players/tournaments grows the album automatically - no lookup table.
- **`domain/album.ts`** (pure): `tierOf`, `isCollectible`, `collectiblePlayers`,
  `applyRunStickers`, `totalDuplicates`, `canAffordTrade`, `tradeOptions` (random),
  `executeTrade`, `pendingNewStickers`, `albumStats`, plus the `AlbumState`
  (`{version, collected: id[], duplicates: Record<id,count>}`).
- **Persistence.** `state/albumStorage.ts` owns `wcsim_album_v1` (the collection) and
  `wcsim_album_stats_v1` (trade-cost telemetry: runsPlayed / stickersEarned /
  tradesCompleted), **separate keys from the game** so a reset never wipes the album.
  `App` gets the album from the boot snapshot and holds it in `useStickerAlbum`
  (hooks/), which owns the banking rule and prop-drills the result (no context).
- **Earning: `FEATURES.stickersOnCupWinOnly`, and it is OFF.** **False (shipped):** any
  finished run banks the final XI, so the album records who you *drafted*. **True:** only a
  cup win banks, so it records what you *won*. The flag also switches the copy that explains
  it (home page, draft call-out), so flipping it swaps which of those two branches is live
  rather than leaving one dead.
  **It has been flipped both ways and the measurement is why it is off.** Added 2026-08-15
  and set back the same day; turned ON on 2026-08-24 and turned OFF again a few hours later.
  Over 400 simulated runs with a $110 XI at Base Ascension a run wins the cup **10%** of the
  time (30% exit in the group), so win-only banks about **a tenth** of the collectibles
  any-run does - and against 87 collectibles that will not fill an album. Two knock-ons make
  it worse, since the album is not self-contained: the owned-sticker discount makes the
  market cheaper as the album grows (so a slow album is a loop working against itself), and
  duplicates are what fund trades, so `TradeModal` would see far less use.
  **The intent is to switch it back**, because win-only is the better meaning - a shelf of
  what you won beats a list of everyone you ever drafted. It needs a second income first,
  which is **roadmap item 34** (an album shop: buy stickers with Prestige or a currency of
  its own). Flip it when that ships, and re-measure rather than trusting the figures here.
  Stickers are never awarded mid-run either way.
  On a **cup win** `App` shows `CupRewardPicker` (pick any one uncollected Legendary or
  Iconic sticker - Monumental excluded, FR-3/D-1) and then banks the **final XI**'s
  collectibles plus that pick, guarded once-per-run by `RunState.stickersApplied`.
  `RunEndStickerSummary` then shows the newly earned cards (only if any were new, FR-8).
  Both are global overlays in `App`. (There used to be a second, parallel banking path for
  the plain World Cup, guarded by a `stickersApplied` flag on the REDUCER and keyed off
  `state.group` / `state.bracket`; it went with that tournament on 2026-08-21, so
  `useStickerAlbum` no longer takes `dispatch` at all.)
  A **losing** run still reports in with an empty list, so the run is recorded, the
  `runs_played` telemetry stays honest and the server-side active run is cleared - it
  simply banks nothing. The rule is enforced in one place (`useStickerAlbum`'s
  `applyStickers`), so no caller can bypass it.
- **Album screen** (`AlbumScreen.tsx`, route **`/album`**, reached from the **Album
  tab**): completion counter + duplicate pool, tier sections (Monumental,
  Iconic, Legendary) of `StickerCard`s (collected = flag+name+rating+tier; uncollected =
  silhouette with a `?`), a per-tier **Trade** action (`TradeModal`) when affordable,
  a 100% completion state, and a **"Reset album"** footer button (inline confirm ->
  `onReset` -> `store.clearAlbum()`, which for a guest removes the album + stats keys;
  the in-memory album is cleared **only once that write resolves**). Reset touches only
  the album, not the game / career / run.
  **This footer is the only way to wipe an album, and it is guest-only**: `useStickerAlbum`
  exposes `canResetAlbum` (`enabled && !isSignedIn()`), which hides it entirely for an
  account. That collection is synced, `remoteStore.clearAlbum` refuses by design, and a
  failed write while signed in IS the blocking unreachable screen (D9) - so the button used
  to show a server error for a request that never left the browser, and the screen went
  briefly empty while the account still held every sticker. Deleting the account is the
  account-level reset. The `clearAlbum` throw is a **backstop**, not the gate; keep the gate
  in the hook, where one flag covers every caller.
  `StickerCard` shows real artwork when
  `FEATURES.stickerImages` is on (default); set the flag false to always use the
  placeholder card.
  **A card with no artwork gets a silhouette, not a hole** (`STICKER_PLACEHOLDER_SRC`,
  added 2026-08-25). The dataset can always run ahead of the art - a collectible appears
  the moment a rating crosses a `STICKER_TIERS` boundary, and eleven currently have no
  file - and before this each of those collapsed its image box, so the album grid grew
  gaps and the cards around them reflowed. It is a **data URI rather than a component**,
  so the three call sites (album grid, the lightbox hero, the home page's legends
  showcase) each need one line and keep their own very different layouts; they share
  `onStickerArtError`, which swaps the src once and sets a `data-fallback` flag so a
  failure cannot loop. **The background is transparent on purpose**: the card's own
  surface shows through, which is what lets one fixed silhouette work in both themes.
  `npm run checks` still fails on a missing file unless its id is in
  `KNOWN_MISSING_ART`, so the gap stays visible rather than being papered over.
  **Art pipeline:** originals (full-size PNG) live in **`art/stickers-src/`**, which is
  NOT under `public/` and so is never deployed; `python scripts/build-sticker-art.py`
  resizes them to 400px-wide WebP in `public/stickers/<player.id>.webp`, which is what
  `StickerCard` requests (base-path-aware, lazy-loaded, `aspect-square w-full` hero
  image on collected cards). The originals average 1.3 MB against ~40 KB shipped, so
  serving them directly was ~139 MB of images for a grid of thumbnails. Re-run the
  script after adding or replacing art; it skips unchanged files. Superseded art is
  parked in `art/stickers-archive/` (also undeployed).
- **Draft integration.** `SquadPanel` marks collectibles in the drawn squad (tier star
  chip + a "collectibles in this squad" call-out); `XiTable` marks them the same way in
  the line-up sheet (tier star + a tier-coloured left accent bar on the row).
  **`CollectibleStar` has two states**, because "is collectible" and "you already own
  this one" are different facts and the second is what you want while picking: lucide
  **`Star`** = collectible you have not collected, **`Check`** = already in the album.
  Same disc, same tier colour, same size - only the glyph changes, so rows never reflow.
  **Keep the two glyphs different shapes:** `StarCheck` was tried for the owned state and
  differs from `Star` only by a small tick off the lower-right point, so at badge size the
  two states were indistinguishable and it took an 18px disc to make the tick survive at
  all. A plain check reads instantly at 15px, which is why the disc matches every other
  list again. Anything star-shaped for "owned" brings the problem back. Deliberately
  binary: holding duplicates reads as owned, and the duplicate pool is on the album
  screen. `App` derives `ownedStickerIds` from `stickers.album.collected` and passes it to
  `SquadPanel`, `BudgetMarket` and `XiTable`. **Keyed on player id, never `personId`** - a
  sticker is per version of a person, so Cristiano Ronaldo 2014 can show a tick while his
  2018 card still shows a star. The read-only `/squads` browser deliberately keeps the
  plain star: it is a reference view over the whole dataset, not a surface you pick from. **Swap**
  (`SWAP_PLAYER` reducer action):
  only **collectibles** can be swapped in, and only **`INITIAL_SWAPS` (2) per run**
  (`swapsLeft` in state, shown in `SquadPanel` and reset with the run). When a
  collectible is selected, filled slots it's eligible for become swap targets on the
  `Pitch` (amber ring + swap glyph); swapping frees the outgoing player's `personId`
  and uses the incoming one. The occupant rule: a collectible may swap into a filled
  slot when the occupant is a **different** person and the collectible isn't already
  in the XI, **or** the occupant is the **same** person as a different card (upgrade
  a version in place - e.g. Buffon 88 -> Buffon 90; only that person's own slot lights
  up, so no one is ever duplicated). `App` computes the set of swap-eligible drawn
  players (`swapEligibleIds`) and passes it to `SquadPanel` (so a used person's better
  version is still pickable); the same collectible/occupant/`swapsLeft` checks are
  enforced in `Pitch` and the `SWAP_PLAYER` reducer case.
- **Start over** (`StartOverButton`): rendered inside the `SquadPanel` box footer during
  the draft, below the re-roll/swaps count; with an inline confirm it runs `handleReset`
  (drops every chosen player, back to setup).
- With **`FEATURES.stickerAlbum` = false**: no album route/entry, no markers, no swap,
  no overlays, and no album localStorage reads/writes; the game is unchanged.

## Cup Run + Career (prototype)

A roguelike layer over the core loop, plus a persistent career - and since 2026-08-21 the
only way the game is played, so it is no longer behind a flag (`FEATURES.careerMode` was
deleted with the plain World Cup it used to gate). Design:
`docs/roguelike-career-design.md`.

- **Cup Run** (`domain/run.ts`, route `/cup-run`, `CupRunScreen.tsx`): build your XI the
  normal way, then pick the **"Start Run"** CTA on `CompletePanel` (see "Play mode"
  above). The career hub (perks/trophies) is the **Career tab**, `/career`; the "Cup Run
  career" card that used to be its door went with the navigation rework. The run is a state
  machine - `beginRun` -> `playGroupStage` -> `chooseBoon` ->
  `playKnockoutRound` -> ... -> ended (`champion` or knocked out) - reusing the real
  group/knockout sim (opponents drawn elo-weighted, excluding the group teams). Between
  rounds you pick 1 of 3 **boons** (`domain/boons.ts`, 32 of them): rating tweaks (Golden
  Generation, Catenaccio, Second Wind, ...) and roster swaps (Transfer, Poach the next
  opponent, Wildcard Legend).
  **Balance (reworked 2026-08-15).** A boon is worth what it moves the two numbers the
  sim reads: the AVERAGE of the attack group (MID/FWD) and of the defence group
  (GK/DEF). +6 to one attacker is +1 attack, not +6. Its budget is the SUM of both
  movements, so Golden Generation (+2/+2) costs 4 and a common giving +2 to one line
  costs 2, half of it. Bands are **common 2.0, rare 3.2, legendary 4.5**, and
  **`npm run checks` prints every boon's figure and fails on an overspend** (12
  budget-built sample XIs x 20 applications each, with `Math.random` **seeded** for that
  block: averaging alone left legends-reunion close enough to its band to cross it about
  one run in three, and a randomly-failing assertion is worse than none. The verdict is
  taken at the precision the bands are written in, 0.1, so a boon has to read 4.6 against
  4.5 to fail rather than losing on a third decimal). Boons that
  give points back (Catenaccio, Sold Out Stadium) or hang on the draw
  (Underdog Spirit, Underdog's Purse, Poach, Kind Draw) are exempt and marked as such.
  **A condition the player controls at build time is not allowed:** the old Chemistry
  Catalyst ("+2 to your most-represented nation") was a legendary effect at common
  rarity, since a single-nation XI is trivial to buy in the transfer market and the
  chemistry bonus already rewards cohesion. It became Familiar Foes, keyed to the draw,
  which was itself removed on 2026-08-23.
  Mind the rating cap too: "+N to your best player" does nothing once they are at 99, so
  the check measures against a budget-built XI (~81), not a national side's best eleven.
  **UI term:** the code says `boon`/`Boon` but the user-facing copy calls them "boosts" (and
  the `extra-boon` perk is shown as "Extra Choice") - "roguelike"/"boon" are too niche for
  players, so keep them out of visible strings, like elo -> "rating". A live **title-odds %**
  readout uses `domain/odds.ts`. Chemistry is recomputed live per XI (`run.ts` `chemistryOf`),
  so roster boons don't leave it stale. The drafted XI enters via the reducer's `AUTOFILL`;
  each "New run" re-drafts fresh.
- **Live match playback.** Matches are revealed with the same live clock + goal feed as the
  main game, not resolved instantly. `run.ts` splits into `prepare*`/`play*`: `prepareGroupStage`
  and `prepareKnockoutRound` simulate up front and return both the committed `next` RunState and
  the match data (events, shootout); `playGroupStage`/`playKnockoutRound` (kept for the checks
  harness) just return `next`. `CupRunScreen` reveals the three group matches one by one, then the
  knockout tie, via a keyed `LiveCupMatch` (shared `useMatchClock` + `MatchdayCard`), committing
  `next` when the reveal ends. A **Speed** control (shared with the game's `speed`) sets the pace.
- **In-run layout.** The group table and the bracket say which round this is and how the
  earlier ones went; a `RunLadder` used to sit up top saying the same thing again, and was
  deleted 2026-08-21. What survived it is `RoundReview`, opened from the tree's own played
  cells (see "Runs as tournaments" below). `CupRunScreen` owns `reviewIndex` (null = live) +
  `currentRoundIndex`, and snaps back to live when the run advances (effect on
  `currentRoundIndex`). A review shows the **boost taken after that round**
  (`RoundRecord.boostId`, see below): a KO review re-renders the finished match card
  (`FinishedKoCard`, from the record's stored `events`/`pens`/ratings) + the boost; the
  group review shows the finishing position + its three matchday scorelines
  (`RoundRecord.groupResults`) + the boost - all from `RunState.history`. The career hub
  collapses to a slim strip with a chevron during a run (shown in full
  only between runs). The XI panel lists **active boosts** as chips and tags players a roster boost
  brought in (`RunState.boostedIds`, an amber "Boost" mark).
- **Boost pick flow.** A boost is picked right after each round's games (except the final /
  a group exit), so the shared `BoostOffer` (the 3 rarity-topped cards + a "Next: flag name
  **year** in round" line) shows in two places: on the **group-results screen** (the first
  boost, before the Round of 16) and, for later rounds, in the `boon` phase after a knockout
  tie. `chooseBoon` stamps the chosen boost onto the **most recent history record** (the round
  just played), so `RoundRecord.boostId` reads as "the boost taken after this round" - the group
  record carries the first boost; the final round carries none. The group-results screen shows a
  green/white **`RunBanner`** ("Through to the knockouts" / "Knocked out") + the reused
  `StandingsTable` (from the `group` `prepareGroupStage` returns) + the boost picker (advanced) or
  a Continue button (group exit). A finished knockout tie stays on screen (as `FinishedKoCard`)
  through the following boost pick, with a green `RunBanner` ("Won 2-1 · Through to the
  Quarter-final") between it and the picker, auto-scrolled into view (`boostRef` + effect on
  `phase === 'boon'`). Picking a boost fires a **toast** of what it did (a roster swap names the
  players in/out, e.g. Poach; otherwise the boost's description). The ended screen uses the same
  `RunBanner`: green for the cup win, flat white for a knockout loss / group exit. (There is **no
  run-log feed**: every per-round fact - match scores + goal feeds, results, the boost taken - is
  in the tree's `RoundReview`s, so `RunState` carries no narrative `log`.)
- **Runs are tournaments.** Roadmap item 28, option A: a run plays like a World Cup rather
  than like five ties in a row. It shipped behind a `stages` kickoff flag so the old
  five-ties shape could be compared against it; the flag, `RunState.useStages` and the old
  shape were deleted 2026-08-21, and this is simply how a run works. Three parts:
  - **The group draw**, then a live table. `GroupDrawReveal` (unchanged, `{userTeam,
    opponents, onContinue}`) opens over the reveal, and the matchdays do not start playing
    until it is dismissed. Behind it `StandingsTable` fills in as they land, plus the
    other group fixture of each matchday (`cupRun/OtherFixture`), which is what makes the
    table's movements legible - the data was always there, the run just threw half of it
    away.
  - **The table is PROJECTED, not simulated forward.** `prepareGroupStage` plays all
    three matchdays up front (it has to: the XI, its chemistry and the tally are settled
    in one pass), so the live table needs `groupAsOf(group, md)` from
    `domain/tournament.ts` - pure, blanks the later results, and `npm run checks` asserts
    both that the projection at matchday 3 equals the group and that results and points
    only accumulate.
  - **A real 16-team bracket.** Built when the group is survived, never before (there is
    nothing to seed it from until then): `bracketSeedFromGroup(group)` +
    `buildBracket(...)`, then the knockouts run on it. `RunState.bracket` stays
    optional because there is no tree during the group; after it, `prepareKnockoutRound`
    throws rather than falling back to a draw. The user's own tie is
    still `simulateKoTie` (so boosts, chemistry, the Ascension handicap and the difficulty
    setting all apply exactly as before) and its result is **spliced** into the tree by
    `advanceBracket`; the other ties resolve from their own ratings. `nextOpponent` stays
    the single field every consumer reads - including Poach and Kind Draw - it is just
    read off the tree now. Two invariants worth knowing: the user is always the **home**
    side of game 0 of their round (asserted, and `simulateKoTie` depends on it), and the
    bracket stores a snapshot of the user's team, so it is **refreshed each round** because
    boosts change the XI. A knockout loss still completes the tree, so a Cup Run crowns a
    champion the way a World Cup does.
  - **The tree is collapsed by default, and that state persists** (`cupRun/RunBracket`): a "Your path" accordion
    showing your own tie in each round - opponent, score, and which one is next - with the
    full 16-team draw behind a chevron. A tree that tall cannot sit above every screen of a
    run, and collapsed it also says what the ladder used to (which round is this, how did
    the earlier ones go), which is why the ladder went rather than sitting beside it. On a
    phone the path is rows rather than five columns, and it lists only the rounds actually
    reached plus a one-line "QF, SF, Final to come" - five rows of "not reached" is most
    of a phone screen, which is the height the control exists to give back. Opening it
    swaps in the shipped `<Bracket>`, which already has its own two-sided phone tree.
    Open/closed is `Settings.showFullDraw`, a **persisted preference** rather than component
    state: a run spans many navigations, and re-collapsing on every return made the chevron
    something you re-opened rather than something you had set. It is not on the run (a viewing
    preference should not reset every run) and not a control in the settings sheet (the chevron
    is its control). `App` owns it via `useSettings` and passes it to both `CupRunScreen`
    mounts; the component is controlled.
  - **A tie you played opens its round review** (2026-08-21), collapsed or expanded - one
    gesture either way, which is the point: the first version only wired the collapsed path
    cells, so the review vanished exactly when you opened the bracket to study it.
    Collapsed, `RunBracket`'s path cells are the buttons; expanded, `Bracket` takes
    `reviewableRounds` + `onOpenReview` and the **game box** is. Either way a click sets
    `CupRunScreen`'s `reviewIndex` (round `r` -> index `r + 1`), swapping the content column
    for the same `RoundReview` the ladder's steps used to open: the tie's goal feed, how it
    was decided, and the boost taken after it. Four things keep it honest:
    - **Reviewable = a history record exists**, which is why the live round never steals its
      own view (a record is written as `koRound` advances, so the round on screen has none -
      except on an ended run, where reviewing the last tie is the point).
    - **Only YOUR ties can be reviewed**, and that is a data fact rather than a choice: a
      `RoundRecord` is written per user tie, while the other 14 teams' games resolve from
      their ratings and store a scoreline and nothing else. In the tree the test is
      `BracketGame.hasUser` **and not the game index** - once the user is knocked out the
      rest of the tree is simulated, so game 0 of a later round is somebody else's.
    - The set is emptied **while a match is revealing**, as the ladder was `locked` for the
      same reason (the live playback is not persisted, so leaving loses it).
    - The collapsed cells hide themselves while a review is open, so the two never stack.
    A game box turned button keeps `.bkt-match` exactly (`button.bkt-match` in `index.css`
    only undoes the browser defaults and adds hover/focus), because the tree's `::after`
    connectors are positioned off that box - give it its own element and they drift.
    **The GROUP leads the path** (`cupRun/GroupCell`, wired 2026-08-22, which closes item
    28): the tree has no box for it - a `BracketGame` is a knockout tie - so its review
    (finishing position, the three matchday scorelines, the first boost) had no door at all,
    and `reviewIndex === 0` plus `RoundReview`'s whole `stage === 'group'` branch were dead.
    The cell is `reviewIndex = 0`, and three things about where it sits are deliberate:
    - **Above the path, not a sixth column.** At `sm` the five knockout cells already rely
      on truncation, and a sixth would have squeezed them ~17% narrower for a cell that
      needs no flag and no scoreline (the finishing position is what a group decides). It
      also means the phone layout needed no decision: one row, always relevant, where five
      rows of "not reached" were the thing that layout exists to avoid.
    - **Visible in BOTH states**, collapsed and expanded, which is the whole reason it is
      not inside the collapsed-only grid. Wiring only the collapsed cells is exactly the bug
      the knockout ties had to come back for - the review vanished the moment you opened the
      tree to study it.
    - **Mounted standalone on a group EXIT**, where `run.bracket` is undefined and so there
      is no `RunBracket` to lead. The run ENDS in the group there, so without it the summary
      went unreachable again as soon as you navigated away from the results screen and back.
      Same component, second mount point; the guard is `!run.bracket && groupRecord`.
    Do not delete the group's `RoundRecord` fields: `domain/challenges.ts` reads
    `groupResults` and `groupPos`, and the group-results screen reads the record for its
    banner. Note the record is written when the reveal COMMITS (the boost pick, or the exit
    screen's Continue), not when the third matchday lands, so the cell appears with the
    committed run and never over a group still in flight.
  - **No pre-run screen, and no ladder.** Three follow-up changes (2026-08-21):
    **Ascension is picked on the build page** (`App` holds the tier and mirrors it onto
    the career's `lastAscension`, which is where the run already read its default from - so
    nothing new reaches `beginRun`). It went into `SetupPanel` beside formation and style,
    and **moved again on 2026-08-25 to the LAST step before kickoff** - see the
    `AscensionPicker` note under "UI gotchas"; **"Start run" goes straight into the draw**,
    which is the one to read the note below about; and
    **`RunLadder` is gone**, because the group table and the bracket already say
    which round this is and how the earlier ones went. `RoundReview` stayed, though: the
    tree's own cells open it now (see above).
  - **The kickoff is REQUESTED, never inferred** (`nav/pendingRun.ts`), and the first
    version of it lost runs. It started a run whenever `/cup-run` was reached with none in
    progress - which is the same shape as a reload, a Back navigation, a bookmark, a tab
    tap, or a save that has not landed. The reported bug was the signed-in case:
    `remoteStore.finishRun` sets `run: null` (the server clears `active_run` at run end),
    so after a run finished a **reload silently drew a fresh group** over the screen still
    showing the old one. A guest never saw it, because the local `finishRun` leaves the run
    in storage. So the build page's Start Run now calls `requestRunStart()` and the effect
    only fires on `consumeRunStart()`. **Module state, not `location.state`:** router state
    lives in `history.state`, which survives a reload, so it would reintroduce the bug it
    was meant to fix. Arriving without a request and without a run falls back to the
    pre-run card - the "Play group stage" button, minus the ladder and the Ascension picker
    that moved - so nothing is a dead end and nothing starts on its own.
  - **The trap that would have gone unnoticed:** `buildBracket` drew its 14 open seeds at
    the default weighting, so Ascension's `drawSlopeBonus` - half of what a tier means -
    would have done nothing. It now takes the slope as an optional last argument (the
    World Cup passes none). `npm run checks` measures the field: drop the slope and the
    check fails with Base 81.3 against V 81.3.
- **Persistence** (`state/runStorage.ts` key `wcsim_run_v1`): the in-progress run is mirrored to
  its own key, so a refresh mid-run resumes it (the transient live-reveal is not persisted, so a
  refresh mid-reveal just replays the current match). It is cleared when a fresh XI is built
  (`handleReset`/`handleStart`/random team/budget confirm), so a stale run never resumes onto a
  new team.
  **Every roll is on the RUN; only playback is transient. A RELOAD MUST NOT RE-ROLL
  ANYTHING** - otherwise reloading until you win is the optimal way to play, and it also
  re-rolls the boost offer that the Physio Table perk charges Prestige for. The reveal is
  a playback pointer and nothing may live there alone: a guest's reveal is mirrored to
  `wcsim_run_reveal_v1`, but `remoteStore` keeps it in memory only and returns
  `reveal: null` from `load()`, so for a signed-in player it does not survive a reload at
  all - a reload dropped back to the "Play ..." button, which prepared the round again
  from scratch. Three fields now hold what each stage has decided, all optional (a run
  saved before them decides at its next play, as it always did) and all cleared on the
  state that commits the stage, so none outlives the stage it belongs to:
  - **`RunState.group`** (`GroupState`) - the drawn, fully played group, held from the
    draw until the group is left. Was the reported bug: a reload drew three new opponents
    over the group in progress.
  - **`RunState.groupExit`** (`GroupExit`) - what SURVIVING the group decided: the 16-team
    tree, the first boost offer, the R16 opponent. Set only when the group was survived.
  - **`RunState.koPending`** (`KoPending`) - the whole knockout round: the user's tie
    (scoreline, goal events, shootout), the rest of the round on the tree, and the offer +
    next opponent that follow it. Keyed on `round` as belt and braces.
  The dice are thrown in exactly two private helpers, `decideGroupExit` and
  `decideKoRound`; `prepareGroupStage` / `prepareKnockoutRound` skip them when the field
  is already there and otherwise derive `next` from it, which is why the group's two
  return branches collapsed into one. Both return **`current`** - the run with the
  decisions recorded, the identical object on a resume so a replay writes nothing - and
  every call site holds it. Anything new that is random and outlives one function call
  belongs in one of these three, not in the reveal. `npm run checks` asserts the lot
  (recorded, identical across a second prepare, dropped on commit); breaking the reuse
  fails three checks.
- **Stickers.** At a run's end the final XI's collectibles are banked to the album, guarded
  once-per-run by `RunState.stickersApplied`. **Players a roster boost handed over earn
  nothing** (`RunState.boostedIds` is passed to `onCupRunEnd`, which subtracts them): Legends
  Reunion deals from the 93+ pool and Wildcard Legend from 90+, so otherwise a boost was a cheaper route
  into the album than winning with the XI you built. `CupRunScreen` reports the end via
  `onRunEnd`; `App` applies them (a loss banks immediately; a cup win shows `CupRewardPicker`
  first), then the shared `RunEndStickerSummary` shows any new cards. Reload-safe via the flag.
- **Career** (`domain/career.ts`, `state/careerStorage.ts` key `wcsim_career_v1`):
  a run awards XP (-> levels, `XP_PER_LEVEL = 200`) and Prestige, spent in a perk shop of
  six tracks (Scout Network, Deep Squad, Extra Choice, Transfer Budget, Physio Table, Extra
  Re-roll) that feeds the next run. **Perks are tiered and level-gated**, not one-off buys:
  each track has two steps except Transfer Budget's nine, every step costs Prestige and
  carries a `levelReq`, so a level is a gate rather than a decoration. The shop is
  data-driven off `PERKS`, so a new perk or tier appears by being added there; what needs
  wiring is only its effect. A trophy record (runs/cups/best) sits in
  the `CupRunScreen` hub. Separate storage from the game + album.
  **Two perks reach outside the run**, both read in `App`:
  `transfer-budget` -> `BUDGET_BY_TIER` -> the
  market's budget (nine tiers, $70 to $160; tier 9 was added 2026-08-23 as the endgame
  rung, gated at **level 40** - above every other gate in the game, the Ascension ladder
  included - and priced at 520 on the track's own curve). `npm run checks` asserts the
  ladder matches the perk track in length, that it rises, and that **the dollar figure the
  shop copy promises is the budget that tier hands out**: the dollars live in `config.ts`
  and the sentence in `career.ts`, so adding a tier to one and not the other would read as
  a shop that lies. The other outward perk is
  `extra-reroll` -> `extraRerollsOf` -> `START_DRAFT`'s
  `extraRerolls`, which sets `rerollsLeft` to `INITIAL_REROLLS` + the owned tier (so
  tier 1 is a 4th re-roll, tier 2 a 5th). The reducer knows nothing about the career,
  hence the number being passed in; `npm run checks` asserts the two stay in step,
  including that the shop copy's ordinal matches the resulting total.
  Rebalanced 2026-08-15: Deep Squad stops at +2 (a permanent +3 to the whole XI beat
  every legendary boon and never wore off), Scout Network's free starting boosts draw
  from **commons only** (a free legendary before kickoff outweighed every in-run
  choice), and **Physio Table** re-rolls a boost offer once or twice per run
  (`rerollOffer` in `run.ts`, `RunState.rerollsLeft`, the control lives in `BoostOffer`).
- **Cup-win confetti.** A Cup Run that ends as `champion` rains the shared `Confetti`
  (same self-contained canvas as the main game; `run?.outcome === 'champion'` in
  `CupRunScreen`), layering above the cup-win reward picker like the standard game.
- **Ascension** (`domain/ascension.ts`) is the run's difficulty ladder, chosen per run:
  Base plus five tiers, each handing the user a rating handicap in **their own** matches
  (0 to -10, the same lever as the difficulty setting), steepening the knockout draw toward
  stronger squads, and multiplying the run's XP + Prestige (1.0 to 2.25). A tier unlocks by
  winning a cup at the tier below **and** reaching its `levelReq` (1/3/6/10/20/30), so the
  ceiling is earned twice over. `run.ts` applies the levers; `career.ts` keeps the unlock
  and the reward multiplier. Not to be confused with `domain/difficulty.ts`, the player's
  own casual/normal/hard **setting** (+3/0/-3 to the user's attack and defense, nothing
  else), which is orthogonal and applies in both modes.
- **Prestige also unlocks boosts.** 10 of the 32 boons are `starter`s; the rest are bought
  into the offer pool with Prestige (`BOON_UNLOCK_COST` common 15 / rare 30 / legendary 55,
  `unlockBoon`, the pool shown in `CareerHub`), and `availableBoons(unlockedBoons)` is what
  an offer draws from. So Prestige has two sinks, perk tiers and boost unlocks, and
  challenge awards are its second faucet.
- **An offer never contains a card the run already holds** (`offerPool` in `domain/run.ts`,
  decided 2026-08-23, roadmap 32). Before it, a card came round again on 3.7% of offer
  slots and landed one of three ways, two of them bad: it **stacked**, sometimes
  multiplicatively, since `xpMult` compounds (Sponsorship twice was 4x XP, Ice Veins twice
  +16 to the takers) which is a lever no card was priced against; or it did **nothing at
  all**, since Mortgage the Future, Youth Development and All or Nothing are booleans and
  Double Print is a `Math.max`, so a second copy was a wasted pick at a stop that comes
  round four times in a whole run. The third way was legitimate (a second Poach is another
  player) and goes too, knowingly: one rule beats three special cases. Read
  **`activeBoons`**, which is everything APPLIED, so the free commons Scout Network and
  Youth Development deal at kickoff are excluded as well - being offered a card you were
  already given is the same dead slot. A card parked in `pendingChoice` is not excluded
  until `resolveChoice` commits it. All three offer sites go through the helper, the
  Physio Table reroll included, and `npm run checks` asserts every one of them. **The pool
  has no margin left**, which is worth knowing before deleting another starter: the thinnest
  a real career reaches is **10** starters with the widest offer (Extra Choice tier 2) and
  Scout Network tier 2, and the last stop of a run then draws 5 from exactly 5. It fills, with
  zero to spare - it was one card until Ice Veins (a starter) was deleted on 2026-08-23.
  `offerBoons` clamps rather than throws, so going short would quietly narrow the choice
  instead of failing; `npm run checks` watches the figure.
- Known gaps (prototype): the layer is deeper than it looks from `CareerState` alone, but
  Ascension's tuning is a first pass (`ASCENSIONS` is marked tunable, and the odds sim in
  `domain/odds.ts` is the tool for it), and level does nothing beyond gating.

## Boosts: the catalogue, and the levers beyond the rating average

32 cards in `domain/boons.ts`. The thing to know before adding one: **for a long time all
of them sat on one axis** - every card was "+N to some subset of the XI" - which is what
made an offer of three a sum rather than a choice. Roadmap item 29 is the correction, and
its first six cards shipped 2026-08-22.

- **A boon declares `effects: BoonEffect[]`**, a LIST, because a card can do two things at
  once (Mortgage the Future raises the XI *and* mortgages the payout). Three kinds:
  `rating` (a plan, recorded in the effect ledger), `roster` (rewrites the base roster), and
  **`run`** (a `RunModifier`, interpreted by `domain/run.ts`).
- **`RunModifier` is plain data on purpose.** The catalogue says what a card MEANS without
  importing the run's state machine, which would be a cycle. Adding a lever is a case in
  `boons.ts` and a case in `applyRunMods`.
- **A `RatingPlan` can carry its own window** (`lasts`, `startsIn`), which is what makes
  "+6 now, -6 next round" expressible. `effectsFrom` turns those into the ledger's
  `appliesFrom` / `expiresAfter`.
- **`START_ROUND` is 0, and used to be -1, which was a real bug.** `koRound` does not
  advance when the group is committed - it is 0 through the group AND the Round of 16.
  `beginRun` derived its XI at -1 while storing `koRound: 0`, so a Scout Network boost with
  a duration **expired before the first ball was kicked**. Any round number used to grant an
  effect has to be the one the run will actually be read at.
- **`recomputeXi` must run AFTER `koRound` advances**, in `prepareKnockoutRound`. That is the
  only transition that moves the round on, and it is what makes a window open and close at
  all.

### The six cards on new levers (2026-08-22)

**Ice Veins (the shootout) was DELETED 2026-08-23** by decision, not for any measured fault -
it did exactly what it said. **The lever it was built on is deliberately kept:**
`userGroupTeam` still takes `penBonus`/`penBonusTop` as arguments SEPARATE from the chemistry
and difficulty deltas, precisely because those reach `strength` and a shootout bonus must not
(it cannot move a scoreline, only the shootout after one). Same reasoning as
`RunEffect.expiresAfter`: the seam is the point, and a shootout card or perk is the obvious
next user (`docs/perk-ideas.md`). It now has **no caller**, so `npm run checks` asserts it
directly rather than through a card - otherwise deleting the last caller would have left the
whole lever untested. It was also a STARTER: see the pool-margin note above.

| Card | Lever | The point |
| --- | --- | --- |
| **Kind Draw** | the draw | Re-draws the next opponent and keeps the weaker. **The run and the TREE must move together** - `run.nextOpponent` is what the tie reads, but `prepareKnockoutRound` splices the result into the bracket by `opp.id`, so moving one and not the other would play a team the tree does not show. The substitution is the away seed of game 0 (the user is always home). Fires ~53% of the time, softening the opponent by ~5 rating. |
| **Second Wind** | time | +4 to the XI for one round. Rare, not common: measured at 9.9 against a common's 2.0, because for the round it lasts it is worth twice a legendary. |
| **Sold Out Stadium** | time | +6 now, -6 the round after. **Known hole: taken before the Final it is free**, because there is no round after. Left as-is deliberately rather than silently redesigned; the fix is either not offering it in the last round or moving the debt. |
| **The Coin Toss** | variance | +8 or -4, **derived** from the XI and opponent via `coinFor`, never rolled. A pick-time `Math.random` would be re-rollable by reloading, and for a 12-point swing that is the whole card broken. ~48% heads over 200 draws. |
| **Mortgage the Future** | the payout | +4 to the XI, and the run pays **no XP or Prestige at all** unless it wins the cup - not even the floor of 1 Prestige every other run gets, which is what makes it bite. The only card whose cost lands on the career rather than inside the run. |

### Three more (2026-08-22, later the same day)

| Card | Lever | The point |
| --- | --- | --- |
| **Away Days** / **Man-Marking** | the OPPONENT | -5 to their defence / -5 to their attack. A pair on purpose: which you want depends on whether this tie is one you expect to win by scoring or by holding out. Applied to the opponent OBJECT, not at simulation time, so the "next up" line, the bracket seed and the round record all show the numbers the tie is actually played on - a debuff the sim sees and the screen does not is a lie. "This tie only" comes free: `facedIds` means a team is played once. `overall` moves by the share of the XI touched (attack averages ~6 players, defence ~5), never by the raw delta. |
| **Double Print** | the album | A cup win picks **two** stickers. `finish_run` takes one `cupPickId`, so the second rides along in `collectibleIds` - the path `remoteStore` already uses when the server refuses a duplicate pick. The server caps a run at `BANK_CAP` ids and rolls the whole bank back over it (the blocking unreachable screen for an account), so `useStickerAlbum` trims surplus picks under it. That constant lives in `config.ts`, and **the server reads it rather than stating its own** (migration **0015**, roadmap item 37, applied 2026-08-26): the generated seed carries it into `economy_constants` beside the trade costs and the swap cap, and `finish_run_v2` coalesces it there with the client's figure as the fallback, so the order of "apply the migration" and "push the seed" does not matter. It was the LAST number each side stated on its own, and `npm run checks` now holds three things instead of one: that the seed sends it, that every fallback is the client's figure, and that the newest migration's cap test reads the constant rather than re-inlining a literal. Eleven collectibles in one XI is out of reach, so that trim is a backstop, not a behaviour. The picker counts "Pick 1 of 2" and drops what was already taken, or a second pick could repeat the first. |

### Four more (2026-08-22): the dataset, the run, the career, and a question

| Card | Lever | The point |
| --- | --- | --- |
| **Prime Years** | the dataset | Every player becomes his own best tournament, walking `personId` (which links the same human across cups and which nothing else reads). The SLOT is preserved (`{...best, positions: p.positions}`) or the formation and the chemistry "in position" count go wrong. |
| **In Form** | the run's history | +12 to the leading scorer THIS RUN, read off `RunTally`. A legal no-op before the first goal. |
| **Old Guard** | the career | The career's all-time top scorer joins. Snapshotted onto the run at kickoff (`Kickoff.careerTopScorerId`) because `domain/run.ts` never sees a `CareerState`. Legendary, like Wildcard Legend: adding one strong player is the same shape and size. |
| **The Armband** | **the player** | Name a captain: +6 to him, +1 to the rest. **The first card that asks a question.** |

**`boostedIds` had to become a list, and this was a real exploit.** `grantBoon` recorded only
the FIRST incoming player, which is all a one-for-one swap has - but Prime Years swaps up to
eleven, so ten upgraded (usually 90+) players would have banked as stickers. That is exactly
the hole `boostedIds` exists to close. `Granted.incomingIds` now carries every arrival;
`swappedIn`/`swappedOut` stay for the toast.

**A card that asks a question does not commit the stop.** `Boon.choice: 'player'` makes
`chooseBoon` park `RunState.pendingChoice` and leave the phase at `boon`; `resolveChoice`
applies it. On the run rather than in the component, so a reload lands back on the question
instead of losing the card. `CaptainPicker` replaces the offer while it is parked, and has
no cancel on purpose: backing out would let a player price the card against every member of
the XI and then take a different card, which is the offer re-rolled for free.

**The balance harness now hands every card a FIRING context** (`topScorerId`,
`careerTopScorerId`, `chosenId`). Without it a conditional card measures 0.0 and goes
unbanded, which is exactly the way to smuggle an over-band card into the pool - and it
immediately caught two: The Armband at 3.3 against a rare's 3.2 (now +6, not +8) and Old
Guard at 4.8 (now legendary).

### Three more (2026-08-23): a position, the run's history, and a temporary person

| Card | Lever | The point |
| --- | --- | --- |
| **Full-Backs** | the POSITION | **DELETED 2026-08-23.** +8 to the left-back and the right-back, and the only card that ever read the twelve positions rather than the four categories. It shipped on the claim that every formation plays both, so it always finds its two players; **that was wrong** - every 3-4-3 and 3-5-2 plays three centre-backs and wide midfielders, so **6 of the 24 formations have no full-back at all** and the card did nothing in them: a dead slot in every offer, for a paid rare. Retargeting it was possible and cost something either way (widening it makes "left-back and right-back" mean something else; moving it to the flanks puts +8 on MIDfielders and needs re-banding), so it went the way the three dominated cards went. Roadmap 32. |
| **Underdog's Purse** | the run's HISTORY | +2 to the XI for every round the user went in as the lower-rated side. `BoonContext.underdogRounds` is counted off `run.history`, and the **group is excluded for free**: only a knockout `RoundRecord` carries `userRating`/`oppRating`, so the filter never has to know about stages. Legendary and exempt, for the reason Underdog Spirit is: the draw decides it. |
| **Loan Deal** | **a temporary PERSON** | Borrow the next opponent's best player for one round; he goes back when the round advances. See below - it is the one that needed machinery. |

**Loan Deal is the first temporary ROSTER change.** The effect ledger has always handled
temporary ratings (`lasts`, `startsIn`) and has never handled temporary people, so the run
records the loan on **`RunState.loan`** (`{returning, borrowedId, untilRound}`) and
`prepareKnockoutRound` undoes it in the one transition that moves the round on, just before
`recomputeXi`. Four things about it:

- **It is two effects, in order.** A `roster` effect picks and swaps exactly as Poach does,
  so every existing rule comes free (no duplicated `personId`, the outgoing slot preserved,
  the arrival tagged in `boostedIds` so a borrowed player banks no sticker). A `run` effect
  then only RECORDS that the swap was a loan, reading the pair the first half produced.
- **`commitBoon` had to be restructured.** `applyRunMods` used to run over the run as it
  arrived and then have `roster`/`effects` written over the top, so a modifier that changed
  the roster would have been silently overwritten. It now runs over the MERGED state, and
  takes `granted` so the loan can read `swappedIn`/`swappedOut`.
- **It is a COMMON STARTER and Poach is the rare**, which is a balance reading rather than a
  taste: the table measures the two at 4.0 and 3.9, so at the same rarity this would have
  been Poach with an expiry date - a strictly dominated card. As a common it is the cheap
  version you have from run one, and Poach is what you unlock to keep him.
- **It only fires on a real upgrade** (`inP.elo > out.elo`). Their best is not always better
  than the player he would displace, and a boost that weakens the XI for a round and then has
  to be undone is the worst of both halves.

**A neighbouring bug went with it: Scout Network dropped a starter boost's `run` modifiers
entirely.** `beginRun` kept `granted.roster` and `granted.effects` and threw `granted.mods`
away, so a free Ice Veins at kickoff did nothing at all (that card is gone, but the bug was
never about it - any common whose effect is a `run` modifier rather than a rating plan was
silently free). The mods are collected and applied
to the finished state now. The ones that need an opponent still correctly no-op there: there
is nobody to weaken or re-draw before the group.

### One more (2026-08-23): the damage

| Card | Lever | The point |
| --- | --- | --- |
| **Siege Mentality** | goals CONCEDED | +1 to the XI for every goal conceded this run, group included. The first card that pays a run going badly: every card in the pool is taken at a stop and you only reach a stop by going through, so the whole catalogue is priced for a run that is winning. `goalsConcededOf` reads both halves off `run.history` (a knockout record's `oppGoals`, a group record's three matchday scorelines), and **a shootout is excluded by construction** - kicks live in `KoMatch.pens` and never in a scoreline, which is the rule the whole codebase keeps. Legendary and exempt, like Underdog's Purse: matches already played decide it. |

**+1 a goal, not +2, and that is the balance point rather than a rounding.** An XI could in
principle be built with a deliberately poor defence to farm it, which is the "condition the
player controls at BUILD time" trap. It is not a real exploit at +1 - the XI still has to
survive the group, the card still has to be offered, and the points come back to the whole
XI rather than to the line that gave them away - but at +2 it would have been one.

### Three more (2026-08-23): the payout

Mortgage the Future used to be the only card whose cost landed on the CAREER rather than
inside the sim. These are the other three levers that payout exposes, and all three read
0.0 on the balance table by construction, so they carry their own assertions instead.

| Card | Lever | The point |
| --- | --- | --- |
| **Sponsorship** | the LEVEL | Double XP, Prestige untouched. The only card that touches the one thing Prestige cannot buy: the dearest perk tiers are level-gated and challenge awards grant no XP, so playing is the only route through. It does nothing at all for the round in front of you, which is what makes it a decision. Common starter. |
| **Youth Development** | the NEXT run | This run pays no Prestige; the next one starts with an extra boost. Banked as `CareerStats.bonusStartBoosts` and spent by the next `beginRun`. |
| **All or Nothing** | the LAST GAME | Triple payout on a cup, nothing at all on a lost FINAL, and every other exit pays exactly what it would have. Mortgage the Future with the failure narrowed to one round. |

**The four payout cards are resolved in one place** in `applyRunResult`, because they
compose: `paysNothing` (Mortgage on any non-cup, All or Nothing on a lost final),
`payoutMult` (3 on an All or Nothing cup), then `xpMult` and `youth` as the two opposite
halves - one multiplies the XP and leaves the wallet alone, the other empties the wallet
and leaves the XP alone. A run carrying both bets pays nothing if either says so.

**`bonusStartBoosts` is on `CareerStats`, not `CareerState`**, which is the same trick the
challenge counters and the run archive used: `save_career` persists `stats` as one merged
jsonb column and silently drops top-level keys it does not know, so a new field there
survives a signed-in save and a new field on `CareerState` would not. It needed no SQL.
The grant is **spent in `CupRunScreen.startAndPlayGroup`**, which clears the counter in the
same career write that remembers the Ascension tier, so a grant can only ever be dealt
once. It deals from **commons only**, alongside Scout Network's and for the same recorded
reason.

### Three cards DELETED (2026-08-23), and the test that picked them

The pool reached 37 and stopped growing. What came out was chosen by one measurable
rule rather than by taste: **a card you spend Prestige to unlock must not be worse than one
you already own for free.** A card nobody should rationally take is a dead slot in every
offer it appears in, which is the same reading that made Loan Deal a common rather than a
rare.

| Deleted | Cost | Beaten by | Why |
| --- | --- | --- | --- |
| **Set-Piece Drills** | 15 | Defensive Drills (free starter) | +2 to the outfield defenders against +2 to the defenders AND the keeper. The same card minus a player, measuring 10 against 12. |
| **Squad Rotation** | 15 | Veteran Core (free starter) | +4 to the two weakest, measuring 8, against +3 to the three lowest measuring 9. Same idea, same rarity, and the free one is bigger. |
| **Counter Attack** | 30 | Attacking Masterclass (free starter) | +8 forwards / -2 midfielders measures **1.6 attack**; a free common gives **2.0** with no penalty. A rare that costs 30 Prestige for less than nothing. |

Counter Attack read as Catenaccio's mirror and was not one: Catenaccio measures 14 and
genuinely reshapes the XI, while this measured 8 because a budget XI's forwards are already
its highest-rated players, so most of the +8 hit the rating ceiling.

**Kept deliberately: Star Signing** (+6 to your weakest), which looks like a junior Marquee
Signing and is one. It is a free STARTER, so it costs nothing to own and it is the small
early card a new career needs. The rule above is about PAID cards being worse than free
ones, not about small cards.

### Catalogue changes made at the same time

- **Removed: Glass Cannon and Familiar Foes.**
- **Marquee Signing retargeted** from the best player to the **worst**. On the best it was
  mostly wasted (a top XI's star is near the 99 ceiling, so the +12 evaporated) and it
  duplicated Galacticos.
- **Transfer requires a real upgrade**, at least `TRANSFER_MIN_GAIN` (8) rating points. The
  old rule was "any stronger player", which a 1-point swap satisfied and which read as
  broken.
- **Catenaccio's "Win it 1-0." dropped** from its description.

## The effect ledger

`domain/effects.ts`, the one piece of roadmap item 04 that survived it (the rest - Form and
the shop/event nodes - was built, played and rolled back; see the item and
`docs/run-nodes-plan.md`). It changes nothing observable and is load-bearing anyway.

- **A run holds `roster` and `effects`; `xi` is derived.** `roster` is who is in the XI at
  DATASET ratings, `effects` is what has been done to them, and `xi` is a **cache** rewritten
  by `recomputeXi` at every transition that touches either input. Before this, a boost was
  applied by REWRITING the players and nothing recorded what had been applied, so nothing
  could expire or be listed with its magnitude, and the run's ratings drifted from the
  dataset (which is why `basePlayer` exists for the challenge catalogue to work around).
- **`xi` stays a stored cache rather than being derived at each read**, so the ~40 existing
  consumers (the sim, `xiStrength`, `chemistryOf`, `domain/challenges.ts`, the sticker
  banking, every component) read `run.xi` unchanged. `npm run checks` asserts the cache
  agrees with `xiOf` at every phase of 40 runs, which is what catches a new transition that
  forgets to recompute.
- **`Boon.apply` is gone.** A boon declares `effect: { kind: 'rating', plan }` or
  `{ kind: 'roster', apply }`. A rating plan resolves to **concrete player ids at pick time**
  and is then frozen: "your weakest player" must mean whoever that was when the card was
  taken, and a plan re-evaluated on each recompute would let a later effect move the target.
  Freezing also reproduces the old interaction with roster boons exactly (a player swapped in
  afterwards is not retroactively bumped), and an orphaned id is a harmless no-op.
- **Effects fold IN ORDER, clamping at EVERY step.** Two mistakes are tempting and both are
  wrong. An **inverse transform** (subtract the boost back off when it ends) is unsound
  because `bump` clamps: a +2 on a 98 is really a +1. **Summing the deltas and clamping
  once** is also wrong: a base 98 with +2 then -3 is **96** the old way and 97 if summed. The
  checks assert that literal 96, because "simplifying" `xiOf` to a sum is the obvious next
  refactor and it would change the game quietly.
- **`RunEffect.expiresAfter` is what makes a temporary effect expressible**, and it is
  live: **Second Wind** and **Sold Out Stadium** both set it, through `RatingPlan.lasts` /
  `startsIn`, and `npm run checks` asserts the resulting windows. It was genuinely unused
  when the ledger landed - every boost was permanent then - which is why this entry used to
  say so, and it is the clearest case for the ledger having beaten the rewrite it replaced:
  the first card that wanted to wear off was a caller change rather than a redesign. (What
  WAS unused, a caller-level `expiresAfter` argument on `grantBoon`, was deleted 2026-08-24
  as hygiene H120 - `lasts` is the only route now.)
- `applyBoon()` in `boons.ts` is the MEASUREMENT path, reproducing the old behaviour for
  callers that want a resulting XI and have no run to record against. Only the balance
  harness uses it.
- **The regression test already existed.** The **boon-power table** `npm run checks` prints
  is byte-identical before and after the refactor, for all the boons of the day (19 then,
  32 now) - twice over, since
  it was verified again when the ledger was restored after the item 04 rollback.

## Challenges (flagged)

Permanent honours over a finished **Cup Run**: a catalogue of one-off goals, each worth
Prestige, giving the career layer something to aim at besides "earn Prestige, buy perks".
Plan: `docs/challenges-spec.html`; comp: `docs/redesign-2026/turf-flat/challenges.html`.
Behind **`FEATURES.challenges`** (and Career Mode, like the rest of that layer).

- **Everything is permanent.** Completable once each, never expiring, no rotation. The
  rotating "three at a time at a multiplier" layer the plan originally paired with this
  was split out to roadmap item 19 (daily challenges); it would read this same catalogue,
  which is why nothing here has to change for it. That decision is also why there is no
  build-page strip and no in-run chips: a chip row works over a handful of targeted
  challenges, not over 130.
- **`domain/challenges.ts`** (pure): the model (`family`, `tier`, `check`), the
  130-entry `CHALLENGES` catalogue in 12 families, `viewOf` (derives the run once: the
  final XI at dataset ratings, the XI minus roster boosts, every match, goals for and
  against, clean sheets, boost rarities) and `completedIn(ctx)`, which returns the ids a
  finished run newly satisfies. `AWARD` is bronze 2, silver 5, gold 12, **sized by
  simulation** (2026-08-19, 16 careers x 150 real runs) against the anchor that decides
  it: the perk shop plus every locked boost cost **2525 Prestige** when it was sized (it
  is **3470** now, so the catalogue is nearer a fifth of the shop than a third - drift in
  the safe direction, since it makes runs a larger share of income; re-derive it rather
  than trusting this figure), and a run pays a
  median of 9. At 2/5/12 the whole catalogue is worth 779, about a third of the shop, and
  challenges are ~1/6 of a long career's Prestige, so runs stay clearly the primary
  faucet. For scale: 10/30/75 (the first guess) was worth 4705, nearly twice the shop and
  56% of all income, which is what kept the awards off; 3/8/20 was 1266, half the shop.
  If the numbers ever move, keep the property that **awards buy but do not gate**:
  challenge Prestige grants no XP, so the level requirements on the dearest perk tiers can
  still only be met by playing.
- **Awards always pay. `FEATURES.challengeAwards` is GONE** (deleted 2026-08-24, hygiene
  D1); `AWARDS_ON` in `domain/challenges.ts` is now a constant `true`, kept as a name
  because it marks which UI exists only to show an award (the catalogue rows, the hub card,
  the run-end list, the counter's Prestige cell). It was a flag from 2026-08-19, on from the
  day the numbers were sized by simulation, and it went because **it could not safely be
  thrown back**: the wallet is only credited by `applyRunResult` for the ids completed in
  THAT run, while `challengeProgress().prestige` reads every completion held, so cycling it
  would leave the display and the wallet disagreeing by exactly the arrears. A switch that
  cannot be thrown is not a flag. One thing to keep:
  - **The `+N` on a row is green only when the entry is earned.** Painting all 130 accent
    puts the ledger straight back to a field of colour, which is the one thing that layout
    exists to avoid.
- **A level gate was considered and rejected** (2026-08-19), on measurement rather than
  taste: opening the catalogue at level 3 sounds like onboarding, but level 3 arrives around
  run 8 while the first cup is won around run 4, so 14 to 16 careers in 16 win the cup
  before it opens and are paid nothing for it. It leaves the economy unchanged (24-26% at
  every gate from level 1 to 5) and permanently costs 2-4 suppressed challenges. If the
  onboarding worry returns, gate only the **reveal**: keep judging from run 1 and pay the
  backlog as one visible catch-up at the unlock (~240 Prestige over ~34 challenges at
  level 3), which loses nothing and makes the unlock a moment.
- **All 130 are judged.** The plumbing wave (2026-08-19, section 8 of the spec) cleared the
  27 that used to carry a `blocked` reason. No SQL migration was needed: `CareerStats` is a
  merged jsonb column and `RunState` a jsonb blob. `Challenge.blocked` stays in the DOMAIN
  model on purpose - it costs nothing and the next batch of entries will want it - but its
  **UI is gone** (deleted 2026-08-24, hygiene D6): the "not tracked yet" filter variant, the
  self-hiding chip, the self-hiding legend row and the lock rendering in
  `ChallengeLedgerRow` were all unreachable while nothing sets the field, in a screen whose
  whole premise is that 130 entries cannot each be painted. Re-add the UI with the entries
  that need it. What the wave added:
  - **`RunState.shape`** - formation, style and the slot each player filled, recorded at
    kickoff because placing a player promotes the slot's role onto him (so the natural
    position cannot be recovered from the XI afterwards) and a roster boost changes the XI
    later anyway. Natural positions come from `basePlayer`, never from the run's copy.
  - **`RunState.build`** - method, budget, spend, dearest player, how many were already in
    the album (and so discounted), re-rolls and swaps used. At kickoff for the same reason:
    the album grows, which moves the owned-sticker discount and therefore what the XI "cost".
  - **`RunState.chemistry`** - the kickoff bonus, of the XI that actually starts (a Scout
    Network roster boost is already in it). Not recomputed at run end, which would answer a
    different question.
  - **Ten `CareerStats` counters** for the streak entries: `cupStreak`, `finalStreak`,
    `semiStreak`, `lastOutcome` + `prevOutcome`, `everLostFinal`, `cupsByAscension`,
    `runsAtHighAscension`, `prestigeSpent` (incremented by `buyPerkTier` / `unlockBoon`),
    `cupFormations`. Updated in `applyRunResult` **before** `completedIn` runs, so a run
    completes the challenge it just satisfied. `prevOutcome` exists precisely because of
    that ordering: by judging time `lastOutcome` is already this run's, so Nearly Man
    ("lose a final, then win the cup") has nothing else to read.
  - All three run fields are **optional**, so a run persisted before the change resumes and
    finishes normally; it simply completes none of the new entries.
- **App computes the kickoff record**, since it is the only place holding the formation, the
  slot map, the market budget and the album at once (`draftedShape` / `draftedBuild` ->
  `CupRunScreen` -> `beginRun`). Two things to keep in mind there: the budget is chosen by
  `buildMode`, not the route, because the record is also read on `/cup-run` one navigation
  after the market closed; and `rerollsUsed` is re-derived as
  `INITIAL_REROLLS + extraRerollsOf(career) - rerollsLeft` (the plan's formula), so buying
  the Extra Re-roll perk mid-draft would read as one more used than there was.
- **The seam is `applyRunResult`** (domain/career.ts), which takes an optional
  `ChallengeInput` (`base`, `album`, `trades`) and returns `challengesCompleted` +
  `challengePrestige` alongside the XP/Prestige it always returned. Judged against the
  career **after** the run's XP/Prestige/stats land, so "win 10 cups" counts the cup just
  won. Without the input nothing completes, so the checks harness and any other caller
  are unaffected. `CareerState.completedChallenges` is the whole of the state.
- **Evaluation runs to a fixed point** (up to 4 passes), because a few entries count
  completions and Prestige themselves: the run that takes you past ten completions ticks
  Challenge Hunter in the same breath, and the awards of the same run can carry you over
  War Chest's 200 Prestige. Without that, those always landed a run late.
- **The four traps, each already a real bug here:**
  1. **Ratings are judged on the DATASET player.** `run.xi` carries boost deltas baked in
     (Golden Generation is +2 to the XI), so Rag Tag would drift with the boosts taken.
     `src/data/squads.ts` exports **`basePlayer`**, the single copy of that rule (the
     sticker album's private `BASE_BY_ID` now uses it).
  2. **The final XI is not the XI you built.** Roster boosts swap players in, and
     `run.boostedIds` separates them: the identity family judges `own` (the XI minus
     those) and imposes no count beyond it, so a Poach cannot break a themed run. "11
     different nations" is the exception, because there the count IS the challenge.
  3. **Shootout goals are not goals.** Clean-sheet predicates read the scoreline only, or
     The Wall would be unwinnable the moment a tie went to penalties.
  4. **The career counters predate the catalogue, so never key an entry to an exact
     lifetime count.** First Blood was `wonCup && stats.cups === 1`, which is unreachable
     on any career that had already won a cup before 2026-08-18: the counter is past 1 and
     only ever climbs, so the entry was locked shut by having played earlier. It is plain
     `wonCup` now, which says the same thing without reading a counter, because a
     completion is one-shot and permanent anyway. Thresholds (`>= 10`) are fine - they
     catch up on their own; exact equality on a monotonic counter is not. `npm run checks`
     asserts a veteran career still takes First Blood. The one place the pattern survives
     is **Straight Up** (`cupsAt(v, run.ascension) === 1`), where it is load-bearing rather
     than incidental - it is the only way to detect "this cup unlocked a tier" - and the
     cost is accepted: a tier already won before the catalogue existed cannot complete it.
- **Straight Up has no "did this run unlock a tier?" flag**, and the unlocked ceiling cannot
  answer it on its own: winning one tier below an already-unlocked ceiling leaves the same
  number behind. It reads `cupsByAscension` instead - a cup is the **first at its own tier**
  exactly when it unlocks the next, because reaching tier T at all means T-1 was already won.
- **Surfaces:** a Challenges block in the career hub (`CareerHub`: counter, Prestige
  earned, the three most recently completed, link to the catalogue), the **`/challenges`**
  route (`ChallengesScreen`, lazy-loaded: the album's completion counter, filters for
  available / completed, and every entry grouped by family), and the
  run-end panel listing what the run completed. Shared atoms live in
  `components/challengeUi.tsx` (family accents, `TierPips`, `ChallengeRow`,
  `ChallengeLedgerRow`).
- **The catalogue is a ledger, not a grid of cards** (2026-08-19, the "Ledger" option in
  `docs/redesign-2026/turf-flat/challenges-quieter-mock.html`). The rule it exists to keep:
  **130 entries cannot each be painted.** The card version spent a family hue, a filled tier
  chip, a coloured status caption and the tifo hard shadow on every one of them, and nothing
  on the page read. So: hairline rows, two to a line inside a family (`ChallengeLedgerRow`),
  no card, no border, no shadow. **The family accent is spent once per family**, as the rule
  under its heading, never on an entry. **Tier is not a colour** - `TierPips` draws three
  monochrome slots, on the rows and in the counter's legend alike (`TIER_COLOR` is gone).
  **Earned is the only ink**: completed is full-strength with a green tick, everything else
  is `text-dim`, never red. Two tokens came with it (`src/index.css`): `--color-dim`, which carries the name
  and description of most of the catalogue and is therefore held at AA on ground / panel /
  chalk, and `--color-hair`, the row rule, a step lighter than `--color-line`. The two
  columns are a **grid, not CSS columns**, because a grid row levels both cells' heights and
  so keeps the pair of hairlines in line when one description wraps and the other does not;
  one column below 700px. The row shows its `+N` where the card used to.
- **Accounts:** `completed_challenges` is one column on `career`, added by
  `supabase/migrations/0011_career_challenges.sql` (applied to the NAS 2026-08-19), which
  also teaches `save_career` and `import_guest_progress` to carry it.
  **A server without that migration still works** -
  the column reads as absent and challenge progress simply does not persist for that
  account - because the client ships by pushing to `main` while migrations are applied by
  hand.
- **Ids are permanent.** A completion is stored by id, so renaming a challenge is free and
  changing an id orphans what players have already earned. That is why `on-a-roll` kept its
  id when it was redefined from "win three runs in a row" (which was Three-Peat under another
  name) to "reach a final in three consecutive runs".

## Trophy cabinet (flagged)

A read-only **`/cabinet`** screen: what a career has to show for itself. Roadmap item 06
(option B of the four in that entry); comp in
`docs/redesign-2026/turf-flat/trophy-cabinet.html`. Behind **`FEATURES.trophyCabinet`**
(and Career Mode, like the rest of that layer), reached from a "Trophy cabinet" link in
`CareerHub`.

- **Almost all of it is derived.** The career layer already stored far more than it showed:
  `cupsByAscension`, `bestCupAscension`, `cupFormations`, the three streak counters,
  `everLostFinal`, `runsAtHighAscension`, `prestigeSpent` and `bestScore` were all being
  written and read by nothing but `domain/challenges.ts` (and `bestScore` by nothing at
  all). So the cabinet is a **readout**, not a recording job: `domain/cabinet.ts`
  `cabinetView(career, album, allPlayers)` derives every figure on the page, which is why
  it needed no new state, no migration, and behaves identically for a guest and an
  account. `CabinetScreen` only lays the result out.
- **Blocks:** a headline strip, the **shelf** (one trophy per cup), the Ascension
  **ladder**, **Records**, the formations a cup has been won with, an **honours** summary
  (counter, tier bars, all 12 families, linking to `/challenges` for the full ledger),
  **badges**, album completion with the Monumental strip, the **run archive**, and two
  leaderboards: **Most used** and **Top scorers**.
- **Rank is one hue getting deeper, plus a numeral** - not six colours. Same rule the
  challenge ledger arrived at when 130 painted entries stopped reading (`TIER_COLOR` is
  gone). The top step needs its own token: `bg-ink` would make the **highest** tier the
  **lightest** plinth in the dark theme and read the ramp backwards, hence
  `--color-cup-deep`.
- **`domain/badges.ts`** is the cabinet's long tail, and the distinction that keeps it
  from being the challenge catalogue twice: **a badge asks what a career HOLDS, a
  challenge asks what one RUN did.** Nothing here could be phrased "win the cup with...".
  Three rules: nothing is recorded (pure predicates, so a career that predates the file
  lights up retroactively and no stored set can disagree with the display); nothing is
  paid (challenges are the Prestige faucet, and a second one would need the same arrears
  reasoning `challengeAwards` carries); and no exact lifetime counts, only thresholds and
  set-coverage (the First Blood trap, and worse here since a derived exact count would
  flicker as the counter passed). A badge defines only `progress`, and **earned is derived
  from it**, so it cannot claim to be earned while showing an incomplete fraction.
- **Two things needed adding to existing code**, both of which were already on the hygiene
  backlog rather than new debt: `byFamily` on `ChallengeProgress` (H44 - the catalogue
  screen was recomputing it) and `collectiblesByTier` in `domain/album.ts` (H45 - six
  callers were re-deriving a tier they had just proved). `AlbumScreen` still hand-rolls
  its own grouping; pointing it at the shared one is what is left of H45.
- **"Best cup streak" is not a stored field**, and this is the one number on the screen
  that took thought. `cupStreak` is a live counter that resets on any lesser finish, so
  nothing records the best run ever. Rather than add a counter (which would only work
  going forward), `bestCupStreakOf` reads it off the honours: **holding Three-Peat is
  itself proof a three-cup streak happened.** Works retroactively, and `npm run checks`
  asserts a career whose counter has been reset still reports 3.
- **The run archive and the player records are the one RECORDED part** (option D, added
  2026-08-20), because nothing derivable can answer "when" or "who scored". Both live on
  **`CareerStats`**, and that is the whole reason they needed **no SQL at all**:
  `save_career` persists `stats` as one merged jsonb column and ignores top-level keys it
  does not know, so a new field on `stats` survives a signed-in save while a new field on
  `CareerState` would be silently dropped. Same trick the challenge counters used. Both
  fields are optional, so a save from before this loads and starts recording at the next
  run. Caps are `HISTORY_LIMIT` (100 runs) and `PLAYER_RECORD_LIMIT` (600 players), and
  **the screen prints both counts** rather than letting a truncated list read as "this is
  everything".
- **The tally is accumulated match by match, not derived at run end** (`RunTally` in
  `domain/run.ts`, added to `RunState`, merged by `applyRunResult`). Two reasons, both of
  which would be silent bugs the other way round: a **roster boost changes the XI**, so a
  group scorer may not be in `run.xi` when the run is banked; and a **`MatchEvent` carries
  a scorer NAME, not an id** (`scorerPool` is built from `player.name`), so the only place
  it resolves to a player is against the XI that was actually on the pitch. Names are
  unique per person across the dataset, which is what makes that lookup exact.
- **Shootout penalties are not goals**, and they are excluded *by construction* rather
  than by a filter: kicks live in `KoMatch.pens` and never in `events`, so the tally
  cannot see them. `npm run checks` asserts it against runs that actually went to
  penalties, because it is exactly the kind of thing a later refactor breaks quietly.
- **The date is passed in**, not read inside the domain (`applyRunResult(..., at?)`, with
  `Date.now()` supplied by `CupRunScreen`), so the function stays pure and the checks
  harness stays deterministic. A row banked without a clock carries no date and shows a
  dash rather than a fake one.
- With **`FEATURES.trophyCabinet` = false**: the route redirects home, the hub link
  disappears, and nothing else changes.

## Budget draft / Transfer Market (flagged)

A second way to build the XI, alongside the random roll. Spec:
`docs/budget-draft-requirements.md`. Behind **`FEATURES.budgetDraft`**.

- **It is the same page as the roll draft, not a separate screen.** "Buy with a budget" on the
  setup panel dispatches `START_BUDGET` (which sets `build: 'budget'`, `phase: 'draft'`) and stays
  on `/` - only the left column swaps to the transfer market; the centre `Pitch` and the right
  ratings/chemistry/line-up (`BoxScore` + `XiTable`) are the same shared components as the roll
  draft and never remount. Completing the XI flips to `phase: 'complete'` -> the normal
  `CompletePanel` (mode-aware CTA), so there is no separate "Confirm" step. (`/build` is gone; any
  old link redirects to `/`. `App` gates the roll-only "draw next squad" effect on `build === 'roll'`.)
- **`BudgetMarket.tsx`** is the left-column panel (the player source, mirroring the drawn-squad
  panel): a budget bar + "Auto-fill & spend" + "Clear" + "Start over" on top, then the
  rating-sorted, searchable list for the targeted position (capped at `MAX_RESULTS` = 60;
  unaffordable/used rows disabled; collectible tier stars). You buy from all squads within a budget, each priced by
  rating via **`domain/pricing.ts`** (`priceOf` = `max(1, round((elo-58)^2/64))`, convex so
  the budget forces trade-offs). The budget is a `budget` prop (not a constant): it is the
  owned `transfer-budget` career perk's tier through `config.ts` `BUDGET_BY_TIER` ($70 base
  -> $160), computed in `App` (reads `store.peek().career`, synchronously) and passed to
  `BudgetMarket`. `BUDGET_DRAFT` ($110) is no longer read by any screen - every build is a
  career build - and is kept only as the mid-ladder figure `npm run checks` prices against.
- **The owned-sticker discount.** A player whose sticker is already in the album costs
  `STICKER_DISCOUNT` (config.ts, 25%) less: `priceFor(player, ownedIds)` on top of the
  curve, with `pricerFor(ownedIds)` for the places that price many players. **In both
  **for signed-in players and guests alike** - the album is global, so there is one price
  rule; set the constant to 0 to switch it off.
  Everything that touches money goes through it, and that is the part to keep in step:
  the market rows (which show the full price struck through beside the discounted one),
  the **price and value sort comparators** (sorting by a price the player is not paying
  makes cheapest-first lie), the budget bar, `XiTable`'s cost column and total, and
  `autoFillBudget`, which takes the pricer as an argument because its per-slot reserve and
  upgrade passes must reserve against what will actually be charged. Keyed on **player
  id**, like the marker: owning Buffon 90 discounts that card, not Buffon 88.
- **The filter row: cup, country, Affordable, Collectible** (roadmap 36, 2026-08-25). The
  region/confederation filter was **deleted** here; `data/confederations.ts` is still live for
  `domain/chemistry.ts` ("Same continent"), `domain/challenges.ts` and `domain/validateSquads.ts`,
  so do not follow the market's dropdown out of the codebase. Three rules worth keeping:
  - **The price ceiling is part of the FILTER, not a paint on the rows.** The list caps at 60 and
    sorts by rating, so the rows on screen are always the dearest players; measured over the
    thirteen-tournament pool, with $10 left **not one of the 60 visible strikers was buyable**
    while 1,415 affordable ones sat below the cut, at every position (CB 0 of 60 with 1,738, GK 0
    of 60 with 954). `maxPrice` on `MarketQuery` therefore filters BEFORE `.slice(MAX_RESULTS)`,
    for the same reason the cap goes after the sort. `marketResults` returns `hiddenByPrice`
    alongside the rows so the empty state can say "nothing you can afford" instead of blaming the
    filters, which sends the player off adjusting the wrong control.
  - **The two dropdowns narrow EACH OTHER, and nothing else narrows them.** `marketFacets` takes
    the selection and derives each dropdown from the candidates passing *every filter except its
    own*: pick 1974 and the country list is the 16 nations that were there, pick Wales and the cup
    list is 2022 alone. That is what makes "a dropdown never offers an option that would empty the
    list" true again - it held one facet at a time only, and with 352 squads over 13 years and 81
    nations two thirds of the year-plus-country pairs are empty by construction. The search box and
    the two toggles are deliberately excluded: what a run can afford changes with every purchase,
    and a country list that reshuffled as money was spent would be unpredictable.
  - **A control is shown when it has more than one option OR a selection is active on it.**
    **24 of the 81 nations played exactly one World Cup**, so picking one collapses the cup facet
    to a single year; the old `length > 1` guard alone would then hide a filter that is still
    switched on, and the player could neither see nor clear it.
- **A `ring` inside a scroll container is clipped on the cross axis, and it cannot be scrolled
  to.** The market's selected row used `ring-1`, which is a **box-shadow drawn outside the border
  box**, on a `w-full` row inside `overflow-y-auto`; setting one axis to `auto` makes the other
  compute to `auto`, and a box-shadow does not contribute to scrollable overflow, so the left and
  right strokes were simply cut off (the reported bug). Selected is now a **full-width band**:
  `bg-pitch/20` plus `border-y border-pitch`, with `border-transparent` on every other row so the
  height does not jump. The grid view had the same bug, masked by its cards carrying a real
  border; its ring is gone too. **Reach for a border (inside the box), not a ring, on anything
  that scrolls.**
- **Position selection is on the pitch, both directions.** `Pitch` gained two optional props
  (`onSelectSlot` + `targetSlotId`, no-op in the roll draft): tap an empty slot to *shop* that
  position (the market filters to it), OR tap a market player to hold it (its eligible slots pulse
  amber/white) then tap a highlighted slot to buy - mirroring the roll draft's select-then-place.
  App owns the transient held-player + target-slot state (not persisted) and drives both the market
  and the pitch from it; buys dispatch `BUY_PLAYER` (validates like `PLACE_PLAYER`), removes reuse
  `REMOVE_PLAYER` (the badge `x`), and buying advances the target to the next empty slot.
- The "Auto-fill & spend" helper is randomized: fills the empty slots in a shuffled order, each a
  random pick from the best few players it can still afford (reserving the minimum for the rest),
  then a random upgrade pass spends the leftover - so every click yields a different XI that still
  spends most of the budget (committed via `AUTOFILL`). The built XI plays a Cup Run exactly
  like a rolled one.

## Accounts (optional, config-gated)

Sign in with an emailed 6-digit code and your album, career, settings and in-progress
run live on a server instead of in the browser, so they are the same on every device.
Requirements: `docs/cloud-sync-requirements.md` (settled). Design: `docs/cloud-sync-design.md`.
Server setup: `docs/nas-setup.md`.

- **Guest-first is the rule** (NFR-1). The whole game is playable with no account and
  guest play never touches the server. An account adds continuity and backup, and may
  gate genuinely online extras (leaderboards later), never core gameplay or content.
- **`FEATURES.accounts` is derived, not hand-set**: it is on only when the build was
  given `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (repo *variables*, passed by
  `.github/workflows/deploy.yml`; `.env.local` for dev). With no server configured
  nothing account-related renders, no network call happens, and the build is the
  guest-only game. A fork therefore just works.
- **Two worlds, never mixed** (D8). Guest progress is `localStorage`; account progress
  is the database only. The single crossing is a one-time **automatic** move on first
  sign-in, and only into an account holding nothing: the server confirms before the
  local copy is deleted, so a failure cannot lose it. Signed in with the server
  unreachable **blocks play** (D9) rather than inventing local progress -
  `UnreachableScreen`, with a "continue as guest" escape.
- **Client:** `state/auth.ts` (sign in with a code, sign out here/everywhere, delete
  account), `state/store/remoteStore.ts` (the account-backed `Store`), and `AccountPanel`
  in **its own dialog** (`AccountModal`, opened by the masthead account button - it used to
  be a group inside the settings sheet, which buried the one thing a new player might want).
  The auth library and the remote store are **dynamically imported**, so a guest never
  downloads them (verified: `GoTrueClient` appears only in the separate `auth-*.js` chunk).
- **Entering the code.** Both stages are real `<form>`s (Enter submits, phone keyboards
  offer Go/Send), and a **complete code submits itself** - a paste, the phone's
  one-time-code suggestion and typing the sixth digit are all one change event. Two things
  that change needs: `verify` takes the code as an **argument**, since a handler firing on
  change cannot read the state it has just set, and a **ref** guards re-entry, because two
  change events in quick succession would both pass an async-state check and submit twice.
  The field keeps digits only, capped at `CODE_LENGTH`, so a pasted `111 222` counts as
  complete. The first button says **Continue**, not "Send code": the player is carrying on,
  and the code is the mechanism, not the point.
- **The sign-in email** is `public/email/otp.html` (+ `public/email/logo.png`), so it
  deploys with the site and GoTrue points at it by URL - see `docs/nas-setup.md`, "The
  sign-in email". Mail-client rules drive its shape: tables and inline styles, web-safe
  fonts, a hosted PNG rather than the app's inline SVG (Gmail drops SVG and blocks
  `data:` URIs), and no copy button, since mail clients run no JavaScript. Preview it by
  rendering the file with the placeholder substituted; do not add a greeting, sign-off or
  unsubscribe footer, which were left out deliberately.
- **Server:** self-hosted Supabase on the NAS. `supabase/migrations/*.sql` applied in
  order, plus the generated `supabase/seed/collectibles.sql`. Row-level security
  isolates accounts; the sticker economy goes through `security definer` functions
  (`finish_run`, `execute_trade`, `import_guest_progress`), because the browser talks
  to Postgres directly and RLS alone would let someone write implausible rows into
  their own album. Function grants are explicit (`0008`) - Postgres makes functions
  PUBLIC by default and Supabase grants them to `anon`/`authenticated` on top, which is
  how internal helpers were briefly callable by anyone with the public key.

**The collectible catalogue.** The server has to know who is collectible, which is
derived from `player.elo` in TypeScript that SQL cannot read. So it is generated:
`npm run gen:collectibles` writes `supabase/seed/collectibles.sql`, `npm run checks`
**fails while it is stale**, and `npm run push:collectibles` sends it to the server.
Run all three after any rating change that crosses a `STICKER_TIERS` boundary. A player
who falls out of the bands is marked inactive, never deleted, so albums holding them
keep working.

**Gotchas, each of which was a real bug:**

- **Collectibility is judged on the DATASET rating, never the object in hand.** Cup Run
  boosts hand back modified copies (Golden Generation is +2 to the XI), and testing
  those made an 89 look Legendary - an id the server's catalogue does not contain, so
  the whole bank was refused. `useStickerAlbum` resolves ids through `BASE_BY_ID`.
- **Writes are serialized** in `remoteStore`, and a version conflict re-reads and
  retries once. The app fires several independent writes (game state, run state,
  career, banking) and each carries the version it last read, so overlapping writes
  made the second stale by construction.
- **A version conflict must not use SQLSTATE 40001**: PostgREST treats it as retryable
  and retries a deterministically-failing transaction until the gateway times out.
  `bump_version` raises `PT409`, which PostgREST answers as 409.
- **Each bank gets a fresh run key.** Deriving it from the XI + outcome collided the
  moment two runs ended the same way (trivially, two runs with no collectibles).
- **Banking is ONE round trip, and a new server function needs a new name.** `finish_run`
  used to return only the new ids, so the client followed it with a version read and an
  album + stats read: three sequential trips, which is what made a finished run sit for a
  second or two (the function itself is 1-9 ms, measured). `finish_run_v2` (migration
  `0010`) returns all of it from one transaction. The client is deployed by pushing to
  `main` while migrations are applied by hand on the NAS, so the two are never in lockstep:
  `remoteStore.finishRun` tries v2 and falls back to the old path once per session on
  PGRST202 (a missing function, which PostgREST refuses before Postgres runs anything, so
  the fallback is a first attempt and not a double submit). Never fall back on any other
  error. Adding a return field to a function means a new name for the same reason.
- **`finish_run` clears `active_run`, so the client writes the run back.** The server is
  right that a banked run is not active, but the client still needs it: the run-end screen
  must survive a reload until the player picks "New run" or leaves, and a signed-in reload
  found no run and fell back to the build page. `remoteStore.finishRun` therefore
  re-saves whatever run the cache holds once the bank lands, which also stops a finished
  **World Cup** (which banks through the same call) from wiping an unrelated Cup Run still
  in flight. Read the run AFTER the bank, never before: by then it carries
  `stickersApplied`, and writing back an unflagged run would let a reload bank it twice.
  A guest never had either problem, since `localStore.finishRun` does not touch the run.
- **Run-end actions wait for the save** so the sticker haul is always shown before the
  next run starts, with a 4s release and a run-generation guard so a slow server cannot
  block play or drop a stale summary into the next run.
- **The cup pick may be a DUPLICATE, and the server cannot judge otherwise.** With the
  pickable tiers exhausted the reward picker offers the whole list on purpose (album spec
  FR-3) and the pick lands as a duplicate, which is what the guest store always did; the
  server refused it ("cup pick bra-1998-9 is already collected"), and since that raise
  rolls the whole bank back and a failed signed-in write is the blocking unreachable
  state, a full album made a cup win unplayable for an account. Migration `0012` drops
  that check (applied to the NAS 2026-08-20). Do not put back a narrower "only when
  nothing is left to collect" version: the picker draws from the player's selected World
  Cups (`poolYears`), so a finished 2022 pool offers duplicates while the catalogue still
  holds uncollected 1990 cards, and any exhaustion test on the server would refuse that
  legal pick. Deployment being client-first, `remoteStore.finishRun` also retries a
  refused pick as one more entry in `collectibleIds` (added copy by copy, no
  already-collected check, and 11 + 1 still fits the cap of 12), so a pre-`0012` server
  banks the duplicate instead of losing the run. That retry is now dead code against our
  own server, and stays anyway: a fork runs whatever migration level it has applied.

## Conventions and working agreements

- **2-space indentation**; match the surrounding file's style exactly. Do not
  reformat/reindent files as a side effect of a change.
- `tsconfig` has `strict`, `noUnusedLocals`, `noUnusedParameters` - unused
  locals/params/imports are build errors. Unused cross-module *exports* are not
  caught by tsc but are tree-shaken by Rollup (so they cost nothing in the bundle).
- Keep `domain/` pure and React-free. Put new gameplay logic there, not in components.
- Gate new optional/experimental features behind a `FEATURES` flag so they can be
  switched off cleanly.
- Display copy: avoid jargon (we renamed "elo" -> "rating" in the UI). **No
  em-dashes** in any generated text (commit messages, docs, comments, UI) - use
  commas, parentheses, or hyphens.
- Workflow: **commit and push directly to `main`. ALWAYS. No exceptions.** (Recorded
  2026-08-23, restated in capitals at the top of this file on 2026-08-25 after it had been
  asked for yet again.) **This is the default with no further input needed:** do not open a
  feature branch and do not raise a pull request unless asked for one in so many words, in
  the request you are working on. **A branch handed to you by a task template or an agent
  harness is not such a request** - it is a staging area, so finish by fast-forwarding or
  rebasing onto `main` and pushing `main`. Leaving work on a branch is not a lighter version
  of the task, it is an unfinished one. Always `npm run build` before committing (and
  `npm run checks` after touching `domain/`). End commit messages with the `Co-Authored-By`
  trailer.
- **A migration you write, you also QUEUE** (recorded 2026-08-24). Migrations are applied by
  hand on the NAS with `npm run push:sql`, which needs `dkr/.env` and LAN/VPN reach, so a
  session without that access can write and validate one but not apply it - a cloud agent
  typically cannot. Any session that adds a file to `supabase/migrations/` and cannot apply it
  therefore **opens a roadmap item for it**, with what it does, how to verify it worked, and a
  rollback block in the file's own header - so the apply can be handed to an agent that does
  have access. (The old standing item 35 held exactly two such migrations, 0013 and 0014; both
  went in on 2026-08-25 and it was **closed empty**, because an open item reading "nothing
  waiting" looks like work in flight. Open a NEW one rather than reopening it; its history
  entry is the worked example of the handover.) Two things make that safe and
  are worth doing every time: `npm run push:sql -- --dry-run <file>` needs no credentials and
  no network, and `pglast` (`pip install pglast`, then `pglast.parse_sql`) parses a file with
  the real Postgres grammar, so a syntax error never reaches the server. Validate the rollback
  block too - it is the thing someone reaches for under pressure.
- **A migration you APPLY, you rehearse first, inside a transaction you roll back**
  (recorded 2026-08-25, after 0014). Parse-checking proves the SQL is well formed and nothing
  more. Send `begin;` + the migration body (minus its own `begin`/`commit`) + the checks that
  should pass afterwards + `rollback;` as one file: the post-migration state gets exercised on
  the real server against real data, and nothing is left behind. Put the results in a temp
  table and `select` it at the end, since notices do not come back through `push:sql`. That is
  what turned "this looks wrong" into a reproduced failure for 0014, and it is cheap.
  Re-run the same probes after applying for real. Two habits that go with it:
  **"nothing reads it" is not "nothing writes it"** - dropping a column needs BOTH searches,
  and a plpgsql body is not checked when a column is dropped, so a stale `insert` inside a
  function fails at the next call rather than at migration time; and when a migration restates
  an existing function, take the body from the live server's `pg_get_functiondef`, diff it
  against the repo's copy first, and change only the line you mean to.
- **Persisted-shape versioning has one rule now** (recorded 2026-08-25, hygiene H74).
  Five keys had four different disciplines and no stated policy, so the next schema change
  would have invented a fifth. The rule:
  - **The KEY NAME carries the version.** `wcsim_career_v1`, `wcsim_album_v1`,
    `wcsim_settings_v1`, `wcsim_run_v1`. A breaking change gets a new key, which makes the
    old data unreachable rather than misread - and since there are no production users
    (below), that is a free choice rather than a migration.
  - **A loader REBUILDS explicitly**, field by field, rather than casting what
    `JSON.parse` returned. Every one does now: `loadRun` builds a fresh object,
    `loadReveal` and each history entry go through a shape guard, `normalizeSettings`
    clamps every field, `loadGame` checks the phase, `migratePerkLevels` validates each
    value. A cast is the thing to avoid, because it makes a malformed save look typed.
  - **No new in-band `version` field.** Two exist and stay: `AlbumState.version` is read
    and checked, and `CareerState.version` is written in three places and read in NONE -
    its migration is by shape-sniffing (`perkLevels` vs v1's `unlocked`), which is what
    actually works, so the field is vestigial. Do not add a third; do not start reading
    the second without also making something write it meaningfully.
  - `Settings` and `GameState` rely on the key name plus a merge, which is the rule above
    working as intended rather than a fourth approach.

- **There are no production users yet** (recorded 2026-08-21, until further notice). So
  breaking a persisted shape, orphaning a saved game, or dropping a supported
  configuration is a free choice rather than a migration: decide it on the merits and do
  not write compatibility code for a player who does not exist. This is the standing
  answer to "but what about someone who has X saved?".
- When delegating to agents, review their diff before committing - they can
  overreach (reformatting, incidental behavior changes).

## UI gotchas

- **Boot screen** (`index.html` + `main.tsx`): a cover with the trophy tile, wordmark
  and a spinner sits **outside `#root`**, so React never owns it. `main.tsx` stamps
  `data-booted` on `<html>` after the first render - on every path, the
  unreachable-server screen included - and inline CSS fades the cover out. It exists
  because nothing else can paint that early: `index.css` arrives with the bundle, and
  a signed-in first render also waits on one round trip to the account server. Hence
  the two rules to keep: its colours are **literal copies** of the `--color-ground` /
  `-ink` / `-pitch-dark` / `-amber` tokens for both themes (keep them in step with
  `index.css`), and the spinner is delayed 350ms so a fast load shows nothing at all.
  Under `prefers-reduced-motion` the delayed fade-in is replaced by plain `opacity: 1`
  - with the animation off, `both` would otherwise pin it at 0 and hide the screen.
- **The Ascension picker belongs at the LAST step before kickoff, and it has moved twice**
  (`components/AscensionPicker.tsx`, 2026-08-25). It was on a pre-run screen, that screen
  went, and it landed on `SetupPanel` beside formation and style on the reasoning that all
  three are decisions about the run being built. That reasoning is wrong in the way that
  matters: formation and style SHAPE the XI so they must be chosen first, while the tier is
  a judgement **about the XI you ended up with** - a squad that came out strong wants a
  harder ladder and a bigger multiplier, a thin one does not. So one component now renders
  at both doors into a group stage: `CompletePanel` (the norm) and `cupRun/PreRunPanel`
  (the fallback you get by reaching `/cup-run` without a kickoff).
  **Picking calls `rememberAscension`, never `startRunCareer`.** The latter also SPENDS a
  Youth Development grant - it clears `bonusStartBoosts` and returns what it owes - so
  wiring a picker to it binned the grant, silently, on a control you can touch as often as
  you like before any run exists. `npm run checks` asserts the split.
- **Nested interactive elements: `PlayerBadge` owns its own gesture** (`onActivate` /
  `activateLabel`), rather than `Pitch` wrapping the badge in a `<button>`. It has to,
  because the remove "x" is a button too and a `<button>` inside a `<button>` is invalid
  HTML - React warned on every render of the build page, and the inner control is undefined
  behaviour for keyboard and assistive technology. The badge body and the "x" are now
  siblings under one `relative` root, so `Pitch`'s three placed-player branches are plain
  positioned `<div>`s. The "x" anchors to the badge COLUMN rather than to the name label it
  used to sit inside, so it no longer slides with the length of the name.
- `Tooltip.tsx` portals its bubble to `document.body` with `fixed` positioning (so
  it escapes `overflow` clipping), flips above/below by available space, and
  dismisses on scroll/resize. Hover-only by design.
- `Flag.tsx` renders **only real flags** (no code-box fallback; returns `null` if a
  code is unmapped). The red "YOU" badge marks the user's own team in match screens.
- `BoxScore` (right column) renders the **ratings strip** (Ovr = all, Att = MID+FWD,
  Def = GK+DEF; Ovr is the deep-green hero cell) and, below it, the
  **chemistry card** (donut + effective overall + per-category breakdown chips).
  `XiTable` is the **line-up sheet** below them (pos / name / flag+year / rating,
  GK row on chalk).
  **The strip's groups are the SIMULATOR's** (audit decision D7, answered 2026-08-25),
  which is why there are three cells and not four. It used to have a **Mid** cell and an
  **Att** that was forwards ONLY, while the Cup Run screen's identically-labelled Att has
  always been midfielders + forwards, because that is what the sim reads: the same XI read
  Att 88 on the build page and Att 81 the moment its run started, with nothing having
  changed. Midfielders are inside Att now, on both screens, so there is no Mid cell to
  add. `lineAverages` (domain/match.ts, beside `xiStrength`) still differs from
  `xiStrength` in exactly ONE way and must keep doing so: **an empty line reads 0 here**,
  which the screen shows as a dash, where `xiStrength` falls back to the overall - a
  fallback that is right for a match (it cannot be simulated against nothing) and a lie on
  a half-built XI.
- **Team rating chips**: `RatingChip` (in `matchUi.tsx`) shows a team's rating as a
  small chip next to it (standings, fixtures, bracket seeds, summary recaps). It is
  hidden below the `sm` breakpoint (no hover on mobile, space is tight) and toggled
  globally by `FEATURES.teamRatings`. This replaced the earlier title-hover tooltips.
- **The build page's scroll dance** (mobile, i.e. below the 1080px three-column
  breakpoint): picking a player scrolls the **pitch** to the top so a slot can be tapped,
  and placing him scrolls the **source panel** back. Two `scrollIntoView` calls, one in the
  `selectedPlayerId` effect and one in `handlePlace`, both gated on `isStackedLayout()`.
  It is why the source panel has to come FIRST on a phone (see the navigation-preview note
  above): the dance is a there-and-back, and it only reads as one if the panel is above the
  board. The transfer market got the same pair on 2026-08-21 - it holds its card in local
  state, not in `selectedPlayerId`, so the effect never fired there and the same gesture
  had half the help.
- **Auto-scroll**: `useFollowBottom` eases the page down to follow growing content
  (live goal feeds, new match / round cards, the qualify call-to-action). It follows
  down only, pauses when the user scrolls up, and never cancels its own in-flight ease.
  `index.css` sets `overflow-anchor: none` on `html`: the browser's scroll anchoring
  otherwise nudges scrollY when result cards mount and stalled the follow (worst on
  short mobile screens).

## The `pvp*` modules and `referee/` have no importer in the app yet, on purpose

Waves 0 to 3 of roadmap item 18 (player versus player) shipped 2026-08-26. **Nothing in
`src/` imports any of it**, because the screens are waves 4 to 8, and a tree-shaking or
dead-code pass therefore finds it, concludes it is unused and deletes it - which is what
this note exists to stop, the same way the one below stops the same conclusion about
`public/jerseys/`. It costs nothing shipped: Rollup tree-shakes an unimported module out of
the bundle entirely, and `referee/` is not in the browser build at all.

- **Waves 0 and 1**: `domain/pvp.ts` (the rules a room is judged by), `domain/pvpRoom.ts`
  (the room as a state machine) and `domain/pvpAuth.ts` (who the referee will act for).
- **Wave 3**: `referee/` (the service - see `referee/README.md`), plus the two rules both
  sides need, `domain/displayName.ts` and `domain/pvpVersion.ts`. `FEATURES.pvp` is derived
  from `VITE_REFEREE_URL` **as well as** the account server, so configuring accounts alone
  cannot put a Versus tab on the site whose every call would fail.
- **`referee/` is type-checked by `npm run build`** (it is in `tsconfig.node.json`, like
  `scripts/`) and driven end to end by `npm run checks`, with no Postgres and no socket. Its
  one runtime dependency, `pg`, is a devDependency of this repo and external to the bundle.

**The deploy is roadmap item 41 and it has not happened**: the migration, the
`pvp_referee` password, Realtime, the gateway route and the container. `docs/nas-setup.md`
has the checklist. Deploy the referee BEFORE pushing a client that talks to it, always.

**Three rules in the referee are load-bearing and each was a bug first:**

- **P45's recovery is CONDITIONAL, and applying it on every sweep stops the pick clock
  dead.** It sets `openedAt = now - (lastSeen - openedAt)`, so the elapsed time freezes at
  its previous value and freezes there again next sweep: no window ever expires and a room
  with an absent player waits for ever, which is the exact stall the no-timers design exists
  to prevent. Unconditional at BOOT (what P45 actually says), conditional during a sweep.
- **A grant is not a policy, and this bit twice.** 0016 states the rule for the seven pvp
  tables and then grants the referee three columns of `profiles` with no policy - so under
  row-level security it read nothing, concluded every account was nameless, and refused
  every room. 0017 adds it. Found by rehearsing on a real Postgres, not by reading.
- **A pick carries a player ID, never a player.** The referee resolves it in its own bundled
  dataset, so a submitted rating cannot decide a price and submitted `positions` cannot
  decide eligibility.

**One decision has reopened: the career budget (P2).** A room may take each player's own
career transfer budget, and P34 forbids the referee any privilege on `career`; snapshotting
does not dodge it, because the snapshot still has to be read. The referee refuses that
option today. `docs/pvp-plan.md` section 11 lists the three ways out.

**The plan is `docs/pvp-plan.md`** and it is the thing to read before touching this. Three
rules in that module are load-bearing and each was mutation-tested:

- **Nothing trusts the submitted player object.** A room is account-only and the client posts
  an XI over the wire, so every player is resolved through `datasetPlayer` (added beside
  `basePlayer` for this: it returns undefined for an unknown id, where `basePlayer`
  deliberately falls back to the object it was handed). A submitted rating decides a price
  and a submitted `positions` decides eligibility, and both arrive from a browser. Replacing
  that one call with `basePlayer` turns the "invented player" check red.
- **The budget auto-pick reserves a dollar per still-empty slot.** Without it, an XI that
  cannot be finished is reachable: at a budget of $1 a slot, removing the reserve takes
  1,000 auto-completed XIs from 1,000 legal to **0**.
- **Chemistry is OFF in a room** (plan P25), and `pvpTeam` takes no chemistry argument at all
  rather than defaulting one to zero, so it cannot be quietly reintroduced. Measured: the same
  eleven players with the full bonus beat themselves without it **73.2%** of the time, because
  it is added to attack and defence alike and those are the two numbers the sim reads.

**Wave 1's three rules, each of which was a bug before it was a rule:**

- **THE REFEREE HOLDS NO TIMERS.** A deadline is `openedAt` plus the room's clock length,
  evaluated when a pick arrives and by one stateless sweeper. In-memory timers die with the
  process, cannot be shared by two instances during a rolling restart, and put a room's
  state somewhere a restart cannot recover. Everything takes `now` as an argument, which is
  also what lets a twenty-second clock be tested in microseconds.
- **An outage owes the REMAINDER, not the gap.** "Shift every window forward by the outage"
  reads correct and is wrong: a 45-second restart on a 20-second clock leaves every window
  still expired, so the first sweep auto-picks for every player in every drafting room
  anyway. A window reopens with the time it had left. Restoring deadlines from the database
  is enough to have "not lost anybody's clock" and still lose everybody's draft.
- **A ROLL ROOM CAN STALL, and it is not exotic.** The auto-pick fills from the last squad
  dealt, and **345 of the (squad, position) pairs in the dataset are empty** - most 1970s
  squads list no wide midfielder at all - so the dealt squad routinely has nobody for the
  slots still open. The sweeper guarantees progress, and whatever it reaches for is
  **recorded as dealt**, or it builds an XI the referee itself then refuses. A check asserts
  the property that keeps the last-resort path dormant (every cup can fill every position),
  so a future tournament makes it go red rather than making the fallback silently live.

Also settled by wave 0, because the plan had it wrong: **`resolveKoTie` was already exported
and shared**, so there was nothing to lift out of `domain/run.ts`. What was actually missing
is a two-sided match side - `userGroupTeam` hard-codes `id: USER_ID`, `name: 'Your XI'`,
`code: 'YOU'` and `isUser: true`, so it can describe the one side a single-player match has
and cannot describe two opponents in one tie. That is `pvpTeam`.

## Deliberately unreferenced assets under `public/`

`public/jerseys/` (27 MB), `public/formations/`, `public/formations.csv` and
`public/img/image.png` ship in every build and **nothing in `src/` references them.** That
is a decision, not an oversight: CR-D3 in `docs/code-review-2026-07-round2.md`, resolved by
the owner as keep-as-is - the deploy weight is accepted and the assets stay where they are.
Recorded here because a tree-shaking or bundle-size pass finds them, concludes they are
dead, and deletes them, which is what this note exists to stop. Do not re-litigate it; the
one file `public/img/` holds that IS referenced is `swiss.svg`, in the footer.

## Hosting

Build output (`dist/`) is static. Because routing uses the History API (clean paths),
`vite.config.ts` sets an **absolute** `base` for the build (`'/wcsim/'`; `'/'` in dev)
so deeply-nested URLs still resolve `/assets`, and `scripts/copy-404.mjs` (run at the
end of `npm run build`) copies `index.html` to `dist/404.html` so GitHub Pages serves
the SPA for any deep link / refresh. `.github/workflows/deploy.yml` builds and deploys
to GitHub Pages on push to `main`. NOTE: the absolute base makes `dist/` GitHub-Pages-
path-specific; a NAS/Docker host at a different path must rebuild with its own `base`
(see `README.md` for the Synology/Docker options).
