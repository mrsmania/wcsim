/** Feature flags. Flip a value to false to disable a feature everywhere quickly. */
export const FEATURES = {
    /** Team chemistry: a cohesion bonus to the user XI's overall rating, plus the
     *  chemistry readouts in the team panel. Set to false to fully disable both the
     *  rating bonus and all chemistry UI. */
    chemistry: true,
    /** Remove placed players from the pitch via an x on the badge (testing aid).
     *  Off by default; set to true to show the control and enable removal. */
    removePlayers: false,
    /** Show each team's rating as a small chip next to it (desktop only). Set to
     *  false to hide all the rating chips everywhere. */
    teamRatings: true,
    /** Squad & World Cup browser: a read-only reference view (reached from the
     *  masthead) to look through every nation's squad from any tournament. Set to
     *  false to hide the masthead toggle and the whole browse view. */
    squadBrowser: true,
    /** Sticker album: a persistent Panini-style collection of the elite players
     *  (elo within STICKER_TIERS) you draft across runs. Gates the album screen,
     *  the run-end sticker summary, the cup-win reward pick, the draft collectible
     *  markers, and the swap control. Set to false to hide all of it (and skip the
     *  album localStorage reads/writes). */
    stickerAlbum: true,
} as const;

/** Collectible sticker tiers, by player `elo` (inclusive on both ends). The single
 *  source of the "who is collectible" rule - a player is collectible iff their elo
 *  falls in one of these ranges. Tune here without touching game logic. */
export const STICKER_TIERS = {
    legendary: { min: 90, max: 92 },
    iconic: { min: 93, max: 96 },
    monumental: { min: 97, max: 99 },
} as const;

/** The canonical tier union used across the codebase. */
export type StickerTier = keyof typeof STICKER_TIERS;

/** Trade-in cost: how many duplicates (any tier/mix) buy one sticker of that tier
 *  (the player then picks from up to 3 uncollected options). First-guess values;
 *  see `wcsim_album_stats_v1` telemetry to calibrate. */
export const STICKER_TRADE_COST: Record<StickerTier, number> = {
    legendary: 10,
    iconic: 20,
    monumental: 50,
} as const;
