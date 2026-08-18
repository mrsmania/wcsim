# CLAUDE.md

Project context for AI assistants and developers. Read this first when working in
this repo. (User-facing setup/hosting notes live in `README.md`.)

**Where to pick up work:** `docs/ROADMAP.html` is the single list of open work (next up,
later, loose ends, with what shipped collapsed at the bottom as decision history). Open it
in a browser and check it first if you are continuing the project. It replaced the old
`docs/ROADMAP.md` + `docs/todo/TODO.html` pair, which held overlapping copies of the same
items and drifted apart.

## What this is

**World Cup Simulator** - a single-page game. You draft an XI of real World Cup
players (one position at a time, each drawn from a randomly rolled national-team
squad), then play a simulated group stage and knockout run, trying to win the cup.
Pure client-side: no backend, no database. All player data is hardcoded in
`src/data/squads.ts`.

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
  `--color-pitch-dark`, `--color-amber`, `--color-loss`. Shadows: `--shadow-hard`
  (the signature tifo hard offset card shadow, used via `shadow-hard`) + a soft one.
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
  WORLD CUP SIMULATOR wordmark + tagline
  + phase status stamp) and a phase-aware section header sit above it.

The comps (`home`, `selected-xi`, `tournament`, `index` launcher) carry a live
5-scheme colour switcher that is deliberately **comp-only**; the app ships the single
default green scheme. Earlier explorations live alongside: `option-{1,2,3}-*.html`
and the brutalist `tifo/` set (the hard-shadow idea came from there).

## Commands

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173, bumps to 5174 if busy)
npm run build      # tsc --noEmit && vite build -> dist/   (run this to verify changes)
npm run typecheck  # tsc --noEmit
npm run preview    # serve the production build
npm run checks     # run domain characterization checks (scripts/checks.ts)
npm run gen:collectibles   # regenerate supabase/seed/collectibles.sql from the dataset
npm run push:collectibles  # send that seed to the account server (needs dkr/.env, LAN/VPN)
npm run push:sql -- <file.sql>   # apply a migration / run a query on that server (same
                           #   credentials and route; -- --dry-run shows without sending)
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
harness at `scripts/checks.ts`, run via `npm run checks`: it exercises the sim,
penalty shootout, knockout bracket, standings, and chemistry thousands of times and
asserts invariants (a shootout always has a winner, a bracket always crowns one
champion, standings totals reconcile, chemistry sums to its capped bonus, etc.),
exiting non-zero on any violation. Run it after touching anything in `domain/`. For
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
                              qualifiers, bracket seeding)
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
               boons.ts      (Cup Run boons: rating + roster transforms; gated)
               run.ts        (Cup Run state machine; chemistryOf; gated - see below)
               career.ts     (Cup Run career: XP/level/Prestige/perks; gated)
               validateSquads.ts (dev-time dataset integrity checks)
  state/       gameReducer.ts (the phase machine + Action union; AUTOFILL loads a
               fully built XI; a `build` "roll|budget" field with START_BUDGET/BUY_PLAYER
               for the in-page budget build); store/ (the persistence seam - see below);
               and behind it the per-key modules store/ delegates to: persist.ts (the
               whole game <-> localStorage, so routes survive a refresh), albumStorage.ts
               (the sticker album <-> its own localStorage keys), careerStorage.ts
               (the Cup Run career <-> wcsim_career_v1), runStorage.ts, settingsStorage.ts
  hooks/       useFollowBottom.ts (auto-scroll), useMatchClock.ts (the shared
               match-reveal clock used by both tournament screens)
  components/  presentational React (App composes them); the group screen
               (TournamentScreen) splits into GroupDrawReveal / StandingsTable /
               MatchdayCard, and matchUi.tsx + matchView.ts hold the shared
               presentational atoms + per-match view-model used by both screens;
               SquadBrowser + TeamRoster are the read-only squad archive (see below);
               CupRunScreen (Cup Run + career) is a lazy-loaded (React.lazy) route
               screen; BudgetMarket is the budget build's left-column panel (shares
               the home page's Pitch + ratings/line-up, not a separate screen)
  config.ts    FEATURES flags (chemistry, teamRatings, removePlayers, movePlayers,
               randomTeam, squadBrowser, stickerAlbum, stickerImages, careerMode,
               budgetDraft) +
               STICKER_TIERS / STICKER_TRADE_COST + BUDGET_DRAFT
  App.tsx      owns the reducer, the roll animation, and responsive-scroll effects;
               branches its screen by the URL (react-router)
  main.tsx     entry (wraps App in React.StrictMode + BrowserRouter)
