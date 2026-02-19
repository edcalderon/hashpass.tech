#!/usr/bin/env node

import { S3Client, GetBucketPolicyCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const BUCKET_NAME = 'hashpass-assets';
const REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

async function main() {
  console.log('Checking current S3 bucket configuration...\n');
  
  // Check public access block
  try {
    const publicAccessBlockCommand = new GetPublicAccessBlockCommand({
      Bucket: BUCKET_NAME,
    });
    const publicAccessBlock = await s3Client.send(publicAccessBlockCommand);
    console.log('Block Public Access Settings:');
    console.log('  BlockPublicAcls:', publicAccessBlock.PublicAccessBlockConfiguration?.BlockPublicAcls);
    console.log('  IgnorePublicAcls:', publicAccessBlock.PublicAccessBlockConfiguration?.IgnorePublicAcls);
    console.log('  BlockPublicPolicy:', publicAccessBlock.PublicAccessBlockConfiguration?.BlockPublicPolicy);
    console.log('  RestrictPublicBuckets:', publicAccessBlock.PublicAccessBlockConfiguration?.RestrictPublicBuckets);
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not read public access block:', error.message);
  }
  
  // Check bucket policy
  try {
    const bucketPolicyCommand = new GetBucketPolicyCommand({
      Bucket: BUCKET_NAME,
    });
    const bucketPolicy = await s3Client.send(bucketPolicyCommand);
    console.log('Current Bucket Policy:');
    console.log(JSON.stringify(JSON.parse(bucketPolicy.Policy || '{}'), null, 2));
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      console.log('No bucket policy found - needs to be added');
    } else {
      console.log('⚠️  Could not read bucket policy:', error.message);
    }
  }
}

main().catch(console.error);

