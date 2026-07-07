# Code review round 2: KISS, DRY, YAGNI, SoC (July 2026)

Second whole-codebase review against KISS, DRY, YAGNI, and Separation of Concerns.
The first review (`docs/code-review-2026-07.md`, 2026-07-01) was fully implemented;
this pass covers the code as it stands after the features that landed since
(Cup Run + career, budget draft, sticker album polish, the run ladder).

Baseline: commit `ceceac2` (2026-07-07). Method: four parallel reviewers (domain +
data, large screens, shared components + hooks, app shell + state + cross-cutting
sweep), every duplication/dead-code claim verified by grep across `src/` and
`scripts/` before inclusion; overlapping reports were deduped into the findings
below. Line numbers are anchors valid at the baseline commit; re-grep before
editing, they will drift as fixes land.

## How to work through this document (instructions for the implementing agent)

- Read `CLAUDE.md` first and follow its working agreements throughout: 2-space
  indent, match surrounding style, no reformatting as a side effect, keep
  `domain/` pure and React-free, no em-dashes anywhere (including UI copy and
  comments), display copy avoids jargon, no new dependencies (one exception is
  CR-D4 below, which only declares an already-used binary).
- Verify every change with `npm run build` (strict tsc + bundle) and
  `npm run checks` (domain characterization harness). Findings list extra manual
  checks where relevant.
- One finding (or one batch of tightly related S-effort findings) per commit.
  Commit and push directly to `main` with the standard trailer.
- Tick the checkbox when a finding lands; annotate instead of silently skipping
  (e.g. `[skipped: reason]`).
- Recommended execution order (minimizes rework):
  1. Priority 3 deletions first (quick wins, shrink the surface): CR-29 to CR-38.
  2. Priority 2 items that delete CupRunScreen-local copies before the big split:
     CR-05, CR-07, CR-08, CR-09, CR-10, CR-11, CR-12, CR-26.
  3. Remaining Priority 2 (domain constants and helpers).
  4. Priority 1 structural moves last, when the files they move are smallest:
     CR-04, CR-02, CR-03, CR-06, and finally CR-01.
- Decision items (CR-D1 to CR-D4) were resolved with the owner on 2026-07-07;
  see the section for outcomes. CR-D2 and CR-D3 close with no action; CR-D1 and
  CR-D4 carry one small remaining action each for the implementing agent.

## Summary

| ID | Title | Principle | Severity | Effort |
|----|-------|-----------|----------|--------|
| CR-01 | Split CupRunScreen.tsx | KISS | high | M |
| CR-02 | Budget auto-fill algorithm belongs in domain (done) | SoC | medium | M |
| CR-03 | Sticker-swap eligibility rule implemented 3x (done) | SoC | medium | S |
| CR-04 | Knockout-tie resolver implemented 2x (regression) | DRY | medium | M |
| CR-05 | KoDecided display mappings re-derived at 7 sites | DRY | medium | S |
| CR-06 | App.tsx sticker lifecycle extraction (done) | KISS | medium | M |
| CR-07 | PRIMARY_BTN defined 5x, one copy drifted | DRY | medium | S |
| CR-08 | RunBanner clones Banner | DRY | medium | M |
| CR-09 | Inline destructive-confirm pattern 3x | DRY | medium | S |
| CR-10 | Segmented control re-implemented in CupRunScreen | DRY | medium | S |
| CR-11 | Gold-foil / rarity colors hardcoded in 5 files | DRY | medium | S |
| CR-12 | Back-link atom re-typed 4x | DRY | low | S |
| CR-13 | NextGameButton + AUTO_PLAY_DELAY_MS duplicated | DRY | low | S |
| CR-14 | Finish/RunOutcome union + loss mapping duplicated | DRY | medium | S |
| CR-15 | Fisher-Yates shuffle written 4x | DRY | low | S |
| CR-16 | prefers-reduced-motion idiom written 8x | DRY | low | S |
| CR-17 | placedPlayers idiom written 5x | DRY | low | S |
| CR-18 | All-players flatten materialized 3x | DRY | low | S |
| CR-19 | Diacritic search normalizer duplicated | DRY | low | S |
| CR-20 | Rating-scale bounds declared 3x | DRY | low | S |
| CR-21 | Attacker/defender predicates duplicated | DRY | low | S |
| CR-22 | checks.ts re-implements private domain helpers | DRY | low | S |
| CR-23 | BRACKET_ROUNDS is a bare alias of KO_ROUNDS | DRY | low | S |
| CR-24 | BUDGET alias + stale priceOf comment | DRY | low | S |
| CR-25 | localStorage try/catch boilerplate 5x | DRY | low | S |
| CR-26 | pickBoost/pickGroupBoost near-duplicates | DRY | medium | S |
| CR-27 | CONFEDERATION table lives in chemistry.ts | SoC | low | S |
| CR-28 | Card scaffold class string repeats 29x (optional) | DRY | low | M |
| CR-29 | Overlay `bare` mode is dead | YAGNI | medium | S |
| CR-30 | Flag `round` prop is dead | YAGNI | low | S |
| CR-31 | `--color-win` token unused | YAGNI | low | S |
| CR-32 | ChemistryReport.fitCount unread | YAGNI | low | S |
| CR-33 | Unreachable away-normalisation branch in run.ts | YAGNI | low | S |
| CR-34 | Four dead `export` keywords | YAGNI | low | S |
| CR-35 | BudgetMarket re-resolves the target slot | YAGNI | low | S |
| CR-36 | Stale comments batch | YAGNI | low | S |
| CR-37 | AlbumScreen lightbox as 60-line JSX IIFE | KISS | low | S |
| CR-38 | Em-dash sweep (house rule violation) | rule | medium | S |
| CR-D1 | Confetti duration: resolved, keep 3s (fold the prop) | decision | resolved | S |
| CR-D2 | Hungarian assignment: resolved, keep as is | decision | resolved | - |
| CR-D3 | public/ assets: resolved, keep shipping as is | decision | resolved | - |
| CR-D4 | esbuild: resolved, add to devDependencies | decision | resolved | S |

