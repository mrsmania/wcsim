# Adding a World Cup to the dataset

The method that produced 1982, 1978, 1974 and 1970 (and re-sourced 1986), written down so
the next tournament does not have to rediscover it. **Everything here was learned the
expensive way** - each numbered warning is something that actually went wrong and had to be
corrected afterwards.

Read this whole file before starting. Then use the prompt in the last section.

---

## 0. What you are producing

One `squad(...)` block per nation appended to `src/data/squads.ts`, each row:

```ts
[shirtNumber, 'Display Name', ['POS', 'POS2'], rating, 'optional-personId-override'],
```

Nothing else in the codebase needs touching for the tournament to appear: `WORLD_CUP_YEARS`
is derived from `SQUADS`, and collectibility is derived from `player.elo`. What *does* need
touching is listed in section 7, and skipping any of it breaks something silently.

---

## 1. The three sources, in this order

**Try the fetch before believing a site is blocked.** The 1986 drop was built on the belief
that Wikipedia was unreachable and inferred 255 ratings and every specific position from a
distribution rule as a result. It was wrong, and the whole tournament had to be re-sourced.
From a local session `curl` and the MediaWiki API both reach Wikipedia, and rsssf.org
answers.

### 1a. The Wikipedia squad list - the skeleton

```bash
curl -sS --ssl-no-revoke -m 40 \
  "https://en.wikipedia.org/w/index.php?title=1966_FIFA_World_Cup_squads&action=raw" \
  -o tmp_1966.wiki
```

`--ssl-no-revoke` matters on Windows: without it curl intermittently dies with
`CRYPT_E_NO_REVOCATION_CHECK` when the revocation server is unreachable, which looks like
the site being down.

Gives you, per player: shirt number, display name, the GK/DF/MF/FW split, **caps and club
at the time**, and the article title. Caps + club is the single best rating signal for a
player nobody has written about.

### 1b. Each player's own article - the twelve specific positions

Batch through the MediaWiki API, `rvsection=0` so you only pull the lead and the infobox:

```
https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content
  &rvslots=main&rvsection=0&format=json&formatversion=2&redirects=1&titles=A|B|C...
```

Read the infobox `position` field ("Left-back", "Defensive midfielder", "Sweeper"). Around
99% of players have one. Also grep the lead prose for position words as a fallback hint.

**Batch 20-30 titles and sleep ~2.5s between calls, and cache to disk as you go.** The API
returns 429 under load and a naive run loses everything; every drop hit this.

### 1c. RSSSF match line-ups - the role he actually filled

```bash
curl -sS --ssl-no-revoke -m 40 "https://www.rsssf.org/tables/66full.html" -o tmp_66full.html
```

Each side is printed by line: `keeper - defence - midfield - attack`. This is what turns
"Defender" into `LB`, and it separates starters from the bench for the ratings.

> **WARNING 1 - RSSSF serves ISO-8859-1, not UTF-8.** Decode it as latin-1 and then
> `html.unescape` it. Decoding as UTF-8 silently destroys every accented surname, and the
> failure is invisible: a name that fails to match just reads as "did not play", so a
> tournament's starters look like bench players. Two raters caught this independently in
> 1982 after it had already skewed a whole group's first draft.

> **WARNING 2 - order within a line is NOT reliable for left-vs-right.** It is
> right-to-left for some teams and left-to-right for others, sometimes within the same
> tournament. Use it for *which line* and *who started*; get the flank from the player's
> own article.

---

## 2. Name matching is where the tooling lies to you

You will write something that matches RSSSF's short surnames against Wikipedia's full
names. Every drop found a new way for it to be wrong. The rules that survived:

- **Only `rsssf ⊂ player` is legitimate containment.** RSSSF prints short forms of long
  names, never the reverse. Allowing the other direction merged Jack and Bobby Charlton in
  the same squad (1970).
- **Short mononyms break substring matching.** Brazil's "Cesar" was handed "Cesar
  Carpegiani"'s appearances in 1974; the same hit both Marinhos, Edu and Farias. Treat any
  short one-word name's appearance line as unreliable in both directions.
- **A fuzzy surname fallback must refuse ambiguity, not guess.** In 1978 it matched Derek
  Johnstone to Willie Johnston and gave three different Tunisians one keeper's line.
- **An honest miss beats a false positive.** After tightening, 1970 missed about a dozen
  genuine starters and reported them as "none found". That is the correct failure: a rater
  can read a printed line-up, but cannot un-see a wrong appearance count.

