import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FEATURES, SUPABASE } from '../config';

// ---------------------------------------------------------------------------
// Sign-in, and nothing else. One email field, a 6-digit code, and you are in -
// the same flow whether it is a first visit or a return, so there is no separate
// "register" step. Passwords are never involved.
//
// The client library is only imported by this module and remoteStore.ts, both of
// which are loaded dynamically, so a guest never downloads it.
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;

/** The Supabase client, created once. Throws when no server is configured, which
 *  callers avoid by checking FEATURES.accounts first. */
export function supabase(): SupabaseClient {
  if (!FEATURES.accounts) {
    throw new Error('accounts are off: no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
  if (!client) {
    client = createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: {
        // Tokens live in localStorage and are refreshed in the background; the
        // session is expected to last (60 days server-side, FR-7).
        persistSession: true,
        autoRefreshToken: true,
        // Nothing in this app arrives back through a URL fragment (no OAuth yet).
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export interface Account {
  id: string;
  email: string;
}

/** The signed-in account, or null. Cheap: reads the stored session, no round trip. */
export async function currentAccount(): Promise<Account | null> {
  if (!FEATURES.accounts) return null;
  const { data } = await supabase().auth.getSession();
  const user = data.session?.user;
  return user?.email ? { id: user.id, email: user.email } : null;
}

/** Email a 6-digit code. Creates the account on first use (open registration), so
 *  the caller does not distinguish sign-in from sign-up. */
export async function requestCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

/** Exchange a code for a session. Returns the account it belongs to. */
export async function submitCode(email: string, code: string): Promise<Account> {
  const { data, error } = await supabase().auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user?.email) throw new Error('signed in but the account has no email');
  return { id: user.id, email: user.email };
}

/** Sign out on this device, or everywhere (FR-7, revokes every session). */
export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  const { error } = await supabase().auth.signOut({ scope });
  if (error) throw new Error(error.message);
}

/**
 * Delete the account and everything in it (FR-24). Irreversible: the server removes
 * the auth user, and every table cascades from it - album, career, run history, the
 * lot. Guest data in this browser is a separate world (D8) and is untouched.
 *
 * The local session is dropped afterwards on a best-effort basis: the token it would
 * use has just been invalidated server-side, so a failure there is expected and not
 * worth surfacing.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().rpc('delete_account');
  if (error) throw new Error(error.message);
  await supabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
}