---

## Priority 1: structural

### CR-01 [ ] Split CupRunScreen.tsx (KISS, high, M)

- Location: `src/components/CupRunScreen.tsx` (whole file, ~1090 lines)
- Problem: one file holds eight components (LiveCupMatch ~87-144, GroupResultCard
  ~147-172, FinishedKoCard ~177-241, RoundReview ~245-326, RunBanner ~331-367,
  BoostOffer ~379-425, plus the main screen). The main render nests a
  reviewRecord ternary wrapping a reveal ternary wrapping a group/ko ternary
  wrapping an IIFE, and the nesting has already broken the file's 2-space
  indentation discipline in two regions (~862-883, ~963-1081), direct evidence
  the structure is past maintainable.
- Fix: split into `src/components/cupRun/` (or sibling files): move the six
  helper components out; additionally extract `CareerHub` (career strip + perk
  shop, ~649-740), `RunXiPanel` (XI list + ratings strip + boost chips,
  ~783-856), and `RunEndPanel` (~1045-1077). The screen file keeps state,
  handlers, and a flat top-level layout. CupRunScreen is lazy-loaded, so the
  split does not affect the main bundle. Do this LAST, after the CupRunScreen
  DRY items below have deleted its local copies of shared atoms.
- Verify: build + checks, then a full manual Cup Run (group, boost, KO tie,
  review a past round via the ladder, end screen, replay).

### CR-02 [x] Budget auto-fill algorithm belongs in domain (SoC, medium, M)

- Location: `src/components/BudgetMarket.tsx:19-41, 102-148`
- Problem: the randomized auto-fill (shuffle, MIN_PRICE reserve accounting,
  top-K random pick, BY_POSITION index, bounded upgrade pass) is pure gameplay
  logic in a component, against the CLAUDE.md rule to keep gameplay logic in
  `domain/`. It is also unreachable by the checks harness, where budget
  invariants belong.
- Fix: extract to `src/domain/budget.ts` (or into pricing.ts):
  `autoFillBudget(slots, filled, remaining)` returning the new fill; component
  keeps only the onClick. Add invariants to `scripts/checks.ts`: never exceeds
  BUDGET_DRAFT, no personId twice, fills all slots when affordable.
- Verify: build + checks; click "Auto-fill & spend" several times, confirm
  varied full XIs within budget.

### CR-03 [x] Sticker-swap eligibility rule implemented 3x (SoC, medium, S)

- Location: `src/state/gameReducer.ts:208-217`, `src/App.tsx:549-563`,
  `src/components/Pitch.tsx:333-335, 412-420`
- Problem: the occupant rule (collectible + position fits + same person means
  different card, different person means personId not already used) is written
  three times; CLAUDE.md even documents the triple enforcement. Any tweak must
  land identically in three files or the pitch highlights and the reducer
  silently diverge.