**Print the full line-ups verbatim under each squad in the dossier and say in the brief
that they are the authority and the `apps` line is only a hint.**

---

## 3. Identity: the part `validateSquads` cannot see

`personId` is the slug of the display name, so two different people with one name silently
become one drafted-once identity. `validateSquads` cannot catch it - two people with one
name is indistinguishable from one person with two appearances. **Run these three scans
before believing a tournament is done:**

1. **Collisions inside the new tournament.** Two men in the field sharing a display name.
2. **Collisions against the existing dataset.** For each hit, decide: same human (share the
   id, no override) or different (add an override). A useful filter: if the existing
   appearance is more than ~8 years away, it is probably a different person. That reduced
   1978's 96 name hits to exactly 2 needing thought.
   - When the 1978 row is the same man as a later row that **already carries an override**,
     it must **reuse that id** rather than take the bare slug or mint a new one.
   - Overrides seen so far: Brazil's Oscar / Junior / Julio Cesar / Eder / Paulo Sergio /
     Juninho / Renato, Spain's Victor / Juanito / Joaquin, Czechoslovakia's Jan Kozak (his
     2010 namesake is his son), Mexico's Javier Hernandez (Chicharito's father), Sweden's
     Jan Olsson (two different men, 1970 and 1974).
3. **Near-miss spellings.** The mirror risk: the *same* man spelled two ways becomes two
   people. Compare edit distance within a nation. This caught Bezsonov/Bessonov and
   Blokhin/Blochin. `validateSquads` catches the sub-case where one slug ends up with two
   display names (it found 1978's Olguin/Olguín), so **run it too** - the collision scan
   structurally cannot see that one.

---

## 4. Squad size: check it, never assume

Three of five drops had a squad that was not the nominal size:

- **Morocco brought 19 to 1970** and never filled the roster.
- **El Salvador brought 20 to 1982**, likewise.
- **1986's source carried a phantom 23rd Moroccan** ("Abderrazak Dinar") who appears in no
  other source. He was deleted.

Cross-check every squad's count against **planetworldcup** (`planetworldcup.com/CUPS/<year>/
squad_<code><yy>.html`), which states short squads explicitly.

---

## 5. Ratings: the structure, and the one number that matters

### The structure

**Four raters over two groups of eight squads (two per group, working independently), then
one reconciler per group.** For a 24-team field use three groups of eight, six raters and
three reconcilers. Reconcilers see both proposals plus a mechanical line-by-line diff.

The pairs converge tightly when the brief is good - across five drops, **no single player's
rating ever differed by 5 or more between the two raters of a pair**, and squad best XIs
agreed within about a point. That convergence is the evidence the numbers are a reading of
the football rather than one model's noise. It is also what makes the diff cheap to
adjudicate.

A separate **calibration reviewer** measuring the finished tournament against the others was
needed for 1986 and 1982, and became unnecessary from 1978 onward. Only add one back if the
band self-check below is missing or comes out wrong.

### The one number

> **Hand the raters the 81-84 band share as an explicit self-check, up front.** This is the
> single highest-value instruction in the whole process.

The standing failure mode of this dataset is **coming in a rung light across the board**. It
happened to 1986 and to 1982, and both needed a reviewer to find it afterwards. From 1978 on
the raters were given the band target up front, checked their own output, found it light
(15.3% and 17.6% in 1974; 14.2% and 13.6% in 1970) and fixed it before finishing. Three
drops running needed no correction.

**Give the PER-HALF figures, not a whole-tournament one.** A whole-tournament target is not
something the weak half can honestly carry, and a good rater will correctly refuse to
inflate to reach it (1978's B1 did exactly that). Measured over five fields, split by best
XI:

| | 81-84 band | best-XI mean |
| --- | --- | --- |
| strong half | 19-22% | 81.1-82.1 |
| weak half | 2.3-7% | 73.8-76.5 |
| whole field | 10.1-16.4% | - |

### The anchor direction - and it inverts

Every player already in the dataset at another tournament is an anchor, and it is the
strongest calibration a rater has. **The direction depends on which side of the existing
data you are adding.**

- **Going backwards (1966 and earlier):** every anchor points *forward*. A later row is a
  **decline** number for anyone at his peak in the new tournament, and a **target** for
  anyone young. This inversion is the single most likely systematic error - state it to
  raters in those words. In 1978, Platini at 22 sat eight below his 1982 row and Hugo
  Sanchez was 19.
- **Going forwards (2026):** the familiar direction - a later tournament is a decline
  number for a veteran and a target for a youngster.

Never apply a fixed offset. The 1986 drop put everyone who also appears in 1990 at a flat
"minus two", which is wrong in both directions and produced its worst misses (Cha Bum-kun, a
Bundesliga star, at 67).

**Anchors are matched by NAME and are often a different person.** Tell raters to flag
suspects. Three raters independently flagged the same wrong-person anchors in 1982.

### Where the field should land

Aim for **mean ~75, median ~75, p90 82-83, floor 63**. Best XI from roughly 68-71 for the
weakest side to 84-86 for the best. Current family:

Measured 2026-08-26 over all fourteen. Re-measure rather than trusting this table: the
script is six lines over `SQUADS` and the file moves.

| | rows | mean | median | p90 | floor | 81-84 band | best XI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1970 | 349 | 74.9 | 75 | 82 | 63 | 12.3% | 67.5 - 86.8 |
| 1974 | 352 | 75.1 | 75 | 83 | 63 | 13.6% | 68.0 - 85.4 |
| 1978 | 352 | 75.4 | 75 | 82 | 65 | 12.2% | 70.7 - 84.4 |
| 1982 | 526 | 74.1 | 74 | 82 | 63 | 11.4% | 68.8 - 84.8 |
| 1986 | 528 | 75.1 | 74 | 83 | 65 | 11.6% | 69.9 - 84.5 |
| 1990 | 528 | 74.7 | 77 | 83 | 64 | 14.2% | 69.0 - 86.2 |
| 1994 | 528 | 74.6 | 75 | 82 | 63 | 12.5% | 73.1 - 85.1 |
| 1998 | 704 | 75.6 | 75 | 83 | 62 | 10.9% | 70.3 - 85.2 |
| 2002 | 736 | 75.3 | 77 | 84 | 63 | 16.4% | 68.3 - 89.1 |
| 2006 | 736 | 75.8 | 76 | 83 | 62 | 13.7% | 70.2 - 87.3 |
| 2010 | 736 | 75.2 | 75 | 83 | 62 | 10.1% | 66.7 - 88.3 |
| 2014 | 736 | 76.2 | 76 | 84 | 64 | 13.5% | 72.9 - 88.1 |
| 2018 | 736 | 75.6 | 75 | 84 | 62 | 11.3% | 67.5 - 87.9 |
| 2022 | 830 | 76.0 | 76 | 84 | 62 | 14.5% | 68.9 - 87.8 |

Nothing in the family reaches a mean of 77 or drops below 74, and no field's best XI range
is wider than about 20 points. A new tournament landing outside either is a signal to look
again, not a discovery.

**90+ is scarce.** Two in 1978 (correctly - no all-time great at his peak, and Cruyff
refused to travel), five in 1970 and 1974, 4-15 across the whole file. The Ballon d'Or
shortlist of that year is the right reference.

---

## 6. Positions in older eras

1970 and earlier pre-date modern position language: articles say "inside forward", "wing
half" or just "forward". Map each onto the twelve by **where the man actually lined up**:
inside forward is usually `AM` or `ST`, wing half `DM` or `CM`, full-back `LB`/`RB`, libero
`CB`. **1966 and earlier will need this more, not less.**

`positions[0]` is the role he actually filled at *that* tournament if he played; a man who
never got on the pitch carries the role he was picked for. Additional real roles follow.
Only give a second or third when it is real - padding every player with three makes the
draft meaningless.

---

## 7. The finishing checklist

Skipping any of these breaks something quietly.

- [ ] **New nations** need a flag in `src/components/Flag.tsx` and an entry in
      `src/data/confederations.ts`. `validateSquads` fails on a missing confederation; a
      missing flag renders nothing at all. A nation with no flag in `country-flag-icons`
      borrows a successor's, as YUG, TCH, URS, GDR and ZAI already do. Israel is recorded
      under its current affiliation (UEFA), the same choice Australia gets.
- [ ] **`npm run gen:collectibles`**, then **`NODE_OPTIONS=--use-system-ca npm run
      push:collectibles`**. The seed's checksum covers `playerId|tier|elo`, so **any**
      rating change to a collectible makes it stale, not just one crossing a band. Node
      does not read the Windows certificate store, which is why the env var is needed -
      without it the push fails with "could not reach the server" while curl works fine.
- [ ] **New collectibles need art**, or an entry in `KNOWN_MISSING_ART` in
      `scripts/checks/assets.ts`. They render the silhouette placeholder meanwhile. The
      allowance list is itself checked, so it cannot become permanent debt.
- [ ] **The front page's "since <year>" copy** in `src/components/ModeSelect.tsx`.
- [ ] **`npm run gen:players`** to regenerate `docs/players.html`; nothing fails while it
      is stale because it is outside the build.
- [ ] **`npm run build`** and **`npm run checks`** (currently 202 checks).
- [ ] **Docs:** `CLAUDE.md` (tournament list, row count, album count), `README.md`,
      `docs/ROADMAP.html` item 03.
- [ ] **Commit and push to `main`.** Always, no branch, no PR.

---

## 8. 2026 is a different problem

Everything above assumes the tournament has been played. **2026 has not been**, which
changes three things:

1. **There are no squads yet.** There is no source to be faithful to; anything written now
   is a projection that will be wrong.
2. **There are no line-ups**, so the "role he actually filled" rule has nothing to read and
   collapses back to "the role he is". `positions[0]` becomes his club role.
3. **The rating rule loses half its definition.** Every other tournament blends
   pre-tournament standing with how it actually went. For 2026 only the first half exists,
   so it is a pure ability rating - and it should be *said* to be, in the block comment, or
   a later reader will assume the blend was applied.

It is also **48 teams**, the first expanded field. Check the group-draw code and any
"32 nations" assumption before starting, exactly as the 16-team fields needed checking
going the other way.

**Recommendation: do not add 2026 until the squads are announced.** If it is wanted before
then, treat it as an explicitly-labelled projection, keep it behind the pool setting so
players can exclude it, and expect to replace it wholesale rather than tune it. Note the
other dataset in `docs/players.html` already carries a predicted 2026 field, which is worth
reading as a comparison - but it is a projection too, not a source.

---

## 9. The prompt

Use this verbatim, filling in the year. It assumes you are the integrator and will spawn
the raters yourself.

> Add the **<YEAR>** World Cup to the dataset in `src/data/squads.ts`, using the method in
> `docs/adding-a-world-cup.md`. Read that file first and follow it; it records what went
> wrong on the five previous drops and why each rule exists.
>
> Work in this order, and do not skip the pre-flight:
>
> 1. **Fetch the three sources** - the Wikipedia squad list (raw wikitext), each player's
>    own article through the MediaWiki API in cached batches, and the RSSSF line-ups for
>    that year. Decode RSSSF as **latin-1**. Use `--ssl-no-revoke` on curl.
> 2. **Pre-flight, before any rating work.** Verify every squad's size against
>    planetworldcup and do not assume the nominal number. List the nations that are new to
>    the dataset and what flag and confederation each needs. Run all three identity scans
>    from section 3 and decide every `personId` override up front. Report what you found
>    before continuing.
> 3. **Build a per-group dossier** carrying, per player: shirt number, GK/DF/MF/FW, caps,
>    club, the infobox position, prose hints, the appearance line, and any existing dataset
>    row for the same name marked as an ANCHOR. Print the **full RSSSF line-ups verbatim**
>    under each squad and say in the brief that they outrank the appearance line.
> 4. **Rate adversarially.** Two independent raters per group of eight squads, then one
>    reconciler per group working from both proposals plus a mechanical diff. Give every
>    rater the **per-half 81-84 band figures** as a self-check up front, and state the
>    anchor direction explicitly - for a tournament older than 1970 every anchor points
>    forward, so a later row is a decline number for a man at his peak here.
> 5. **Assemble and measure.** Group rows GK/DF/MF/FW and sort by shirt number inside each
>    group. Then measure the finished tournament against every other one - mean, median,
>    p90, floor, best-XI range, 81-84 band share, distinct ratings per squad - and report
>    the table. If the band is under 10%, it came in light; fix it by naming specific
>    players rather than by a blanket shift.
> 6. **Finish the checklist** in section 7, including the collectible seed and its push to
>    the account server.
> 7. **Commit and push to `main`**, with a message that records the decisions - which
>    squads were short, which overrides were needed and why, where the tournament landed,
>    and anything the tooling got wrong.
>
> Report in plain English about the football, not the code. If something is genuinely
> uncertain, say so rather than smoothing it over.
