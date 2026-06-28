# Requirements: Team Chemistry System

## Goal
Add a **chemistry** layer that boosts the user's drafted XI's effective strength based
on cohesion between the 11 chosen players. It rewards thematic, connected drafts (one
nation, one era, players in their right roles) as a deliberate counterweight to chasing
raw individual elo - narrowing the gap against AI opponents, which are real intact
squads with innate cohesion.

## Scope & rationale
- Applies to the **user's XI only**. Opponent squads (`src/domain/tournament.ts`) are
  real national teams and are treated as fully cohesive by nature - they receive no
  separate chemistry calc.
- Chemistry produces a **strength bonus** folded into the XI's `overall` (decision:
  overall only) consumed by match simulation in `src/domain/match.ts`.
- The whole feature sits behind a **feature flag** so it can be disabled quickly.

## Functional requirements

**FR1 - Chemistry dimensions (team-wide threshold model).** Compute, over the placed XI,
how many players share each attribute; award bonus points as counts cross thresholds:
- **FR1.1 Same exact squad** (`squadId`) - real teammates. Highest value per link; a full
  XI from one squad is the jackpot.
- **FR1.2 Same nation** (`code`, across years).
- **FR1.3 Same tournament** (`year`, across nations).
- **FR1.4 Same continent / era** - confederation (derived from nation code) and
  generational proximity; small, easily-earned trickle (on by default).
- **FR1.5 Positional fit** - count players placed in their **natural** role
  (`positions[0]`); a secondary eligible role earns **zero** credit (decision).

**FR2 - Aggregate chemistry score.** Combine the dimension bonuses into a single chemistry
value, then map it to a bounded strength bonus of **~+0 to +6** on `overall` (one elo
tier). Mapping must be monotonic and capped (no runaway stacking).

**FR3 - Live feedback during draft.** As each player is placed, update and display: (a) the
running team chemistry, (b) which link(s) that pick contributed, (c) the resulting
effective team rating. Empty/partial XIs show partial chemistry.

**FR4 - Final breakdown.** On completion, show a per-dimension breakdown (e.g. "Nation:
7x Brazil -> +3", "Positional fit: 9/11 -> +1") and the total bonus.

**FR5 - Simulation integration.** The bonus modifies the user XI strength used by
group-stage and knockout simulation; the displayed team rating reflects chemistry
consistently with what the sim uses.

## Non-functional requirements
- **NFR1 Balance:** a zero-chemistry all-stars XI must remain clearly viable; a
  high-chemistry mid-tier XI should be competitive but not dominant. Magnitude band
  tunable in one place.
- **NFR2 Transparency:** every point of chemistry must be explainable to the player.
- **NFR3 Determinism & purity:** chemistry is a pure function of the placed XI (no
  randomness); fits the existing pure-domain pattern in `src/domain/`.
- **NFR4 Self-balancing edges:** a maximally scattered XI naturally earns ~0 bonus.
- **NFR5 Performance:** trivial (<=11 players); recomputed on each placement.
- **NFR6 Toggleable:** the entire feature is controlled by a single feature flag; when
  off, no bonus is applied and no chemistry UI is shown.

## User stories / acceptance criteria
- **US1** *I see my chemistry update as I place each player.* Placing a player who shares a
  nation with existing picks visibly raises chemistry and labels the link.
- **US2** *I'm rewarded for a single-nation or single-era team.* An all-Brazil or all-2014
  XI yields a near-max bonus; the same-exact-squad case yields the highest.
- **US3** *I'm nudged to play players in position.* Placing a player in a secondary role
  earns no positional-fit chemistry.
- **US4** *Chemistry meaningfully helps but doesn't trivialize quality.* The bonus never
  exceeds the cap (~+6); a top-elo low-chem team still simulates as strong.
- **US5** *I understand my final bonus.* Summary lists each dimension's contribution.
- **US6** *The owner can disable it.* Flipping the feature flag removes the bonus and the
  chemistry UI without other changes.

## Decisions
- Bonus applies to **overall only**.
- Positional fit: secondary eligible position = **zero** credit.
- Same continent / era trickle: **on by default**.
- Parked (not in scope): national spine, iconic shirt numbers, champion's aura, same club
  (no data).

**Next step:** `docs/chemistry-design.md` specifies the algorithm and injection points.