- Fix: add `canSwapInto(incoming, occupant, slotPosition, usedPersonIds)` (exact
  signature at implementer's discretion) to `src/domain/album.ts` next to
  `isCollectible`; call it from all three sites. Keep swapsLeft/flag gating at
  the call sites.
- Verify: build + checks; manually draft, select a collectible, confirm the same
  slots light up, swap a different person, upgrade the same person in place,
  confirm a used person's own slot is the only one that lights.

### CR-04 [x] Knockout-tie resolver implemented 2x (DRY, medium, M)

- Location: `src/domain/bracket.ts:52-83` (`simGame`),
  `src/domain/run.ts` (`simulateKoTie`)
- Problem: the regulation, extra time, shootout resolver (same draw checks,
  event merging, shootout entry rule) exists once for Quick Play and once for
  the Cup Run, returning slightly different shapes. A rule change applied to one
  mode would silently diverge from the other. The `sideOf` projection is also
  duplicated (bracket.ts:48, and re-implemented in checks.ts). Note: this is a
  REGRESSION of the first review's D-2/WP4, which consolidated the resolver to
  exactly one copy; the Cup Run re-introduced the second one.
- Fix: extract one shared resolver, e.g. `resolveKoTie(home, away)` in
  `src/domain/knockout.ts` (which already owns KO_ROUNDS/KoDecided), returning
  `{homeGoals, awayGoals, decided, events, pens, homeWon}`; make
  `bracket.simGame` and `run.simulateKoTie` thin adapters or inline them.
- Verify: checks (shootout/bracket/run invariants) + build; one manual knockout
  tie in each mode.

### CR-05 [x] KoDecided display mappings re-derived at 7 sites (DRY, medium, S)

- Location: canonical `maxMinute` in `src/components/matchUi.tsx:49`; copies at
  `KnockoutScreen.tsx:111-119, 190-198, 220-239`; `CupRunScreen.tsx:106,
  111-112` (LiveCupMatch), `204-215` (FinishedKoCard), `370-374` (koWinHeading)
- Problem: end label ('FT' / 'a.e.t.' / 'pens'), settled status ('Full time' /
  'a.e.t.' / 'Penalties' + statusDim), result-tag label ('Won on penalties'
  etc.), and max minute are each hand-derived from KoDecided in multiple places;
  drift has already started (koWinHeading formats differ from KnockoutScreen's
  tag labels). CupRunScreen re-writes `decided === 'reg' ? 90 : 120` twice
  although `maxMinute` exists.
- Fix: add pure helpers to `src/components/matchView.ts` (the designated home
  for shared per-match derivation): `koEndLabel(decided)`,
  `koFinishedStatus(decided)` returning `{status, statusDim}`, and
  `koResultLabel(won, decided)`; use them in both screens; import `maxMinute` in
  CupRunScreen.
- Verify: build; play one knockout tie to penalties in the quick game and one in
  the Cup Run, compare labels.

### CR-06 [x] App.tsx sticker lifecycle extraction (KISS, medium, M)

- Location: `src/App.tsx` (~951 lines; sticker orchestration at 109-122,
  457-538, 917-948; also 506-520 two mirrored bank-on-loss effects, 921-937 two
  near-identical CupRewardPicker renders, 586-595 the cupRunXi IIFE)
- Problem: App owns the reducer + persistence, the roll animation, scroll
  effects, the entire sticker-album lifecycle (~170 lines touching only album/
  filled/bracket/group), and budget-build transient state. The standard-game and
  Cup Run sticker endings are two parallel flows with mirrored effects and
  mirrored picker renders. `cupRunXi` is an IIFE immediately aliased to
  `draftedXi`.
- Fix: extract a `useStickerAlbum(state, dispatch)` hook (src/hooks/) owning
  album state + handlers + a normalized pending-reward object
  (`{ids, wonCup, markReducer, onDone}`), and a small `RunEndOverlays`
  component for the three overlay renders. Replace cupRunXi/draftedXi with one
  `useMemo` using `placedPlayers` (CR-17). A `Masthead` extraction (623-669) is
  optional.
- Verify: build; manually finish one run as a loss (summary shows once, not
  again on reload) and one as a cup win (picker then summary), in both the
  standard game and the Cup Run. The once-per-run guards are the risk here.

### CR-07 [x] PRIMARY_BTN defined 5x, one copy drifted (DRY, medium, S)

- Location: canonical `src/components/matchUi.tsx:27-28`; duplicates
  `CompletePanel.tsx:20-21` (local `CTA`), `SetupPanel.tsx:108` and `:156`
  (inline), `CupRunScreen.tsx:66-67` (local const shadowing the shared name;
  drifted: rounded-md vs rounded-[5px], no border, tracking 0.02em vs 0.04em),
  plus two inline secondary variants at `CupRunScreen.tsx:1061, 1071` that
  SECONDARY_BTN (matchUi.tsx:32-33) covers.
- Problem: the same-name local copy means Cup Run primary CTAs silently render
  differently from the rest of the app. Root cause: PRIMARY_BTN bakes in sizing
  (px-5 py-3) unlike SECONDARY_BTN, so files needing other sizing copy the whole
  string.
- Fix: follow the SECONDARY_BTN model: split PRIMARY_BTN into an identity-only
  string (colors, border, font, hover, active) plus the existing PRIMARY_BTN as
  identity + default sizing. Replace CompletePanel's CTA, SetupPanel's two
  inline strings, and CupRunScreen's local constant with imports (the drift
  looks accidental; align it). Beware Tailwind class-order conflicts (px-4 next
  to px-5): compose, do not concatenate conflicting utilities.
