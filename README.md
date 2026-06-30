# World Cup Simulator

A single-page game: draft a team of 11 World Cup players from roughly the last
three decades (position by position, each from a randomly rolled national team),
then take them through a simulated group stage and knockout rounds to try to win
the World Cup.

Pure client-side. No backend, no database. All player data lives in fixed
TypeScript objects under `src/data/`.

> The dataset mixes two tiers. **1998 / 2002** are hand-authored **placeholder**
> squads (approximate numbers, positions and elo from memory, not verified, and
> only a handful of nations). **2006 (Germany)** through **2022 (Qatar)** are
> researched full datasets: all 32 nations each, with their official squads
> (23-man from 2006-2018, 26-man in 2022; Iran registered 25 in 2022), shirt
> numbers and positions verified against the tournament squad lists; elo ratings
> are a holistic judgement of each player's strength at the time of that
> tournament (60-99). A player appearing in several tournaments shares one
> identity (so they can only be drafted once) - e.g. Luka Modrić spans 2006-2022.
> Edit `src/data/squads.ts` to refine any of it.

## Tech stack

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS v4** (via the `@tailwindcss/vite` plugin)
- State as a single `useReducer` game machine; pure game logic in `src/domain/`
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
  data/        types.ts (domain types + position/category model) + squads.ts (the dataset)
  domain/      pure logic: formations, draft, match (sim + shootout),
               tournament (group/standings), knockout, clock (playback), chemistry
  state/       gameReducer.ts (phase machine: setup -> draft -> complete -> group -> knockout)
  components/  SetupPanel, SquadPanel, Pitch (+ PlayerBadge), BoxScore (ratings +
               chemistry), XiTable (line-up sheet), CompletePanel, TournamentScreen
               (group + knockout on one screen), TournamentSummary + shared atoms
               (Flag, Tooltip, FixtureRow, GoalList, SpeedControl)
  config.ts    FEATURES flags
```

See `CLAUDE.md` for an architecture / onboarding overview.

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

## Hosting

The build output (`dist/`) is fully static, so it can be served anywhere.
`vite.config.ts` sets `base: './'` so the same build works at any path.

### GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
In the repository settings, set **Settings -> Pages -> Build and deployment ->
Source = GitHub Actions**. Because `base` is relative, it works for both a
project page (`<user>.github.io/<repo>/`) and a custom domain with no changes.

### Synology DS723+

Two options:

1. **Web Station** (simplest): build locally (`npm run build`), copy `dist/`
   to a shared folder, and point a Web Station virtual host at it.
2. **Container Manager (Docker)**: build the included image and run it.

   ```bash
   docker build -t wcsim .
   docker run -d -p 8080:80 --name wcsim wcsim
   ```

   Then browse to `http://<nas-ip>:8080`.
