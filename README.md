# Mondialino

A single-page game: draft a team of 11 World Cup players from every tournament since
1970 (position by position, each from a randomly rolled national team),
then take them through a simulated group stage and knockout rounds to try to win
the World Cup.

Client-side by default: played as a guest there is no backend and no database, and all
player data lives in fixed TypeScript objects under `src/data/`. Accounts are the one
optional exception - point the build at a Supabase server and your album, career and
in-progress run follow you between devices (requirements in
`docs/cloud-sync-requirements.md`, server setup in `docs/nas-setup.md`); with no server
configured nothing account-related renders and the auth code is never loaded.

> **All fifteen tournaments from 1970 to 2026 are researched full datasets** - 9,625
> player rows across 416 squads. 1970 to 1978 are 16-nation fields, 1982 to 1994 are 24,
> 1998 to 2022 are 32, and **2026 is the first 48-nation field**;
> squad sizes are 22-man for 1970-1998, 23-man for 2002-2018 and
> 26-man for 2022 and 2026 (Iran registered 25 in 2022; Morocco brought only 19 to 1970 and
> El Salvador 20 to 1982), with
> shirt numbers and positions taken from the tournament squad lists. Ratings are a holistic judgement of each player's strength **at the time of
> that tournament** on a 60-99 scale - not current ability, and not a FIFA-game
> number. For 1970 to 1986 and for 1998, 2002 and 2026 the rating blends pre-tournament
> ability with how the player actually performed there; for 1970 to 1986 and for 2026 the
> positions are additionally the roles each man filled at that tournament, read off its
> match line-ups - FIFA's own tactical line-ups in 2026's case, for all 104 games.
> Historical nations keep their period identity:
> West Germany is recorded as Germany on `GER`, while the Soviet Union, Czechoslovakia
> and Yugoslavia have their own codes. A player appearing in several tournaments shares
> one identity, so they can only be drafted once - Messi, Cristiano Ronaldo and Guillermo
> Ochoa each span six tournaments and twenty years, 2006 to 2026.
> Edit `src/data/squads.ts` to refine any of it.

## Tech stack

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS v4** (via the `@tailwindcss/vite` plugin)
- State as a single `useReducer` game machine; pure game logic in `src/domain/`
- **Routing** via `react-router-dom` (clean paths); the whole game is mirrored to
  `localStorage`, so browser Back/Forward work and an in-progress run survives a refresh
- **Navigation:** six tabs (Play / Career / Album / Records / Squads / Versus), a row on a
  desktop and a bottom bar on a phone
- **Design:** the flat "turf-flat" look (top-down tactics-board pitch, hard-shadow
  cards) with Archivo / Schibsted Grotesk / Spline Sans Mono web fonts. Tokens live
  in `src/index.css`; reference mockups in `docs/redesign-2026/turf-flat/`.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (bumps to 5174 if the port is busy)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run typecheck
