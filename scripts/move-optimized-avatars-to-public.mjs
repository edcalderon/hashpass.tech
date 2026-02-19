#!/usr/bin/env node

/**
 * Script to move optimized speaker avatars (< 300KB) to public folder
 * Checks S3 avatars, downloads them if optimized, and moves to public/assets/speakers/avatars/
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseServer } from '../lib/supabase-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const MAX_SIZE_KB = 300; // 300KB limit
const PUBLIC_AVATARS_DIR = join(__dirname, '..', 'public', 'assets', 'speakers', 'avatars');
const S3_BUCKET = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || 'hashpass-assets';
const AWS_REGION = process.env.AWS_REGION || process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-2';

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

/**
 * Convert speaker name to filename
 */
function speakerNameToFilename(name) {
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
 * Get file size in KB
 */
function getFileSizeKB(filePath) {
  try {
    const stats = statSync(filePath);
    return stats.size / 1024;
  } catch (error) {
    return null;
  }
}

/**
 * Download file from S3
 */
async function downloadFromS3(s3Key, localPath) {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    
    // Ensure directory exists
    const dir = dirname(localPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write to file
    const writeStream = createWriteStream(localPath);
    await pipeline(response.Body, writeStream);
    
    return true;
  } catch (error) {
    console.error(`Error downloading ${s3Key}:`, error.message);
    return false;
  }
}

/**
 * Get S3 object size
 */
async function getS3ObjectSize(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    return (response.ContentLength || 0) / 1024; // Size in KB
  } catch (error) {
    console.error(`Error getting size for ${s3Key}:`, error.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting optimized avatar migration to public folder...');
  console.log(`📦 S3 Bucket: ${S3_BUCKET}`);
  console.log(`📁 Target directory: ${PUBLIC_AVATARS_DIR}`);
  console.log(`📏 Max size: ${MAX_SIZE_KB}KB`);
  console.log('');

  // Ensure public directory exists
  if (!existsSync(PUBLIC_AVATARS_DIR)) {
    mkdirSync(PUBLIC_AVATARS_DIR, { recursive: true });
    console.log(`✅ Created directory: ${PUBLIC_AVATARS_DIR}`);
  }

  // Get all speakers from database
  console.log('📋 Fetching speakers from database...');
  const { data: speakers, error } = await supabaseServer
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('imageurl', 'is', null);

  if (error) {
    console.error('❌ Error fetching speakers:', error);
    process.exit(1);
  }

  if (!speakers || speakers.length === 0) {
    console.log('ℹ️ No speakers found');
    return;
  }

  console.log(`✅ Found ${speakers.length} speakers with images\n`);

  let processed = 0;
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (const speaker of speakers) {
    try {
      processed++;
      const filename = speakerNameToFilename(speaker.name);
      const s3Key = `speakers/avatars/foto-${filename}.png`;
      const localPath = join(PUBLIC_AVATARS_DIR, `foto-${filename}.png`);

      // Check if already exists locally
      if (existsSync(localPath)) {
        const localSize = getFileSizeKB(localPath);
        if (localSize && localSize <= MAX_SIZE_KB) {
          console.log(`⏭️  ${speaker.name}: Already exists locally (${localSize.toFixed(2)}KB)`);
          skipped++;
          continue;
        } else if (localSize && localSize > MAX_SIZE_KB) {
          console.log(`⚠️  ${speaker.name}: Local file too large (${localSize.toFixed(2)}KB), skipping`);
          skipped++;
          continue;
        }
      }

      // Check S3 object size
      console.log(`📊 Checking ${speaker.name}...`);
      const s3Size = await getS3ObjectSize(s3Key);
      
      if (!s3Size) {
        console.log(`   ⚠️  Could not get size from S3, skipping`);
        skipped++;
        continue;
      }

      if (s3Size > MAX_SIZE_KB) {
        console.log(`   ⏭️  Size ${s3Size.toFixed(2)}KB exceeds ${MAX_SIZE_KB}KB limit, skipping`);
        skipped++;
        continue;
      }

      // Download and move to public folder
      console.log(`   ⬇️  Downloading (${s3Size.toFixed(2)}KB)...`);
      const downloaded = await downloadFromS3(s3Key, localPath);
      
      if (!downloaded) {
        console.log(`   ❌ Failed to download`);
        errors++;
        continue;
      }

      // Verify local file size
      const finalSize = getFileSizeKB(localPath);
      if (finalSize && finalSize <= MAX_SIZE_KB) {
        console.log(`   ✅ Moved to public folder (${finalSize.toFixed(2)}KB)`);
        moved++;
      } else {
        console.log(`   ⚠️  File size mismatch (${finalSize?.toFixed(2)}KB), removing`);
        // Remove file if it's too large
        try {
          const fs = await import('fs');
          fs.unlinkSync(localPath);
        } catch (e) {
          // Ignore
        }
        skipped++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${speaker.name}:`, error.message);
      errors++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Processed: ${processed}`);
  console.log(`   Moved: ${moved}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`\n✅ Done! Optimized avatars are now in: ${PUBLIC_AVATARS_DIR}`);
}

main().catch(console.error);

