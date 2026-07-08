# Career Depth - Implementation Spec (Economy 2.0)

**Status:** Spec, ready to build. Sits on top of `docs/roguelike-career-design.md` (the
high-level vision). This document is the concrete, code-level plan for the next three
slices; it supersedes that doc's section 6 where they disagree.
**Scope:** clusters **A** (boon-pool unlocks + rarity-weighted offers), **B** (tiered,
level-gated perks), and **C** (Ascension tiers). Clusters **D/E/F** are kept as future
work at the end, with **Challenges** (E) written up in most detail because it is the
next thing after A/B/C.
**Gated by:** `FEATURES.careerMode` (already exists). Everything here is off when the
flag is off, exactly like today.

---

## 1. Why (the gaps this fixes)

Grounded in the current code, the meta-layer has three concrete holes:

1. **Prestige dies.** `career.ts` `buyPerk` gates on `unlocked.includes(id)`, and there
   are exactly 3 perks (25 + 45 + 75 = 145 Prestige total). After that, every run's
   Prestige accrues with nothing to spend it on.
2. **Level is inert.** `levelForXp` / `career.level` are computed and displayed but never
   read by any gameplay path.
3. **Boon offers ignore rarity.** `offerBoons` is `shuffled(BOONS).slice(0, n)`, so a
   `legendary` (Golden Generation, +2 whole XI) is exactly as likely as a common. No
   scarcity means no build tension.

A/B/C together turn Prestige into a deep sink, give Level a mechanical role, add scarcity
to boons, and give veterans an escalation ladder that keeps rewards (and therefore the
sink) flowing.

## 2. The economy loop after A/B/C

```
  play a run  --score-->  XP + Prestige (x Ascension reward mult)     [C feeds the wallet]
       ^                          |
       |                          v
  higher Ascension  <--gate--  Level (from XP)      spend Prestige on:
  (bigger rewards)                                    - boon unlocks       [A: breadth + scarcity]
       ^                                              - perk tiers         [B: rising-cost sink]
       |______________win a cup at tier N____________ - (Ascension itself is won, not bought)
```

- **A** gives Prestige a broad early sink and grows build variety.
- **B** gives Prestige a rising-cost sink with no ceiling until every track is maxed.
- **C** inflates rewards (so the sink keeps getting fed) and uses **Level** as a hard
  gate (so Level finally matters), while the *right* to climb is earned by winning.

---

## 3. Data model changes

### 3.1 `CareerState` v2 (`domain/career.ts`)

```ts
export interface CareerState {
  version: 2;
  xp: number;
  level: number;
  prestige: number;
  /** Perk id -> owned tier (1-based). Absent / 0 = not owned. Replaces the old
   *  boolean `unlocked` perk list. */
  perkLevels: Record<string, number>;
  /** Boon ids added to the offer pool beyond the starter set (cluster A). */
  unlockedBoons: string[];
  /** Highest Ascension tier UNLOCKED (0 = base, always available). The tier PLAYED
   *  is chosen per run and lives on RunState. */
  ascension: number;
  stats: CareerStats;
}

export interface CareerStats {
  runs: number;
  cups: number;
  bestScore: number;
  bestFinish: RunOutcome | null;
  /** Highest Ascension tier at which a cup has been won (drives the C unlock gate). */
  bestCupAscension: number;
}
```

### 3.2 Migration (v1 -> v2) in `state/careerStorage.ts`

`loadCareer` already merges onto `INITIAL_CAREER`; extend it with a one-time migration
when `parsed.version !== 2`:

- `perkLevels`: from the old `unlocked: string[]` (perk ids), set each to tier `1`.
- `unlockedBoons`: `[]`.
- `ascension`: `0`.
- `stats.bestCupAscension`: `0`.
- drop the old `unlocked` key; set `version: 2`.

Keep it defensive (bad/missing -> `INITIAL_CAREER`), like today. Bump the storage key
only if a clean break is preferred; a migration is friendlier and cheap here.

