

// Cloudinary configuration (browser-compatible)
import Constants from 'expo-constants';
import { apiClient } from './api-client';

type CloudinaryExtraConfig = {
  cloudName?: string;
  uploadPreset?: string;
  uploadFolder?: string;
};

const cloudinaryExtra: CloudinaryExtraConfig =
  ((Constants?.expoConfig?.extra as { cloudinary?: CloudinaryExtraConfig })?.cloudinary ??
    (Constants?.manifest?.extra as { cloudinary?: CloudinaryExtraConfig })?.cloudinary ??
    {});

const getEnv = (key: string): string | undefined =>
  typeof process !== 'undefined' && typeof process.env !== 'undefined'
    ? process.env[key]
    : undefined;

const DEFAULT_CLOUD_NAME = 'dfwjkpsma';

const CLOUDINARY_CONFIG = {
  cloudName: cloudinaryExtra.cloudName ?? getEnv('EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME') ?? DEFAULT_CLOUD_NAME,
  secure: true,
};

/**
 * Cloudinary utility functions for image optimization
 * Optimized for Expo Web performance with auto-format, quality, and DPR
 */

export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'scale' | 'fit' | 'thumb' | 'crop' | 'limit';
  quality?: 'auto' | 'auto:best' | 'auto:good' | 'best' | 'good' | 'eco' | 'low' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  dpr?: 'auto' | number;
  gravity?: 'auto' | 'center' | 'face' | 'faces' | 'north' | 'south' | 'east' | 'west';
  aspectRatio?: string;
  zoom?: number;
  opacity?: number;
  background?: string;
  blur?: number;
  sharpen?: number;
}

/**
 * Default optimization settings for Expo Web
 */
const DEFAULT_WEB_OPTIONS: CloudinaryTransformOptions = {
  format: 'auto', // Auto WebP/AVIF conversion
  quality: 'auto', // Automatic quality optimization
  dpr: 'auto', // Device pixel ratio awareness
  crop: 'fill',
  gravity: 'auto',
};

/**
 * Default avatar optimization settings
 */
const DEFAULT_AVATAR_OPTIONS: CloudinaryTransformOptions = {
  format: 'auto',
  quality: 'auto:best', // Higher quality for avatars
  dpr: 'auto',
  crop: 'fill',
  gravity: 'face',
};

/**
 * Default banner/hero image settings
 */
const DEFAULT_BANNER_OPTIONS: CloudinaryTransformOptions = {
  format: 'auto',
  quality: 'auto:good',
  dpr: 'auto',
  crop: 'fill',
  gravity: 'auto',
};

/**
 * Builds transformation parameters string
 * @param options - Transformation options
 * @returns Transformation string
 */
function buildTransformations(options: CloudinaryTransformOptions): string {
  const transformations: string[] = [];
  
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.crop) transformations.push(`c_${options.crop}`);
  if (options.gravity) transformations.push(`g_${options.gravity}`);
  if (options.aspectRatio) transformations.push(`ar_${options.aspectRatio}`);
  if (options.zoom) transformations.push(`z_${options.zoom}`);
  if (options.opacity) transformations.push(`o_${options.opacity}`);
  if (options.background) transformations.push(`b_${options.background}`);
  if (options.blur) transformations.push(`e_blur:${options.blur}`);
  if (options.sharpen) transformations.push(`e_sharpen:${options.sharpen}`);
  
  // Handle quality parameter
  if (options.quality) {
    if (typeof options.quality === 'number') {
      transformations.push(`q_${options.quality}`);
    } else {
      transformations.push(`q_${options.quality}`);
    }
  }
  
  // Handle format parameter
  if (options.format) {
    transformations.push(`f_${options.format}`);
  }
  
  // Handle DPR parameter
  if (options.dpr) {
    if (typeof options.dpr === 'number') {
      transformations.push(`dpr_${options.dpr}`);
    } else {
      transformations.push(`dpr_${options.dpr}`);
    }
  }
  
  return transformations.join(',');
}

/**
 * Generates a Cloudinary URL with optimizations
 * @param publicId - Cloudinary public ID or existing URL
 * @param options - Transformation options
 * @returns Optimized Cloudinary URL
 */
export function getCloudinaryUrl(
  publicId: string,
  options: CloudinaryTransformOptions = {}
): string {
  // If it's already a Cloudinary URL, extract the public ID
  if (publicId.includes('cloudinary.com')) {
    const matches = publicId.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    if (matches && matches[1]) {
      publicId = matches[1];
    }
  }

  // Merge with default options
  const mergedOptions = { ...DEFAULT_WEB_OPTIONS, ...options };
  
  // Build transformations
  const transformations = buildTransformations(mergedOptions);
  
  // Build URL
  const baseUrl = `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/image/upload`;
  const transformationString = transformations ? `${transformations}/` : '';
  
  return `${baseUrl}/${transformationString}${publicId}`;
}

