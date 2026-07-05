# Roguelike Cup Runs + Manager Career - Design

**Status:** Design draft (product + high-level architecture). No implementation yet.
**Goal:** turn the core loop (draft an XI, win the cup) into something players return to
daily and stick with long-term, by wrapping each run in roguelike variety and hanging a
persistent manager career off the back of it.

---

## 1. The idea in one paragraph

Every session is a **Cup Run**: a single, self-contained attempt to win the World Cup,
enriched roguelike-style with **boons** you pick between rounds, escalating difficulty,
and run-ending stakes. What *persists* between runs is your **Career**: a manager profile
that gains XP, levels up, and spends earned **Prestige** on an unlock tree that feeds back
into future runs (more boons, better draft odds, new formations, harder difficulties).
The run gives each session its spike of variety and tension; the career gives you the long
arc that makes you come back for the next run. This is the Hades model applied to the draft
loop.

## 2. Terminology

- **Cup Run** - one roguelike attempt (draft + group + knockout), start to elimination or trophy.
- **Boon** - a one-off or run-long modifier chosen between rounds (buff, roster op, match effect, or curse trade-off).
- **Form** - the *in-run* currency (earned by winning/margins, spent at in-run shops). Resets each run.
- **Prestige** - the *meta* currency (earned per run by how far you got), spent in the career unlock tree. Persists.
- **Career** - the persistent manager profile: level, unlocks, trophy cabinet, stats, and the existing sticker album.
- **Ascension** - optional difficulty tiers that raise the challenge (and rewards) for replay.

## 3. Player experience (one loop, narrated)

1. Open the app → **Career hub**: your level, Prestige, unlocked perks, trophy cabinet, "Start a Cup Run."
2. Start a run. Any **starting perks** you've unlocked apply (e.g. begin with one re-roll banked, or a free boon).
3. **Draft** your XI as today (rolled squads, place one at a time). Career unlocks may improve the rolls or add scouting.
4. **Group stage** (3 matchdays), same live clock and feed. Qualify → **Boon offer** (pick 1 of 3).
5. **Round of 16 → Final**, each win followed by a between-round node: a **boon pick**, an **event** (a choice with a consequence), or a **shop** (spend Form). Difficulty ramps as the field strengthens.
6. **Run ends** when you lose a knockout tie (or fail to qualify) - or you **win the cup**.
7. **Run rewards**: XP + Prestige scaled by how far you got and the difficulty, plus album stickers for collectibles in your final XI (existing behaviour). Level-ups and unlocks happen back in the Career hub.
8. Spend Prestige on the **unlock tree**; admire the growing **trophy cabinet**; start the next run.

## 4. The Cup Run (roguelike layer)

### 4.1 Structure

The run reuses the existing group + knockout flow, with **decision nodes interleaved
between stages**:

```
Draft XI
  -> Group stage (MD1, MD2, MD3)        [lose here = fail to qualify -> run ends]
  -> NODE (boon)
  -> Round of 16                         [lose a KO tie = run ends at this stage]
  -> NODE (boon | event | shop)
  -> Quarter-final
  -> NODE (boon | event | shop)
  -> Semi-final
  -> NODE (boon | event | shop)
  -> Final                               [win = CHAMPION, run success]
```

Node types rotate so a run has texture:
- **Boon** - pick 1 of 3 offered boons (weighted by rarity + your unlocked pool).
- **Event** - a themed choice with a trade-off (e.g. "Rest a star (‑fatigue risk) or play him and gamble +form").
- **Shop** - spend **Form** on boons, re-rolls, a rating "heal," or a scout.

### 4.2 In-run economy (Form)

- Earned from wins and goal margins (bigger wins pay more), so *how* you win matters, not just that you did.
- Spent only within the run (shops). Resets at run end. Keeps in-run decisions self-contained.

### 4.3 Difficulty & ascension

- The run has a **difficulty tier** (from your career level and/or a chosen Ascension). Higher tier = stronger opponents (nudge the elo-weighted draw up), fewer/rarer boon offers, more curses in events, and **larger Prestige rewards**.
- Ascension tiers unlock as you win, giving veterans a reason to keep climbing.

### 4.4 Run end & scoring