### 3.3 `RunState` addition (`domain/run.ts`)

```ts
export interface RunState {
  // ...existing fields...
  /** Ascension tier this run is being played at (0 = base). Chosen at beginRun,
   *  persisted so a refresh resumes the same difficulty and the end-of-run reward
   *  multiplier is correct. */
  ascension: number;
}
```

`state/runStorage.ts` persists `RunState` wholesale, so add a `?? 0` default on load for
older in-progress saves.

---

## 4. Cluster A - Boon-pool unlocks + rarity-weighted offers

### 4.1 Boon availability

Split `BOONS` into a **starter set** (available from run one) and a **locked set**
(unlocked with Prestige). Tag on the boon so it stays a single source:

```ts
export interface Boon {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  starter?: boolean;   // in the offer pool from the start
  apply: (xi: Player[], ctx: BoonContext) => Player[];
}
```

First-pass split (11 boons today):

- **Starters (5):** `veteran-core` (C), `attacking-masterclass` (C), `defensive-drills`
  (C), `star-signing` (R), `transfer` (R). A complete, coherent early kit.
- **Locked (6), priced by rarity:** `chemistry-catalyst` (C, 15), `glass-cannon`
  (R, 30), `poach` (R, 30), `golden-generation` (L, 55), `marquee-signing` (L, 55),
  `wildcard` (L, 55). Total boon sink = **240 Prestige**.

```ts
export const BOON_UNLOCK_COST: Record<Rarity, number> = { common: 15, rare: 30, legendary: 55 };

/** The offer pool for a given career: starters + everything unlocked. Pure. */
export function availableBoons(unlockedBoonIds: string[]): Boon[] {
  const unlocked = new Set(unlockedBoonIds);
  return BOONS.filter((b) => b.starter || unlocked.has(b.id));
}

/** Locked boons still buyable, for the library UI. */
export function lockableBoons(): Boon[] {
  return BOONS.filter((b) => !b.starter);
}
```

### 4.2 Rarity-weighted offers (replaces the unweighted shuffle)

```ts
const RARITY_WEIGHT: Record<Rarity, number> = { common: 6, rare: 3, legendary: 1 };

/** Offer `n` distinct boons drawn from `available`, weighted by rarity (legendaries
 *  scarce). Weighted sampling WITHOUT replacement. `n` is clamped to the pool size. */
export function offerBoons(available: Boon[], n = 3): Boon[] {
  const pool = [...available];
  const out: Boon[] = [];
  const take = Math.min(n, pool.length);
  for (let k = 0; k < take; k++) {
    const total = pool.reduce((s, b) => s + RARITY_WEIGHT[b.rarity], 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= RARITY_WEIGHT[pool[idx].rarity];
      if (r <= 0) break;
    }
    out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return out;
}
```

**Signature change:** `offerBoons(n)` -> `offerBoons(available, n)`. Callers are all in
`run.ts` (`prepareGroupStage`, `prepareKnockoutRound`, and the `scout` perk in
`beginRun`). Each already has `run.perks`/career context; thread `availableBoons(...)`
in. See 4.3 for who owns the unlocked-boon list at those call sites.

### 4.3 Threading the unlocked list into the run

`run.ts` only knows `run.perks` today. Add the unlocked boon ids to the run the same way:
`beginRun(xi, perks, unlockedBoons, ascension)` stashes `unlockedBoons` on `RunState`
(new transient-ish field, or fold into a small `RunConfig`). Then `prepareGroupStage` /
`prepareKnockoutRound` call `offerBoons(availableBoons(run.unlockedBoons), offerSize(...))`.

`CupRunScreen.startRun` already passes `career.unlocked` to `beginRun`; it becomes
`beginRun(draftedXi, ownedPerkIds(career), career.unlockedBoons, chosenAscension)`
(see B for `ownedPerkIds`).

### 4.4 Buying boon unlocks

