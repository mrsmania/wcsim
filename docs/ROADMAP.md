# Roadmap / Pipeline

Working handoff doc: where the project is and what to build next. Update this as
things ship (move items between sections, keep it honest). Detailed specs live in
`docs/career-depth-spec.md` and `docs/roguelike-career-design.md`.

Raw, not-yet-scheduled ideas live in `docs/todo/TODO.html` (the inbox, open it in a
browser); items graduate from there into "Next up" below once they have a shape.

Last updated: 2026-08-17.

## Done (recent, newest first)

- **Accounts (shipped 2026-08-15).** Sign in with an emailed 6-digit code; album, career,
  settings and the in-progress run live on a self-hosted Supabase on the NAS instead of in
  the browser, so they are the same on every device. Guest play is untouched and never
  contacts the server. Requirements `docs/cloud-sync-requirements.md`, design
  `docs/cloud-sync-design.md`, server setup `docs/nas-setup.md`, and the gotcha list in
  CLAUDE.md - every one of those gotchas was a real bug found by playing, three of them
  only visible on a *second* run.
- **Boost + perk rebalance (2026-08-15).** Pool 11 -> 19 boosts. A boost's worth is what it
  moves the attack/defence averages, its budget is the sum of both, and `npm run checks`
  now prints the figures and fails on an overspend. Chemistry Catalyst removed (a
  build-controllable condition doing a legendary's job at common rarity), Marquee Signing
  and Star Signing re-rarified, Deep Squad capped at +2, Scout Network limited to commons,
  new Physio Table perk (re-roll an offer).
- **Stickers are earned by winning the cup** (`FEATURES.stickersOnCupWinOnly`, 2026-08-15).
  Any-run banking made the album a record of who you drafted rather than what you won. The
  flag switches the rule *and* the copy that explains it. **Currently `false`** while it is
  being play-tested.
- **Sticker art pipeline (2026-08-14).** Originals live in `art/stickers-src/` (undeployed);
  `python scripts/build-sticker-art.py` emits 400px WebP to `public/stickers/`. The deploy
  went from 139 MB of images to 2.9 MB, and the album lazy-loads.
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

1. **Career depth E - Challenges / Mandates.** Still the highest-value gap: the career
   layer has nothing to *aim* at, so Prestige accumulates and buys perks and that is the
   whole loop. Renewable objectives checked from the finished `RunState` (win at Ascension
   III, win with an avg-rating < 80 XI, clean-sheet the knockouts), awarding Prestige +
   trophy-cabinet entries. Spec: `docs/career-depth-spec.md` "Future ideas / E" (data model
   + example challenges). Now pairs well with accounts, since challenges persist per
   account across devices.
2. **Sticker discount in the budget build.** Collected players cost x% less in the transfer
   market (`x` a config constant). One decision outstanding: Quick Run too, or Career Mode
   only? Notes in `docs/todo/TODO.html` item 03.
3. **More World Cups**, 1986 first as the template for going backwards. Research-heavy, no
   design questions left. `docs/todo/TODO.html` item 04.

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
  after rating tweaks. Regenerate on request (compute via `collectiblePlayers`). Note it
  only works for a *guest*: a signed-in album lives on the server.
- **Server-side chores (owner, at home).** The unused Supabase services (storage,
  functions, realtime, imgproxy) are still running and exposed; the security review's other
  items are closed. Studio being reachable from the internet is a **deliberate choice**, not
  an outstanding item. The container firewall rules are covered by a DSM boot task.

## Conventions reminder (for a new agent)

- `npm run build` before committing; `npm run checks` after touching `domain/`.
- Gate experimental features behind a `FEATURES` flag (`src/config.ts`).
- No em-dashes in generated text; "rating" not "elo", "boost" not "boon" in UI copy.
- Commit + push directly to `main`; end commit messages with the Co-Authored-By trailer.
