require('dotenv').config();

// We need to use dynamic import or require the compiled version
// Since this is a TypeScript project, let's use a simpler approach
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const email = process.argv[2] || 'support@hashpass.tech';
const locale = process.argv[3] || 'en';

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

// Helper functions (same as lib/email.ts)
function camelToUpperSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

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

// Helper function to convert image to base64 data URI
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

async function sendTroubleshootingEmail(email, locale = 'en') {
  try {
    console.log(`📧 Sending troubleshooting email (${locale}) to ${email}...`);
    
    // Load email template
    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'troubleshooting.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    
    // Load translations
    const emailsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'locales', 'emails.json'), 'utf-8'));
    const translations = emailsJson.troubleshooting[locale] || emailsJson.troubleshooting.en;
    
    if (!translations) {
      throw new Error(`No translations found for locale: ${locale}`);
    }
    
    // Get logo URLs - try base64 first for better email compatibility
    const bslLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'BSL.svg');
    const hashpassLogoPath = path.join(__dirname, '..', 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
    
    const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
    const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
    
    // Use base64 if available, otherwise fallback to S3 URL
    const bslLogoUrl = bslLogoBase64 || process.env.BSL_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/BSL.svg';
    const hashpassLogoUrl = hashpassLogoBase64 || process.env.HASHPASS_LOGO_URL || 'https://hashpass-email-assets.s3.us-east-2.amazonaws.com/emails/assets/images/logo-full-hashpass-white.png';
    
    const assets = {
      bslLogoUrl,
      hashpassLogoUrl,
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
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully!`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Locale: ${locale}`);
    console.log(`   To: ${email}`);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending email: ${error.message}`);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Main
console.log(`🚀 Starting troubleshooting email test...`);
console.log(`   Email: ${email}`);
console.log(`   Locale: ${locale}`);
console.log('');

sendTroubleshootingEmail(email, locale)
  .then(result => {
    if (result.success) {
      console.log('');
      console.log('✅ Done!');
      process.exit(0);
    } else {
      console.error('');
      console.error('❌ Failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('');
    console.error('❌ Error:', error);
    process.exit(1);
  });

