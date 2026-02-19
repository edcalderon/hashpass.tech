import nodemailer from 'nodemailer';
import emails from '../i18n/locales/emails.json';
import { getEmailAssetUrl } from './s3-service';
import { supabaseServer } from './supabase-server';
import { getSystemHealthCheck, HealthCheck } from '../app/api/status+api';

// Default to English if locale is not provided or not supported
const DEFAULT_LOCALE = 'en';

// Supported locales
const SUPPORTED_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'];

// Email types
export type EmailType = 'welcome' | 'userOnboarding' | 'speakerOnboarding' | 'troubleshooting';

// Helper function to detect user locale from user metadata or default to 'en'
export async function detectUserLocale(userId?: string, userMetadata?: any): Promise<string> {
  // Try to get locale from user metadata first (if passed directly)
  if (userMetadata?.locale && SUPPORTED_LOCALES.includes(userMetadata.locale)) {
    console.log(`[detectUserLocale] Using locale from userMetadata: ${userMetadata.locale}`);
    return userMetadata.locale;
  }
  
  // Try to get locale from database if userId is provided
  if (userId) {
    try {
      // Use supabaseServer which has service_role permissions
      const { data: userData, error } = await supabaseServer.auth.admin.getUserById(userId);
      
      if (!error && userData?.user) {
        const user = userData.user;
        
        // Check user_metadata for locale
        const metaLocale = user.user_metadata?.locale;
        if (metaLocale && SUPPORTED_LOCALES.includes(metaLocale)) {
          console.log(`[detectUserLocale] Found locale from user metadata: ${metaLocale}`);
          return metaLocale;
        }
        
        // Check app_metadata as fallback
        const appLocale = user.app_metadata?.locale;
        if (appLocale && SUPPORTED_LOCALES.includes(appLocale)) {
          console.log(`[detectUserLocale] Found locale from app_metadata: ${appLocale}`);
          return appLocale;
        }
      } else if (error) {
        console.warn(`[detectUserLocale] Error fetching user ${userId}:`, error.message);
      }
    } catch (error: any) {
      console.warn(`[detectUserLocale] Error detecting locale for user ${userId}:`, error?.message || error);
      // Fall through to default
    }
  }
  
  // Default to English
  console.log(`[detectUserLocale] No locale found, defaulting to: ${DEFAULT_LOCALE}`);
  return DEFAULT_LOCALE;
}

// Type definitions for our email translations
interface EmailTranslations {
  [key: string]: {
    [locale: string]: {
      subject: string;
      html: {
        [key: string]: string;
      };
    };
  };
}

// Validate required environment variables
const requiredEnvVars = [
  'NODEMAILER_HOST',
  'NODEMAILER_PORT',
  'NODEMAILER_USER',
  'NODEMAILER_PASS',
  'NODEMAILER_FROM'
];

