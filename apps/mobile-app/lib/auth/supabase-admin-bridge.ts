import { type SupabaseClient } from '@supabase/supabase-js';
import type { EmailOtpType } from '@supabase/auth-js';

// Shared helpers for bridging a non-Supabase-native sign-in (Directus OAuth,
// Better Auth) into a real Supabase auth.users account. A genuine auth.users
// row is required for anything that FKs to it directly (user_roles,
// event_roles, user_profiles) and for triggers that only fire on
// auth.users INSERT/UPDATE (e.g. the BSL general-pass provisioning trigger,
// db/migrations/V010__provision_upcoming_bsl_general_passes.sql).

export type SupabaseSessionBridge = {
  token_hash: string;
  type: string;
  email: string;
};

// Tokens returned by Supabase are intentionally kept in the API response
// body, never the URL. The browser needs them to persist its own Supabase
// session for RLS-backed reads, but the one-time token hash and service-role
// verification stay on the server.
export type SupabaseBridgeSession = {
  access_token: string;
  refresh_token: string;
};

export const normalizeEmail = (value: string | null | undefined): string =>
  value?.trim().toLowerCase() || '';

export const isDuplicateSupabaseUserError = (errorMessage: string): boolean =>
  /already (?:been )?registered|already exists|duplicate key|email.*exists/i.test(errorMessage);

// Supabase's admin API has no "get user by email" lookup, only a paginated
// listUsers — this scans pages until it finds a match or runs out of users.
export const findSupabaseUserByEmail = async (client: SupabaseClient, email: string) => {
  const targetEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[Supabase Bridge] listUsers failed while searching by email:', error.message);
      return null;
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === targetEmail);
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
};

// Issues a magic-link token for the given email and extracts its token_hash,
// without sending any email — the caller is expected to consume the
// token_hash directly (via supabase.auth.verifyOtp) to establish a real
// Supabase session for an already-authenticated user, rather than making
// them click a link.
export const issueSupabaseSessionBridge = async (
  client: SupabaseClient,
  email: string
): Promise<SupabaseSessionBridge | null> => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  try {
    const { data, error } = await client.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (error) {
      console.warn('[Supabase Bridge] Could not issue session bridge link:', error.message);
      return null;
    }

    const rawType =
      typeof data?.properties?.verification_type === 'string' && data.properties.verification_type.trim()
        ? data.properties.verification_type.trim()
        : 'magiclink';

    let tokenHash =
      typeof data?.properties?.hashed_token === 'string'
        ? data.properties.hashed_token.trim()
        : '';

    if (!tokenHash && data?.properties?.action_link) {
      try {
        const actionUrl = new URL(data.properties.action_link);
        tokenHash =
          actionUrl.searchParams.get('token_hash') ||
          actionUrl.searchParams.get('token') ||
          '';
      } catch {
        // Keep empty token hash and fail gracefully below.
      }
    }

    if (!tokenHash) {
      console.warn('[Supabase Bridge] Session bridge link generated without token hash.');
      return null;
    }

    return {
      token_hash: tokenHash,
      type: rawType,
      email: normalizedEmail,
    };
  } catch (error) {
    console.warn(
      '[Supabase Bridge] Failed to issue session bridge link:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

/**
 * Consume a one-time bridge token with the server's service-role client.
 * This keeps /auth/v1/verify and its API key out of the browser network
 * trace. Only the resulting user session is returned to the already
 * authenticated caller.
 */
export const createSupabaseBridgeSession = async (
  client: SupabaseClient,
  email: string
): Promise<SupabaseBridgeSession | null> => {
  const bridge = await issueSupabaseSessionBridge(client, email);
  if (!bridge) {
    return null;
  }

  try {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: bridge.token_hash,
      type: bridge.type as EmailOtpType,
    });
    const session = data?.session;

    if (error || !session?.access_token || !session.refresh_token) {
      console.warn(
        '[Supabase Bridge] Could not complete server-side session bridge:',
        error?.message || 'Supabase did not return a complete session.'
      );
      return null;
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  } catch (error) {
    console.warn(
      '[Supabase Bridge] Failed to complete server-side session bridge:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

// Ensures a real Supabase auth.users account exists for the given email,
// creating one if needed or refreshing metadata on an existing account found
// by email. Never throws — callers (Better Auth hooks, OAuth callbacks) must
// not have their own sign-in flow broken by a Supabase-side failure here.
export const ensureSupabaseAccountForEmail = async (
  client: SupabaseClient,
  params: {
    email: string;
    userMetadata: Record<string, unknown>;
  }
): Promise<{ id: string } | null> => {
  const email = normalizeEmail(params.email);
  if (!email) {
    return null;
  }

  try {
    const createResult = await client.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: params.userMetadata,
    });

    if (!createResult.error && createResult.data?.user) {
      return { id: createResult.data.user.id };
    }

    const createErrorMessage = createResult.error?.message || '';
    if (!isDuplicateSupabaseUserError(createErrorMessage)) {
      console.warn('[Supabase Bridge] createUser failed:', createErrorMessage || 'Unknown createUser error');
      return null;
    }

    const existingUser = await findSupabaseUserByEmail(client, email);
    if (!existingUser) {
      console.warn('[Supabase Bridge] User already exists but could not be located for metadata update.');
      return null;
    }

    const mergedMetadata: Record<string, unknown> = {
      ...(existingUser.user_metadata || {}),
      ...params.userMetadata,
    };

    const updateResult = await client.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      user_metadata: mergedMetadata,
    });

    if (updateResult.error) {
      console.warn('[Supabase Bridge] Metadata update failed:', updateResult.error.message);
      return { id: existingUser.id };
    }

    return { id: existingUser.id };
  } catch (error) {
    console.warn(
      '[Supabase Bridge] Failed to ensure Supabase account unexpectedly:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};
