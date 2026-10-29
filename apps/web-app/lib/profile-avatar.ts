function isProfileAvatarSource(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Resolve the same profile photo across Supabase metadata and Better Auth users. */
export function resolveProfileAvatarUrl(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (typeof source === 'string' && isRemoteImageUrl(source)) return source.trim();
    if (!isProfileAvatarSource(source)) continue;

    const metadata = isProfileAvatarSource(source.user_metadata) ? source.user_metadata : {};
    const candidate = [
      metadata.avatar_url,
      metadata.picture,
      metadata.image,
      metadata.avatar,
      metadata.photo_url,
      source.image,
      source.avatar_url,
      source.picture,
      source.avatar,
      source.photo_url,
    ].find(isRemoteImageUrl);

    if (candidate) return candidate.trim();
  }

  return null;
}
