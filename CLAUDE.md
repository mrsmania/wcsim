# CLAUDE.md

Project context for AI assistants and developers. Read this first when working in
this repo. (User-facing setup/hosting notes live in `README.md`.)

**Where to pick up work:** `docs/ROADMAP.html` is the single list of open work (next up,
later, loose ends, with what shipped collapsed at the bottom as decision history). Open it
in a browser and check it first if you are continuing the project. It replaced the old
`docs/ROADMAP.md` + `docs/todo/TODO.html` pair, which held overlapping copies of the same
items and drifted apart.

**Cleanup work has its own list:** `docs/hygiene-audit.html` (roadmap item 23) is a
wave-by-wave backlog of dead code and behaviour-preserving refactorings, H1 to H105, plus
the decisions they need and an explicit list of what not to touch. It is **blocked on item
22** and should not be started before it. Note that it records several claims in this file
as drifted (see its wave 1d); those corrections are backlog items, so do not be surprised
to find them still wrong here.

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
               budget.ts     (the market's randomized "Auto-fill & spend")
               boons.ts      (Cup Run boons: rating + roster transforms; gated)
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
               validateSquads.ts (dev-time dataset integrity checks)
  state/       gameReducer.ts (the phase machine + Action union; AUTOFILL loads a
               fully built XI; a `build` "roll|budget" field with START_BUDGET/BUY_PLAYER
               for the in-page budget build); store/ (the persistence seam - see below);
               and behind it the per-key modules store/ delegates to: persist.ts (the
               whole game <-> localStorage, so routes survive a refresh), albumStorage.ts
               (the sticker album <-> its own localStorage keys), careerStorage.ts
               (the Cup Run career <-> wcsim_career_v1), runStorage.ts, settingsStorage.ts
  hooks/       useFollowBottom.ts (auto-scroll), useMatchClock.ts (the shared
               match-reveal clock used by both tournament screens), useSettings.ts
               (theme / difficulty / year pool, through the store), useStickerAlbum.ts
               (the album + the run-end banking rule, see below), motion.ts
               (prefersReducedMotion)
  components/  presentational React (App composes them); the group screen
               (TournamentScreen) splits into GroupDrawReveal / StandingsTable /
               MatchdayCard, and matchUi.tsx + matchView.ts hold the shared
               presentational atoms + per-match view-model used by both screens;
               SquadBrowser + TeamRoster are the read-only squad archive (see below);
               CupRunScreen (Cup Run + career) is a lazy-loaded (React.lazy) route
               screen, as are ChallengesScreen and CabinetScreen (the trophy cabinet);
               BudgetMarket is the budget build's left-column panel (shares
               the home page's Pitch + ratings/line-up, not a separate screen)
  config.ts    FEATURES flags (chemistry, teamRatings, removePlayers, movePlayers,
               randomTeam, squadBrowser, stickerAlbum, stickersOnCupWinOnly,
               stickerImages, careerMode, budgetDraft, challenges, challengeAwards,
               trophyCabinet;
               plus `accounts`, which is DERIVED from the build env, see below) +
               STICKER_TIERS / STICKER_TRADE_COST / STICKER_DISCOUNT +
               BUDGET_DRAFT / BUDGET_BY_TIER
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
their data is missing), `/cup-run`, `/album`, `/challenges`, `/cabinet`, and
`/squads/*`. Navigation happens via
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
looking for one:

- **Persisted preferences** (`hooks/useSettings.ts` over `state/settingsStorage.ts`, key
  `wcsim_settings_v1`, through the store seam, seeded from the boot snapshot): `theme`
  (`light | dark`, applied to the document by the hook), `difficulty`
  (`casual | normal | hard` -> `domain/difficulty.ts`, which adds +3 / 0 / -3 to the
  **user's own** attack and defense in their matches and touches nothing else), and
  `poolYears`.
- **Match `speed`** is reducer state (`SET_SPEED`, default `fast`), not a preference,
  because it belongs to playback of the run in progress. The modal just receives it.

**`poolYears` is the one with reach.** It is which World Cups the game draws from, and
`squadsInPool(years)` (data/squads.ts) narrows the pool that `App` derives once and hands
to the squad rolls, the transfer market, the opponents, and the sticker album's completion
target. Defaults to every year; it is **never empty** (an empty selection falls back to
all), and loading tolerates years that are not in the dataset. Keeping settings on their
own key is deliberate: resetting the game, album, career or run never touches them.

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
  **Monumental** 97-99 (currently 58 / 18 / 5 = **81** across the dataset; it was 53 before
  the 1990-2002 squads were researched, so re-derive a count rather than trusting one
  written down here). Collectibility is derived at runtime (`domain/album.ts` `tierOf`), so
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
- **Earning: `FEATURES.stickersOnCupWinOnly`** (added 2026-08-15, and **set back to
  `false` the same day**, which is the shipped setting). **False:** any finished run banks
  the final XI, so the album records who you *drafted*. **True:** only a cup win banks, so
  it records what you *won*. The flag also switches the copy that explains it (home page,
  draft call-out).
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
  a run awards XP (-> levels, `XP_PER_LEVEL = 200`) and Prestige, spent in a perk shop of
  six tracks (Scout Network, Deep Squad, Extra Choice, Transfer Budget, Physio Table, Extra
  Re-roll) that feeds the next run. **Perks are tiered and level-gated**, not one-off buys:
  each track has two steps except Transfer Budget's eight, every step costs Prestige and
  carries a `levelReq`, so a level is a gate rather than a decoration. The shop is
  data-driven off `PERKS`, so a new perk or tier appears by being added there; what needs
  wiring is only its effect. A trophy record (runs/cups/best) sits in
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
- **Ascension** (`domain/ascension.ts`) is the run's difficulty ladder, chosen per run:
  Base plus five tiers, each handing the user a rating handicap in **their own** matches
  (0 to -10, the same lever as the difficulty setting), steepening the knockout draw toward
  stronger squads, and multiplying the run's XP + Prestige (1.0 to 2.25). A tier unlocks by
  winning a cup at the tier below **and** reaching its `levelReq` (1/3/6/10/20/30), so the
  ceiling is earned twice over. `run.ts` applies the levers; `career.ts` keeps the unlock
  and the reward multiplier. Not to be confused with `domain/difficulty.ts`, the player's
  own casual/normal/hard **setting** (+3/0/-3 to the user's attack and defense, nothing
  else), which is orthogonal and applies in both modes.
- **Prestige also unlocks boosts.** 6 of the 19 boons are `starter`s; the rest are bought
  into the offer pool with Prestige (`BOON_UNLOCK_COST` common 15 / rare 30 / legendary 55,
  `unlockBoon`, the pool shown in `CareerHub`), and `availableBoons(unlockedBoons)` is what
  an offer draws from. So Prestige has two sinks, perk tiers and boost unlocks, and (once
  `FEATURES.challengeAwards` goes on) challenge awards would be its second faucet.
- Known gaps (prototype): the layer is deeper than it looks from `CareerState` alone, but
  Ascension's tuning is a first pass (`ASCENSIONS` is marked tunable, and the odds sim in
  `domain/odds.ts` is the tool for it), and level does nothing beyond gating.

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
  it: the perk shop plus every locked boost costs **2525 Prestige**, and a run pays a
  median of 9. At 2/5/12 the whole catalogue is worth 779, about a third of the shop, and
  challenges are ~1/6 of a long career's Prestige, so runs stay clearly the primary
  faucet. For scale: 10/30/75 (the first guess) was worth 4705, nearly twice the shop and
  56% of all income, which is what kept the awards off; 3/8/20 was 1266, half the shop.
  If the numbers ever move, keep the property that **awards buy but do not gate**:
  challenge Prestige grants no XP, so the level requirements on the dearest perk tiers can
  still only be met by playing.
