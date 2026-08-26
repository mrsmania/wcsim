# Adding a World Cup to the dataset

The method that produced 1982, 1978, 1974 and 1970 (and re-sourced 1986) going backwards,
then **2026** going forwards, written down so the next tournament does not have to
rediscover it. **Everything here was learned the expensive way** - each numbered warning is
something that actually went wrong and had to be corrected afterwards.

**Which end you are adding to changes the method more than anything else does.** A backward
drop reads printed line-ups and fights a name matcher; a forward drop gets FIFA's own
positions and fights label drift instead. Section 1d and section 8 are the forward path;
sections 1c and 2 are the backward one. Everything else applies to both.

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

### 1d. A MODERN tournament: FIFA's tactical line-ups replace RSSSF entirely

**RSSSF has no `<yy>full.html` for recent tournaments** - 2018, 2022 and 2026 all 404. Do
not conclude the site is down; it simply stops. For anything from roughly 2018 on there is
a better source, and it is on Wikipedia:

- The **per-group articles** (`2026 FIFA World Cup Group A` ... `Group L`) and the
  **per-round articles** (`... round of 32`, `... knockout stage`, `... final`) each carry a
  `{{#invoke:Football box|main ...}}` per match, followed by two line-up tables.
- Those tables are transcribed from **FIFA's own Tactical Line-up PDFs**, and they print the
  role of every starter in almost exactly this game's vocabulary: `GK RB CB LB DM CM AM RM
  LM RW LW CF RF LF SW RWB LWB`. Map `CF`->ST, `RF`->RW, `LF`->LW, `SW`->CB, `RWB`->RB,
  `LWB`->LB and the rest are already the twelve.
- They also give substitutions on and off with the minute, yellow and red cards, and the
  **Man of the Match**. Aggregated over every match that is starts, minutes, cards and MOTM
  per player - the whole "how it went" half of the rating, per man rather than per squad.

**This is strictly better than the RSSSF route and it removes section 2 entirely.** Both the
squad list and the line-ups are Wikipedia links, so a player is matched by ARTICLE TITLE, not
by name. In 2026 that matched 104 matches to 1,248 squad rows with **five** misses, all of
them one article title appearing in two forms, all resolved by an exact display-name match
inside the one squad. No fuzzy matcher, no Charltons, no mononym trap.

> **WARNING 3 - the box template's field lookahead must allow DIGITS.** Reading
> `|goals1=(.*?)(?=\n\|[a-z]+=)` looks right and is wrong: `[a-z]+` cannot match `goals2`,
> so `goals1` silently swallows the other side's scorers and every goal is double counted.
> Use `[a-z0-9]+=`.

> **WARNING 4 - the goal lists have at least three markup shapes** in one tournament: with
> and without a leading `*`, with and without the apostrophe after the minute, and `og` as
> well as `o.g.`. **The check that catches all of it is free:** reconcile the goals you
> parsed against the SCORELINE for every match. 2026 came out at 308 parsed against 308
> scored, zero unreconciled boxes, and the top three matched the official Golden, Silver and
> Bronze Boot exactly. Before that check it was 412.

> **WARNING 5 - `{{birth date and age2}}` does not always carry `df=y`.** One squad in 2026
> (the United States, all 26) omitted it, a regex expecting it produced no age for any of
> them, and both raters had to read that squad from caps and club alone. They said so, which
> is how it was found. Make the parameter optional and assert that no player is left without
> a date of birth.

> **WARNING 6 - a starter who plays extra time is not 90 minutes.** Nine of 2026's 104
> matches went to extra time. Minutes are a secondary signal so this is a small distortion,
> but if you compute them, handle it.

> **WARNING 7 - print the RAW infobox string next to whatever you mapped it to.** Any
> wording-to-position mapper you write will be wrong somewhere: 2026's turned both "wide
> midfielder" and "right midfielder" into `CM`, because a generic `midfielder` rule matched
> first. It cost nothing only because the dossier printed `infobox: <raw> -> <mapped>`, so a
> reconciler reading the row could see the mapper had eaten the wide role and put it back.
> Print both, and tell raters the mapped value is a suggestion.

---

## 2. Name matching is where the tooling lies to you

**This whole section is about the RSSSF route, so it applies to a BACKWARD drop only.** For a
modern tournament both sources are Wikipedia and a player is matched by article title, which
is an identity, not a guess - see section 1d. Skip to section 3.

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
4. **Label drift against the EXISTING dataset - the scan a forward drop needs most.** A
   modern squad list often labels a man differently from the article the dataset took him
   from, so the slug does not match and he silently becomes a NEW person with no anchor. His
   rating is then set from nothing, and the album gains a duplicate of a card it already has.
   2026 had **nine**, and an edit-distance scan found none of them, because the two labels
   are not near-misses - they are different names for one man:
   - a nickname alone against the full name (Egypt's `Trézéguet` = `Mahmoud Trézéguet`);
   - a diminutive (Australia's `Cammy Devlin` = `Cameron Devlin`);
   - a shortened surname (Iran's `Kanaanizadegan` = `Kanaani`);
   - a lengthened one (Ghana's `Abdul Fatawu` = `Abdul Fatawu Issahaku`, and the reverse for
     `Abdul Rahman Baba` = `Baba Rahman`);
   - a transliterated given name (Iran's `Mahdi` = `Mehdi` Torabi);
   - and a source that DISAMBIGUATES where the dataset does not (Brazil 2026 lists three
     Edersons and two Danilos, so the City keeper is `Ederson Moraes` where the dataset has
     him as plain `Ederson` - and the other two really are different, younger men).

   The scan that finds them is **exact last-token (surname) match within one nation, where
   the given name differs**, plus a token-prefix pass for the shortened/lengthened cases.
   Then read every hit by hand against date of birth and club; almost all of them are
   brothers, namesakes or shared given names, and the handful that are one man stand out.
   **Resolve it by respelling the NEW row to the existing label**, never by renaming the old
   rows, and never with a personId override - the override is for two people with one name,
   which is the opposite problem.

**Do all four scans BEFORE the raters start, not after.** An anchor is the strongest
calibration a rater has, and a missing or wrong one is silently absorbed into a number. 2026
went out with two anchor defects still in the dossiers; the raters caught two of them
themselves and said so in their reports, which is the only reason they were fixed.

**Then splice the finished blocks in and run `validateSquads` before you believe any of it.**
Its "one personId, one name" assertion is the last net, and in 2026 it caught four more:
Wikipedia's 2026 squads article accents `Ricardo Rodriguez`, `Théo Hernandez`,
`Lucas Hernandez` and `Julián Alvarez` differently from the articles the existing rows came
from. Same men, same slug, two display names - which is a build failure, not a cosmetic one.
Wikipedia contradicting itself between articles is normal; **the dataset's own internal
consistency wins**.

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

> **The band share is a WHOLE-FIELD check. Do not hold a rater to it on eight squads.**
> 2026 proved this twice over and it cost nothing only because the raters pushed back
> instead of inflating. Two ways it breaks:
>
> - **A rater group is a SLICE of the ranking, not a half of the field.** Give one rater
>   the sides ranked 4, 9, 16 and 21 and their "strong half" contains exactly one elite
>   team, so the 85+ share comes out at 8% against a target of 11-17% - correctly. Every
>   85+ row concentrates in the champions and the finalists. The fix is not to invent one.
> - **A 48-team field's weak half is weaker than any 32-team field's.** The band was
>   measured on fields whose 32nd side was Qatar; 2026's runs down to Curacao and Panama.
>   Weak-half means came in at 68.9 to 71.7 against a 71.5-73 target, and that is right.
>
> **The check that does transfer is the BEST-XI mean**, because it does not depend on which
> squads a rater drew: 81.1-82.1 for strong-half sides, 73.8-76.5 for weak-half ones. Give
> raters that alongside the band, and tell them explicitly that the band is a check on the
> whole tournament which you will run yourself at the end.

> **Distinct ratings per squad: the real figure is 10-15, not 16-22.** A brief that asks for
> 16-22 out of 26 is asking for a spread the dataset has never had - 2022's Qatar has 10,
> Saudi Arabia 11, France 12. Three separate raters measured the file and told me the number
> I had given them was wrong, which is the system working, but it wasted a pass. A squad
> genuinely compressed onto 8 values is worth spreading; one at 12 is not.

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

Measured 2026-08-26 over all fifteen. Re-measure rather than trusting this table: the
script is six lines over `SQUADS` and the file moves.

| | rows | mean | median | p90 | floor | 81-84 band | best XI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1970 | 349 | 74.9 | 75 | 82 | 63 | 12.3% | 67.5 - 86.4 |
| 1974 | 352 | 75.1 | 75 | 83 | 63 | 13.6% | 68.0 - 85.4 |
| 1978 | 352 | 75.4 | 75 | 82 | 65 | 12.2% | 70.7 - 84.4 |
| 1982 | 526 | 74.1 | 74 | 82 | 63 | 11.4% | 68.7 - 84.8 |
| 1986 | 528 | 75.1 | 74 | 83 | 65 | 11.6% | 69.8 - 84.5 |
| 1990 | 528 | 74.7 | 77 | 83 | 64 | 14.2% | 69.0 - 86.2 |
| 1994 | 528 | 74.6 | 75 | 82 | 63 | 12.5% | 72.8 - 85.1 |
| 1998 | 704 | 75.6 | 75 | 83 | 62 | 10.9% | 70.3 - 85.2 |
| 2002 | 736 | 75.3 | 77 | 84 | 63 | 16.4% | 68.2 - 88.9 |
| 2006 | 736 | 75.8 | 76 | 83 | 62 | 13.7% | 70.2 - 87.3 |
| 2010 | 736 | 75.2 | 75 | 83 | 62 | 10.1% | 66.7 - 88.3 |
| 2014 | 736 | 76.2 | 76 | 84 | 64 | 13.5% | 72.5 - 88.1 |
| 2018 | 736 | 75.6 | 75 | 84 | 62 | 11.3% | 67.5 - 87.9 |
| 2022 | 830 | 76.0 | 76 | 84 | 62 | 14.5% | 68.8 - 87.5 |
| 2026 | 1248 | 74.5 | 74 | 82 | 61 | 11.9% | 67.9 - 87.1 |

Nothing in the family reaches a mean of 77 or drops below 74, and no field's best XI range
is wider than about 20 points. A new tournament landing outside either is a signal to look
again, not a discovery. **Field size moves the mean**: 2026's 74.5 is the second-lowest in
the file purely because 48 teams reaches further down than 32 ever did, and its floor of 61
is the lowest for the same reason. Expect that, rather than correcting it.

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
- [ ] **The front page's "since <year>" copy** in `src/components/ModeSelect.tsx` - only if
      the drop changes the OLDEST year. A forward drop leaves it alone.
- [ ] **Splice the blocks in and run `validateSquads` BEFORE anything else.** It is the only
      thing that catches one personId carrying two display names, and a forward drop trips
      it on accent drift alone (see section 3).
- [ ] **Check nothing hard-codes the field size.** Nothing did for 2026's 48 teams - the
      checks use `WORLD_CUP_YEARS.length` and the game draws its own group and bracket from
      the pool - but confirm it rather than assuming.
- [ ] **`npm run gen:players`** to regenerate `docs/players.html`; nothing fails while it
      is stale because it is outside the build.
- [ ] **`npm run build`** and **`npm run checks`** (240 checks before the 2026 drop). The
      two that fail on a fresh drop are the collectible seed and the sticker art, and both
      are on this list; anything else failing is a real problem.
- [ ] **Docs:** `CLAUDE.md` (tournament list, row count, album count), `README.md`,
      `docs/ROADMAP.html` item 03.
- [ ] **Commit and push to `main`.** Always, no branch, no PR.

---

## 8. Adding a tournament FORWARDS, and what 2026 taught

This section used to say "2026 has not been played, do not add it". **It was played, 11 June
to 19 July 2026, and it went into the dataset on 2026-08-26.** Spain won it. What follows is
what a forward drop needs that a backward one does not.

**A forward drop is EASIER than a backward one on every axis except identity.** The sources
are richer (section 1d), the matching is exact rather than fuzzy, and the positions are
FIFA's own rather than a reading of a printed line-up. What gets harder is that every player
already in the file is an anchor, and the labels have had years to drift (section 3, scan 4).

1. **The anchor direction inverts back.** For a backward drop every anchor points forward and
   is a decline number for a man at his peak. For a forward drop it is the familiar way
   round: a veteran's new row is a DECLINE from his anchor, a youngster's is his arrival.
   State it to raters in those words either way - it is the single most likely systematic
   error, and it is the one thing that changes sign depending on which end you are adding to.
   2026 had 350 anchored rows out of 1,248, by far the most of any drop.
2. **The ceiling is set by ONE row and everything else hangs off it.** The dataset has
   reached 99 exactly once (Messi 2022). Decide the new tournament's top number FIRST, tell
   every rater what it is, and make the raters of the other groups place their best players
   against it. In 2026 that was Mbappe's Golden Boot; Haaland had no anchor at all, so his
   number had to be set from scratch against Mbappe's and Messi's in other groups' hands.
3. **48 teams is 1,248 rows, half again the biggest previous drop.** Twelve raters over six
   groups of eight, plus six reconcilers. Nothing in the app needed changing for the field
   size - the game draws its own group of four and its own 16-team bracket from the pool, so
   "32 nations" was never assumed anywhere - but the pool grows from 368 squads to 416 and
   the album grows with it.
4. **The tail is longer than the band figures expect.** See the warning in section 5: a
   48-team field reaches down to nations a 32-team one never contained, so the whole-field
   mean lands slightly BELOW the recent 32-team fields rather than matching them.
5. **The other dataset in `docs/players.html` carries a PREDICTED 2026 field** (519 rows, 20
   nations, written before the tournament). Now that the real squads exist the "vs" column
   compares a real squad against a projection for that year. That is worth knowing before
   reading a disagreement there as a rating dispute.

**The 429 budget is the one thing that scales badly.** 1,248 player articles is 50-60
MediaWiki batches. The 2.5s in section 1b is not enough at that size: it took 6s between
batches with a 20s-and-rising backoff to get through, and the retry loop must treat an
EMPTY cache entry as "not fetched" or the next run skips exactly the titles that failed.

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
> 0. **Decide which end you are adding to**, because it changes the sources and inverts the
>    anchor direction. Newer than everything in the file is a FORWARD drop: read section 1d
>    and section 8 and use FIFA's tactical line-ups. Older is a BACKWARD drop: sections 1c
>    and 2, and RSSSF.
> 1. **Fetch the sources** - the Wikipedia squad list (raw wikitext), each player's own
>    article through the MediaWiki API in cached batches, and then either the per-group and
>    per-round match articles (forward) or the RSSSF line-ups (backward). Decode RSSSF as
>    **latin-1**. Use `--ssl-no-revoke` on curl. Reconcile parsed goals against every
>    scoreline before believing any of it.
> 2. **Pre-flight, before any rating work.** Verify every squad's size against
>    planetworldcup and do not assume the nominal number. List the nations that are new to
>    the dataset and what flag and confederation each needs. Run all three identity scans
>    from section 3 - including scan 4, label drift, which is the one a forward drop needs
>    most - and decide every `personId` override and every respelling up front. Then splice
>    a draft in and run `validateSquads`. Report what you found before continuing.
> 3. **Build a per-group dossier** carrying, per player: shirt number, GK/DF/MF/FW, caps,
>    club, the infobox position, prose hints, the appearance line, and any existing dataset
>    row for the same name marked as an ANCHOR. Print the **full RSSSF line-ups verbatim**
>    under each squad and say in the brief that they outrank the appearance line.
> 4. **Rate adversarially.** Two independent raters per group of eight squads, then one
>    reconciler per group working from both proposals plus a mechanical diff. Give every
>    rater the **per-half 81-84 band figures AND the best-XI means** as a self-check up
>    front, saying that the band is a whole-field check you will run yourself and the best-XI
>    mean is the one that holds on eight squads. State the anchor direction explicitly: for a
>    tournament older than the file every anchor points FORWARD, so a later row is a decline
>    number for a man at his peak here; for one newer than the file it is the other way
>    round. Tell them the tournament's ceiling number before they start.
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
