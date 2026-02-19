require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getAllUsers() {
  console.log('📋 Fetching all users from database...');
  let allUsers = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: page,
      perPage: 1000
    });
    
    if (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
    
    if (data && data.users && data.users.length > 0) {
      allUsers = allUsers.concat(data.users);
      console.log(`   Fetched ${data.users.length} users (total: ${allUsers.length})`);
      
      hasMore = data.users.length === 1000;
      page++;
    } else {
      hasMore = false;
    }
  }
  
  return allUsers;
}

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

// Helper functions (from lib/email.ts)
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

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
    const appUrl = assets.appUrl || 'https://bsl2025.hashpass.tech';
    const statusUrl = `${appUrl}/status`;
    
    if (processedValue.includes('{appUrl}/status')) {
      processedValue = processedValue.replace(/{appUrl}\/status/g, `<a href="${statusUrl}" style="color: #007AFF; text-decoration: underline;">${statusUrl}</a>`);
    }
    if (processedValue.includes('{appUrl}')) {
      processedValue = processedValue.replace(/{appUrl}/g, `<a href="${appUrl}" style="color: #007AFF; text-decoration: underline;">${appUrl}</a>`);
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
    
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    content = content.replace(regex, processedValue);
  });
  
  // Replace asset placeholders
  Object.keys(assets).forEach((key) => {
    const placeholder = `[${camelToUpperSnake(key)}]`;
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assetValue = assets[key];
    if (assetValue !== undefined && assetValue !== null) {
      const replacementValue = String(assetValue);
      const regex = new RegExp(escapedPlaceholder, 'g');
      content = content.replace(regex, replacementValue);
    }
  });
  
  // Replace lang placeholder
  content = content.replace(/\[LANG\]/g, locale);
  
  // Final cleanup for status placeholders
  content = content.replace(/\[STATUS_MESSAGE\]/g, assets.statusMessage || 'Todos los sistemas operativos');
  content = content.replace(/\[STATUS_TIMESTAMP\]/g, assets.statusTimestamp || new Date().toLocaleString(locale));
  
  return content;
}

async function sendTroubleshootingEmailToUser(userId, email, locale = 'es') {
  try {
    // Check if email was already sent
    const { data: existingEmail } = await supabase
      .from('user_email_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'troubleshooting')
      .single();
    
    if (existingEmail) {
      return { 
        success: true, 
        skipped: true, 
        reason: 'Email already sent to this user'
      };
    }
    
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'troubleshooting.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.troubleshooting[locale] || emailsJson.troubleshooting.es;
    
    if (!translations) {
      throw new Error(`No translations found for locale: ${locale}`);
    }
    
    // Get status message and timestamp
    const statusMessages = {
      es: 'Todos los sistemas operativos',
      en: 'All systems operational',
    };
    const statusMessage = statusMessages[locale] || statusMessages.es;
    
    let statusTimestamp;
    try {
      const now = new Date();
      statusTimestamp = now.toLocaleString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      if (!statusTimestamp || statusTimestamp === 'Invalid Date') {
        statusTimestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      }
    } catch (error) {
      statusTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }
    
    // Get logo URLs
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    const bslLogoUrl = bslLogoBase64 || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = hashpassLogoBase64 || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      appUrl: 'https://bsl2025.hashpass.tech',
      statusMessage: String(statusMessage),
      statusTimestamp: String(statusTimestamp),
    };
    
    // Replace all placeholders
    htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
    
    // Send email
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: translations.subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Log email sent in database
    if (userId) {
      await supabase
        .from('user_email_logs')
        .insert({
          user_id: userId,
          email_type: 'troubleshooting',
          locale: locale,
          message_id: info.messageId,
          sent_at: new Date().toISOString()
        });
    }
    
    return { 
      success: true, 
      skipped: false, 
      messageId: info.messageId 
    };
  } catch (error) {
    console.error(`❌ Error sending email to ${email}:`, error);
    return { 
      success: false, 
      error: error.message || 'Unknown error' 
    };
  }
}

async function main() {
  console.log('🚀 Starting troubleshooting email campaign to all users (Spanish)...\n');
  console.log('⚠️  PRODUCTION MODE - This will send emails to ALL users!\n');
  
  // Confirm production mode
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  WARNING: NODE_ENV is not set to "production"');
    console.log('   Set NODE_ENV=production to proceed\n');
  }
  
  try {
    // Get all users
    const allUsers = await getAllUsers();
    
    if (allUsers.length === 0) {
      console.log('⚠️  No users found in database');
      return;
    }
    
    console.log(`\n✅ Total users found: ${allUsers.length}\n`);
    
    // Statistics
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each user
    const DELAY_BETWEEN_EMAILS = 1000; // 1 second delay to avoid rate limiting
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const email = user.email;
      const userId = user.id;
      
      if (!email) {
        console.log(`[${i + 1}/${allUsers.length}] ⚠️  Skipping user ${userId} - no email address`);
        continue;
      }
      
      console.log(`[${i + 1}/${allUsers.length}] Processing ${email}...`);
      
      const result = await sendTroubleshootingEmailToUser(userId, email, 'es');
      
      if (result.success) {
        if (result.skipped) {
          skippedCount++;
          console.log(`   ⏭️  Skipped: ${result.reason}`);
        } else {
          successCount++;
          console.log(`   ✅ Sent successfully (Message ID: ${result.messageId})`);
        }
      } else {
        errorCount++;
        errors.push({ email, userId, error: result.error });
        console.log(`   ❌ Failed: ${result.error}`);
      }
      
      // Add delay between emails (except for the last one)
      if (i < allUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
      }
      
      // Progress indicator every 10 users
      if ((i + 1) % 10 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} users processed`);
        console.log(`   ✅ Sent: ${successCount} | ⏭️  Skipped: ${skippedCount} | ❌ Failed: ${errorCount}\n`);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Campaign Summary');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${allUsers.length}`);
    console.log(`✅ Emails sent: ${successCount}`);
    console.log(`⏭️  Skipped (already sent): ${skippedCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log('='.repeat(60));
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.slice(0, 10).forEach(({ email, error }) => {
        console.log(`   ${email}: ${error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }
    
    console.log('\n✅ Campaign completed!\n');
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