```ts
export function unlockBoon(career: CareerState, boonId: string): CareerState {
  const boon = boonById(boonId);
  if (!boon || boon.starter || career.unlockedBoons.includes(boonId)) return career;
  const cost = BOON_UNLOCK_COST[boon.rarity];
  if (career.prestige < cost) return career;
  return {
    ...career,
    prestige: career.prestige - cost,
    unlockedBoons: [...career.unlockedBoons, boonId],
  };
}
```

---

## 5. Cluster B - Tiered, level-gated perks

### 5.1 Perk model (tracks with tiers)

```ts
export interface PerkTier {
  level: number;      // 1-based tier index
  description: string;
  cost: number;       // Prestige for THIS tier
  levelReq: number;   // career level required to buy it (Level's teeth)
}
export interface Perk {
  id: string;
  name: string;
  tiers: PerkTier[];
}
```

First-pass tracks (numbers tunable):

```ts
export const PERKS: Perk[] = [
  { id: 'scout', name: 'Scout Network', tiers: [
    { level: 1, description: 'Start each run with 1 team boost applied.',  cost: 25,  levelReq: 1 },
    { level: 2, description: 'Start each run with 2 team boosts applied.',  cost: 70,  levelReq: 5 },
  ]},
  { id: 'deep-squad', name: 'Deep Squad', tiers: [
    { level: 1, description: '+1 to your entire XI at run start.',          cost: 45,  levelReq: 1 },
    { level: 2, description: '+2 to your entire XI at run start.',          cost: 95,  levelReq: 4 },
    { level: 3, description: '+3 to your entire XI at run start.',          cost: 170, levelReq: 8 },
  ]},
  { id: 'extra-boon', name: 'Extra Choice', tiers: [
    { level: 1, description: '4 team boosts offered each round.',           cost: 75,  levelReq: 3 },
    { level: 2, description: '5 team boosts offered each round.',           cost: 150, levelReq: 7 },
  ]},
];
```

Total B sink = 25+70 + 45+95+170 + 75+150 = **630 Prestige**, most of it behind level
gates, so it drip-feeds over a long career.

### 5.2 Buying a tier (replaces `buyPerk`)

```ts
export const perkLevelOf = (career: CareerState, id: string) => career.perkLevels[id] ?? 0;
export const ownedPerkIds = (career: CareerState) =>
  PERKS.filter((p) => perkLevelOf(career, p.id) > 0).map((p) => p.id);

/** The next unbought tier of a perk, or null if maxed. */
export function nextPerkTier(career: CareerState, id: string): PerkTier | null {
  const perk = perkById(id);
  if (!perk) return null;
  return perk.tiers[perkLevelOf(career, id)] ?? null; // owned N -> tiers[N] is tier N+1
}

export function buyPerkTier(career: CareerState, id: string): CareerState {
  const tier = nextPerkTier(career, id);
  if (!tier) return career;
  if (career.level < tier.levelReq || career.prestige < tier.cost) return career;
  return {
    ...career,
    prestige: career.prestige - tier.cost,
    perkLevels: { ...career.perkLevels, [id]: tier.level },
  };
}
```

### 5.3 Perk effects read tiers (`run.ts` `beginRun` / `offerSize`)

- **Deep Squad:** `+deepSquadLevel` to every player's elo (clamped by `ELO_MAX`) instead
  of the current flat `+1`.
- **Scout Network:** apply `scoutLevel` boons at kickoff (loop the existing single-boon
  block `scoutLevel` times, drawing from `availableBoons`), tagging each incoming player.
- **Extra Choice:** `offerSize = 3 + extraChoiceLevel` (was `perks.includes('extra-boon') ? 4 : 3`).

`beginRun` takes the resolved perk levels (pass `career.perkLevels`, or a small resolved
`{ deepSquad, scout, extraChoice }`). Keep it a pure function of its inputs.

---

## 6. Cluster C - Ascension tiers

### 6.1 Definition

