# CLAUDE.md

Project context for AI assistants and developers. Read this first when working in
this repo. (User-facing setup/hosting notes live in `README.md`.)

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
```

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
               validateSquads.ts (dev-time dataset integrity checks)
  state/       gameReducer.ts (the phase machine + Action union), persist.ts (the
               whole game <-> localStorage, so routes survive a refresh),
               albumStorage.ts (the sticker album <-> its own localStorage keys)
  hooks/       useFollowBottom.ts (auto-scroll), useMatchClock.ts (the shared
               match-reveal clock used by both tournament screens)
  components/  presentational React (App composes them); the group screen
               (TournamentScreen) splits into GroupDrawReveal / StandingsTable /
               MatchdayCard, and matchUi.tsx + matchView.ts hold the shared
               presentational atoms + per-match view-model used by both screens;
               SquadBrowser + TeamRoster are the read-only squad archive (see below)
  config.ts    FEATURES flags (chemistry, teamRatings, removePlayers, squadBrowser,
               stickerAlbum) + STICKER_TIERS / STICKER_TRADE_COST
  App.tsx      owns the reducer, the roll animation, and responsive-scroll effects;
               branches its screen by the URL (react-router)
  main.tsx     entry (wraps App in React.StrictMode + BrowserRouter)
```

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
`location.pathname`: `/` (home = setup/draft/complete, sub-view derived from
`formation` + `isComplete`, not `phase`), `/group`, `/knockout` (both redirect `/` when
their data is missing), and `/squads/*`. Navigation happens via `useNavigate` in the
masthead Play/Squads toggle and the transition handlers (`handleStartGroup`,
`handleEnterKnockout`, `handleReset`), which never rebuild existing state. So Back/
Forward move between screens (knockout <-> group <-> home) without losing progress. On
top of browser Back/Forward, each tournament screen carries a `StageCrumb` link in its
`StageHeader` for explicit, discoverable cross-navigation: the knockout screen links back
to `/group` (`onViewGroup`), and once a bracket exists the group screen links forward to
`/knockout` (reusing `onEnterKnockout`, which only navigates when the bracket is already
built, and whose qualified-CTA button then reads "Back to the knockouts"). The
whole `GameState` is mirrored to `localStorage` (`state/persist.ts`) and restored on
load, so `/group` and `/knockout` survive a refresh (transient draft fields are reset
on restore). `SquadBrowser` derives its view from route params via `useMatch`
(`/squads/by-world-cup/:year`, `/squads/by-team/:code`, `/squads/team/:squadId`); team
codes in URLs are lowercase and matched case-insensitively.

## Core concepts

- **Position vocabulary** (`Position`): `GK LB CB RB DM LM CM RM AM LW RW ST`.
  `categoryOf()` buckets these into `GK | DEF | MID | FWD`.
- **Player** (`data/types.ts`): `id`, `personId`, `squadId`, `number`, `name`,
  `positions` (ordered - **`positions[0]` is the player's natural/primary role**),
  `elo` (strength rating, ~60-99; shown in the UI as "rating", never "elo").
- **Squad**: `id` = `` `${code}-${year}` `` (e.g. `bra-2002`), `code`, `nation`,
  `year`, `rating`, `players`.
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

- Tournaments: **1998** and **2002** are partial, hand-authored **placeholder**
  squads (approximate, not verified). **2006, 2010, 2014, 2018, 2022** are full
  32-nation researched datasets (23-man squads for 2006-2018; 26-man for 2022, with
  Iran 25). ~3,878 player rows total.
- **Ratings** are a holistic judgement of each player's strength *at the time of
  that tournament* on the 60-99 scale (not current ability, not a FIFA-game number).
- The `squad(code, nation, year, rating, rows)` helper builds the `Player[]`;
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
  rectangles/circles it draws each frame, kept heavy for `durationMs` (9s) then drained.
  It is pointer-events-none (never blocks "Draft a new XI"), sits at `z-50` and fills
  the viewport via `fixed inset-0 h-full w-full` (a bare `<canvas>` is a replaced
  element, so `inset-0` alone leaves it at its intrinsic 300x150 and confines the rain
  to the top-left); the backing store is sized to the canvas's rendered box x
  `devicePixelRatio` so it stays crisp on high-DPI screens. It respects
  `prefers-reduced-motion` and scales piece size / density down on narrow screens.
  (The earlier `canvas-confetti`-backed version was dropped: driving its scoped
  instance with a per-frame `fire()` stopped adding particles after the first frames,
  so the rain drained out after ~5s instead of lasting the full 9s.)

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
- **Earning (run-end only).** Stickers are never awarded mid-run. At run-end (bracket
  `champion`/`out`, or group-stage elimination) `App` applies the collectibles in the
  **final XI** (derived from `filled`, so autofill and swaps are covered for free) via
  `applyRunStickers`, guarded once-per-run by the persisted `stickersApplied` reducer
  flag. A **cup win** first shows `CupRewardPicker` (pick any one uncollected sticker,
  any tier - FR-3/D-1), then applies. `RunEndStickerSummary` then shows the newly
  earned cards (only if any were new, FR-8). Both are global overlays in `App`.
- **Album screen** (`AlbumScreen.tsx`, route **`/album`**, reached from a home-screen
  entry button): completion counter + duplicate pool, tier sections (Monumental,
  Iconic, Legendary) of `StickerCard`s (collected = flag+name+rating+tier; uncollected =
  silhouette with a `?`), a per-tier **Trade** action (`TradeModal`) when affordable,
  and a 100% completion state. `StickerCard` is text+flag in v1 but image-ready (flip
  `STICKER_IMAGES`, drop `public/stickers/<player.id>.png`; base-path-aware, with a
  text/flag fallback).
- **Draft integration.** `SquadPanel` marks collectibles in the drawn squad (tier chip
  + a "collectibles in this squad" call-out). **Swap** (`SWAP_PLAYER` reducer action):
  when a player is selected, filled slots they're eligible for become swap targets on
  the `Pitch` (amber ring + swap glyph on the badge); swapping frees the outgoing
  player's `personId` and uses the incoming one, letting a collectible be brought in
  even when its slot is filled.
- With **`FEATURES.stickerAlbum` = false**: no album route/entry, no markers, no swap,
  no overlays, and no album localStorage reads/writes; the game is unchanged.

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