/**
 * Generates optimized avatar URL
 * @param publicId - Cloudinary public ID or existing URL
 * @param size - Avatar size in pixels (square)
 * @returns Optimized avatar URL
 */
export function getAvatarUrl(publicId: string, size: number = 100): string {
  return getCloudinaryUrl(publicId, {
    ...DEFAULT_AVATAR_OPTIONS,
    width: size,
    height: size,
  });
}

/**
 * Generates optimized banner/hero image URL
 * @param publicId - Cloudinary public ID or existing URL
 * @param width - Banner width
 * @param height - Banner height (optional)
 * @returns Optimized banner URL
 */
export function getBannerUrl(
  publicId: string,
  width: number,
  height?: number
): string {
  return getCloudinaryUrl(publicId, {
    ...DEFAULT_BANNER_OPTIONS,
    width,
    height,
  });
}

/**
 * Generates optimized thumbnail URL
 * @param publicId - Cloudinary public ID or existing URL
 * @param width - Thumbnail width
 * @param height - Thumbnail height
 * @returns Optimized thumbnail URL
 */
export function getThumbnailUrl(
  publicId: string,
  width: number = 300,
  height: number = 200
): string {
  return getCloudinaryUrl(publicId, {
    format: 'auto',
    quality: 'auto:good',
    dpr: 'auto',
    crop: 'fill',
    gravity: 'auto',
    width,
    height,
  });
}

/**
 * Generates responsive image URL for different screen sizes
 * @param publicId - Cloudinary public ID or existing URL
 * @param breakpoints - Array of widths for responsive images
 * @returns Array of optimized URLs for each breakpoint
 */
export function getResponsiveUrls(
  publicId: string,
  breakpoints: number[] = [320, 640, 768, 1024, 1280, 1536]
): { width: number; url: string }[] {
  return breakpoints.map(width => ({
    width,
    url: getCloudinaryUrl(publicId, {
      width,
      crop: 'scale',
      format: 'auto',
      quality: 'auto',
      dpr: 'auto',
    }),
  }));
}

/**
 * Checks if a URL is a Cloudinary URL
 * @param url - URL to check
 * @returns True if URL is from Cloudinary
 */
export function isCloudinaryUrl(url: string): boolean {
  return url.includes('cloudinary.com') || url.includes('cloudinary');
}

/**
 * Converts a speaker name to Cloudinary public ID format
 * @param name - Speaker name
 * @returns Cloudinary public ID
 */
export function speakerNameToCloudinaryId(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Gets Cloudinary avatar URL for a speaker
 * @param name - Speaker name
 * @param size - Avatar size
 * @returns Optimized Cloudinary avatar URL
 */
export function getSpeakerCloudinaryAvatarUrl(
  name: string,
  size: number = 100
): string {
  const cloudinaryId = `speakers/avatars/speakers/avatars/foto-${speakerNameToCloudinaryId(name)}`;
  return getAvatarUrl(cloudinaryId, size);
}

/**
 * Upload configuration for client-side uploads
 */
export const UPLOAD_CONFIG = {
  uploadPreset: cloudinaryExtra.uploadPreset ?? 'speaker_avatars', // Create this in Cloudinary dashboard
  folder: cloudinaryExtra.uploadFolder ?? 'speakers/avatars',
  resourceType: 'image' as const,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
  transformations: {
    width: 1000,
    height: 1000,
    crop: 'limit',
    quality: 'auto:good',
    format: 'auto',
  },
};

/**
 * Generates upload URL for client-side uploads
 * @returns Cloudinary upload URL
 */
export function getUploadUrl(): string {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;
}

/**
 * Client-side upload function using unsigned upload
 * @param file - File to upload
 * @param options - Upload options
 * @returns Promise with upload result
 */
export async function uploadImage(
  file: File,
  options: {
    publicId?: string;
    folder?: string;
    tags?: string[];
  } = {}
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_CONFIG.uploadPreset);
  
  if (options.publicId) {
    formData.append('public_id', options.publicId);
  }
  
  if (options.folder) {
    formData.append('folder', options.folder);
  }
  
  if (options.tags) {
    formData.append('tags', options.tags.join(','));
  }

  try {
    const response = await apiClient.post(getUploadUrl(), formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

// Export configuration for advanced usage
export { CLOUDINARY_CONFIG };