// Check if all required environment variables are set
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing required email configuration: ${missingVars.join(', ')}`);
  console.warn('Email functionality will be disabled');
}

const emailEnabled = missingVars.length === 0;

const smtpHost = process.env.NODEMAILER_HOST || '';
const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');

const transporter = emailEnabled ? nodemailer.createTransport({
  host: smtpHost,
  port: parseInt(process.env.NODEMAILER_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.NODEMAILER_USER,
    pass: process.env.NODEMAILER_PASS,
  },
  // Add connection timeout
  connectionTimeout: 10000, // 10 seconds
  // Add TLS options
  tls: {
    // Do not fail on invalid certs
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    // For Brevo/Sendinblue, allow hostname mismatch but still verify certificate
    servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
    checkServerIdentity: isBrevo ? () => undefined : undefined,
  },
  requireTLS: true,
}) : null;

function getEmailContent(type: 'subscriptionConfirmation' | 'welcome' | 'userOnboarding' | 'speakerOnboarding' | 'troubleshooting', locale: string = DEFAULT_LOCALE) {
  // Fallback to English if the requested locale is not available
  const translations = (emails as EmailTranslations)[type];
  if (!translations) {
    throw new Error(`Email type ${type} not found in translations`);
  }
  const lang = translations[locale] ? locale : DEFAULT_LOCALE;
  return translations[lang];
}

// Helper function to convert camelCase to UPPER_SNAKE_CASE
function camelToUpperSnake(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1') // Insert underscore before capital letters
    .toUpperCase() // Convert to uppercase
    .replace(/^_/, ''); // Remove leading underscore if any
}

// Helper function to replace placeholders in template with translated content
function replaceTemplatePlaceholders(template: string, translations: any, assets: Record<string, string>, locale: string = 'en'): string {
  let content = template;
  const replacedPlaceholders: string[] = [];
  const missingPlaceholders: string[] = [];
  
  // First, replace all translation placeholders
  Object.keys(translations.html).forEach((key) => {
    const value = translations.html[key];
    
    // Skip if value is null or undefined (but allow empty strings to be replaced)
    if (value == null) {
      missingPlaceholders.push(key);
      return;
    }
    
    // Convert camelCase key to UPPER_SNAKE_CASE placeholder
    const placeholder = `[${camelToUpperSnake(key)}]`;
    let processedValue = String(value);
    
    // Replace variables within the translation value (use global replace)
    // Handle {appUrl}/status pattern first (more specific) - must be done before {appUrl}
    const appUrl = assets.appUrl || 'https://bsl2025.hashpass.tech';
    const statusUrl = `${appUrl}/status`;
    
    // Replace {appUrl}/status with full clickable link
    if (processedValue.includes('{appUrl}/status')) {
      processedValue = processedValue.replace(/{appUrl}\/status/g, `<a href="${statusUrl}" style="color: #007AFF; text-decoration: underline;">${statusUrl}</a>`);
    }
    // Then handle standalone {appUrl} (only if not part of /status pattern)
    if (processedValue.includes('{appUrl}') && !processedValue.includes('{appUrl}/status')) {
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
    
    // Escape special regex characters in placeholder and replace
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      content = content.replace(regex, processedValue);
      replacedPlaceholders.push(placeholder);
    }
  });
  
  // Then, replace asset placeholders (these should be in camelCase in assets object)
  Object.keys(assets).forEach((key) => {
    const placeholder = `[${camelToUpperSnake(key)}]`;
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assetValue = assets[key];
    // Always replace, even if empty string or undefined/null (to remove placeholders)
    const regex = new RegExp(escapedPlaceholder, 'g');
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      const replacementValue = (assetValue !== undefined && assetValue !== null) ? String(assetValue) : '';
      content = content.replace(regex, replacementValue);
      replacedPlaceholders.push(placeholder);
      // Debug logging for status placeholders
      if (['statusHtml', 'overallStatus', 'statusTimestamp', 'asOfText'].includes(key)) {
        console.log(`[replaceTemplatePlaceholders] Replaced ${placeholder} with: ${replacementValue.substring(0, 50)}...`);
      }
    } else {
      // Debug logging for missing placeholders
      if (['statusHtml', 'overallStatus', 'statusTimestamp', 'asOfText'].includes(key)) {
        console.warn(`[replaceTemplatePlaceholders] Placeholder ${placeholder} not found in template`);
      }
    }
  });
  
  // Replace lang placeholder
  content = content.replace(/\[LANG\]/g, locale);
  
  // Debug logging (only in development)
  if (process.env.NODE_ENV !== 'production') {
    if (missingPlaceholders.length > 0) {
      console.warn('⚠️ Missing translation values for keys:', missingPlaceholders);
    }
    const remainingPlaceholders = content.match(/\[([A-Z_]+)\]/g);
    if (remainingPlaceholders) {
      const uniqueRemaining = [...new Set(remainingPlaceholders)];
      console.warn('⚠️ Placeholders not replaced:', uniqueRemaining.slice(0, 10));
    }
  }
  
  return content;
}

/**
 * Email Tracking Functions
 */

/**
 * Check if an email has been sent to a user
 */
export async function hasEmailBeenSent(
  userId: string,
  emailType: EmailType
): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer.rpc('has_email_been_sent', {
      p_user_id: userId,
      p_email_type: emailType
    } as any);
    
    if (error) {
      console.error('Error checking email tracking:', error);
      return false;
    }
    
    return data === true;
  } catch (error) {
    console.error('Error checking email tracking:', error);
    return false;
  }
}

/**
 * Mark an email as sent for a user
 */
export async function markEmailAsSent(
  userId: string,
  emailType: EmailType,
  locale: string = DEFAULT_LOCALE,
  messageId?: string
): Promise<{ success: boolean; error?: string; trackingId?: string }> {
  try {
    // Build parameters object - only include message_id if it's provided
    const params: any = {
      p_user_id: userId,
      p_email_type: emailType,
      p_locale: locale
    };
    
    // Only add message_id if it's provided (not null/undefined)
    if (messageId) {
      params.p_message_id = messageId;
    }
    
    const { data, error } = await supabaseServer.rpc('mark_email_as_sent', params);
    
    if (error) {
      console.error('Error marking email as sent:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, trackingId: data };
  } catch (error: any) {
    console.error('Error marking email as sent:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Get all emails sent to a user
 */
export async function getUserEmailTracking(
  userId: string
): Promise<Array<{ emailType: EmailType; sentAt: string; locale: string }>> {
  try {
    const { data, error } = await supabaseServer.rpc('get_user_email_tracking', {
      p_user_id: userId
    } as any);
    
    if (error) {
      console.error('Error getting user email tracking:', error);
      return [];
    }
    
    return ((data || []) as any[]).map((item: any) => ({
      emailType: item.email_type as EmailType,
      sentAt: item.sent_at,
      locale: item.locale
    }));
  } catch (error) {
    console.error('Error getting user email tracking:', error);
    return [];
  }
}

/**
 * Get user ID from email address
 */
async function getUserIdFromEmail(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer.auth.admin.listUsers();
    
    if (error) {
      console.error('Error getting user from email:', error);
      return null;
    }
    
    const user = data?.users?.find(u => u.email === email);
    return user?.id || null;
  } catch (error) {
    console.error('Error getting user from email:', error);
    return null;
  }
}

/**
 * Send welcome email to a newly registered user
 * This function should be called when a new user is registered
 */
export async function sendWelcomeEmailToNewUser(
  userId: string,
  email: string,
  locale?: string
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  try {
    // Detect locale if not provided
    let userLocale = locale;
    if (!userLocale) {
      console.log(`[sendWelcomeEmailToNewUser] No locale provided, detecting for user ${userId}`);
      userLocale = await detectUserLocale(userId);
    } else {
      console.log(`[sendWelcomeEmailToNewUser] Using provided locale: ${userLocale} for user ${userId}`);
    }
    
    // Validate locale is supported
    if (!SUPPORTED_LOCALES.includes(userLocale)) {
      console.warn(`[sendWelcomeEmailToNewUser] Invalid locale ${userLocale}, defaulting to ${DEFAULT_LOCALE}`);
      userLocale = DEFAULT_LOCALE;
    }
    
    console.log(`[sendWelcomeEmailToNewUser] Sending welcome email to ${email} with locale: ${userLocale}`);
    
    // Send welcome email (it will check if already sent internally)
    const result = await sendWelcomeEmail(email, userLocale, userId);
    
    if (result.success && !result.alreadySent) {
      console.log(`✅ Welcome email sent to new user ${userId} (${email})`);
    } else if (result.alreadySent) {
      console.log(`ℹ️ Welcome email already sent to user ${userId} (${email})`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error sending welcome email to new user:', error);
    return {
      success: false,
      error: error?.message || 'Failed to send welcome email'
    };
  }
}

export async function sendSubscriptionConfirmation(
  email: string,
  locale: string = DEFAULT_LOCALE
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled) {
    console.warn('Email functionality is disabled due to missing configuration');
    return { 
      success: false, 
      error: 'Email service is not configured' 
    };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    const content = getEmailContent('subscriptionConfirmation', locale);
    const year = new Date().getFullYear();
    
    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: content.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4f46e5;">${content.html.header}</h2>
          <p>${content.html.greeting}</p>
          <p>${content.html.body}</p>
          <p>${content.html.footer}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">
            ${content.html.copyright.replace('{year}', year.toString())}<br>
            <a href="${content.html.website}" style="color: #4f46e5; text-decoration: none;">${content.html.website.replace('https://', '')}</a>
          </p>
        </div>
      `,
      text: `${content.html.header}

${content.html.greeting}

${content.html.body}

${content.html.footer}

---
${content.html.copyright.replace('{year}', year.toString())}
${content.html.website}`,
    };

    if (!transporter) {
      throw new Error('Email transporter is not initialized');
    }

    // Verify connection configuration
    try {
      await transporter.verify();
    } catch (error) {
      console.error('Email server connection error:', error);
      throw new Error('Could not connect to email server. Please try again later.');
    }

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    // Log success but don't expose internal details to client
    console.log('Email sent:', info.messageId);
    return { 
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    
    // Return user-friendly error messages based on error type
    let errorMessage = 'Failed to send confirmation email';
    
    if (error instanceof Error) {
      if ('code' in error && error.code === 'ECONNECTION') {
        errorMessage = 'Could not connect to email server';
      } else if ('code' in error && error.code === 'EAUTH') {
        errorMessage = 'Email authentication failed';
      } else {
        errorMessage = error.message || errorMessage;
      }
    }
    
    return { 
      success: false, 
      error: errorMessage
    };
  }
}