```ts
export interface Ascension {
  tier: number;
  label: string;       // e.g. "Ascension II"
  userDelta: number;   // added to the user's atk/def in their matches (negative = harder)
  drawSlopeBonus: number; // optional: steepens the opponent draw toward stronger squads
  rewardMult: number;  // multiplies XP + Prestige from the run
  levelReq: number;    // career level required to PLAY this tier (Level's teeth)
}

export const ASCENSIONS: Ascension[] = [
  { tier: 0, label: 'Base',          userDelta: 0,   drawSlopeBonus: 0.00, rewardMult: 1.0, levelReq: 1 },
  { tier: 1, label: 'Ascension I',   userDelta: -2,  drawSlopeBonus: 0.02, rewardMult: 1.25, levelReq: 3 },
  { tier: 2, label: 'Ascension II',  userDelta: -4,  drawSlopeBonus: 0.04, rewardMult: 1.5,  levelReq: 6 },
  { tier: 3, label: 'Ascension III', userDelta: -6,  drawSlopeBonus: 0.06, rewardMult: 1.8,  levelReq: 10 },
  { tier: 4, label: 'Ascension IV',  userDelta: -8,  drawSlopeBonus: 0.08, rewardMult: 2.2,  levelReq: 15 },
  { tier: 5, label: 'Ascension V',   userDelta: -10, drawSlopeBonus: 0.10, rewardMult: 2.7,  levelReq: 20 },
];
```

### 6.2 Unlock rule (skill gate + level gate, both required)

Tier `T+1` is **selectable** only when:
- a cup has been won at tier `T` (`career.stats.bestCupAscension >= T`), **and**
- `career.level >= ASCENSIONS[T+1].levelReq`.

`career.ascension` caches the highest tier meeting the first condition; the level check
is applied at selection time so a low-level veteran cannot skip ahead. This is where
**Level earns its keep**: you can win your way up, but you still have to *be* the level.

On a cup win, bump `stats.bestCupAscension = max(prev, run.ascension)` and, if that opens
a new tier, `career.ascension = max(career.ascension, run.ascension + 1)`.

### 6.3 Threading the levers

All three levers are cheap because the plumbing exists:

1. **User handicap (MVP, already plumbed):** `CupRunScreen` passes `diffDelta` into
   `prepareGroupStage` / `prepareKnockoutRound`. Change it to
   `diffDelta + ASCENSIONS[run.ascension].userDelta`. This flows through
   `userGroupTeam(xi, chem, atkDefDelta)` to attack + defense (user only), so it moves
   win probability without touching displayed opponent ratings, exactly like `hard`
   difficulty. Difficulty and Ascension **stack** (a design choice; note in UI).
2. **Reward multiplier (MVP):** in `applyRunResult`, multiply by
   `ASCENSIONS[run.ascension].rewardMult`:
   `xpGained = Math.round(run.score * mult)`, `prestigeGained = Math.max(1, Math.round(run.score * mult / 5))`.
3. **Opponent draw strength (enhancement):** pass `drawSlopeBonus` into `drawOpponent`
   (add it to `DRAW_WEIGHT_SLOPE`) and bias `pickOpponents` toward stronger squads
   (replace the plain `shuffled().slice()` with a weighted pick reusing the same slope).
   This makes the *field* genuinely tougher rather than only handicapping the user.
   Optional for the first ship; levers 1+2 alone deliver a working ladder.

### 6.4 Choosing a tier per run

`beginRun(xi, perkLevels, unlockedBoons, ascension)` stamps `ascension` onto `RunState`.
`CupRunScreen` gains an Ascension selector on the pre-run screen (0..selectable max),
defaulting to the highest selectable, showing the handicap + reward-multiplier preview.

---

## 7. UI changes

- **CareerHub perk shop (`cupRun/CareerHub.tsx`):** render each perk as a track. Show
  owned tier ("Deep Squad II"), the next tier's cost, and a disabled state with the
  reason ("Reach level 8" vs "Need 170"). Reuse the existing card styling.