- Verify: build; eyeball setup, complete panel, group/knockout CTAs, Cup Run
  buttons.

---

## Priority 2: consolidation

### CR-08 [x] RunBanner clones Banner (DRY, medium, M)

- Location: `src/components/matchUi.tsx:357-405` (Banner),
  `src/components/CupRunScreen.tsx:331-367` (RunBanner)
- Problem: RunBanner is a hand-scaled copy of Banner (tonal card, two corner-arc
  spans, mono eyebrow, display heading, optional body), differing only in scale
  and the absence of the reset button; its docstring admits it.
- Fix: add `size: 'lg' | 'sm'` and an optional action node to Banner, delete
  RunBanner; or at minimum move RunBanner into matchUi beside Banner.
- Verify: build; eyeball all banner states: quick-game champion / knocked out /
  group-eliminated, Cup Run group banner, KO win banner, ended win/loss.

### CR-09 [x] Inline destructive-confirm pattern 3x (DRY, medium, S)

- Location: `src/components/StartOverButton.tsx:11-38`,
  `CompletePanel.tsx:84-107`, `AlbumScreen.tsx:224-252`; the red confirm-button
  class string is byte-identical at StartOverButton.tsx:17, CompletePanel.tsx:89,
  AlbumScreen.tsx:234
- Fix: generalize StartOverButton into a `ConfirmAction` component
  (`{prompt, confirmLabel, onConfirm, trigger}`), or minimally hoist the red
  string as `DANGER_BTN` into matchUi. Prefer the component; StartOverButton
  becomes a thin wrapper or disappears.
- Verify: build; click all three confirms through both confirm and cancel paths.

### CR-10 [x] Segmented control re-implemented in CupRunScreen (DRY, medium, S)

- Location: `src/components/matchUi.tsx:120-158` (private SegControl, used by
  PlaybackControls with the same slow/normal/fast options at 189-193);
  `CupRunScreen.tsx:59-63` (SPEEDS) + `864-883` (hand-rolled control)
- Fix: export SegControl (or add a `SpeedControl` wrapper) from matchUi; delete
  CupRunScreen's SPEEDS array and bespoke markup. SquadBrowser's Display toggle
  (158-179) is a third, Link-based variant; adapt only if it stays clean.
- Verify: build; switch speed mid-reveal in the Cup Run.

### CR-11 [x] Gold-foil / rarity colors hardcoded in 5 files (DRY, medium, S)

- Location: canonical `src/components/StickerCard.tsx:9-22` (TIER_META); raw
  hexes at `AlbumScreen.tsx:131-133`, `RunLadder.tsx:25` and `:138`,
  `CollectibleStar.tsx:13`, `CupRunScreen.tsx:44-48` (RARITY_COLOR, which also
  re-types #e4922b / #15924c, i.e. --color-amber / --color-pitch from
  index.css); tier ordering encoded twice (TIER_META order vs
  `AlbumScreen.tsx:30` TIER_ORDER)
- Fix: export named constants next to TIER_META (GOLD_ACCENT, GOLD_FOIL,
  GOLD_INK, or reference TIER_META.monumental fields); build RARITY_COLOR from
  TIER_META accents / theme values; derive TIER_ORDER from TIER_META.
- Verify: build; glance at the album complete banner, a won ladder's cup node, a
  collectible star, and the boost cards.

### CR-12 [x] Back-link atom re-typed 4x (DRY, low, S)

- Location: canonical `src/components/matchUi.tsx:211-225` (StageCrumb);
  copies `AlbumScreen.tsx:61-71`, `CupRunScreen.tsx:640-646`,
  `CupRunScreen.tsx:246-254` (RoundReview backBtn, already drifted:
  tracking-[0.12em], no arrow slide). Related: `AlbumScreen.tsx:73-80` re-types
  StageHeader's eyebrow + h2 markup (matchUi.tsx:247-252).
- Fix: generalize StageCrumb (accept className and either onClick or a router
  `to`), use it in the three places; render AlbumScreen's title via StageHeader.
- Verify: build; check the three back affordances and the album header.

### CR-13 [x] NextGameButton + AUTO_PLAY_DELAY_MS duplicated (DRY, low, S)

