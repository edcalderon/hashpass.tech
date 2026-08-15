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

let verifyClientFactoryOverride: (() => SupabaseClient | null) | null = null;

// Builds a fresh, uncached Supabase client for issueSessionForUser()'s
// verifyOtp() call -- deliberately never adminDb()'s cached instance. See
// the comment in packages/backend/src/auth-qr/session.ts for why: verifying
// an OTP mutates whatever client performs it, and mutating the cached admin
// client would leave a warm Lambda authenticated as the end user instead of
// the service role for every later request.
export function createVerifyClient(): SupabaseClient | null {
  if (verifyClientFactoryOverride) return verifyClientFactoryOverride();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Test-only dependency injection for createVerifyClient() above.
export function setVerifyClientFactoryForTesting(factory: (() => SupabaseClient | null) | null): void {
  verifyClientFactoryOverride = factory;
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
