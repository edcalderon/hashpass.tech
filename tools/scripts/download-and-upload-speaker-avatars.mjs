#!/usr/bin/env node

/**
 * Script to download speaker avatars from blockchainsummit.la
 * and upload them to S3, then update the database with S3 URLs as fallback
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

// Speaker avatars bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = (
  process.env.EXPO_PUBLIC_AWS_S3_BUCKET || 
  process.env.AWS_S3_BUCKET || 
  process.env.AWS_S3_BUCKET_NAME || 
  'hashpass-assets'
).trim().replace(/[`'"]/g, '');
const CDN_URL = (process.env.AWS_S3_CDN_URL || process.env.AWS_S3_BUCKET_URL || '').trim();
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';

if (!BUCKET_NAME) {
  console.error('❌ Missing EXPO_PUBLIC_AWS_S3_BUCKET environment variable');
  console.error('   Please set EXPO_PUBLIC_AWS_S3_BUCKET in your .env file');
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS credentials');
  console.error('   Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
  process.exit(1);
}

// Temporary directory for downloads
const tempDir = path.join(__dirname, '..', 'temp', 'speaker-avatars');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Download image from URL
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          reject(new Error('Downloaded file is empty'));
          return;
        }
        resolve(buffer);
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout after 30 seconds'));
    });
  });
}

/**
 * Check if file exists in S3
 */
async function fileExistsInS3(s3Key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Upload image to S3
 */
async function uploadToS3(buffer, s3Key, contentType = 'image/png') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await s3Client.send(command);

    // Construct URL
    let url;
    if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
      url = `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
    } else {
      url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    }

    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get S3 URL for a speaker avatar
 */
function getS3AvatarUrl(speakerName) {
  const filename = speakerNameToFilename(speakerName);
  const s3Key = `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
  
  if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
    return `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  }
  
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}

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
 * Main function
 */
async function main() {
  console.log('🚀 Starting speaker avatar download and upload process...\n');

  // Get all speakers
  console.log('📋 Fetching speakers from database...');
  const { data: speakers, error: speakersError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('name', 'is', null);

  if (speakersError) {
    console.error('❌ Error fetching speakers:', speakersError);
    process.exit(1);
  }

  console.log(`✅ Found ${speakers.length} speakers\n`);

  let downloaded = 0;
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  let updated = 0;

  for (const speaker of speakers) {
    try {
      const originalUrl = speaker.imageurl;
      
      if (!originalUrl || !originalUrl.includes('blockchainsummit.la')) {
        console.log(`⏭️  Skipping ${speaker.name} - no blockchainsummit.la URL`);
        skipped++;
        continue;
      }

      // Generate S3 key
      const filename = speakerNameToFilename(speaker.name);
      const s3Key = `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
      const s3Url = getS3AvatarUrl(speaker.name);

      console.log(`\n🔍 Processing ${speaker.name}...`);
      console.log(`   Original URL: ${originalUrl}`);
      console.log(`   S3 Key: ${s3Key}`);
      console.log(`   S3 URL: ${s3Url}`);

      // Check if already in S3
      let existsInS3 = false;
      try {
        existsInS3 = await fileExistsInS3(s3Key);
      } catch (s3CheckError) {
        console.error(`   ⚠️  Error checking S3: ${s3CheckError.message}`);
      }
      
      if (existsInS3) {
        console.log(`✅ ${speaker.name} - Already in S3: ${s3Url}`);
        
        // Update DB with S3 URL (replace imageurl with S3 URL)
        const { error: updateError } = await supabase
          .from('bsl_speakers')
          .update({ 
            imageurl: s3Url // Update to S3 URL
          })
          .eq('id', speaker.id);

        if (!updateError) {
          console.log(`   ✅ Updated DB with S3 URL`);
          updated++;
        } else {
          console.error(`   ⚠️  Failed to update DB: ${updateError.message}`);
        }
        continue;
      }

      // Download image
      console.log(`📥 Downloading ${speaker.name} from ${originalUrl}...`);
      let imageBuffer;
      try {
        imageBuffer = await downloadImage(originalUrl);
        downloaded++;
      } catch (downloadError) {
        console.error(`❌ Failed to download ${speaker.name}: ${downloadError.message}`);
        failed++;
        continue;
      }

      // Upload to S3
      console.log(`📤 Uploading ${speaker.name} to S3...`);
      const uploadResult = await uploadToS3(imageBuffer, s3Key, 'image/png');

      if (uploadResult.success) {
        console.log(`✅ ${speaker.name} - Uploaded to S3: ${uploadResult.url}`);
        uploaded++;

        // Update database with S3 URL
        // We'll keep the original URL but add S3 as fallback
        // For now, update imageurl to use S3 URL (or we can add a new column)
        const { error: updateError } = await supabase
          .from('bsl_speakers')
          .update({ 
            imageurl: uploadResult.url // Update to S3 URL
          })
          .eq('id', speaker.id);

        if (updateError) {
          console.error(`⚠️  Failed to update DB for ${speaker.name}: ${updateError.message}`);
        } else {
          updated++;
        }
      } else {
        console.error(`❌ Failed to upload ${speaker.name}: ${uploadResult.error}`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${speaker.name}:`, error.message || error);
      console.error(`   Stack:`, error.stack);
      failed++;
    }
  }

  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }

  console.log('\n📊 Summary:');
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Uploaded to S3: ${uploaded}`);
  console.log(`   Updated in DB: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n✅ Process completed!`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

