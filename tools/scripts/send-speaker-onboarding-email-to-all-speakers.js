require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Initialize Supabase
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

// Helper functions
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

function replaceTemplatePlaceholders(template, translations, assets, locale = 'es') {
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

async function sendSpeakerOnboardingEmail(userId, email, locale = 'es') {
  try {
    console.log(`📧 Sending speaker onboarding email (${locale}) to ${email}...`);
    
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'speaker-onboarding.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.speakerOnboarding[locale] || emailsJson.speakerOnboarding.es;
    
    // Get asset URLs
    const bslLogoUrl = process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    
    // Get screenshot URLs
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
    
    // Send email
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: translations.subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully! Message ID: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending email to ${email}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting speaker onboarding email campaign...\n');
  
  try {
    // First, get all users with 'speaker' role from user_roles table
    console.log('📋 Fetching speakers from database...');
    const { data: speakerRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'speaker');
    
    if (rolesError) {
      console.error('❌ Error fetching speaker roles:', rolesError);
      throw rolesError;
    }
    
    if (!speakerRoles || speakerRoles.length === 0) {
      console.log('⚠️  No speakers found in user_roles table');
      console.log('   Trying to fetch from bsl_speakers table...');
      
      // Fallback: try to get speakers from bsl_speakers table
      const { data: speakers, error: speakersError } = await supabase
        .from('bsl_speakers')
        .select('*');
      
      if (speakersError) {
        console.error('❌ Error fetching speakers:', speakersError);
        throw speakersError;
      }
      
      if (!speakers || speakers.length === 0) {
        console.log('⚠️  No speakers found in database');
        return;
      }
      
      // Get user emails from auth.users for speakers
      const speakerUserIds = speakers.map(s => s.user_id).filter(Boolean);
      const allUsers = [];
      
      for (const userId of speakerUserIds) {
        const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (!userError && user?.user) {
          allUsers.push(user.user);
        }
      }
      
      if (allUsers.length === 0) {
        console.log('⚠️  No users found for speakers');
        return;
      }
      
      console.log(`✅ Found ${allUsers.length} speakers\n`);
      
      // Statistics
      let successCount = 0;
      let errorCount = 0;
      const results = {
        es: { sent: 0, errors: 0 },
        en: { sent: 0, errors: 0 }
      };
      
      // Process each speaker
      for (let i = 0; i < allUsers.length; i++) {
        const user = allUsers[i];
        const email = user.email;
        const userId = user.id;
        
        if (!email) {
          console.log(`⚠️  Skipping user ${userId} - no email address`);
          continue;
        }
        
        // Get user locale from metadata, default to 'es'
        const userLocale = user.user_metadata?.locale || 'es';
        
        // Send email in user's preferred locale
        const result = await sendSpeakerOnboardingEmail(userId, email, userLocale);
        
        if (result.success) {
          successCount++;
          results[userLocale].sent++;
        } else {
          errorCount++;
          results[userLocale].errors++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Progress indicator
        if ((i + 1) % 5 === 0) {
          console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} speakers processed\n`);
        }
      }
      
      // Final summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 Campaign Summary:');
      console.log('='.repeat(60));
      console.log(`Total speakers processed: ${allUsers.length}`);
      console.log(`Total emails sent: ${successCount}`);
      console.log(`Total errors: ${errorCount}`);
      console.log(`\nBy language:`);
      console.log(`  Spanish (es): ${results.es.sent} sent, ${results.es.errors} errors`);
      console.log(`  English (en): ${results.en.sent} sent, ${results.en.errors} errors`);
      console.log('='.repeat(60));
      
      if (errorCount > 0) {
        console.log('\n⚠️  Some emails failed to send. Check the errors above.');
        process.exit(1);
      } else {
        console.log('\n✅ All emails sent successfully!');
        process.exit(0);
      }
    }
    
    // Get user details for each speaker
    const speakerUserIds = speakerRoles.map(r => r.user_id);
    console.log(`✅ Found ${speakerUserIds.length} speakers with 'speaker' role\n`);
    
    const allUsers = [];
    for (const userId of speakerUserIds) {
      const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (!userError && user?.user) {
        allUsers.push(user.user);
      }
    }
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found for speakers');
      return;
    }
    
    // Statistics
    let successCount = 0;
    let errorCount = 0;
    const results = {
      es: { sent: 0, errors: 0 },
      en: { sent: 0, errors: 0 }
    };
    
    // Process each speaker
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const email = user.email;
      const userId = user.id;
      
      if (!email) {
        console.log(`⚠️  Skipping user ${userId} - no email address`);
        continue;
      }
      
      // Get user locale from metadata, default to 'es'
      const userLocale = user.user_metadata?.locale || 'es';
      
      // Send email in user's preferred locale
      const result = await sendSpeakerOnboardingEmail(userId, email, userLocale);
      
      if (result.success) {
        successCount++;
        results[userLocale].sent++;
      } else {
        errorCount++;
        results[userLocale].errors++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Progress indicator
      if ((i + 1) % 5 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} speakers processed\n`);
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Campaign Summary:');
    console.log('='.repeat(60));
    console.log(`Total speakers processed: ${allUsers.length}`);
    console.log(`Total emails sent: ${successCount}`);
    console.log(`Total errors: ${errorCount}`);
    console.log(`\nBy language:`);
    console.log(`  Spanish (es): ${results.es.sent} sent, ${results.es.errors} errors`);
    console.log(`  English (en): ${results.en.sent} sent, ${results.en.errors} errors`);
    console.log('='.repeat(60));
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some emails failed to send. Check the errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ All emails sent successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

