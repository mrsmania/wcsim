# Roadmap / Pipeline

Working handoff doc: where the project is and what to build next. Update this as
things ship (move items between sections, keep it honest). Detailed specs live in
`docs/career-depth-spec.md` and `docs/roguelike-career-design.md`.

Last updated: 2026-07-09.

## Done (recent, newest first)

- **UI/UX polish pass.**
  - *Cup Run hub:* collapses to a slim strip by default (pre-run too) so the "Play group
    stage" CTA stays visible; the whole header bar is now the collapse toggle (pointer +
    hover tint, Open/Hide + chevron-in-a-ring, a "N Prestige to spend" hint) and it
    animates open/closed (grid-rows height transition). The separate "Start a Cup Run"
    screen is gone (you land straight on the run layout; "Play group stage" begins the
    run), perk cards show the active effect + the next upgrade, and the chosen Ascension
    tier now persists across runs. Layout/affordance options mocked in
    `docs/redesign-2026/turf-flat/hub-layout-options-mock.html` +
    `hub-collapsed-affordance-mock.html`.
  - *Home page:* CTAs + resume buttons are real `<Link>`s (middle/ctrl-click opens a
    new tab); fixed the dark-mode white-on-white "Play a Quick Run" button (CTAs pin a
    fixed dark label on the always-green hero); mobile "chase the legends" avatars are
    large colour focal images (grayscale + hover-lift only where hover exists).
  - *Global:* new **dark mode** "Graphite" neutral-grey scheme (dark toggle moved to the
    top of the settings modal); the vertical scrollbar is always reserved (`overflow-y:
    scroll` on `html`) so navigating between short/tall screens no longer shifts the
    layout; album "back to game" returns to where it was opened from; mobile footer wrap
    fixed.
- **Draft role fix.** A placed player now counts as the role of the slot they fill, not
  their listed main position (e.g. Rijkaard bought as CB is no longer treated as a DM for
  strength/boosts/display). `domain/draft.ts placedPlayers`.
- **Budget line-up detail.** The budget build shows each player's cost + total spent in
  the line-up sheet (`XiTable` `budget` prop).
- **Home launcher (implemented).** `ModeSelect.tsx` is the marketing landing: a grass
  tactics-board hero (game pitch colours) with an all-time 4-3-3, the two CTAs + resume
  buttons, a 3-beat "how it works" (circle-dashed / swords / trophy), and a
  grayscale-to-colour "chase the legends" showcase (top collectibles, real sticker art).
- **Career depth G - Transfer Budget progression.** Career Mode's budget-draft budget
  scales via a `transfer-budget` perk track (8 tiers, $70 base -> $150), bought with
  Prestige + level-gated. Quick Run stays fixed at `$110` (`config.ts BUDGET_BY_TIER`;
  App computes the effective `budget` and passes it to `BudgetMarket`). Also **slowed XP**
  (`XP_PER_LEVEL` 100 -> 200) so the level gates on perks/budget actually bite.
- **Mode-first flow** - `/` is a launcher (Quick Run vs Career Mode); both build on the
  same 3-column page at `/quick-run` + `/career-mode`; one "Start Run" CTA. Resume of an
  ongoing World Cup / Cup Run from the launcher; live match reveal is persisted
  (`wcsim_run_reveal_v1`) so leaving mid-match resumes rather than replays; the
  knocked-out screen shows the final opponent. See CLAUDE.md "Play mode" + "Routing".
- **Career depth A** - boost-pool unlocks + rarity-weighted offers.
- **Career depth B** - tiered, level-gated perks (+ CareerState v1->v2 migration).
- **Career depth C** - Ascension tiers (handicap + steeper draw + reward multiplier,
  earned by winning + level-gated; multipliers since tuned to 1.0/1.25/1.5/1.75/2.0/2.25).

## Next up (in order)

1. **Career depth E - Challenges / Mandates.** The high-value retention feature (the
   user is keen on this one). Renewable objectives checked from the finished `RunState`
   (e.g. win at Ascension III, win with an avg-rating < 80 XI, clean-sheet the
   knockouts). Awards Prestige + trophy-cabinet entries. Spec: `docs/career-depth-spec.md`
   "Future ideas / E" (has a data model + example challenges).

## Later / not started (spec'd as ideas)

- **Career depth D** - in-run economy (Form) + node variety (shop / event / curse).
- **Career depth F** - odds readout at each decision (`domain/odds.ts` exists) + a daily
  seeded run (needs a seedable RNG in `domain/random.ts`).
- **Trophy cabinet** - surfaces cups-by-Ascension, challenges completed, badges (pairs
  with E).

## Small loose ends (nice-to-have, none blocking)

- **Mode-aware Start Run label** - currently a generic "Start Run" in both modes; could
  read "Start the World Cup" / "Start the Cup Run".
- **Launcher: in-progress build** - the launcher surfaces in-progress tournaments/runs
  but not an in-progress *build* (formation started, XI not complete).
- **Squad Browser stale label** - `SquadBrowser.tsx` still tags 1990 & 1994 as
  "approximate placeholder"; they are fully researched 24-team fields now, so the label
  is misleading (same issue was fixed in the settings modal already).
- **Album-fill helper is stale** - the localStorage snippet handed to the user early on
  filled 68 collectibles; the set is now **81** (58 legendary / 18 iconic / 5 monumental)
  after rating tweaks. Regenerate on request (compute via `collectiblePlayers`).

## Conventions reminder (for a new agent)

- `npm run build` before committing; `npm run checks` after touching `domain/`.
- Gate experimental features behind a `FEATURES` flag (`src/config.ts`).
- No em-dashes in generated text; "rating" not "elo", "boost" not "boon" in UI copy.
- Commit + push directly to `main`; end commit messages with the Co-Authored-By trailer.
