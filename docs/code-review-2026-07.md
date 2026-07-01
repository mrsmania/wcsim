# Code review: core principles (July 2026)

A principles-focused review of the `src/` tree against DRY, KISS, SoC, YAGNI, clean
code, and the Law of Demeter, followed by an action plan for an implementation team.

## Implementation status (updated 2026-07-01)

Implemented by a team of specialist agents in three waves, one commit per work
package. Both decision gates were applied: **G1 -> attack-vs-defense** and
**G2 -> `removePlayers` default off**. Each committed WP built green
(`tsc --noEmit` + `vite build`); the combined build is green.

**Done and committed** (all 6 WPs):

- [x] **WP1** - Dead code purge (F-1). `SpeedControl.tsx`, `positionStyle.ts`
      deleted; `FaceAvatar` removed. Commit `072c014`.
- [x] **WP2** - Data/types foundation + dataset validator (Q-1, Q-3, Q-5 typing,
      Q-9, D-10/Q-6 helpers). New `domain/validateSquads.ts`; `SQUAD_BY_ID` typed
      `| undefined`; `primaryPosition`/`ATTACK_CATS`/`DEF_CATS` added. Commit `3540278`.
- [x] **WP4** - Domain dedup and purity (D-1, D-2, D-4, D-5, D-6, D-7, D-8/G1, D-9,
      D-10, D-12, Q-5 guards, Q-6 match, Q-10). Attack-vs-defense verified via a
      throwaway sim harness (mean ~1.3 goals/side; brackets always complete; user
      meets the co-qualifier only in the final). Commit `fe3c9de`.
- [x] **WP3** - Frontend shared primitives (F-2, F-3, F-7, F-8 partial, F-9, Q-6
      BoxScore). `FixtureRow` pruned; `SECONDARY_BTN`/`EYEBROW`/`TABLE_HEAD`/
      `MONO_CAP` added and reused. Commit `53f6318`.
- [x] **WP6** - App orchestration and reducer symmetry (A-1, A-2, A-4, A-5, A-7,
      A-8, D-3, D-11, Q-7, Q-8, A-6/G2). Placement now reducer-owned; draw-next is a
      single committed-state effect; seeding/qualify rules moved into the domain;
      the dev-time validator is wired behind `import.meta.env.DEV`. Commit `bbaf7fe`.
- [x] **WP5** - Screen decomposition and dedup (F-4, F-5, F-6, F-10, F-11, F-12,
      A-3, Q-2). `TournamentScreen` dropped 551 -> ~180 lines; extracted
      `GroupDrawReveal` / `StandingsTable` / `MatchdayCard`, the shared
      `useMatchClock` hook, and the pure `liveMatchView`; wired `simulateMatchday`
      and the flat bracket accessors; renamed FixtureRow's `homeElo`/`awayElo` ->
      `homeRating`/`awayRating`. The agent's watchdog killed it during a trivial
      final cleanup, but it left a coherent, green state that was reviewed
      diff-by-diff and committed. Commit `e2e75b2`. **Runtime playthrough still
      recommended** (see below) - it was not run because port 5173 was held by a
      live dev server.

**Open / not done:**

- [ ] **WP0** (optional characterization harness) - not committed as a separate
      package. Its intent was folded into WP4's throwaway self-tests (shootout,
      bracket, G1 invariants), which passed. A committed harness would be redundant
      given there is no test runner; safe to skip.
- [ ] **Q-4** (move `lastName`/`formatPositions` to `format.ts`) - intentionally
      skipped (optional; would touch several component files for little gain).

**Scope adjustments from the plan** (forced by real module boundaries, so the
build stays acyclic):

- **D-11** (`teamById`) and **`simulateMatchday`** live in `tournament.ts`, which
  `match.ts` must not import (cycle), so both were implemented by **WP6**, not WP4.
