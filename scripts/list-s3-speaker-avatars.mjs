#!/usr/bin/env node

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// Speaker avatars bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

async function listSpeakerAvatars() {
  console.log('📋 Listing speaker avatars in S3...\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Prefix: speakers/avatars/\n`);

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'speakers/avatars/',
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);
    const objects = response.Contents || [];

    if (objects.length === 0) {
      console.log('❌ No objects found in speakers/avatars/');
      return;
    }

    console.log(`✅ Found ${objects.length} objects:\n`);

    // Filter for cesar-ferrari
    const cesarFiles = objects.filter(obj => 
      obj.Key?.toLowerCase().includes('cesar-ferrari')
    );

    if (cesarFiles.length > 0) {
      console.log('📸 Files matching "cesar-ferrari":');
      cesarFiles.forEach(obj => {
        const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${obj.Key}`;
        console.log(`   - ${obj.Key}`);
        console.log(`     URL: ${url}`);
        console.log(`     Size: ${obj.Size} bytes`);
        console.log('');
      });
    } else {
      console.log('⚠️  No files found matching "cesar-ferrari"');
      console.log('\nFirst 10 files found:');
      objects.slice(0, 10).forEach(obj => {
        console.log(`   - ${obj.Key}`);
      });
    }

    // Test public access for cesar-ferrari files
    if (cesarFiles.length > 0) {
      console.log('\n🔍 Testing public access:');
      for (const obj of cesarFiles) {
        const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${obj.Key}`;
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            console.log(`   ✅ ${obj.Key} - Accessible (${response.status})`);
          } else {
            console.log(`   ❌ ${obj.Key} - ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.log(`   ⚠️  ${obj.Key} - Error: ${error.message}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error listing objects:', error.message);
    if (error.$metadata) {
      console.error('   Status:', error.$metadata.httpStatusCode);
      console.error('   Request ID:', error.$metadata.requestId);
    }
  }
}

listSpeakerAvatars().catch(console.error);

