#!/usr/bin/env node
/**
 * Test script to send speaker onboarding email to support@hashpass.tech
 * Verifies that [TITLE], [SUBTITLE], and [GUIDE_TITLE] are correctly replaced
 */

require('dotenv').config();

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const testEmail = 'support@hashpass.tech';

// Email configuration
const emailEnabled = process.env.NODEMAILER_HOST && 
                     process.env.NODEMAILER_PORT && 
                     process.env.NODEMAILER_USER && 
                     process.env.NODEMAILER_PASS && 
                     process.env.NODEMAILER_FROM;

if (!emailEnabled) {
  console.error('❌ Email service is not configured');
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
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
    checkServerIdentity: isBrevo ? () => undefined : undefined,
  },
  requireTLS: true,
});

// Helper function to convert camelCase to UPPER_SNAKE_CASE (matches lib/email.ts)
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

// Replace template placeholders with translations (matches lib/email.ts logic)
function replaceTemplatePlaceholders(template, translations, assets, locale = 'en') {
  let content = template;
  
  // Replace all translation placeholders
  Object.keys(translations.html).forEach((key) => {
    const value = translations.html[key];
    
    if (value == null || value === '') {
      return;
    }
    
    const placeholder = `[${camelToUpperSnake(key)}]`;
    let processedValue = String(value);
    
    // Replace variables within the translation value
    if (processedValue.includes('{appUrl}')) {
      processedValue = processedValue.replace(/{appUrl}/g, `<a href="${assets.appUrl || 'https://bsl2025.hashpass.tech'}" style="color: #007AFF; text-decoration: underline;">${assets.appUrl || 'bsl2025.hashpass.tech'}</a>`);
    }
    if (processedValue.includes('{hashpassUrl}')) {
      processedValue = processedValue.replace(/{hashpassUrl}/g, '<a href="https://hashpass.tech" style="color: #007AFF; text-decoration: none;">hashpass.tech</a>');
    }
    if (processedValue.includes('{bslUrl}')) {
      processedValue = processedValue.replace(/{bslUrl}/g, '<a href="https://blockchainsummit.la/" style="color: #007AFF; text-decoration: none;">BSL 2025</a>');
    }
    if (processedValue.includes('{supportEmail}')) {
      const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
      processedValue = processedValue.replace(/{supportEmail}/g, `<a href="mailto:${supportEmail}" style="color: #007AFF; text-decoration: underline;">${supportEmail}</a>`);
    }
    
    // Escape special regex characters in placeholder and replace
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    content = content.replace(regex, processedValue);
  });
  
  // Replace asset placeholders
  Object.keys(assets).forEach((key) => {
    const placeholder = `[${camelToUpperSnake(key)}]`;
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assetValue = assets[key];
    if (assetValue) {
      content = content.replace(new RegExp(escapedPlaceholder, 'g'), assetValue);
    }
  });
  
  // Replace lang placeholder
  content = content.replace(/\[LANG\]/g, locale);
  
  return content;
}

async function sendTestEmail(locale) {
  try {
    console.log(`\n📤 Sending ${locale === 'es' ? 'Spanish' : 'English'} speaker onboarding email...`);
    
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'speaker-onboarding.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.speakerOnboarding[locale] || emailsJson.speakerOnboarding.en;
    
    // Verify required translations exist
    const requiredKeys = ['title', 'subtitle', 'guideTitle'];
    const missingKeys = requiredKeys.filter(key => !translations.html[key]);
    if (missingKeys.length > 0) {
      console.error(`   ❌ Missing translation keys: ${missingKeys.join(', ')}`);
      return { success: false, error: `Missing keys: ${missingKeys.join(', ')}` };
    }
    
    console.log(`   ✅ Translations verified:`);
    console.log(`      title: "${translations.html.title}"`);
    console.log(`      subtitle: "${translations.html.subtitle}"`);
    console.log(`      guideTitle: "${translations.html.guideTitle}"`);
    
    // Get asset URLs (using S3/CDN URLs)
    const bslLogoUrl = process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    const screenshotSignInUrl = process.env.SCREENSHOT_SIGN_IN_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/speaker-onboarding/sign-in-screen.png';
    const screenshotNotificationsGifUrl = process.env.SCREENSHOT_NOTIFICATIONS_GIF_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/speaker-onboarding/notifications-screen.gif';
    const screenshotAcceptRequestUrl = process.env.SCREENSHOT_ACCEPT_REQUEST_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/speaker-onboarding/accept-request-screen.png';
    const screenshotScheduleViewUrl = process.env.SCREENSHOT_SCHEDULE_VIEW_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/speaker-onboarding/schedule-view-screen.png';
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      screenshotSignInUrl,
      screenshotNotificationsGifUrl,
      screenshotAcceptRequestUrl,
      screenshotScheduleViewUrl,
      appUrl: 'https://bsl2025.hashpass.tech'
    };
    
    // Replace all placeholders
    htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
    
    // Verify placeholders were replaced
    const remainingPlaceholders = htmlContent.match(/\[(TITLE|SUBTITLE|GUIDE_TITLE)\]/g);
    if (remainingPlaceholders) {
      console.error(`   ❌ Placeholders not replaced: ${remainingPlaceholders.join(', ')}`);
      return { success: false, error: `Placeholders not replaced: ${remainingPlaceholders.join(', ')}` };
    }
    
    console.log(`   ✅ All placeholders replaced successfully`);
    
    // Send email
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: testEmail,
      subject: translations.subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.subtitle}\n\n${translations.html.guideTitle}\n\n${translations.html.introText}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`   ✅ Email sent successfully!`);
    console.log(`   📧 Message ID: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`   ❌ Error sending email: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testSpeakerOnboardingEmail() {
  console.log('\n📧 Testing Speaker Onboarding Email');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   To: ${testEmail}`);
  console.log(`   Testing both English and Spanish locales...\n`);

  // Test English version
  const resultEn = await sendTestEmail('en');
  
  // Wait a bit before sending the second email
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test Spanish version
  const resultEs = await sendTestEmail('es');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`   English: ${resultEn.success ? '✅ Sent' : '❌ Failed'}`);
  if (resultEn.error) {
    console.log(`      Error: ${resultEn.error}`);
  }
  console.log(`   Spanish: ${resultEs.success ? '✅ Sent' : '❌ Failed'}`);
  if (resultEs.error) {
    console.log(`      Error: ${resultEs.error}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (resultEn.success && resultEs.success) {
    console.log('✨ Both test emails sent successfully!');
    console.log('   Please check support@hashpass.tech inbox to verify:');
    console.log('   - [TITLE] is replaced correctly');
    console.log('   - [SUBTITLE] is replaced correctly');
    console.log('   - [GUIDE_TITLE] is replaced correctly');
    return { success: true };
  } else {
    console.log('⚠️  Some emails failed to send');
    return { success: false };
  }
}

// Run the test
testSpeakerOnboardingEmail()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });

