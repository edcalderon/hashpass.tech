#!/usr/bin/env node

/**
 * Script to download speaker avatars from provided URLs
 * and upload them to S3, then update the database with S3 URLs
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

// S3 client - use hashpass-assets bucket
// Speaker avatars bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const CDN_URL = (process.env.AWS_S3_CDN_URL || process.env.AWS_S3_BUCKET_URL || '').trim();
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
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

// List of URLs provided by user
const PROVIDED_URLS = [
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-andra-meza.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/foto-Maria-Paula-Rodriguez.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-juan-pablo-gutierrez.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-william-.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/Foto-Steffen-Harting.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-albi.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-judith.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-dani-aguilar.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-Alireza-Siadat.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-Nathaly-Diniz.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-Juan-Pablo-Salazar.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-Stephanie-Sanchez.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/foto-monica-arellano.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-edison.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-mariangel.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/Foto-Albert-Prat.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/foto-Luisa-Cardenas-2.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/foto-Markus-Kluge.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-Daniel-Marulanda.png',
  'https://blockchainsummit.la/teams/paula-bermudez/',
  'https://blockchainsummit.la/teams/diego-osuna/',
  'https://blockchainsummit.la/teams/juliana-franco/',
  'https://blockchainsummit.la/teams/daniela-corredor/',
  'https://blockchainsummit.la/teams/javier-lozano/',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/foto-lisa-parra.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/foto-Oscar-Moratto.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/foto-Miguel-Calero-1.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/foto-Andrea-jaramillo.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/fotoMarco-Suvillaga.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/logo-manu-Hersch.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/10/foto-federico-bikupovich.png',
  'https://blockchainsummit.la/wp-content/uploads/2025/11/foto-Nicolas-Perez.png',
];

/**
 * Extract speaker name from URL
 */
function extractSpeakerNameFromUrl(url) {
  // Handle image URLs: foto-name.png -> Name
  if (url.includes('/wp-content/uploads/')) {
    // Try standard pattern: foto-name.png
    let match = url.match(/foto-([^.]+)\.(png|jpg|jpeg)/i);
    if (match) {
      const namePart = match[1];
      // Convert kebab-case to Title Case
      return namePart
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
    }
    
    // Try pattern without "foto-" prefix: fotoMarco-Suvillaga.png
    match = url.match(/(?:foto|logo)([A-Z][^-]+(?:-[A-Z][^-]+)*)\.(png|jpg|jpeg)/i);
    if (match) {
      const namePart = match[1];
      // Convert kebab-case to Title Case
      return namePart
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
    }
    
    // Try any filename pattern: extract from last part of path
    match = url.match(/\/([^\/]+)\.(png|jpg|jpeg)$/i);
    if (match) {
      let namePart = match[1];
      // Remove common prefixes
      namePart = namePart.replace(/^(foto|logo|photo|img|image)[-]?/i, '');
      // Remove trailing numbers and dashes
      namePart = namePart.replace(/[-]?\d+$/, '');
      // Convert to Title Case
      return namePart
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
    }
  }
  
  // Handle profile URLs: /teams/name/ -> Name
  if (url.includes('/teams/')) {
    const match = url.match(/\/teams\/([^\/]+)/);
    if (match) {
      const namePart = match[1];
      return namePart
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
    }
  }
  
  return null;
}

/**
 * Extract image URL from profile page (if needed)
 * For now, we'll skip profile URLs and only process direct image URLs
 */
function isImageUrl(url) {
  return url.match(/\.(png|jpg|jpeg)$/i);
}

/**
 * Convert profile URL to image URL
 */
