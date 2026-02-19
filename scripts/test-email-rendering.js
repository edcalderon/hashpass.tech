#!/usr/bin/env node

/**
 * Test email rendering with S3 URLs
 * This script loads the email template and shows what URLs are being used
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Generate S3 URLs directly (same logic as s3-service)
function getEmailAssetUrl(assetName) {
  const bucketName = (process.env.AWS_S3_BUCKET_NAME || '').trim().replace(/[`'"]/g, '');
  const cdnUrl = (process.env.AWS_S3_CDN_URL || '').trim();
  const prefix = 'emails/assets/';
  const s3Key = `${prefix}${assetName}`;
  
  // Use proper HTTP URL
  if (cdnUrl && !cdnUrl.startsWith('s3://') && !cdnUrl.startsWith('arn:')) {
    return `${cdnUrl}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  }
  
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}

async function testEmailRendering() {
  console.log('🧪 Testing Email Rendering with S3 URLs...\n');

  // Load asset URLs
  let assetUrls = {};
  const assetUrlsPath = path.join(process.cwd(), 'emails', 'asset-urls.json');
  if (fs.existsSync(assetUrlsPath)) {
    assetUrls = JSON.parse(fs.readFileSync(assetUrlsPath, 'utf-8'));
    console.log('✅ Loaded asset URLs from asset-urls.json\n');
  } else {
    console.log('⚠️  asset-urls.json not found, using S3 service URLs\n');
  }

  // Get URLs using the same logic as email service
  let bslLogoUrl, hashpassLogoUrl, videoUrl;

  try {
    bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
    hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
    videoUrl = getEmailAssetUrl('videos/BSL_2025_환영_ES_en.mp4');
    console.log('✅ Using S3 service URLs:\n');
  } catch (error) {
    // Fallback to asset-urls.json
    bslLogoUrl = assetUrls['images/BSL.svg'] || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    hashpassLogoUrl = assetUrls['images/logo-full-hashpass-white.png'] || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    videoUrl = assetUrls['videos/BSL_2025_환영_ES_en.mp4'] || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/videos/BSL_2025_환영_ES_en.mp4';
    console.log('✅ Using URLs from asset-urls.json:\n');
  }

  console.log('📝 URLs that will be used in emails:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`BSL Logo:        ${bslLogoUrl}`);
  console.log(`HashPass Logo:   ${hashpassLogoUrl}`);
  console.log(`Video:           ${videoUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Test loading and replacing in template
  console.log('📧 Testing template replacement...\n');
  
  const templatePath = path.join(process.cwd(), 'emails', 'templates', 'welcome-en.html');
  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template not found:', templatePath);
    process.exit(1);
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf-8');
  
  // Count placeholders
  const bslPlaceholders = (htmlContent.match(/\[BSL_LOGO_URL\]/g) || []).length;
  const hashpassPlaceholders = (htmlContent.match(/\[HASHPASS_LOGO_URL\]/g) || []).length;
  
  console.log(`Found ${bslPlaceholders} [BSL_LOGO_URL] placeholder(s)`);
  console.log(`Found ${hashpassPlaceholders} [HASHPASS_LOGO_URL] placeholder(s)`);

  // Replace placeholders
  htmlContent = htmlContent.replace(/\[BSL_LOGO_URL\]/g, bslLogoUrl);
  htmlContent = htmlContent.replace(/\[HASHPASS_LOGO_URL\]/g, hashpassLogoUrl);

  // Check if replacements worked
  const remainingBsl = (htmlContent.match(/\[BSL_LOGO_URL\]/g) || []).length;
  const remainingHashpass = (htmlContent.match(/\[HASHPASS_LOGO_URL\]/g) || []).length;

  if (remainingBsl === 0 && remainingHashpass === 0) {
    console.log('✅ All placeholders replaced successfully\n');
  } else {
    console.log(`⚠️  Warning: ${remainingBsl} BSL and ${remainingHashpass} HashPass placeholders remaining\n`);
  }

  // Verify URLs are in the content
  const hasBslUrl = htmlContent.includes(bslLogoUrl);
  const hasHashpassUrl = htmlContent.includes(hashpassLogoUrl);

  console.log('🔍 URL Verification:');
  console.log(`   BSL Logo URL in template: ${hasBslUrl ? '✅' : '❌'}`);
  console.log(`   HashPass Logo URL in template: ${hasHashpassUrl ? '✅' : '❌'}\n`);

  // Test URL accessibility (if bucket is public)
  console.log('🌐 Testing URL accessibility...\n');
  
  const https = require('https');
  const { URL } = require('url');

  async function testUrl(url) {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname,
          method: 'HEAD',
          timeout: 5000,
        };

        const req = https.request(options, (res) => {
          resolve({ url, status: res.statusCode, accessible: res.statusCode === 200 });
        });

        req.on('error', () => {
          resolve({ url, status: 'ERROR', accessible: false });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ url, status: 'TIMEOUT', accessible: false });
        });

        req.end();
      } catch (error) {
        resolve({ url, status: 'ERROR', accessible: false });
      }
    });
  }

  const results = await Promise.all([
    testUrl(bslLogoUrl),
    testUrl(hashpassLogoUrl),
  ]);

  results.forEach(result => {
    const status = result.accessible ? '✅ Accessible' : `❌ ${result.status}`;
    const fileName = result.url.split('/').pop();
    console.log(`   ${fileName}: ${status}`);
  });

  console.log('\n📊 Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Template: ${templatePath}`);
  console.log(`Placeholders replaced: ${bslPlaceholders + hashpassPlaceholders}`);
  console.log(`URLs accessible: ${results.filter(r => r.accessible).length}/${results.length}`);
  
  if (results.some(r => !r.accessible)) {
    console.log('\n⚠️  Some URLs are not accessible. Make sure:');
    console.log('   1. Bucket policy allows public read access');
    console.log('   2. Block public access is disabled');
    console.log('   3. URLs are correct');
  } else {
    console.log('\n✅ All URLs are accessible!');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

testEmailRendering().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