- **New "Boon library" section in the hub:** grid of all boons (reuse the sticker
  rarity palette). Starters/unlocked show a check; locked show the Prestige cost and an
  Unlock button gated by affordability. This is the primary early sink, so make it
  prominent.
- **Ascension selector (pre-run):** a small stepper/segmented control on the
  "Start a Cup Run" panel: tier, "Field +X / You -Y", "Rewards x1.5", and the unlock
  hint for the next tier ("Win an Ascension II cup, reach level 10"). During a run,
  show the active tier as a chip near the `RunLadder`.
- **Run-reward readout:** the existing end-of-run XP/Prestige toast/summary already
  exists (`reward` state); show the Ascension multiplier as a line ("Ascension II x1.5").
- Copy stays jargon-light per repo convention: "boosts" not "boons", "rating" not "elo".

---

## 8. `scripts/checks.ts` invariants to add

The run/career core is pure and deterministic apart from `Math.random`, so extend the
characterization harness:

- `offerBoons(available, n)` returns `min(n, available.length)` **distinct** boons, all
  drawn from `available`; over many samples, per-rarity frequency tracks `RARITY_WEIGHT`
  within tolerance.
- `availableBoons` always includes every starter and never a non-unlocked locked boon.
- `buyPerkTier` never exceeds a track's max tier, never spends below cost, and refuses
  when `level < levelReq`; Prestige is conserved (spent == cost).
- `unlockBoon` is idempotent and refuses starters / duplicates / unaffordable buys.
- Ascension: `rewardMult` monotonic non-decreasing in tier; `applyRunResult` scales
  XP/Prestige by exactly the played tier's multiplier; `bestCupAscension` only rises,
  and only on a `champion` outcome.
- A full simulated run at every Ascension tier still terminates in a valid `RunOutcome`
  and crowns/loses consistently (reuse the existing run-to-completion check).

## 9. Balancing notes (tune with the harness + `odds.ts`)

- **Difficulty curve:** use `domain/odds.ts` `simulateTitleOdds` to confirm each
  Ascension tier drops a *median* XI's cup odds by a sensible, monotonic step. Target a
  smooth ramp, not a cliff.
- **Reward vs risk:** `rewardMult` should roughly offset the drop in win rate so
  expected Prestige-per-run rises with tier (otherwise no one climbs). Cross-check
  expected Prestige/run against sink costs so the economy has a healthy time-to-unlock
  (early boon unlocks in a few runs; full perk maxing over a long tail).
- **Guardrail:** Deep Squad + Scout stacking must not make Base trivial; that is what the
  Ascension ladder is for (climbers re-introduce the challenge). Keep `ELO_MAX` clamps.

## 10. Build order within A/B/C

1. **A1 - rarity-weighted `offerBoons`** (tiny, immediate feel win; no schema change if
   you keep the whole pool available at first).
2. **A2 - boon unlocks** (schema v2 `unlockedBoons` + migration + library UI + starter tags).
3. **B - tiered perks** (schema `perkLevels` + `buyPerkTier` + hub UI + `beginRun` reads).
4. **C - Ascension** (schema `ascension` + `ASCENSIONS` + threading + selector + rewards).

Each slice is independently shippable behind `FEATURES.careerMode` and validated by the
checks harness before the next.

---

# Future ideas (kept from the brainstorm; not in this spec's scope)

## E. Challenges / Mandates  ← the headline next feature

A renewable objective system layered on top of A/B/C. This is the strongest retention
add after the economy exists, and it is cheap because **most predicates are pure
functions of the finished `RunState`**, which already carries everything needed:
`run.history` has per-round records (scores, opponents, `decided`, `groupResults`,
ratings), `run.xi` has the final roster, `run.outcome`, `run.score`, `run.ascension`,
`run.activeBoons`, `run.boostedIds`.

### Model (design-level)

