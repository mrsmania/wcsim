/** Feature flags. Flip a value to false to disable a feature everywhere quickly. */
export const FEATURES = {
    /** Team chemistry: a cohesion bonus to the user XI's overall rating, plus the
     *  chemistry readouts in the team panel. Set to false to fully disable both the
     *  rating bonus and all chemistry UI. */
    chemistry: true,
    /** 3D tilted pitch: render the draft pitch in perspective with billboarded
     *  player badges. Set to false to fall back to the flat top-down pitch. */
    pitch3d: true,
    /** Remove placed players from the pitch via an x on the badge (testing aid).
     *  Set to false to hide the control and disable removal. */
    removePlayers: true,
} as const;
