#!/usr/bin/env node

import { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand, GetPublicAccessBlockCommand, PutPublicAccessBlockCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

async function checkObjectExists(s3Key) {
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
    // If we get 403, it might be a permissions issue, but object might still exist
    if (error.$metadata?.httpStatusCode === 403) {
      console.log('   ⚠️  Cannot verify object existence (permissions issue), but continuing...');
      return null; // Unknown
    }
    throw error;
  }
}

async function main() {
  console.log('🔧 Fixing S3 Public Access Configuration\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Region: ${REGION}\n`);

  // Test object
  const testKey = 'speakers/avatars/foto-cesar-ferrari-1.png';
  console.log(`Testing object: ${testKey}`);

  // Check if object exists (may fail due to permissions, but that's OK)
  const exists = await checkObjectExists(testKey);
  if (exists === false) {
    console.log(`❌ Object does not exist: ${testKey}`);
    console.log(`   This might be the issue - the file needs to be uploaded first.`);
    console.log(`   Try running: node scripts/optimize-speaker-avatars.mjs`);
    return;
  } else if (exists === true) {
    console.log(`✅ Object exists: ${testKey}\n`);
  } else {
    console.log(`⚠️  Cannot verify object existence (continuing anyway)\n`);
  }

  // Step 1: Ensure Block Public Access is disabled
  console.log('STEP 1: Checking Block Public Access Settings...');
  try {
    const publicAccessBlockCommand = new GetPublicAccessBlockCommand({
      Bucket: BUCKET_NAME,
    });
    const publicAccessBlock = await s3Client.send(publicAccessBlockCommand);
    const config = publicAccessBlock.PublicAccessBlockConfiguration || {};
    
    const needsUpdate = config.BlockPublicAcls !== false ||
                       config.IgnorePublicAcls !== false ||
                       config.BlockPublicPolicy !== false ||
                       config.RestrictPublicBuckets !== false;

    if (needsUpdate) {
      console.log('⚠️  Block Public Access needs to be disabled');
      console.log('   Updating...');
      
      const putPublicAccessBlockCommand = new PutPublicAccessBlockCommand({
        Bucket: BUCKET_NAME,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      });
      await s3Client.send(putPublicAccessBlockCommand);
      console.log('✅ Block Public Access disabled\n');
    } else {
      console.log('✅ Block Public Access is already disabled\n');
    }
  } catch (error) {
    console.error('❌ Error checking/updating Block Public Access:', error.message);
    return;
  }

  // Step 2: Ensure bucket policy is correct
  console.log('STEP 2: Checking Bucket Policy...');
  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadGetObjectForSpeakerAvatars',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${BUCKET_NAME}/speakers/avatars/*`,
      },
    ],
  };

  try {
    const getPolicyCommand = new GetBucketPolicyCommand({
      Bucket: BUCKET_NAME,
    });
    const currentPolicy = await s3Client.send(getPolicyCommand);
    const currentPolicyJson = JSON.parse(currentPolicy.Policy || '{}');
    
    // Compare policies (simplified check)
    const needsUpdate = JSON.stringify(currentPolicyJson) !== JSON.stringify(bucketPolicy);
    
    if (needsUpdate) {
      console.log('⚠️  Bucket policy needs to be updated');
      console.log('   Updating...');
      
      const putPolicyCommand = new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify(bucketPolicy),
      });
      await s3Client.send(putPolicyCommand);
      console.log('✅ Bucket policy updated\n');
      console.log('   Policy:', JSON.stringify(bucketPolicy, null, 2));
    } else {
      console.log('✅ Bucket policy is correct\n');
    }
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      console.log('⚠️  No bucket policy found, adding one...');
      try {
        const putPolicyCommand = new PutBucketPolicyCommand({
          Bucket: BUCKET_NAME,
          Policy: JSON.stringify(bucketPolicy),
        });
        await s3Client.send(putPolicyCommand);
        console.log('✅ Bucket policy added\n');
      } catch (putError) {
        console.error('❌ Error adding bucket policy:', putError.message);
        return;
      }
    } else {
      console.error('❌ Error checking bucket policy:', error.message);
      return;
    }
  }

  // Step 3: Test access
  console.log('STEP 3: Testing Public Access...');
  const testUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${testKey}`;
  console.log(`   URL: ${testUrl}`);
  console.log(`   ⏳ Waiting 5 seconds for policy propagation...`);
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log(`\n✅ Configuration complete!`);
  console.log(`\n   Test the URL in your browser:`);
  console.log(`   ${testUrl}`);
  console.log(`\n   Or run:`);
  console.log(`   curl -I "${testUrl}"`);
}

main().catch(console.error);