- **Awards are behind their own flag, `FEATURES.challengeAwards`, ON since 2026-08-19.**
  One switch for both halves deliberately: with it false nothing is paid **and** no award is
  shown anywhere (`AWARDS_ON` gates the catalogue rows, the hub card, the run-end list and
  the counter's Prestige cell), because Prestige arriving from an invisible source is worse
  than either. It was off until the numbers were tuned by simulation (see the `AWARD` note
  above); the tier stays visible either way, as pips reading as difficulty. Two things to
  keep in mind:
  - **Flipping it on does not pay the backlog.** The wallet is only credited by
    `applyRunResult` for the ids completed in that run, while `challengeProgress().prestige`
    (the catalogue counter and the hub) is computed from every completion held, so the
    display and the wallet disagree by exactly the arrears. It cost nothing when it went on,
    because there was no real save to owe, but it would if the flag is ever cycled.
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
  27 that used to carry a `blocked` reason, so the catalogue screen's "not tracked yet"
  filter and legend chip hide themselves. No SQL migration was needed: `CareerStats` is a
  merged jsonb column and `RunState` a jsonb blob. `Challenge.blocked` stays in the model on
  purpose - it costs nothing and the next batch of entries will want it. What the wave added:
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
  available / completed / not tracked yet - the third hides itself while nothing is blocked,
  which is the case today - and every entry grouped by family), and the
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
  is `text-dim`, and a blocked entry just fades further with a lock and its reason on hover,
  never red. Two tokens came with it (`src/index.css`): `--color-dim`, which carries the name
  and description of most of the catalogue and is therefore held at AA on ground / panel /
  chalk, and `--color-hair`, the row rule, a step lighter than `--color-line`. The two
  columns are a **grid, not CSS columns**, because a grid row levels both cells' heights and
  so keeps the pair of hairlines in line when one description wraps and the other does not;
  one column below 700px. When `FEATURES.challengeAwards` is on, the row shows its `+N` where
  the card used to.
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
  rating-sorted, searchable list for the targeted position (all shown; unaffordable/used rows
  disabled; collectible tier stars). You buy from all squads within a budget, each priced by
  rating via **`domain/pricing.ts`** (`priceOf` = `max(1, round((elo-58)^2/64))`, convex so
  the budget forces trade-offs). The budget is a `budget` prop (not a constant): Quick Run
  (and career-off) use the fixed `BUDGET_DRAFT` ($110); **Career Mode scales it** by the
  owned `transfer-budget` career perk via `config.ts` `BUDGET_BY_TIER` ($70 base -> $150),
  computed in `App` (reads `store.peek().career`, synchronously) and passed to
  `BudgetMarket`.
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
- **The cup pick may be a DUPLICATE, and the server cannot judge otherwise.** With the
  pickable tiers exhausted the reward picker offers the whole list on purpose (album spec
  FR-3) and the pick lands as a duplicate, which is what the guest store always did; the
  server refused it ("cup pick bra-1998-9 is already collected"), and since that raise
  rolls the whole bank back and a failed signed-in write is the blocking unreachable
  state, a full album made a cup win unplayable for an account. Migration `0012` drops
  that check. Do not put back a narrower "only when nothing is left to collect" version:
  the picker draws from the player's selected World Cups (`poolYears`), so a finished
  2022 pool offers duplicates while the catalogue still holds uncollected 1990 cards, and
  any exhaustion test on the server would refuse that legal pick. Deployment being
  client-first, `remoteStore.finishRun` also retries a refused pick as one more entry in
  `collectibleIds` (added copy by copy, no already-collected check, and 11 + 1 still fits
  the cap of 12), so a pre-`0012` server banks the duplicate instead of losing the run.

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
