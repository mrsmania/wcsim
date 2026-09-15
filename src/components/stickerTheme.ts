// The sticker rarity ramp: the tier identity, its ordering, the gold-foil accents and
// the path to a card's artwork.
//
// This used to live in StickerCard.tsx, which turned that component into a de-facto
// token module: eleven other files imported from it, ten of them wanting only these
// values and never the card. Two of those ten are not even about stickers - the boost
// rarity ramp reuses the accents (cupRun/types.ts) and the read-only squad browser
// marks collectibles with them - so "import the sticker card to colour a boost" was
// the shape of the problem.
//
// Not in domain/: these are hexes and a bundler-resolved URL, so they are presentation.
// A tier's *membership* (which rating is which tier) is the domain's job and lives in
// config.ts STICKER_TIERS + domain/album.ts tierOf; this file only says what a tier
// LOOKS like.

import type { CSSProperties } from 'react';
import type { StickerTier } from '../config';

/** Tier identity for the sticker cards. These accents are the sticker rarity ramp
 *  (green -> amber -> gold foil), deliberately fixed rather than theme-swapped.
 *  `order` sorts the album Monumental-first (spec 5.4).
 *
 *  `ink` IS THE SAME TIER AS TEXT, and it is a different value from `accent` on purpose -
 *  the exact split `--color-amber-ink` and its two siblings exist for. `accent` is right
 *  for a surface (the strip, a pip) and fails AA outright as a small label: on paper the
 *  gold measures 2.57 and the amber 2.49 against the 4.5 a 9px bold word needs, the
 *  relaxed 3:1 being for 18.66px and larger. It is spent as a CLASS rather than a hex
 *  because an `-ink` token flips between the themes and a hex in this map cannot.
 *
 *  The boost library reached this first (`cupRun/types.ts` RARITY_INK, whose docstring
 *  carries the measurements); the album card was still printing its tier name in the raw
 *  accent at 8.5px, which is the same failure one point smaller.
 *
 *  `strip` IS ALWAYS A GRADIENT, INCLUDING THE FLAT TWO, and that is load-bearing rather
 *  than a flourish. The field's job is "the tier's band as a paintable fill", and the two
 *  lower rungs used to hold a bare hex - which is a fine `background` shorthand and is NOT
 *  a valid `background-image`, so it computes to `none`. `tierTopStrip` below paints the
 *  band as an image (it has to: the top rung is a foil), and with a bare hex two cards in
 *  three came out with no band at all and nothing said so. A gradient of one colour twice
 *  paints identically to the flat colour and is valid in both positions, so every rung
 *  goes through one mechanism. `cupRun/types.ts` RARITY_STRIP reached the same conclusion
 *  from the other side and wraps its own flat two; now that the values arrive already
 *  wrapped, that map can simply read `TIER_META[...].strip` for all three. */
export const TIER_META: Record<
  StickerTier,
  { name: string; accent: string; ink: string; strip: string; stripText: string }
> = {
  monumental: {
    name: 'Monumental',
    accent: '#c99a3a',
    ink: 'text-gold-ink',
    strip: 'linear-gradient(135deg,#f0cf8a,#c99a3a)',
    stripText: '#3a2a06',
  },
  iconic: {
    name: 'Iconic',
    accent: '#e4922b',
    ink: 'text-amber-ink',
    strip: 'linear-gradient(#e4922b,#e4922b)',
    stripText: '#ffffff',
  },
  legendary: {
    name: 'Legendary',
    accent: '#15924c',
    ink: 'text-pitch-ink',
    strip: 'linear-gradient(#15924c,#15924c)',
    stripText: '#ffffff',
  },
};

