#!/usr/bin/env node

/**
 * Test S3 connection and list bucket contents
 */

// Load environment variables from .env file
require('dotenv').config();

const { S3Client, ListBucketsCommand, ListObjectsV2Command, HeadBucketCommand } = require('@aws-sdk/client-s3');

async function testConnection() {
  console.log('🔍 Testing S3 Connection...\n');

  // Check environment variables
  const requiredVars = ['AWS_S3_BUCKET_NAME', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables before running the script.');
    process.exit(1);
  }

  // Clean bucket name (remove quotes/backticks)
  const bucketName = (process.env.AWS_S3_BUCKET_NAME || '').trim().replace(/[`'"]/g, '');
  
  console.log('Configuration:');
  console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Access Key ID: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...`);
  if (process.env.AWS_S3_CDN_URL) {
    console.log(`   CDN URL: ${process.env.AWS_S3_CDN_URL}`);
  }
  console.log('');

  // Create S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    // Test 1: List buckets (to verify credentials)
    console.log('📋 Test 1: Listing buckets...');
    const listBucketsCommand = new ListBucketsCommand({});
    const bucketsResponse = await s3Client.send(listBucketsCommand);
    console.log(`   ✅ Successfully connected to AWS S3`);
    console.log(`   Found ${bucketsResponse.Buckets?.length || 0} bucket(s)`);
    if (bucketsResponse.Buckets && bucketsResponse.Buckets.length > 0) {
      console.log('   Buckets:');
      bucketsResponse.Buckets.forEach(bucket => {
        console.log(`     - ${bucket.Name} (created: ${bucket.CreationDate})`);
      });
    }
    console.log('');

    // Test 2: Check if target bucket exists and is accessible
    console.log(`📋 Test 2: Checking bucket '${bucketName}'...`);
    const headBucketCommand = new HeadBucketCommand({
      Bucket: bucketName,
    });
    await s3Client.send(headBucketCommand);
    console.log(`   ✅ Bucket exists and is accessible`);
    console.log('');

    // Test 3: List objects in emails/assets/ prefix
    console.log('📋 Test 3: Listing existing assets in emails/assets/...');
    const listObjectsCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'emails/assets/',
    });
    const objectsResponse = await s3Client.send(listObjectsCommand);
    
    if (objectsResponse.Contents && objectsResponse.Contents.length > 0) {
      console.log(`   ✅ Found ${objectsResponse.Contents.length} existing asset(s):`);
      objectsResponse.Contents.forEach(obj => {
        const sizeKB = (obj.Size / 1024).toFixed(2);
        console.log(`     - ${obj.Key} (${sizeKB} KB, modified: ${obj.LastModified})`);
      });
    } else {
      console.log('   ℹ️  No existing assets found in emails/assets/');
    }
    console.log('');

    console.log('✅ All connection tests passed!');
    console.log('\nYou can now upload assets using:');
    console.log('   npm run upload:email-assets');
    
  } catch (error) {
    console.error('❌ Connection test failed:');
    console.error(`   Error: ${error.name || 'Unknown'}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.name === 'NoSuchBucket') {
      console.error('\n💡 The bucket does not exist. Please create it first in AWS S3 Console.');
    } else if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
      console.error('\n💡 Invalid AWS credentials. Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
    } else if (error.name === 'AccessDenied') {
      console.error('\n💡 Access denied. Please check your IAM permissions.');
    }
    
    process.exit(1);
  }
}

testConnection().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

