// Email assets bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET_NAME (hashpass-email-assets)
const EMAIL_BUCKET_NAME = (
  process.env.EXPO_PUBLIC_AWS_S3_BUCKET_NAME || 
  process.env.AWS_S3_BUCKET_NAME || 
  'hashpass-email-assets'
).trim().replace(/[`'"]/g, '');
const CDN_URL = (process.env.AWS_S3_CDN_URL || process.env.AWS_S3_BUCKET_URL || '').trim();
const EMAIL_ASSETS_PREFIX = 'emails/assets/';

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  publicRead?: boolean;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  filePath: string,
  s3Key: string,
  options: UploadOptions = {}
): Promise<{ success: boolean; url?: string; error?: string }> {
  console.warn(`S3 upload disabled in this runtime for ${s3Key} from ${filePath}`);
  return { success: false, error: 'S3 upload is not available in this runtime' };
}

/**
 * Upload email asset to S3
 */
export async function uploadEmailAsset(
  localPath: string,
  assetName: string,
  options: UploadOptions = {}
): Promise<{ success: boolean; url?: string; error?: string }> {
  const s3Key = `${EMAIL_ASSETS_PREFIX}${assetName}`;
  return uploadToS3(localPath, s3Key, options);
}

/**
 * Get public URL for an email asset
 */
export function getEmailAssetUrl(assetName: string): string {
  const s3Key = `${EMAIL_ASSETS_PREFIX}${assetName}`;
  
  // Use proper HTTP URL
  if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
    // Valid CDN URL (HTTP/HTTPS)
    return `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  }
  
  // Use S3 bucket URL directly
  return `https://${EMAIL_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}

/**
 * Check if file exists in S3
 */
export async function fileExistsInS3(s3Key: string): Promise<boolean> {
  console.warn(`S3 existence check disabled in this runtime for ${s3Key}`);
  return false;
}

/**
 * Upload all email assets from local directory to S3
 */
export async function uploadAllEmailAssets(
  localAssetsDir: string = 'emails/assets'
): Promise<{ success: boolean; uploaded: number; failed: number; urls: Record<string, string> }> {
  const results = {
    success: true,
    uploaded: 0,
    failed: 0,
    urls: {} as Record<string, string>,
  };

  console.warn(`Email asset upload disabled in this runtime for ${localAssetsDir}`);
  results.success = false;
  results.failed = 1;
  return results;
}
