# Sticker art still to draw

Measured 2026-08-27 against the dataset and `public/stickers/`. **Every figure here goes
out of date the moment art is added or a rating crosses a `STICKER_TIERS` boundary**, so
re-derive it rather than trusting it: `npm run checks` prints the count, and the album
shows the gaps as silhouettes.

**115 collectibles, 81 with artwork, 34 missing** (3 Monumental, 6 Iconic, 25 Legendary).

Three men need two cards each, because a card is one player at one tournament and their
ratings differ: Beckenbauer (1970 and 1974), Gerd Muller (1970 and 1974) and Platini
(1982 and 1986).

| Player | No. | Nation | World Cup | Rating | Tier | File to add |
| --- | --- | --- | --- | --- | --- | --- |
| Diego Maradona | 10 | Argentina | 1986 | 98 | Monumental | `arg-1986-10.webp` |
| Kylian Mbappé | 10 | France | 2026 | 97 | Monumental | `fra-2026-10.webp` |
| Pelé | 10 | Brazil | 1970 | 97 | Monumental | `bra-1970-10.webp` |
| Johan Cruyff | 14 | Netherlands | 1974 | 95 | Iconic | `ned-1974-14.webp` |
| Erling Haaland | 9 | Norway | 2026 | 94 | Iconic | `nor-2026-9.webp` |
| Lionel Messi | 10 | Argentina | 2026 | 94 | Iconic | `arg-2026-10.webp` |
| Gerd Müller | 13 | Germany | 1970 | 93 | Iconic | `ger-1970-13.webp` |
| Lamine Yamal | 19 | Spain | 2026 | 93 | Iconic | `esp-2026-19.webp` |
| Rodri | 16 | Spain | 2026 | 93 | Iconic | `esp-2026-16.webp` |
| Alain Giresse | 12 | France | 1982 | 92 | Legendary | `fra-1982-12.webp` |
| Franz Beckenbauer | 5 | Germany | 1974 | 92 | Legendary | `ger-1974-5.webp` |
| Jude Bellingham | 10 | England | 2026 | 92 | Legendary | `eng-2026-10.webp` |
| Vinícius Júnior | 7 | Brazil | 2026 | 92 | Legendary | `bra-2026-7.webp` |
| Jairzinho | 7 | Brazil | 1970 | 91 | Legendary | `bra-1970-7.webp` |
| Mario Kempes | 10 | Argentina | 1978 | 91 | Legendary | `arg-1978-10.webp` |
| Michel Platini | 10 | France | 1982 | 91 | Legendary | `fra-1982-10.webp` |
| Paolo Rossi | 20 | Italy | 1982 | 91 | Legendary | `ita-1982-20.webp` |
| Achraf Hakimi | 2 | Morocco | 2026 | 90 | Legendary | `mar-2026-2.webp` |
| Bobby Moore | 6 | England | 1970 | 90 | Legendary | `eng-1970-6.webp` |
| Emilio Butragueño | 9 | Spain | 1986 | 90 | Legendary | `esp-1986-9.webp` |
| Franz Beckenbauer | 4 | Germany | 1970 | 90 | Legendary | `ger-1970-4.webp` |
| Gary Lineker | 10 | England | 1986 | 90 | Legendary | `eng-1986-10.webp` |
| Gerd Müller | 13 | Germany | 1974 | 90 | Legendary | `ger-1974-13.webp` |
| Ihor Belanov | 19 | Soviet Union | 1986 | 90 | Legendary | `urs-1986-19.webp` |
| Johan Neeskens | 13 | Netherlands | 1974 | 90 | Legendary | `ned-1974-13.webp` |
| Karl-Heinz Rummenigge | 11 | Germany | 1982 | 90 | Legendary | `ger-1982-11.webp` |
| Kazimierz Deyna | 12 | Poland | 1974 | 90 | Legendary | `pol-1974-12.webp` |
| Michel Platini | 10 | France | 1986 | 90 | Legendary | `fra-1986-10.webp` |
| Ousmane Dembélé | 7 | France | 2026 | 90 | Legendary | `fra-2026-7.webp` |
| Preben Elkjær | 10 | Denmark | 1986 | 90 | Legendary | `den-1986-10.webp` |
| Rob Rensenbrink | 12 | Netherlands | 1978 | 90 | Legendary | `ned-1978-12.webp` |
| Thibaut Courtois | 1 | Belgium | 2026 | 90 | Legendary | `bel-2026-1.webp` |
| Zbigniew Boniek | 20 | Poland | 1982 | 90 | Legendary | `pol-1982-20.webp` |
| Zico | 10 | Brazil | 1982 | 90 | Legendary | `bra-1982-10.webp` |

The file name is the player id, and the pipeline is the one in `CLAUDE.md`: drop the
full-size PNG in `art/stickers-src/<id>.png` and run
`python scripts/build-sticker-art.py`, which writes the 400px WebP into
`public/stickers/`. A card with no file shows the shared silhouette rather than a hole,
and `npm run checks` fails on a missing file unless its id is in `KNOWN_MISSING_ART`.
