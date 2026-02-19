#!/usr/bin/env node

/**
 * Script to send copies of all welcome emails (user welcome, user onboarding, admin onboarding)
 * to support@hashpass.tech for review
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Load email translations
const emailsJson = require('../i18n/locales/emails.json');

// Helper function to get email asset URL (matches lib/s3-service.ts implementation)
function getEmailAssetUrl(assetName) {
  const EMAIL_ASSETS_PREFIX = 'emails/assets/';
  const s3Key = `${EMAIL_ASSETS_PREFIX}${assetName}`;
  
  const CDN_URL = (process.env.AWS_S3_CDN_URL || process.env.AWS_S3_BUCKET_URL || '').trim();
  const BUCKET_NAME = (process.env.AWS_S3_BUCKET_NAME || '').trim().replace(/[`'"]/g, '');
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  
  // Use proper HTTP URL
  if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
    // Valid CDN URL (HTTP/HTTPS)
    return `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  }
  
  // Use S3 bucket URL directly
  if (BUCKET_NAME) {
    return `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
  }
  
  // Fallback to default URL if no bucket configured
  return `https://hashpass-assets.s3.amazonaws.com/${s3Key}`;
}

// Email configuration - can be overridden via command line argument
const SUPPORT_EMAIL = process.argv[2] || 'support@hashpass.tech';
const CC_EMAILS = ['r@blockchainsummit.la', 'edward@hashpass.tech']; // CC recipients
const DEFAULT_LOCALE = 'es'; // Default to Spanish
const SUPPORTED_LOCALES = ['es']; // Only Spanish for this script

// Validate required environment variables
const requiredEnvVars = [
  'NODEMAILER_HOST',
  'NODEMAILER_PORT',
  'NODEMAILER_USER',
  'NODEMAILER_PASS',
  'NODEMAILER_FROM'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required email configuration: ${missingVars.join(', ')}`);
  console.error('Email functionality is disabled');
  process.exit(1);
}

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

// Note: Using getEmailAssetUrl from lib/s3-service.ts (imported above)
// This function handles S3/CDN URLs correctly based on environment variables

// Helper function to convert camelCase to UPPER_SNAKE_CASE
function camelToUpperSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

// Helper function to replace template placeholders
function replaceTemplatePlaceholders(template, translations, assets, locale = 'en') {
  let result = template;
  
  // Replace translation placeholders [PLACEHOLDER_NAME] (e.g., [TITLE], [SUBTITLE])
  Object.keys(translations.html).forEach(key => {
    const placeholder = `[${camelToUpperSnake(key)}]`;
    let value = translations.html[key];
    
    // Replace {appUrl} placeholder in translations
    if (assets.appUrl && typeof value === 'string') {
      value = value.replace(/{appUrl}/g, assets.appUrl);
    }
    
    // Replace {supportEmail} placeholder in translations
    if (typeof value === 'string' && value.includes('{supportEmail}')) {
      const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
      value = value.replace(/{supportEmail}/g, `<a href="mailto:${supportEmail}" style="color: #007AFF; text-decoration: underline;">${supportEmail}</a>`);
    }
    
    // Replace {hashpassUrl} placeholder in translations
    if (typeof value === 'string' && value.includes('{hashpassUrl}')) {
      value = value.replace(/{hashpassUrl}/g, '<a href="https://hashpass.tech" style="color: #007AFF; text-decoration: none;">hashpass.tech</a>');
    }
    
    // Replace {bslUrl} placeholder in translations
    if (typeof value === 'string' && value.includes('{bslUrl}')) {
      value = value.replace(/{bslUrl}/g, '<a href="https://blockchainsummit.la/" style="color: #007AFF; text-decoration: none;">BSL 2025</a>');
    }
    
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  });
  
  // Replace asset placeholders - try both formats: [ASSET_NAME] and [ASSET_ASSET_NAME]
  Object.keys(assets).forEach(key => {
    const snakeKey = camelToUpperSnake(key);
    
    // Try [ASSET_NAME] format first (e.g., [BSL_LOGO_URL])
    const placeholder1 = `[${snakeKey}]`;
    result = result.replace(new RegExp(placeholder1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), assets[key]);
    
    // Also try [ASSET_ASSET_NAME] format (e.g., [ASSET_BSL_LOGO_URL])
    const placeholder2 = `[ASSET_${snakeKey}]`;
    result = result.replace(new RegExp(placeholder2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), assets[key]);
  });
  
  // Replace common placeholders that might be in templates
  if (assets.appUrl) {
    result = result.replace(/\[APP_URL\]/g, assets.appUrl);
    result = result.replace(/{appUrl}/g, assets.appUrl);
  }
  
  // Replace {hashpassUrl} and {bslUrl} placeholders directly in template
  result = result.replace(/{hashpassUrl}/g, '<a href="https://hashpass.tech" style="color: #007AFF; text-decoration: none;">hashpass.tech</a>');
  result = result.replace(/{bslUrl}/g, '<a href="https://blockchainsummit.la/" style="color: #007AFF; text-decoration: none;">BSL 2025</a>');
  
  // Replace {supportEmail} placeholder directly in template (if not already replaced in translations)
  if (result.includes('{supportEmail}')) {
    const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
    result = result.replace(/{supportEmail}/g, `<a href="mailto:${supportEmail}" style="color: #007AFF; text-decoration: underline;">${supportEmail}</a>`);
  }
  
  // Replace lang placeholder
  result = result.replace(/\[LANG\]/g, locale);
  
  return result;
}

// Helper function to convert image to base64
function imageToBase64(filePath, mimeType) {
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
}

// Send welcome email
async function sendWelcomeEmail(locale = 'en') {
  try {
    const translations = emailsJson.welcome[locale] || emailsJson.welcome.en;
    const subject = `[COPY] ${translations.subject} (${locale.toUpperCase()})`;
    
    // Load template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'welcome.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Get logo URLs
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    const bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
    const hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
    
    // Log which method is being used
    if (bslLogoBase64 && hashpassLogoBase64) {
      console.log(`  ✅ Using base64 for logos (better email compatibility)`);
    } else {
      console.log(`  ⚠️ Using S3 URLs for logos (some may be blocked by email clients)`);
    }
    
    // Video URLs
    const muxVideoId = locale === 'es' 
      ? 'cHHvJcBJEdt8YnWTbo7cFUxNYOMrwIt02EB7vL02ixmd4'
      : 'iesctpn00OXTQrYmY02J8JvjNmbNoDDKjzm7qr76lCKEI';
    
    const videoGifUrl = `https://image.mux.com/${muxVideoId}/animated.gif?width=600&fps=15&start=0&end=3`;
    const videoThumbnailUrl = `https://image.mux.com/${muxVideoId}/thumbnail.png?width=600&height=1067&time=11`;
    const videoPosterUrl = `https://image.mux.com/${muxVideoId}/thumbnail.jpg?width=600&height=1067&time=11`;
    
    const videoTitle = locale === 'es' 
      ? 'BSL_2025_Bienvenido_ES'
      : 'BSL_2025_Welcome';
    const videoUrl = `https://player.mux.com/${muxVideoId}?metadata-video-title=${encodeURIComponent(videoTitle)}&video-title=${encodeURIComponent(videoTitle)}&poster=${encodeURIComponent(videoPosterUrl)}`;
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      videoUrl,
      videoThumbnailUrl,
      videoGifUrl,
      videoPosterUrl,
      videoButton: translations.html.videoButton || '▶ Ver Video de Bienvenida',
      videoButtonClick: translations.html.videoButtonClick || 'Haz clic para reproducir',
      appUrl: 'https://bsl2025.hashpass.tech'
    };
    
    htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
    
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: SUPPORT_EMAIL,
      cc: CC_EMAILS,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.subtitle}\n\n${translations.html.ctaButton}`,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email (${locale}) sent to ${SUPPORT_EMAIL}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending welcome email (${locale}):`, error);
    return { success: false, error: error.message };
  }
}

// Send user onboarding email
async function sendUserOnboardingEmail(locale = 'en') {
  try {
    const translations = emailsJson.userOnboarding[locale] || emailsJson.userOnboarding.en;
    const subject = `[COPY] ${translations.subject} (${locale.toUpperCase()})`;
    
    // Load template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'user-onboarding.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Get logo URLs - prefer base64 for email compatibility
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    const bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
    const hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
    
    // Screenshot URLs - prefer base64 for email compatibility, fallback to S3
    const screenshotSignInPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'sign-in-screen.png');
    const screenshotExploreGifPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'explore-speakers-screen.gif');
    const screenshotRequestMeetingGifPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'request-meeting-screen.gif');
    const screenshotNotificationsPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'notifications-screen-1.png');
    
    const screenshotSignInBase64 = imageToBase64(screenshotSignInPath, 'image/png');
    const screenshotExploreGifBase64 = imageToBase64(screenshotExploreGifPath, 'image/gif');
    const screenshotRequestMeetingGifBase64 = imageToBase64(screenshotRequestMeetingGifPath, 'image/gif');
    const screenshotNotificationsBase64 = imageToBase64(screenshotNotificationsPath, 'image/png');
    
    const screenshotUrls = {
      screenshotSignInUrl: screenshotSignInBase64 || getEmailAssetUrl('images/screenshots/user-onboarding/sign-in-screen.png'),
      screenshotExploreGifUrl: screenshotExploreGifBase64 || getEmailAssetUrl('images/screenshots/user-onboarding/explore-speakers-screen.gif'),
      screenshotRequestMeetingGifUrl: screenshotRequestMeetingGifBase64 || getEmailAssetUrl('images/screenshots/user-onboarding/request-meeting-screen.gif'),
      screenshotNotificationsUrl: screenshotNotificationsBase64 || getEmailAssetUrl('images/screenshots/user-onboarding/notifications-screen-1.png'),
    };
    
    // Log which method is being used
    const base64Count = [screenshotSignInBase64, screenshotExploreGifBase64, screenshotRequestMeetingGifBase64, screenshotNotificationsBase64].filter(Boolean).length;
    console.log(`  📸 Screenshots: ${base64Count}/4 using base64 (better email compatibility)`);
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      ...screenshotUrls,
      appUrl: 'https://bsl2025.hashpass.tech'
    };
    
    htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
    
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: SUPPORT_EMAIL,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ User onboarding email (${locale}) sent to ${SUPPORT_EMAIL}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending user onboarding email (${locale}):`, error);
    return { success: false, error: error.message };
  }
}

// Send speaker onboarding email (admin onboarding)
async function sendSpeakerOnboardingEmail(locale = 'en') {
  try {
    const translations = emailsJson.speakerOnboarding[locale] || emailsJson.speakerOnboarding.en;
    const subject = `[COPY] ${translations.subject} (${locale.toUpperCase()})`;
    
    // Load template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'speaker-onboarding.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Get logo URLs - prefer base64 for email compatibility
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    const bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
    const hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
    
    // Screenshot URLs - prefer base64 for email compatibility, fallback to S3
    const screenshotSignInPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'sign-in-screen.png');
    const screenshotNotificationsGifPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'notifications-screen.gif');
    const screenshotAcceptRequestPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'accept-request-screen.png');
    const screenshotScheduleViewPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'schedule-view-screen.png');
    
    const screenshotSignInBase64 = imageToBase64(screenshotSignInPath, 'image/png');
    const screenshotNotificationsGifBase64 = imageToBase64(screenshotNotificationsGifPath, 'image/gif');
    const screenshotAcceptRequestBase64 = imageToBase64(screenshotAcceptRequestPath, 'image/png');
    const screenshotScheduleViewBase64 = imageToBase64(screenshotScheduleViewPath, 'image/png');
    
    const screenshotUrls = {
      screenshotSignInUrl: screenshotSignInBase64 || getEmailAssetUrl('images/screenshots/speaker-onboarding/sign-in-screen.png'),
      screenshotNotificationsGifUrl: screenshotNotificationsGifBase64 || getEmailAssetUrl('images/screenshots/speaker-onboarding/notifications-screen.gif'),
      screenshotAcceptRequestUrl: screenshotAcceptRequestBase64 || getEmailAssetUrl('images/screenshots/speaker-onboarding/accept-request-screen.png'),
      screenshotScheduleViewUrl: screenshotScheduleViewBase64 || getEmailAssetUrl('images/screenshots/speaker-onboarding/schedule-view-screen.png'),
    };
    
    // Log which method is being used
    const base64Count = [screenshotSignInBase64, screenshotNotificationsGifBase64, screenshotAcceptRequestBase64, screenshotScheduleViewBase64].filter(Boolean).length;
    console.log(`  📸 Screenshots: ${base64Count}/4 using base64 (better email compatibility)`);
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      ...screenshotUrls,
      appUrl: 'https://bsl2025.hashpass.tech'
    };
    
    htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
    
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: SUPPORT_EMAIL,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Speaker onboarding email (${locale}) sent to ${SUPPORT_EMAIL}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending speaker onboarding email (${locale}):`, error);
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  console.log(`📧 Sending copies of all welcome emails to ${SUPPORT_EMAIL}...\n`);
  
  const results = {
    welcome: { en: null, es: null },
    userOnboarding: { en: null, es: null },
    speakerOnboarding: { en: null, es: null },
  };
  
  // Send welcome emails
  console.log('📨 Sending welcome emails...');
  for (const locale of SUPPORTED_LOCALES) {
    results.welcome[locale] = await sendWelcomeEmail(locale);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between emails
  }
  
  // Send user onboarding emails
  console.log('\n📨 Sending user onboarding emails...');
  for (const locale of SUPPORTED_LOCALES) {
    results.userOnboarding[locale] = await sendUserOnboardingEmail(locale);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between emails
  }
  
  // Send speaker onboarding emails (admin onboarding)
  console.log('\n📨 Sending speaker onboarding emails (admin onboarding)...');
  for (const locale of SUPPORTED_LOCALES) {
    results.speakerOnboarding[locale] = await sendSpeakerOnboardingEmail(locale);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between emails
  }
  
  // Summary
  console.log('\n📊 Resumen:');
  console.log('='.repeat(60));
  
  const emailTypes = [
    { name: 'Bienvenida', key: 'welcome' },
    { name: 'Onboarding de Usuario', key: 'userOnboarding' },
    { name: 'Onboarding de Admin/Speaker', key: 'speakerOnboarding' },
  ];
  
  let successCount = 0;
  let failCount = 0;
  
  for (const emailType of emailTypes) {
    console.log(`\n${emailType.name}:`);
    const result = results[emailType.key].es;
    if (result && result.success) {
      console.log(`  ✅ ES: Enviado (messageId: ${result.messageId})`);
      successCount++;
    } else {
      console.log(`  ❌ ES: Falló - ${result?.error || 'Error desconocido'}`);
      failCount++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${successCount} enviados exitosamente, ${failCount} fallaron`);
  console.log(`Todos los correos enviados a: ${SUPPORT_EMAIL}`);
  
  if (failCount > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

