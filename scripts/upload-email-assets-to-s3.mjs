#!/usr/bin/env node

/**
 * Script to upload email assets to S3
 * 
 * Usage:
 *   node scripts/upload-email-assets-to-s3.mjs
 * 
 * Environment variables required:
 *   AWS_REGION - AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID - AWS access key
 *   AWS_SECRET_ACCESS_KEY - AWS secret key
 *   AWS_S3_BUCKET_NAME - S3 bucket name
 *   AWS_S3_CDN_URL - CDN URL (optional, for CloudFront or similar)
 */

import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the S3 service (we'll use dynamic import or require)
let uploadAllEmailAssets;
try {
  // Try to use the compiled version
  const s3Service = require('../lib/s3-service.js');
  uploadAllEmailAssets = s3Service.uploadAllEmailAssets;
} catch (e) {
  // If not compiled, we'll need to use ts-node or compile first
  console.error('Error loading s3-service. Make sure to compile TypeScript first or use ts-node.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🚀 Starting email assets upload to S3...\n');

  // Check required environment variables
  const requiredVars = ['AWS_S3_BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables before running the script.');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`   Bucket: ${process.env.AWS_S3_BUCKET_NAME}`);
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
    const fs = await import('fs');
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

