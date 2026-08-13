/// <reference types="vite/client" />

/** Build-time configuration for the optional accounts feature. Absent (a fork, or a
 *  local build with no server) means FEATURES.accounts is off and the app behaves
 *  exactly as the guest-only build. Neither value is a secret: the anon key is
 *  designed to ship in the browser, and row-level security is the real boundary.
 *  See docs/cloud-sync-design.md §11. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