- **Score = stage reached x difficulty**, with bonuses for margins/clean sheets/constraints met.
- Converts to: **XP** (career level), **Prestige** (unlock currency), and the usual **album stickers**.
- The user's own scores stay hidden until revealed via the clock, exactly as today.

## 5. Boons

The heart of the variety. Each boon has a **rarity** (Common / Rare / Legendary - reuse the
sticker tier palette for visual consistency) and belongs to a category. The **offer pool grows**
as the career unlocks more boons, so early players see a simple set and veterans see a deep one.

| Category | Examples |
|---|---|
| **Squad boost** | Training camp (+2 to one player), Chemistry catalyst (all same-nation +1), Retrain (add a position to a player), Veteran leadership (+1 to the XI's lowest-rated three). |
| **Roster op** | Transfer (swap a player for a rolled alternative), Poach (take a player from your next opponent), Wildcard (draft one guaranteed 90+ legend), Extra sub. |
| **Match effect** | Home advantage (+1 XI for one match), Scout report (see next opponent's XI + weak spot), Penalty specialist (win shootouts more often), Momentum (+form on a win). |
| **Economy / meta** | Extra re-roll, Sponsor (more Form), Sap (‑1 to next opponent), Insurance (survive one KO loss). |
| **Curse / trade-off** | Glass cannon (+4 attack, ‑3 defense), All eggs (+5 to one player, ‑1 to everyone else), High stakes (double Prestige, but no boon next node). |

**Effect model (design-level):** a boon is a pure transform applied to run state - either to
the XI's effective strength (which flows into `xiStrength` / the sim), to the run economy, or
to the next-match parameters. They compose; curses give the risk/reward decisions that make
the run *skillful* rather than just "pick the biggest number."

## 6. The Career (meta layer)

### 6.1 Progression

- **XP → Level.** Every run grants XP by score. Levels are the visible climb and gate content.
- **Prestige** is spent in the **unlock tree** (below). Earned by run performance.
- A **season-pass-style track** of milestones (optional) gives a secondary carrot with reward beats.

### 6.2 Unlock tree (spend Prestige)

- **Boon unlocks** - add boons to the offer pool (breadth + build variety).
- **Starting perks** - begin each run with a banked re-roll / a free boon / +chem.
- **Formation unlocks** - start with a few, unlock the rest.
- **Draft-quality upgrades** - stronger squads roll more often; **scouting** (peek before you commit).
- **Ascension tiers** - unlock harder difficulty for bigger rewards.
- **Cosmetics** - manager avatar, club crest, kit, a nicer trophy room.

### 6.3 Persistence & prestige-reset

- **Persists (career save):** level, XP, Prestige, unlocked boons/perks/formations, cosmetics, trophy cabinet, lifetime stats, and the existing album.
- **Per-run (run save):** drafted XI, active boons, Form, current stage, run difficulty. Survives a refresh mid-run (like the current `/group` and `/knockout` persistence).
- **Prestige-reset (optional, late):** at the cap, reset progress for a permanent badge + a small enduring bonus, to extend the tail for the most engaged.

### 6.4 Trophy cabinet

Cups won (by difficulty), best streak, fastest cup, "won with N nations," etc. A visible record
of achievement is a strong sunk-cost retainer and pairs with the sticker album as a second
persistent collection.

## 7. How the layers connect

```
  CAREER (persists)                         CUP RUN (per session)
  level / XP / Prestige      --unlocks-->   starting perks, boon pool, formations, draft odds
  trophy cabinet + album     <--rewards--   stage reached, difficulty, collectibles in final XI
```

The run consumes the career's unlocks and feeds the career its rewards. Neither is satisfying
alone (a run needs a spine; a career needs varied runs) - together they're the strongest
retention design in the brainstorm.

## 8. Skill & the odds function

At every boon/shop/event decision, surface the **projected cup-win %** (`domain/odds.ts`
`simulateTitleOdds`) - before vs after the choice. This turns the run into a genuine skill
expression (maximise your odds through boon and routing decisions and risk management),
directly addressing "where's the skill if the match is probabilistic": the skill is in the
*decisions*, measured by expected outcome, while the single run stays dramatic.

## 9. Architecture: reuse vs new

**Reused as-is:** `domain/draft.ts` (draft/roll), `domain/match.ts` + `domain/tournament.ts`
+ `domain/bracket.ts` (the run's matches), `domain/formations.ts`, `domain/chemistry.ts`,
`domain/odds.ts` (decision support), the sticker album + `state/albumStorage.ts` (rewards),
the live clock, and the routing/persistence patterns.

**New (all framework-free `domain/` + a storage module):**
- `domain/boons.ts` - boon definitions, rarity, offer weighting, and pure effect transforms.
- `domain/run.ts` - the run state machine: stages, node sequencing, Form economy, applying boon effects into the XI/sim inputs, run scoring.
- `domain/career.ts` - pure level/XP/Prestige model + unlock definitions and gating.
- `state/careerStorage.ts` - persist the career (separate localStorage keys, like `albumStorage.ts`), plus the in-run save.
- Reducer: either extend `gameReducer` with run/career actions or add a parallel run reducer that drives the existing screens.

## 10. Data model sketch (design-level)

```ts
type Rarity = 'common' | 'rare' | 'legendary';

interface Boon {
  id: string;
  name: string;
  rarity: Rarity;
  category: 'squad' | 'roster' | 'match' | 'economy' | 'curse';
  description: string;
  // Pure transform of run state (XI strength deltas, economy, next-match params).
  apply: (run: RunState) => RunState;
}

interface RunState {
  difficulty: number;       // ascension / career-derived tier
  stage: 'draft' | 'group' | 'r16' | 'qf' | 'sf' | 'final' | 'done';
  xi: PlacedXi;             // the drafted XI (+ boon-applied strength deltas)
  activeBoons: string[];    // boon ids in effect
  form: number;             // in-run currency
  offer?: Boon[];           // current 1-of-3 boon offer, if at a node
  score: number;
}

interface CareerState {
  version: number;
  level: number;
  xp: number;
  prestige: number;
  unlocked: { boons: string[]; perks: string[]; formations: string[] };
  cosmetics: Record<string, string>;
  trophies: { cupsByDifficulty: Record<number, number>; bestStreak: number; /* ... */ };
  stats: { runs: number; cups: number; /* ... */ };
}
```

## 11. FEATURES flag & coexistence

- Gate the whole system behind **`FEATURES.careerMode`** (or `cupRun`). Off = the app is exactly today's game.
- The current single-run game stays as **"Quick Play / Exhibition"** (no boons, no career), so the plain draft-and-win experience is preserved for casual players. Career mode is the opt-in progression track.

## 12. Retention hooks baked in

- **"One more run"** loop (the roguelike core).
- **Daily seeded run** - a shared seed per day (same rolls + boon offers) for comparison, and later a leaderboard.
- **Ascension chase** + **unlock tree** + **trophy cabinet** = long-term goals.
- **Weekly boon/modifier rotation** - keeps the offer pool fresh.
- **Album synergy** - runs still feed the existing collection.

## 13. Phasing (ship it in slices)

1. **MVP - the run wrapper.** The existing draft + cup, with a small fixed boon set (1-of-3 after each round) and a run score. No career yet. Proves the fun. Local, behind the flag.
2. **Career spine.** XP/level/Prestige, a starter unlock tree (boon unlocks + a couple of starting perks), trophy cabinet, career hub screen. Persisted.
3. **Depth.** Events, shops, Form economy, curses, ascension tiers, daily seeded run, odds readout at decision nodes.
4. **Social (needs the cloud/accounts work).** Daily-run leaderboards, friend/ghost duels.

## 14. Open questions

- **Draft timing:** draft the full XI up front (simplest, matches today) vs draft incrementally across nodes (more roguelike, bigger change). Lean full-up-front for MVP.
- **Boon vs existing swap rule:** how boons interact with one-player-per-person and the collectible-swap mechanic (probably: boons bypass or extend those rules within a run).
- **Balance:** Form earn/spend rates, boon power budget, difficulty curve - all need playtesting (the `scripts/checks.ts` harness + the odds function can validate that difficulty scales sensibly).
- **Curses' floor:** ensure trade-off boons can't brick a run (guardrails).
- **Save size / migration:** versioned career + run saves, like the album's `version` field.

## 15. Non-goals (for this design)

- Changing the base match sim or ratings.
- Requiring accounts for phases 1-3 (all local).
- A full FUT-style card economy / spending your collection (that needs a broad collection first; out of scope).
- Replacing Quick Play - the current game stays intact alongside.
