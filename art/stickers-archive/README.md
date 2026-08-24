# Sticker art: archive

**Status: abandoned scope. Keep the images; nothing reads them.**

Recorded 2026-08-24, answering decision D9 of `docs/hygiene-audit.html`. The audit flagged
these 34 files (38 MB) as unreferenced and asked what they are, because CLAUDE.md described
them as "superseded art" and that is not what they are.

## What is actually in here

34 PNGs, 38 MB. Two naming schemes, neither of which is what the pipeline reads:

- **31 files** as `de1974_beckenbauer.png` (code + year + surname).
- **3 files** as `bra-2006-10.png` (the live `player.id` scheme): `arg-2014-10_2.png`,
  `bra-2006-10.png`, `bra-2022-10.png`. Only these three could ever have been build inputs,
  and the first is a `_2` variant, so it never was one either.

Tournaments covered: 1974 (3), 1978 (3), 1982 (3), 1986 (3), 1990 (3), 1994 (2), 1998 (3),
2010 (1), 2014 (4), 2018 (3), 2022 (3).

**1974, 1978, 1982 and 1986 are not in the dataset at all** (`src/data/squads.ts` covers
1990-2022), which is what makes this an abandoned scope rather than superseded versions of
current cards.

## Why it stays

Two reasons, and neither is sentiment:

1. **Roadmap item 03 wants these tournaments.** Extending the dataset backwards is a live
   roadmap entry, and 15 of these files are art for exactly those years. Deleting them means
   redoing that work later.
2. **Deleting them would not shrink the repo anyway.** They are already in git history, so a
   `git rm` shrinks the working tree and leaves the 38 MB in the pack. The only thing that
   would reclaim it is rewriting history, which is out of scope and not worth it.

## What NOT to do with it

- **Do not point the build pipeline here.** `scripts/build-sticker-art.py` reads
  `art/stickers-src/` only, and that directory is exactly in sync with the dataset (81 files,
  81 collectibles, zero orphans either way). Adding these would break that invariant.
- **Do not move it under `public/`.** Nothing in `art/` is deployed, which is the point: the
  sources average 1.3 MB against ~40 KB shipped per card.
- **Do not treat the filenames as usable.** If a future tournament wave adopts one of these
  images, it needs renaming to the `player.id` scheme (`<code>-<year>-<number>.png`) and
  running through the pipeline, like any other source file.

## If you are here to reclaim disk

You are in the wrong place: `art/stickers-src/` is 102 MB against this directory's 38 MB, and
it is load-bearing. Neither ships.
