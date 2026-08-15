import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;
let testClientOverride: SupabaseClient | null = null;

// Lazily created and cached per Lambda execution environment (not per
// request) -- Lambda reuses the same process across invocations, so
// creating a fresh client on every call would waste the connection-setup
// cost on every single request.
export function adminDb(): SupabaseClient {
  if (testClientOverride) return testClientOverride;
  if (cachedAdminClient) return cachedAdminClient;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('HashPass Links API is not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.');
  }

  cachedAdminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdminClient;
}

// Test-only dependency injection: route/router tests use a fake Supabase
// client instead of ever touching a real database or network.
export function setAdminDbForTesting(client: SupabaseClient | null): void {
  testClientOverride = client;
}

// Exposed for tests to reset the cached (real) client between profiles.
export function resetAdminDbCache(): void {
  cachedAdminClient = null;
}

export function apiError(message: string, status = 400): Response {
  return Response.json({ message }, { status });
}

export async function authenticatedUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data } = await adminDb().auth.getUser(token);
  return data.user ?? null;
}
