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

## AND READ THIS FIRST: YOU ARE PROBABLY NOT ALONE IN THIS TREE

**Several agents, and sometimes the human as well, work on this project at the same time in
the same working directory.** So the rule above comes with a second half that is just as
absolute: **commit and push YOUR OWN topic, and nothing else.**

- **Work that is not yours is not yours to touch.** Modified files you did not edit, a local
  commit you did not make, a half-written feature that does not compile: leave every one of
  them exactly as you found it. Do not commit them, do not revert them, do not finish them,
  do not tidy them, and do not stash them out of the way. They are somebody's session in
  flight, and they are not evidence that the repo is in a bad state.
- **Stage by name. Never `git add -A`, never `git commit -a`.** Name the files your own
  change touched. That one habit is most of this rule in practice.
- **Somebody else's broken file is not your build failure.** If `npm run build` or `npm run
  checks` fails inside code you never opened, that is their work mid-flight: do not fix it,
  do not work around it, and do not report it as your own result. Gate your change anyway,
  in a scratch worktree at `HEAD` with only your files copied in, which compiles cleanly and
  leaves their tree alone. Use `git -c core.longpaths=true worktree add` and link
  `node_modules` in: the jersey art has filenames long enough to fail a plain checkout on
  Windows.
- **Read `git status` and `git log` again just before you commit**, not only at the start.
  The tree moves under you. This section was written after a session that started clean,
  pulled, and by the time it came to commit had six files of somebody else's half-finished
  duel feature in the tree and a new commit underneath it that had arrived in between.
- **An unpushed commit that is not yours will ride along with your push**, and there is no
  honest way around that: rebasing or cherry-picking to dodge it rewrites their work. Check
  the combined tree builds, push, and say in your report that you carried it.

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
  runs in `.github/workflows/deploy.yml` before the build (H91), and the suite stood at **179
  checks** when the audit closed (**448** on 2026-09-02). Five of them assert that a number and the sentence promising it agree
  (H132 the chemistry thresholds, H138 the shop copy, H139 the boot palette, H65 the perk
  shop's advice, H146 the market's budget lookup), and one asserts a shape guard in both
  directions (H70/H73's `isRoundRecord`).
- **The truth sweep landed**, so the wrong figures and the deleted boosts and doors this
  file used to describe as live are corrected (H128-H131, H154). Treat any dataset count
  here as a measurement with a date on it regardless: the dataset moved three times during
  the audit.
- **`0013` and `0014` are APPLIED** (2026-08-25): `0013` narrowed four `for all` policies to
  `for select`, `0014` dropped the dead `run_results` columns, revoked `export_account` and
  dropped `run_results_read`. **The server matches `supabase/migrations/` through 0025.**
  (0015 the bank cap, 0016 the PvP room tables, 0017 the referee's grants, 0018,
  0019/0020/0021 the three versus features applied 2026-08-30, 0022 the duel-by-link
  column drop and 0023 the email address as the identifier, both applied 2026-08-31; 0024
  teaches `pvp_records` to count a duel somebody walked out of, applied 2026-09-01.)
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
  `CardDisclosure`, `GROUP_OUTCOME`, `RatingStrip` (the Ovr / Att / Def cells, which the
  build page's readout and the versus result both draw - it takes the three FIGURES rather
  than an XI, because those two measure them differently on purpose, see the versus note); `components/stickerTheme.ts` owns the sticker tier
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
  `components/cupRun/{PreRunPanel,GroupRevealPanel,RunPhasePanel}`. **App.tsx was 483 lines
  and CupRunScreen 626**, from 1,129 and 907 (597 and 658 on 2026-09-02, the versus and
  duel work since). The last 366 of App's went with wave 4 of
  roadmap item 18 - see "The build is an instantiable unit" below.
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
  the base path and push the route instead.
  **AND IN A SANDBOX WITH NO EGRESS THE APP NEVER BOOTS AT ALL, for a reason that is not the
  app** (found 2026-08-27, and it cost an hour): `index.html` loads Google Fonts with a
  `<link rel="stylesheet">` above the module script, and **a pending stylesheet blocks script
  execution** - so with no route to `fonts.googleapis.com` the page sits on its boot cover
  for ever, `#root` empty, `data-booted` unstamped, and **no console error and no failed
  request to say why**. Stub it (`ctx.route(/fonts\.(googleapis|gstatic)\.com/, ...)`) and
  stub it with a **regex**: a `*` in a playwright glob does not match across a `/`, so
  `**fonts.g*` matches nothing and looks like it worked. Two related ones from the same
  session: `main.tsx` is a module with a top-level await on the boot read and a module script
  blocks `DOMContentLoaded`, so `waitUntil: 'domcontentloaded'` hangs the navigation rather
  than showing the screen - use `'commit'` and then poll the text; and `pkill -f <name>`
  where `<name>` appears in your own command line kills your own shell. Every wave-6 item was verified by driving the
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

