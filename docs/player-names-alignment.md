# Aligning the player names across the two datasets

**This job is DONE (2026-08-26).** The file was written as a prompt to be run on a machine
that could reach Wikipedia and RSSSF, which the cloud session that wrote it could not; it is
kept as the record of what was done, what it cost, and what is still open. The reusable
parts - which source decides a name, and how a rename can break an identity - are summarised
in `CLAUDE.md` under "The second dataset, and the toggle". Do not run this file as a prompt
again.

Every figure below was measured on 2026-08-26. Re-derive rather than trusting them.

---

## What moved

| | before | after |
| --- | --- | --- |
| 7a0 rows with a single-token name | 421 | 417 |
| rows in "X. Surname" form (either dataset) | 15 | 0 |
| pairs matched by `players-page-match.ts` | 5,005 | 5,017 |
| pairs whose names agree exactly | 4,889 | 5,016 |
| pairs that disagree | 116 | **1** |
| in-scope 7a0 rows with no counterpart | 35 | 23 |
| squads with two rows of the same name | 1 | **0** |

89 `player_name` cells changed in `docs/player-ratings-other-game.csv` and 80 names in
`src/data/squads.ts`. Asserted after writing, by parsing both files before and after: in the
CSV nothing but `player_name` moved, the row order held and all 6,864 ratings are byte
identical; in the dataset all 8,377 rows kept their player id, shirt number, rating,
positions, squad membership and order.

## The rule that settled it

**The Wikipedia squad list's DISPLAY name decides.** It is the only source that separates a
genuine mononym from a bare surname: it renders "Leao", "Pele", "Zague" and "Bremer", and it
renders "Juninho Paulista", "Harold Lozano" and "Rubén Ruiz Díaz". Two qualifications, both
of which changed an answer here:

- **Piped beats unpiped.** `[[Article|Display]]` is an editorial statement of the common
  name; a bare `[[Article]]` is only the article title. So Brazil 2018's `[[Alisson Becker]]`
  did **not** make "Alisson" wrong - and the 2026 article, which pipes
  `[[Alisson Becker|Alisson]]`, settles it. Same for Cameroon's Nouhou.
- **Wikipedia is the tie-breaker, not an override.** The two datasets agreeing, and each
  staying internally consistent across tournaments, comes first. Wikipedia contradicts itself
  between years - Leo Clijsters (1986) against Lei Clijsters (1990), Émile Mbouh (1990)
  against Emile M'Bouh (1994), Caju (1970) against Paulo Cézar (1974) - so following it row
  by row would have split three men in two. Where it does, the canonical article title (the
  one the others redirect to) breaks the tie.

## What a rename costs in `squads.ts`

`personId` is the slug of the name, so a rename can **split** one man across tournaments or
**merge** two different men. Both scans were run over every proposed rename before any was
applied.

- **Seven merges were the point.** Bremer, Sol Bamba, Roman Bürki, Freddie Ljungberg, Harold
  Lozano, Jorge Luis Campos and Paulo Cézar Caju had each been recorded as two people,
  because the dataset spelled the same man differently in two tournaments.
- **One was a real collision.** Colombia's Carlos Sánchez and Uruguay's Carlos Sánchez are
  different men who both played in 2018; the Uruguayan now carries `carlos-sanchez-uru`, the
  way the two "Luis Marín" and `carlos-aguilera-esp` already do.
- **Sixteen overrides went.** The `<surname>-<nation>-1998` ids existed only because a row
  displayed a bare surname. With the full names in place, two of them
  (`okafor-nga-1998`, `sarabia-par-1998`) were splitting a man from his own other appearance,
  and the other fourteen asserted a namesake that does not exist.

## Rules that must hold (each one is a bug that has happened)

- **Match within ONE squad.** A name on its own is not evidence: name-only matching merged
  147 pairs of different men, Gerd Muller's 1970 with Thomas Muller's 2014 among them.
- **Mutual uniqueness.** Take a pair only when this row's sole candidate has no other
  claimant. That is what stopped 7a0's "Paulo César Caju" and "César Maluco" from both
  landing on WCS's single "César".
- **Never disambiguate by shirt number.** 7a0's "Ø. Berg" (Ørjan) and WCS's Henning Berg are
  both #20 in Norway 1994 and are different men. Numbers may confirm, never decide.
