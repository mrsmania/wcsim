# Finish the player names, and make both datasets agree

**This file is a prompt.** Paste it whole into Claude Code on a machine where Wikipedia
and RSSSF are reachable, or just say "read `docs/player-names-alignment.md` and do it".
It was written from a cloud session on 2026-08-26 that could not reach any football
source: this environment's egress proxy answers 403 for Wikipedia, RSSSF,
worldfootball, planetworldcup and wikidata alike, so the work below is what is left
after squeezing everything out of the two sources that ARE reachable from there (this
repo's own `src/data/squads.ts`, and `openfootball/world-cup` through GitHub).

Every number in this file is a measurement taken on 2026-08-26 against the tree at that
date. Re-derive them before trusting them.

---

## What you are working on

Two datasets, and one page that reads both:

- **WCS** - `src/data/squads.ts`, the game's own: 8,377 players, 368 squads, 14
  tournaments (1970-2022). This is live game data: `personId` is the name slug, so a
  name is an identity, not a label. Read the rules below before touching it.
- **7a0** - `docs/player-ratings-other-game.csv`, another game's ratings scraped from
  7a0.com.br: 6,864 players, 302 squads, 20 tournaments (1950-2026, the last one a
  predicted field). Reference data only; nothing in the app reads it.
- `docs/players.html` shows both behind a toggle, joins them player for player
  (`scripts/players-page-match.ts`) and prints the rating gap per row. Rebuild it with
  `npm run gen:players`.

## The three jobs

**1. Finish 7a0's short names.** 420 rows still carry a single-token name. Most are
genuine one-name players, but not all - the last pass found and fixed 68, including
Japan 2010's "Nakamura" (Shunsuke, once Kengo was claimed by his own row). What is
left, by tournament:

| where | short rows | of which no WCS counterpart |
| --- | --- | --- |
| 1950-1966 | 101 | 101 |
| 1970-2022 | 288 | 11 |
| 2026 (predicted field) | 31 | 31 |

The 1950-1966 rows and the 2026 rows are the ones a reachable Wikipedia unlocks - no
local source covers them. Of the 288 modern ones, 277 have a WCS counterpart, which
already agrees with the short name for 275 of them, so treat those as aliases unless
Wikipedia says otherwise.

**2. Reconcile the disagreements.** Of the 5,005 players both datasets carry, 4,889 are
spelled identically and about 116 are not. That set is the interesting one, because some
of them are not spellings at all but two different men:

```
1998 ARG   7a0 "Mauricio Pineda"       WCS "Rafael Pineda"
1998 ARG   7a0 "Pablo Paz"             WCS "Fernando Paz"
1998 CRO   7a0 "Petar Krpan"           WCS "Tomislav Krpan"
1998 PAR   7a0 "Danilo Aceval"         WCS "Rubén Aceval"
1994 COL   7a0 "Hermán Gaviria"        WCS "Hernán Gaviria"
1986 BEL   7a0 "Leo Clijsters"         WCS "Lei Clijsters"
1986 URS   7a0 "Pavlo Yakovenko"       WCS "Pavel Yakovenko"
```

Decide each against the squad list, and fix whichever side is wrong. **Do not assume
WCS is right.** Half of this list is WCS being short or wrong; the other half is 7a0
using a different transliteration.

**3. Make the same man read the same in both.** WCS itself has 353 single-token names
and 7 in "X. Surname" form (`H. Lozano`, `A. Estrada`, both 1998 Colombia). Where a
player is a genuine mononym (Pele, Cafu, Rivellino, Dunga) both should keep it. Where
one side has the full name and the other does not, the full name wins.

## Sources, in the order this repo uses them

1. **Wikipedia `<YEAR> FIFA World Cup squads`**, raw wikitext:
   `https://en.wikipedia.org/w/index.php?title=1966_FIFA_World_Cup_squads&action=raw`.
   Names, shirt numbers and the GK/DF/MF/FW split, per squad.
2. **The player's own article**, in batches of 40 through the MediaWiki API
   (`?action=query&prop=revisions&rvsection=0&titles=A|B|C&format=json`), for the
   infobox `fullname` - which is what turns "Nakamura" into "Shunsuke Nakamura".
3. **RSSSF** (`https://www.rsssf.org/tables/66full.html`) for line-ups when a squad list
   is ambiguous. It serves **ISO-8859-1**: decode it as such or every accented name
   loses its data.
4. Already exhausted from here, but free to re-check: `openfootball/world-cup` on
   GitHub (CC0, full squads 1930-2014, `<year>--<host>/squads.txt`).

## Rules that must hold

These are not style preferences. Each one is a bug that has already happened.

- **Match within ONE squad.** A player is only ever identified against the same nation
  at the same tournament - 22 to 26 men, a closed pool. A name on its own is not
  evidence: name-only matching merged 147 pairs of different men, Gerd Muller's 1970
  with Thomas Muller's 2014 among them.
- **Mutual uniqueness.** Take a pair only when this row's sole candidate has no other
  claimant, and drop a claimed player from the pool. That is what stops 7a0's "Paulo
  Cesar Caju" and "Cesar Maluco" both landing on WCS's single "Cesar".
- **Never disambiguate by shirt number.** The two datasets number squads differently:
  7a0's "O. Berg" (Orjan) and WCS's Henning Berg are both #20 in Norway 1994, and they
  are different men. Numbers may confirm, never decide.
- **Never substitute a legal name for an alias.** "Junior" does not become "Leovegildo
  Lins da Gama Junior", and Pele stays Pele. If a man is known by one name, one name is
  the right answer in both datasets.
- **"The file spells this name out in another year" is NOT evidence.** Tried and
  rejected: it wanted 1950's Ademir (Marques de Menezes) to become Ademir da Guia,
  2002's Raul (Gonzalez) to become Raul Albiol, 1986's Michel to become Michel Salgado
  and 2022's Fred to become Fred Guedes. Only 8 of its 30 candidates were the same man.
  Cross-year evidence needs the surname AND a short gap AND a check by hand.
- **Watch surname-first sources.** openfootball gives Turkey 1954's "Akgun" as "Kacmaz
  Akgun" while every other Turkish row in that squad is a given name. When a source's
  order is in doubt, leave the row alone.
- **Two men of the same name in one squad are real.** Serbia named two Mitrovic and two
  Milinkovic-Savic in 2022, Ireland two Kelly in 2002, Brazil two Danilo in the
  predicted 2026 squad. The last one is still in the file as two identical names, on
  purpose.

## Editing the CSV

Only `player_name` may change. Every other cell, the row order and all 6,864 ratings
stay byte for byte identical - assert it after writing, by parsing the old and new files
and comparing every field but that one. The file has no quoted fields today; keep it
that way.

## Editing `src/data/squads.ts` - read this first

A name there is an identity, not a label.

- **`personId` is the slug of the name.** Renaming a player changes who he is: he may
  merge with another person (drafted-once identity) or split from his own other
  appearances. After any rename, re-run the collision and near-miss scans, and add an
  explicit `personId` override (the 5th element of a `Row`) where two different men must
  display the same name - the file already carries several.
- **Same name, same spelling, across tournaments**, or the same man becomes two people.
  `domain/validateSquads.ts` catches one slug with two display names; it is the only
  thing that does.
- **A name change reaches the server seed.** `supabase/seed/collectibles.sql` carries
  the player's name, so a rename of anyone in the 90+ bands means
  `npm run gen:collectibles` and then `npm run push:collectibles` (needs `dkr/.env` and
  LAN/VPN). `npm run checks` fails while the seed is stale.
- Do not touch ratings, positions, shirt numbers or squad membership in this job.

## Verify, then commit

```bash
npm run checks        # 179 checks; also the seed-drift and house-rule guards
npm run gen:players   # rebuilds docs/players.html from both datasets
npm run build
```

Report these, before and after:

- 7a0 rows with a single-token name (was **420**)
- pairs matched by `players-page-match.ts` (was **5,005** of 5,040 in-scope 7a0 rows)
- pairs whose names now agree exactly (was **4,889**)
- rows changed in the CSV, and the assertion that nothing but `player_name` moved
- any squad where two rows ended up with the same name (only Brazil 2026's Danilo pair
  is expected)

Then commit and push to `main`, as this repo always does, with the sources and the
rejected rules written into the message. No em-dashes anywhere.

## Done when

Every 7a0 row that is a bare surname or an initial has its given name, every genuine
mononym is left alone and recorded as such, the ~116 disagreements are each decided
against a squad list, and a player who appears in both datasets reads the same in both.
Where a name could not be settled, say which rows and why, rather than guessing.
