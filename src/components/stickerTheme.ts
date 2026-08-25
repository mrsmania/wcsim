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

import type { StickerTier } from '../config';

/** Tier identity for the sticker cards. These accents are the sticker rarity ramp
 *  (green -> amber -> gold foil), deliberately fixed rather than theme-swapped.
 *  `order` sorts the album Monumental-first (spec 5.4). */
export const TIER_META: Record<
  StickerTier,
  { name: string; accent: string; strip: string; stripText: string; order: number }
> = {
  monumental: {
    name: 'Monumental',
    accent: '#c99a3a',
    strip: 'linear-gradient(135deg,#f0cf8a,#c99a3a)',
    stripText: '#3a2a06',
    order: 0,
  },
  iconic: { name: 'Iconic', accent: '#e4922b', strip: '#e4922b', stripText: '#ffffff', order: 1 },
  legendary: { name: 'Legendary', accent: '#15924c', strip: '#15924c', stripText: '#ffffff', order: 2 },
};

/** The tiers Monumental-first, which is the order the album lays its sections out in
 *  and the order the reward picker offers them. Derived from `order` rather than typed
 *  out, so the ramp is declared once - AlbumScreen used to derive this itself, which is
 *  what made it reach into StickerCard for TIER_META in the first place. */
export const TIER_ORDER = (Object.keys(TIER_META) as StickerTier[]).sort(
  (a, b) => TIER_META[a].order - TIER_META[b].order,
);

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
