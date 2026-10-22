export type AvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type AvatarGuardCode =
  | 'empty'
  | 'too_large'
  | 'type_not_allowed'
  | 'content_mismatch'
  | 'unreadable'
  | 'dimensions_too_large'
  | 'dimensions_too_small';

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