npm run checks     # the domain characterization harness; also runs in CI
```

## Project layout

```
src/
  data/        types.ts (domain types + position/category model), format.ts (name/
               position display helpers), squads.ts (the dataset)
  domain/      pure logic: formations, draft, match (sim + shootout), tournament
               (group/standings), knockout + bracket (16-team tree), clock (playback),
               chemistry, odds, difficulty, random, market + archive (the market's and
               the squad browser's queries), validateSquads (dev-time dataset checks),
               plus the flagged layers: album (stickers), pricing + budget (transfer
               market), boons / effects / run / career / ascension (Cup Run),
               challenges, badges + cabinet (the trophy cabinet), and the pvp* family
               (the versus room's rules, its wire shape, the screens' derivations, the
               practice opponents)
  state/       gameReducer.ts (phase machine: setup -> draft -> complete; the tournament
               itself lives in RunState, not the reducer)
               + store/ (one persistence seam, local or account-backed) over
               persist.ts / albumStorage.ts / careerStorage.ts / runStorage.ts /
               settingsStorage.ts and storage/kv.ts, buildIo.ts (the two writes a build
               makes, so a versus room can turn both off), routes.ts + resume.ts,
               auth.ts for accounts, and pvp/ (the one place that talks to the referee)
  hooks/       useBuild (the whole build as a unit, so a versus room can hold a second
               one), useSquadRoll / useBudgetBuild / useMovePlayer (the three draft
               gestures), useCareer / useCupRun / usePool, useMatchClock (match reveal),
               useFollowBottom + useStackedScroll (scrolling), useSettings (theme /
               difficulty / year pool), useStickerAlbum, and useVersusRoom +
               useDuelAlert for versus
  components/  SetupPanel, SquadPanel, BudgetMarket (the transfer market), Pitch (+
               PlayerBadge), BoxScore (ratings + chemistry), XiTable (line-up sheet),
               CompletePanel, BuildPage + BuildSurface (the build's layout and wiring),
               ModeSelect (the front page), the run screen (CupRunScreen + cupRun/*:
               RunBracket -> Bracket, RoundReview, RunEndPanel, CareerHub), the honours
               screens (ChallengesScreen, CabinetScreen), the squad browser
               (SquadBrowser + TeamRoster), versus/* (the room, from the lobby to the
               result), and shared atoms (Flag, Tooltip, FixtureRow, GoalList,
               GroupDrawReveal, StandingsTable, MatchdayCard, Confetti) via
               matchUi/matchView, navUi and challengeUi
  config.ts    FEATURES flags
referee/       the versus server: the only writer of rooms, deployed by hand and
               separately (see docs/pvp-plan.md and docs/nas-setup.md)
```

App branches its screen by the URL (react-router); see `CLAUDE.md` for the full
architecture / onboarding overview.

Players carry an array of specific positions (e.g. `['RB','RM']`); a slot only
accepts a player whose positions include the slot's role. Each real person has a
`personId` (slug of the name) shared across squads, so the same player can only
be drafted once even if they appear in multiple tournaments.

Formations are hardcoded in `src/domain/formations.ts` (`RAW_FORMATIONS`) as a
list of the 11 on-pitch roles per formation/style; the layout engine derives
pitch coordinates from the role counts (touchline lanes, depth bands, per-role
stagger). `DM` and `AM` are distinct central roles with their own deeper /
advanced bands. Add a row to `RAW_FORMATIONS` to add a formation.

## Current status

- [x] Three-column team sheet (flat "turf-flat" design): settings/squad/summary (left), pitch (center), ratings + chemistry + line-up (right)
- [x] Pitch previews the chosen formation instantly; pick formation + style (Defensive / Balanced / Offensive)
- [x] Style changes both shape (def adds a DM, off adds an AM) and vertical placement (def deeper, off higher)
- [x] A Roll button starts the draft (selection only begins then, not on formation pick)
- [x] Auto-draw a real tournament squad (scramble animation); fully displayed, no scroll
- [x] Re-roll: another team (same cup), another cup (same nation), another roll (random), 3 total
- [x] Pick a player and place into a position-matching open slot (locks once filled)
- [x] Each player usable once across all squads
- [x] Repeat until all 11 positions are filled
- [x] Group stage: draw 3 opponents, round-robin, group table, top 2 advance
- [x] Match engine: team strength (attack/defense from elo) -> Poisson goals, with scorers
- [x] Animated play-by-play match overlay (running clock, goal feed)
- [x] Knockout rounds through to the final (extra time + penalty shootout) and a tournament summary
- [x] Team chemistry: cohesion bonus to the user XI, feature-flagged in `src/config.ts`
- [x] Squad browser: browse every squad by World Cup or by team (with all-time "Legends" per team), feature-flagged
- [x] Real URLs with working browser Back / Forward; the in-progress game persists across a refresh
- [x] Transfer market: build the XI by buying within a budget instead of rolling squads, feature-flagged
- [x] Sticker album: a persistent Panini-style collection of the elite players you draft, with duplicates and trades, feature-flagged
- [x] Cup Run + career: a roguelike run (boosts between rounds, an Ascension difficulty ladder) over a persistent career of XP, levels, Prestige and tiered perks - the only way the game is played, so no longer behind a flag
- [x] Challenges: 130 permanent honours judged from a finished run, feature-flagged (their Prestige awards always pay: bronze 2, silver 5, gold 12)
- [x] Optional accounts: sign in with an emailed code and your album, career, settings and in-progress run live on a server instead of the browser (absent unless the build is given one)
- [x] Settings: match speed, a casual/normal/hard difficulty, a light/dark theme, and which World Cups the game draws from
- [x] Six-tab navigation (Play / Career / Album / Records / Squads / Versus): a row on a desktop, a bottom bar at thumb height on a phone, and one build page
- [x] A Cup Run plays as a tournament: the group opens with the draw and a table that fills in as the matchdays play, and the knockouts run on a 16-team bracket, collapsed to your own path with the full draw one click away
- [x] Trophy cabinet: a read-only account of what a career has to show for itself (a shelf carrying one trophy per cup won, three boards for the players most used / most prolific / most decorated, the records, and the earned badges), derived rather than stored, feature-flagged
- [x] Versus: two, four or eight people play a whole knockout against each other, found on a public list or reached with a six-character link - roll a squad each or buy from a shared budget, with or without the ratings on show, and whoever goes out first stays and watches the rest. The host can fill the empty chairs with practice opponents that build a strong XI of their own, and can throw somebody out of the room before it starts. Needs accounts plus a referee server, so it is absent unless the build is given both
- [x] Duels: a versus challenge sent by link and played in your own time - you each build whenever you get to it, the match plays itself the moment the second team is sent, and calling it off costs nothing until the squads are dealt, after which walking away loses it

## Hosting

The build output (`dist/`) is static. Routing uses the History API (clean paths),
which needs an **absolute** base and an SPA fallback:

- `vite.config.ts` sets an absolute `base`, `'/'` by default, so deeply-nested URLs
  (e.g. `/squads/team/bra-2002`) still resolve `/assets`.
- `npm run build` also writes `dist/404.html` (a copy of `index.html`), so a deep
  link or refresh is served the app instead of a 404.

### GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`. In the
repository settings, set **Settings -> Pages -> Build and deployment ->
Source = GitHub Actions**.

This deployment serves the game at **https://mondialino.ch**, a custom domain, so it
comes from the domain root and matches the default base. Two things carry the domain: the
**Custom domain** field in those same Pages settings, and `public/CNAME`, which puts it
in the published artifact as well. A fork wants its own value in both, or neither: a
project site then serves at `<user>.github.io/<repo>/`, which needs
`VITE_BASE=/<repo>/`.

### Another host or path (Synology, Docker, custom domain)

Because the base is absolute, serving the app at a different path means rebuilding
with a matching base. Set `VITE_BASE`:

```bash
npm run build                       # served at the domain root (the default)
VITE_BASE=/my/path/ npm run build   # served under /my/path/
```

Then either configure the server to serve `index.html` for unknown routes, or rely
on the emitted `404.html`.

> Do **not** use `npm run build -- --base=/my/path/`. npm appends forwarded arguments to
> the last command in the `&&` chain, so the flag reaches `copy-404.mjs` rather than Vite;
> that script ignores unknown arguments and exits 0, so the build reports success and
> still points every asset at the default base. `VITE_BASE` is read in `vite.config.ts`
> and works through the whole chain.

1. **Web Station** (simplest): rebuild with the right base, copy `dist/` to a
   shared folder, and point a Web Station virtual host at it.
2. **Container Manager (Docker)**: build the included image and run it. The image
   takes the base as a build argument, defaulting to `/` because nginx serves from
   the root; adjust the nginx SPA fallback if you host under a sub-path.

   ```bash
   docker build -t wcsim .
   docker run -d -p 8080:80 --name wcsim wcsim
   ```

   Then browse to `http://<nas-ip>:8080`.