```ts
interface Challenge {
  id: string;
  name: string;
  description: string;
  scope: 'permanent' | 'weekly' | 'daily';
  reward: number;            // Prestige (plus optional cosmetic/badge)
  /** Pure predicate over the finished run (+ light career context). Testable. */
  check: (run: RunState, ctx: { ascensionPlayed: number }) => boolean;
}
```

### Example challenges (all computable from today's `RunState`)

- **Giant Slayer** - win a cup at Ascension III or higher.
- **Rag Tag** - win a cup with an XI whose average rating is under 80.
- **United Nations** - win a cup with 5+ different nations in the final XI.
- **The Wall** - win every knockout tie without conceding (scan `history` KO records).
- **Purist** - win a cup without picking a single roster boost (`boostedIds` empty).
- **Comeback Kings** - qualify from the group with a negative goal difference, then win
  the cup (derive GD from `groupResults`).
- **Cold Blooded** - win a knockout tie on penalties, then go on to lift the cup
  (`decided === 'pens'` somewhere in `history`).
- **Route One** - score 4+ in a single knockout tie.

### Persistence & rotation

- `career` gains `completedChallenges: string[]` (permanent) and a small
  `periodicProgress: Record<string, string>` (challenge id -> period key already
  claimed) for weekly/daily.
- **Permanent** and **weekly** challenges work with today's `Math.random`. **Daily**
  challenges pair naturally with a **seeded run** (see F): everyone gets the same rolls +
  offers + the same daily mandate, which is also the on-ramp to leaderboards.
- Completion is checked in `applyRunResult` (or right after it), awarding Prestige into
  the same wallet A/B spend from, and writing a **trophy cabinet** entry.

### Why it fits now

Challenges give Prestige a *second faucet* (not just stage-score), reward *how* you win
(not just how far), and create goals that outlast "reach the next Ascension." They also
seed the trophy cabinet (below) with meaningful, named accomplishments.

## D. In-run economy (Form) + node variety

Between-round nodes rotate boon / **shop** / **event** instead of always a boon pick.
**Form** is an in-run currency earned from wins and goal margins, spent at shops
(re-rolls, rating heals, extra boon). Events are themed trade-off choices. Curses become
genuinely optional high-risk boosts (Glass Cannon already exists as a template). This is
the biggest of the future items and is what makes the *run itself* skillful rather than
"pick the biggest number." Depends on nothing in A/B/C but is more work than all three.

## F. Skill-surfacing: odds readout + daily seeded run

- **Odds readout:** `domain/odds.ts` `simulateTitleOdds` already exists. Show projected
  cup-win % **before vs after** each boost/ascension choice, turning decisions into
  measurable skill. Medium effort, high perceived-depth payoff.
- **Daily seeded run:** a seedable RNG (centralize the `Math.random` calls in
  `domain/random.ts`) gives a shared daily seed: same rolls, offers, and (with E) daily
  challenge. Enables self-comparison now and leaderboards once accounts/cloud exist.

## Trophy cabinet (pairs with E)

Once challenges exist, surface a cabinet in the hub: cups by Ascension tier, best score,
challenges completed, badges. A visible record of achievement is a strong retainer and
pairs with the sticker album as a second persistent collection.

---

## Open questions

- **Difficulty vs Ascension:** stack them (spec's assumption) or have Ascension replace
  the casual/normal/hard setting inside career mode? Stacking is simplest; revisit if the
  combined handicap over-punishes.
- **Boon-pool size vs offer quality:** as `unlockedBoons` grows, a 3-card offer dilutes.
  Consider letting Extra Choice scale with pool size, or a "banish" so dead cards leave
  the pool (leans toward D).
- **Prestige-reset / prestige tail:** once every track is maxed, is there a late-game
  reset-for-a-badge sink? Out of scope here; note it for when the tail matters.
- **Save size / versioning:** career is small; keep the single versioned key with the
  v1->v2 migration. Add v2->v3 the same way if E/F land.
