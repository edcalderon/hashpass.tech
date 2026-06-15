import { getSupabaseServerForRequest } from '../supabase-server';

export type PublicUserRegistryInput = {
  provider: string;
  authUserId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  emailVerifiedAt?: string | null;
  lastSignInAt?: string | null;
  deletedAt?: string | null;
  authMetadata?: Record<string, any>;
  profileMetadata?: Record<string, any>;
  providerIds?: Record<string, string | null | undefined>;
};

type PublicUserRegistryPayload = {
  provider: string;
  auth_provider: string;
  auth_user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  email_verified_at: string | null;
  last_sign_in_at: string | null;
  deleted_at: string | null;
  auth_metadata: Record<string, any>;
  profile_metadata: Record<string, any>;
  provider_ids: Record<string, string>;
};

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (value: string | null | undefined): string | null =>
  normalizeText(value)?.toLowerCase() || null;

const normalizeTimestamp = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const mergeProviderIds = (
  provider: string,
  authUserId: string | null,
  email: string,
  providerIds: Record<string, string | null | undefined> | undefined
): Record<string, string> => {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(providerIds || {})) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value ?? null);
    if (normalizedKey && normalizedValue) {
      merged[normalizedKey] = normalizedValue;
    }
  }

  if (authUserId) {
    merged[provider] = authUserId;
  } else if (email) {
    merged[provider] = email;
  }

  return merged;
};

export async function syncPublicUserRegistry(
  request: Request,
  input: PublicUserRegistryInput
): Promise<{ id: string } | null> {
  const supabase = getSupabaseServerForRequest(request);
  const provider = normalizeText(input.provider) || 'unknown';
  const authUserId = normalizeText(input.authUserId ?? null);
  const email = normalizeEmail(input.email ?? null);

  if (!email) {
    console.warn('[Auth Registry] Skipping public user sync: missing email.');
    return null;
  }

  const payload: PublicUserRegistryPayload = {
    provider,
    auth_provider: provider,
    auth_user_id: authUserId,
    email,
    first_name: normalizeText(input.firstName ?? null),
    last_name: normalizeText(input.lastName ?? null),
    full_name: normalizeText(input.fullName ?? null),
    avatar_url: normalizeText(input.avatarUrl ?? null),
    phone: normalizeText(input.phone ?? null),
    role: normalizeText(input.role ?? null) || 'user',
    status: normalizeText(input.status ?? null) || 'active',
    email_verified_at: normalizeTimestamp(input.emailVerifiedAt ?? null),
    last_sign_in_at: normalizeTimestamp(input.lastSignInAt ?? null),
    deleted_at: normalizeTimestamp(input.deletedAt ?? null),
    auth_metadata: input.authMetadata || {},
    profile_metadata: input.profileMetadata || {},
    provider_ids: mergeProviderIds(provider, authUserId, email, input.providerIds),
  };

  const { data, error } = await (supabase as any).rpc('upsert_public_user_registry', {
    p_payload: payload,
  });

  if (error) {
    console.warn('[Auth Registry] Failed to sync public user registry:', error.message);
    return null;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const row = data as { id?: string };
  if (!row.id) {
    return null;
  }

  return { id: row.id };
}
