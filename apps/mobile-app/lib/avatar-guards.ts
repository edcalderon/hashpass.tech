/**
 * Profile-picture guards shared by the upload control (client) and the speaker
 * profile API (server). Pure functions only, so both sides enforce one policy.
 */

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_DIMENSION = 4096;
export const AVATAR_MIN_DIMENSION = 64;
export const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export type AvatarMime = (typeof AVATAR_ALLOWED_MIME)[number];
export type AvatarGuardCode =
  | 'empty'
  | 'too_large'
  | 'type_not_allowed'
  | 'content_mismatch'
  | 'unreadable'
  | 'dimensions_too_large'
  | 'dimensions_too_small';

export class AvatarGuardError extends Error {
  readonly code: AvatarGuardCode;

  constructor(code: AvatarGuardCode, message: string) {
    super(message);
    this.name = 'AvatarGuardError';
    this.code = code;
  }
}

export interface AvatarCandidate {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface AvatarPolicy {
  maxBytes?: number;
  maxDimension?: number;
  minDimension?: number;
  allowedExtensions?: readonly string[];
}

const EXTENSION_MIME: Record<string, AvatarMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

const extensionOf = (name?: string | null): string | undefined => {
  const match = /\.([a-z0-9]+)$/i.exec((name ?? '').trim());
  return match?.[1].toLowerCase();
};

/** Identify the real format from the leading bytes, ignoring name and declared type. */
export const sniffImageType = (head: Uint8Array): AvatarMime | null => {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (
    head.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => head[index] === byte)
  ) {
    return 'image/png';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...Array.from(head.slice(start, end)));
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
};

/** Checks everything knowable from metadata alone (works for native picker assets too). */
export const validateAvatarMetadata = (
  candidate: AvatarCandidate,
  policy: AvatarPolicy = {},
): AvatarMime => {
  const maxBytes = policy.maxBytes ?? AVATAR_MAX_BYTES;
  const maxDimension = policy.maxDimension ?? AVATAR_MAX_DIMENSION;
  const minDimension = policy.minDimension ?? AVATAR_MIN_DIMENSION;
  const allowedExtensions = policy.allowedExtensions ?? AVATAR_ALLOWED_EXTENSIONS;

  if (typeof candidate.size === 'number') {
    if (candidate.size <= 0) throw new AvatarGuardError('empty', 'The selected image is empty');
    if (candidate.size > maxBytes) {
      throw new AvatarGuardError('too_large', `Image is too large. The limit is ${formatBytes(maxBytes)}`);
    }
  }

  const extension = extensionOf(candidate.name);
  const rawDeclared = candidate.mimeType?.toLowerCase().split(';')[0].trim();
  // Some pickers report the non-standard "image/jpg" for JPEG files.
  const declared = rawDeclared === 'image/jpg' ? 'image/jpeg' : rawDeclared;
  const extensionMime = extension ? EXTENSION_MIME[extension] : undefined;
  const typeNotAllowed = new AvatarGuardError(
    'type_not_allowed',
    `Only ${allowedExtensions.join(', ')} images are allowed`,
  );
  if (!extension || !allowedExtensions.includes(extension) || !extensionMime) throw typeNotAllowed;
  if (declared && !(AVATAR_ALLOWED_MIME as readonly string[]).includes(declared)) throw typeNotAllowed;
  if (declared && declared !== extensionMime) {
    throw new AvatarGuardError('content_mismatch', 'The file extension does not match its image type');
  }

  const { width, height } = candidate;
  if (typeof width === 'number' && typeof height === 'number') {
    if (Math.max(width, height) > maxDimension) {
      throw new AvatarGuardError('dimensions_too_large', `Image is too large. Maximum is ${maxDimension}px on a side`);
    }
    if (Math.min(width, height) < minDimension) {
      throw new AvatarGuardError('dimensions_too_small', `Image is too small. Minimum is ${minDimension}px on a side`);
    }
  }
  return declared ? (declared as AvatarMime) : extensionMime;
};

/** Confirms the file's leading bytes are the format it claims to be. */
export const validateAvatarBytes = (head: Uint8Array, expected: AvatarMime): void => {
  const actual = sniffImageType(head);
  if (!actual) throw new AvatarGuardError('unreadable', 'The file is not a supported image');
  if (actual !== expected) {
    throw new AvatarGuardError('content_mismatch', 'The file content does not match its image type');
  }
};

const EXACT_AVATAR_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'pbs.twimg.com',
  'api.dicebear.com',
  'ui-avatars.com',
  'res.cloudinary.com',
]);
const AVATAR_HOST_SUFFIXES = ['.hashpass.tech', '.hashpass.club', '.supabase.co'];

/** HTTPS only, from hosts the app itself produces; blocks arbitrary tracking or internal URLs. */
export const isAllowedAvatarUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return EXACT_AVATAR_HOSTS.has(host) || AVATAR_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
};