- Location: `TournamentScreen.tsx:53-54, 147-155`;
  `KnockoutScreen.tsx:50-51, 140-148` (identical constant + byte-identical JSX)
- Fix: move `AUTO_PLAY_DELAY_MS` and a `NextGameButton({onClick})` into
  matchUi.tsx; import in both screens.
- Verify: build; click "Next game" on both screens; auto mode still paces.

### CR-14 [x] Finish/RunOutcome union + loss mapping duplicated (DRY, medium, S)

- Location: `src/domain/odds.ts:16` (`Finish`) vs `src/domain/run.ts:35`
  (`RunOutcome`), identical six-member unions; `odds.ts:33` (`LOST_IN`) vs
  `run.ts` (`KO_OUTCOME`), identical arrays
- Fix: define the union and the loss mapping once in `src/domain/knockout.ts`
  (next to KO_ROUNDS, avoids an odds/run import cycle); import or re-export in
  run.ts and odds.ts; delete the duplicates. career.ts and checks.ts key off
  RunOutcome, so keep the name available.
- Verify: build + checks.

### CR-15 [x] Fisher-Yates shuffle written 4x (DRY, low, S)

- Location: `src/domain/tournament.ts:98-103` (pickOpponents),
  `src/domain/album.ts:94-99` (tradeOptions), `src/domain/boons.ts:182-187`
  (offerBoons), `src/components/BudgetMarket.tsx:20-27`
- Fix: one `shuffled<T>(arr: readonly T[]): T[]` in a tiny `src/domain/random.ts`
  (all four copy before shuffling; keep that). Components may import domain, so
  BudgetMarket uses it too. Optionally `sample(arr, n)` since three are
  shuffle-then-slice.
- Verify: build + checks (offers distinct, opponents distinct, trade options
  uncollected).

### CR-16 [x] prefers-reduced-motion idiom written 8x (DRY, low, S)

- Location: `useFollowBottom.ts:74` (holds the MediaQueryList; leave it),
  `Confetti.tsx:44, 123`, `KnockoutScreen.tsx:94`, `GroupDrawReveal.tsx:32`,
  `CupRunScreen.tsx:527`, `RunLadder.tsx:103`, `TournamentScreen.tsx:100`
- Fix: `prefersReducedMotion(): boolean` helper (e.g. `src/hooks/motion.ts`);
  replace the seven `.matches` sites. The related scroll-into-view wrapper
  (matchMedia + behavior auto/smooth, mostly in requestAnimationFrame) repeats
  at TournamentScreen.tsx:95-105, KnockoutScreen.tsx:89-98,
  CupRunScreen.tsx:522-529, RunLadder.tsx:96-105 and can share a
  `scrollIntoViewRespectingMotion(el, block)` helper in the same file.
- Verify: build; confirm end-of-run auto-scrolls still land on each screen.

### CR-17 [x] placedPlayers idiom written 5x (DRY, low, S)

- Location: `src/domain/draft.ts:43` (inside teamRating), `src/App.tsx:426`,
  `src/App.tsx:590-592`, `src/components/BoxScore.tsx:84`,
  `src/components/BudgetMarket.tsx:77`
- Fix: export `placedPlayers(formation, filled): Player[]` from draft.ts, use it
  in teamRating and the four call sites (slot order preserved).
- Verify: build + checks.

### CR-18 [x] All-players flatten materialized 3x (DRY, low, S)

- Location: `src/components/BudgetMarket.tsx:15`, `src/App.tsx:112`,
  `src/domain/boons.ts:25` (each `SQUADS.flatMap(s => s.players)`, ~3,878 rows)
- Fix: export `ALL_PLAYERS` from `src/data/squads.ts` next to SQUAD_BY_ID;
  import in all three (App drops its useMemo).
- Verify: build + checks.

### CR-19 [x] Diacritic search normalizer duplicated (DRY, low, S)

- Location: `src/components/SquadBrowser.tsx:18`,
  `src/components/BudgetMarket.tsx:16` (identical `norm`); `squads.ts:36` uses
  the same NFD trick inside slug
- Fix: export `normalizeSearch` from `src/data/format.ts`; import in both
  components (slug can stay as is).
- Verify: build; search "Muller" in the squad browser and the market.

### CR-20 [x] Rating-scale bounds declared 3x (DRY, low, S)

- Location: `src/domain/boons.ts:35-36`, `src/domain/validateSquads.ts:12-13`,
  `src/domain/run.ts` (hardcoded `Math.min(99, ...)` in the deep-squad perk)
- Fix: export `ELO_MIN` / `ELO_MAX` from `src/data/types.ts` (where the scale is
  documented on Player.elo); use in all three.
- Verify: build + checks (rating-range check).

