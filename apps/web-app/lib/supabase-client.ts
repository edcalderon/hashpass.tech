import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Only used to hold the session HashPass Auth
 * (QR login) hands back via `supabase.auth.setSession()` -- same "session
 * bridge" pattern the mobile app and Directus OAuth already use, just
 * client-side here since this app is a static export with no server code.
 */
export function supabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'HashPass Auth is not configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing.',
    );
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cachedClient;
}