```

**Play mode = chosen up front on the launcher.** With `FEATURES.careerMode` on, `/` is a
launcher (`ModeSelect`) with two cards: **Quick Run** (-> `/quick-run`) and **Career Mode**
(-> `/career-mode`). Both lead to the *same* 3-column build page (roll a squad or buy within
a budget - both build methods are available in either mode); the chosen path is derived from
the route (`mode: 'quick' | 'career'`) and only decides what the single `CompletePanel`
"Start Run" CTA does: quick -> `handleStartGroup` -> `/group`; career -> `/cup-run`. The
launcher surfaces resume actions for an in-progress World Cup (`worldCupRoute`), an
in-progress Cup Run (`resumeCupRun`) and a **half-finished build** (`resumeBuild` ->
`buildResume`: "Finish your XI - 4-3-3 - 7 of 11 picked", or "Your XI is ready" for a
complete XI that never kicked off; suppressed when a tournament or Cup Run already covers
it). That last one needs to know which page to go back to, which the route alone cannot
say once you have left it, so `START_DRAFT` / `START_BUDGET` / `AUTOFILL` carry the mode
(`modeOfPath`) and the reducer stores it as `buildMode` - presentation only, since the
build state itself is shared by both routes. It also shows the career headline
(level/Prestige) on the Career card. With
`careerMode` off there is **no launcher**: `/` is the build page directly (a single "Start
Run" -> World Cup), i.e. the plain game unchanged. `handleReset` returns to the build route
that matches where it was triggered (Cup Run -> `/career-mode`, World Cup -> `/quick-run`).

**Data flow / phases.** `gameReducer` drives `phase: setup -> draft -> complete ->
group -> knockout`. `group` (`TournamentScreen.tsx`) and `knockout`
(`KnockoutScreen.tsx`) are separate screens: you play the group one matchday at a
time, then click "Enter the knockouts" to reach the bracket and play it one round at
a time. The group opens with the draw as a **modal** (`GroupDrawReveal`, shown once
for a freshly drawn group); the standings + matchdays stay hidden behind it until it
is dismissed, so the draw is not spoiled. Components dispatch actions; `App` runs side effects (the roll scramble
animation, scroll follow) and the phase transitions. The `domain/` modules are
deterministic except where they intentionally call `Math.random` (match sim, opponent
draw, roll). Strong pattern: **each match's result is computed up front, then the
clock only reveals it** (`clock.ts` + the screen components) - simulation is separate
from playback.

**Routing & persistence.** The URL is the source of truth for *which screen*; the
reducer stays the source of truth for *game data*. `App` branches on
`location.pathname`: `/` (the launcher when `careerMode` is on, else the build page),
`/quick-run` + `/career-mode` (the build page = setup/draft/complete, sub-view derived from
`formation` + `isComplete`, not `phase`), `/group`, `/knockout` (both redirect `/` when
their data is missing), `/cup-run`, `/album`, and `/squads/*`. Navigation happens via
`useNavigate` in the footer nav and the transition handlers (`handleStartGroup`,
`handleEnterKnockout`, `handleReset`), which never rebuild existing state. So Back/
Forward move between screens (knockout <-> group <-> home) without losing progress. On
top of browser Back/Forward, each tournament screen carries a `StageCrumb` link in its
`StageHeader` for explicit, discoverable cross-navigation: the knockout screen links back
to `/group` (`onViewGroup`), and once a bracket exists the group screen links forward to
`/knockout` (reusing `onEnterKnockout`, which only navigates when the bracket is already
built, and whose qualified-CTA button then reads "Back to the knockouts"). The
whole `GameState` is mirrored to storage and restored on load, so `/group` and
`/knockout` survive a refresh (transient draft fields are reset
on restore). `SquadBrowser` derives its view from route params via `useMatch`
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
- **Chemistry** (`chemistry.ts`, see below).

## The dataset (`src/data/squads.ts`)

- Tournaments: **all nine (1990-2022)** are full researched datasets. 1990 and 1994 are
  24-nation fields; 1998-2022 are 32 nations. Squad sizes: 22-man for 1990/1994/1998,
  23-man for 2002-2018, 26-man for 2022 (Iran 25). ~6,270 player rows total.
  (1990/1994/1998/2002 were researched in 2026, replacing the earlier placeholders.)
  Historical nations keep their period identity: the 1990 champions (West Germany) are
  recorded as Germany on code `GER`;
  Soviet Union (`URS`), Czechoslovakia (`TCH`) and Yugoslavia (`YUG`) are their own
  codes. A player who continued for a successor nation (Prosinecki YUG->Croatia,
  Gorlukovich URS->Russia) shares one `personId` across both, so the cross-nation
  dedup check intentionally lists them.
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
  continent, Same era, In position** (the last counts players in `positions[0]`).
  Category names are identical in the rules tooltip and the breakdown, and the
  per-category points add up to the displayed bonus (with an explicit "capped" note
  when the raw total exceeds the cap) - keep it that way; transparency is the point.
- Entirely behind **`FEATURES.chemistry`** in `src/config.ts`. With it `false`, the
  bonus is 0 and all chemistry UI (box, "?" rules, breakdown, the underlined primary
  position in the draft chip, the per-player flag/year in the box) disappears.

## Knockout bracket

After qualifying from the group, the user clicks through to a separate **knockout
page** (`KnockoutScreen.tsx`), driven by `domain/bracket.ts`.

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
- **`Bracket.tsx`** renders the tree responsively: a wide left-to-right layout on
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

A read-only reference view over the whole dataset, reached from the **Play / Squads**
toggle in the masthead (which navigates to `/squads/*`). It is separate from the game:
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
- Entirely behind **`FEATURES.squadBrowser`**; with it `false` the masthead toggle and
  the whole view disappear and the game is unchanged.

## Sticker album (flagged)

A persistent Panini-style collection of the elite players you draft across runs.
Spec: `docs/sticker-album-spec.html`; design: `docs/sticker-album-design.md`; comps:
`docs/redesign-2026/turf-flat/{sticker-album,draft-stickers}.html`. Entirely behind
**`FEATURES.stickerAlbum`**.

- **What's collectible.** A player is collectible iff their `elo` falls in a
  `STICKER_TIERS` range (config.ts): **Legendary** 90-92, **Iconic** 93-96,
  **Monumental** 97-99 (currently 39 / 12 / 2 = 53 across the dataset). Collectibility
  is derived at runtime (`domain/album.ts` `tierOf`), so adding players/tournaments
  grows the album automatically - no lookup table.
- **`domain/album.ts`** (pure): `tierOf`, `isCollectible`, `collectiblePlayers`,
  `applyRunStickers`, `totalDuplicates`, `canAffordTrade`, `tradeOptions` (random),
  `executeTrade`, `pendingNewStickers`, `albumStats`, plus the `AlbumState`
  (`{version, collected: id[], duplicates: Record<id,count>}`).
- **Persistence.** `state/albumStorage.ts` owns `wcsim_album_v1` (the collection) and
  `wcsim_album_stats_v1` (trade-cost telemetry: runsPlayed / stickersEarned /
  tradesCompleted), **separate keys from the game** so a reset never wipes the album.
  `App` holds `album` in `useState(loadAlbum)` and prop-drills it (no context).
- **Earning: `FEATURES.stickersOnCupWinOnly`** (added 2026-08-15). **True (default):**
  only a cup win banks - it used to bank on any run end, including a group exit, which
  made the album a record of who you had *drafted* rather than what you had *won*.
  **False:** the old behaviour, any finished run banks the final XI. The flag also
  switches the copy that explains it (home page, draft call-out).
  Stickers are never awarded mid-run either way.
  On a **cup win** `App` shows `CupRewardPicker` (pick any one uncollected Legendary or
  Iconic sticker - Monumental excluded, FR-3/D-1) and then banks the **final XI**'s
  collectibles plus that pick, guarded once-per-run by the persisted `stickersApplied`
  reducer flag. `RunEndStickerSummary` then shows the newly earned cards (only if any
  were new, FR-8). Both are global overlays in `App`.
  A **losing** run still reports in with an empty list, so the run is recorded, the
  `runs_played` telemetry stays honest and the server-side active run is cleared - it
  simply banks nothing. The rule is enforced in one place (`useStickerAlbum`'s
  `applyStickers`), so no caller can bypass it.
- **Album screen** (`AlbumScreen.tsx`, route **`/album`**, reached from a home-screen
  entry button): completion counter + duplicate pool, tier sections (Monumental,
  Iconic, Legendary) of `StickerCard`s (collected = flag+name+rating+tier; uncollected =
  silhouette with a `?`), a per-tier **Trade** action (`TradeModal`) when affordable,
  a 100% completion state, and a **"Reset album"** footer button (inline confirm ->
  `onReset` -> `clearAlbum()` in `albumStorage.ts`, which removes the album + stats keys;
  App resets the in-memory album to `emptyAlbum()`). Reset touches only the album, not the
  game / career / run. `StickerCard` shows real artwork when
  `FEATURES.stickerImages` is on (default), with a per-missing-file text+flag fallback,
  so partial art sets are fine; set the flag false to always use the placeholder.
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

## Cup Run + Career (flagged, prototype)

A roguelike layer over the core loop, plus a persistent career. Design:
`docs/roguelike-career-design.md`. Entirely behind **`FEATURES.careerMode`**.

- **Cup Run** (`domain/run.ts`, route `/cup-run`, `CupRunScreen.tsx`): build your XI the
  normal way, then pick the "Enter the Cup Run" CTA on `CompletePanel` (see "Play mode"
  above). A "Cup Run career" card on the home **setup** sub-view (hidden once drafting) is
  the door to the career hub (perks/trophies) before a run. The run is a state machine - `beginRun` -> `playGroupStage` -> `chooseBoon` ->
  `playKnockoutRound` -> ... -> ended (`champion` or knocked out) - reusing the real
  group/knockout sim (opponents drawn elo-weighted, excluding the group teams). Between
  rounds you pick 1 of 3 **boons** (`domain/boons.ts`, 19 of them): rating tweaks (Golden
  Generation, Glass Cannon, ...) and roster swaps (Transfer, Poach the next opponent,
  Wildcard Legend).
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
  give points back (Glass Cannon, Catenaccio, Counter Attack) or hang on the draw
  (Familiar Foes, Underdog Spirit, Poach) are exempt and marked as such.
  **A condition the player controls at build time is not allowed:** the old Chemistry
  Catalyst ("+2 to your most-represented nation") was a legendary effect at common
  rarity, since a single-nation XI is trivial to buy in the transfer market and the
  chemistry bonus already rewards cohesion. It is now Familiar Foes, keyed to the draw.
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
- **In-run layout.** A `RunLadder` sits up top (Group -> R16 -> QF -> SF -> Final -> Cup; current
  step lit and auto-scrolled to centre) as a **basic history tracker** (node glyph ✓/✗ + round
  label; the current step shows "vs XXX"). Clicking a step **switches the content area below** to
  that round (tab-like): the current step is the live/interactive view, a past step opens a
  read-only `RoundReview`. `CupRunScreen` owns `reviewIndex` (null = live) + `currentRoundIndex`;
  it maps a click to review-or-live and snaps back to live when the run advances (effect on
  `currentRoundIndex`); the ladder is `locked` while a match is playing. Both reviews show the
  **boost taken after that round** (`RoundRecord.boostId`, see below): a KO review re-renders the
  finished match card (`FinishedKoCard`, from the record's stored `events`/`pens`/ratings) + the
  boost; the group review shows the finishing position + its three matchday scorelines
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
  in the ladder's `RoundReview`s, so `RunState` carries no narrative `log`.)
- **Persistence** (`state/runStorage.ts` key `wcsim_run_v1`): the in-progress run is mirrored to
  its own key, so a refresh mid-run resumes it (the transient live-reveal is not persisted, so a
  refresh mid-reveal just replays the current match). It is cleared when a fresh XI is built
  (`handleReset`/`handleStart`/random team/budget confirm), so a stale run never resumes onto a
  new team.
- **Stickers.** At a run's end the final XI's collectibles are banked to the album, guarded
  once-per-run by `RunState.stickersApplied`. **Players a roster boost handed over earn
  nothing** (`RunState.boostedIds` is passed to `onCupRunEnd`, which subtracts them): Legends
  Reunion and Wildcard Legend deal from the 93+ pool, so otherwise a boost was a cheaper route
  into the album than winning with the XI you built. `CupRunScreen` reports the end via
  `onRunEnd`; `App` applies them (a loss banks immediately; a cup win shows `CupRewardPicker`
  first), then the shared `RunEndStickerSummary` shows any new cards. Reload-safe via the flag.
- **Career** (`domain/career.ts`, `state/careerStorage.ts` key `wcsim_career_v1`):
  a run awards XP (-> levels) and Prestige, spent in a small perk shop (Scout Network,
  Deep Squad, Extra Choice, Transfer Budget, Physio Table, Extra Re-roll) that feeds the
  next run. The shop is data-driven off `PERKS`, so a new perk appears by being added
  there; what needs wiring is only its effect. A trophy record (runs/cups/best) sits in
  the `CupRunScreen` hub. Separate storage from the game + album.
  **Two perks reach outside the run**, both Career-Mode-only and both read in `App`
  (a Quick Run keeps the plain defaults): `transfer-budget` -> `BUDGET_BY_TIER` -> the
  market's budget, and `extra-reroll` -> `extraRerollsOf` -> `START_DRAFT`'s
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
- Known gaps (prototype): the career meta-layer is still thin - level is a cosmetic XP
  tally with no mechanical effect, and Prestige only buys the 3 perks (no lasting sink).

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
  rating-sorted, searchable list for the targeted position (all shown; unaffordable/used rows
  disabled; collectible tier stars). You buy from all squads within a budget, each priced by
  rating via **`domain/pricing.ts`** (`priceOf` = `max(1, round((elo-58)^2/64))`, convex so
  the budget forces trade-offs). The budget is a `budget` prop (not a constant): Quick Run
  (and career-off) use the fixed `BUDGET_DRAFT` ($110); **Career Mode scales it** by the
  owned `transfer-budget` career perk via `config.ts` `BUDGET_BY_TIER` ($70 base -> $150),
  computed in `App` (reads `loadCareer()`) and passed to `BudgetMarket`.
- **The owned-sticker discount.** A player whose sticker is already in the album costs
  `STICKER_DISCOUNT` (config.ts, 25%) less: `priceFor(player, ownedIds)` on top of the
  curve, with `pricerFor(ownedIds)` for the places that price many players. **In both
  modes** - the album is global, shared by Quick Run, Career Mode and guests, so there is
  one price rule rather than a mode-dependent one; set the constant to 0 to switch it off.
  Everything that touches money goes through it, and that is the part to keep in step:
  the market rows (which show the full price struck through beside the discounted one),
  the **price and value sort comparators** (sorting by a price the player is not paying
  makes cheapest-first lie), the budget bar, `XiTable`'s cost column and total, and
  `autoFillBudget`, which takes the pricer as an argument because its per-slot reserve and
  upgrade passes must reserve against what will actually be charged. Keyed on **player
  id**, like the marker: owning Buffon 90 discounts that card, not Buffon 88.
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
  spends most of the budget (committed via `AUTOFILL`). The built XI plays through Quick Play +
  Cup Run exactly like a rolled one.

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
- **Run-end actions wait for the save** so the sticker haul is always shown before the
  next run starts, with a 4s release and a run-generation guard so a slow server cannot
  block play or drop a stale summary into the next run.

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
- Workflow: commit and push directly to `main` for this repo. Always `npm run build`
  before committing. End commit messages with the `Co-Authored-By` trailer.
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
- `Tooltip.tsx` portals its bubble to `document.body` with `fixed` positioning (so
  it escapes `overflow` clipping), flips above/below by available space, and
  dismisses on scroll/resize. Hover-only by design.
- `Flag.tsx` renders **only real flags** (no code-box fallback; returns `null` if a
  code is unmapped). The red "YOU" badge marks the user's own team in match screens.
- `BoxScore` (right column) renders the **ratings strip** (Ovr = all, Att = FWD,
  Mid = MID, Def = GK+DEF; Ovr is the deep-green hero cell) and, below it, the
  **chemistry card** (donut + effective overall + per-category breakdown chips).
  `XiTable` is the **line-up sheet** below them (pos / name / flag+year / rating,
  GK row on chalk).
- **Team rating chips**: `RatingChip` (in `matchUi.tsx`) shows a team's rating as a
  small chip next to it (standings, fixtures, bracket seeds, summary recaps). It is
  hidden below the `sm` breakpoint (no hover on mobile, space is tight) and toggled
  globally by `FEATURES.teamRatings`. This replaced the earlier title-hover tooltips.
- **Auto-scroll**: `useFollowBottom` eases the page down to follow growing content
  (live goal feeds, new match / round cards, the qualify call-to-action). It follows
  down only, pauses when the user scrolls up, and never cancels its own in-flight ease.
  `index.css` sets `overflow-anchor: none` on `html`: the browser's scroll anchoring
  otherwise nudges scrollY when result cards mount and stalled the follow (worst on
  short mobile screens).

## Hosting

Build output (`dist/`) is static. Because routing uses the History API (clean paths),
`vite.config.ts` sets an **absolute** `base` for the build (`'/wcsim/'`; `'/'` in dev)
so deeply-nested URLs still resolve `/assets`, and `scripts/copy-404.mjs` (run at the
end of `npm run build`) copies `index.html` to `dist/404.html` so GitHub Pages serves
the SPA for any deep link / refresh. `.github/workflows/deploy.yml` builds and deploys
to GitHub Pages on push to `main`. NOTE: the absolute base makes `dist/` GitHub-Pages-
path-specific; a NAS/Docker host at a different path must rebuild with its own `base`
(see `README.md` for the Synology/Docker options).
