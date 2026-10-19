import type { AvatarSource } from './types/avatar.types';

const isAvatarSource = (value: unknown): value is AvatarSource =>
  Boolean(value && typeof value === 'object');

const isRemoteAvatarUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

/**
 * Resolve the same profile image across Better Auth, Supabase, and legacy
 * Directus users. Better Auth exposes OAuth photos as `user.image`, while
 * Supabase exposes them in `user_metadata.avatar_url`/`picture`.
 */
export const resolveAvatarUrl = (...sources: unknown[]): string | null => {
  for (const source of sources) {
    if (!isAvatarSource(source)) continue;

    const metadata = source.user_metadata;
    const candidates = [
      metadata?.avatar_url,
      metadata?.picture,
      metadata?.image,
      source.image,
      source.avatar,
    ];

    const candidate = candidates.find(isRemoteAvatarUrl);
    if (candidate) return candidate.trim();
  }

  return null;
};
