import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { supabasePublishableKey, supabaseUrl } from './env';

/** Client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Privileged client. Server only, never returned to the browser.
 * Used only for PIN login rate limiting (public.pin_login_*).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Missing environment variable SUPABASE_SECRET_KEY.');
  return createSupabaseClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Current user + app_user row, or null. Uses getUser() (verified), not getSession(). */
export async function getCurrentAppUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('app_user')
    .select('id, name, roles, holder_id, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data as { id: string; name: string; roles: Role[]; holder_id: string | null; is_active: boolean };
}

export type Role = 'admin' | 'produksi' | 'penjahit' | 'finishing' | 'supervisor';
