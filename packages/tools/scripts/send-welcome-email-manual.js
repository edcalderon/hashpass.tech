require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client with service role
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
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
  console.error('Email service is not configured');
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
    // For Brevo/Sendinblue, allow hostname mismatch but still verify certificate
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
function replaceTemplatePlaceholders(template, translations, assets, locale = 'en') {
  let content = template;
  
  // Replace all translation placeholders
  Object.keys(translations.html).forEach((key) => {
    const value = translations.html[key];
    
    if (value == null || value === '') {
      console.warn(`⚠️ Missing translation for key: ${key}`);
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
  
  // Check for remaining placeholders
  const remainingPlaceholders = content.match(/\[([A-Z_]+)\]/g);
  if (remainingPlaceholders) {
    const uniqueRemaining = [...new Set(remainingPlaceholders)];
    console.warn('⚠️ Placeholders not replaced:', uniqueRemaining.slice(0, 20));
  } else {
    console.log('✅ All placeholders replaced successfully');
  }
  
  return content;
}

async function sendWelcomeEmail(userId, email, locale = 'en') {
  try {
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'welcome.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.welcome[locale] || emailsJson.welcome.en;
    
    // Get asset URLs
    const bslLogoUrl = process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    const muxVideoId = 'Qd5r8ynE2wr92Ph00Fl5zuiQx00Eh7i7SV901eZjBKKbLQ';
    const videoThumbnailUrl = `https://image.mux.com/${muxVideoId}/thumbnail.png?width=600&height=1067&time=11`;
    const videoGifUrl = `https://image.mux.com/${muxVideoId}/animated.gif?width=600&fps=15&start=0&end=3`;
    const videoPosterUrl = `https://image.mux.com/${muxVideoId}/thumbnail.jpg?width=600&height=1067&time=11`;
    
    // Add poster image to Mux player URL
    const videoUrl = `https://player.mux.com/${muxVideoId}?metadata-video-title=BSL_2025_%ED%99%98%EC%98%81_ES_en&video-title=BSL_2025_%ED%99%98%EC%98%81_ES_en&poster=${encodeURIComponent(videoPosterUrl)}`;
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
      videoUrl,
      videoThumbnailUrl,
      videoGifUrl,
      videoPosterUrl,
      appUrl: 'https://bsl2025.hashpass.tech'
    };
    
    // Replace all placeholders using the same logic as lib/email.ts
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
    console.log('✅ Email sent successfully:', info.messageId);
    
    // Mark as sent in database
    const { data, error } = await supabase.rpc('mark_email_as_sent', {
      p_user_id: userId,
      p_email_type: 'welcome',
      p_locale: locale
    });
    
    if (error) {
      console.error('⚠️ Error marking email as sent:', error);
    } else {
      console.log('✅ Email marked as sent in database');
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Main
const userId = process.argv[2] || '0c776bc2-4858-49ec-8432-a6d50dac24f3';
const email = process.argv[3] || 'edwardca12@gmail.com';
const locale = process.argv[4] || 'en';

console.log(`📧 Sending welcome email to ${email} (${userId})...`);
sendWelcomeEmail(userId, email, locale)
  .then(result => {
    if (result.success) {
      console.log('✅ Done!');
      process.exit(0);
    } else {
      console.error('❌ Failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

