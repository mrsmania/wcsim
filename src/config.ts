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
} as const;
