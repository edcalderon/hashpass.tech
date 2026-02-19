#!/usr/bin/env node

/**
 * Script to find missing speaker avatars and upload them
 * Compares database speakers with S3 bucket contents
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

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

// S3 client - Speaker avatars bucket uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS credentials');
  process.exit(1);
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
 * Get S3 key for speaker avatar
 */
function getS3Key(speakerName) {
  const filename = speakerNameToFilename(speakerName);
  return `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
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
 * List all avatars in S3
 */
async function listS3Avatars() {
  const avatars = new Set();
  let continuationToken = null;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: SPEAKER_AVATARS_PREFIX,
      ContinuationToken: continuationToken,
    });
    
    const response = await s3Client.send(command);
    
    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (obj.Key && obj.Key.endsWith('.png')) {
          avatars.add(obj.Key);
        }
      });
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return avatars;
}

/**
 * Upload image to S3
 */
async function uploadToS3(buffer, s3Key) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await s3Client.send(command);
    const url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Try to download avatar from blockchainsummit.la
 */
async function downloadFromWebsite(speakerName) {
  const filename = speakerNameToFilename(speakerName);
  // Also try with original name in case filename normalization changed it
  const originalFilename = speakerName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  const possibleUrls = [
    `https://blockchainsummit.la/wp-content/uploads/2025/10/foto-${filename}.png`,
    `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${filename}.png`,
    `https://blockchainsummit.la/wp-content/uploads/2025/11/foto-${filename}.png`,
    `https://blockchainsummit.la/wp-content/uploads/2025/10/foto-${originalFilename}.png`,
    `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${originalFilename}.png`,
  ];
  
  for (const url of possibleUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = await response.buffer();
        if (buffer.length > 0) {
          return { success: true, buffer, url };
        }
      }
    } catch (err) {
      // Try next URL
      continue;
    }
  }
  
  return { success: false };
}

async function main() {
  console.log('🚀 Finding and uploading missing speaker avatars...\n');
  console.log(`📦 Using S3 bucket: ${BUCKET_NAME}\n`);

  // Get all speakers from database
  console.log('📋 Fetching speakers from database...');
  const { data: speakers, error: speakersError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('name', 'is', null);

  if (speakersError) {
    console.error('❌ Error fetching speakers:', speakersError);
    process.exit(1);
  }

  console.log(`✅ Found ${speakers.length} speakers in database\n`);

  // Find speakers that don't have S3 URLs or need avatars uploaded
  console.log('📋 Finding speakers that need avatars uploaded...\n');
  
  const missing = [];
  let hasS3Url = 0;
  
  for (const speaker of speakers) {
    const s3Key = getS3Key(speaker.name);
    const hasS3 = speaker.imageurl && (
      speaker.imageurl.includes('s3.amazonaws.com') || 
      speaker.imageurl.includes('hashpass-assets')
    );
    
    if (hasS3) {
      hasS3Url++;
    } else {
      // Try to upload if we can find the image
      missing.push({
        name: speaker.name,
        s3Key,
        imageurl: speaker.imageurl,
      });
    }
  }
  
  console.log(`✅ Found ${hasS3Url} speakers with S3 URLs`);

  console.log(`\n🔍 Found ${missing.length} missing avatars:\n`);
  missing.forEach((m, i) => {
    console.log(`${i + 1}. ${m.name} -> ${m.s3Key}`);
  });

  if (missing.length === 0) {
    console.log('\n✅ All avatars are present in S3!');
    return;
  }

  console.log(`\n📥 Attempting to upload ${missing.length} missing avatars...\n`);

  let uploaded = 0;
  let failed = 0;

  for (const speaker of missing) {
    try {
      console.log(`\n🔍 Processing ${speaker.name}...`);
      
      // Try to download from blockchainsummit.la
      const downloadResult = await downloadFromWebsite(speaker.name);
      
      if (downloadResult.success) {
        console.log(`   ✅ Found on website: ${downloadResult.url}`);
        console.log(`   📤 Uploading to S3...`);
        
        const uploadResult = await uploadToS3(downloadResult.buffer, speaker.s3Key);
        
        if (uploadResult.success) {
          console.log(`   ✅ Uploaded: ${uploadResult.url}`);
          uploaded++;
          
          // Update database with S3 URL
          const { error: updateError } = await supabase
            .from('bsl_speakers')
            .update({ imageurl: uploadResult.url })
            .eq('name', speaker.name);
          
          if (updateError) {
            console.log(`   ⚠️  Failed to update DB: ${updateError.message}`);
          } else {
            console.log(`   ✅ Updated database`);
          }
        } else {
          console.log(`   ❌ Upload failed: ${uploadResult.error}`);
          failed++;
        }
      } else {
        console.log(`   ⚠️  Not found on blockchainsummit.la`);
        console.log(`   💡 You may need to manually upload: ${speaker.s3Key}`);
        failed++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${speaker.name}:`, error.message);
      failed++;
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Uploaded: ${uploaded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Speakers with S3 URLs: ${hasS3Url + uploaded}`);
  console.log(`   👥 Total speakers: ${speakers.length}`);
}

main().catch(console.error);

