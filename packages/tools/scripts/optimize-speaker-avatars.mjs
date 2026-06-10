#!/usr/bin/env node
/**
 * Optimize and compress speaker avatars in S3
 * 
 * This script:
 * 1. Downloads speaker avatars from S3
 * 2. Resizes and compresses them (target: 200x200px, <100KB)
 * 3. Re-uploads optimized versions to S3
 * 4. Optionally updates database records
 * 
 * Usage:
 *   node scripts/optimize-speaker-avatars.mjs [--dry-run] [--max-size=100] [--dimensions=200]
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
// Speaker avatars bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';
const TARGET_DIMENSIONS = parseInt(process.argv.find(arg => arg.startsWith('--dimensions='))?.split('=')[1] || '200');
const TARGET_MAX_SIZE_KB = parseInt(process.argv.find(arg => arg.startsWith('--max-size='))?.split('=')[1] || '100');
const DRY_RUN = process.argv.includes('--dry-run');

// Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS credentials');
  console.error('   Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
  process.exit(1);
}

// Temp directory for processing
const TEMP_DIR = path.join(__dirname, '../.temp-avatar-optimization');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Get all speakers with S3 image URLs
 */
async function getSpeakersWithS3Images() {
  console.log('📋 Fetching speakers from database...');
  
  const { data: speakers, error } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('imageurl', 'is', null);
  
  if (error) {
    console.error('❌ Error fetching speakers:', error);
    return [];
  }
  
  // Filter to only S3 URLs
  const s3Speakers = speakers.filter(s => 
    s.imageurl && (
      s.imageurl.includes('s3.amazonaws.com') || 
      s.imageurl.includes('hashpass-assets')
    )
  );
  
  console.log(`✅ Found ${s3Speakers.length} speakers with S3 images`);
  return s3Speakers;
}

/**
 * Download image from S3 (using public HTTP URL since images are publicly accessible)
 */
async function downloadImage(imageUrl) {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`❌ Error downloading ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Optimize image using sharp
 */
async function optimizeImage(imageBuffer, filename) {
  try {
    const tempInputPath = path.join(TEMP_DIR, `input-${filename}`);
    const tempOutputPath = path.join(TEMP_DIR, `output-${filename}`);
    
    // Write input to temp file
    fs.writeFileSync(tempInputPath, imageBuffer);
    
    // Get original size
    const originalSize = imageBuffer.length;
    const originalSizeKB = (originalSize / 1024).toFixed(2);
    
    // Optimize with sharp
    let quality = 85; // Start with high quality
    let optimizedBuffer;
    let attempts = 0;
    const maxAttempts = 5;
    
    do {
      optimizedBuffer = await sharp(tempInputPath)
        .resize(TARGET_DIMENSIONS, TARGET_DIMENSIONS, {
          fit: 'cover',
          position: 'center',
          withoutEnlargement: true
        })
        .png({
          quality: quality,
          compressionLevel: 9,
          adaptiveFiltering: true
        })
        .toBuffer();
      
      const optimizedSizeKB = (optimizedBuffer.length / 1024).toFixed(2);
      
      // If we're under target size or quality is too low, stop
      if (optimizedBuffer.length <= TARGET_MAX_SIZE_KB * 1024 || quality <= 60) {
        console.log(`  ✅ Optimized: ${originalSizeKB}KB → ${optimizedSizeKB}KB (quality: ${quality})`);
        break;
      }
      
      // Reduce quality and try again
      quality -= 10;
      attempts++;
    } while (attempts < maxAttempts && quality >= 60);
    
    // Clean up temp files
    try {
      fs.unlinkSync(tempInputPath);
      fs.unlinkSync(tempOutputPath);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    const finalSizeKB = (optimizedBuffer.length / 1024).toFixed(2);
    const reduction = ((1 - optimizedBuffer.length / originalSize) * 100).toFixed(1);
    
    return {
      buffer: optimizedBuffer,
      originalSizeKB: parseFloat(originalSizeKB),
      optimizedSizeKB: parseFloat(finalSizeKB),
      reduction: parseFloat(reduction)
    };
  } catch (error) {
    console.error(`❌ Error optimizing image ${filename}:`, error.message);
    return null;
  }
}

/**
 * Upload optimized image to S3
 */
async function uploadOptimizedImage(s3Key, imageBuffer) {
  try {
    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would upload ${s3Key} (${(imageBuffer.length / 1024).toFixed(2)}KB)`);
      return true;
    }
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000', // 1 year cache
      // Note: ACL removed - bucket policy handles public access
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error(`❌ Error uploading ${s3Key}:`, error.message);
    return false;
  }
}

