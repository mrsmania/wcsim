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
 *  supported now, and a browser that cannot decode it falls back to the flag-and-name
 *  card via the img's onError, same as a missing file.
 *
 *  Base-path aware, so it resolves under '/' in dev and '/wcsim/' on Pages. **Every**
 *  sticker image goes through this: the album detail modal and the home-page legends
 *  each had their own copy of the path, and both broke when the extension changed. */
export const stickerArtSrc = (id: string) => `${import.meta.env.BASE_URL}stickers/${id}.webp`;
