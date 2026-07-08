# Roadmap / Pipeline

Working handoff doc: where the project is and what to build next. Update this as
things ship (move items between sections, keep it honest). Detailed specs live in
`docs/career-depth-spec.md` and `docs/roguelike-career-design.md`.

Last updated: 2026-07-08.

## Done (recent, newest first)

- **Mode-first flow** - `/` is a launcher (Quick Run vs Career Mode); both build on the
  same 3-column page at `/quick-run` + `/career-mode`; one "Start Run" CTA. Resume of an
  ongoing World Cup / Cup Run from the launcher; live match reveal is persisted
  (`wcsim_run_reveal_v1`) so leaving mid-match resumes rather than replays; the
  knocked-out screen shows the final opponent. See CLAUDE.md "Play mode" + "Routing".
- **Career depth A** - boost-pool unlocks + rarity-weighted offers.
- **Career depth B** - tiered, level-gated perks (+ CareerState v1->v2 migration).
- **Career depth C** - Ascension tiers (handicap + steeper draw + reward multiplier,
  earned by winning + level-gated).

## Next up (in order)

1. **Home launcher enrichment (APPROVED - build first).** Replace the bare `/` launcher
   (`ModeSelect.tsx`) with the marketing-lean redesign: a tactics-board hero (deep-green
   band + chalk markings, big headline "Draft your dream XI. Win the World Cup.", the two
   CTAs + a one-line mode explainer + a resume pill), a 3-beat "how it works"
   (Draft -> Play -> Lift the cup), and a "chase the legends" showcase (the 5 real
   Monumental stickers). Approved mock (user, 2026-07-08):
   `docs/redesign-2026/turf-flat/home-launcher-mock.html`. Build it in Tailwind using the
   real theme tokens (the mock inlines system-font fallbacks; the app has Archivo /
   Schibsted / Spline). Wire the CTAs to the existing `onQuick`/`onCareer`/resume props;
   pull the top-5 collectibles from `collectiblePlayers` sorted by elo (don't hardcode).
2. **Career depth G - Transfer Budget progression.** A career-scaled budget-draft
   budget: ramps **$75 -> $130** via a new `transfer-budget` perk track (reuses the
   cluster-B tiered-perk machinery); applies to all budget builds while career mode is
   on, fixed `$110` when off. Full code-level plan in `docs/career-depth-spec.md` 6.5.
3. **Career depth E - Challenges / Mandates.** The high-value retention feature (the
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
