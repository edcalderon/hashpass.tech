require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client with service role
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

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

// Helper function to convert camelCase to UPPER_SNAKE_CASE
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

// Helper function to replace placeholders (same logic as lib/email.ts)
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

async function getAllUsers() {
  try {
    console.log('📋 Fetching all users from database...');
    
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
    
    if (!users || !users.users) {
      console.log('⚠️ No users found');
      return [];
    }
    
    console.log(`✅ Found ${users.users.length} users`);
    return users.users;
  } catch (error) {
    console.error('❌ Error getting users:', error);
    throw error;
  }
}

async function checkEmailAlreadySent(userId) {
  try {
    const { data, error } = await supabase.rpc('has_email_been_sent', {
      p_user_id: userId,
      p_email_type: 'welcome'
    });
    
    if (error) {
      return false;
    }
    
    return data === true;
  } catch (error) {
    return false;
  }
}

async function sendWelcomeEmail(userId, email, locale = 'es') {
  try {
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'welcome.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.welcome[locale] || emailsJson.welcome.es;
    
    // Select video ID based on locale: Spanish uses different video
    const muxVideoId = locale === 'es' 
      ? 'cHHvJcBJEdt8YnWTbo7cFUxNYOMrwIt02EB7vL02ixmd4'  // Spanish version
      : 'iesctpn00OXTQrYmY02J8JvjNmbNoDDKjzm7qr76lCKEI'; // Default for other languages
    
    // Generate GIF from Mux video (animated preview of first 3 seconds)
    const videoGifUrl = `https://image.mux.com/${muxVideoId}/animated.gif?width=600&fps=15&start=0&end=3`;
    const videoThumbnailUrl = `https://image.mux.com/${muxVideoId}/thumbnail.png?width=600&height=1067&time=11`;
    const videoPosterUrl = `https://image.mux.com/${muxVideoId}/thumbnail.jpg?width=600&height=1067&time=11`;
    
    // Add poster image to Mux player URL
    const videoTitle = locale === 'es' 
      ? 'BSL_2025_Bienvenido_ES'
      : 'BSL_2025_Welcome';
    const videoUrl = `https://player.mux.com/${muxVideoId}?metadata-video-title=${encodeURIComponent(videoTitle)}&video-title=${encodeURIComponent(videoTitle)}&poster=${encodeURIComponent(videoPosterUrl)}`;
    
    // Get logo URLs (try base64 first, then S3)
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    let bslLogoUrl = process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    let hashpassLogoUrl = process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    
    // Try to load as base64 if files exist
    try {
      if (fs.existsSync(bslLogoPath)) {
        const bslLogoBase64 = fs.readFileSync(bslLogoPath).toString('base64');
        bslLogoUrl = `data:image/svg+xml;base64,${bslLogoBase64}`;
      }
      if (fs.existsSync(hashpassLogoPath)) {
        const hashpassLogoBase64 = fs.readFileSync(hashpassLogoPath).toString('base64');
        hashpassLogoUrl = `data:image/png;base64,${hashpassLogoBase64}`;
      }
    } catch (error) {
      // Use S3 URLs as fallback
    }
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      videoUrl,
      videoThumbnailUrl,
      videoGifUrl,
      videoPosterUrl,
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
      text: `${translations.html.title}\n\n${translations.html.subtitle}`,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Mark as sent in database with message_id
    const { error: markError } = await supabase.rpc('mark_email_as_sent', {
      p_user_id: userId,
      p_email_type: 'welcome',
      p_locale: locale,
      p_message_id: info.messageId || null
    });
    
    if (markError) {
      console.warn(`⚠️ Error marking email as sent: ${markError.message}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending email: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function sendWelcomeEmailToUser(user, locale = 'es') {
  try {
    const userId = user.id;
    const email = user.email;
    
    if (!email) {
      return { success: false, skipped: true, reason: 'No email' };
    }
    
    // Check if email was already sent
    const alreadySent = await checkEmailAlreadySent(userId);
    if (alreadySent) {
      return { success: true, skipped: true, reason: 'Already sent' };
    }
    
    const result = await sendWelcomeEmail(userId, email, locale);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    console.log('🚀 Starting bulk welcome email send (Spanish version)...\n');
    
    const users = await getAllUsers();
    
    if (users.length === 0) {
      console.log('⚠️ No users to send emails to');
      process.exit(0);
    }
    
    console.log(`\n📊 Processing ${users.length} users...\n`);
    
    const results = {
      total: users.length,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
    
    // Process users with a delay to avoid rate limiting
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay between emails
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;
      
      console.log(`${progress} Processing ${user.email || user.id}...`);
      
      const result = await sendWelcomeEmailToUser(user, 'es');
      
      if (result.success) {
        if (result.skipped) {
          results.skipped++;
          console.log(`  ⏭️  Skipped: ${result.reason}`);
        } else {
          results.sent++;
          console.log(`  ✅ Sent successfully (messageId: ${result.messageId})`);
        }
      } else {
        results.failed++;
        results.errors.push({
          email: user.email,
          userId: user.id,
          error: result.error || 'Unknown error'
        });
        console.log(`  ❌ Failed: ${result.error || 'Unknown error'}`);
      }
      
      // Add delay between emails (except for the last one)
      if (i < users.length - 1) {
        await delay(DELAY_BETWEEN_EMAILS);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users: ${results.total}`);
    console.log(`✅ Emails sent: ${results.sent}`);
    console.log(`⏭️  Skipped (already sent): ${results.skipped}`);
    console.log(`❌ Failed: ${results.failed}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach((err, index) => {
        console.log(`  ${index + 1}. ${err.email} (${err.userId}): ${err.error}`);
      });
    }
    
    console.log('='.repeat(60));
    
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
