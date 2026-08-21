# World Cup Simulator

A single-page game: draft a team of 11 World Cup players from roughly the last
three decades (position by position, each from a randomly rolled national team),
then take them through a simulated group stage and knockout rounds to try to win
the World Cup.

Client-side by default: played as a guest there is no backend and no database, and all
player data lives in fixed TypeScript objects under `src/data/`. Accounts are the one
optional exception - point the build at a Supabase server and your album, career and
in-progress run follow you between devices (requirements in
`docs/cloud-sync-requirements.md`, server setup in `docs/nas-setup.md`); with no server
configured that whole layer is absent from the bundle.

> **All nine tournaments from 1990 to 2022 are researched full datasets** - about
> 6,270 player rows. 1990 and 1994 are 24-nation fields, 1998 onward are 32; squad
> sizes are 22-man for 1990-1998, 23-man for 2002-2018 and 26-man for 2022 (Iran
> registered 25), with shirt numbers and positions taken from the tournament squad
> lists. Ratings are a holistic judgement of each player's strength **at the time of
> that tournament** on a 60-99 scale - not current ability, and not a FIFA-game
> number. For 1998 and 2002 the rating blends pre-tournament ability with how the
> player actually performed there. Historical nations keep their period identity:
> West Germany is recorded as Germany on `GER`, while the Soviet Union, Czechoslovakia
> and Yugoslavia have their own codes. A player appearing in several tournaments shares
> one identity, so they can only be drafted once - Luka Modrić spans 2006-2022.
> Edit `src/data/squads.ts` to refine any of it.

## Tech stack

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS v4** (via the `@tailwindcss/vite` plugin)
- State as a single `useReducer` game machine; pure game logic in `src/domain/`
- **Routing** via `react-router-dom` (clean paths); the whole game is mirrored to
  `localStorage`, so browser Back/Forward work and an in-progress run survives a refresh
- **Two navigations in one build:** the shipped chrome, plus a five-tab preview at
  `?nav=tabs` (roadmap item 27). Runtime switch, so both can be compared on the same
  progress - see `CLAUDE.md`
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
```

## Project layout

```
src/
  data/        types.ts (domain types + position/category model), format.ts (name/
               position display helpers), squads.ts (the dataset)
  domain/      pure logic: formations, draft, match (sim + shootout), tournament
               (group/standings), knockout + bracket (16-team tree), clock (playback),
               chemistry, odds, difficulty, validateSquads (dev-time dataset checks),
               plus the flagged layers: album (stickers), pricing + budget (transfer
               market), boons / run / career / ascension (Cup Run), challenges
  state/       gameReducer.ts (phase machine: setup -> draft -> complete -> group ->
               knockout) + store/ (one persistence seam, local or account-backed)
               over persist.ts / albumStorage.ts / careerStorage.ts / runStorage.ts /
               settingsStorage.ts, and auth.ts for accounts
  hooks/       useMatchClock (match reveal), useFollowBottom (auto-scroll),
               useSettings (theme / difficulty / year pool), useStickerAlbum
  components/  SetupPanel, SquadPanel, Pitch (+ PlayerBadge), BoxScore (ratings +
               chemistry), XiTable (line-up sheet), CompletePanel, the group screen
               (TournamentScreen -> GroupDrawReveal modal / StandingsTable / MatchdayCard)
               and KnockoutScreen (+ Bracket + Confetti), TournamentSummary, the squad
               browser (SquadBrowser + TeamRoster), and shared atoms (Flag, Tooltip,
               FixtureRow, GoalList) via matchUi/matchView + useMatchClock
  config.ts    FEATURES flags
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
- [x] Cup Run + career: a roguelike run (boosts between rounds, an Ascension difficulty ladder) over a persistent career of XP, levels, Prestige and tiered perks, feature-flagged
- [x] Challenges: 130 permanent honours judged from a finished run, feature-flagged (their Prestige awards are on: bronze 2, silver 5, gold 12)
- [x] Optional accounts: sign in with an emailed code and your album, career, settings and in-progress run live on a server instead of the browser (absent unless the build is given one)
- [x] Settings: match speed, a casual/normal/hard difficulty, a light/dark theme, and which World Cups the game draws from
- [x] Navigation preview: a five-tab chrome (Play / Career / Album / Records / Squads, with a bottom bar on a phone) at `?nav=tabs`, or from Settings. Same features, new click paths; `?nav=classic` switches back

## Hosting

The build output (`dist/`) is static. Routing uses the History API (clean paths),
which needs an **absolute** base and an SPA fallback:

- `vite.config.ts` sets `base: '/wcsim/'` for the production build (`'/'` in dev),
  so deeply-nested URLs (e.g. `/squads/team/bra-2002`) still resolve `/assets`.
- `npm run build` also writes `dist/404.html` (a copy of `index.html`), so a deep
  link or refresh is served the app instead of a 404.

### GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`. In the
repository settings, set **Settings -> Pages -> Build and deployment ->
Source = GitHub Actions**. The site is served at `<user>.github.io/wcsim/`, which
matches the configured base.

### Another host or path (Synology, Docker, custom domain)

Because the base is absolute, serving the app at a different path means rebuilding
with a matching base, e.g. root: `npm run build -- --base=/` (or
`--base=/my/path/`). Then either configure the server to serve `index.html` for
unknown routes, or rely on the emitted `404.html`.

1. **Web Station** (simplest): rebuild with the right base, copy `dist/` to a
   shared folder, and point a Web Station virtual host at it.
2. **Container Manager (Docker)**: build the included image and run it (adjust the
   Dockerfile's build `--base` and nginx SPA fallback for your path first).

   ```bash
   docker build -t wcsim .
   docker run -d -p 8080:80 --name wcsim wcsim
   ```

   Then browse to `http://<nas-ip>:8080`.
