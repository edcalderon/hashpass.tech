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

async function sendUserOnboardingEmail(userId, email, locale = 'es') {
  try {
    console.log(`📧 Sending user onboarding email (${locale}) to ${email}...`);
    
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'user-onboarding.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.userOnboarding[locale] || emailsJson.userOnboarding.es;
    
    // Get asset URLs
    const bslLogoUrl = process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    
    // Get screenshot URLs
    const screenshotSignInUrl = process.env.SCREENSHOT_SIGN_IN_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/user-onboarding/sign-in-screen.png';
    const screenshotExploreGifUrl = process.env.SCREENSHOT_EXPLORE_GIF_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/user-onboarding/explore-speakers-screen.gif';
    const screenshotRequestMeetingGifUrl = process.env.SCREENSHOT_REQUEST_MEETING_GIF_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/user-onboarding/request-meeting-screen.gif';
    const screenshotNotificationsUrl = process.env.SCREENSHOT_NOTIFICATIONS_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/screenshots/user-onboarding/notifications-screen-1.png';
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      screenshotSignInUrl,
      screenshotExploreGifUrl,
      screenshotRequestMeetingGifUrl,
      screenshotNotificationsUrl,
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
  console.log('🚀 Starting user onboarding email campaign...\n');
  
  try {
    // Fetch all users from Supabase Auth
    console.log('📋 Fetching all users from database...');
    let allUsers = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data: users, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 1000
      });
      
      if (error) {
        console.error('❌ Error fetching users:', error);
        break;
      }
      
      if (users && users.users && users.users.length > 0) {
        allUsers = allUsers.concat(users.users);
        console.log(`   Fetched ${users.users.length} users (total: ${allUsers.length})`);
        
        // Check if there are more pages
        hasMore = users.users.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n✅ Total users found: ${allUsers.length}\n`);
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    // Statistics
    let successCount = 0;
    let errorCount = 0;
    const results = {
      es: { sent: 0, errors: 0 },
      en: { sent: 0, errors: 0 }
    };
    
    // Process each user
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
      
      // Determine which languages to send
      // If user locale is Spanish, send Spanish; otherwise send English
      // But we'll send both if requested, or we can send based on locale
      const localesToSend = userLocale === 'es' ? ['es'] : ['en'];
      
      // Actually, let's send both to all users as requested
      const localesToSendBoth = ['es', 'en'];
      
      for (const locale of localesToSendBoth) {
        const result = await sendUserOnboardingEmail(userId, email, locale);
        
        if (result.success) {
          successCount++;
          results[locale].sent++;
        } else {
          errorCount++;
          results[locale].errors++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} users processed\n`);
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Campaign Summary:');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${allUsers.length}`);
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

