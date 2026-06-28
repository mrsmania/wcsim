/** Feature flags. Flip a value to false to disable a feature everywhere quickly. */
export const FEATURES = {
  /** Team chemistry: a cohesion bonus to the user XI's overall rating, plus the
   *  chemistry readouts in the team panel. Set to false to fully disable both the
   *  rating bonus and all chemistry UI. */
  chemistry: true,
} as const;
