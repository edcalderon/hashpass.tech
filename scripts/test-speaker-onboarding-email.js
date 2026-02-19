require('dotenv').config();
const nodemailer = require('nodemailer');
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

async function sendTestSpeakerOnboardingEmail(locale = 'en') {
  // Validate required environment variables
  const requiredVars = [
    'NODEMAILER_HOST',
    'NODEMAILER_PORT',
    'NODEMAILER_USER',
    'NODEMAILER_PASS'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required email configuration:', missingVars.join(', '));
    return { success: false, error: 'Missing configuration' };
  }

  // Use NODEMAILER_FROM_CONTACT if available, otherwise use NODEMAILER_FROM
  const fromEmail = process.env.NODEMAILER_FROM_CONTACT || process.env.NODEMAILER_FROM || 'contact@hashpass.tech';
  const toEmail = process.env.TEST_EMAIL_TO || 'admin@hashpass.tech';

  console.log(`\n📧 Sending ${locale === 'es' ? 'Spanish' : 'English'} speaker onboarding email...`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}`);
  console.log(`   Locale: ${locale}`);

  // Load email template based on locale
  const templateName = locale === 'es' ? 'speaker-onboarding-es.html' : 'speaker-onboarding-en.html';
  const templatePath = path.join(__dirname, '..', 'emails', 'templates', templateName);
  
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    return { success: false, error: 'Template not found' };
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf-8');

  // Helper function to convert image to base64 data URI
  const imageToBase64 = (filePath, mimeType) => {
    try {
      if (fs.existsSync(filePath)) {
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
      }
    } catch (error) {
      console.warn(`Could not load image from ${filePath}:`, error);
    }
    return null;
  };

  // Get logo URLs (S3/CDN preferred, fallback to base64)
  let bslLogoUrl, hashpassLogoUrl;
  
  try {
    bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
    hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
    console.log('   🖼️  Using S3/CDN URLs for logos');
  } catch (error) {
    // Fallback to base64
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    if (bslLogoBase64) {
      bslLogoUrl = bslLogoBase64;
      console.log('   🖼️  Using embedded BSL logo (base64)');
    } else {
      bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
    }
    
    if (hashpassLogoBase64) {
      hashpassLogoUrl = hashpassLogoBase64;
      console.log('   🖼️  Using embedded HashPass logo (base64)');
    } else {
      hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
    }
  }

  // Load screenshot images as base64 or get S3 URLs
  // Using organized folder structure: speaker-onboarding/
  const screenshotSignInPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'sign-in-screen.png');
  const screenshotNotificationsGifPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'notifications-screen.gif');
  const screenshotAcceptRequestPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'accept-request-screen.png');
  const screenshotScheduleViewPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'schedule-view-screen.png');
  
  // Get screenshot URLs (S3/CDN preferred, fallback to base64)
  let screenshotSignInUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/sign-in-screen.png');
  let screenshotNotificationsGifUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/notifications-screen.gif');
  let screenshotAcceptRequestUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/accept-request-screen.png');
  let screenshotScheduleViewUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/schedule-view-screen.png');
  
  // Try base64 as fallback if S3 URLs don't work
  const screenshotSignInBase64 = imageToBase64(screenshotSignInPath, 'image/png');
  const screenshotNotificationsGifBase64 = imageToBase64(screenshotNotificationsGifPath, 'image/gif');
  const screenshotAcceptRequestBase64 = imageToBase64(screenshotAcceptRequestPath, 'image/png');
  const screenshotScheduleViewBase64 = imageToBase64(screenshotScheduleViewPath, 'image/png');
  
  if (screenshotSignInBase64) screenshotSignInUrl = screenshotSignInBase64;
  if (screenshotNotificationsGifBase64) screenshotNotificationsGifUrl = screenshotNotificationsGifBase64;
  if (screenshotAcceptRequestBase64) screenshotAcceptRequestUrl = screenshotAcceptRequestBase64;
  if (screenshotScheduleViewBase64) screenshotScheduleViewUrl = screenshotScheduleViewBase64;

  // Replace placeholders
  htmlContent = htmlContent.replace(/\[BSL_LOGO_URL\]/g, bslLogoUrl);
  htmlContent = htmlContent.replace(/\[HASHPASS_LOGO_URL\]/g, hashpassLogoUrl);
  htmlContent = htmlContent.replace(/\[SCREENSHOT_SIGN_IN_URL\]/g, screenshotSignInUrl);
  htmlContent = htmlContent.replace(/\[SCREENSHOT_NOTIFICATIONS_URL\]/g, screenshotNotificationsGifUrl);
  htmlContent = htmlContent.replace(/\[SCREENSHOT_NOTIFICATIONS_GIF_URL\]/g, screenshotNotificationsGifUrl);
  htmlContent = htmlContent.replace(/\[SCREENSHOT_ACCEPT_REQUEST_URL\]/g, screenshotAcceptRequestUrl);
  htmlContent = htmlContent.replace(/\[SCREENSHOT_SCHEDULE_VIEW_URL\]/g, screenshotScheduleViewUrl);

  // Create transporter
  const smtpHost = process.env.NODEMAILER_HOST || '';
  const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.NODEMAILER_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
    connectionTimeout: 10000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
      checkServerIdentity: isBrevo ? () => undefined : undefined,
    },
    requireTLS: true,
  });

  // Email subject based on locale
  const subjects = {
    en: '🎤 Welcome to HashPass - Speaker Guide',
    es: '🎤 ¡Bienvenido a HashPass - Guía para Ponentes!'
  };

  const subject = subjects[locale] || subjects.en;

  // Send email
  try {
    console.log('   📤 Sending...');
    const info = await transporter.sendMail({
      from: `HashPass <${fromEmail}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
    });

    console.log(`   ✅ Sent! Message ID: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId, locale };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`   Server response: ${error.response}`);
    }
    return { success: false, error: error.message, locale };
  }
}

// Main function to send both versions
async function sendBothVersions() {
  console.log('📧 Sending test speaker onboarding emails (English & Spanish)...\n');

  const fromEmail = process.env.NODEMAILER_FROM_CONTACT || process.env.NODEMAILER_FROM || 'contact@hashpass.tech';
  const toEmail = process.env.TEST_EMAIL_TO || 'admin@hashpass.tech';

  console.log('📋 Email Configuration:');
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}\n`);

  // Send English version
  const resultEn = await sendTestSpeakerOnboardingEmail('en');
  
  // Wait a bit before sending the second email
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Send Spanish version
  const resultEs = await sendTestSpeakerOnboardingEmail('es');

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`   English: ${resultEn.success ? '✅ Sent' : '❌ Failed'}`);
  if (resultEn.success) {
    console.log(`      Message ID: ${resultEn.messageId}`);
  }
  console.log(`   Spanish: ${resultEs.success ? '✅ Sent' : '❌ Failed'}`);
  if (resultEs.success) {
    console.log(`      Message ID: ${resultEs.messageId}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (resultEn.success && resultEs.success) {
    console.log('✨ Both emails sent successfully!');
    return { success: true };
  } else {
    console.log('⚠️  Some emails failed to send');
    return { success: false };
  }
}

// Run the test
const sendBoth = process.env.SEND_BOTH !== 'false'; // Default to true

if (sendBoth) {
  sendBothVersions()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
} else {
  // Single email mode (backward compatibility)
  const locale = process.env.TEST_EMAIL_LOCALE || 'en';
  sendTestSpeakerOnboardingEmail(locale)
    .then((result) => {
      if (result.success) {
        console.log('\n✨ Test completed!');
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

