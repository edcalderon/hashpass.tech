/**
 * Utility functions for string manipulation
 */

import Constants from 'expo-constants';
import { 
  getSpeakerCloudinaryAvatarUrl, 
  getCloudinaryUrl, 
  isCloudinaryUrl
} from './cloudinary';

/**
 * Converts accented characters to ASCII equivalents for URL-safe strings
 * @param str - The string to convert
 * @returns ASCII-safe string
 */
export function toUrlSafe(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Converts a speaker name to a URL-safe filename for avatars
 * @param name - The speaker's name
 * @returns URL-safe filename
 */
export function speakerNameToFilename(name: string): string {
  return toUrlSafe(name);
}

/**
 * Gets the local optimized avatar URL if it exists in public folder
 * Checks if optimized avatar exists at public/assets/speakers/avatars/foto-{filename}.png
 * @param name - The speaker's name
 * @returns Local avatar URL with full origin for web, or null if not found
 */
export function getLocalOptimizedAvatarUrl(name: string): string | null {
  if (!name) return null;
  
  const filename = speakerNameToFilename(name);
  // In web/Expo, public assets are served from root
  // Path: /assets/speakers/avatars/foto-{filename}.png
  let localPath = `/assets/speakers/avatars/foto-${filename}.png`;
  
  // For web, we need to include the origin to make it a full URL
  // This ensures the image loads correctly in web browsers
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    localPath = `${origin}${localPath}`;
  }
  
  // Return the path - the component will check if it loads successfully
  // We can't check file size here in client-side code, so we rely on the component
  // to try loading it and fallback if it fails
  return localPath;
}

/**
 * Gets the optimized avatar URL with Cloudinary priority
 * Priority order: Cloudinary > Local optimized > S3
 * @param name - The speaker's name
 * @param imageUrl - Existing image URL (if any)
 * @param size - Avatar size in pixels
 * @returns Optimized avatar URL
 */
export function getOptimizedAvatarUrl(
  name: string, 
  imageUrl?: string | null,
  size: number = 100
): string {
  // If imageUrl is already a Cloudinary URL, optimize it
  if (imageUrl && isCloudinaryUrl(imageUrl)) {
    return getCloudinaryUrl(imageUrl, {
      width: size,
      height: size,
      crop: 'fill',
      gravity: 'face',
      format: 'auto',
      quality: 'auto:best',
      dpr: 'auto',
    });
  }

  // Try Cloudinary first (highest priority for performance)
  if (name) {
    const cloudinaryUrl = getSpeakerCloudinaryAvatarUrl(name, size);
    // Return Cloudinary URL - it will fallback gracefully if image doesn't exist
    return cloudinaryUrl;
  }

  // Fallback to local optimized
  const localUrl = getLocalOptimizedAvatarUrl(name);
  if (localUrl) {
    return localUrl;
  }

  // Final fallback to S3
  return getSpeakerAvatarUrl(name, imageUrl);
}

/**
 * Generates avatar URL for a speaker with Cloudinary priority
 * Note: This function now prioritizes Cloudinary URLs over S3 for better performance.
 * @param name - The speaker's name
 * @param s3Url - S3 URL if already known (optional)
 * @returns Complete avatar URL (Cloudinary prioritized, S3 fallback)
 */
export function getSpeakerAvatarUrl(
  name: string, 
  s3Url?: string
): string {
  // Priority 1: Try Cloudinary URL first
  const cloudinaryUrl = getSpeakerCloudinaryAvatarUrl(name);
  if (cloudinaryUrl) {
    return cloudinaryUrl;
  }

  // Priority 2: If S3 URL is provided, use it
  if (s3Url) {
    return s3Url;
  }

  // Default S3 bucket configuration (hashpass-assets)
  const defaultS3Bucket = 'hashpass-assets';
  const defaultAwsRegion = 'us-east-2';

  // Try to get S3 URL from environment/config
  // Works on both server-side and client-side (with EXPO_PUBLIC_ prefix)
  let s3Bucket = '';
  let cdnUrl = '';
  let awsRegion = defaultAwsRegion;

  // Check environment variables (server-side or build-time)
  // Speaker avatars use EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
  if (typeof process !== 'undefined' && process.env) {
    s3Bucket = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || 
               process.env.AWS_S3_CDN_URL || 
               process.env.AWS_S3_BUCKET_URL || 
               '';
    awsRegion = process.env.AWS_REGION || 
                defaultAwsRegion;
  }

  // Check Expo Constants (client-side runtime)
  // This allows accessing env vars in React Native/Expo client-side code
  if (Constants?.expoConfig?.extra) {
    const extra = Constants.expoConfig.extra as any;
    if (!s3Bucket) {
      s3Bucket = extra.EXPO_PUBLIC_AWS_S3_BUCKET || 
                 extra.AWS_S3_BUCKET || 
                 extra.AWS_S3_BUCKET_NAME || 
                 extra.EXPO_PUBLIC_AWS_S3_BUCKET_NAME || 
                 '';
    }
    if (!cdnUrl) {
      cdnUrl = extra.AWS_S3_CDN_URL || 
               extra.AWS_S3_BUCKET_URL || 
               extra.EXPO_PUBLIC_AWS_S3_CDN_URL || 
               extra.EXPO_PUBLIC_AWS_S3_BUCKET_URL || 
               '';
    }
    if (awsRegion === defaultAwsRegion) {
      awsRegion = extra.AWS_REGION || 
                  extra.EXPO_PUBLIC_AWS_REGION || 
                  defaultAwsRegion;
    }
  }

  // Use default bucket if not in env (we know it's hashpass-assets)
  if (!s3Bucket) {
    s3Bucket = defaultS3Bucket;
  }

  // Generate S3 URL
  const filename = speakerNameToFilename(name);
  const s3Key = `speakers/avatars/foto-${filename}.png`;
  
  // Use CDN URL if available, otherwise use S3 bucket URL
  if (cdnUrl && !cdnUrl.startsWith('s3://') && !cdnUrl.startsWith('arn:')) {
    return `${cdnUrl}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  } else if (s3Bucket) {
    return `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
  }

  // Always return S3 URL - never fallback to blockchainsummit.la
  // If S3 bucket is not configured, still return S3 URL format (will fail gracefully)
  return `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
}

/**
 * Generates LinkedIn URL for a speaker
 * @param name - The speaker's name
 * @returns LinkedIn URL
 */
export function getSpeakerLinkedInUrl(name: string): string {
  const username = speakerNameToFilename(name);
  return `https://linkedin.com/in/${username}`;
}

/**
 * Generates Twitter URL for a speaker
 * @param name - The speaker's name
 * @returns Twitter URL
 */
export function getSpeakerTwitterUrl(name: string): string {
  const username = speakerNameToFilename(name);
  return `https://twitter.com/${username}`;
}

// Re-export Cloudinary functions for convenience
export { getSpeakerCloudinaryAvatarUrl, getCloudinaryUrl, isCloudinaryUrl } from './cloudinary';