### CR-21 [x] Attacker/defender predicates duplicated (DRY, low, S)

- Location: `src/domain/match.ts:34-35` (inline in xiStrength),
  `src/domain/boons.ts:41-42` (isAttack/isDef, which bypass boons' own catOf)
- Fix: export `isAttacker(p)` / `isDefender(p)` from `src/data/types.ts` next to
  ATTACK_CATS/DEF_CATS; use in match.ts and boons.ts.
- Verify: build + checks (xiStrength invariants, Glass Cannon boon).

### CR-22 [x] checks.ts re-implements private domain helpers (DRY, low, S)

- Location: `scripts/checks.ts:57-59` copies `bestEleven`
  (tournament.ts:72-75) and `sideOf` (bracket.ts:48) character-for-character
- Problem: if the domain definition of "best eleven" changed, the harness would
  keep testing the old one.
- Fix: export `bestEleven` from tournament.ts and import it in checks.ts. The
  sideOf copy disappears with CR-04; otherwise export it from match.ts.
- Verify: checks + build.

### CR-23 [x] BRACKET_ROUNDS is a bare alias of KO_ROUNDS (DRY, low, S)

- Location: `src/domain/bracket.ts:14` (`export const BRACKET_ROUNDS =
  KO_ROUNDS;`); consumers split between the two names (App, Bracket,
  KnockoutScreen, TournamentSummary, checks.ts vs CupRunScreen, run.ts)
- Fix: delete the alias; import KO_ROUNDS from knockout.ts everywhere.
- Verify: build.

### CR-24 [x] BUDGET alias + stale priceOf comment (DRY, low, S)

- Location: `src/domain/pricing.ts:11` (`export const BUDGET = BUDGET_DRAFT;`),
  `:17-22` (comment narrates a 100 budget; actual is 110, config.ts has the
  correct mapping)
- Fix: drop the alias (import BUDGET_DRAFT directly in BudgetMarket and
  checks.ts); reword the comment to point at config.ts instead of restating a
  number.
- Verify: build.

### CR-25 [ ] localStorage try/catch boilerplate 5x (DRY, low, S)

- Location: `src/state/persist.ts:14-37`, `albumStorage.ts:24-84`,
  `careerStorage.ts:7-30`, `runStorage.ts:11-40`
- Judgment: a generic storage abstraction would be over-abstraction (validation
  and fallback semantics genuinely differ per module); only the mechanical
  try/localStorage/JSON shells are boilerplate.
- Fix: minimal `src/state/storage.ts` with `readJson(key): unknown | null` and
  `writeJson(key, value): void`, both fully swallowing errors; each module keeps
  its own key, validation, and default. Do not abstract further. Opportunistic:
  do this only when next touching these files.
- Verify: build; corrupt a key in devtools and confirm graceful fallback.

### CR-26 [x] pickBoost/pickGroupBoost near-duplicates (DRY, medium, S)

- Location: `src/components/CupRunScreen.tsx:593-602, 606-615`; the roster
  in/out diff they recompute also exists in `src/domain/run.ts` (chooseBoon's
  boostedIds diff, beginRun's scout-perk diff)
- Fix: have chooseBoon return the swap alongside the state (e.g.
  `{next, swappedIn?, swappedOut?}` or a transient lastSwap field), then
  collapse the two handlers into one that formats the toast from the
  domain-provided swap. chooseBoon's signature is exercised by checks.ts; keep a
  compatible shape or update the harness.
- Verify: build + checks; pick a roster boost (toast names both players) and a
  rating boost (toast shows the description).

### CR-27 [x] CONFEDERATION table lives in chemistry.ts (SoC, low, S)

- Location: `src/domain/chemistry.ts:21-45`, imported by
  `src/domain/validateSquads.ts:2,33`
- Problem: nation-to-confederation is dataset reference data, not chemistry
  logic; the dataset integrity checker depends on the chemistry module for it.
- Fix: move CONFEDERATION (and its type) to `src/data/` (e.g.
  `data/confederations.ts`); import from chemistry.ts and validateSquads.ts.
- Verify: build + checks (clean-dataset check).

### CR-28 [ ] Card scaffold class string repeats 29x (DRY, low, M, optional)

- Location: `rounded-md border border-line bg-panel ... shadow-hard` across 17
  files (App, AlbumScreen, BudgetMarket, BoxScore, CompletePanel, CupRunScreen
  x7, MatchdayCard, GroupDrawReveal, SetupPanel, RunLadder, SquadBrowser x5,
  SquadPanel x2, TeamRoster, StandingsTable, TournamentScreen, XiTable,
  TournamentSummary)
- Judgment: low value-to-churn ratio; the recipe is a locked token combination.
  Take it only as `export const CARD = 'rounded-md border border-line bg-panel
  shadow-hard'` in matchUi with per-site padding appended; do NOT build a Card
  component (wrappers vary between div/section/button/Link). Fine to skip.
- Verify: build + visual sweep of each screen.

---

## Priority 3: dead code, stale docs, small KISS

### CR-29 [ ] Overlay `bare` mode is dead (YAGNI, medium, S)

- Location: `src/components/Overlay.tsx:3-8, 13, 18, 47-56, 61-65, 67-76`
- Problem: no caller passes `bare` (grep-verified); the doc claims the sticker
  lightbox uses it, but AlbumScreen renders the lightbox with the normal panel.
  Leftover from a reworked lightbox.
- Fix: delete the prop, the floating-X branch, and the className ternary; update
  the doc comment.
- Verify: build; open trade, cup-reward, run-end, and lightbox overlays.

### CR-30 [ ] Flag `round` prop is dead (YAGNI, low, S)

- Location: `src/components/Flag.tsx:76-81, 84, 89, 99-106`
- Problem: no call site passes `round` (grep-verified); the circular-crop branch
  and rounded-full badge variant are unreachable.
- Fix: delete the prop and both branches.
- Verify: build.

### CR-31 [ ] `--color-win` token unused (YAGNI, low, S)

- Location: `src/index.css:20`
- Problem: no `bg-win`/`text-win`/`border-win`/`var(--color-win)` usage
  anywhere; duplicates --color-pitch's value.
- Fix: delete the token.
- Verify: build.

### CR-32 [ ] ChemistryReport.fitCount unread (YAGNI, low, S)

- Location: `src/domain/chemistry.ts:113-115 (field), 138, 193 (population)`
- Problem: no consumer reads the field (grep-verified); the UI value travels in
  the "In position" category detail string.
- Fix: remove the field from the interface and both return objects (keep the
  local variable feeding the category).
- Verify: build + checks.

### CR-33 [ ] Unreachable away-normalisation branch in run.ts (YAGNI, low, S)

- Location: `src/domain/run.ts` prepareGroupStage (the user-away flip branch);
  `src/domain/tournament.ts:111-118` (createGroup hardcodes the user as home)
- Problem: createGroup schedules the user home in all three fixtures, so the
  flip branch (goal swap + event-side mirroring) can never run and is
  untestable; the comment admits the invariant.
- Fix: delete the branch and read the user-home fixtures directly; optionally a
  dev-time throw `if (fx.homeId !== USER_ID)` to keep the safety intent in one
  line, and document the invariant on createGroup.
- Verify: checks + one manual Cup Run group stage.

### CR-34 [ ] Four dead `export` keywords (YAGNI, low, S)

- Location: `src/state/albumStorage.ts:6-7` (ALBUM_KEY, STATS_KEY),
  `src/state/gameReducer.ts:16, 19` (INITIAL_REROLLS, INITIAL_SWAPS)
- Problem: exported but imported nowhere (grep-verified); the other storage
  modules keep keys module-private.
- Fix: drop the `export` keywords, keep the constants.
- Verify: build (tsc errors if anything did import them).

### CR-35 [ ] BudgetMarket re-resolves the target slot (YAGNI, low, S)

- Location: `src/components/BudgetMarket.tsx:82-84` vs `src/App.tsx:572-579`
  (App already resolves the effective target incl. first-empty fallback);
  held-player lookup runs 3x (App:382, App:578-579, BudgetMarket:84)
- Fix: pass the resolved slot (or delete BudgetMarket's fallback chain and keep
  a null guard); pass the held Player object instead of the id.
- Verify: build; full budget draft incl. Clear and Auto-fill; "XI complete."
  state still renders when done.

### CR-36 [ ] Stale comments batch (YAGNI, low, S)

- Locations and fixes (comments only unless noted):
  - `src/components/SetupPanel.tsx:23`: "False while the CSV is still loading";
    there is no CSV. Reword (App passes `!!previewFormation`).
  - `src/components/matchUi.tsx:303-304`: FixtureHead doc says ratings are
    "shown as a hover title"; hover titles were replaced by RatingChip. Reword.
    Optional code change: rename FixtureHead's `userElo`/`oppElo` props to
    `userRating`/`oppRating` (one caller: MatchdayCard.tsx:80-81).
  - `src/components/CupRunScreen.tsx:858`: "Run panel + log"; the log is gone.
  - `src/state/runStorage.ts:8-10`: "(players, ids, log)"; RunState has no log
    field. Reword to "(players, ids, history)".
- Verify: build (only needed for the prop rename).

### CR-37 [ ] AlbumScreen lightbox as 60-line JSX IIFE (KISS, low, S)

- Location: `src/components/AlbumScreen.tsx:268-328`
- Problem: the expanded-sticker lightbox is an IIFE embedded in the return,
  computing locals inline; it needs only `expanded`, `album.duplicates`, and the
  close setter.
- Fix: extract `StickerLightbox({player, tier, duplicateCount, onClose})` (in
  this file or beside StickerCard).
- Verify: build; click a collected sticker to enlarge, close it.

### CR-38 [ ] Em-dash sweep (house rule, medium, S)

- Problem: the project rule forbids the em-dash character everywhere, including
  UI copy and comments, yet occurrences exist:
  - User-visible copy: `src/components/CupRunScreen.tsx:985` (literal, in the
    boost banner body), `TradeModal.tsx:31` and `CupRewardPicker.tsx:51`
    (as HTML entities).
  - Comments/CSS: `Bracket.tsx:9, 152-153`, `domain/chemistry.ts:49, 146, 169,
    177, 184`, `domain/validateSquads.ts:23`, `domain/bracket.ts:98, 179-180`,
    `domain/clock.ts:17`, `components/Flag.tsx:97`, `components/Tooltip.tsx:51`,
    `components/FixtureRow.tsx:22`, `index.css:447, 475`, and any others a
    whole-tree grep for the character turns up.
  - `TournamentSummary.tsx:174, 182` use the character as an empty-cell
    placeholder glyph; replace with a plain hyphen to match the rule (the rest
    of the app uses "-" for empty values, e.g. the career hub's Best stat).
- Fix: sweep and replace with hyphens, commas, or sentence breaks per the rule.
- Verify: build; grep for the character returns zero hits in src/.

---

## Decision items (RESOLVED 2026-07-07)

All four were put to the owner and decided. CR-D2 and CR-D3 are closed with no
action; CR-D1 and CR-D4 each leave one small task for the implementing agent.

### CR-D1 [ ] Confetti duration. Resolved: keep 3s

`src/components/Confetti.tsx:119` defaults `durationMs` to 3000 and neither
caller passes it; CLAUDE.md documented the rain as 9s. Decision: 3 seconds is
the intended feel. CLAUDE.md's claim was corrected to 3s alongside this
resolution. Remaining action (S): fold the never-passed `durationMs` prop into
a module constant (e.g. `const RAIN_MS = 3000`) and drop it from the signature.
Verify: build; win a cup, confetti rains ~3s.

### CR-D2 [x] Hungarian assignment for badge slides. Resolved: keep as is

`src/components/Pitch.tsx:14-75` (the O(n^3) min-cost assignment for the
formation-change badge animation) stays deliberately: it is correct, isolated,
and working, and replacing it risks visual regressions for no functional gain.
No action; do not re-litigate in future reviews.

### CR-D3 [x] public/ ships unreferenced dev/source assets. Resolved: keep as is

`public/formations/`, `public/formations.csv`, `public/img/image.png`, and
`public/jerseys/` ship in every build without being referenced by src/. The
owner accepts the deploy weight; the assets stay where they are. No action; do
not re-litigate in future reviews.

### CR-D4 [ ] esbuild is only a transitive dependency. Resolved: declare it

`npm run checks` invokes the `esbuild` binary directly, but esbuild is only
present as vite's transitive dependency. Remaining action (S): add esbuild to
devDependencies, pinned to the major vite currently ships (0.25.x), so the
checks script survives a vite internals change. Verify: `npm install` clean,
`npm run checks` passes.

---

## Reviewed and found fine (do not re-litigate)

- domain/ purity holds everywhere; no React imports, simulation vs playback
  separation intact (prepare*/play* split, clock-reveals-precomputed-result).
- All 20 reducer action types are dispatched somewhere; every FEATURES flag is
  read; each localStorage key is defined exactly once in its own module; the
  four-way storage separation is doing its documented job.
- No leftovers found from the removed 3D pitch, canvas-confetti, the up-front
  mode toggle, or the /build route (beyond the stale comments in CR-36).
- formations.ts layout engine, match.ts Poisson/shootout math (documented
  safety nets backed by checks invariants), tournament.ts standings,
  bracket.ts seeding/lazy rounds, clock.ts, album.ts, career.ts, draft.ts,
  odds.ts, data/types.ts, data/format.ts, squads.ts helpers: clean.
- useFollowBottom and useMatchClock are intentionally complex, well documented,
  and their complexity is justified by recorded regressions; bkt- CSS properly
  scoped; persist.ts deliberately keeps the drawn squad (anti-reroll-cheat).
- vite.config.ts, tsconfig, main.tsx: no dead config. checks.ts's STAGE_SCORE
  duplication is deliberate characterization.