function profileUrlToImageUrl(url) {
  if (url.includes('/teams/')) {
    const match = url.match(/\/teams\/([^\/]+)/);
    if (match) {
      const slug = match[1];
      // Try common image URL patterns
      return `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
    }
  }
  return null;
}

/**
 * Convert speaker name to filename (reverse of speakerNameToFilename)
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
 * Find speaker in database by name (fuzzy match)
 */
async function findSpeakerByName(name) {
  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .ilike('name', name)
    .limit(1);

  if (exactMatch && exactMatch.length > 0) {
    return exactMatch[0];
  }

  // Try partial match
  const { data: partialMatch } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .ilike('name', `%${name}%`)
    .limit(5);

  if (partialMatch && partialMatch.length > 0) {
    // Return the best match (shortest name that contains the search term)
    return partialMatch.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting speaker avatar download and upload process...\n');
  console.log(`📦 Using S3 bucket: ${BUCKET_NAME}\n`);

  // Process URLs - convert profile URLs to image URLs
  const processedUrls = PROVIDED_URLS.map(url => {
    if (isImageUrl(url)) {
      return url;
    }
    // Try to convert profile URL to image URL
    const imageUrl = profileUrlToImageUrl(url);
    return imageUrl || url;
  }).filter(url => url && (isImageUrl(url) || url.includes('/wp-content/uploads/')));

  console.log(`📋 Processing ${processedUrls.length} URLs\n`);

  let downloaded = 0;
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  let updated = 0;
  let notFound = 0;

  for (const url of processedUrls) {
    try {
      const speakerName = extractSpeakerNameFromUrl(url);
      
      if (!speakerName) {
        console.log(`⏭️  Skipping ${url} - could not extract speaker name`);
        skipped++;
        continue;
      }

      console.log(`\n🔍 Processing: ${speakerName}`);
      console.log(`   URL: ${url}`);

      // Find speaker in database
      const speaker = await findSpeakerByName(speakerName);
      
      if (!speaker) {
        console.log(`   ⚠️  Speaker "${speakerName}" not found in database`);
        notFound++;
        // Continue anyway - we'll still upload to S3
      } else {
        console.log(`   ✅ Found in DB: ${speaker.name} (${speaker.id})`);
      }

      // Generate S3 key
      const filename = speakerNameToFilename(speakerName);
      const s3Key = `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
      const s3Url = getS3AvatarUrl(speakerName);

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
        console.log(`   ✅ Already in S3`);
        
        // Update DB with S3 URL if speaker found
        if (speaker) {
          const { error: updateError } = await supabase
            .from('bsl_speakers')
            .update({ 
              imageurl: s3Url
            })
            .eq('id', speaker.id);

          if (!updateError) {
            console.log(`   ✅ Updated DB with S3 URL`);
            updated++;
          } else {
            console.error(`   ⚠️  Failed to update DB: ${updateError.message}`);
          }
        }
        continue;
      }

      // Download image
      console.log(`   📥 Downloading...`);
      let imageBuffer;
      try {
        imageBuffer = await downloadImage(url);
        downloaded++;
        console.log(`   ✅ Downloaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
      } catch (downloadError) {
        console.error(`   ❌ Failed to download: ${downloadError.message}`);
        failed++;
        continue;
      }

      // Upload to S3
      console.log(`   📤 Uploading to S3...`);
      const uploadResult = await uploadToS3(imageBuffer, s3Key, 'image/png');

      if (uploadResult.success) {
        console.log(`   ✅ Uploaded to S3: ${uploadResult.url}`);
        uploaded++;

        // Update database with S3 URL if speaker found
        if (speaker) {
          const { error: updateError } = await supabase
            .from('bsl_speakers')
            .update({ 
              imageurl: uploadResult.url
            })
            .eq('id', speaker.id);

          if (updateError) {
            console.error(`   ⚠️  Failed to update DB: ${updateError.message}`);
          } else {
            console.log(`   ✅ Updated DB with S3 URL`);
            updated++;
          }
        }
      } else {
        console.error(`   ❌ Failed to upload: ${uploadResult.error}`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${url}:`, error.message || error);
      failed++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Uploaded to S3: ${uploaded}`);
  console.log(`   Updated in DB: ${updated}`);
  console.log(`   Not found in DB: ${notFound}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n✅ Process completed!`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

