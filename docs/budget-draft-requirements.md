# Budget Draft ("Transfer Market") - Requirements

**Status:** Requirements + high-level design. The pricing model is implemented
(`src/domain/pricing.ts`); the UI + integration are specified here, not yet built.
**Goal:** let the player build their XI in **two ways** - the current random roll, or a
fixed-budget market where they hand-pick players priced by rating.

---

## 1. What the player wants (locked)

> "Draft my 11 in 2 ways: the current way of rolling random teams, or buy my players
> with a fixed budget of $100 - each player has a fixed value based on their rating
> (higher rating = higher price). In that mode the user chooses the players himself,
> from all squads in the app."

| # | Decision | Choice |
|---|----------|--------|
| D1 | Two draft modes | **Random Roll** (today) and **Budget Market** (new), chosen at setup |
| D2 | Budget | Fixed **$100** for the whole XI |
| D3 | Price | A **fixed function of rating** (higher rating = higher price); see §3 |
| D4 | Pool | **All players from all squads** in the dataset are buyable |
| D5 | Choice | The **user picks each player** (no rolling) |
| D6 | Downstream | A budget-built XI plays exactly like a rolled one (group, knockout, Cup Run) |

## 2. Scope

**In scope:** a setup toggle between the two modes; a market screen to search all
players, see prices, and buy into formation slots within $100; producing a normal
`filled` XI that flows into the existing play + Cup Run flow.

**Out of scope (for this feature):** trading/selling mid-tournament, per-position
sub-budgets, price inflation/form, a squad economy, leaderboards.

## 3. Pricing model (implemented: `domain/pricing.ts`)

Price is **convex** so a fixed budget forces trade-offs (you can't buy eleven stars,
and a lone superstar has diminishing rating-per-dollar):

```
priceOf(elo) = max(1, round((elo - 58)^2 / 64))   // BUDGET = 100
```

Validated against the dataset:

| Rating | 60 | 70 | 78 | 82 | 84 | 88 | 90 | 93 | 96 | 99 |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Price  | $1 | $2 | $6 | $9 | $11| $14| $16| $19| $23| $26|

- An **all-82 XI = $99** (just fits); an **all-84 XI = $121** (busts). So the uniform-rating ceiling under budget is ~82.
- A **"dream XI" (best per slot) = ~$226**; the **cheapest valid XI = ~$11**; the $100 budget sits between them, so the choice space is real.
- Typical outcome: ~$100 buys either a balanced ~82 side, or a couple of stars (one 99 = $26) propped up by cheaper role players.

`BASE`/`DIVISOR` are the tuning knobs if the budget should feel tighter or looser.

## 4. Constraints

- **Formation slots.** The player picks a formation at setup (as today); the market
  fills that formation's 11 slots. A player is buyable into a slot only if the slot's
  position is in the player's `positions` (reuse `canPlace` from `domain/draft.ts`).
- **One person per XI.** Enforce the existing `personId` rule (the same human can't be
  bought twice, even across tournaments).
- **Budget.** Sum of prices <= **$100**. A pick that would exceed the remaining budget
  is disabled with a clear reason.
- **Completion.** The XI is "complete" when all 11 slots are filled and total <= $100.

## 5. Market UX

A market screen (route e.g. `/build`), reachable when Budget Market mode is chosen:

- **Budget bar** always visible: `Spent $63 / $100 - $37 left`.
- **The pitch/formation** (reuse `Pitch.tsx`) showing filled slots + open slots.
- **A searchable player list** (reuse `SquadBrowser`'s diacritic-insensitive search +
  filters by position / nation / year), each row showing the player's **price** and an
  **Add** action; rows that don't fit an open eligible slot or the remaining budget are
  disabled with the reason (wrong position / too expensive / person already in XI).
- Click an open slot -> filter the list to affordable, eligible players for that slot.
- **Remove** a player to free the slot and refund its price.
- Helpers (nice-to-have): "auto-fill cheapest valid XI", a "spend remaining" hint.
- Collectible markers (tier star) shown as elsewhere, gated on `FEATURES.stickerAlbum`.

## 6. Integration (how it plugs into the existing app)

- **Setup toggle.** On the setup screen (`SetupPanel`), after formation/style, add a
  **draft-mode choice**: *Random Roll* (default, today's flow) or *Budget Market*.
  Gate the whole feature behind **`FEATURES.budgetDraft`**; off = app unchanged.
- **Reducer.** Add one action, e.g. `LOAD_XI { filled }`, that sets the drafted XI
  directly (formation is already chosen). The home sub-view is derived from
  `formation` + completeness, so a loaded complete XI shows the **CompletePanel**
  automatically - no other reducer change.
- **Downstream is free.** From CompletePanel the existing **"Start the World Cup"** and
  **"Play as a Cup Run"** both read `filled`/`formation`, so a budget-built XI plays and
  earns stickers/career rewards exactly like a rolled one (D6). Chemistry applies the
  same way.
- **Reuse:** `Pitch`, `canPlace`, `SquadBrowser` search, `Flag`, `RatingChip`,
  `teamChemistry`, `priceOf`.

## 7. Edge cases

- Guarantee a **valid XI is always affordable** (the cheapest valid XI is ~$11, so yes).
- Prevent a pick that leaves no affordable completion? (Optional; simplest is to allow
  any within-budget pick and let the user remove/adjust - the cheap floor makes dead-ends
  rare.)
- **Same person, different tournaments:** blocked by `personId` (as today).
- **Formation change mid-build:** re-validate slots (or lock the formation once building
  starts, MVP-simplest).

## 8. Phasing

1. **MVP:** setup toggle + market screen (search all players, buy into slots within
   $100) -> `LOAD_XI` -> play via the existing flow. Fixed formation chosen at setup.
2. **Polish:** auto-fill helper, "spend remaining" hint, per-slot filtering, nicer
   affordability messaging, collectible markers.
3. **Later (optional):** per-position budget caps, a max-3-per-nation rule, a "best value"
   score, or a daily budget puzzle (ties into the Daily Challenge idea).

## 9. Open questions

- **Budget feel:** is $100 with this curve the right tightness, or should a $100 XI be a
  bit stronger (raise budget or soften the curve)? Easy to tune post-playtest.
- **Formation flexibility:** lock the formation once building starts, or allow changes
  mid-build (re-validating slots)?
- **Nation cap:** add "max 3 per nation" (FPL-style) for more strategic spread, or keep
  it unconstrained for the MVP?

## 10. Non-goals

Trading/selling mid-run, price dynamics (form/inflation), a full squad economy, or
changing the sim/ratings. This mode is purely an alternative way to assemble the XI.