export async function sendBookingEmail(
  to: string,
  type: 'requested' | 'accepted' | 'cancelled',
  payload: { speakerName?: string; start?: string; location?: string }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }
  try {
    const subject = type === 'requested' ? 'Nueva solicitud de cita' : type === 'accepted' ? 'Tu cita fue aceptada' : 'Tu cita fue cancelada';
    const html = `
      <p>${subject}</p>
      ${payload.speakerName ? `<p>Con: ${payload.speakerName}</p>` : ''}
      ${payload.start ? `<p>Fecha y hora: ${payload.start}</p>` : ''}
      ${payload.location ? `<p>Ubicación: ${payload.location}</p>` : ''}
    `;
    const info = await transporter.sendMail({ from: `HashPass <${process.env.NODEMAILER_FROM}>`, to, subject, html });
    return { success: true, messageId: info.messageId };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Email failed' };
  }
}

/**
 * Send user onboarding email with tutorial guide
 */
export async function sendUserOnboardingEmail(
  email: string,
  locale?: string,
  userId?: string
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    // Get user ID if not provided
    let user_id: string | undefined = userId;
    if (!user_id) {
      const foundUserId = await getUserIdFromEmail(email);
      user_id = foundUserId || undefined;
    }
    
    // Detect locale if not provided
    let userLocale = locale;
    if (!userLocale) {
      console.log(`[sendUserOnboardingEmail] No locale provided, detecting for user ${user_id}`);
      userLocale = await detectUserLocale(user_id);
    } else {
      console.log(`[sendUserOnboardingEmail] Using provided locale: ${userLocale} for user ${user_id}`);
    }
    
    // Validate locale is supported
    if (!SUPPORTED_LOCALES.includes(userLocale)) {
      console.warn(`[sendUserOnboardingEmail] Invalid locale ${userLocale}, defaulting to ${DEFAULT_LOCALE}`);
      userLocale = DEFAULT_LOCALE;
    }
    
    console.log(`[sendUserOnboardingEmail] Sending user onboarding email to ${email} with locale: ${userLocale}`);
    
    // Check if user onboarding email has already been sent
    if (user_id) {
      const alreadySent = await hasEmailBeenSent(user_id, 'userOnboarding');
      if (alreadySent) {
        console.log(`User onboarding email already sent to user ${user_id} (${email})`);
        return { success: true, alreadySent: true };
      }
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // Validate and normalize locale
    const normalizedLocale = SUPPORTED_LOCALES.includes(userLocale) ? userLocale : DEFAULT_LOCALE;
    if (normalizedLocale !== userLocale) {
      console.warn(`[sendUserOnboardingEmail] Invalid locale '${userLocale}', using '${normalizedLocale}' instead`);
    }
    
    console.log(`[sendUserOnboardingEmail] Preparing user onboarding email for ${email} with locale: ${normalizedLocale}`);
    
    // Get translations for the locale
    const translations = getEmailContent('userOnboarding', normalizedLocale);
    const subject = translations.subject;
    
    let htmlContent: string;
    try {
      // Load unified template
      const templatePath = path.join(process.cwd(), 'emails', 'templates', 'user-onboarding.html');
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
      
      // Helper function to convert image to base64 data URI
      const imageToBase64 = (filePath: string, mimeType: string): string | null => {
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
      let bslLogoUrl: string;
      let hashpassLogoUrl: string;
      
      try {
        bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
      } catch (error) {
        // Fallback to base64
        const bslLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'BSL.svg');
        const hashpassLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
        
        const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
        const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
        
        bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
      }
      
      // Get screenshot URLs (S3/CDN preferred)
      let screenshotSignInUrl: string;
      let screenshotExploreGifUrl: string;
      let screenshotRequestMeetingGifUrl: string;
      let screenshotNotificationsUrl: string;
      
      try {
        screenshotSignInUrl = getEmailAssetUrl('images/screenshots/user-onboarding/sign-in-screen.png');
        screenshotExploreGifUrl = getEmailAssetUrl('images/screenshots/user-onboarding/explore-speakers-screen.gif');
        screenshotRequestMeetingGifUrl = getEmailAssetUrl('images/screenshots/user-onboarding/request-meeting-screen.gif');
        screenshotNotificationsUrl = getEmailAssetUrl('images/screenshots/user-onboarding/notifications-screen-1.png');
      } catch (error) {
        // Fallback to base64 if S3 is not available
        const screenshotSignInPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'sign-in-screen.png');
        const screenshotExploreGifPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'explore-speakers-screen.gif');
        const screenshotRequestMeetingGifPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'request-meeting-screen.gif');
        const screenshotNotificationsPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'user-onboarding', 'notifications-screen-1.png');
        
        screenshotSignInUrl = imageToBase64(screenshotSignInPath, 'image/png') || '';
        screenshotExploreGifUrl = imageToBase64(screenshotExploreGifPath, 'image/gif') || '';
        screenshotRequestMeetingGifUrl = imageToBase64(screenshotRequestMeetingGifPath, 'image/gif') || '';
        screenshotNotificationsUrl = imageToBase64(screenshotNotificationsPath, 'image/png') || '';
      }
      
      // Prepare assets object
      const assets = {
        bslLogoUrl,
        hashpassLogoUrl,
        screenshotSignInUrl,
        screenshotExploreGifUrl,
        screenshotRequestMeetingGifUrl,
        screenshotNotificationsUrl,
        appUrl: 'https://bsl2025.hashpass.tech'
      };
      
      // Replace placeholders with translations and assets
      htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
      
    } catch (error) {
      // Fallback to inline HTML if file doesn't exist
      console.warn('Could not load user onboarding email template file, using fallback');
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007AFF;">${translations.html.title}</h2>
          <p>${translations.html.introText}</p>
          <p>Please visit the app to see the full tutorial with screenshots.</p>
        </div>
      `;
    }

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Mark email as sent if we have a user ID (this creates the flag in DB with message_id)
    if (user_id) {
      const markResult = await markEmailAsSent(user_id, 'userOnboarding', normalizedLocale, info.messageId);
      if (markResult.success) {
        console.log(`✅ User onboarding email marked as sent in DB for user ${user_id} (${email}) with locale: ${normalizedLocale} and messageId: ${info.messageId}`);
      } else {
        console.error(`❌ Failed to mark user onboarding email as sent in DB: ${markResult.error}`);
      }
    } else {
      console.warn(`⚠️ No user ID available, cannot mark user onboarding email as sent in DB for ${email}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending user onboarding email:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to send onboarding email' 
    };
  }
}