**The sign-in email took TWO passes, and the second was 2026-08-27.** The rename commit
changed the wordmark inside `public/email/otp.html` and stopped there, which looked
complete and was not: the mail's **subject line and sender name** are GoTrue settings that
live on the NAS, not in this repo, so they went on saying "World Cup Simulator" for a day.
They are `Mondialino` / `Your Mondialino code` now. The sender ADDRESS stays
`worldcupsim@gmail.com` because it is a real mailbox and can only be replaced, not renamed.
The general point for any future rename: **grep the repo and the stack's `.env`**, since
user-facing copy is not all in `src/`.

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
  only legal rearrangement more often than you would guess (884 of 8,960 legal moves,
  9.9%, measured over every formation with 40 XIs each). Real case: Knoflicek [LW,ST] at
  LW, Burruchaga [AM,RW,ST] at ST, Donadoni [LW,RW,AM] at RW - no pair can trade, yet
  rotating all three round is fine.
  **A ROTATION IS OFFERED ONLY WHERE NOTHING SIMPLER IS LEGAL, and the ORDER the search
  tries slots in is the whole of that guarantee** (fixed 2026-09-01, reported from the
  game with three forwards who could each play LW, RW and ST: swapping the right winger
  with the striker moved the left winger as well, where swapping the left winger with the
  striker had correctly left the right winger standing). A displaced player walked the
  formation's slot list from the top and took the first slot he could play, so the slot
  the mover had just left was reached only when nothing earlier fitted - which dragged a
  bystander in whenever the vacated slot sat later in that list, on **3,019 of those same
  8,960 moves** where only 884 needed it. Every one of those plans was legal and none was
  the one being asked for. He is offered the **vacated slot first, then any other empty
  slot, and only then an occupied one**, so the two figures agree exactly now. `npm run
  checks` holds both halves, and needs both: a trade never shifts a third player, and a
  rotation is still found where no pair can trade. The badge glyph and label say which: an arrows icon and "trade
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
npm run ratings:sync       # EVERYTHING a rating change owes, in one command (see below;
                           #   -- --force-art / --skip-checks)
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
ratings:sync`.** A rating crossing a `STICKER_TIERS` boundary changes who is collectible,
and FIVE things downstream have to move with it - the shipped artwork both ways, the
awaiting-artwork list, the server's catalogue and the player index. Doing four of them by
hand and forgetting the fifth broke the build twice on 2026-08-28, once for a card with no
artwork and once for a name left on the waiting list after its rating came back down. The
command does all five, names any card that is newly undrawn (see "The waiting list"
below), and finishes by running `npm run checks`, which is the same gate CI runs before it
deploys. It deliberately pushes NOTHING: it ends by saying whether the server's catalogue
moved and therefore whether `npm run push:collectibles` is owed BEFORE the push to `main`
that deploys the site. The accounts feature needs a server-side copy of who is collectible
(SQL cannot read the TypeScript dataset), so `supabase/seed/collectibles.sql` is generated
from the dataset and `npm run checks` fails while the two disagree. See "Accounts" below.

**The waiting list.** `art/awaiting-artwork.txt` is the cards that are collectible and not
drawn yet, one player id a line - what used to be `KNOWN_MISSING_ART` inside the checks. It
is **generated**: `ratings:sync` rewrites it whole from the dataset and the art on disk, so
there is nothing to maintain and nothing to accept. **An undrawn card is not an error, and
`npm run checks` does not fail on one** (decided 2026-08-28, after it failed a rating pass
twice in one morning): `StickerCard` swaps a file that will not load for
`STICKER_PLACEHOLDER_SRC`, so the card is a silhouette at the right size and no part of the
album is broken. The real risk is a gap going UNNOTICED - which is how Maradona sat undrawn
in the Monumental tier for two days - so the list exists as MEMORY: the sync compares it
against the cards actually missing and NAMES the ones that appeared since last time. That
report is the whole protection, so do not silence it. The other direction is still a hard
failure: **art shipping for a player who is no longer collectible**, which is dead weight
on every deploy, always cheap to delete, and also how a misnamed source file surfaces (the
built card is named after the source, so a typo in the id lands there rather than passing).

**`docs/missing-sticker-art.html` is the same list as a page for whoever is drawing**
(`scripts/build-art-worklist.py`, python's own library and nothing else), and it carries a
fingerprint of its own contents in an HTML comment so a sync with nothing to change does
not rewrite it and dirty the tree. That stamp also folds in a hash of the BUILDER's source,
because the content fingerprint knows nothing about the markup: without it, editing the
layout leaves the page untouched and looks like an edit that did not work. **It was an xlsx
until 2026-08-28** and HTML replaced it for three measured reasons rather than a taste:
openpyxl writes no cached values, so every derived figure showed blank until the file had
been opened in a spreadsheet once (and this repo is often built in a sandbox whose
LibreOffice cannot open an xlsx at all, so the file could not even be verified after
writing); a colour swatch is one line of CSS and a spreadsheet cannot draw one; and a diff
now says what changed where a zip of XML said only that the bytes had moved.
Its **shirt column comes from `art/kits.json`**, which is hand-written, keyed by SQUAD
(`bra-1970`) rather than by nation because a nation's colours move and a card is one player
at one tournament. Each entry carries a `confidence` of `verified` / `known` / `standard`,
since a 2026 side's exact release is not the same class of fact as Brazil 1970, and the
page prints it. Nothing in the app reads the file; `ratings:sync` merges it into the cards,
which is what makes correcting a colour rewrite the page (the fingerprint is taken over the
rows). It records shorts and socks too and the table deliberately prints only the shirt.
`npm run checks` fails on an entry whose key is not a real squad, since that row would
otherwise go on printing "not recorded" and say nothing.

There is **no unit-test runner**. Verify changes with `npm run build` (type-check +
bundle). For the deterministic domain core there is a committed characterization
harness, run via `npm run checks`: a small index at `scripts/checks.ts` over one module
per concern in `scripts/checks/`, **455 checks** as of 2026-09-02. It exercises the sim, penalty
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
               pvpView.ts    (what the versus screens derive from a room; pure)
               pvpWire.ts    (the payload shape, imported by BOTH sides)
               pvpBot.ts     (the practice opponents: botXi, botName, BOT_SPEND)
               displayName.ts (the one rule for a versus name, shared with the referee)
               pvpVersion.ts (PVP_PROTOCOL, the handshake both sides state)
                              -- roadmap item 18, see "Versus" below
               validateSquads.ts (dev-time dataset integrity checks)
  state/       gameReducer.ts (the phase machine + Action union; AUTOFILL loads a
               fully built XI; SYNC_XI overwrites the board with an XI decided elsewhere,
               which only a versus room dispatches; a `build` "roll|budget" field with
               START_BUDGET/BUY_PLAYER for the in-page budget build); store/ (the persistence seam - see below);
               and behind it the per-key modules store/ delegates to: persist.ts (the
               whole game <-> localStorage, so routes survive a refresh), albumStorage.ts
               (the sticker album <-> its own localStorage keys), careerStorage.ts
               (the Cup Run career <-> wcsim_career_v1), runStorage.ts, settingsStorage.ts;
               buildIo.ts (the two writes a build makes, so a versus room can turn both
               off - see "The build is an instantiable unit" below); pvp/referee.ts (the
               one place that talks to the referee) and pvp/records.ts (the two things a
               room writes about a PERSON rather than a room: the win/loss record, and a
               report of a name - both straight to the account server, not the referee) and
               pvp/watched.ts (which duels this PLAYER has watched the result of, read and
               written through the store - see the duel reveal note under "Versus") over
               pvp/watchedStorage.ts (that list's guest key), and pvp/duels.ts (the one
               signal that says a held duels list is out of date, fired when the referee
               has answered a leave - see the withdraw note under "Versus")
  hooks/       useBuild.ts (THE BUILD: the reducer, its effects, the three interaction
               machines and the handlers, as a unit that can be instantiated twice),
               useVersusRoom.ts (one room live: the answer, the poll, the broadcast, the
               pick clock), useDuelAlert.ts (the slow app-wide poll behind the chrome's
               duel strip - the one thing a duel cannot announce for itself),
               useFollowBottom.ts (auto-scroll), useMatchClock.ts (the shared
               match-reveal clock, used by every live match), useSettings.ts
               (theme / difficulty / year pool, through the store), useStickerAlbum.ts
               (the album + the run-end banking rule, see below), motion.ts
               (prefersReducedMotion)
  nav/         liveMatch.ts ("the navigation is busy": a match revealing, or your own
               versus pick window), pendingRun.ts (a kickoff is REQUESTED, never inferred),
               versusRoom.ts (which room you are holding, for the chrome's strip)
  components/  presentational React (App composes them); the tournament is drawn by
               GroupDrawReveal / StandingsTable / MatchdayCard / Bracket, with
               matchUi.tsx + matchView.ts holding the shared presentational atoms and
               the per-match view-model;
               SquadBrowser + TeamRoster are the read-only squad archive (see below);
               CupRunScreen (Cup Run + career) is a lazy-loaded (React.lazy) route
               screen, as are ChallengesScreen and CabinetScreen (the trophy cabinet);
               BudgetMarket is the budget build's left-column panel (shares
               the home page's Pitch + ratings/line-up, not a separate screen);
               BuildSurface draws a build's three columns from a `Build` (BuildPage owns
               the layout, BuildSurface the wiring) and buildControls.ts says which of its
               controls are offered; versus/ is the room (lazy-loaded, see below);
               navUi.tsx holds the tabs navigation's atoms (TabRow, TabBottomBar, SubTabs)
  config.ts    FEATURES flags (chemistry, teamRatings, removePlayers, movePlayers,
               randomTeam, squadBrowser, stickerAlbum, stickersOnCupWinOnly,
               stickerImages, budgetDraft, challenges,
               trophyCabinet;
               plus `accounts` and `pvp`, both DERIVED from the build env - `pvp` also
               needs VITE_REFEREE_URL, so accounts alone cannot put a Versus tab on a
               site with no referee, see below) +
               STICKER_TIERS / STICKER_TRADE_COST / STICKER_DISCOUNT +
               BUDGET_BY_TIER (BUDGET_DRAFT is checks-only now) + BANK_CAP (how many
               stickers one run may bank; the server states it too, see below)
  App.tsx      composition only: it branches its screen by the URL (react-router), owns
               the album / career / settings / pool, and instantiates ONE build. The
               reducer, the roll animation and the scroll effects are useBuild's now
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
`/cup-run`, `/career`, `/album`, `/records` + `/records/cabinet`,
`/squads/*`, and `/versus` + `/versus/:code` (one destination, gated on `FEATURES.pvp`). Anything else hits a catch-all `<Navigate to="/">`, which is what the
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

## Navigation: six tabs

Roadmap item 27, **shipped 2026-08-21 and now the only navigation.** It went in behind a
runtime switch (`?nav=tabs`), was compared against the old chrome for a day, and the
switch, the old chrome and `src/nav/navMode.ts` were deleted once it won. There is no
`TABS` branch and no preview toggle any more: if you find one, it is a leftover.

**IT WAS FIVE UNTIL 2026-08-31 AND VERSUS IS THE SIXTH**, the only one ever added, and the
reason is worth keeping because the rule that held the bar at five has NOT changed. A tab is
an address you need from anywhere. While versus was one live room at a time it was an evening
you went to and left, so the front-page door was the right size for it; duels are played over
days and are the only thing in this game somebody else can be waiting on, so "is anything
waiting for me" became a question worth answering from the album. Versus sits last, being the
one destination that is not about your own career, and it is gated on `FEATURES.pvp` - a
build with no referee configured still has five. The phone bar's column count follows the
item count rather than a literal `grid-cols-5`, which is what stopped the sixth tab wrapping
onto a second row below the fold. Do not add a seventh without a reason of that shape.

- **What replaced what:** the footer text nav (four of eleven destinations, 11px, below the
  fold) is gone, and so are the two launcher door cards and the two navigation cards that
  sat inside the build page's left column. In their place: **Play, Career, Album, Records,
  Squads** (and now Versus) - as a row that carries the masthead's ink rule from 700px up
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
  `/records/cabinet` (the two honours screens as segments of one destination, which is why
  the honours are one tab and not two). `/group` and `/knockout` are **gone** (see "There is one way
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
- **PLAY IS THE SINGLE-PLAYER GAME, and nothing about Versus is under it** (2026-09-01,
  a reported bug: *"when I have a running versus room I cannot get back to the home page,
  clicking PLAY always forwards to the versus page"*). Three things had grown there while
  Versus was a mode with no address of its own, and all three are gone:
  - **The Play tab's destination** preferred a held room over the run and the build
    (`playTo = roomTo ?? ...`), so anybody in a room could not reach the front page at
    all - the tab that leads to the cover forwarded off the cover, and the crest was the
    only way back. That was defensible when Versus lived behind a door on this very
    screen; the moment Versus became a tab, the Play tab was lending an address to a
    destination that already had one, and charging the single-player game for it.
  - **The cover's Continue** led with "Back to your room", outranking the Cup Run.
  - **The hero's "Play somebody" door**, which was the cover's own way into Versus and is
    now a second answer to a question the tab bar answers from every screen.
  **What replaces all three is the strip that was already there**: the chrome's one-line
  "Versus CODE - <line>", under the tabs on every screen but the versus page, which is
  what P29's "tapping the crest out of habit mid-room does not strand you" is actually
  for. It reaches the room from the album and the squad browser too, which the Play tab
  never did. So the fix gives a destination back and takes none away, and `npm run checks`
  pins it - with the strip as the vacuity guard, because "Play does not mention the room"
  is trivially true of a build that dropped the pointer altogether, and that would be the
  worse bug. **The general rule: a tab is one destination, and a mode with its own tab
  does not get to borrow another one's.**
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
- **"In position" is AIMED FROM THE PITCH, not from the list, and this is worth knowing
  before concluding the market has a gap.** `BudgetMarket` prints name, flag, year, rating
  and price and never references `positions`, so reading that file alone makes it look as
  though a market build is flying blind. It is not: hold a player and `Pitch` pulses his
  **natural** position amber (`SLOT_AMBER`, when `positions[0] === slot.position`) and every
  other position he can fill white (`SLOT_WHITE`). `App` passes the market's held card to
  the identical `selectedPlayer` prop, so both build paths get it. So the player follows the
  amber pulses, for the chemistry point and for the **Textbook** honour alike, and nothing
  needs adding to the rows. This was written up as roadmap item 40 with a mock and measured
  width costs, then found void on exactly this ground; the item's history entry has the
  detail. **The answer is not in `BudgetMarket`, it is in the board beside it.**
  **The two colours are the single-player board only** (2026-09-01): a versus room passes
  `naturalHint: false` and every slot the held player can fill pulses amber alike, because
  nothing in a room pays for a natural role - no chemistry (P25) and no honours - so the
  white pulse would have been advice the room does not back. See the versus section.
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
- **It has TWO views**, switched top right beside the dataset toggle: **Players**, the
  table above, and **Teams**, one row per squad with country, year, **Top XI** and **team
  average**. The Teams view shares the country and World Cup filters (they carry across
  the switch, so "1970" narrows both), drops the player-only ones, and reads whichever
  dataset the toggle is on.
- **The country cell is the link between the two views.** Clicking it on a player opens
  his squad in Teams; clicking it on a team opens that squad's players. It REPLACES the
  query rather than adding to it (`openSquad` clears the positions, the collectible, the
  rating range and the gap, then sets that one country and year), because it asks a fresh
  question about one squad and the filters set for a different purpose - especially the
  player-only ones, which are not even on screen in Teams - are not the ones you meant to
  carry in.
- **Top XI is the best eleven that can be FIELDED TOGETHER, not the top eleven by
  rating.** A team needs a keeper and a shape, so `bestXiTotal` (scripts/players-page.ts)
  solves a maximum-weight assignment of players to the line counts each of the game's 24
  formations calls for, and takes the best. A player may fill any slot in a line one of
  his positions belongs to. **Deliberately looser than the app's own draft rule**, which
  needs the exact role: at that strictness 9 of the game's 368 squads and 68 of 7a0's 302
  cannot field any formation at all, mostly for want of a natural winger, and a column of
  dashes says nothing about a team. It is also the fairer comparison, since 7a0 gives a
  player one position and `squads.ts` gives up to three. It is NOT the same number as the
  app's `squadOverall` (that one is the top eleven by rating, shape ignored): Brazil 2002
  reads 88.9 here against 89.1 there. Both are computed at generation time, in tenths.
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
- **It stays fast by never holding the dataset as objects.** The 9,625 rows decode into
  flat typed arrays (person, nation, year, number, position combo, rating, tier), so a
  filter is an integer scan and the name query is answered once per PERSON and read per
  row. The body is virtualised at a fixed row height, so only the visible window plus a
  small overscan is ever in the DOM. Measured in Chromium: a scroll frame repaints in
  ~1 ms, a full re-filter and re-sort of every row in ~5 ms (measured at 8,028 rows).
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
  Measured 2026-09-02: **5,535 players matched**, 987 rated identically, WCS running 0.55
  lower on average. `npm run gen:players` prints all three, so read them off a run rather
  than off this line - they move with every rating pass. The column prints the
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
  **Monumental** 97-99 (80 / 28 / 7 = **115** across the dataset on 2026-09-02; it was 53 before
  the 1990-2002 squads were researched, 81 before 1986, 84 before 1986's ratings were
  re-authored, 87 before 1982, 92 before 1982's hand-tuning put Platini over 90, 93 before
  1978, 95 before 1974, 100 before 1970 and 105 before 2026, so re-derive a count rather
  than trusting one written down here - this figure has been wrong nine times).
  **2026 added ten**, the most of any single drop: Mbappe 97 (the eighth Monumental, and
  his second card at that rating), Haaland 94 and Messi 94, Lamine Yamal 93, Rodri 93,
  Bellingham 92, Vinicius Junior 92, Hakimi 90, Dembele 90 and Courtois 90. Norway had
  never produced a collectible before. **Three of those ten have moved since**, in the
  2026-08-28 rating pass: Mbappe is 96 in both his cards, so the Monumental tier is back
  to seven, and Courtois and Hakimi fell out of the bands altogether. That is the note
  above working as intended rather than a mistake, and the reason to re-derive. Collectibility is derived at runtime (`domain/album.ts` `tierOf`), so
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
  the moment a rating crosses a `STICKER_TIERS` boundary, and 29 of 117 had no file on
  2026-08-28 (**all 115 are drawn as of 2026-09-01**, so the fallback is dormant, which is
  not a reason to delete it) - before this each gap collapsed its image box, so the grid grew
  gaps and the cards around them reflowed. It is a **data URI rather than a component**,
  so the two call sites left (`StickerCard`'s own art, and the lightbox hero) each need
  one line and keep their own very different layouts; they share
  `onStickerArtError`, which swaps the src once and sets a `data-fallback` flag so a
  failure cannot loop. **The front page's legends showcase was a THIRD, and it is
  `StickerCard` now** (2026-09-02): it drew a card of its own - a different border, a
  rating in the accent colour, a country code where the album has a flag - so the five
  rarest cards were a promise about a shelf that looks like something else. It is the
  album's card now, in a wrapper that carries the grayscale (`grid`, so the card
  stretches to the row exactly as it does in the album's own grid, and a name that wraps
  to two lines does not leave the four beside it short). The **grayscale is gated on
  `[@media(hover:hover)]`** and always was: b/w until hovered is a desktop reading, and
  on a touch screen there is nothing to hover, so the cards are in colour from the start
  rather than permanently grey. **The background is transparent on purpose**: the card's own
  surface shows through, which is what lets one fixed silhouette work in both themes.
  `npm run checks` does not fail on a missing file - the silhouette is a correct rendering,
  not a hole - it reports the count and `npm run ratings:sync` names the new ones, which is
  what keeps a gap from going unnoticed. See "The waiting list" above.
  **Art pipeline:** originals (full-size PNG) live in **`art/stickers-src/`**, which is
  NOT under `public/` and so is never deployed; `python scripts/build-sticker-art.py`
  resizes them to 400px-wide WebP in `public/stickers/<player.id>.webp`, which is what
  `StickerCard` requests (base-path-aware, lazy-loaded, `aspect-square w-full` hero
  image on collected cards). The originals average 1.3 MB against ~40 KB shipped, so
  serving them directly was ~139 MB of images for a grid of thumbnails. Re-run the
  script after adding or replacing art; it skips unchanged files. Retired art is
  parked in `art/stickers-archive/` (also undeployed), which is where `npm run
  ratings:sync` moves the original of anyone who drops out of the bands - it deletes the
  shipped card (an orphan is a hard failure) and never the original, because a rating can
  come back up and the drawing cannot. Prefer `ratings:sync` to running this script
  directly: it is one of the five things a rating change owes.
  **That directory is ALSO an abandoned scope, and it is worth reading before drawing
  anything new**: 30 images predating the sync, either players who are not collectible or a
  second rendering of a card already drawn, listed either way in its own README. **Four were
  adopted on 2026-08-28** (Kempes 1978, Beckenbauer and Gerd Muller 1974, Rossi 1982), which
  is the worked example of taking one: rename it to the `player.id` scheme, put it in
  `stickers-src`, and let `ratings:sync` build the card and prune the line from
  `art/awaiting-artwork.txt`. Check the player by EYE first - a surname in a filename is not
  an identity, and that directory holds two Muellers.
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
  rating-sorted, searchable list for the targeted position (the WHOLE pool, windowed
  `MARKET_PAGE` = 60 rows at a time as you scroll - see "The list is the whole pool" below;
  unaffordable/used rows disabled; collectible tier stars). Every filter on it SURVIVES a
  purchase, and one "Clear filters" drops them all. You buy from all squads within a budget, each priced by
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
- **The filter row: cup, country, a rating band, Affordable, Collectible** (roadmap 36,
  2026-08-25; the band 2026-09-01). The
  region/confederation filter was **deleted** here; `data/confederations.ts` is still live for
  `domain/chemistry.ts` ("Same continent"), `domain/challenges.ts` and `domain/validateSquads.ts`,
  so do not follow the market's dropdown out of the codebase. Three rules worth keeping:
  - **The price ceiling is part of the FILTER, not a paint on the rows.** Sorted by rating, the
    rows at the top are always the dearest players; measured over the thirteen-tournament pool,
    with $10 left **not one of the first 60 strikers was buyable** while 1,415 affordable ones sat
    below them, at every position (CB 0 of 60 with 1,738, GK 0 of 60 with 954). `maxPrice` on
    `MarketQuery` therefore filters rather than paints, and it lands before the sort's own
    ordering question. `marketResults` returns `hiddenByPrice` alongside the rows so the empty
    state can say "nothing you can afford" instead of blaming the filters, which sends the player
    off adjusting the wrong control. (Those figures were measured when the list also STOPPED at
    60, which is no longer true - see the next bullet - so the affordable players were not merely
    below the fold, they were not in the answer.)
  - **THE LIST IS THE WHOLE POOL, WINDOWED AS YOU SCROLL** (2026-09-01, reported from the game:
    the market showed a screenful and the only way to cheaper players was a filter). It used to
    cap the ANSWER at 60 rows, which is a different and much worse thing than showing 60: a
    position holds between 463 and 2,257 players, the default order is by rating, and 60 rows of
    that is the dearest 60 - the cheapest centre-back on screen cost $13 against a pool floor of
    $1. So the cheap end of every position had never been in the list at all, and **a filter was
    the only route to it, which is backwards** - a filter narrows a list you can already see.
    `marketResults` returns every match now and `BudgetMarket` renders `MARKET_PAGE` more of them
    each time the foot of the list comes into view. Four things about it:
    - **The observer's root is the SCROLL CONTAINER, never the viewport.** The list scrolls inside
      its own 52vh box; against the viewport the foot counts as visible from the moment the panel
      is on screen, which loads every page at once and defeats the whole thing.
    - **It is rebuilt on each growth**, so a page that does not fill the box chains into the next
      one: a grown list leaves the foot where it was already intersecting, and an observer only
      fires on a CHANGE.
    - **The window resets on the QUERY, not on the rows.** Buying a player moves `remaining`, so
      with Affordable on the rows change on every purchase, and throwing the scroll position away
      each time money is spent is the wrong reading of "the list changed".
    - **One scroll container wraps BOTH views**, list and grid, so there is one box to observe and
      one to scroll back to the top rather than one each.
    `npm run checks` holds it in money: sorted by rating with no filter on, the cheapest man in
    the pool is one of the rows - with the vacuity guard that he is past the first page in every
    position sampled, since a 60-row cap would have satisfied a weaker claim.
  - **The sort says which END it starts from.** "Price" and "Value" are ascending and descending
    respectively and the words said neither, which is the one thing you need from a sort when
    what you are after is a cheap player. They read **Cheapest** and **Best value**.
  - **A RATING BAND, because the other filters cannot ask the question** (2026-09-01). Cup and
    country shop by identity and Affordable shops by money; the band is the only control that
    shops by STRENGTH, which is the direct way to ask for a squad of a given level rather than
    inferring it from a price. Two handles on one track, inclusive at both ends, and a band is
    sent as **null when it covers the whole scale** so an untouched control costs the filter
    nothing and reads as "no opinion" everywhere downstream. Four things about it:
    - **Its scale is the WHOLE POOL's, not the shopped position's.** A "70 to 80" that silently
      became "70 to 78" on the next slot would be a filter nobody asked for. It moves only when
      the year pool does, and then both handles widen back to the new scale - a band left
      outside it would filter everything out with the handles apparently at the ends.
    - **It does NOT narrow the two dropdowns**, exactly as the search box and the price ceiling
      do not, and for the reason the player index gives: a country list that reshuffled under a
      handle you are dragging is unpredictable.
    - **Dragging a handle past its partner PUSHES it** rather than stopping, which is what the
      player index's own range does. And the LOW handle is lifted above its partner in the upper
      half of the track: with both thumbs near the right end the one painted last swallows every
      drag, and the low one could then never be pulled back down.
    - **It is real CSS in `index.css` (`.mkt-rng`), not utilities**, because a range input is
      styled through `::-webkit-slider-thumb` / `::-moz-range-thumb`, which Tailwind cannot
      reach. The track is inert (`pointer-events: none`) so only the two thumbs take a pointer
      and neither input swallows the other's clicks.
  - **A FILTER SURVIVES A PURCHASE** (2026-09-01, reported from the game: "after a player has
    been set, the filter is currently set back"). Buying advances the shopped slot to the next
    empty one, and the cup and country filters used to be cleared on that move - so a squad
    built out of, say, Italy 1982 had to be re-filtered eleven times, once per purchase, and it
    read as the panel forgetting what it had been told. Nothing resets on a position change now.
    The reason the reset existed is real and is answered in two other places instead:
    - **`marketFacets` keeps whatever is selected ON IT even when that selection matches
      nobody.** A cup and country that had a left winger can have no keeper at all, and dropping
      the option there would leave a `<select>` whose value is none of its own children - which
      browsers render BLANK, so the control could not show its own state. Empty is a legitimate
      answer to a filter you set on purpose; a control that cannot say what it is set to is not.
    - **One gesture drops the lot.** "Clear filters" sits on its own row BELOW the rating band
      whenever anything is filtering, and the same action again inside the empty state, which is
      where it is actually needed. Below rather than in the chip row so it reads as sitting
      under everything it clears rather than as one more filter, and so a row that wraps does
      not shift under a control that comes and goes with the filter state. It is "Clear filters"
      and not "Clear" because the budget bar above has a Clear that empties the XI. The SORT and
      the view are deliberately not touched: they say how to read the answer, not which answer.
    `npm run checks` holds the facet rule over real empty cup-plus-country pairs, with the scan
    FINDING such pairs as its vacuity guard - with no empty pair the claim is moot.
  - **The two dropdowns narrow EACH OTHER, and nothing else narrows them.** `marketFacets` takes
    the selection and derives each dropdown from the candidates passing *every filter except its
    own*: pick 1974 and the country list is the 16 nations that were there, pick Wales and the cup
    list is 2022 alone. That is what makes "a dropdown never offers an option that would empty the
    list" true again - it held one facet at a time only, and with 416 squads over 15 years and 87
    nations 68% of the year-plus-country pairs are empty by construction. The search box and
    the two toggles are deliberately excluded: what a run can afford changes with every purchase,
    and a country list that reshuffled as money was spent would be unpredictable.
  - **A control is shown when it has more than one option OR a selection is active on it.**
    **22 of the 87 nations played exactly one World Cup**, so picking one collapses the cup facet
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

**THE EMAIL ADDRESS IS THE IDENTIFIER** (2026-08-31, migration **0023**, roadmap item 50,
**APPLIED 2026-08-31**). Two things had been sharing that job and only one
of them was enforced: the versus display name has carried a unique index since 0016, and the
address you actually sign in with had no constraint at all. Worse, `profiles.email` was
written once by `create_profile` at signup and never again, so a change of address left the
copy pointing at the old one for ever - and **an identifier that can go stale is worse than
no identifier**, because two accounts can then hold the same address, one in `auth.users` and
one in `profiles`, and a unique index would be guarding a value nothing keeps current. So
0023 is three statements rather than one `create index`: the stored form is FOLDED
(lower-cased, trimmed), there is a unique index on it, and `sync_profile_email` carries a
change of address across. `src/state/auth.ts` `foldEmail` is the same rule where the address
is typed, and `npm run checks` holds the two sides together - the failure it exists to catch
is somebody restoring `email.trim()` at a sign-in call site, which works for every address
typed in lower case and hands the server a second spelling the first time a phone
capitalises one. Three things it deliberately does NOT do: fold the local part (dots and a
`+tag` are the mail provider's rule, and folding them would merge two accounts somebody
keeps apart), let the referee see an address (P34), or add an email-change screen. **The
name rule is NOT relaxed by it**: a name is still one per person, so a lobby stays readable.

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
`npm run ratings:sync` does the first two (and the four other things a rating change owes)
and then tells you whether the push is owed; the push stays a separate command because it
needs the LAN or the VPN. A player
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
  Re-run the same probes after applying for real. **And when the migration DROPS something
  the server writes, re-run the SERVER's own verification too** (0022, roadmap item 49): the
  rehearsal proves the SQL is safe and says nothing at all about whether the container can
  still insert a row afterwards, which is the exact thing a drop puts at risk. Two habits that go with it:
  **"nothing reads it" is not "nothing writes it"** - dropping a column needs BOTH searches,
  and a plpgsql body is not checked when a column is dropped, so a stale `insert` inside a
  function fails at the next call rather than at migration time; and when a migration restates
  an existing function, take the body from the live server's `pg_get_functiondef`, diff it
  against the repo's copy first, and change only the line you mean to.
  **And when the migration touches a trigger on a table another COMPONENT writes, drive that
  component rather than the table** (0023, roadmap item 50). Its verification step is "can
  somebody still sign in", which SQL cannot answer: an `insert into auth.users` proves the
  trigger fires and says nothing about whether GoTrue's own insert still succeeds. The way to
  ask it honestly and send no mail to anybody is the **admin API with the service-role key** -
  create a user on a throwaway `@example.com` address, read the row the trigger wrote, change
  the address, then delete the user (`profiles.id` is `on delete cascade`, so the clean-up is
  the delete). That is the same reading as the item-49 rule above, one component further out.
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
- **Stage the files YOUR change touched, by name.** Somebody else may be working in this
  same tree at the same time, so `git add -A` and `git commit -a` can sweep up a stranger's
  half-finished feature, and a build failure in a file you never opened is theirs rather
  than a fault in your work. The whole rule is at the top of this file, under "you are
  probably not alone in this tree"; like the `main` rule above it, it is stated twice on
  purpose.

## Buttons and contrast

Reworked 2026-08-27, on the observation that the app had "about ten different looks of
buttons". It did, and the primary one had never met AA.

**EVERY BUTTON IS `btn(tone, size)`** (`components/matchUi.tsx`). Four tones -
`primary` (solid green), `secondary` (ink outline), `quiet` (line outline, the app's
genuine third emphasis: Back, Refresh, Auto-fill, the masthead's two) and `danger` - by
three sizes: `lg` a page action, `md` one inside a card, `sm` one in a row or a toolbar.
`PRIMARY_BTN`, `SECONDARY_BTN` and `DANGER_BTN` are just the three common pairs, kept as
names because most call sites want them. **Do not write a button class string.** What it
replaced: those two tokens plus a bespoke one in each of `CompletePanel`, `SetupPanel`,
`ModeSelect`, `SquadBrowser`, `UnreachableScreen`, `SettingsModal`, `AlbumScreen` and
`BudgetMarket`, and four different paddings appended to the outline base - every one a
near-copy differing by a pixel of padding or a point of type, which is the shape of a token
nobody could find. **Nothing was invented**: the turf-flat identity (rounded-[5px], 1px
border, display face in extrabold uppercase) is exactly as it was.

**THE PRIMARY FILLS WITH `pitch-dark`, AND THAT IS A MEASUREMENT.** White on `pitch` is
**4.00** in light and **3.25** on graphite, against the 4.5 a 13px bold label needs - so the
app's main button had always failed AA. On `pitch-dark` it is 8.08 and 10.34. The hover
lifts to **`--color-pitch-hover`** (5.62), which exists because the bright `pitch` would
have dropped it back under on hover. **`npm run checks` computes all of this from the real
tokens** (`scripts/checks/ui.ts`) and fails on any tone below 4.5 in either theme, resting
or hovered; putting the primary back on `pitch` reads `primary light 4.00, primary dark
3.25`. The 4.5 is deliberate and written down there: the relaxed 3:1 is for text at 18.66px
bold or larger, and the biggest label in this app is 13px.

**`--color-pitch-ink` IS GREEN AS TEXT, exactly as `--color-amber-ink` is amber as text**,
and it was added for the same measured reason: the surface green is 4.00 on panel, so every
small green label in the app - the YOU badges, the earned ticks, a button's hover - missed
AA in light. All 48 `text-pitch` uses moved to it; none sat on a dark fill, so the sweep was
mechanical and the DARK theme renders identically (there, ink and surface converge). Amber's
own token was also nudged from `#9a6512` to `#8a5a0f`, because 4.42 on `ground` is a miss.

**A FILLED AMBER PILL WITH WHITE TEXT CANNOT BE MADE TO PASS, so do not try.** Amber flips
lightness between the themes, so white on it is 2.49 / 2.13 and dark ink on it is 6.70 /
1.83 - there is no foreground that works in both. The three that shipped that way (the
album's and the sticker card's duplicate counts, the run XI's Boost tag) use the tinted
idiom `CareerHub` already had: `border-amber/40 bg-amber/[0.16] text-amber-ink`, which is
5.25 / 7.84. The one exception is a foreground that is dark in BOTH themes - the literal
`text-[#13211a]` - which is what `ModeSelect`'s hero CTAs and `PlayerBadge`'s amber disc use
and why those are correct rather than untidy.

**THE HERO'S AMBER HEADLINE NEEDED A SCRIM, not a new colour.** Amber on the hero's turf
measures **1.76**, under even the 3:1 large text is allowed, and no value of a mid amber
reads on a mid green - reaching 3:1 by lightening takes it to lemon. So the hero carries a
left-to-right `from-ink/55` gradient under the words only: 3.79 for the amber, 9.42 for the
white, and the tactics board on the right stays exactly as bright.

**`UnreachableScreen` IS THE ONE PLACE THE STRINGS ARE WRITTEN OUT BY HAND**, and it has to
be: `main.tsx` renders it before the app exists, so importing `matchUi` would drag lucide,
react-router and `Flag` onto that path. `npm run checks` asserts its two literals still equal
`btn('primary')` and `btn('quiet')` - a screen nobody sees until something has gone wrong is
exactly the one that drifts.

**NO DESCRIPTIONS INSIDE A BUTTON.** A button says what it is; the line under the row says
what it does. `AscensionPicker` had already settled that shape - short labels, one sentence
beneath that follows the selection - and the versus room settings were rebuilt onto it,
which took four sentences off the screen per decision. The exception is a card you are
choosing BETWEEN on its own merits, and the boost offer is the case: there the description
is the choice.

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

## The build is an instantiable unit

Wave 4 of roadmap item 18, 2026-08-27. **Building an XI is no longer the composition
root's own body**: `hooks/useBuild.ts` holds the reducer, its two effects, the three
interaction machines and the eleven handlers, `components/BuildSurface.tsx` draws the
three columns from the result, and App instantiates ONE of them. It exists so a versus
room can hold a SECOND one (pvp-plan P29), and the point is entirely about writes rather
than about tidiness.

- **The two writes are the seam** (`state/buildIo.ts`), and they are handed in. The app's
  build gets `soloBuildIo` and behaves exactly as before; a room gets `detachedBuildIo`,
  which writes nothing at all. **Both halves were a real, reproduced bug**, not a worry:
  driving a second build through `soloBuildIo` in the real app overwrote the solo XI
  (one player at 4-3-3 became three at 3-5-2) and **deleted the Cup Run key outright**,
  because `START_DRAFT` calls `saveRun(null)`. Through `detachedBuildIo` the solo build's
  stored state came back byte-identical and the run was untouched. And while signed in
  that first write is a server round trip **per tap**, where one failure raises the
  blocking unreachable screen (D9) full screen with a pick clock running.
- **NOTHING IN THE BUILD MAY IMPORT THE STORE, THE ROUTER, THE CAREER OR THE ALBUM.**
  `detachedBuildIo` intercepts the two writes it is given; it cannot intercept a
  `store.saveX()` written straight into the hook, or a `useNavigate` that walks a player
  out of a room mid-draft. `npm run checks` asserts the import rule over both files, with
  the composition root as its vacuity guard - the same scan has to FIND all five of those
  in `App.tsx`, or the check is not reading imports at all.
- **Which argument each io is built with is a source check, deliberately.**
  `createBuildIo(null)` writes nothing because there is nothing to write to, so no
  behavioural test can tell a detached build from a mis-wired one: a copy-paste making the
  export `createBuildIo(store)` passes every other assertion in the file. The check reads
  the two export lines.
- **The build is handed its money and its re-rolls, it does not look them up.** The app
  passes the career's transfer budget and the Extra Re-roll tier; a room passes its host's
  figures (P8: no part of a career reaches a room). `budgetOf` and `extraRerollsOf` are
  still read in App, which is where the career lives.
- **`dist/assets/*.css` is byte-identical across the change** (`4ead9e6e...`), which is the
  cheap proof that the rendering MOVED rather than being rewritten - the same proof the
  wave-3 token migration used.
- What is NOT in the unit, on purpose: the album, the career, the run, routing and the
  page's layout (`BuildPage` still owns the grid). Those are the app's, and a room has
  none of them.
- **Wave 5 uses it, and the seam held.** A room's draft is a second `useBuild` with
  `detachedBuildIo`, `ROOM_CONTROLS` and the room's own pool and budget, and the only
  thing wave 5 had to ADD to the build was a way for the server to overwrite the board
  (`SYNC_XI`) and a callback fired beside a purchase (`onBuy`), which is where the pick is
  posted. Nothing about persistence had to be revisited.

## Versus: a room, and what it is not allowed to touch

Roadmap item 18, **CLOSED 2026-08-27, all nine waves**. Waves 0 to 3 (the rules, the room's
state machine, the migration and the referee) shipped and were deployed 2026-08-26; waves 4
to 9 all landed 2026-08-27 - the build as an instantiable unit, THE FIRST PLAYABLE HALF, roll
rooms with the ratings switch, rooms of four and eight, the public half, and the closing
pass. **Two, four or eight people play a whole knockout**, found on a public list or reached
with a six-character code: lobby, draft, the draw, the matches, the bracket, the result,
whoever goes out first stays and watches the rest, and a room nobody is in closes itself. The
plan is `docs/pvp-plan.md` and it is the thing to read before touching any of this.

**WHAT IS DELIBERATELY NOT BUILT, so nobody goes looking for it:** P41's per-pick **Skip**,
and P42's **move a placed player IN A ROLL ROOM**. Both need an instruction a per-pick draft
does not have (it takes picks and re-rolls and nothing else), so both are a server change
plus a deploy rather than a screen, and they share roadmap item 44. In a per-pick room the
clock is therefore still the only way a window ends early. **P42 IS DELIVERED FOR A BUDGET
ROOM** (P52, item 47): there the board is submitted as a map, so moving and un-buying are
the same instruction as buying and needed no new rule - which is why item 44 shrank rather
than closing. Everything else the plan locks is live: every setting the referee accepts is
reachable from the create form, which is checked.

**PRACTICE OPPONENTS, DUELS AND THE WHOLE-DRAFT BUDGET ROOM ARE ALL LIVE ON THE SERVER**
(roadmap items 45, 46 and 47, all closed 2026-08-30). Migrations **0019, 0020 and 0021 are
applied** and the referee was rebuilt on the 30th, taking the schema to **0021** with the
container matching it. **This file said the opposite until 2026-08-31 and it cost real work**, because
the natural thing to do with an unapplied migration is to edit it in place, which is exactly
wrong once it has run. Two habits come out of that and both are cheap: **`docs/ROADMAP.html`
is the record of what is deployed, not this file** - check the item before believing a
deployment claim here - and `supabase/migrations/README.md`'s table says which migration last
touched each thing. **None of the three has been played by a person, and no roadmap item
tracks that any more**: item 48 was closed on 2026-08-31 because the owner plays them on the
fly while going through versus, rather than as a scheduled pass, so the list would only have
been saying "not played yet" until somebody edited it. The caveat therefore lives here
instead: a deploy proves a room can be created, read back and changed, and proves nothing at
all about whether the screens say what the rules do. Treat a versus screen as unproven by
hand, and open a NEW item for whatever turns up, with the reproduction in it.

**NOTHING IS QUEUED, AND THE SCHEMA IS AT 0025.** `0025_pvp_remove_member.sql` (the host
throwing somebody out, below) was applied on 2026-09-02, and the **referee was rebuilt the
same day** from `699c604`, which closed the two rebuilds that were waiting on it (roadmap
items **55** and **56**): the `/remove` route is live, and so is the rule that leaving a
duel's LOBBY costs nothing. Both were verified on the running container - all six
`--verify` steps, plus `POST /v1/rooms/ZZZZZZ/remove` answering `no-such-room` rather than
having no such route.

**AND THE THING THAT COST AN HOUR THERE WAS A VPN, NOT THE NAS.** The item those two
rebuilds sat in said in bold that it "needs the home machine", on the evidence of a retry
that landed on a corporate network (192.168.110.x plus a 10.119.240.x tunnel) where
192.168.1.115 answered neither ssh nor ping. That was the **wrong tunnel**, not the wrong
machine: on the right one the same laptop came up on 10.8.0.6 and ssh let straight in. So
**a failed reach proves the route you were on, not the machine you were on** - check the
tunnel before concluding a deploy has to wait for different hardware. The asymmetry worth
remembering either way is real and unchanged: `push:sql` goes over HTTPS to the public
name and works from anywhere, which is why a migration can be applied from a machine that
cannot deploy the container.

**AND BEFORE A REBUILD, CHECK THE SCHEMA AGAINST THE REFEREE'S OWN SOURCE, not against
this file.** The standing order (migrations before server) cuts the dangerous way round at
a rebuild: an old server against a new schema is harmless, a new server against an old one
fails on its first read. The 2026-09-02 rebuild was preceded by probing every artifact of
0019 through 0025 over HTTPS, and one apparent mismatch resolved itself in a way worth
knowing - **`pvp_rooms.invited_id` is absent from the live database and 0020 adds it,
because 0022 drops it again**. The live shape was right and a stale checkout was doing the
disagreeing, which is also the reminder to `git pull` before believing a drift.

**The two rebuilds before it went in on 2026-09-02** (roadmap items 52 and 53, both closed). That rebuild carried two things whose client halves
had already shipped: the week that resolves an abandoned duel (below), which is read by the
SWEEPER, and the **invitation read** a link's sign-in screen asks for
(`GET /v1/rooms/:code/invite`). Shipping the client first was safe because both degrade to
saying nothing - an old container has no window to warn anybody about and answers
`no-such-route` to the invitation, which the screen reads as "nothing to say about this
link" and falls back to the code alone. Both were then DRIVEN on the real server rather
than assumed, `scripts/deploy-referee.sh --verify` probing the invitation read as its step
6, since it is the one route a reverse proxy can break on its own by demanding a token.
**The referee was rebuilt on 2026-09-01 as well** (roadmap item 51, closed), which is what
put the duel lobby and the forfeit on the server. **0024 was applied the same day** and it
is the one migration in this repo whose
order genuinely did not matter in either direction, because nothing the referee WRITES
changed: a forfeited room is an ordinary `ended` room with a champion, through columns that
have existed since 0016. `0023` is an ACCOUNTS migration (the email address as the
identifier, roadmap item 50, applied 2026-08-31) and the referee needed no rebuild for it,
since it reads three columns of `profiles` and `email` is deliberately not one of them. See
"Accounts" for what it does.

**A WEEK-LONG RULE IS VERIFIED IN FOUR SECONDS BY BACKDATING THE ROOM, not by shortening
the clock** (2026-09-02, items 52 and 53). The abandoned-duel rule is measured off
`pvp_rooms.touched_at`, so the honest live test is to play a duel up to the point where one
team is in and the other is not, `update pvp_rooms set touched_at = now() - interval '8
days'`, and let the sweeper find it on its next pass. Driven that way on the real server:
the sender was crowned, and `pvp_records` moved **one win and one room won to him and one
loss to the absentee** - 0024's walkover branch working on live data rather than in a
fixture - and deleting the test room took both figures back out again. Nothing was mocked
and `DUEL_IDLE_MS` was not touched, which is the point -
shortening it for a test is the one edit that would quietly halve what a duel may take.
The rest of the flow is ordinary curl against the public URL with a session minted on the
box from `JWT_SECRET`, exactly as `--verify` step 4 does it, so the gateway is in the path
too. **A room created for a test is deleted afterwards**, and the record it moved goes with
it, because `pvp_records` is a VIEW.

**AND TWO FIELD NAMES IN ONE SHELL GLOB TEST THEIR ORDER, not their presence** (2026-09-02).
`--verify` step 6 read `*'"hostName"'*'"seated"'*`, which needs `hostName` FIRST, and the
invitation answers with the seat count several fields earlier - so a route that was working
perfectly reported itself unverified, on the one step that exists because nothing else can
see that route at all. Step 4 was carrying the same shape and passing by luck. One field a
pattern, the faults tested first so a payload carrying one of those words cannot shadow
them, and `npm run checks` refuses a two-field glob anywhere in that script now. **A
verification that fails on a working system is worse than none**, which is the same reading
as the sweep that would not say why it had failed.

**A REHEARSAL CAN CATCH A DOUBLE COUNT THAT NO FIXTURE WOULD, and 0024 is the worked
example.** Its risky line is the `not exists` that stands the walkover branch down once a
room has a match under it; drop that and a room is counted twice. Rehearsing the view on the
real server (in a transaction, rolled back) and then rehearsing it AGAIN with the clause
removed showed the mutant moving two accounts that had nothing to do with the test row - so
the guard was proved load-bearing against rooms that already existed, which a synthetic
fixture could never have shown. **Mutate the rehearsal, not just the migration.**

**0022 WENT IN ON 2026-08-31 WITH A REFEREE REBUILD** (roadmap item 49, closed; the schema
has moved on since, see above). `0022_pvp_duel_by_link.sql` drops `pvp_rooms.invited_id` again
(see the duel reshape below), and **its order was REVERSED from the standing rule**: the
referee as deployed WROTE that column on every room it created, so dropping it first would
have stopped any room being opened at all. Server first, then the migration. **That
inversion is the general lesson**: "schema before container" holds because an old container
never writes a NEW column, and it simply does not hold when a column is going away. Ask
which way the write points before choosing the order.

**THE PRACTICE OPPONENTS** (2026-08-29, roadmap item 45). A host can fill the empty chairs of
a room of four or eight with bots that build their own strong XI, so a tournament can be
played without eight people. `PVP_PROTOCOL` was deliberately **not** bumped: the change is
additive (an old referee simply never creates a bot), and bumping would take the whole of
Versus down for a button. See "Practice opponents" below.

**THE BUDGET ROOM'S DRAFT** (2026-08-30, roadmap item 47, plan P52). Buying an XI in a room
runs one clock over the whole draft instead of eleven twenty-second picks, and a player may
move and un-buy inside it. It **degrades correctly on its own**: an older referee sends a
budget room its pick windows and no `draft` block, and the screens draw the per-pick draft
they always drew. See "A budget room runs one clock" below.

**A DUEL HAD NO WAY TO CHOOSE A SHAPE FOR ONE DAY, AND `ShapePicker` IS WHAT CAME OF IT**
(2026-08-30, roadmap item 51). Reported from the game, and it was true of both sides: the
formation control lived inside the lobby screen, and for one day a duel had no lobby, so
**neither player could pick a formation and every duel was played 4-3-3 balanced**. The plan
had asserted the opposite ("both shapes are already chosen by then") and the assertion was
true of no code at any point - see its findings, which now carry that as its own lesson. It
was first repaired by widening `setLineup`'s gate to "you have not taken anybody"; a duel has
a lobby again (see DUELS below), so the gate is back to **"in the lobby, and only there"** for
both paces - one rule rather than one per pace. What survives from the repair, and is the
useful half, is that **the control is its own component** rather than a block inside
`RoomLobby`: `npm run checks` reads the screen for it, because a screen that silently loses a
setting looks exactly like a screen that never had one. It draws the single-player build's
own `Pitch` beside the chips, so the eleven circles slide to their new slots as the shape
changes rather than a picture being swapped - the same animation, from the same component.

**DUELS** (2026-08-30, roadmap item 46, plans P51/P53/P54). A duel is a challenge you send by
link, played in both your own time: whoever follows the link takes the seat, you each build
whenever you get to it, and the match plays itself as soon as the second team is SENT. Three
things beyond that are settled and one of them was settled twice:

- **NOTHING IS DEALT UNTIL BOTH PLAYERS ARE IN AND READY**, and the reason is an exploit
  rather than a symmetry (2026-08-31, reported from the game, plan P54). A duel spent one day
  opening **straight into its challenger's draft**, on the reasoning that waiting for somebody
  to accept buys nothing - and what it actually bought was a free re-roll through the front
  door: **"I can just close the room again and re-open one until I have a banger team."**
  Opening a challenge is free and calling one off is free, so a squad you disliked cost
  nothing to reject. So a duel waits in a **lobby** like every other room, where each player
  chooses a shape and presses Ready, and the SERVER starts the draft when it is full and
  everybody is ready - `startRoom` refuses a duel outright, because P48's "the host may start
  over somebody who has not pressed Ready" would deal a squad to a player who never agreed to
  play. **Before making a step free, ask what it is the undo of.**
- **AND LEAVING ONCE THE SQUADS ARE DEALT IS A FORFEIT**, which is the other half and does
  not work without the first: a lobby that hides the squad is worthless if you can walk out
  once you have seen it. The DEAL is the commitment, so from the moment the draft starts
  leaving ends the room for both with the player who stayed as the winner. **In the lobby it
  costs nothing, at either end** - taking a seat is not the commitment, which is the
  correction of 2026-09-02, see "WITHDRAWING IS LEAVING" below.
- **Finishing is DECLARED in every duel** rather than only in a budget one (the send button),
  and the challenge is **addressed by link and by nothing else** (`invited_id` dropped by
  0022).

**A FORFEIT WRITES NO MATCH AND NEEDED NO COLUMN.** There is no honest 0-0 to record for a
game nobody played and `pvp_matches.decided` has no word for one, so the encoding is a room
that was **WON with no match under it** - a state a room that actually played can never be in,
since a duel that finishes normally has its match and every other unplayed ending leaves no
champion at all (`roomClosed`). `walkover` in `domain/pvpView.ts` is that reading for the
result screen, and **migration 0024** is the same reading in SQL, so `pvp_records` counts the
win and the loss. That migration is unusual in being independent of the deploy in both
directions: nothing about what the referee WRITES changed.

**AN ENDED DUEL WITH NO OUTCOME IS NOT ON THE LIST AT ALL** (`duelListed`). A challenge nobody
took up, filed under "Played", is untrue - and `won` is the test rather than the status
because it is exactly "this one has an outcome", which also degrades correctly against a
referee that has not been rebuilt: there a forfeit reports no winner and the row disappears
rather than lying about it.

**`PVP_PROTOCOL` WAS NEVER BUMPED FOR ANY OF IT**, so every skew has to be caught by testing
the ANSWER. **AN OLD REFEREE DOES NOT REFUSE A DUEL, IT SILENTLY OPENS AN ORDINARY ROOM** -
`pace` is a field it has never heard of, so it reads past it and answers 201 with a live room
of two - and a referee built on 2026-08-30 answers 201 with a duel that is already
**drafting**, which is the shape the exploit above lives in. `duelDowngraded` therefore tests
the STATUS as well as the pace, and **that line has now pointed both ways**: it read
`status === 'lobby'` for one day and reads `status !== 'lobby'` again. Both were right about
their own day, and what makes it testable at all is that a duel is only ever created in one
place and a created duel has exactly one shape. The create path closes the room it was handed
rather than walking the player into a game they did not ask for; the form also greys the
button out up front, probed off `GET /v1/duels` answering `no-such-route`. **That probe cannot
see the second skew** - a container that has duels answers the route perfectly well - which is
the whole reason the answer is tested rather than the request. See "A duel" below.

**THE SERVER WAS DEPLOYED THROUGH WAVE 8 AT SCHEMA 0018** (referee redeployed and verified
2026-08-27, roadmap item 43); **it is at 0022 now**, rebuilt 2026-08-31 - see the paragraph
above, which is the current one. Wave 8 needed **no migration at all**: every column it
reads was written by 0016 and had been waiting for a caller (`pvp_rooms.touched_at`,
`pvp_members.last_seen`, the `pvp_rooms_open_idx` partial index, the `pvp_records` view,
`pvp_name_reports`). It did need the container rebuilt, for `GET /v1/lobby` and the `/leave`
route below. **Deploy the referee before the client that talks to it**, always: it is the
same standing rule migrations follow, and a session that cannot reach the NAS queues the
deploy as a roadmap item exactly as it would an unapplied migration.

**THAT DEPLOY TOOK THREE ATTEMPTS AND ONLY THE FIRST WAS THE REFEREE'S FAULT**, which is
worth knowing because the other two are the ones that will recur. The first was the missing
columns below. The second was the **docker bridge firewall rules being wiped by the container
operations of the deploy itself**, which takes the whole accounts stack down with it and is
already written up in `docs/nas-setup.md`. The third was `scripts/deploy-referee.sh --verify`
**aborting inside a stage while reporting success** - its last two steps reach the database
through compose on the NAS, which Synology needs a full path and root for, and that one stage
never ran the probe that finds it, so under `set -euo pipefail` a failing command
substitution took the script down mid-step. A verification that stops without saying so is
worse than none, and `npm run checks` now asserts every stage detects docker before using it.

**THE HOST CAN THROW SOMEBODY OUT, AND THE WHOLE FEATURE IS THE FACT THAT IT STICKS**
(2026-09-02, asked for from the game, migration **0025**, applied, and the **referee rebuilt
the same day** - roadmap item 55, closed). A code gets passed around and a public lobby is open to
anybody signed in, so the person who opened the room needs a way to say "not you" - and
every other answer they had was worse than the question: close the room and open another,
losing everybody already in it, or play it smaller, which throws away the seat rather than
the person in it. The rule itself is four lines of `removeMember` (domain/pvpRoom). What
needed a column is that **arriving at a room IS taking the seat**, so a removed player's own
screen re-joins on its next read - the host would watch them walk back in about two seconds
later, for as long as the tab is open. Hence `PvpRoom.removed`, `joinRoom` refusing on it,
and `pvp_rooms.removed uuid[]`. Six things about it:

- **IT IS A LOBBY RULE, and that is the same rule `leaveRoom` keeps, reached from the other
  side.** Past the start a member's XI is in a bracket other people are playing and the round
  is drawn by **pairing the survivors** (`drawRound`), so taking one out mid-tournament is not
  "one fewer player", it is a draw that no longer works and seven other people's evening
  voided by one tap (P15, P24). So the button is offered in the lobby alone, and the state
  machine refuses it everywhere else rather than the screen merely not asking.
- **A DUEL IS A ROOM, so its host may say "not you" to whoever opened the link** - and only
  while it is a lobby, which in a duel is exactly the window before anything is dealt. It
  therefore costs neither side anything, which is consistent rather than generous: the forfeit
  (`leaveDuel`) exists for abandoning a match that is under way, and a duel's lobby is
  precisely the part before commitment. Past that the room is drafting and the only way out is
  the forfeit, which is what stops a challenger re-rolling their squad by walking away. It is
  now the exact MIRROR of the challenger handing the seat back (P57, same day): both go
  through `withoutMembers`, both leave the challenge open for somebody else, and both cost
  nothing, because the line is the DEAL rather than the seat.
- **THE REFUSAL IS TESTED BEFORE THE SEAT COUNT, and that ordering is load-bearing.** The host
  emptying a chair is the exact moment one becomes free, so a removed player refused on
  fullness would get a refusal that came and went as other people arrived and left - and "the
  room is full" is a thing to wait out, where this is a decision somebody made. `npm run
  checks` pins it with a room that has been refilled, so `full` really is what the seat count
  alone would have answered.
- **IT WILL NOT REMOVE THE HOST, A BOT, OR ANYBODY FOR ANYBODY BUT THE HOST.** Not the host to
  themselves, because leaving already means something (the room closes, or the next seat is
  promoted) and a second name for it would skip that reasoning. **Not a practice opponent**,
  because those are a COUNT the host chooses (`setBots`, idempotent so a flaky tap fills the
  room once), and taking one out from underneath that count leaves the chips on the screen
  disagreeing with the room - the way to have fewer is to ask for fewer.
- **THE SEAT GOES THROUGH `withoutMembers`**, the same path the liveness sweep and `leaveRoom`
  take, so a removal and a departure leave a room in exactly the same shape. The room can
  never CLOSE there whatever that helper does with its last human: the host is a person, the
  host is staying, and the host is who asked.
- **THE REMOVED PLAYER'S SCREEN IS THE OTHER HALF, and it is the one nothing behavioural can
  see.** Their client sends the join itself, so the refusal has its own name
  (`removed-from-room`, 403) rather than `room-full`; the screen reads "You were removed" and
  **offers no Try again**, since every other reason a join fails is a moment and this is a
  decision that sticks; and the chrome's room pointer is dropped, which needed
  `useVersusRoom`'s hold to become seat-conditional (`if (next.you)`) - a PUBLIC lobby stays
  readable to somebody who is not in it, so the very next poll would otherwise put the strip
  straight back, advertising a room that will never take them.

**A COLUMN AND NOT A TABLE, stated because the precedent could be read either way.**
`pvp_bots` earned its own table because a bot is an entity with a name, a shape and an XI;
this is a set of at most seven ids, written whole by the `update pvp_rooms` that already
writes the status and read by the select that already reads it - so a table would be a fifth
round trip per room load plus a policy and a grant, to store less than `years` already
stores. What is given up is the foreign key: a deleted account leaves its id sitting in the
arrays of rooms it was thrown out of, which is harmless in both directions, since an id
matching nobody can never refuse anybody. It also means `npm run checks` covers the new
column for free, through the scan that reads `pgStore`'s `select` text against `rows.ts`'s
interfaces.

**LEAVING A ROOM HAS TO TELL THE REFEREE, and for a while it did not** (reported and fixed
2026-08-27). The Leave button cleared the local pointer and navigated, so the seat stayed
taken and P39's one-room-at-a-time then refused the player's next room with
`already-in-a-room` until the liveness sweep noticed (ninety seconds, the window at the time). P31's "leaving has
to be OBSERVED rather than announced" is about a closing tab and does not extend to a button
press: **observing what cannot be announced is not a reason to ignore what can.**
`leaveRoom` works in a LOBBY only for a LIVE room - past the start your XI is in a bracket
other people are playing (P15, P24); a duel is the exception and is leavable until its match is
played, at the price of losing it once its draft has started, see "WITHDRAWING IS LEAVING" below - and it shares `withoutMembers` with the sweep, because a lobby that
promotes a host one way and closes the other is two rules wearing one name. The navigation
does not wait for the answer: a player who pressed Leave is leaving, and a lost request costs
no more than the liveness window, which is what it used to cost every time. The refusal also needed an ANSWER rather than
just a sentence, since it stays reachable legitimately (a started room you walked away from):
the referee already sent the room's code as its `detail`, so `refereeMessage` names it and
`RefereeProblem` takes an `action` for the "Go to room X" button.

**AND NOT WAITING FOR THE ANSWER MEANS THE DUELS LIST HAS TO BE TOLD WHEN IT LANDS**
(2026-09-01, reported from the game: *"when I withdraw from a versus match, I still see the
match as open - only after a refresh the match is moved to PLAYED as a loss"*). Withdrawing
from a duel is a FORFEIT, so the row leaves "On now" for a loss under "Played" - and the
versus page reads its list on mount, which is the same instant the leave request goes out.
So the page **loses a race it did not know it was in**: the referee answers that read
honestly, with the room as it still is, and the answer is stale by the time it is drawn.
Then it sat there, because the two readers of that list run on their own slow beats (the
page ten seconds, the chrome's strip thirty) - which is the right beat for a move the OTHER
player makes and much too slow for one you just made yourself. **A poll cannot fix a race,
it can only shorten it.** `state/pvp/duels.ts` is the fix: one signal, fired **when the
referee has answered** and never beside the request, which both readers take. Two things
about it. It carries **nothing** - not the room, not the new row - because nothing on this
side computes what the list now says, which is the same rule as everywhere else here; it
says only that the copy in hand is out of date. And it fires on a FAILED leave too, where
the correct re-read is the one that shows the duel still on. `npm run checks` reads all
three files, since nothing behavioural can see this: a build that never re-reads agrees
with the server within ten seconds and looks right in every fixture. **The general shape:
when a screen navigates without waiting for a write, ask what the DESTINATION reads.**

- **Routes are `/versus` and `/versus/:code`**, reached from the Versus tab, not a segment
  under Play. It became **the sixth tab on 2026-08-31**, when duels made it a
  place you check rather than a place you visit - see "Navigation" above for why that is a
  change in what the mode is rather than a change of mind about the bar.
  **AND ON 2026-09-01 THE PLAY TAB STOPPED CARRYING IT, which was a reported bug** (see
  "Play is the single-player game" below): the front page's "Play somebody" door, the Play
  tab's destination and the cover's Continue all pointed at Versus, and the tab is the
  address now.
  `components/versus/` holds the screens, `RoomBracket` among them (the tree, and the draw
  ceremony that fills the wait): `VersusScreen` (the three gates - an account, a
  referee that speaks this build's language, a name), `VersusHome`, `RoomLobby`,
  `RoomDraft`, `VersusMatch`, `RoomResult`.
- **`state/pvp/referee.ts` is the ONE place that talks to the referee**, and it posts an
  instruction and renders the answer. Nothing on this side computes a room's next state
  from its previous one: every command comes back with the room as the caller may see it.
- **`hooks/useVersusRoom.ts` holds one room live**: the answer, the poll, the broadcast
  subscription, the liveness ping, and the pick clock.
- **`domain/pvpWire.ts` is the payload's shape, and BOTH sides import it.** The referee
  builds a `RoomView` and the browser reads one; describing it twice is how the two come to
  disagree while both type-check.
- **`domain/pvpView.ts` is every derivation the screens make**, pure and checked, for the
  same reason `domain/` is.
- **`referee/` is type-checked by `npm run build`** (it is in `tsconfig.node.json`, like
  `scripts/`) and driven end to end by `npm run checks`, with no Postgres and no socket. Its
  one runtime dependency, `pg`, is a devDependency of this repo and external to the bundle.
- **`FEATURES.pvp` derives from `VITE_REFEREE_URL` as well as the account server**, so
  configuring accounts alone cannot put a Versus door on the site whose every call fails.
  The deploy workflow already passes it; **deploy the referee BEFORE pushing a client that
  talks to it, always**, which is the same rule migrations follow. `PVP_PROTOCOL` has been
  `1` throughout, so the handshake cannot tell an old container from a new one - which means
  a client change that needs a new route needs the deploy scheduled, not detected.
- **`VITE_REFEREE_URL` POINTS AT THE ROUTE, NOT AT THE HOST**: it is `https://HOST/referee`
  (docs/nas-setup.md step 6), because the referee is a route on the account server's own
  gateway (P46). So a path in `state/pvp/referee.ts` is `/version` and `/v1/rooms/...` and
  never repeats the prefix. **This was wave 5's one production failure**: every call asked
  for `/referee/referee/v1/...`, the gateway matched nothing, the handshake read the 404s
  as a referee that was not answering, and the screen said "Versus is updating" - a
  deployed referee working perfectly and a client knocking on the wrong door. `npm run
  checks` now reads the client's paths AND the sentence in the deploy note that sets the
  variable, so changing the deployment shape without changing the client fails there
  rather than in a browser.

**FOUR THINGS A ROOM MUST NOT DO, and each is enforced somewhere you can point at:**

- **It must not write the player's saved game.** The room's draft is a SECOND build, handed
  `detachedBuildIo` (see "The build is an instantiable unit"): it persists nothing and it
  cannot reach the Cup Run. `npm run checks` reads the wiring, because a room handed
  `soloBuildIo` behaves perfectly until somebody's run disappears.
- **It must not offer a control that breaks the clock or that the referee cannot honour.**
  `components/buildControls.ts` is that list as data - auto-fill, Clear, Start over, the
  random-team shortcut, the badge's remove "x", moving a placed player, the chemistry card
  and the album's marks - with `SOLO_CONTROLS` all on and `ROOM_CONTROLS` all off, and a
  check that the two are the same shape and opposite. It is a LIST rather than a flag
  because each entry is broken for its own reason: auto-fill would make ten picks in one
  tap, Start over navigates out of the room, and **moving a placed player is P42's
  intention but the referee takes picks and nothing else**, so a move would be reverted by
  the next answer. That one needs an instruction the referee does not have.
- **It must not recommend a natural position, because it does not pay for one**
  (`naturalHint`, 2026-09-01). The single-player board pulses the held player's natural slot
  amber and every other slot he can fill white, which is the chemistry point and the
  **Textbook** honour being pointed at; a room awards neither, so the second colour was
  telling players one legal slot was the lesser one while the room scored the two
  identically. In a room every slot he can take pulses the same amber, in a roll draft and a
  transfer-market draft alike (the move destinations and the market's shop-here slot with
  them - it is one colour for "you can tap this"). `Pitch` DEFAULTS the flag to the two
  colours so the app reads unchanged, which is why `npm run checks` reads the wiring the way
  it reads the ratings switch: a room that stopped passing it would look perfectly fine.
- **It must not show chemistry.** `pvpTeam` takes no chemistry argument at all (P25), so a
  room's match is played on the plain eleven ratings; a card promising an effective overall
  four points higher describes a bonus the simulator never receives. `BoxScore` takes
  `chemistry={false}`.
- **It must not show the album, and the LINE-UP SHEET is part of that** (the sheet was
  fixed 2026-09-01, reported from the game). No owned-sticker discount (P3), no tier star,
  no Collectible filter: `BudgetMarket` and `SquadPanel` take `collectibles={false}` and so
  does `XiTable` now - it had gone on printing the star and the tier-coloured accent down
  the row, in the room's own line-up and in both XIs on the result screen, for a collection
  a room cannot add to. Like `ratings`, the flag DEFAULTS to on so the single-player callers
  read unchanged, so a room that stopped passing it would look perfectly fine: `npm run
  checks` reads the two call sites, and reads the CALL rather than the file, because the
  same prop reaches the market and the drawn-squad panel a few lines above.

**FIVE RULES IN THE CLIENT, each of which is a decision rather than a detail:**

- **THE BOARD IS OPTIMISTIC AND THE REFEREE IS THE TRUTH.** A tap places the player at
  once, because on a mobile link an unconfirmed tap looks like a tap that did nothing, and
  then the answer reconciles the board through `SYNC_XI`. Three ordinary things make the
  two differ: a refused pick, the clock filling a slot while you read the market, and a
  reload starting from an empty board with eleven picks already made. **A pick in flight is
  expected to disagree** - the reconcile waits for its answer rather than yanking the
  player back out for one render.
- **THE ORDINAL IS THE ROOM'S, read off the open window**, never counted on this side. The
  referee treats a repeated ordinal as the same pick (P36), so a retry on a flaky link is a
  no-op rather than two spent windows - and a number invented here would not line up.
- **THE CLOCK COUNTS DOWN FROM `performance.now()`, NEVER FROM A DEADLINE.** The referee
  sends remaining milliseconds; a phone whose wall clock is two minutes fast would
  otherwise see a window that expired before it opened. It is recomputed from that base on
  every tick and on `visibilitychange`, never accumulated, so a backgrounded tab comes back
  telling the truth. **The controls lock a measured round trip early**, so a tap you made
  in time is never answered with "the clock beat you".
- **AND IT IS DRAWN AS A BAR, NOT A NUMERAL** (2026-08-30). What a player needs from the
  clock is "how much of my window is gone", which is a proportion: reading one off a bar
  costs a glance, where reading it off "13" costs arithmetic against a window length nobody
  memorised, and a bar a quarter full is still legible out of the corner of an eye over a
  market you are reading. It cost the component one prop and that prop is the whole trap:
  **a proportion needs the window it is a proportion OF**, and the host chooses twenty or
  thirty (P20), so `PickClock` takes `windowMs` and `RoomDraft` feeds it `view.pickSeconds`
  - a literal twenty would draw a thirty-second window as full for its first ten seconds,
  and would agree with nothing and disagree with nothing either, which is exactly how P20
  went unbuilt for three waves. `npm run checks` reads both halves. The urgency stays in
  WORDS as well as in colour ("Nearly out of time", "Too late for this one"), which matters
  more now the numeral is gone, and the count itself lives on in `aria-valuetext`.
- **A TIE IS TURNED ROUND SO THE VIEWER IS HOME** (`viewerTie`). Home is randomised per tie
  and cosmetic (P44), while every match component here is written as "you and them" with
  `USER_SIDE` a constant. One pure relabelling beats teaching five components that a side
  is a parameter. `npm run checks` asserts the flip both ways and that doing it twice is
  the identity.
- **A NAME CAN BE CHANGED, AND IT NEEDED NO SERVER WORK** (2026-08-31). The name is on the
  versus page now - "You are <name>", beside the record, with a Change name button - and it
  opens the SAME `NamePanel` the first-time gate opens, with a `current` prop as the only
  difference. Three reasons it cost nothing: `set_display_name` refuses a key held by
  SOMEBODY ELSE rather than a key that is held (`v_holder <> v_user`), so re-claiming your
  own row IS the rename; no room stores a name (`pvp_members` holds a seat and every screen
  joins `profiles`), so a change reaches a lobby, a tree, a duel list and a result already in
  flight within one poll; and records key on the account (P22), so nothing won is left behind
  under the old name. **Do not "tighten" that comparison into a refusal for an account that
  already has a name** - it reads like a guard and would fail the rename screen with "that
  name is taken" against the player's own name, which is the least diagnosable sentence
  available. `npm run checks` pins it, and pins the one call site so picking and changing
  cannot grow two sets of messages. It is offered on the versus HOME only, never with a room
  code in the URL: a panel that replaced the room screen would take somebody out of a draft
  to rename themselves. **The name being unique is unchanged** (decided 2026-08-31, against
  the alternative of letting the email carry uniqueness alone): two people called Mario in
  one lobby is the cheap grief P22 exists to prevent, and the address being the identifier
  now is a separate statement, not a replacement.
- **A PRIVATE ROOM IS INVISIBLE UNTIL YOU TAKE A SEAT.** Reading one you are not in answers
  "no such room" rather than "not allowed", so a code cannot be confirmed by probing - which
  means arriving with a code and being told there is no room is the NORMAL first step. Do
  not "fix" that 404: it is not an error, it is the read that triggers the join below.
- **ARRIVING AT A ROOM IS TAKING THE SEAT** (2026-08-29). There is ONE door. `RoomScreen`
  sends the join as soon as the first read comes back, and what is left on that screen is
  the moment in between and the reason it did not work. There used to be two gates and they
  were the same gate: "Take your seat" for a code that answered 404, and "Join the room" for
  a public room you could already see - both showing a room you had chosen to open and
  asking you to confirm you meant it, which is a question with one answer, since the only
  ways to arrive are typing the code, tapping a lobby row and following an invitation link.
  Two things keep it honest: a ref fires the join **once per room**, because a refused join
  (full, started, already in another room) leaves the read failing exactly as it was and
  without the guard it would resend every two seconds; and that ref is **cleared on
  success**, so a seat lost LATER to the liveness sweep is taken again the same way rather
  than leaving the screen on "one moment" for ever.
- **AN INVITATION FOLLOWED BY SOMEBODY WITH NO ACCOUNT GETS ITS OWN SCREEN** (2026-09-01,
  reported from the game: the information a signed-out visitor got from a link was poor). A
  room is account-only (P17), so a link somebody was sent lands on the signed-out gate rather
  than in the room, and that gate answered it with the general pitch for the mode plus a
  sentence pointing at the account button in the masthead: it never said the link had worked,
  never said which room it was, and gave nothing to press. `SignedOut` (VersusScreen) branches
  on the code now - the invited half leads with the code and a sign-in button, and the pitch is
  one line rather than the page. Six things about it:
  - **SIGNING IN COMES BACK TO THE ROOM, and the whole of that is the RELOAD.** The dialog is
    an overlay over this page and `App` hands a sign-in over with `window.location.reload()`
    (the store has to be rebuilt against the account), so the reload lands on the URL the
    player is already on, which is the room's own address, and `RoomScreen` then takes the
    seat on arrival exactly as it does for anybody following the link with an account. So
    **nothing remembers the code across the sign-in** - and deliberately not: a stored pending
    invitation would go stale, and would seat somebody who signed in an hour later to sync
    their album. The address is the memory. `npm run checks` reads that handover, because
    turning it into a navigation breaks nothing except the promise this screen makes.
  - **AND IT SAYS WHAT THE INVITATION IS TO**, which took a route of its own (2026-09-01,
    the same day, and it is the point of the whole screen). It could not for a day: every
    read of a room needs a session and a private room answers "no such room" to anybody
    without a seat, so the most motivated arrival in the product was shown a code and a
    paragraph of general pitch. **`GET /v1/rooms/:code/invite` is the one unauthenticated
    room read in the design**, and it answers what is printed on an invitation - who opened
    it, what it plays, whether a seat is still there - and nothing whatever from inside the
    room: no member row, no XI, no formation (P19). `npm run checks` asserts the answer's
    key set as a WHOLE, so a field added to `InviteRoom` in a hurry fails there rather than
    shipping to every stranger holding a link.
  - **THE CODE IS THE CREDENTIAL, WHICH IS ONLY TRUE AT A LIMITED RATE**, so the route is
    metered (`referee/src/invites.ts`, 20 a caller and 240 in total a minute). Six characters
    from a 31-letter alphabet is 887 million, which is minutes of scripting unmetered and
    years at those figures - the numbers are that arithmetic rather than a feeling. Two
    properties are load-bearing and both are checked: **a refusal is free**, so one caller
    hammering their own limit cannot spend everybody else's budget through the global cap,
    and the map is therefore bounded by that cap. The limiter is a pure function of an
    injected clock, like everything else here (P32), so a flood is a check rather than a
    deployment.
  - **THE READ DOES NOT GO THROUGH `call`, AND THAT IS THE ONE THING NO FIXTURE CAN SEE.**
    Every other call in `state/pvp/referee.ts` fetches a session token first and throws
    `signed-out` when there is none - which is every visitor this screen exists for. So
    `readInvite` is shaped like `handshake`: its own `fetch`, no bearer. A tidy-up to
    `call<InviteRoom>('GET', ...)` would type-check, pass everything else, and show the bare
    code to every person who ever followed a link, so the checks read that function's source.
  - **NULL IS EVERY WAY IT CAN FAIL AND THEY ALL MEAN ONE THING.** No such room, a referee
    too old to have the route, an unreachable one, a rate-limited read: all four render as
    the screen did before the route existed - the code, and a line saying why there is
    nothing else. One fallback rather than four branches, no probe needed to choose between
    them, and it is what makes shipping this client before the container harmless.
  - **NOTHING IT SHOWS IS A PROMISE.** It is a snapshot read once (nobody sits on a sign-in
    screen, so it is not polled) and signing in takes a mail client and a minute, so the seat
    can be gone by the time they land. `RoomScreen` is what actually takes it and what says
    so when it cannot; the button only stops saying "take your seat" when the snapshot
    already says there is none.
- **THE ROOM STARTS ITSELF ONCE EVERYBODY IS READY, and counts three down to it**
  (2026-08-29). Two things arm the same countdown: everybody pressing Ready, and the host
  pressing Start on a room where somebody has not (P48 keeps that button, since Ready is a
  signal rather than a lock). The first is **DERIVED** (`everybodyReady`, domain/pvpView),
  which is the only reason it needed no new server route and nothing deployed: the same
  fact reaches every screen within a poll, so everybody counts down together, and at zero
  the HOST'S client sends the instruction it would otherwise have waited for a tap to send.
  The count is `performance.now()` based, like the pick clock and for the same reason. Two
  things about it are not obvious and both are load-bearing: it **disarms** the moment the
  room stops being full or somebody un-readies, so a seat lost at "one" is a cancelled
  kick-off rather than a Start the referee refuses; and it **gives up at zero after
  `KICKOFF_HOLD_SECONDS`**, because the client that sends the Start is the host's, so a
  host whose tab dies in the last second would otherwise leave everybody waiting on a
  kick-off that is never coming - the lobby stops promising one and the button reads "Start
  it again".
  **THE COUNT IS THE WHOLE OF THE FULL-SCREEN MOMENT, AND THAT IS A CORRECTION**
  (2026-09-01, reported from the game). At zero the cover used to swap in a SECOND screen -
  a big "Kick-off" over a line saying the room was beginning - and hold it until the draft
  arrived, which is one round trip away: so it was on and gone again inside a fraction of a
  second, and the one thing a screen made entirely of words has to allow for is being read.
  Three, two, one, and then the draft itself with the first squad rolling in front of you.
  What shows in the gap is the LOBBY, which is honest (the room has not started yet) and is
  where a kick-off that never lands already fell back to, so there is one fallback instead
  of two - it just says "Starting the draft" while the count is spent. The one
  asymmetry is accepted: a host's press on a room that was NOT all-ready has nothing the
  other clients can read, so they see the draft arrive rather than a count. Fixing that
  needs an instruction the referee does not have, which is the wall P41's Skip is behind.
- **EVERY CHAIR IS A ROW, INCLUDING THE EMPTY ONES** (`seatsOf`). A lobby is mostly about
  who is not here yet, and a list of the people present cannot say that: four rows with two
  of them empty is the room, where "2 of 4" is a count. It is also what makes the practice
  opponents read as what they are - a way to fill exactly those rows. Seats are PADDED
  rather than indexed by `seat`, because a seat number has gaps in it: a member dropped by
  the liveness sweep leaves theirs behind for ever, so seat 5 in a room of four is ordinary.
- **THE ROOM POINTER DOES NOT OUTLIVE THE ACCOUNT**, and that was a reported bug. It lives
  in `sessionStorage` and signing out RELOADS the page, so it survived into the guest
  session and the front page went on offering "Back to your room" - for a room only an
  account can read. A room is account-only (P17), so a pointer with no account is stale by
  definition: `App` refuses to READ one without an account (which covers a session
  expiring, or another tab, as well as a sign-out), and `AccountPanel` clears it on both
  ways out of an account. `npm run checks` holds both halves, because they fail differently.
- **THE INVITATION IS A LINK, and Share is the phone's own sheet.** A room is opened and then
  pasted into a message, so the lobby offers Copy link and (where the browser has
  `navigator.share`) Share, which opens the system share sheet rather than a menu of ours -
  the destinations are the ones already on the person's phone and nothing here has to know
  what they are. The code stays beside it because it is what gets read out loud. `inviteUrl`
  (domain/pvpView) builds the link from Vite's own base, so it works from `/wcsim/` and from
  the Docker image's `/` alike, and the copy has an `execCommand` fallback because
  `navigator.clipboard` is absent over plain http - which is exactly how the NAS serves this
  on a LAN.

**A COLUMN THE ROW MAPPER READS AND THE QUERY DOES NOT ASK FOR IS A SILENT DISASTER, and it
reached production** (2026-08-27, found by the first wave-8 deploy). `referee/src/rows.ts`
read `pvp_rooms.touched_at` and `pvp_members.last_seen`; the two `select`s in
`referee/src/pgStore.ts` named neither, and `pg` hands over `undefined` for a column it was
not asked for. **The two halves then failed in opposite directions**, which is what made it
so hard to see. On the READ nothing threw and every P31 lifecycle rule quietly stopped
working, because `NaN > SEEN_GONE_MS` is false - so the liveness drop, the fifteen-minute
lobby close and the thirty-minute room close were all dead. On the WRITE `atOf(NaN)`
threw from inside `save`, so **every command that mutates an existing room rolled back**: a
room could be opened and then nothing could be done to it, and the sweeper logged one room
code once a second for ever. Three rules came out of it and all three are checked:

- **`msOf` and `atOf` THROW rather than handing back `NaN`.** A time that cannot be read is
  a bug in the query, and it belongs at the load where the column name is still in view.
- **`npm run checks` reads the `select` text against the row interfaces**, because nothing
  behavioural can catch this: the offline store keeps rooms as rows built by `rowsFromRoom`,
  which by construction fills every field, so the round-trip check exercised the mapping
  thousands of times and the column NAMES in the query were the one untested thing in the
  path. Mutation-tested by removing each of the two columns.
- **A failed sweep names its fault** (`referee/src/fault.ts`, now shared with the 500
  handler). `sweep failed for E7AYHR`, once a second, is undiagnosable by the only person
  who can see it - which is the same mistake the 500 handler had already been corrected for.

**A 500 FROM THE REFEREE NAMES ITS FAULT, and stops short of its message.** The message can
carry a query, a row value or a connection string and stays in the log; the reply carries the
SQLSTATE plus whichever of the column, constraint, table and function the driver attached -
all of them schema identifiers that are already public in `supabase/migrations/`. A 500 with
nothing in it is undiagnosable by the only person who can see it, which is exactly what
happened the first time wave 5 met the real database. **Never `err.detail`**: Postgres puts
the offending row's values there.

**AND A VERSION ENDPOINT ANSWERING IS NOT A WORKING REFEREE.** `scripts/deploy-referee.sh
--verify` used to check `/referee/version` and two 401s, none of which touches Postgres, so
a deploy passed and the first database write the feature ever made was made by a player. It
now mints a session on the box from the stack's own `JWT_SECRET`, creates a real room,
**changes it**, and deletes it. Creating is not enough on its own and that gap cost a second
broken deploy: creating builds the room in memory and inserts it, so it never READS one back,
which is the half that was broken. The handshake is also blind to one drift by construction:
an image built a commit early whose squads are unchanged passes it and fails on its first
write.

**A REFUSAL IS ALWAYS SAID IN THE REFEREE'S OWN WORDS** (`components/versus/refereeMessage.ts`).
The referee names every refusal and, for the ones a deployment gets wrong, sends a fault
with it - `bad-signature`, `wrong-audience`, `expired` - and its own header says why: those
are how a deployment is debugged, since "the anon key was used" and "the session expired"
look identical from outside. Wave 5 shipped screens that collapsed all of it into "the
referee would not open a room just now", which is true of a wrong JWT secret, a name the
referee cannot read, a full room and a database error alike, and told nobody anything. Every
screen goes through one mapping now, anything unmapped still shows the code, and the ones
that are the OWNER's to fix say so rather than inviting a retry. `npm run checks` holds the
mapping against the refusals `referee/src/api.ts` actually returns and against the two
token-fault unions, so a new refusal without a sentence fails the suite.

**A SLOW ANSWER MUST NOT UNDO A FAST ONE** (`answerIsFresh`, 2026-08-30). A room is read
from three places that are not ordered against each other - the poll, the re-read the
broadcast triggers, and the answer to every command - so **the last answer to ARRIVE is not
the last one to have been TRUE**. It was reported as "changing my formation un-readies me"
and has nothing to do with formations: a poll that left before you pressed Ready describes
a room where you are not ready, and landing after the Ready answer it puts that back; the
next shape you pick then honestly reports what the screen says, and the reset sticks. The
guard is a high-water mark on **`RoomView.at`**, the server's own clock, which is the field
that exists for exactly this. Three things about it: a stale answer still clears `loading`
and `error` (the server answered - only the CONTENT is old); the mark is cleared when the
room changes identity; and a stamp more than a minute behind is accepted, because nothing
in flight is a minute old, so that is a server clock stepping backwards and refusing it
would freeze the room until the clock caught up.

**A command's failure is not a read's failure** (`useVersusRoom`'s `commandError`). The poll
runs every two seconds and clears `error` with the next good answer, so a refused Start
would flash and vanish; a command keeps its own field until the next command. A refused
PICK is deliberately neither: the room travels with the refusal, so the board reconciles and
the draft screen says what happened where the player is looking.

**Freshness is a broadcast PLUS a poll, and the poll is not a fallback nobody exercises.**
`REALTIME_URL` is optional in the referee's configuration and a room must work without it,
so the broadcast is a nudge that triggers a re-read and the poll runs at two seconds while
a draft or a reveal is live. It is also why `REVEAL_JOIN_MS` is four seconds and not one:
a room learns about a kick-off on its next read, and a client that refuses to reveal
anything it did not see stamped shows a result nobody watched.

**EVERY SETTING THE REFEREE TAKES IS REACHABLE FROM THE CREATE FORM, and that is checked by
the type.** Roll random squads and take one man from each (the default since 2026-08-30: it
is the game this mode actually is, where buying is the variant in which knowing the price
list is the skill) or buy an XI from a shared budget of $100 to $200 in five rungs,
defaulting to $125;
two, four or eight people; public or private; twenty or thirty seconds a pick; and the
ratings switch where it means anything. **The clock was the last one to arrive** (wave 9), and
how it was missing is the instructive part: the form sent a flat `pickSeconds: 20` with a
comment upstairs calling that a decision and pointing at a note that did not exist. A
hardcoded literal agreed with nothing and disagreed with nothing either, so nothing could
catch it. The options are **built from the domain's own `PICK_SECONDS`** now, with the copy in
a `Record<PickSeconds, ...>`, so a third value is a type error in the client rather than a
value the host silently cannot choose. Do the same for any future room setting - `DRAFT_SECONDS`
and **`ROOM_BUDGETS`** both followed it. The budget ladder keeps one thing worth knowing
apart: the RUNGS the form offers and the RANGE the referee accepts (`BUDGET_MIN` /
`BUDGET_MAX`, $70 to $200) are deliberately different, because a room stored before a rung
moved is still a legal room. `npm run checks` holds every rung inside the range, since a
rung outside it is refused as `bad-room` and tells the host nothing about which of the six
settings was wrong.

**THE LOBBY POSTS YOUR SHAPE THE MOMENT YOU PICK IT, and that is what removed a button.**
It used to hold the choice locally, so the primary action read "I'm ready" and then turned
into **"Change my shape"** - a button whose job was to send a choice the chips looked as
though they had already made. Nobody could tell what it was for, which is the correct
reaction: a chip that is lit and not yet sent is a lie. Picking posts, so Ready is one
toggle labelled for what it does, and the seat list beside it is where the STATE is shown.
Two consequences: a formation change falls back to the first style the new formation allows
(a 3-4-3 has no defensive variant, and the old code left the impossible pair on screen with
a disabled button under it), and the shape posts are deliberately not gated on the `busy`
flag, which is the HOST's - sharing it made Start flicker disabled on every chip tap.

**THE BUTTONS ARE `btn(tone, size)` AND THERE ARE NO OTHERS** - see "Buttons and contrast"
near the end of this file, which is where the whole rule lives now.

**PRACTICE OPPONENTS: the host can fill the empty chairs** (P49, `domain/pvpBot.ts`,
2026-08-29). The one thing a room of eight cannot do for itself is find eight people, and
P7's play-it-smaller answers only half of that - dropping to two is a different evening from
the tournament the host opened. Four rules make a bot a SEAT rather than a player, and each
one is a lifecycle rule re-read as being about people rather than about chairs:

- **A BOT NEVER KEEPS A HUMAN OUT.** Somebody arriving at a full room takes the newest bot's
  chair (`joinRoom`), so filling up is a decision the host can make early and unmake by doing
  nothing. The public listing therefore counts PEOPLE as `seated` and the bots apart:
  folding them together prints "Full" over a room anybody can walk into.
- **A BOT CANNOT HOLD A ROOM OPEN.** A lobby whose last human leaves closes, however many
  chairs are filled (`withoutMembers` tests for a human, not for a member) - or a host who
  walked away would leave three robots holding a listed room for fifteen minutes. It also
  cannot be swept out for silence (there is no tab to hear from) and cannot be promoted to
  host (it cannot press Start, so the room could never begin).
- **IT IS NOT THE AUTO-PICK, and that is the point.** The expired-window fallback is random
  BY DESIGN (P21), so a bot that drafted like one would be a free win in every round it
  appeared - worse than the empty room it exists to fix. `botXi` builds near the best XI its
  money can buy, at the kick-off, in one step: a **Lagrangian** search (an exchange rate for
  a rating point, bisected onto the budget) rather than a greedy fill, which commits its
  money slot by slot in an order it cannot revisit and overpays for whichever position it
  shops first. A roll room's bot takes the best man from each of eleven rolled squads.
- **`BOT_SPEND` (0.95) IS THE ONLY DIFFICULTY KNOB.** Measured at $110 over a 4-3-3: the
  best XI the whole budget can buy rates **84.0**, a bot rates **83.0**, it beats the XI an
  expired clock builds (75.4) **80%** of ties and the transfer market's own one-tap
  Auto-fill (80.5) **57%**. The check asserts the CONSTANT as well as the spend, because
  measuring a spend against the number that produced it passes happily when that number is
  mutated to 1 - the one edit that makes every room unwinnable.

**A BOT CANNOT BE A `pvp_members` ROW**, and that is the whole of migration **0019**:
`user_id` is a foreign key into `profiles`, which is one into `auth.users`. Giving bots real
accounts (rows in a table GoTrue owns and lists) and relaxing the key for every member were
both rejected, so bots get their own table with their XI as one jsonb slot map - it was
built in one step and has no ordinal, window or landing time to record. The same key sits on
`pvp_matches.home_id`/`away_id`/`winner_id` and `pvp_rooms.champion_id`, and a bot plays ties
and can win a room, so those four are dropped and a trigger does what they were for (deleting
an account still takes its matches). `pvp_matches.bot_sides` counts them per tie and
**`pvp_records` excludes any tie with one in it**, or a room of seven bots would be three
wins for turning up; `finals` still reads every match, or a final played against a bot would
promote the semi into "rooms won".

**A BUDGET ROOM RUNS ONE CLOCK OVER THE WHOLE DRAFT, NOT ELEVEN WINDOWS** (P52, roadmap
item 47, 2026-08-30). **The METHOD decides it, not a setting**, and that is the whole
reasoning: a roll draft really is eleven decisions - eleven dealt squads, one man from each -
so a window per squad is what it is; a budget draft is ONE decision about ONE pool of money,
where the eleventh pick settles whether the first was affordable, so a clock that will not
let you go back and sell the winger you overpaid for is not a clock, it is a trap. A roll
room is completely untouched.

- **THE BOARD IS SUBMITTED AS A MAP** (`setXi`, `POST /v1/rooms/:code/xi`), and that one
  decision is what finally delivers **P42's move and the remove beside it**: buying, moving
  a player to another of his roles and taking one back out are all "here is my team now", so
  they are one instruction rather than three and the referee needed no new rule for any of
  them. It is also idempotent by construction, where a pick needs an ordinal to get there
  (P36). `roomControls(whole)` is what turns the two controls back on; everything else in
  `ROOM_CONTROLS` stays off for reasons that were never about the clock (P3, P8, P25, and
  auto-fill still being eleven decisions in one tap).
- **THE SCHEMA HAD BEEN READY FOR THIS SINCE WAVE 1**, which is why 0021 is two columns and
  not a table: `xi` has always been a slot map, `pvp_picks` has always been keyed on the
  SLOT, and `pgStore.save` has always deleted a slot that left the map - all three put there
  for P42. What blocked the move was the INSTRUCTION, never the storage.
- **A FULL XI IS NOT A FINISHED ONE** (`RoomMember.done`, `setDone`). This is the rule that
  keeps the two features from cancelling each other out: if the eleventh slot filling ended
  the draft, moving and un-buying would be unusable by exactly the person who fills their
  last slot last. So finishing is DECLARED, refused on an incomplete XI (so "everybody is
  done" can never mean "everybody gave up"), and reversible while the draft is open. The
  room draws when everybody has declared; `draftDone` is the one reading of it and a
  practice opponent is always finished.
- **AT ZERO EVERY EMPTY SLOT IS FILLED**, by the same `forceCompleteOne` an expired window
  uses and recorded `automatic` the same way, so `pvp_matches.loser_auto_picks` still tells
  a real win from a farmed one. A budget **duel** has neither clock (P51 and P52 at once):
  no window, no whole-draft deadline, and only the declarations end it.
- **THE CLIENT DECIDES BY THE ANSWER, NEVER BY THE METHOD.** `PVP_PROTOCOL` is unchanged, so
  a referee older than P52 sends a budget room its eleven pick windows and no `draft` block
  at all - and `RoomDraft` branches on `!!view.draft`, which is the only thing that can tell
  the two apart. Reading `rules.method` there would look right and be wrong on every
  deployed server until the NAS visit; `npm run checks` reads that line specifically.
- **THE TWO EFFECTS THAT POST AND RECONCILE THE BOARD ARE ORDER-DEPENDENT.** Both watch the
  same signature, and React runs a commit's effects in declaration order, so the POSTING one
  is declared first and sets `submitting` synchronously before the reconciling one looks at
  it - the other way round the board is yanked back for one render on every change. Two more
  that bit: a refused board must not be re-sent for ever (hence `postedSig`, since
  "differs from the server" is not on its own a reason to send), and a ref changing re-runs
  no effect, so a second change made while the first post is in flight needs `postTick` or
  it is never sent at all.

**A DUEL IS A ROOM OF TWO WITH ITS DEADLINES SWITCHED OFF** (P51, `RoomPace`, 2026-08-30).
That is the whole design and it is the reason the feature is small: everything a duel does a
room already does - the draft, the deal, the validation, the tie, the record - and everything
that differs is a DEADLINE. Four of them, all of which exist because a live room cannot wait
for a human (P12, P31): the pick window's expiry, the liveness drop, the lobby idle close and
the room idle close. So `PvpRoom.pace` is one field, `tickRoom` hands an `async` room to
`tickDuel`, and the rest of the state machine is untouched. A parallel set of tables was the
first sketch and would have been a second copy of the draft, which is the part with the rules
in it.

Eight things about it are decisions rather than details, and each one is checked:

- **A DUEL WAITS IN A LOBBY AND ITS DRAFT STARTS ITSELF** (2026-08-31, plan P54). Both seats
  filled and both players ready is the condition, and `tickDuel` is what notices - there is
  no host tab to press Start, which is the mode. `startRoom` refuses an `async` room outright
  for the same reason: P48's "the host may start over somebody who has not pressed Ready" is
  right when everybody is sitting there and here would deal a squad to a player who never
  agreed to play. It briefly opened straight into the challenger's draft instead, and the
  exploit that closed that off is at the head of this section.
- **THE SEAT IS TAKEN IN THE LOBBY, so there is no mid-draft join and nothing to be late
  for.** Nothing has been dealt before both players are in, so a duel's door shuts when it
  starts exactly as a live room's does, and `joinRoom` needs no branch for the pace at all.
- **`tickDuel` STILL COUNTS THE SEATS BEFORE IT COUNTS THE DECLARATIONS.** "Everybody has
  finished" is trivially true of one person, which would draw a challenger against
  themselves - unreachable now that a duel cannot draft alone, and kept as the guard that
  makes that a fact rather than an assumption (and as what a room stored under the day's
  build falls back to).
- **FINISHING IS DECLARED IN EVERY DUEL, whatever it plays** (`declaresDone`), where a live
  room only declares in the whole-draft case (P52). The reason is the same one P52 gives,
  reached from the other end: with no clock at all, the eleventh pick landing would kick the
  match off under its owner, and a team you cannot look at once more before it plays is a
  team you did not send. So there is a Send button, and in a ROLL duel it is the only thing
  that ends the draft - the case P52 never covered.
- **A DUEL IS ADDRESSED BY LINK AND BY NOTHING ELSE** (2026-08-31). It used to name an
  account: `invited_id`, a lookup on the normalised key, a `not-invited` refusal, a
  visibility exception so the recipient could read a private room, and an accept-or-decline
  screen. All of it went, along with the WHO field on the create form and `findByName` in the
  referee's store. A private link already says who you are playing, and it works for somebody
  who has not chosen a display name yet. **Whoever opens the link takes the seat**, exactly as
  a private room has always worked, so arriving at a duel is arriving at a room and there is
  no exception to "one door, and walking through it is the answer".
- **THE WINDOW STAYS AND THE DEADLINE GOES.** A duel keeps its pick windows, because that is
  what counts the picks and triggers the deal in a roll room; `submitPick` and `rerollDeal`
  simply do not test the clock. On the wire `you.window.remainingMs` is **null**, never a very
  large number - a screen that forgot to ask then draws no clock instead of a wrong one, and
  three consumers read it explicitly (the bar, the tab bar's inert-while-your-window-is-open
  rule, and the draft panel's copy).
- **P39 COUNTS LIVE ROOMS ONLY, in three independent places.** The store's `activeRoomOf`
  filters on the pace, so holding five duels blocks nothing; `create` does not ask the
  question at all for a duel; and `join` asks it only when the room being joined is LIVE,
  which it did not until 2026-08-31 - so somebody sitting in a live room could not take up a
  duel, and a duel is the mode you play precisely because you are busy. None of the three
  implies the others.
- **WITHDRAWING IS LEAVING, and what it COSTS is whether anything has been DEALT**
  (`leaveDuel`). **In the lobby it is free at either end**: no squad has been dealt and no
  player bought, so neither of them has seen a thing - the person who opened it calls it off
  and the link stops working, and anybody else hands the seat back, so the challenge goes
  right on waiting for somebody. **Once it is drafting it is a forfeit, at either end** - the
  room ends now and the player who stayed has won it. That rule went through **four** shapes,
  and the first three all read the SEAT COUNT. Leaving worked only on an unanswered challenge,
  on the live room's reasoning (once the second player is in, their draft is real work); that
  left a game neither player could get out of, and was reported as exactly that. Then the
  second player could hand the seat back at any point - which reads generously and is the free
  escape the whole re-roll exploit needs. Then the seat count itself turned out to be the
  wrong field, reported from the game on 2026-09-02: **"when a player enters a room via
  invitation and takes his seat, walking out of the room is directly counted as a loss.
  That's too early."** It was, by a whole phase. **Moving the line to the deal does not
  weaken the forfeit by a day**, which is the thing to be sure of before touching this: the
  exploit needs a squad ON THE SCREEN to be worth anything, and a squad arrives when the
  draft starts, so the free exit now ends exactly where the thing worth rejecting begins.
  **The forfeit is still what makes the
  lobby worth having**, and the lobby is still what makes the forfeit fair: you commit before
  you see anything.
  Both are refused once the match has been played, for the reason the rematch below gives.
  **NOBODY IS REMOVED BY A FORFEIT**, which is the difference between it and every other
  ending: a seat given up in a lobby takes its member row with it because the chair is being
  offered to somebody else, and here the game is over - a room the loser is not in is one they
  cannot read the result of. (`withoutMembers` still drops a departing member's board, pick
  log, dealt squads and window, and `pgStore.save` still sweeps the three tables of anybody no
  longer in the room. Its caller with a draft in flight has gone with the hand-back, but the
  guarantee belongs to the helper rather than to the caller: "these members are gone" has one
  correct meaning whoever asks it.)
  **The screens read the same rule from the other end** (`leaveKind`, domain/pvpView): four
  things wear one button - a seat given up in a lobby, a challenge of your own called off, a
  duel FORFEITED once its draft is under way, and walking away from a tournament your XI
  plays on in - and a button promising a free withdrawal that the referee then scores as a
  defeat is worse than no button. It answers the three duel cases **in `leaveDuel`'s own
  order**, which is what keeps the two agreeing rather than merely agreeing today, and the
  checks hold the pair together on the referee's real answers. **The skew that matters points
  one way**: a client that says "free" over a server that charges costs somebody a game,
  where the reverse only over-warns, so this half must never be deployed ahead of the
  referee.
- **A REMATCH IS A NEW DUEL.** The old one has a result, and a result that can change is not a
  result, so `DuelRematch` opens a fresh room with the same rules and hands back a fresh link.

**AND A WEEK OF SILENCE IS THE FORFEIT NOBODY PRESSED** (2026-09-01, roadmap item 52,
reported from the game as *"leaving a room during rolling does not cost a loss - I can leave
the draw without catching a loss"*). Every line of the paragraph above was true and only of
the BUTTON. Leave a duel the way you leave any other screen - the crest, the tab bar, Back,
closing the tab - and nothing is sent at all, and a duel has no pick clock, no liveness
sweep and no lobby close ON PURPOSE, so there was nothing left to force the issue: the room
stopped dead, told both players it was somebody's turn, and `DUEL_IDLE_MS` eventually CLOSED
it with no result and no loss for anybody. Which is the free re-roll the lobby and the
forfeit exist to shut off, reachable by pressing nothing. So the week now resolves the way
the button would have (`duelDraftExpired`): mid-draft, whoever never sent a team loses it.
Four things about it:

- **IT IS THE WEEK THAT WAS ALREADY THERE, not a new deadline**, and that is the whole
  reason it changes nothing else. A shorter clock of its own was the obvious first shape and
  it was wrong: `npm run checks` drafts a duel over nine days on purpose, because playing at
  your own pace over a week IS the mode, not a tolerance it happens to allow. Silence is the
  honest test for abandonment and nobody actively playing can trip it, since every move
  refreshes `touched_at`. **A two-day window would have halved what a duel may take** - a
  separate decision, one constant away, and not one to take by accident while fixing this.
- **BOTH LATE CLOSES IT WITH NOBODY WINNING**, which is not the same rule read twice. A
  forfeit hands the duel to the player who STAYED, and where neither sent anything there is
  no such player; picking one would be inventing a result out of which seat they took.
- **A POLL AND A LIVENESS PING ARE NOT WRITES**, and the rule leans on it. `store.seen` is a
  targeted update of one member column and a `GET` writes nothing, so a tab left open on a
  duel nobody is playing cannot hold it open - and, the half that would have been perverse,
  the player who is WAITING cannot reset their own win by checking on it.
- **AN OUTAGE RECOVERY NOW LEAVES A DUEL ALONE, and without that the rule was already
  broken.** `recoverFromOutage` returned a CLONE for any drafting room, even with no windows
  to hand time back to, and a clone is exactly what the sweeper reads as "this room changed":
  it wrote the room and stamped `touched_at`. So every sweeper restart would have handed the
  player who walked away another seven days, silently, for ever. A duel loses nothing to an
  outage anyway - its windows have no deadline for a restart to have eaten - so it is a
  one-line guard, checked by identity with a live room as the vacuity guard.

**A DUEL'S MATCH IS REVEALED WHEN ITS VIEWER TURNS UP, NOT WHEN THE SERVER PLAYS IT**
(2026-08-31). P30's reveal window is the server's and has to be in a live room, where two
people are watching the same match and must see the same one; a duel is played at the moment
the second XI lands, with nobody necessarily awake, so honouring that window would hand a
scoreline to whoever opened the app an hour later. So for a duel the reveal is a fact about
the VIEWER rather than about the room: `state/pvp/watched.ts` records which room codes have
been sat through, `RoomScreen` plays the match the first time and shows a "Skip to the
result" beside it, and afterwards it is the settled card and both XIs.

**WINNING A ROOM RAINS THE CUP-WIN CONFETTI, AND IT IS FIRED BY THE TRANSITION INTO THE
RESULT** (2026-09-01). The same self-contained canvas the single-player cup win uses, and
the same rule behind it, reached again: **winning is a MOMENT, while `status: 'ended'` is a
property a room keeps for ever**, so raining off the status alone would fall on every reload
and every time an old room's URL was opened. `RoomScreen` records the first thing each mount
sees and rains only on a change into the result screen - which is why **nothing had to be
persisted for it**, and why one rule covers both ways a winner gets there: live, the room
goes from `round` to `ended` under the player; a duel opened days later plays its reveal
first, so the result appears when the match ends or "Skip to the result" is pressed, which is
the same transition. A second look starts on the result and stays there, so nothing falls.
Two things about it: **the first observation is the first ANSWER, not the first render** (the
read is in flight on mount, so treating "no room yet" as a state would make every revisit a
transition from nothing into a result and rain on all of them), and **a walkover is
excluded** - a duel somebody walked out of is a win in the record with no football under it,
the screen says so flatly, and confetti over the top of that is celebrating an opponent
leaving. `npm run checks` reads the wiring, because nothing behavioural can see it: a version
that rained off the status shows exactly the same screen the first time and differs only on
the second look. All three mutations were checked red.

**AND THAT LIST FOLLOWS THE ACCOUNT. IT USED TO FOLLOW THE BROWSER, AND THAT WAS WRONG**
(2026-09-01, reported from the game: "all played and seen matches are set back after a
re-login"). It was a localStorage key on the stated reasoning that having watched a reveal is
not progress - it earns nothing and changes no result - and that reasoning is true and beside
the point. **The list is not a record of what you have seen, it is what decides whether the
app has anything waiting for you**: the duels page leads with it and so does the chrome's
strip, so a copy that does not travel means every duel you have already watched announces
itself again on the next device or the next sign-in, and the one signal this mode has stops
meaning anything. It also had two accounts on one machine sharing a list.
So it goes through the store seam like everything else persisted, and the interesting part
is where an account's copy lives: **in the settings row's jsonb**, which is one blob the
client writes whole, so it needed **no migration**. Two consequences to keep in mind. The
preferences and the watched list now SHARE that row, so a save of either that does not carry
the other deletes it - `toStored` takes the list as a REQUIRED argument for exactly that
reason, and `npm run checks` reads both `save_settings` writes. And a guest's copy stays in
`watchedStorage`'s own key, which is still deliberately NOT in `GUEST_KEYS` (a guest can hold
no room, P17, so there is nothing there to import).

**AND THE DUELS LIST IS HOW EVERY DUEL REACHES ANYBODY, because nothing in this game sends a
message.** No mail, no push. `GET /v1/duels` answers the duels you are IN, newest activity
first - membership is the whole of "this one is mine" now that nothing is addressed - and the
versus page leads with them, split into "On now" and "Played". `duelTurn` is what each row
leads with (`yours` / `theirs` / `sent` / `done`), because the question somebody opens that
page with is "is there anything for me to do", never "what is the score"; **eleven picked is
not eleven sent**, so the row carries `yourDone` / `theirDone` and a `seated` count rather
than being read off the pick totals, which is what tells "nobody has taken it up" apart from
"they are still building". The counts are made on the SERVER (`myDuels`), since counting them
in the browser would mean handing the browser both drafts.

**AND THE CHROME CARRIES THE MOST URGENT ROW OF THAT LIST** (`hooks/useDuelAlert`,
`duelToOpen`). A live room announces itself by being HELD in this tab; a duel cannot, because
the two moments worth interrupting somebody for - your opponent finishing, and the match
being played the instant they do - both happen while the player is elsewhere. So the chrome
polls `/v1/duels` every **thirty seconds** while signed in, and puts one line in the same
strip the held room uses: a result nobody has watched first, then a team nobody has sent.
Never both strips at once - holding a live room outranks a duel by a long way, since somebody
is sitting in that one.

**A ROOM NOBODY IS IN CLOSES ITSELF, and the sweeper that does it is the pick clock's**
(P31). Closing a tab fires no reliable event, so leaving is OBSERVED rather than announced:
every client pings while it holds a room, `RoomMember.lastSeen` is what the ping writes, and
four numbers in `domain/pvpRoom.ts` decide the rest. **A member unseen for five minutes is
dropped from a LOBBY and never from anything later** - past the start an absent player's XI
plays on without them, because the alternative is one person voiding a tournament seven
others are in.

**IT WAS NINETY SECONDS AND THAT WAS WRONG, reported the first time anybody tested a room
from a phone** (2026-08-27). The host opened a room of four on a phone, joined it from a
laptop as the second player, and the phone slept while he did: the rule took his seat in the
room he had opened, and being host is no protection because the host is **promoted away**
rather than spared. **The mistake was conflating "this tab is gone" with "this person is not
looking"**, and it lands hardest exactly where it does most damage - a phone locks after
thirty seconds, a locked phone runs no JavaScript so the ping simply stops, and the lobby is
the one phase whose entire activity is waiting for other people to arrive. Five minutes is
longer than a screen lock plus a glance away and still three times faster than
`LOBBY_IDLE_MS`, which is the rule that actually keeps the list clean. **The other half of the
fix matters more and is in the client**: `useVersusRoom` pings on `visibilitychange`, so a
phone woken inside the window never reaches it. And a dropped player is now TOLD - holding
the room pointer and being answered "no such room" means the seat went, which used to render
as "a private room is invisible until you are in it", of a room they had opened themselves.
Changing the number needs the referee redeployed, since the sweeper is what reads it. A lobby that loses its HOST promotes the lowest remaining seat rather than
dying. A lobby untouched for **15 minutes** closes and any room at all untouched for **30**
closes, and the fifteen-minute rule deliberately ignores the pings: `touched_at` moves on
every join, ready and resize, so fifteen minutes of nothing is abandoned however many tabs
are open. A stuck draft is force-completed past **eleven windows plus a minute**.

**"CLOSED" IS `ended` WITH NO CHAMPION**, not a fifth status: the column takes four values
under a check constraint, and a room that was actually won can never be in that state
(`playRound` eliminates exactly one player a tie, so exactly one survives). `roomClosed` is
that reading, shared by the referee and the screens, and it is why a closed room says "the
room closed" instead of "the result".

**A DROPPED MEMBER LEAVES A SEAT GAP, ON PURPOSE.** Seats decide nothing (P47), so a gap is
free, and re-numbering would have every remaining member change seat - which collides with
`pvp_members`' unique index on (room, seat) the moment the writer updates one row before
deleting another. What it does mean is that **`joinRoom` takes the next FREE seat and never
`members.length`**, and that the writer now DELETES a member row that is no longer in the
room, before the upserts. Neither had ever mattered, because until wave 8 nobody ever left.

**THE LOBBY LIST IS A REFEREE ENDPOINT; THE RECORD AND THE REPORT ARE NOT.** `GET /v1/lobby`
answers a `LobbyRoom[]` carrying what somebody who has never seen the room needs - the host,
the seats left, what it plays, the code - and deliberately no member rows, because a member
row carries a formation and P19 keeps formations out of a lobby's reach. The record
(`pvp_records`, a `security_invoker` view) and the name report (`pvp_name_reports`) go
straight to the account server through `state/pvp/records.ts`: the referee is the only writer
of ROOMS, and neither of those is a room. Reporting has **no word filter and no automatic
action** (P22) - the owner reads them and renames an account by hand - so the button is the
whole report, and one report per person per target is a unique index rather than a vote.

**A ROOM OF MORE THAN TWO ADDED NO SERVER BEHAVIOUR, and that is worth knowing before
looking for some.** The referee has taken 2, 4 and 8 since wave 1: `drawRound` shuffles the
survivors, `playRound` plays every tie of the round, `tickRoom` advances until one is left,
and `npm run checks` has asserted the lot over sixty rooms of eight since then. Wave 7 is
entirely the client's READING of it (`roundsFor`, `roundLabel`, `gamesIn`, `roomBracket`,
`spectateTie` in `domain/pvpView.ts`, drawn by `components/versus/RoomBracket.tsx`) plus one
command the client had never called: `size`, which is P7's play-it-smaller.

**THERE IS NO "THE OTHER PLAYER".** Every versus screen was first written with `others[0]`
as the opponent, which is right in a room of two and wrong three ways in a room of eight -
the opponent is whoever the DRAW paired you with, it changes every round, and after you go
out there is nobody. The opponent comes off the tie, the tie comes off the round, and the
screen has a third state besides playing and finished: **watching** (P24).

**A SCORELINE IS HELD BACK UNTIL ITS OWN REVEAL WINDOW CLOSES.** Every tie of a round is
stamped at the same instant (P30) and they run for different lengths, so a tree that printed
results as it had them would show a player the outcome of the tie they are about to watch, in
the box beside the one they are watching. `roomBracket` takes the server's clock and reads a
scoreline only past `revealFrom + revealMs`. It is the single-player bracket's own rule,
reached again.

**THE WAIT IS WHERE THE DRAW GOES** (P47), and that is a decision rather than a layout. A
decisive player in a room of eight can sit on a finished XI for four minutes, because nothing
is paired until every draft is in. So the tree is on screen through that wait with every seat
reading "?" and every name in the pot, and it fills in front of them when the last
pick lands. It appears only once YOUR XI is in: while you are still picking, the board is
what the screen is for.

**AND A NAME IN IT IS PRINTED WHOLE** (2026-09-01, reported from the game: a room of four
with two practice opponents in it read "The" in the semi-final, "The" in the final and "The"
in the winner box). The tree printed the FIRST WORD of a name, which is a fair reading of
`Mario Smania` and of nothing else here: `The Reserves` and `The Academy` are both called
`The`. Nothing needed shortening in the first place - a display name is capped at `NAME_MAX`
(16 characters) and every practice-opponent name is inside that too - so the narrow cells
truncate in CSS instead, where an ellipsis at least says a name was cut. The three-letter
`codeOf` would have collided in exactly the same way and is not the answer either.
`npm run checks` reads every versus screen for a name being taken apart, and its vacuity
guard is INVERTED: it asserts the bot names are AMBIGUOUS by first word, so a build that
went back to shortening them that way is naming two opponents the same thing rather than
merely looking untidy. **A name is not a first word, and shortening one is a decision about
identity rather than about layout.**

**AND THE TREE IS THE CUP RUN'S OWN BRACKET, DOWN TO THE STYLESHEET** (2026-09-01). A room
plays a knockout and the game already draws one, so drawing it twice was the mistake: the
room's tree was columns of plain cards ending in a "Winner" box, which said the same things
in a second visual language on a screen reached from the same tab bar. `RoomBracket` wears
the `bkt-` design now - the same match box, the same connectors joining a pair into the
round above, the same round headings with the one being played in amber, the same
two-sided phone tree converging on the cup, and the same deep green champion node with its
trophy and its burst of confetti on hover. Three things about it:
- **Only two figures differ, and they are in the CSS.** A room's tree is 4 or 8 seats
  rather than 16, so it stands shorter and needs less width before it scrolls: `--bkt-h`
  and `--bkt-w`, set by `.bkt-of-4` / `.bkt-of-8`, **with the cup's own numbers as the
  fallbacks** so nothing about the Cup Run's tree moved. Everything else already derived
  from what is in the columns, which is why a generic tree cost two variables.
- **What a seat HOLDS is the only real difference, and it is data rather than design**: a
  person where the cup has a nation, so a name instead of a flag, a country code, a year
  and a rating chip. The states are the tree's own - through, out (dimmed and struck), not
  settled yet - and the phone box stacks the two names where the cup's stands two
  three-letter codes side by side, which is forced by what is in it rather than a second
  opinion about the layout.
- **The per-box "Playing" strip went with it.** A drawn tie carrying no score is one being
  played, which is exactly what the cup's tree says of its own pending round, and the
  amber round heading is what marks the round the room is in.
`npm run checks` reads both files, since nothing behavioural can see a design: a room that
went back to drawing its own cards would render perfectly and simply look like a different
game. It asserts the shared classes as WHOLE classes rather than as substrings (`bkt-cup`
is inside `bkt-cup-lbl`, so a plain `includes` would pass a room that kept the label and
dropped the node), and asserts the cup's fallbacks are still the fallbacks.

**WATCHING TWO OTHER PEOPLE MEANS THREE SHARED COMPONENTS STOP SAYING "YOU".**
`FixtureHead` hard-codes "Your XI" and the red YOU badge and `GoalList` tags the home side
"You" in pitch green, so `MatchdayCard` takes an optional `sides` that names both instead.
The tie is turned round for its own HOME player, which is the identity - nothing is
relabelled - so a card written for "you and them" takes a neutral match unchanged. The
default game is **the one your conqueror is in**: the single match in the round a
knocked-out player has a reason to care about, chosen with no control at all.

**A ROLL ROOM'S SQUADS ARE DEALT, SO EVERYTHING THAT DECIDES ONE STANDS DOWN - AND NOTHING
ELSE DOES.** The referee hands over one squad at a time (P13 - pre-generating the sequence
would let a player read every future squad, re-roll outcomes included, off their own row),
so `useSquadRoll` takes `dealt: true` and switches off its draw-next-squad policy and its
three kinds of re-roll. What arrives goes on the board through `deal`, so every screen below
reads exactly the state a single-player draft would. Two consequences worth knowing: **a
room's re-roll is ONE button**, because the referee's instruction takes no argument saying
which kind (`SquadPanel` takes the kinds as data); and **the count comes from
`you.rerollsLeft`, never the reducer**, or a re-roll the referee refused would read as spent.

**THE SCRAMBLE IS NOT ONE OF THE THINGS THAT STAND DOWN** (2026-08-30). It was, and that was
the wrong cut: `dealt` should switch off what DECIDES a squad, and the animation decides
nothing - the target is the referee's either way. Without it the moment a roll draft is
about arrived as a squad that had simply appeared. `deal(squad)` plays **the single-player
animation unchanged, duration included**: a room's draft is the same draft, and a shorter
beat for a room would be a second scramble to keep in step with the first. It costs
`SCRAMBLE_MS` of a twenty-second window and that is accepted rather than overlooked. Two
things in it are load-bearing: the caller keys on **the dealt id in a ref, never the board's
own squad**, because placing a player CLEARS the drawn squad (the reducer does that so a
single-player draft rolls the next one), so between the tap landing and the referee
answering, the board has none while `dealt` still ends with the one just used - comparing
the two put that spent squad straight back, with a scramble in front of it. And a deal
arriving MID-SCRAMBLE re-points the settle (`pendingDealRef`) rather than starting a second
one, which is reachable without anybody doing anything: a window expiring during the
scramble auto-picks and deals the next squad.

**HIDING THE RATINGS IS ENFORCED BY THE TYPE, NOT BY A HABIT** (P5, P38, P40).
`domain/pvpView.ts` owns the rules: `roomDisplay` says whether this viewer sees numbers
(hidden only in a roll room, and **the numbers always come back at the whistle**),
`offersRatingSwitch` says the host is not offered it for a budget room (a price computed
from a rating hides nothing - the void P14), and `ratingBand` turns a figure into a word
using **`STRENGTH_BANDS`**, because a second set of boundaries for the same scale would mean
two answers to "is 83 strong".
The enforcement is the part to keep: `BoxScore`, `XiTable` and `SquadPanel` all DEFAULT
`ratings` to true so the single-player callers read unchanged, which means a room that forgot
to pass it would show everything and look fine. So `BuildSurface` and `VersusMatch` require
it, and `npm run checks` reads those two type lines and refuses a `RatingChip` anywhere under
`components/versus/`. It is a **house rule** and the copy says so: `/squads` exists to show
ratings, so a second tab defeats it.

**AND THE RESULT PRINTS OVR / ATT / DEF FOR BOTH TEAMS, ON THE FIGURES THE TIE WAS PLAYED
ON** (2026-09-01). The screen already showed both XIs row by row with the numbers back; the
three team figures are what the reader was adding up by hand, and in a hidden-ratings room
they are the first either player ever sees. It is the build page's own `RatingStrip`, so
nothing new was styled (`dist/assets/*.css` is byte-identical across the change). **The trap
is that this app has TWO readings of Att and Def and they disagree.** The build page promotes
the filled slot to the front of a player's positions (`placedPlayers`), so a centre-back
played at holding midfield counts towards the attack; a room never promotes anything, because
every pick is resolved in the referee's own dataset (nothing trusts a submitted player), so
`pvpTeam` groups that same man by his DATASET role and the tie is decided with him in the
defence. Measured on one such XI: Att 79 / Def 79 as played, against 81 / 76 promoted. So
`xiStrengthFrom` (domain/pvpView) is `xiStrength` over the dataset players, exactly as
`pvpTeam` reads them - **a screen agrees with the match it is reporting, not with the other
screen** - and `npm run checks` holds it against `pvpTeam`'s own answer with the promoted
reading as the discrimination guard. Do not "unify" the two without changing the referee's
sim, which is a rebuild and a balance change rather than a tidy-up.

**The album needs THREE switches in a room, not two.** `collectibles` hides the stars and the
Collectible filter; `swap` is its own entry because the two per-run swaps come from the
reducer's initial state, so a room that only hid the marks would still let a player use them;
and `chemistry` covers the drawn-squad list's underline as well as the card, since the
underline promises a bonus a room's match never receives.

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

**No part of a career reaches a room, and that is now absolute** (P2/P8, settled 2026-08-27).
A host could originally price a room off each player's own career transfer budget; it
contradicted P34 (the referee may not read a `career` row, and snapshotting the figure still
means reading it) and it was the weakest setting in the room anyway, since $160 beats $70
85.7% of the time. The option is deleted rather than repaired - do not add it back without
reopening P34, which is what keeps the referee's blast radius small.

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
  dealt, and **382 of the 4,992 (squad, position) pairs are empty** (2026-09-02) - most 1970s
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
