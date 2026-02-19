#!/usr/bin/env node
import 'dotenv/config';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function sendTestSpeakerOnboardingEmail() {
  const locale = 'es'; // Spanish
  const toEmail = 'support@hashpass.tech';

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

  console.log(`\n📧 Sending Spanish speaker onboarding email...`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}`);
  console.log(`   Locale: ${locale}`);

  // Load email template - use the unified template with locale
  const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'speaker-onboarding.html');
  
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    return { success: false, error: 'Template not found' };
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf-8');

  // Load translations
  const translationsPath = path.join(__dirname, '..', 'i18n', 'locales', 'emails.json');
  let translations = {};
  
  if (fs.existsSync(translationsPath)) {
    const translationsData = JSON.parse(fs.readFileSync(translationsPath, 'utf-8'));
    translations = translationsData.speakerOnboarding?.html?.[locale] || translationsData.speakerOnboarding?.html?.es || {};
  }

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

  // Get screenshot URLs (S3/CDN preferred, fallback to base64)
  let screenshotSignInUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/sign-in-screen.png');
  let screenshotNotificationsGifUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/notifications-screen.gif');
  let screenshotAcceptRequestUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/accept-request-screen.png');
  let screenshotScheduleViewUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/schedule-view-screen.png');
  
  // Try base64 as fallback
  const screenshotSignInPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'sign-in-screen.png');
  const screenshotNotificationsGifPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'notifications-screen.gif');
  const screenshotAcceptRequestPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'accept-request-screen.png');
  const screenshotScheduleViewPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'schedule-view-screen.png');
  
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

  // Replace translation placeholders
  Object.keys(translations).forEach(key => {
    const value = translations[key];
    if (typeof value === 'string') {
      htmlContent = htmlContent.replace(new RegExp(`\\[${key.toUpperCase()}\\]`, 'g'), value);
    }
  });

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

  // Email subject
  const subject = translations.title || '🎤 ¡Bienvenido a HashPass - Guía para Ponentes!';

  // Send email
  try {
    console.log('   📤 Sending...');
    const info = await transporter.sendMail({
      from: `HashPass <${fromEmail}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      text: `${translations.title || 'Bienvenido a HashPass'}\n\n${translations.introText || ''}\n\n${translations.ctaButton || ''}`,
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

// Run the test
sendTestSpeakerOnboardingEmail()
  .then((result) => {
    if (result.success) {
      console.log('\n✨ Test completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Test failed');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
