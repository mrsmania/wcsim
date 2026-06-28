# Design: Team Chemistry

## 1. Overview & placement
A new **pure domain module** `src/domain/chemistry.ts` (matches the existing
`src/domain/` pure-logic pattern). It computes a `ChemistryReport` from the placed XI;
the report's `bonus` (0-6) is added to the **user XI's `overall` only**, just after
`xiStrength()` in the team-building path. Opponents never call it, so they're untouched.
The whole thing is gated by a `FEATURES.chemistry` flag (`src/config.ts`).

```
Draft state (Filled + Formation)
        | placements: {player, slotPosition}[]
        v
 computeChemistry()  -->  ChemistryReport { bonus, raw, links[], fitCount, placed }
        |                         |
        | bonus (0..6)            +-->  SquadPanel HUD (FR3 live) + Summary (FR4)
        v
 userGroupTeam(players, bonus)
        |   strength = xiStrength(players); strength.overall += bonus
        v
 simulateMatch(...)  (group + knockout, FR5)
```

## 2. Module contract (`src/domain/chemistry.ts`)

```ts
export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
export interface Placement { player: Player; slotPosition: Position; }
export type ChemDimension = 'squad' | 'nation' | 'tournament' | 'continent' | 'era' | 'fit';
export interface ChemistryLink { dimension: ChemDimension; label: string; points: number; }
export interface ChemistryReport {
  placed: number;          // players placed (0..11)
  raw: number;             // sum of all link points
  bonus: number;           // mapped 0..6, added to overall
  fitCount: number;        // players in their primary position
  links: ChemistryLink[];  // non-zero contributions, for FR3/FR4 display
}
export const CONFEDERATION: Record<string, Confederation>;  // nation code -> confederation
export function computeChemistry(placements: Placement[]): ChemistryReport;  // pure, partial-safe
```

`computeChemistry` resolves each player's `code`/`year` via `SQUAD_BY_ID[player.squadId]`.

## 3. Algorithm
Operate on **placed** players only (so it scales as the XI fills). Five dimensions ->
raw points -> mapped bonus.

### 3.1 Cluster dimensions (group by attribute; reward each cluster of size k >= 2; sum across clusters)
| Dimension | Group key | Points per cluster of size k |
|---|---|---|
| `squad` | `squadId` | SQUAD_PTS[k] = {2:5,3:10,4:15,5:20,6:25,7:30,8:34,9:38,10:44,11:50} |
| `nation` | `code` | (k - 1) * 2 |
| `tournament` | `year` | (k - 1) * 1.5 |

### 3.2 Continent (g = size of largest single-confederation group)
g >= 9 -> 5 ; g >= 6 -> 3 ; g >= 4 -> 1 ; else 0

### 3.3 Era (span = maxYear - minYear over placed players)
span <= 4 -> 5 ; <= 8 -> 3 ; <= 12 -> 1 ; else 0  (on by default)

### 3.4 Positional fit (f = count where slotPosition === player.positions[0]; secondary = 0)
f >= 11 -> 8 ; f >= 9 -> 5 ; f >= 7 -> 2 ; else 0

### 3.5 Raw -> bonus mapping (saturating, hard-capped)
```
raw = sum of all dimension points
bonus = clamp(round(raw / 6.5), 0, 6)   // overall only
```
Breakpoints (raw -> bonus): <3->0, 3-9->1, 10-15->2, 16-22->3, 23-29->4, 30-38->5, >=39->6.

Worked examples (full XIs):
- All-Brazil, mixed eras, in position: nation 20 + squad pairs ~10 + continent 5 + fit 8 ~= 43 -> +6
- Class of 2014, mixed nations: tournament 15 + continent 3 + era 5 + fit 8 ~= 33 -> +5
- Scattered all-stars, in position: fit 8 + continent 3 + a pair 2 ~= 13 -> +2
- Scattered and out of position: ~= 5 -> 0-1

All tables/divisor are **tunable constants exported from the module** (NFR1).

## 4. CONFEDERATION table
- UEFA: FRA, ITA, NED, GER, ESP, ENG, POR, BEL, CRO, SRB, SUI, DEN, POL, WAL, SVN, SVK, GRE, RUS, BIH, SCG, CZE, UKR, SWE
- CONMEBOL: BRA, ARG, URU, COL, ECU, CHI, PER, PAR
- CONCACAF: MEX, USA, CRC, CAN, HON, TRI, PAN
- CAF: SEN, CMR, MAR, TUN, GHA, NGA, CIV, EGY, ALG, RSA, ANG, TOG
- AFC: KSA, IRN, JPN, KOR, QAT, AUS, PRK
- OFC: NZL

Note: AUS placed in AFC (competes there since 2006); NZL is the lone OFC side. A missing
code scores 0 continent points; a dev warning/test should flag unknown codes.

## 5. Injection points
**5.1 `tournament.ts` - `userGroupTeam(players, chemistryBonus = 0)`**: apply bonus to
`overall` only; default 0 keeps opponents/other callers unaffected; `xiStrength()` stays
generic and pure.

**5.2 Draft/state layer (reducer + App)**: build `placements` from `Filled` + formation
slots; `computeChemistry()` on each placement (FR3) and on completion (FR4); pass
`report.bonus` into `userGroupTeam` when the sim is built (FR5); store report in state.
All gated by `FEATURES.chemistry` (off -> bonus 0, report still computable for tests but
UI hidden).

**5.3 UI (read-only)**: live HUD in SquadPanel (effective overall + chemistry meter +
just-placed link); breakdown in the completion/summary screen. Hidden when flag off.

## 6. Feature flag (`src/config.ts`)
```ts
export const FEATURES = { chemistry: true } as const;
```
- Bonus path: `const bonus = FEATURES.chemistry ? report.bonus : 0;`
- UI: chemistry components render only when `FEATURES.chemistry`.
Single switch; flip to `false` to fully disable.

## 7. Requirements traceability
FR1.1-1.5 -> 3.1-3.4 ; FR2 -> 3.5 ; FR3/FR4 -> report.links in 5.3 ; FR5 -> 5.1-5.2 ;
NFR1 tunable consts ; NFR2 transparent labels ; NFR3 pure/no-RNG ; NFR4 scattered~0 ;
NFR5 O(11) ; NFR6 -> 6 (flag).

## 8. Edge cases
- Empty/partial XI tolerated (0-10 placed); bonus grows as filled.
- Duplicate-person guard unchanged (handled by personId in the draft).
- Same-squad subset of same-nation overlap is intentional; the 3.5 cap contains runaway.
- Unknown nation code -> 0 continent points + dev warning.

## 9. Deferred to implementation / tuning
- Final constant values + the /6.5 divisor (validate via themed-vs-all-stars win-rate spread).
- Exact HUD visual; whether `draft.ts teamRating` is replaced or shown alongside the
  sim-consistent effective overall.