/** The 3px band across the top of a sticker card, which is the album's rendering of the
 *  same mark a boost tile wears on `/career` (`cupRun/rarityUi.rarityStrip`).
 *
 *  A BACKGROUND IMAGE AND NOT A BORDER COLOUR, which is the whole point of the change: a
 *  border takes one flat colour, so the top tier could only ever be a flat #c99a3a line,
 *  and the FOIL - the metallic sweep a Monumental sticker already wears on its rating
 *  block - is what tells the two warm rungs apart at a glance. Monumental and Iconic as
 *  flat accents are eight degrees of hue apart and read as one colour, which is the
 *  reading the boost library was rebuilt on and which the album card had not had.
 *
 *  THE 3px TOP BORDER IS KEPT AND MADE TRANSPARENT rather than removed. It still reserves
 *  its three pixels, so the card's layout is unchanged to the pixel and a card cannot
 *  change height by wearing a different tier; `background-origin: border-box` then starts
 *  the band at the very top of the border box, so the strip lands exactly where the solid
 *  border used to be and the card's own radius still clips its corners. The other three
 *  sides keep their own colour and, on an uncollected card, their dashes.
 *
 *  It does not share `rarityStrip`'s body, and deliberately: that one paints onto a tile
 *  which reserves nothing, so it needs neither the transparent border nor `border-box`.
 *  What the two share is the thing that matters, which is `TIER_META[...].strip` - the
 *  values, not the mechanism. */
export function tierTopStrip(tier: StickerTier): CSSProperties {
  return {
    borderTopWidth: '3px',
    borderTopStyle: 'solid',
    borderTopColor: 'transparent',
    backgroundImage: TIER_META[tier].strip,
    backgroundSize: '100% 3px',
    backgroundRepeat: 'no-repeat',
    backgroundOrigin: 'border-box',
  };
}

/** The tiers Monumental-first, which is the order the album lays its sections out in and
 *  the order the reward picker offers them.
 *
 *  Re-exported from `config`, which is where the one named ordering lives. It used to be
 *  derived HERE by sorting `Object.keys(TIER_META)` on a per-tier `order` field, so the
 *  codebase carried two undeclared orderings of the same three tiers and a cast to recover
 *  the key type (hygiene H150). `TIER_META` no longer has an `order`. */
export { STICKER_TIER_ORDER as TIER_ORDER } from '../config';

/** The gold-foil ramp of the top tier (Monumental), reused wherever a "best/complete"
 *  gold treatment is needed (album-complete banner, the won ladder cup node). Single
 *  source of the three values so they never drift apart. */
export const GOLD_ACCENT = TIER_META.monumental.accent;
export const GOLD_FOIL = TIER_META.monumental.strip;
export const GOLD_INK = TIER_META.monumental.stripText;

/** Card art, as shipped: small WebP built from the originals in `art/stickers-src/`
 *  by `scripts/build-sticker-art.py`. WebP only, deliberately - it is universally
 *  supported now, and a browser that cannot decode it lands on the placeholder below,
 *  same as a missing file.
 *
 *  Base-path aware, so it resolves under '/' in dev and '/wcsim/' on Pages. **Every**
 *  sticker image goes through this: the album detail modal and the home-page legends
 *  each had their own copy of the path, and both broke when the extension changed. */
export const stickerArtSrc = (id: string) => `${import.meta.env.BASE_URL}stickers/${id}.webp`;

/** Shown in place of a card whose artwork has not been drawn yet. A collectible arrives
 *  the moment a rating crosses a `STICKER_TIERS` boundary, so the dataset can always run
 *  ahead of the art (`npm run checks` counts the gap); before this, every such card just
 *  collapsed its image box and the album grid grew a hole.
 *
 *  A data URI rather than a component, so the three call sites keep their own very
 *  different layouts (grid thumb, lightbox hero, home-page showcase) and each needs one
 *  line. **Transparent background on purpose**: the card's own surface shows through,
 *  which is what makes one fixed silhouette work in both themes. Drawn on the same
 *  400x600 canvas as the real art, with the head high enough to survive
 *  `ART_VISIBLE_FRACTION` cropping the bottom half away. */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">' +
  '<g fill="#8a8f96" fill-opacity="0.35">' +
  '<circle cx="200" cy="170" r="72"/>' +
  '<path d="M200 262c-78 0-141 50-141 112v226h282V374c0-62-63-112-141-112z"/>' +
  '</g></svg>';

export const STICKER_PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/** Swap a failed sticker image for the placeholder. The `data-fallback` flag stops an
 *  error loop if the placeholder itself ever fails to decode. Shared so every call site
 *  fails the same way. (A plain handler, not a hook - it runs inside onError.) */
export function onStickerArtError(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  img.src = STICKER_PLACEHOLDER_SRC;
}
