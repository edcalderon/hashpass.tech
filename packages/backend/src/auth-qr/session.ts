import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailOtpType } from '@supabase/auth-js';

// Issues a real Supabase session for a user who has already been verified
// through a different flow (here: an approved QR auth challenge). Same
// magic-link -> token_hash -> verifyOtp() bridge pattern already proven in
// apps/mobile-app/lib/auth/supabase-admin-bridge.ts for the Better Auth /
// Directus bridges -- duplicated here in minimal, self-contained form rather
// than importing across the app/package boundary (apps/mobile-app isn't a
// workspace dependency of packages/backend). Consolidating both into one
// shared implementation is worth doing later; this is deliberately the same
// approach, not a new one.
export type QrAuthSession = {
  accessToken: string;
  refreshToken: string;
};

export async function issueSessionForUser(
  client: SupabaseClient,
  userId: string
): Promise<QrAuthSession | null> {
  const { data: userData, error: userError } = await client.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    console.warn('[QR Auth] Could not resolve email for approved user:', userError?.message);
    return null;
  }

  const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) {
    console.warn('[QR Auth] Could not issue session bridge link:', linkError.message);
    return null;
  }

  const verificationType =
    typeof linkData?.properties?.verification_type === 'string' &&
    linkData.properties.verification_type.trim()
      ? linkData.properties.verification_type.trim()
      : 'magiclink';

  let tokenHash =
    typeof linkData?.properties?.hashed_token === 'string'
      ? linkData.properties.hashed_token.trim()
      : '';
  if (!tokenHash && linkData?.properties?.action_link) {
    try {
      const actionUrl = new URL(linkData.properties.action_link);
      tokenHash = actionUrl.searchParams.get('token_hash') || actionUrl.searchParams.get('token') || '';
    } catch {
      // Fall through -- empty tokenHash below fails the same way.
    }
  }
  if (!tokenHash) {
    console.warn('[QR Auth] Session bridge link generated without a token hash.');
    return null;
  }

  const { data: verifyData, error: verifyError } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: verificationType as EmailOtpType,
  });
  const session = verifyData?.session;
  if (verifyError || !session?.access_token || !session.refresh_token) {
    console.warn(
      '[QR Auth] Could not complete server-side session bridge:',
      verifyError?.message || 'Supabase did not return a complete session.'
    );
    return null;
  }

  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}
