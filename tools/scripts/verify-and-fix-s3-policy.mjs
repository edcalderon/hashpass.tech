#!/usr/bin/env node

/**
 * Script to verify and fix S3 bucket policy
 * This script will update the bucket policy to ensure public access works
 */

import { S3Client, PutBucketPolicyCommand, GetBucketPolicyCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

async function main() {
  console.log('🔧 Verifying and fixing S3 bucket policy...\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Region: ${REGION}\n`);

  // Read the policy file
  const policyPath = path.join(process.cwd(), 'scripts', 's3-bucket-policy-speaker-avatars.json');
  let bucketPolicy;
  
  try {
    const policyContent = fs.readFileSync(policyPath, 'utf-8');
    bucketPolicy = JSON.parse(policyContent);
    console.log('✅ Loaded bucket policy from file');
    console.log(JSON.stringify(bucketPolicy, null, 2));
    console.log('');
  } catch (error) {
    console.error('❌ Error reading policy file:', error.message);
    process.exit(1);
  }

  // Update the bucket name in the policy if needed
  bucketPolicy.Statement[0].Resource = `arn:aws:s3:::${BUCKET_NAME}/speakers/avatars/*`;
  
  console.log('📝 Policy to apply:');
  console.log(JSON.stringify(bucketPolicy, null, 2));
  console.log('');

  // Apply the policy
  try {
    console.log('Applying bucket policy...');
    const command = new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy),
    });
    
    await s3Client.send(command);
    console.log('✅ Bucket policy applied successfully!\n');
    
    // Verify it was applied
    console.log('Verifying policy was applied...');
    const getCommand = new GetBucketPolicyCommand({
      Bucket: BUCKET_NAME,
    });
    const result = await s3Client.send(getCommand);
    const appliedPolicy = JSON.parse(result.Policy);
    console.log('✅ Verified - Policy is now:');
    console.log(JSON.stringify(appliedPolicy, null, 2));
    
  } catch (error) {
    console.error('❌ Error applying bucket policy:', error.message);
    console.error('\nPlease check:');
    console.error('1. AWS credentials have s3:PutBucketPolicy permission');
    console.error('2. Block public access is disabled');
    console.error('3. IAM user has necessary permissions');
    process.exit(1);
  }

  console.log('\n✅ Done!');
  console.log('\n⚠️  Note: Policy changes may take 1-2 minutes to propagate.');
  console.log('Test with:');
  console.log(`curl -I "https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/speakers/avatars/foto-cesar-ferrari-1.png"`);
}

main().catch(console.error);

