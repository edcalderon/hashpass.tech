#!/usr/bin/env node

/**
 * Diagnostic script to check S3 bucket public access configuration
 */

import { S3Client, GetBucketPolicyCommand, GetPublicAccessBlockCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

async function testPublicAccess(s3Key) {
  const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${s3Key}`;
  console.log(`\n🔍 Testing public access to: ${s3Key}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url, { method: 'HEAD' });
    console.log(`   Status: ${response.status} ${response.statusText}`);
    if (response.status === 200) {
      console.log(`   ✅ Public access works!`);
      return true;
    } else {
      console.log(`   ❌ Public access failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

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
    throw error;
  }
}

async function main() {
  console.log('🔍 S3 Bucket Public Access Diagnostic\n');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Region: ${REGION}\n`);

  // Test objects
  const testObjects = [
    'speakers/avatars/foto-cesar-ferrari-1.png',
    'speakers/avatars/foto-test.png',
  ];

  // Step 1: Check Block Public Access
  console.log('STEP 1: Checking Block Public Access Settings...');
  try {
    const publicAccessBlockCommand = new GetPublicAccessBlockCommand({
      Bucket: BUCKET_NAME,
    });
    const publicAccessBlock = await s3Client.send(publicAccessBlockCommand);
    const config = publicAccessBlock.PublicAccessBlockConfiguration || {};
    
    console.log(`   BlockPublicAcls: ${config.BlockPublicAcls}`);
    console.log(`   IgnorePublicAcls: ${config.IgnorePublicAcls}`);
    console.log(`   BlockPublicPolicy: ${config.BlockPublicPolicy}`);
    console.log(`   RestrictPublicBuckets: ${config.RestrictPublicBuckets}`);
    
    const isBlocked = config.BlockPublicAcls === true ||
                     config.IgnorePublicAcls === true ||
                     config.BlockPublicPolicy === true ||
                     config.RestrictPublicBuckets === true;
    
    if (isBlocked) {
      console.log(`   ⚠️  Block Public Access is ENABLED - this will prevent public access!`);
    } else {
      console.log(`   ✅ Block Public Access is disabled`);
    }
  } catch (error) {
    console.error(`   ❌ Error checking Block Public Access: ${error.message}`);
  }

  // Step 2: Check Bucket Policy
  console.log('\nSTEP 2: Checking Bucket Policy...');
  try {
    const getPolicyCommand = new GetBucketPolicyCommand({
      Bucket: BUCKET_NAME,
    });
    const currentPolicy = await s3Client.send(getPolicyCommand);
    const currentPolicyJson = JSON.parse(currentPolicy.Policy || '{}');
    
    console.log(`   ✅ Bucket policy exists:`);
    console.log(JSON.stringify(currentPolicyJson, null, 2));
    
    // Check if policy allows public access to speakers/avatars/*
    const hasPublicAccess = currentPolicyJson.Statement?.some((stmt) => {
      return stmt.Effect === 'Allow' &&
             stmt.Principal === '*' &&
             (stmt.Action?.includes('s3:GetObject') || (Array.isArray(stmt.Action) && stmt.Action.includes('s3:GetObject'))) &&
             stmt.Resource?.includes('speakers/avatars');
    });
    
    if (hasPublicAccess) {
      console.log(`   ✅ Policy allows public access to speakers/avatars/*`);
    } else {
      console.log(`   ⚠️  Policy may not allow public access to speakers/avatars/*`);
    }
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      console.log(`   ❌ No bucket policy found!`);
    } else {
      console.error(`   ❌ Error checking bucket policy: ${error.message}`);
    }
  }

  // Step 3: Check if objects exist
  console.log('\nSTEP 3: Checking if objects exist...');
  for (const s3Key of testObjects) {
    try {
      const exists = await checkObjectExists(s3Key);
      if (exists) {
        console.log(`   ✅ Object exists: ${s3Key}`);
      } else {
        console.log(`   ❌ Object does NOT exist: ${s3Key}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Cannot check object (permissions issue): ${s3Key}`);
    }
  }

  // Step 4: Test public access
  console.log('\nSTEP 4: Testing public HTTP access...');
  for (const s3Key of testObjects) {
    await testPublicAccess(s3Key);
  }

  console.log('\n📋 Summary:');
  console.log('If objects exist but public access fails:');
  console.log('1. Verify Block Public Access is disabled');
  console.log('2. Verify bucket policy allows public access');
  console.log('3. Wait 1-2 minutes for policy changes to propagate');
  console.log('4. Check if objects need public-read ACL (if using ACLs)');
}

main().catch(console.error);