- **Never substitute a legal name for an alias.** Zague stays Zague, Pelé stays Pelé.
  94 of the 101 pre-1970 single-token rows were genuine one-name players and were left alone.
- **"The file spells this token out in another year" is NOT evidence.** Tried and rejected in
  the second pass: it wanted 1950's Ademir to become Ademir da Guia and 2022's Fred to become
  Fred Guedes.
- **Try the fetch before believing it is blocked.** The whole reason this file exists is that
  a cloud session got 403 from every football source. From a local session Wikipedia's raw
  wikitext, the MediaWiki API and RSSSF all answer.

## What is still open, and why

- **CIV 2010, "Emmanuel Koné" against "Bakari Koné"** - the one remaining disagreement, and
  it is not a name. Wikipedia and 7a0 have Emmanuel Koné at #14; WCS has Bakari Koné, who is
  a different man (and legitimately in WCS's 2006 squad). Ivory Coast 2010 also has WCS
  carrying Abdoulaye Méïté where the official squad has Kader Keïta. That is **squad
  membership**, which this job deliberately did not touch.
- **MAR 2018 "Baaha"** - the only row that could not be settled. It sits at #15 in 7a0's
  Morocco list, which is a provisional squad (it also carries Badr Benoun, and lacks Aït
  Bennasser and En-Nesyri). No footballer of that name active in 2018 has an article on
  English or French Wikipedia. Left as written rather than guessed.
- **The 23 unmatched in-scope 7a0 rows are correct.** Each is a player 7a0 lists who was not
  in the final squad: Higuita (Colombia 1994), Benzema (France 2022), Vestergaard (Denmark
  2022), Astori (Italy 2014), Sergio Rico (Spain 2018) and so on. They now carry full names
  and simply have no counterpart.
- **Three 2026 rows trade one error for a smaller one.** Brazil's 2026 squad contains two
  Édersons and two Danilos, which 7a0 recorded as identical names, so its
  name-within-a-nation identity model read each pair as one man. They are now "Ederson
  Moraes" / "Éderson Silva" and "Danilo Luiz" / "Danilo Santos", following the Wikipedia
  squad list, which is what a real 2026 article now provides. The cost: Ederson Moraes and
  Danilo Luiz also appear in 7a0's 2022 squad as plain "Ederson" and "Danilo", so each now
  reads as two people rather than one. Merging two different men is the worse error of the
  two, and the page's footer already says the grouping is not exact.

## Sources, in the order this repo uses them

1. **Wikipedia `<YEAR> FIFA World Cup squads`**, raw wikitext:
   `https://en.wikipedia.org/w/index.php?title=1966_FIFA_World_Cup_squads&action=raw`.
   Names, shirt numbers and the GK/DF/MF/FW split, per squad. All nineteen tournaments
   1950 to 2026 parse from two templates: `{{nat fs player}}` and, for 2006 and 2014 only,
   `{{National football squad player}}`.
2. **The player's own article**, in batches through the MediaWiki API
   (`?action=query&prop=revisions&rvsection=0&titles=A|B|C&format=json`), for the infobox
   `fullname`, birth year and position. `&redirects=1` is what says which of two spellings
   is canonical.
3. **RSSSF** (`https://www.rsssf.org/tables/66full.html`) for line-ups when a squad list is
   ambiguous. It serves **ISO-8859-1**: decode it as such or every accented name loses its
   data.
4. `openfootball/world-cup` on GitHub (CC0, full squads 1930-2014).

Note that node's `fetch` fails here with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` unless it is
given `NODE_OPTIONS=--use-system-ca`; `curl` needs `--ssl-no-revoke`.

## After a name change

```bash
npm run gen:collectibles   # a 90+ player's name is carried in the server seed
npm run push:collectibles  # needs dkr/.env and LAN/VPN
npm run checks             # 179 checks, including the seed-drift guard
npm run gen:players        # rebuilds docs/players.html from both datasets
npm run build
```

This pass renamed exactly one collectible (Preben Elkjær Larsen to Preben Elkjær, 90), so
the seed changed by one row and was regenerated and pushed. His player id is unchanged, so
no album was affected.
