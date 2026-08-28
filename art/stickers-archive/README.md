# Sticker art: archive

**Status: four files were adopted on 2026-08-28 and are gone from here. The other 30 stay;
nothing reads them.**

Recorded 2026-08-24, answering decision D9 of `docs/hygiene-audit.html`. The audit flagged
these files as unreferenced and asked what they are, because CLAUDE.md described them as
"superseded art" and that is not what they are.

## What was adopted, and why that became possible

The original entry said "1974, 1978, 1982 and 1986 are not in the dataset at all", which was
true when it was written and is not any more: the dataset now covers **1970 to 2026**, so
four of these images are art for cards the album actually shows. Renamed to the `player.id`
scheme and run through `scripts/build-sticker-art.py`, exactly as the last section of this
file said to do:

| Was | Is now | Card |
| --- | --- | --- |
| `ar1978_kempes.png` | `art/stickers-src/arg-1978-10.png` | Mario Kempes, Argentina 1978 (Legendary) |
| `de1974_beckenbauer.png` | `art/stickers-src/ger-1974-5.png` | Franz Beckenbauer, Germany 1974 (Monumental) |
| `de1974_mueller.png` | `art/stickers-src/ger-1974-13.png` | Gerd Muller, Germany 1974 (Legendary) |
| `it1982_rossi.png` | `art/stickers-src/ita-1982-20.png` | Paolo Rossi, Italy 1982 (Iconic) |

Each was checked by eye against the player it was matched to before being moved: the era's
kit, and the shirt number on the shorts where the art shows one (5 for Beckenbauer, 13 for
Muller, 10 for Kempes). A surname in a filename is not proof of identity, and two men in this
directory share one (`de1974_mueller` and `de2014_mueller`).

**`ar1986_maradona.png` was a fifth candidate and stayed**, because new artwork for that card
was drawn on the same day and shipped first. The two are different renderings; the newer one
won on being the newer one, and nothing here is deleted for losing.

## What is left, and why none of it is usable as-is

30 PNGs, 33 MB, in two naming schemes, neither of which is what the pipeline reads:

- **27 files** as `de1990_matthaeus.png` (code + year + surname).
- **3 files** as `bra-2006-10.png` (the live `player.id` scheme): `arg-2014-10_2.png`,
  `bra-2006-10.png`, `bra-2022-10.png`. Only these three could ever have been build inputs,
  and the first is a `_2` variant, so it never was one either.

Measured 2026-08-28, every remaining file falls into one of two groups:

- **18 are players who are not collectible**, and so have no card to fill: their rating sits
  below the Legendary floor of 90. Ardiles, Passarella, Burruchaga, Valdano, Alvarez, Mac
  Allister, Dunga, Ronaldinho 2006, Breitner, Brehme, Klinsmann, Schweinsteiger, Puyol,
  Desailly, Henry 1998, Kante, Collovati and Tardelli. A rating tweak could bring any of them
  in, which is the one thing that would make this directory worth re-reading.
- **12 are second renderings of cards that already ship art**: Maradona 1986, Messi 2022, the
  Messi 2014 `_2` variant, Bebeto, Neymar 2022, Matthaus, Kroos, Lahm, Thomas Muller, Zidane,
  Griezmann and Mbappe 2018. Nothing is broken about them; the card is simply already drawn,
  and swapping one in is a taste decision rather than a gap being filled.

## Why it stays

**Deleting it would not shrink the repo.** These files are already in git history, so a
`git rm` shrinks the working tree and leaves the 33 MB in the pack. The only thing that would
reclaim it is rewriting history, which is out of scope and not worth it.

## What NOT to do with it

- **Do not point the build pipeline here.** `scripts/build-sticker-art.py` reads
  `art/stickers-src/` only, and every file in there is named for a collectible. Adding these
  would break that, and an orphan WebP under `public/stickers/` is a hard failure in
  `npm run checks`.
- **Do not move it under `public/`.** Nothing in `art/` is deployed, which is the point: the
  sources average 1.3 MB against ~40 KB shipped per card.
- **Do not treat the filenames as usable.** Adopting one means renaming it to the
  `player.id` scheme (`<code>-<year>-<number>.png`), running the pipeline, and dropping the
  id from `KNOWN_MISSING_ART` in `scripts/checks/assets.ts`, which fails while it lists a
  card that has since gained art. That is the whole of the procedure the four above went
  through.

## If you are here to reclaim disk

You are in the wrong place: `art/stickers-src/` is 110 MB against this directory's 33 MB, and
it is load-bearing. Neither ships.