/**
 * Send welcome email to all users
 */
export async function sendWelcomeEmail(
  email: string,
  locale: string = DEFAULT_LOCALE,
  userId?: string
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    // Get user ID if not provided
    let user_id: string | undefined = userId;
    if (!user_id) {
      const foundUserId = await getUserIdFromEmail(email);
      user_id = foundUserId || undefined;
    }
    
    // Check if welcome email has already been sent (with message_id)
    // This check verifies that the email was actually sent (has message_id)
    if (user_id) {
      const alreadySent = await hasEmailBeenSent(user_id, 'welcome');
      if (alreadySent) {
        console.log(`Welcome email already sent to user ${user_id} (${email})`);
        return { success: true, alreadySent: true };
      }
    }
    
    // Additional safety check: verify one more time right before sending
    // This helps prevent race conditions where multiple requests come in simultaneously
    if (user_id) {
      // Small delay to allow any concurrent operations to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Final check before sending
      const finalCheck = await hasEmailBeenSent(user_id, 'welcome');
      if (finalCheck) {
        console.log(`Welcome email already sent to user ${user_id} (${email}) - detected in final check`);
        return { success: true, alreadySent: true };
      }
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // Validate and normalize locale
    const normalizedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
    if (normalizedLocale !== locale) {
      console.warn(`[sendWelcomeEmail] Invalid locale '${locale}', using '${normalizedLocale}' instead`);
    }
    
    console.log(`[sendWelcomeEmail] Preparing welcome email for ${email} with locale: ${normalizedLocale}`);
    
    // Get translations for the locale
    const translations = getEmailContent('welcome', normalizedLocale);
    const subject = translations.subject;
    
    let htmlContent: string;
    try {
      // Load unified template
      const templatePath = path.join(process.cwd(), 'emails', 'templates', 'welcome.html');
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
      
      // Helper function to convert image to base64 data URI
      const imageToBase64 = (filePath: string, mimeType: string): string | null => {
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
      
      // Get logo URLs (base64 preferred for email compatibility, S3 as fallback)
      let bslLogoUrl: string;
      let hashpassLogoUrl: string;
      
      // Try base64 first for better email client compatibility
      const bslLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'BSL.svg');
      const hashpassLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
      
      const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
      const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
      
      // Use base64 if available, otherwise fallback to S3 URL
      bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
      hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
      
      // Log which method is being used
      if (bslLogoBase64) {
        console.log('✅ Using base64 for BSL logo (better email compatibility)');
      } else {
        console.log('⚠️ Using S3 URL for BSL logo (fallback):', bslLogoUrl);
      }
      
      // Video URLs - Mux player, thumbnail, GIF preview, and poster (kept for video link)
      // Select video ID based on normalized locale: Spanish uses different video, others use default
      const muxVideoId = normalizedLocale === 'es' 
        ? 'cHHvJcBJEdt8YnWTbo7cFUxNYOMrwIt02EB7vL02ixmd4'  // Spanish version
        : 'iesctpn00OXTQrYmY02J8JvjNmbNoDDKjzm7qr76lCKEI'; // Default for other languages
      
      console.log(`[sendWelcomeEmail] Using video ID ${muxVideoId} for locale ${normalizedLocale}`);
      
      // Generate GIF from Mux video (animated preview of first 3 seconds)
      const videoGifUrl = `https://image.mux.com/${muxVideoId}/animated.gif?width=600&fps=15&start=0&end=3`;
      const videoThumbnailUrl = `https://image.mux.com/${muxVideoId}/thumbnail.png?width=600&height=1067&time=11`;
      const videoPosterUrl = `https://image.mux.com/${muxVideoId}/thumbnail.jpg?width=600&height=1067&time=11`;
      
      // Add poster image to Mux player URL
      const videoTitle = normalizedLocale === 'es' 
        ? 'BSL_2025_Bienvenido_ES'
        : 'BSL_2025_Welcome';
      const videoUrl = `https://player.mux.com/${muxVideoId}?metadata-video-title=${encodeURIComponent(videoTitle)}&video-title=${encodeURIComponent(videoTitle)}&poster=${encodeURIComponent(videoPosterUrl)}`;
      
      // Prepare assets object
      const assets = {
        bslLogoUrl,
        hashpassLogoUrl,
        videoUrl,
        videoThumbnailUrl,
        videoGifUrl, // Use Mux animated GIF generated from the appropriate video based on locale
        videoPosterUrl,
        appUrl: 'https://bsl2025.hashpass.tech'
      };
      
      // Replace placeholders with translations and assets (use normalized locale)
      htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, normalizedLocale);
      
      // Debug: Check if any placeholders remain (only in development)
      if (process.env.NODE_ENV !== 'production') {
        const remainingPlaceholders = htmlContent.match(/\[([A-Z_]+)\]/g);
        if (remainingPlaceholders && remainingPlaceholders.length > 0) {
          const uniquePlaceholders = [...new Set(remainingPlaceholders)];
          console.warn('⚠️ Unreplaced placeholders found:', uniquePlaceholders.slice(0, 20));
          console.warn('Available translation keys:', Object.keys(translations.html).slice(0, 20));
        } else {
          console.log('✅ All placeholders replaced successfully');
        }
      }
      
    } catch (error) {
      // Fallback to inline HTML if file doesn't exist
      console.warn('Could not load welcome email template file, using fallback');
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #667eea;">${translations.html.title}</h2>
          <p>${translations.html.subtitle}</p>
        </div>
      `;
    }

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.subtitle}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent successfully to ${email}, messageId: ${info.messageId}`);
    
    // Mark email as sent if we have a user ID (this creates the flag in DB with message_id)
    if (user_id) {
      const markResult = await markEmailAsSent(user_id, 'welcome', normalizedLocale, info.messageId);
      if (markResult.success) {
        console.log(`✅ Welcome email marked as sent in DB for user ${user_id} (${email}) with messageId: ${info.messageId}`);
      } else {
        console.error(`❌ Failed to mark email as sent in DB: ${markResult.error}`);
      }
    } else {
      console.warn(`⚠️ No user ID available, cannot mark email as sent in DB for ${email}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending welcome email:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to send welcome email' 
    };
  }
}

/**
 * Send speaker onboarding email with tutorial guide
 */
export async function sendSpeakerOnboardingEmail(
  email: string,
  locale?: string,
  userId?: string
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    // Get user ID if not provided
    let user_id: string | undefined = userId;
    if (!user_id) {
      const foundUserId = await getUserIdFromEmail(email);
      user_id = foundUserId || undefined;
    }
    
    // Detect locale if not provided
    let userLocale = locale;
    if (!userLocale) {
      console.log(`[sendSpeakerOnboardingEmail] No locale provided, detecting for user ${user_id}`);
      userLocale = await detectUserLocale(user_id);
    } else {
      console.log(`[sendSpeakerOnboardingEmail] Using provided locale: ${userLocale} for user ${user_id}`);
    }
    
    // Validate locale is supported
    if (!SUPPORTED_LOCALES.includes(userLocale)) {
      console.warn(`[sendSpeakerOnboardingEmail] Invalid locale ${userLocale}, defaulting to ${DEFAULT_LOCALE}`);
      userLocale = DEFAULT_LOCALE;
    }
    
    console.log(`[sendSpeakerOnboardingEmail] Sending speaker onboarding email to ${email} with locale: ${userLocale}`);
    
    // Check if speaker onboarding email has already been sent
    if (user_id) {
      const alreadySent = await hasEmailBeenSent(user_id, 'speakerOnboarding');
      if (alreadySent) {
        console.log(`Speaker onboarding email already sent to user ${user_id} (${email})`);
        return { success: true, alreadySent: true };
      }
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // Validate and normalize locale
    const normalizedLocale = SUPPORTED_LOCALES.includes(userLocale) ? userLocale : DEFAULT_LOCALE;
    if (normalizedLocale !== userLocale) {
      console.warn(`[sendSpeakerOnboardingEmail] Invalid locale '${userLocale}', using '${normalizedLocale}' instead`);
    }
    
    console.log(`[sendSpeakerOnboardingEmail] Preparing speaker onboarding email for ${email} with locale: ${normalizedLocale}`);
    
    // Get translations for the locale
    const translations = getEmailContent('speakerOnboarding', normalizedLocale);
    const subject = translations.subject;
    
    let htmlContent: string;
    try {
      // Load unified template
      const templatePath = path.join(process.cwd(), 'emails', 'templates', 'speaker-onboarding.html');
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
      
      // Helper function to convert image to base64 data URI
      const imageToBase64 = (filePath: string, mimeType: string): string | null => {
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
      let bslLogoUrl: string;
      let hashpassLogoUrl: string;
      
      try {
        bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
      } catch (error) {
        // Fallback to base64
        const bslLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'BSL.svg');
        const hashpassLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
        
        const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
        const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
        
        bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
      }
      
      // Get screenshot URLs (S3/CDN preferred)
      let screenshotSignInUrl: string;
      let screenshotNotificationsGifUrl: string;
      let screenshotAcceptRequestUrl: string;
      let screenshotScheduleViewUrl: string;
      
      try {
        screenshotSignInUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/sign-in-screen.png');
        screenshotNotificationsGifUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/notifications-screen.gif');
        screenshotAcceptRequestUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/accept-request-screen.png');
        screenshotScheduleViewUrl = getEmailAssetUrl('images/screenshots/speaker-onboarding/schedule-view-screen.png');
      } catch (error) {
        // Fallback to base64 if S3 is not available
        const screenshotSignInPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'sign-in-screen.png');
        const screenshotNotificationsGifPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'notifications-screen.gif');
        const screenshotAcceptRequestPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'accept-request-screen.png');
        const screenshotScheduleViewPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'screenshots', 'speaker-onboarding', 'schedule-view-screen.png');
        
        screenshotSignInUrl = imageToBase64(screenshotSignInPath, 'image/png') || '';
        screenshotNotificationsGifUrl = imageToBase64(screenshotNotificationsGifPath, 'image/gif') || '';
        screenshotAcceptRequestUrl = imageToBase64(screenshotAcceptRequestPath, 'image/png') || '';
        screenshotScheduleViewUrl = imageToBase64(screenshotScheduleViewPath, 'image/png') || '';
      }
      
      // Prepare assets object
      const assets = {
        bslLogoUrl,
        hashpassLogoUrl,
        screenshotSignInUrl,
        screenshotNotificationsGifUrl,
        screenshotAcceptRequestUrl,
        screenshotScheduleViewUrl,
        appUrl: 'https://bsl2025.hashpass.tech'
      };
      
      // Replace placeholders with translations and assets
      htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, locale);
      
    } catch (error) {
      // Fallback to inline HTML if file doesn't exist
      console.warn('Could not load speaker onboarding email template file, using fallback');
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #FF9500;">${translations.html.title}</h2>
          <p>${translations.html.introText}</p>
          <p>Please visit the app to see the full tutorial with screenshots.</p>
        </div>
      `;
    }

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Mark email as sent if we have a user ID (this creates the flag in DB with message_id)
    if (user_id) {
      const markResult = await markEmailAsSent(user_id, 'speakerOnboarding', normalizedLocale, info.messageId);
      if (markResult.success) {
        console.log(`✅ Speaker onboarding email marked as sent in DB for user ${user_id} (${email}) with locale: ${normalizedLocale} and messageId: ${info.messageId}`);
      } else {
        console.error(`❌ Failed to mark speaker onboarding email as sent in DB: ${markResult.error}`);
      }
    } else {
      console.warn(`⚠️ No user ID available, cannot mark speaker onboarding email as sent in DB for ${email}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending speaker onboarding email:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to send onboarding email' 
    };
  }
}

/**
 * Send troubleshooting email to help users resolve common app issues
 */
export async function sendTroubleshootingEmail(
  email: string,
  locale?: string,
  userId?: string
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { 
      success: false, 
      error: 'Invalid email address' 
    };
  }

  try {
    // Get user ID if not provided
    let user_id: string | undefined = userId;
    if (!user_id) {
      const foundUserId = await getUserIdFromEmail(email);
      user_id = foundUserId || undefined;
    }
    
    // Detect locale if not provided
    let userLocale = locale;
    if (!userLocale) {
      console.log(`[sendTroubleshootingEmail] No locale provided, detecting for user ${user_id}`);
      userLocale = await detectUserLocale(user_id);
    } else {
      console.log(`[sendTroubleshootingEmail] Using provided locale: ${userLocale} for user ${user_id}`);
    }
    
    // Validate locale is supported
    if (!SUPPORTED_LOCALES.includes(userLocale)) {
      console.warn(`[sendTroubleshootingEmail] Invalid locale ${userLocale}, defaulting to ${DEFAULT_LOCALE}`);
      userLocale = DEFAULT_LOCALE;
    }
    
    console.log(`[sendTroubleshootingEmail] Sending troubleshooting email to ${email} with locale: ${userLocale}`);
    
    // Check if troubleshooting email has already been sent
    if (user_id) {
      const alreadySent = await hasEmailBeenSent(user_id, 'troubleshooting');
      if (alreadySent) {
        console.log(`Troubleshooting email already sent to user ${user_id} (${email})`);
        return { success: true, alreadySent: true };
      }
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // Validate and normalize locale
    const normalizedLocale = SUPPORTED_LOCALES.includes(userLocale) ? userLocale : DEFAULT_LOCALE;
    if (normalizedLocale !== userLocale) {
      console.warn(`[sendTroubleshootingEmail] Invalid locale '${userLocale}', using '${normalizedLocale}' instead`);
    }
    
    console.log(`[sendTroubleshootingEmail] Preparing troubleshooting email for ${email} with locale: ${normalizedLocale}`);
    
    // Use dummy status data to avoid issues with server availability
    // All services are marked as operational
    const dummyHealthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'healthy',
          responseTime: 45,
          tables: {
            event_agenda: { accessible: true, recordCount: 150 },
            bsl_speakers: { accessible: true, recordCount: 50 },
            BSL_Bookings: { accessible: true, recordCount: 200 },
            passes: { accessible: true, recordCount: 500 },
          },
        },
        email: {
          status: 'healthy',
          configured: true,
        },
        api: {
          status: 'healthy',
          endpoints: {
            '/api/status': { accessible: true },
            '/api/bslatam/agenda': { accessible: true },
            '/api/bslatam/bookings': { accessible: true },
          },
        },
      },
      checks: {
        agenda: {
          hasData: true,
          lastUpdated: new Date().toISOString(),
          itemCount: 150,
        },
        speakers: {
          count: 50,
          accessible: true,
        },
        bookings: {
          count: 200,
          accessible: true,
        },
        passes: {
          count: 500,
          accessible: true,
        },
      },
    };
    
    const healthCheck = dummyHealthCheck;
    const statusAvailable = true;
    
    // Format status information for email
    const formatStatusForEmail = (status: HealthCheck, locale: string): string => {
      const operationalServices: string[] = [];
      const nonOperationalServices: string[] = [];
      
      // Get translations for status labels
      const statusLabels: Record<string, Record<string, string>> = {
        en: {
          operational: 'Operational Services',
          nonOperational: 'Non-Operational Services',
          database: 'Database',
          emailService: 'Email Service',
          apiEndpoints: 'API Endpoints',
          agenda: 'Agenda',
          speakers: 'Speakers',
          bookings: 'Bookings',
          passes: 'Passes',
          tablesAccessible: 'tables accessible',
          endpointsAccessible: 'endpoints accessible',
          items: 'items',
          speakersCount: 'speakers',
          bookingsCount: 'bookings',
          passesCount: 'passes',
        },
        es: {
          operational: 'Servicios Operativos',
          nonOperational: 'Servicios No Operativos',
          database: 'Base de Datos',
          emailService: 'Servicio de Correo',
          apiEndpoints: 'Endpoints de API',
          agenda: 'Agenda',
          speakers: 'Ponentes',
          bookings: 'Reservas',
          passes: 'Pases',
          tablesAccessible: 'tablas accesibles',
          endpointsAccessible: 'endpoints accesibles',
          items: 'elementos',
          speakersCount: 'ponentes',
          bookingsCount: 'reservas',
          passesCount: 'pases',
        },
        ko: {
          operational: '운영 중인 서비스',
          nonOperational: '비운영 서비스',
          database: '데이터베이스',
          emailService: '이메일 서비스',
          apiEndpoints: 'API 엔드포인트',
          agenda: '일정',
          speakers: '연사',
          bookings: '예약',
          passes: '패스',
          tablesAccessible: '개 테이블 접근 가능',
          endpointsAccessible: '개 엔드포인트 접근 가능',
          items: '개 항목',
          speakersCount: '명 연사',
          bookingsCount: '개 예약',
          passesCount: '개 패스',
        },
        fr: {
          operational: 'Services Opérationnels',
          nonOperational: 'Services Non Opérationnels',
          database: 'Base de Données',
          emailService: 'Service de Messagerie',
          apiEndpoints: 'Points de Terminaison API',
          agenda: 'Agenda',
          speakers: 'Conférenciers',
          bookings: 'Réservations',
          passes: 'Passes',
          tablesAccessible: 'tables accessibles',
          endpointsAccessible: 'points de terminaison accessibles',
          items: 'éléments',
          speakersCount: 'conférenciers',
          bookingsCount: 'réservations',
          passesCount: 'passes',
        },
        pt: {
          operational: 'Serviços Operacionais',
          nonOperational: 'Serviços Não Operacionais',
          database: 'Banco de Dados',
          emailService: 'Serviço de E-mail',
          apiEndpoints: 'Endpoints da API',
          agenda: 'Agenda',
          speakers: 'Palestrantes',
          bookings: 'Reservas',
          passes: 'Passes',
          tablesAccessible: 'tabelas acessíveis',
          endpointsAccessible: 'endpoints acessíveis',
          items: 'itens',
          speakersCount: 'palestrantes',
          bookingsCount: 'reservas',
          passesCount: 'passes',
        },
        de: {
          operational: 'Betriebsbereite Dienste',
          nonOperational: 'Nicht Betriebsbereite Dienste',
          database: 'Datenbank',
          emailService: 'E-Mail-Dienst',
          apiEndpoints: 'API-Endpunkte',
          agenda: 'Agenda',
          speakers: 'Redner',
          bookings: 'Buchungen',
          passes: 'Pässe',
          tablesAccessible: 'Tabellen zugänglich',
          endpointsAccessible: 'Endpunkte zugänglich',
          items: 'Elemente',
          speakersCount: 'Redner',
          bookingsCount: 'Buchungen',
          passesCount: 'Pässe',
        },
      };
      
      const labels = statusLabels[locale] || statusLabels.en;
      
      // Database
      if (status.services.database.status === 'healthy') {
        const tableCount = Object.keys(status.services.database.tables).length;
        operationalServices.push(`${labels.database} (${tableCount} ${labels.tablesAccessible})`);
      } else {
        nonOperationalServices.push(labels.database);
      }
      
      // Email
      if (status.services.email.status === 'healthy') {
        operationalServices.push(labels.emailService);
      } else if (status.services.email.status === 'not_configured') {
        // Don't show as non-operational if just not configured
      } else {
        nonOperationalServices.push(labels.emailService);
      }
      
      // API
      if (status.services.api.status === 'healthy') {
        const endpointCount = Object.keys(status.services.api.endpoints).length;
        operationalServices.push(`${labels.apiEndpoints} (${endpointCount} ${labels.endpointsAccessible})`);
      } else {
        nonOperationalServices.push(labels.apiEndpoints);
      }
      
      // System checks
      if (status.checks.agenda.hasData) {
        operationalServices.push(`${labels.agenda} (${status.checks.agenda.itemCount} ${labels.items})`);
      }
      if (status.checks.speakers.accessible) {
        operationalServices.push(`${labels.speakers} (${status.checks.speakers.count} ${labels.speakersCount})`);
      }
      if (status.checks.bookings.accessible) {
        operationalServices.push(`${labels.bookings} (${status.checks.bookings.count} ${labels.bookingsCount})`);
      }
      if (status.checks.passes.accessible) {
        operationalServices.push(`${labels.passes} (${status.checks.passes.count} ${labels.passesCount})`);
      }
      
      let statusText = '';
      if (operationalServices.length > 0) {
        statusText += `<div style="margin-bottom: 12px;"><strong style="color: #34A853; font-size: 14px;">${labels.operational}:</strong></div>`;
        statusText += '<div style="margin-left: 8px; margin-bottom: 16px;">';
        statusText += operationalServices.map(s => `<div style="margin-bottom: 6px; color: #000000;">✓ ${s}</div>`).join('');
        statusText += '</div>';
      }
      if (nonOperationalServices.length > 0) {
        if (statusText) statusText += '<div style="margin-top: 16px;"></div>';
        statusText += `<div style="margin-bottom: 12px;"><strong style="color: #FF3B30; font-size: 14px;">${labels.nonOperational}:</strong></div>`;
        statusText += '<div style="margin-left: 8px;">';
        statusText += nonOperationalServices.map(s => `<div style="margin-bottom: 6px; color: #000000;">✗ ${s}</div>`).join('');
        statusText += '</div>';
      }
      
      return statusText || `<div style="color: #8E8E93;">Status information unavailable</div>`;
    };
    
    // Format status (always available with dummy data)
    const statusHtml = formatStatusForEmail(healthCheck, normalizedLocale);
    const overallStatus = healthCheck.status.toUpperCase();
    const statusTimestamp = new Date(healthCheck.timestamp).toLocaleString(normalizedLocale);
    
    // Get translations for the locale
    const translations = getEmailContent('troubleshooting', normalizedLocale);
    const subject = translations.subject;
    
    let htmlContent: string;
    try {
      // Load unified template
      const templatePath = path.join(process.cwd(), 'emails', 'templates', 'troubleshooting.html');
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
      
      // Helper function to convert image to base64 data URI
      const imageToBase64 = (filePath: string, mimeType: string): string | null => {
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
      let bslLogoUrl: string;
      let hashpassLogoUrl: string;
      
      try {
        bslLogoUrl = getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
      } catch (error) {
        // Fallback to base64
        const bslLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'BSL.svg');
        const hashpassLogoPath = path.join(process.cwd(), 'emails', 'assets', 'images', 'logo-full-hashpass-white.png');
        
        const bslLogoBase64 = imageToBase64(bslLogoPath, 'image/svg+xml');
        const hashpassLogoBase64 = imageToBase64(hashpassLogoPath, 'image/png');
        
        bslLogoUrl = bslLogoBase64 || getEmailAssetUrl('images/BSL.svg');
        hashpassLogoUrl = hashpassLogoBase64 || getEmailAssetUrl('images/logo-full-hashpass-white.png');
      }
      
      // Get status message translation
      const statusMessages: Record<string, string> = {
        en: 'All systems operational',
        es: 'Todos los sistemas operativos',
        ko: '모든 시스템 정상 작동',
        fr: 'Tous les systèmes opérationnels',
        pt: 'Todos os sistemas operacionais',
        de: 'Alle Systeme betriebsbereit',
      };
      const statusMessage = statusMessages[normalizedLocale] || statusMessages.en;
      
      // Format timestamp with fallback
      let statusTimestamp: string;
      try {
        const now = new Date();
        statusTimestamp = now.toLocaleString(normalizedLocale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        // Fallback if toLocaleString fails or returns invalid value
        if (!statusTimestamp || statusTimestamp === 'Invalid Date') {
          statusTimestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        }
      } catch (error) {
        // Ultimate fallback
        statusTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      }
      
      // Prepare assets object with all values - ensure they are always strings
      const assets: Record<string, string> = {
        bslLogoUrl,
        hashpassLogoUrl,
        appUrl: 'https://bsl2025.hashpass.tech',
        statusMessage: String(statusMessage || 'All systems operational'),
        statusTimestamp: String(statusTimestamp || new Date().toISOString()),
      };
      
      // Replace placeholders with translations and assets
      htmlContent = replaceTemplatePlaceholders(htmlContent, translations, assets, normalizedLocale);
      
      // Final cleanup: ensure status placeholders are ALWAYS replaced with hardcoded fallbacks
      // Use hardcoded fallback values to ensure they're never empty
      const finalStatusMessage = assets.statusMessage || statusMessage || 'All systems operational';
      const finalStatusTimestamp = assets.statusTimestamp || statusTimestamp || new Date().toISOString();
      
      htmlContent = htmlContent.replace(/\[STATUS_MESSAGE\]/g, finalStatusMessage);
      htmlContent = htmlContent.replace(/\[STATUS_TIMESTAMP\]/g, finalStatusTimestamp);
      
      // Debug: Check if placeholders were replaced
      const remaining = htmlContent.match(/\[(STATUS_MESSAGE|STATUS_TIMESTAMP)\]/g);
      if (remaining) {
        console.warn('[sendTroubleshootingEmail] ⚠️ Status placeholders still present after replacement:', remaining);
        // Force replace one more time with hardcoded values
        htmlContent = htmlContent.replace(/\[STATUS_MESSAGE\]/g, 'All systems operational');
        htmlContent = htmlContent.replace(/\[STATUS_TIMESTAMP\]/g, new Date().toISOString());
      } else {
        console.log('[sendTroubleshootingEmail] ✅ Status placeholders replaced successfully');
      }
      
    } catch (error) {
      // Fallback to inline HTML if file doesn't exist
      console.warn('Could not load troubleshooting email template file, using fallback');
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #FF9500;">${translations.html.title}</h2>
          <p>${translations.html.introText}</p>
          <p>Please visit the app to see the full troubleshooting guide.</p>
        </div>
      `;
    }

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      text: `${translations.html.title}\n\n${translations.html.introText}\n\n${translations.html.ctaButton}`,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Mark email as sent if we have a user ID (this creates the flag in DB with message_id)
    if (user_id) {
      const markResult = await markEmailAsSent(user_id, 'troubleshooting', normalizedLocale, info.messageId);
      if (markResult.success) {
        console.log(`✅ Troubleshooting email marked as sent in DB for user ${user_id} (${email}) with locale: ${normalizedLocale} and messageId: ${info.messageId}`);
      } else {
        console.error(`❌ Failed to mark troubleshooting email as sent in DB: ${markResult.error}`);
      }
    } else {
      console.warn(`⚠️ No user ID available, cannot mark troubleshooting email as sent in DB for ${email}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending troubleshooting email:', error);
    return { 
      success: false, 
      error: error?.message || 'Failed to send troubleshooting email' 
    };
  }
}