/**
 * Extract S3 key from URL
 */
function extractS3Key(imageUrl) {
  if (!imageUrl) return null;
  
  // Extract key from URL like: https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-name.png
  const match = imageUrl.match(/speakers\/avatars\/[^?]+/);
  if (match) {
    return match[0];
  }
  
  return null;
}

/**
 * Main optimization function
 */
async function optimizeSpeakerAvatars() {
  console.log('🚀 Starting speaker avatar optimization...');
  console.log(`📐 Target dimensions: ${TARGET_DIMENSIONS}x${TARGET_DIMENSIONS}px`);
  console.log(`📦 Target max size: ${TARGET_MAX_SIZE_KB}KB`);
  console.log(`🔧 Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (will update S3)'}`);
  console.log('');
  
  const speakers = await getSpeakersWithS3Images();
  
  if (speakers.length === 0) {
    console.log('ℹ️ No speakers with S3 images found');
    return;
  }
  
  let processed = 0;
  let optimized = 0;
  let skipped = 0;
  let errors = 0;
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  
  for (const speaker of speakers) {
    try {
      console.log(`\n📸 Processing: ${speaker.name}`);
      console.log(`   URL: ${speaker.imageurl}`);
      
      const s3Key = extractS3Key(speaker.imageurl);
      if (!s3Key) {
        console.log(`   ⚠️  Could not extract S3 key, skipping`);
        skipped++;
        continue;
      }
      
      // Download image (using public HTTP URL)
      console.log(`   ⬇️  Downloading from S3...`);
      const imageBuffer = await downloadImage(speaker.imageurl);
      if (!imageBuffer) {
        console.log(`   ❌ Failed to download, skipping`);
        errors++;
        continue;
      }
      
      const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);
      console.log(`   📊 Original size: ${originalSizeKB}KB`);
      
      // Always optimize to ensure consistent dimensions and quality
      // Skip only if already optimized AND under size limit AND correct dimensions
      // For now, optimize all images to ensure consistency
      
      // Optimize image
      console.log(`   🔧 Optimizing...`);
      const optimizationResult = await optimizeImage(imageBuffer, `${speaker.id}.png`);
      if (!optimizationResult) {
        console.log(`   ❌ Failed to optimize, skipping`);
        errors++;
        continue;
      }
      
      totalOriginalSize += optimizationResult.originalSizeKB;
      totalOptimizedSize += optimizationResult.optimizedSizeKB;
      
      // Upload optimized version
      console.log(`   ⬆️  Uploading optimized version...`);
      const uploadSuccess = await uploadOptimizedImage(s3Key, optimizationResult.buffer);
      if (!uploadSuccess) {
        console.log(`   ❌ Failed to upload, skipping`);
        errors++;
        continue;
      }
      
      optimized++;
      processed++;
      
      console.log(`   ✅ Successfully optimized: ${optimizationResult.reduction}% reduction`);
      
    } catch (error) {
      console.error(`   ❌ Error processing ${speaker.name}:`, error.message);
      errors++;
    }
  }
  
  // Cleanup temp directory
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore cleanup errors
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Optimization Summary');
  console.log('='.repeat(60));
  console.log(`✅ Processed: ${processed}`);
  console.log(`🔧 Optimized: ${optimized}`);
  console.log(`⏭️  Skipped: ${skipped} (already optimized)`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📦 Total original size: ${(totalOriginalSize / 1024).toFixed(2)}MB`);
  console.log(`📦 Total optimized size: ${(totalOptimizedSize / 1024).toFixed(2)}MB`);
  console.log(`💾 Space saved: ${((totalOriginalSize - totalOptimizedSize) / 1024).toFixed(2)}MB`);
  console.log(`📉 Average reduction: ${totalOriginalSize > 0 ? ((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1) : 0}%`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
    console.log('   Run without --dry-run to actually optimize images.');
  } else {
    console.log('\n✅ Optimization complete!');
  }
}

// Run the script
optimizeSpeakerAvatars().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

