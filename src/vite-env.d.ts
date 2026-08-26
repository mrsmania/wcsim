/// <reference types="vite/client" />

/** Build-time configuration for the optional accounts feature. Absent (a fork, or a
 *  local build with no server) means FEATURES.accounts is off and the app behaves
 *  exactly as the guest-only build. Neither value is a secret: the anon key is
 *  designed to ship in the browser, and row-level security is the real boundary.
 *  See docs/cloud-sync-design.md §11. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** The referee's base URL, e.g. `https://HOST/referee`. Absent means FEATURES.pvp is off
   *  and Versus does not exist in the build - which is what a fork gets, and what a
   *  deployment that has the account server but not the referee gets, deliberately
   *  (docs/pvp-plan.md P46). Not a secret either: every call to it carries the player's own
   *  session token and the referee refuses anything else. */
  readonly VITE_REFEREE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
