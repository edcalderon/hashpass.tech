#!/usr/bin/env node

/**
 * Script to upload email assets to S3
 * 
 * Usage:
 *   node scripts/upload-email-assets-to-s3.js
 * 
 * Environment variables required (can be in .env file):
 *   AWS_REGION - AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID - AWS access key
 *   AWS_SECRET_ACCESS_KEY - AWS secret key
 *   EXPO_PUBLIC_AWS_S3_BUCKET_NAME - Email assets S3 bucket name (hashpass-email-assets)
 *   AWS_S3_CDN_URL - CDN URL (optional, for CloudFront or similar)
 */

// Load environment variables from .env file
require('dotenv').config();

// Import S3 service functions directly (inline to avoid TypeScript compilation issues)
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

// Inline S3 upload function
async function uploadAllEmailAssets(localAssetsDir) {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Email assets bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET_NAME (hashpass-email-assets)
  const bucketName = (
    process.env.EXPO_PUBLIC_AWS_S3_BUCKET_NAME || 
    process.env.AWS_S3_BUCKET_NAME || 
    'hashpass-email-assets'
  ).trim().replace(/[`'"]/g, '');
  const cdnUrl = (process.env.AWS_S3_CDN_URL || '').trim();
  const prefix = 'emails/assets/';

  const results = {
    success: true,
    uploaded: 0,
    failed: 0,
    urls: {},
  };

  function getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const types = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    return types[ext] || 'application/octet-stream';
  }

  async function uploadFile(filePath, s3Key) {
    try {
      const fileContent = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const contentType = getContentType(fileName);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        // Note: ACL removed - bucket should have public read policy instead
      });

      await s3Client.send(command);

      // Generate proper HTTP URL
      let url;
      if (cdnUrl && !cdnUrl.startsWith('s3://') && !cdnUrl.startsWith('arn:')) {
        // Valid CDN URL (HTTP/HTTPS)
        url = `${cdnUrl}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
      } else {
        // Use S3 bucket URL directly
        url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
      }

      return { success: true, url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    // Upload images (including subdirectories like screenshots)
    const imagesDir = path.join(localAssetsDir, 'images');
    if (fs.existsSync(imagesDir)) {
      // Function to recursively upload files in a directory
      async function uploadDirectory(dir, baseS3Key) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            const relativePath = path.relative(imagesDir, filePath);
            const s3Key = `${prefix}images/${relativePath}`.replace(/\\/g, '/');
            const result = await uploadFile(filePath, s3Key);
            if (result.success && result.url) {
              results.uploaded++;
              results.urls[`images/${relativePath}`] = result.url;
              console.log(`✅ Uploaded: images/${relativePath} -> ${result.url}`);
            } else {
              results.failed++;
              console.error(`❌ Failed to upload: images/${relativePath} - ${result.error}`);
            }
          } else if (stat.isDirectory()) {
            // Recursively upload subdirectories
            await uploadDirectory(filePath, baseS3Key);
          }
        }
      }
      await uploadDirectory(imagesDir, `${prefix}images/`);
    }

    // Upload videos
    const videosDir = path.join(localAssetsDir, 'videos');
    if (fs.existsSync(videosDir)) {
      const videoFiles = fs.readdirSync(videosDir);
      for (const file of videoFiles) {
        const filePath = path.join(videosDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const s3Key = `${prefix}videos/${file}`;
          const result = await uploadFile(filePath, s3Key);
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
  } catch (error) {
    console.error('Error uploading email assets:', error);
    results.success = false;
    return results;
  }
}

async function main() {
  console.log('🚀 Starting email assets upload to S3...\n');

  // Check required environment variables
  const requiredVars = ['EXPO_PUBLIC_AWS_S3_BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables before running the script.');
    process.exit(1);
  }

  console.log('Configuration:');
    console.log(`   Bucket: ${process.env.EXPO_PUBLIC_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || 'hashpass-email-assets'}`);
  console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  if (process.env.AWS_S3_CDN_URL) {
    console.log(`   CDN URL: ${process.env.AWS_S3_CDN_URL}`);
  }
  console.log('');

  // Upload assets
  const assetsDir = path.join(process.cwd(), 'emails', 'assets');
  const result = await uploadAllEmailAssets(assetsDir);

  console.log('\n📊 Upload Summary:');
  console.log(`   ✅ Uploaded: ${result.uploaded}`);
  console.log(`   ❌ Failed: ${result.failed}`);
  console.log(`   Status: ${result.success ? 'SUCCESS' : 'PARTIAL FAILURE'}`);

  if (Object.keys(result.urls).length > 0) {
    console.log('\n📝 Asset URLs:');
    Object.entries(result.urls).forEach(([key, url]) => {
      console.log(`   ${key}: ${url}`);
    });
  }

  // Save URLs to a JSON file for reference
  if (Object.keys(result.urls).length > 0) {
    const urlsPath = path.join(process.cwd(), 'emails', 'asset-urls.json');
    fs.writeFileSync(urlsPath, JSON.stringify(result.urls, null, 2));
    console.log(`\n💾 Asset URLs saved to: ${urlsPath}`);
  }

  process.exit(result.success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

