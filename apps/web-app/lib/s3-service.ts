import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

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
  try {
    if (!EMAIL_BUCKET_NAME) {
      return { success: false, error: 'S3 bucket name not configured' };
    }

    // Read file
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Determine content type
    const contentType = options.contentType || getContentType(fileName);
    
    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: EMAIL_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: options.cacheControl || 'public, max-age=31536000, immutable',
      // Note: ACL removed - bucket should have public read policy instead
    });

    await s3Client.send(command);

    // Construct URL - use proper HTTP URL
    let url: string;
    if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
      // Valid CDN URL (HTTP/HTTPS)
      url = `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
    } else {
      // Use S3 bucket URL directly
      url = `https://${EMAIL_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    }

    return { success: true, url };
  } catch (error: any) {
    console.error('Error uploading to S3:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to upload to S3' 
    };
  }
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
  try {
    if (!EMAIL_BUCKET_NAME) {
      return false;
    }

    const command = new HeadObjectCommand({
      Bucket: EMAIL_BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error('Error checking file existence in S3:', error);
    return false;
  }
}

/**
 * Get content type from file extension
 */
function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Upload all email assets from local directory to S3
 */
export async function uploadAllEmailAssets(
  localAssetsDir: string = path.join(process.cwd(), 'emails', 'assets')
): Promise<{ success: boolean; uploaded: number; failed: number; urls: Record<string, string> }> {
  const results = {
    success: true,
    uploaded: 0,
    failed: 0,
    urls: {} as Record<string, string>,
  };

  try {
    // Upload images
    const imagesDir = path.join(localAssetsDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const imageFiles = fs.readdirSync(imagesDir);
      
      for (const file of imageFiles) {
        const filePath = path.join(imagesDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const result = await uploadEmailAsset(filePath, `images/${file}`, {
            publicRead: true,
            cacheControl: 'public, max-age=31536000, immutable',
          });
          
          if (result.success && result.url) {
            results.uploaded++;
            results.urls[`images/${file}`] = result.url;
            console.log(`✅ Uploaded: images/${file} -> ${result.url}`);
          } else {
            results.failed++;
            console.error(`❌ Failed to upload: images/${file} - ${result.error}`);
          }
        }
      }
    }

    // Upload videos (if any)
    const videosDir = path.join(localAssetsDir, 'videos');
    if (fs.existsSync(videosDir)) {
      const videoFiles = fs.readdirSync(videosDir);
      
      for (const file of videoFiles) {
        const filePath = path.join(videosDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const result = await uploadEmailAsset(filePath, `videos/${file}`, {
            publicRead: true,
            cacheControl: 'public, max-age=31536000, immutable',
          });
          
          if (result.success && result.url) {
            results.uploaded++;
            results.urls[`videos/${file}`] = result.url;
            console.log(`✅ Uploaded: videos/${file} -> ${result.url}`);
          } else {
            results.failed++;
            console.error(`❌ Failed to upload: videos/${file} - ${result.error}`);
          }
        }
      }
    }

    results.success = results.failed === 0;
    return results;
  } catch (error: any) {
    console.error('Error uploading email assets:', error);
    results.success = false;
    return results;
  }
}

