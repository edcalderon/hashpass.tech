#!/usr/bin/env node

/**
 * Script to configure S3 bucket for public read access to speaker avatars
 * Uses AWS SDK (already installed in the project)
 */

import { S3Client, PutPublicAccessBlockCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET_NAME = 'hashpass-assets';
const REGION = process.env.AWS_REGION || 'us-east-2';
const POLICY_PATH = 'speakers/avatars/*';

// Initialize S3 client
const s3Client = new S3Client({
  region: REGION,
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

async function main() {
  console.log('==========================================');
  console.log('S3 Bucket Public Access Configuration');
  console.log('==========================================');
  console.log('');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Path: ${POLICY_PATH}`);
  console.log('');

  try {
    // Step 1: Disable Block Public Access
    console.log('STEP 1: Disable Block Public Access');
    console.log('-----------------------------------');
    console.log('Disabling block public access settings...');
    
    try {
      const publicAccessBlockCommand = new PutPublicAccessBlockCommand({
        Bucket: BUCKET_NAME,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      });
      
      await s3Client.send(publicAccessBlockCommand);
      console.log('✅ Block public access disabled');
    } catch (error) {
      console.error('❌ Failed to disable block public access:', error.message);
      console.error('   Please do this manually in AWS Console');
      console.error('   See: docs/MAKE_S3_BUCKET_PUBLIC.md');
      process.exit(1);
    }

    console.log('');
    
    // Step 2: Add Bucket Policy
    console.log('STEP 2: Add Bucket Policy');
    console.log('-------------------------');
    
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObjectForSpeakerAvatars',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${BUCKET_NAME}/${POLICY_PATH}`,
        },
      ],
    };

    console.log('Adding bucket policy...');
    console.log('Policy:', JSON.stringify(bucketPolicy, null, 2));
    
    try {
      const bucketPolicyCommand = new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify(bucketPolicy),
      });
      
      await s3Client.send(bucketPolicyCommand);
      console.log('✅ Bucket policy added');
    } catch (error) {
      console.error('❌ Failed to add bucket policy:', error.message);
      console.error('');
      console.error('Policy JSON saved to: scripts/s3-bucket-policy-speaker-avatars.json');
      console.error('Please add it manually in AWS Console:');
      console.error(`   https://s3.console.aws.amazon.com/s3/buckets/${BUCKET_NAME}?region=${REGION}&tab=permissions`);
      process.exit(1);
    }

    console.log('');
    
    // Step 3: Verify
    console.log('STEP 3: Verify Configuration');
    console.log('---------------------------');
    console.log('✅ Configuration complete!');
    console.log('');
    console.log('Test URL:');
    const testUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/speakers/avatars/foto-claudia-restrepo.png`;
    console.log(`   ${testUrl}`);
    console.log('');
    console.log('Test with:');
    console.log(`   curl -I "${testUrl}"`);
    console.log('');
    console.log('Expected: HTTP/1.1 200 OK');
    console.log('');
    console.log('⚠️  Note: Changes may take a few minutes to propagate.');
    console.log('   If you still see 403 errors, wait 2-3 minutes and try again.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Please follow manual steps in: docs/MAKE_S3_BUCKET_PUBLIC.md');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