- **Q-2**: there is no `EloPill`/`RatingPill` component in the repo, so that half was
  a no-op; the `homeElo`/`awayElo` -> `homeRating`/`awayRating` prop rename was done
  in **WP5** (which owns `FixtureRow`'s only caller, now `StandingsTable`).
- **F-8**: the shared caption constants shipped in WP3; the standings table was
  extracted into `StandingsTable` in **WP5**.

**Housekeeping / notes for the next session:**

- **Not pushed yet.** Local `main` is 7 commits ahead of `origin/main` (the 6 WP
  commits above plus `56592c8`). Push was deliberately deferred pending the runtime
  playthrough.
- **Concurrent commit:** `56592c8` "Fix confetti rain confined to a 300x150 box"
  (Confetti.tsx) was authored by Mario Smania from another session mid-run. It does
  not overlap any WP and was left untouched.
- **Stashed overreach:** `git stash@{0}` holds an out-of-scope change a Wave-1 agent
  slipped in - a new `FEATURES.randomTeam` flag gating the "Random team" button
  (`SetupPanel.tsx` + `config.ts`). It matches no finding. `git stash pop` to keep
  it, `git stash drop` to discard.
- **Verification still owed:** a full manual UI playthrough (draft -> group ->
  knockout -> champion/confetti) has not been run yet; it is the acceptance gate for
  WP5 and a good final check for the G1 difficulty change.

## Method

Four specialist reviewers audited disjoint slices of the codebase in parallel, each
scoring all six principles within its scope (review only, no edits):

- **Architect** - layering, the reducer phase machine, `App.tsx` orchestration, module
  boundaries and dependency direction.
- **Frontend engineer** - everything under `src/components/`.
- **Domain engineer** - the pure logic in `src/domain/`.
- **Data / quality engineer** - `src/data/` (types + dataset) and cross-cutting
  concerns (naming, type safety, dead exports, data integrity).

Findings are numbered `A-*` (architect), `F-*` (frontend), `D-*` (domain), `Q-*`
(data). Severity is the reviewer's honest calibration for a small, single-developer,
client-side game with no test runner.

## Executive summary

The codebase is in good health for a hobby project. The four-layer split
(`data` -> `domain` -> `state` -> `components`) is clean, dependency direction is
correct (domain never imports React or state), the single `useReducer` phase machine
is the right amount of state management, and the "simulate up front, reveal via the
clock" pattern is a genuinely strong design. `matchUi.tsx`, the `squad()` builder, and
most small components are exemplary.

Five themes account for nearly all the high and medium findings:

1. **Duplication in the knockout/tournament path.** The regulation -> extra-time ->
   shootout resolver exists three times (`D-2`), the per-match display view-model is
   derived inline and near-identically in both screens (`F-4`), and the match-clock
   timer effect is copied between them (`F-6`).
2. **`TournamentScreen.tsx` does too much** (551 lines, ~7 responsibilities) and should
   be decomposed (`F-5`).
3. **Dead / speculative code.** A whole superseded knockout engine (`D-1`), three
   unused files/exports (`F-1`), a large unused prop surface on `FixtureRow` (`F-2`,
   `F-3`), and an ambiguous "testing aid" flag shipped on (`A-6`).
4. **Orchestration leaking across the App / reducer / component seam.** Placement rules
   are duplicated between `App` and the reducer (`A-1`), `App` re-derives reducer
   transitions to sequence the next roll (`A-2`), and simulation is triggered from
   inside the screen components (`A-3`).
5. **The crown-jewel dataset has no integrity guard.** The `personId` "one human, one
   draft" invariant, unique ids, and non-empty `positions` are all trust-based; a silent
   typo would corrupt gameplay with no diagnostic (`Q-1`).

None of this is a live correctness bug in the shipped path. The work below is
maintainability, deduplication, and one high-value safety net.

## Findings by theme

Full detail lives in the reviewer notes; this is the consolidated, de-duplicated view.
Each finding maps to a work package (WP) in the action plan.

### Theme 1 - Knockout/tournament duplication (WP4, WP5)

- **D-2 (High, DRY)** - `simGame` (`bracket.ts:52-83`) is a near-verbatim copy of
  `playKnockout` (`knockout.ts:77-103`); the reg -> ET -> shootout algorithm and the
  `sideOf` helper appear in both. Keep one general resolver.
- **F-4 (High, DRY/SoC/KISS)** - the live match view-model (`score`/`status`/
  `feedEvents`/`tag`) is built inline mid-`.map()` in `TournamentScreen.tsx:429-470`
  and again in `KnockoutScreen.tsx:221-272`. Extract a pure `liveMatchView(...)`.
- **F-6 (Medium, DRY/SoC)** - the clock timer effect is duplicated
  (`TournamentScreen.tsx:143-183` vs `KnockoutScreen.tsx:77-159`). Extract a
  `useMatchClock` hook.
- **D-6 (Medium, DRY)** - `addGoals` and the event-sort comparator are duplicated
  between `simulateMatch` and `simulateExtraTime` (`match.ts:85-95` vs `102-118`).
- **D-3 (Medium, DRY/KISS)** - `standings()` is recomputed on every call including
  inside `userAdvanced`, and the "top 2 advance" rule (`< 2` / `.slice(0,2)`) is
  repeated across `tournament.ts:172`, `App.tsx:244`, and `TournamentScreen`. Introduce
  `QUALIFY_COUNT` and a `qualifiers(group)` helper.

### Theme 2 - Oversized component (WP5)

- **F-5 (High, SoC/KISS/Clean)** - `TournamentScreen.tsx` owns the group-draw scramble
  and its full-takeover render, the standings table, the collapsible results table, the
  clock effect, auto-play scheduling, an eliminate-scroll effect, and the matchday feed.
  Split into `GroupDrawReveal`, `StandingsTable`, and a shared `MatchdayCard`.
- **F-10 (Medium, KISS/SoC/Clean)** - the single `tailRef` is conditionally rendered in
  3-4 JSX spots per screen behind ad-hoc booleans; render it once, unconditionally, as
  the last child of the scroll root.
- **F-11 (Low, Clean)** - animation timings (`90`, `1300`, `700`) are bare literals in
  render; name them (`SCRAMBLE_STEP_MS`, `SCRAMBLE_DURATION_MS`, `AUTO_PLAY_DELAY_MS`).
- **F-12 (Low, Demeter/Clean)** - knockout/bracket JSX reaches several levels into the
  bracket shape with non-null assertions (`Bracket.tsx:105-112`,
  `KnockoutScreen.tsx:214-218`); add flat accessors in `domain/bracket`.

### Theme 3 - Dead / speculative code (WP1, WP3, WP4, WP6)

- **D-1 (High, YAGNI/DRY/SoC)** - `knockout.ts` is largely superseded by `bracket.ts`.
  `createKnockout`, `playKnockout`, `KoResult`, `KnockoutState`, `KoTie` are dead; only
  `drawOpponent`, `KO_ROUNDS`, `KoDecided` are still consumed.
- **F-1 (Medium, YAGNI/Clean)** - `SpeedControl.tsx`, `FaceAvatar` (in
  `PlayerBadge.tsx:23`), and `positionStyle.ts` have zero importers and use the old
  stone-* palette. Delete.
- **F-2 (Medium, YAGNI/Clean)** - `FixtureRow` is used once with three props; the other
  ~half of the file (`EloPill`, `expandable`/`expanded`/`onToggle`, `scrambleCode`,
  `awayUnknown`, `homeElo`/`awayElo`) is dead. Prune.
- **F-3 (Low, YAGNI)** - `FixtureHead.scrambleCode` (`matchUi.tsx:230`) is never passed
  by either caller; remove the prop and its branch.
- **A-6 (Low, YAGNI/Clean)** - `FEATURES.removePlayers` is documented as a "testing aid"
  but ships `true`, carrying a live App handler and reducer case. See Decision Gate G2.
- **Q-9 (Low, YAGNI/Clean)** - `CATEGORY_OF` is exported but only ever read through
  `categoryOf()`; drop the export.

### Theme 4 - Orchestration seam (WP6)

- **A-1 (Medium, DRY/SoC)** - placement validation (`canPlace` + slot/player lookup) is
  run in both `App.handlePlace` (`App.tsx:171-193`) and the `PLACE_PLAYER` reducer case
  (`gameReducer.ts:112-129`). Let the reducer own it.
- **A-2 (Medium, SoC/Demeter/KISS)** - `App` rebuilds the post-transition world by hand
  (`nextFilled`, `used`, the "complete?" check) to fire the next roll (`App.tsx:185-190`,
  `199-208`). Drive "draw the next squad" from an effect that reads committed state.
- **A-4 (Low, Demeter/SoC)** - `handleEnterKnockout` hand-walks `Standing`/`GroupTeam`
  shape with two non-null assertions (`App.tsx:239-253`). Move seeding into
  `domain/tournament.ts` (`bracketSeedFromGroup(group)`).
- **A-7 (Low, Demeter/Clean)** - `RECORD_MATCHDAY` inlines fixture-merging in the reducer
  (`gameReducer.ts:150-159`) while `RECORD_BRACKET_ROUND` cleanly delegates to the domain.
  Add `recordMatchday(group, results)` for symmetry.
- **A-5 (Low, KISS/SoC)** - `runRoll` fires `CONSUME_REROLL` + `ROLL_START` and keeps an
  `animatingRef` mirroring `state.rolling` (`App.tsx:121-147`). Consider one
  `ROLL_START` action carrying an `isReroll` flag.
- **A-8 (Low, Clean/Demeter)** - the masthead stamp, eyebrow, and title are three
  parallel ternary ladders in render; `koStamp` reads `BRACKET_ROUNDS[bracket?.current ??
  0]` unconditionally (`App.tsx:275-292`). Fold into one small pure helper and guard it
  behind the knockout phase.
- **A-3 (Medium, SoC)** - simulation is triggered inside components
  (`TournamentScreen.tsx:124-141`, `KnockoutScreen.tsx:98,165`). Add a thin domain entry
  (`simulateMatchday(group, md)`) so components only animate results. (Implemented in WP5
  against a domain function delivered by WP4.)

### Theme 5 - Data integrity and type honesty (WP2, WP4)

- **Q-1 (High, data integrity)** - no validation of the dataset. `SQUAD_BY_ID` via
  `Object.fromEntries` silently drops a squad on a duplicate id; a misspelled name splits
  one person into two identities (draftable twice); a name collision merges two people.
  Add a dev-time `validateSquads` guard.
- **Q-5 (Medium, Clean/Demeter)** - `SQUAD_BY_ID` and `CONFEDERATION` are typed
  `Record<string, T>` (total) but are not; `chemistry.ts:112` dereferences a possibly
  `undefined` squad with false type assurance. Type as `| undefined` (or `Map`) and guard.
- **Q-2 (Medium, Clean/DRY)** - "elo" vocabulary leaks into a user-facing component and
  props (`FixtureRow.tsx` `EloPill`, `homeElo`/`awayElo`) despite the elo -> rating UI
  rename. Rename to `RatingPill` / `homeRating` / `awayRating` (internal `Player.elo` may
  stay).
- **Q-3 (Medium, Clean)** - `Player.elo` and `Squad.rating` doc comments say "~70-95.
  Placeholder data" (`types.ts:53,66`), contradicting the real 60-99 researched scale.
- **Q-6 (Low, DRY/Clean)** - the attack = MID/FWD, defense = GK/DEF grouping is an inline
  `string[]` literal in `match.ts:34-35` and `BoxScore.tsx:87`. Add typed
  `ATTACK_CATS`/`DEF_CATS` (or a predicate).
- **D-10 (Low, Demeter/Clean)** - `positions[0]` (the "primary role") is accessed raw in
  `match.ts`, `chemistry.ts`, etc. Add a `primaryPosition(player)` helper beside
  `primaryCategory`.
- **D-11 (Low, Clean)** - `teamById` uses `find(...)!` (`tournament.ts:111`) that throws
  opaquely on a bad id; throw an explicit error or return `undefined`.
- **Q-4 (Low, SoC)** - `types.ts` mixes type declarations with display formatters
  (`lastName` + `NAME_PARTICLES`, `formatPositions`). Optionally move formatters out.
- **Q-8 (Low, Clean/Demeter)** - a cluster of non-null assertions across `App`/components
  (esp. `App.tsx:242` `table.find(...)!.team`); make the riskiest one fail loudly.
- **Q-7 (Low, Clean)** - `lastName` never consumes index 0 and treats punctuation
  differently on the two code paths; document the guarantee and spot-check it.

### Theme 6 - Domain purity and magic numbers (WP4)

- **D-4 (Medium, SoC/Clean)** - `computeChemistry` is documented "Pure." but keeps a
  module-level `warnedMissing` flag and calls `console.warn` (`chemistry.ts:103,145-151`).
  Move the confederation-coverage check into the WP2 validator; drop the flag.
- **D-5 (Medium, Clean/KISS)** - the shootout `h === a` sudden-death fallback fabricates a
  home goal (`match.ts:176-186`); make the tiebreak fair, comment it as an unreachable
  safety net, and name the `20` bound.
- **D-8 (Medium, YAGNI/SoC)** - `xiStrength` computes `attack`/`defense` but the sim feeds
  only `overall` into `expectedGoals`, while a comment claims "attack vs the other's
  defense" (`match.ts:59-83`). See Decision Gate G1.
- **D-7 (Low, Clean)** - unnamed tuning constants: `penProb` baseline `0.74`, the `78`
  reference rating (also in `drawOpponent`), the `0.006`/`0.12` slopes, and the chemistry
  thresholds. Name `REFERENCE_RATING` and the pen bounds.
- **D-9 (Low, DRY/KISS)** - `squadOverall` is recomputed for the whole `SQUADS` pool on
  each of 14 `drawOpponent` calls (`knockout.ts:44-55`); memoize once.
- **D-12 (Low, KISS/Clean)** - `buildFormation` interleaves layout math with band
  iteration (`formations.ts:123-175`); optionally extract `placeRow`. (The engine is
  otherwise not over-general; `Style` is fully exercised.)
- **Q-10 (Low, DRY/Clean)** - chemistry era window (`span <= 4`) and cluster thresholds
  are bare literals; hoist to named consts (`ERA_SPAN_YEARS`, etc.).

## What is already good (protect during refactors)

- Clean layer separation and correct dependency direction; `domain/` is React-free and
  `Math.random` is isolated to the intended spots.
- The single `useReducer` phase machine is pure and defensive (every case returns
  `state` on invalid input; `RESET` preserves playback prefs).
- `matchUi.tsx` is the reuse model to follow (`FixtureHead`, `ResultTag`, `Banner`,
  `PlaybackControls`, `PRIMARY_BTN`).
- The `squad()` builder + `slug()` (NFD-normalized) are exemplary DRY/KISS; editing
  `squads.ts` alone changes everything at runtime.
- `useFollowBottom` and `Tooltip` are well-scoped, well-commented, and clean up correctly.
- `standings`, the Knuth-Poisson sampler, `clock.ts`, and the `draft.ts` predicates are
  small, correct, and honest. `chemistry.ts` delivers on its transparency design goal.

## Decision gates (RESOLVED 2026-07)

- **G1 (affects WP4, D-8): match model. Resolved -> switch to attack-vs-defense.** Change
  `expectedGoals` to use the side's `attack` against the opponent's `defense` (not team
  `overall`), matching the existing comment and the intent of `xiStrength`. This is a real
  difficulty/gameplay change and MUST be playtested (goal rates and knockout upset
  frequency will shift); update any WP0 characterization expectations to the new,
  intentional behavior rather than treating the diff as a regression. Keep the `attack`/
  `defense` fields regardless (the ratings-strip UI reads them).
- **G2 (affects WP6, A-6): `removePlayers`. Resolved -> test-only, default off.** Set
  `FEATURES.removePlayers` to `false` so the shipped build hides the x-to-remove control.
  Keep the flag, the App handler, and the reducer case behind it (do not delete the code
  path); keep the "testing aid" wording accurate.

## Action plan

Six work packages plus one optional. Each is sized for a single implementation agent,
owns a disjoint set of files (see Sequencing), and must end with a green
`npm run build`. Follow the project conventions throughout: 2-space indent, match
surrounding style, keep `domain/` React-free, gate new optional behavior behind a
`FEATURES` flag, no em-dashes in code/comments/commits, and commit + push to `main` per
WP with the `Co-Authored-By` trailer. Reviewers should check each agent's diff for
overreach (reformatting, incidental behavior changes) before committing.

### WP1 - Dead code purge

- **Addresses:** F-1.
- **Principles:** YAGNI, Clean.
- **Files (owns):** delete `SpeedControl.tsx`, `positionStyle.ts`; edit
  `PlayerBadge.tsx` (remove `FaceAvatar`).
- **Approach:** confirm zero importers with a grep first, then delete/remove. Do not
  touch `knockout.ts` (WP4) or `FixtureRow.tsx` (WP3).
- **Acceptance:** build passes; no remaining references; bundle unchanged or smaller.
- **Effort:** S. **Deps:** none. **Risk:** very low.

### WP2 - Data/types foundation and dataset validator

- **Addresses:** Q-1, Q-3, Q-4 (optional), Q-9, plus new shared vocabulary consumed by
  WP3/WP4 (`primaryPosition` for D-10, `ATTACK_CATS`/`DEF_CATS` for Q-6), and typing for
  Q-5.
- **Principles:** data integrity, Clean, SoC, DRY.
- **Files (owns):** `src/data/types.ts`, `src/data/squads.ts`, new
  `src/domain/validateSquads.ts`.
- **Approach:**
  1. Add a pure `validateSquads(squads): string[]` (returns problems, does not throw)
     that asserts unique `Squad.id`, unique `Player.id`, `positions.length >= 1`,
     `elo`/`rating` in 60-99, every `code` present in `CONFEDERATION`, and that identical
     `personId` always maps to an identical `name` (catches spelling drift). Invoke it
     once behind an `import.meta.env.DEV` guard (wiring into `App` startup is owned by
     WP6; until then it is runnable via a `tmp_` esbuild-node script).
  2. Type `SQUAD_BY_ID` (and export `CONFEDERATION` typing intent) so misses surface as
     `| undefined` (or expose a `Map`). Consumers are fixed in WP4.
  3. Fix the `Player.elo` / `Squad.rating` doc comments to "~60-99" and drop the
     "Placeholder" claim (or scope it to 1998/2002).
  4. Drop the `export` on `CATEGORY_OF`.
  5. Add `primaryPosition(player)` and typed `ATTACK_CATS`/`DEF_CATS` (or predicates)
     beside the existing category helpers, for WP3/WP4 to consume.
  6. (Optional, Q-4) move `lastName`/`formatPositions` to a small `format.ts`.
- **Acceptance:** build clean; `validateSquads(SQUADS)` returns `[]` today; a deliberately
  injected duplicate id or misspelled `personId` is reported.
- **Effort:** S-M. **Deps:** none (land early). **Risk:** low.

### WP3 - Frontend shared primitives and DRY

- **Addresses:** F-2, F-3, F-7, F-8, F-9, Q-2, and the `BoxScore` side of Q-6.
- **Principles:** DRY, Clean, YAGNI.
- **Files (owns):** `matchUi.tsx`, `FixtureRow.tsx`, `SetupPanel.tsx`,
  `CompletePanel.tsx`, `TournamentSummary.tsx`, `BoxScore.tsx`.
- **Approach:** prune `FixtureRow` to the props actually used and rename `EloPill` ->
  `RatingPill` (`homeElo`/`awayElo` -> `homeRating`/`awayRating`); remove the
  `FixtureHead.scrambleCode` branch; add `SECONDARY_BTN` (and a small size variant) next
  to `PRIMARY_BTN`, reuse in `SetupPanel`/`CompletePanel`; add shared caption constants
  (`EYEBROW`, `TABLE_HEAD`, `MONO_CAP`) and map the standings header over a label array;
  import `ordinal` in `TournamentSummary` and reconcile its hardcoded round labels to
  `BRACKET_ROUNDS`; swap `BoxScore`'s inline category arrays for WP2's `ATTACK_CATS`/
  `DEF_CATS`.
- **Acceptance:** build clean; no visual regression (spot-check group + knockout screens
  in the dev server); button and caption class strings each defined once.
- **Effort:** M. **Deps:** WP2 (for `ATTACK_CATS`). Delivers style constants that WP5
  consumes. **Risk:** low-medium (visual).

### WP4 - Domain dedup and purity

- **Addresses:** D-1, D-2, D-4, D-5, D-6, D-7, D-9, D-10, D-11, D-12 (optional), Q-5
  (consumer guards), Q-6 (`match.ts` side), Q-10, D-8 (per G1); also delivers
  `simulateMatchday(group, md)` and a general round resolver for WP5 (A-3) and flat
  bracket accessors for F-12.
- **Principles:** DRY, YAGNI, SoC, Clean, Demeter.
- **Files (owns):** `bracket.ts`, `knockout.ts` (prune; consider renaming the survivors
  to a shared ko module), `match.ts`, `chemistry.ts`, `formations.ts`.
- **Approach:** keep one reg -> ET -> shootout resolver and one `sideOf`; delete the dead
  knockout exports; extract `simulatePeriod` + an `eventOrder` comparator in `match.ts`;
  make the shootout fallback fair and commented and name its bound; name
  `REFERENCE_RATING` and the pen bounds; memoize `squadOverall`; route raw `positions[0]`
  through `primaryPosition`; guard the `SQUAD_BY_ID` lookup in `chemistry.ts` and remove
  its `console.warn`/`warnedMissing` (the WP2 validator now covers it); add flat bracket
  accessors (`finalScoreForChampion`, `opponentOf`, `userGame`); per G1, change
  `expectedGoals` to attack-vs-defense (side `attack` vs opponent `defense`) and update
  its callers in `match.ts`/`knockout.ts`/`bracket.ts`.
- **Acceptance:** build clean; a full 16 -> 1 bracket still runs; the attack-vs-defense
  change is playtested (a manual group + knockout run looks sane, not runaway or
  scoreless); WP0 match-sim expectations are updated to the new intended behavior.
- **Effort:** M. **Deps:** WP2 (`primaryPosition`, `ATTACK_CATS`), G1. **Risk:** medium
  (touches the deterministic core; strongly consider WP0 first).

### WP5 - Screen decomposition and dedup

- **Addresses:** F-4, F-5, F-6, F-10, F-11, F-12, A-3.
- **Principles:** SoC, DRY, KISS, Clean, Demeter.
- **Files (owns):** `TournamentScreen.tsx`, `KnockoutScreen.tsx`, new
  `src/hooks/useMatchClock.ts`, new `src/components/matchView.ts`, new
  `GroupDrawReveal.tsx` / `StandingsTable.tsx` / `MatchdayCard.tsx`.
- **Approach:** extract `liveMatchView(...)` (shared view-model) into `matchView.ts`;
  extract the timer into `useMatchClock({ steps, speed, onEnd })` (knockout passes an
  `onEnd` that triggers its shootout phase); split `TournamentScreen` into
  `GroupDrawReveal` + `StandingsTable` + a shared `MatchdayCard`; render the tail marker
  once; name the animation timings; call WP4's `simulateMatchday` / bracket accessors so
  components animate results rather than simulate them and stop reaching into the bracket
  shape.
- **Acceptance:** build clean; manual playthrough of a full group stage and knockout run
  in the dev server shows identical reveal behavior; `TournamentScreen` substantially
  smaller; timer logic exists in exactly one hook.
- **Effort:** L. **Deps:** WP3 (style constants), WP4 (domain entry + accessors).
  **Risk:** high (largest refactor; verify visually).

### WP6 - App orchestration and reducer symmetry

- **Addresses:** A-1, A-2, A-4, A-5, A-7, A-8, D-3, Q-8, A-6 (per G2); wires the WP2
  validator into dev startup.
- **Principles:** DRY, SoC, KISS, Demeter, Clean.
- **Files (owns):** `App.tsx`, `state/gameReducer.ts`, `domain/tournament.ts`,
  `config.ts`.
- **Approach:** let the reducer own placement validation and have `handlePlace` dispatch
  unconditionally; drive "draw the next squad" from an effect keyed on
  `phase`/`currentSquad`/`rolling` (subsumes the `handleRemove` reconstruction); add
  `recordMatchday(group, results)` and reduce `RECORD_MATCHDAY` to a delegation; add
  `QUALIFY_COUNT` + `qualifiers(group)` + `bracketSeedFromGroup(group)` and route
  `userAdvanced`, `handleEnterKnockout`, and the standings consumers through them; fold
  the masthead stamp/eyebrow/title into one pure helper and guard `koStamp`; consider
  merging `CONSUME_REROLL` into `ROLL_START`; add a guarded early-return for the
  user-team lookup; wire `validateSquads` behind `import.meta.env.DEV`; per G2, set
  `FEATURES.removePlayers` to `false` (keep the flag and code path).
- **Acceptance:** build clean; draft, group, and knockout flows behave identically in the
  dev server; dev console shows the validator run with zero problems.
- **Effort:** M-L. **Deps:** WP2 (validator). **Risk:** medium-high (touches the core
  reducer and effects; verify the full flow).

### WP0 (optional, recommended before WP4/WP6) - Characterization checks

- **Rationale:** the domain reviewer flagged `standings`, `simulateShootout`,
  `recordRound`/`pairGames`, and `computeChemistry` as the highest-value functions to pin
  down, and WP4/WP6 change or lean on all of them. There is no test runner, but the
  project already documents a `tmp_*` esbuild-into-node pattern.
- **Approach:** add throwaway `tmp_*.ts` scripts that assert current behavior of those
  four functions (seeded where randomness is involved: shootout should always return a
  winner, never a negative tally, and `kicks` should reconstruct the score; a full
  bracket should only let the user meet the co-qualifier in the final). Run them before
  and after WP4/WP6. These are gitignored scratch files, not committed tests.
- **Acceptance:** scripts pass on the current `main`; re-run green after WP4/WP6 (or with
  intentionally updated expectations if G1 changes behavior).
- **Effort:** S-M. **Deps:** none. **Risk:** none (does not touch shipped code).

## Sequencing and parallelization

File ownership is disjoint per WP, so the waves below run without merge conflicts.

- **Wave 1 (parallel): WP1, WP2, and WP0.** Isolated files / new files only.
- **Wave 2 (parallel): WP3, WP4, WP6.** All depend only on WP2 and share no files
  (WP3 = presentational components; WP4 = `domain/` sim files; WP6 = `App` + reducer +
  `tournament.ts` + `config.ts`). Resolve G1 before WP4 and G2 before WP6.
- **Wave 3: WP5.** Runs after WP3 (style constants) and WP4 (domain entry points +
  bracket accessors). Largest and riskiest; give it a clean wave.

Ordering rationale: WP2 defines shared vocabulary (`primaryPosition`, `ATTACK_CATS`) that
WP3/WP4 consume; WP4 defines the domain simulation entry and bracket accessors that WP5
consumes; WP3 defines the style constants WP5 consumes. WP6 is independent of the frontend
WPs because it owns only `App`, the reducer, `tournament.ts`, and `config.ts`.

## Finding-to-WP index

| WP | Findings |
| --- | --- |
| WP1 | F-1 |
| WP2 | Q-1, Q-3, Q-4, Q-9, Q-5 (typing), D-10/Q-6 helpers |
| WP3 | F-2, F-3, F-7, F-8, F-9, Q-2, Q-6 (BoxScore) |
| WP4 | D-1, D-2, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-12, Q-5 (guards), Q-6 (match), Q-10 |
| WP5 | F-4, F-5, F-6, F-10, F-11, F-12, A-3 |
| WP6 | A-1, A-2, A-4, A-5, A-7, A-8, D-3, Q-7, Q-8, A-6 |
| WP0 | (safety net for D-2/D-5, standings, recordRound, chemistry) |
