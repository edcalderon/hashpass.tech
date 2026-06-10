#!/usr/bin/env node

/**
 * Upload missing avatars with correct filenames
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || 'hashpass-assets';
const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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

async function downloadAndUpload(speakerName, incorrectUrl) {
  const correctFilename = speakerNameToFilename(speakerName);
  const correctS3Key = `${SPEAKER_AVATARS_PREFIX}foto-${correctFilename}.png`;
  
  // Generate filename variations
  const variations = [correctFilename];
  
  // Add variations based on common issues
  if (speakerName.includes('Bermúdez')) variations.push('paula-vermudez');
  if (speakerName.includes('Outumuro')) variations.push('jose-outomouro');
  if (speakerName.includes('Alvarez-Ossorio')) {
    variations.push('rocio-alvarez-ossorio', 'rocio-alvarez');
  }
  if (speakerName.includes('Luther')) variations.push('luther');
  if (speakerName.includes('Kieve')) variations.push('kieve');
  
  // Try to download from blockchainsummit.la
  const possibleUrls = [];
  for (const variation of variations) {
    possibleUrls.push(
      `https://blockchainsummit.la/wp-content/uploads/2025/10/foto-${variation}.png`,
      `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${variation}.png`,
      `https://blockchainsummit.la/wp-content/uploads/2025/11/foto-${variation}.png`,
    );
  }
  
  // Also try extracting from incorrect URL if it's blockchainsummit.la
  if (incorrectUrl && incorrectUrl.includes('blockchainsummit.la')) {
    possibleUrls.unshift(incorrectUrl);
  }
  
  for (const url of possibleUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = await response.buffer();
        if (buffer.length > 0) {
          // Upload to S3
          const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: correctS3Key,
            Body: buffer,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000, immutable',
          });
          
          await s3Client.send(command);
          const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${correctS3Key}`;
          
          // Update database
          await supabase
            .from('bsl_speakers')
            .update({ imageurl: s3Url })
            .eq('name', speakerName);
          
          return { success: true, url: s3Url, source: url };
        }
      }
    } catch (err) {
      continue;
    }
  }
  
  return { success: false };
}

const missing = [
  { name: 'Rocío Alvarez-Ossorio', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-rocio-alvarez.png' },
  { name: 'Marcos Carpio', url: null },
  { name: 'Carlos Salinas', url: null },
  { name: 'Luther Maday', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-luther.png' },
  { name: 'Paula Bermúdez', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-paula-vermudez.png' },
  { name: 'Stephanie Sánchez', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-Stephanie-Sanchez.png' },
  { name: 'José Outumuro', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-jose-outomouro.png' },
  { name: 'Kieve Huffman', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-kieve.png' },
  { name: 'Luisa Cárdenas', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-Luisa-Cardenas.png' },
  { name: 'María Paula Rodríguez', url: 'https://hashpass-assets.s3.us-east-2.amazonaws.com/speakers/avatars/foto-Maria-Paula-Rodriguez.png' },
];

async function main() {
  console.log('🚀 Uploading missing avatars...\n');
  
  let uploaded = 0;
  let failed = 0;
  
  for (const speaker of missing) {
    console.log(`\n🔍 Processing ${speaker.name}...`);
    const result = await downloadAndUpload(speaker.name, speaker.url);
    
    if (result.success) {
      console.log(`   ✅ Uploaded from: ${result.source}`);
      console.log(`   ✅ S3 URL: ${result.url}`);
      uploaded++;
    } else {
      console.log(`   ❌ Failed to find/download`);
      failed++;
    }
  }
  
  console.log(`\n\n📊 Summary:`);
  console.log(`   ✅ Uploaded: ${uploaded}`);
  console.log(`   ❌ Failed: ${failed}`);
}

main().catch(console.error);

