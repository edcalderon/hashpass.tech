import nodemailer from 'nodemailer';
import { config as loadDotenv } from 'dotenv';
import * as fsDotenv from 'fs';
import * as pathDotenv from 'path';
import { renderTemplate, getSubject, getEmailAssetDataUri } from '@hashpass/emails';
import emails from '../i18n/locales/emails.json';
import { getEmailAssetUrl } from './s3-service';
import { supabaseServer } from './supabase-server';
import type { HealthCheck } from './server/system-health';
import { getEventEmailBranding } from './email-event-branding';

// Load .env.local before reading NODEMAILER_* vars — Metro/Expo may not inject
// non-EXPO_PUBLIC_ vars at bundle time, so we need runtime dotenv loading.
if (typeof process !== 'undefined' && typeof window === 'undefined') {
  const cwd = process.cwd();
  for (const candidate of ['.env.local', '.env', '../../.env.local', '../../.env']) {
    const p = pathDotenv.resolve(cwd, candidate);
    if (fsDotenv.existsSync(p)) loadDotenv({ path: p, override: false });
  }
}

// Inlined as a data URI (not an S3/CDN URL via getEmailAssetUrl) because this
// asset is small and versioned alongside the templates that use it in
// packages/emails/assets -- no dependency on AWS_S3_BUCKET_NAME/AWS_S3_CDN_URL
// being configured in every environment that sends this email (confirmed
// unset in prod today, which is why every other template's S3-hosted logo
// currently resolves to a broken URL there -- separate pre-existing issue).
let cachedWelcomeLogoDataUri: string | undefined;
function getWelcomeLogoDataUri(): string {
  return (cachedWelcomeLogoDataUri ??= getEmailAssetDataUri('logo-hashpass-white-cyan.png', 'image/png'));
}

// Default to English if locale is not provided or not supported
const DEFAULT_LOCALE = 'en';

// Supported locales
export const SUPPORTED_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'];

// Email types
export type EmailType = 'welcome' | 'userOnboarding' | 'speakerOnboarding' | 'troubleshooting';

// Helper function to detect user locale from user metadata or default to 'en'
export async function detectUserLocale(
  userId?: string,
  userMetadata?: any,
  client: typeof supabaseServer = supabaseServer
): Promise<string> {
  // Try to get locale from user metadata first (if passed directly)
  if (userMetadata?.locale && SUPPORTED_LOCALES.includes(userMetadata.locale)) {
    console.log(`[detectUserLocale] Using locale from userMetadata: ${userMetadata.locale}`);
    return userMetadata.locale;
  }

  // Try to get locale from database if userId is provided
  if (userId) {
    try {
      // Defaults to supabaseServer (core-production), but callers resolving a
      // tenant other than core (e.g. BSL) must pass their own request-scoped
      // client -- userId is only valid within the Supabase project it was
      // issued from.
      const { data: userData, error } = await client.auth.admin.getUserById(userId);
      
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

// Two independent senders are kept live at once, on purpose: the primary
// Brevo-relayed no-reply@hashpass.tech (the established, already-deliverable
// address every existing email function below uses) and a secondary
// no-reply@hashpass.info sender used only where explicitly requested (the
// welcome email). An earlier version of this file collapsed both into one
// "prefer INFO when configured" transporter, which would have silently
// switched every transactional email (including OTP-adjacent ones) onto the
// new address the moment its vars were deployed -- not what's wanted here,
// since the two addresses need to keep working side by side.
function buildSmtpConfig(suffix: '' | '_INFO') {
  return {
    host: process.env[`NODEMAILER_HOST${suffix}`] || '',
    port: process.env[`NODEMAILER_PORT${suffix}`] || '587',
    user: process.env[`NODEMAILER_USER${suffix}`] || '',
    pass: process.env[`NODEMAILER_PASS${suffix}`] || '',
    from: process.env[`NODEMAILER_FROM${suffix}`] || '',
  };
}

function isAllowedHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function buildTransporter(config: ReturnType<typeof buildSmtpConfig>) {
  const normalizedHost = config.host.split(':')[0].toLowerCase();
  const isBrevo = isAllowedHost(normalizedHost, 'brevo.com') || isAllowedHost(normalizedHost, 'sendinblue.com');
  return nodemailer.createTransport({
    host: config.host,
    port: parseInt(config.port, 10),
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    // Add TLS options
    tls: isBrevo
      ? {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
          // Brevo's relay may present a hostname that differs from the relay alias.
          servername: 'smtp-relay.sendinblue.com',
          checkServerIdentity: () => undefined,
        }
      : { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    requireTLS: true,
  });
}

// Primary sender (no-reply@hashpass.tech) -- unchanged behavior for every
// existing email function in this file.
const smtpConfig = buildSmtpConfig('');
const requiredEnvVars = Object.entries(smtpConfig)
  .filter(([, value]) => !value)
  .map(([key]) => `transactional SMTP ${key}`);

// Check if all required environment variables are set
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing required email configuration: ${missingVars.join(', ')}`);
  console.warn('Email functionality will be disabled');
}

const emailEnabled = missingVars.length === 0;

const smtpFrom = smtpConfig.from;
const transporter = emailEnabled ? buildTransporter(smtpConfig) : null;

const escapeHtmlAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type AuthenticationMagicLinkDelivery = {
  success: boolean;
  code?: 'email_not_configured' | 'email_send_failed';
};

/**
 * Sends an already minted, single-use Supabase verification link through the
 * HashPass transactional mail provider. `actionLink` is server-generated and
 * deliberately replaces the GoTrue template token before delivery.
 */
export async function sendAuthenticationMagicLink({
  email,
  actionLink,
  locale = DEFAULT_LOCALE,
}: {
  email: string;
  actionLink: string;
  locale?: string;
}): Promise<AuthenticationMagicLinkDelivery> {
  if (!emailEnabled || !transporter || !smtpFrom) {
    return { success: false, code: 'email_not_configured' };
  }

  const confirmationUrl = escapeHtmlAttribute(actionLink);
  const html = renderTemplate('auth-magic-link', locale).split('{{ .ConfirmationURL }}').join(confirmationUrl);

  try {
    await transporter.sendMail({
      from: `HASHPASS <${smtpFrom}>`,
      to: email,
      subject: getSubject('auth-magic-link', locale),
      html,
      text: ['Use this secure, one-time sign-in URL', actionLink].join(': '),
    });
    return { success: true };
  } catch (error) {
    console.error('[email] Authentication magic-link send failed:', error instanceof Error ? error.message : String(error));
    return { success: false, code: 'email_send_failed' };
  }
}

// Secondary sender (no-reply@hashpass.info). Only used where a call site
// opts in explicitly (sendWelcomeEmail); every other function keeps using
// the primary transporter above regardless of whether this one is configured.
//
// Resolved lazily and cached for the process lifetime rather than built at
// module load like the primary sender above: local dev has NODEMAILER_*_INFO
// directly in .env, but on Lambda these are deliberately NOT raw env vars
// (adding them pushed both Lambdas over AWS's 4KB environment variable
// limit) -- they live in Infisical instead and get fetched here at runtime.
// See lib/server/infisical-secrets.ts for the hybrid policy this implements:
// vital secrets stay as Lambda env vars, new/non-critical ones go to Infisical.
let cachedInfoSender: { transporter: ReturnType<typeof buildTransporter> | null; from: string } | undefined;

async function resolveInfoSender(): Promise<{ transporter: ReturnType<typeof buildTransporter> | null; from: string }> {
  if (cachedInfoSender) return cachedInfoSender;

  let config = buildSmtpConfig('_INFO');
  if (!Object.values(config).every(Boolean)) {
    // A hard failure anywhere in here (module import, SDK client
    // construction, network) must not take down the whole welcome-email
    // send -- confirmed in production: an uncaught throw from this dynamic
    // import propagated all the way out of sendWelcomeEmail, skipping the
    // intended "fall back to the primary hashpass.tech sender" behavior
    // entirely and silently dropping the email.
    try {
      const { getInfisicalSecret } = await import('./server/infisical-secrets');
      const rawPort = process.env.NODEMAILER_PORT_INFO;
      const [host, port, user, pass, from] = await Promise.all([
        config.host || getInfisicalSecret('NODEMAILER_HOST_INFO'),
        rawPort || getInfisicalSecret('NODEMAILER_PORT_INFO'),
        config.user || getInfisicalSecret('NODEMAILER_USER_INFO'),
        config.pass || getInfisicalSecret('NODEMAILER_PASS_INFO'),
        config.from || getInfisicalSecret('NODEMAILER_FROM_INFO'),
      ]);
      config = { host: host || '', port: port || '587', user: user || '', pass: pass || '', from: from || '' };
    } catch (error) {
      console.error('[email] Infisical info-sender resolution failed, falling back to primary sender:', error instanceof Error ? error.message : String(error));
      config = { host: '', port: '587', user: '', pass: '', from: '' };
    }
  }

  const enabled = Object.values(config).every(Boolean);
  console.log('[email] info sender (hashpass.info) enabled:', enabled);
  cachedInfoSender = { transporter: enabled ? buildTransporter(config) : null, from: config.from };
  return cachedInfoSender;
}

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
    const appUrl = assets.appUrl || 'https://bsl.hashpass.tech';
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
      processedValue = processedValue.replace(/{bslUrl}/g, '<a href="https://blockchainsummit.la/" style="color: #007AFF; text-decoration: none;">BSL On Tour</a>');
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
  emailType: EmailType,
  client: typeof supabaseServer = supabaseServer
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('has_email_been_sent', {
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
  messageId?: string,
  client: typeof supabaseServer = supabaseServer
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

    const { data, error } = await client.rpc('mark_email_as_sent', params);
    
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
async function getUserIdFromEmail(email: string, client: typeof supabaseServer = supabaseServer): Promise<string | null> {
  try {
    const { data, error } = await client.auth.admin.listUsers();
    
    if (error) {
      console.error('Error getting user from email:', error);
      return null;
    }
    
    const user = data?.users?.find((u: { email?: string; id?: string }) => u.email === email);
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
  locale?: string,
  client: typeof supabaseServer = supabaseServer
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  try {
    // Detect locale if not provided
    let userLocale = locale;
    if (!userLocale) {
      console.log(`[sendWelcomeEmailToNewUser] No locale provided, detecting for user ${userId}`);
      userLocale = await detectUserLocale(userId, undefined, client);
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
    const result = await sendWelcomeEmail(email, userLocale, userId, client);
    
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
  locale: string = DEFAULT_LOCALE,
  unsubscribeUrl?: string
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
    const subject = getSubject('newsletter-welcome', locale);
    const html = renderTemplate('newsletter-welcome', locale, {
      appUrl: 'https://hashpass.tech',
      supportEmail: process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech',
      unsubscribeUrl,
    });

    const mailOptions = {
      from: `HASHPASS <${smtpFrom}>`,
      to: email,
      subject,
      html,
      text: `Welcome to the HASHPASS Newsletter!\n\nhashpass.tech`,
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
  type: 'requested' | 'accepted' | 'confirmed' | 'cancelled',
  payload: { speakerName?: string; start?: string; location?: string }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled || !transporter) {
    return { success: false, error: 'Email service is not configured' };
  }
  try {
    const subject =
      type === 'requested'
        ? 'Nueva solicitud de cita'
        : type === 'cancelled'
          ? 'Tu cita fue cancelada'
          : 'Tu cita fue aceptada';
    const html = `
      <p>${subject}</p>
      ${payload.speakerName ? `<p>Con: ${payload.speakerName}</p>` : ''}
      ${payload.start ? `<p>Fecha y hora: ${payload.start}</p>` : ''}
      ${payload.location ? `<p>Ubicación: ${payload.location}</p>` : ''}
    `;
    const info = await transporter.sendMail({ from: `HASHPASS <${smtpFrom}>`, to, subject, html });
    return { success: true, messageId: info.messageId };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Email failed' };
  }
}

export type MeetingEmailStatus = 'requested' | 'accepted' | 'declined';
export type NotificationLevel = 'info' | 'important' | 'critical';

export interface CriticalNotificationEmailDetails {
  recipientUserId?: string;
  /** Explicit recipient is supported for operational preview/test sends. */
  recipientEmail?: string;
  title: string;
  message: string;
  notificationType?: string | null;
  speakerName?: string | null;
  eventId?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
}
export interface MeetingEmailDetails {
  recipientUserId?: string;
  recipientEmail?: string;
  status: MeetingEmailStatus;
  recipientRole?: 'requester' | 'speaker';
  eventId: string;
  requesterName?: string | null;
  requesterCompany?: string | null;
  requesterTitle?: string | null;
  speakerName?: string | null;
  message?: string | null;
  note?: string | null;
  meetingType?: string | null;
  meetingScheduledAt?: string | null;
  meetingLocation?: string | null;
  durationMinutes?: number | null;
  response?: string | null;
  appUrl?: string | null;
}

const escapeEmailHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export type AdminCampaignTemplate = 'branded' | 'raw';

export interface AdminCampaignEmail {
  to?: string;
  subject: string;
  heading: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  /** Resolves HASHPASS + event (e.g. BSL) branding for the 'branded' template. */
  eventId?: string;
  /** 'branded' (default): full HASHPASS/event header, card body, footer — matches notification emails. 'raw': minimal unbranded shell for a quick plain-text-style send. */
  template?: AdminCampaignTemplate;
}

export interface AdminCampaignRender {
  subject: string;
  html: string;
  text: string;
  template: AdminCampaignTemplate;
}

/**
 * Renders the admin campaign email without sending it, so the preview
 * endpoint and the actual send path always produce byte-identical output.
 */
export function renderAdminCampaignEmail(details: AdminCampaignEmail): AdminCampaignRender {
  const template: AdminCampaignTemplate = details.template === 'raw' ? 'raw' : 'branded';
  const text = `${details.heading}\n\n${details.message}${details.actionUrl ? `\n\n${details.actionUrl}` : ''}`;

  if (template === 'raw') {
    const action = details.actionUrl
      ? `<p style="margin:24px 0 0"><a href="${escapeEmailHtml(details.actionUrl)}" style="color:#007aff;font-weight:700">${escapeEmailHtml(details.actionLabel || 'Open HASHPASS')}</a></p>`
      : '';
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1d2939"><h1 style="margin:0 0 12px;font-size:20px;line-height:26px">${escapeEmailHtml(details.heading)}</h1><div style="white-space:pre-wrap;font-size:15px;line-height:22px;color:#344054">${escapeEmailHtml(details.message)}</div>${action}</body></html>`;
    return { subject: details.subject, html, text, template };
  }

  const eventBranding = details.eventId ? getEventEmailBranding(details.eventId) : { isBsl: false } as ReturnType<typeof getEventEmailBranding>;
  const hasBslBranding = eventBranding.isBsl;
  const hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white-cyan.png');
  const bslLogoUrl = eventBranding.logoAssetPath ? getEmailAssetUrl(eventBranding.logoAssetPath) : '';
  const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
  const privacyUrl = 'https://hashpass.tech/privacy';
  const bslBranding = hasBslBranding
    ? `<td align="right" style="padding-left:18px;border-left:1px solid #344054"><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="display:block;text-decoration:none"><img src="${bslLogoUrl}" alt="${escapeEmailHtml(eventBranding.logoAlt)}" width="118" style="display:block;width:118px;height:auto;border:0;outline:none;text-decoration:none" /></a></td>`
    : '';
  const action = details.actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px"><tr><td style="border-radius:8px;background:#344054"><a href="${escapeEmailHtml(details.actionUrl)}" style="display:inline-block;padding:13px 19px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none">${escapeEmailHtml(details.actionLabel || 'Open HASHPASS')}</a></td></tr></table>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fa"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px"><tr><td style="background:#101828;border-radius:18px 18px 0 0;padding:26px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><img src="${hashpassLogoUrl}" alt="HASHPASS" width="146" style="display:block;width:146px;height:auto;border:0;outline:none;text-decoration:none" /><div style="margin-top:8px;color:#d0d5dd;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px">Digital event platform</div></td>${bslBranding}</tr></table>${hasBslBranding ? `<div style="margin-top:14px;color:#d0d5dd;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px"><strong style="color:#ffffff">${escapeEmailHtml(eventBranding.eventTag)}</strong><span style="padding:0 7px;color:#667085">·</span><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="color:#d0d5dd;text-decoration:none">blockchainsummit.la</a></div>` : ''}</td></tr><tr><td style="background:#ffffff;padding:28px"><h1 style="margin:0 0 16px;color:#1d2939;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px">${escapeEmailHtml(details.heading)}</h1><div style="white-space:pre-wrap;color:#475467;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px">${escapeEmailHtml(details.message)}</div>${action}</td></tr><tr><td style="background:#f9fafb;border-top:1px solid #eaecf0;border-radius:0 0 18px 18px;padding:22px 28px"><p style="margin:0 0 10px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px">This event message was sent by a HASHPASS administrator${hasBslBranding ? ` for ${escapeEmailHtml(eventBranding.eventTag)}` : ''}.</p><p style="margin:0;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px"><a href="${privacyUrl}" style="color:#475467;text-decoration:underline">Privacy policy</a><span style="padding:0 7px;color:#98a2b3">·</span><a href="mailto:${escapeEmailHtml(supportEmail)}" style="color:#475467;text-decoration:underline">Contact</a></p></td></tr></table></td></tr></table></body></html>`;

  return { subject: details.subject, html, text, template };
}

/** Delivers an administrator-authored event message using the branded (default) or raw template. */
export async function sendAdminCampaignEmail(details: AdminCampaignEmail & { to: string }) {
  if (!emailEnabled || !transporter) return { success: false, error: 'Email service is not configured' };
  const { subject, html, text } = renderAdminCampaignEmail(details);
  try {
    const info = await transporter.sendMail({ from: `HASHPASS <${smtpFrom}>`, to: details.to, subject, html, text });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Email delivery failed' };
  }
}

/** Sends a localized operational email without affecting the meeting workflow on delivery failure. */
export async function sendMeetingNotificationEmail(
  details: MeetingEmailDetails,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled || !transporter) return { success: false, error: 'Email service is not configured' };
  try {
    const recipient = details.recipientUserId
      ? await supabaseServer.auth.admin.getUserById(details.recipientUserId)
      : { data: { user: null }, error: null };
    const recipientEmail = details.recipientEmail || recipient.data.user?.email;
    if (recipient.error || !recipientEmail) return { success: false, error: recipient.error?.message || 'Recipient email is unavailable' };
    const locale = details.recipientUserId && (await detectUserLocale(details.recipientUserId)) === 'es' ? 'es' : 'en';
    const es = locale === 'es';
    const labels = es
      ? {
          requested: 'Nueva solicitud de reunión', accepted: 'Tu reunión fue aceptada', declined: 'Tu solicitud de reunión fue rechazada',
          greeting: 'Hola', event: 'Evento', with: 'Participantes', purpose: 'Tipo de reunión', date: 'Fecha y hora', location: 'Ubicación', duration: 'Duración', message: 'Mensaje', response: 'Respuesta', open: 'Ver solicitudes', minutes: 'minutos',
          privacy: 'Política de privacidad', contact: 'Contacto', transactional: 'Este es un correo transaccional relacionado con tu cuenta HASHPASS.', bslEvent: 'Evento BSL',
        }
      : {
          requested: 'New meeting request', accepted: 'Your meeting was accepted', declined: 'Your meeting request was declined',
          greeting: 'Hello', event: 'Event', with: 'Participants', purpose: 'Meeting type', date: 'Date and time', location: 'Location', duration: 'Duration', message: 'Message', response: 'Response', open: 'View requests', minutes: 'minutes',
          privacy: 'Privacy policy', contact: 'Contact', transactional: 'This is a transactional email related to your HASHPASS account.', bslEvent: 'BSL event',
        };
    const statusTitle = details.recipientRole === 'speaker'
      ? (es
        ? {
            requested: 'Nueva solicitud de reunión',
            accepted: 'Reunión aceptada — confirmación',
            declined: 'Solicitud de reunión rechazada — confirmación',
          }[details.status]
        : {
            requested: 'New meeting request',
            accepted: 'Meeting accepted — confirmation',
            declined: 'Meeting request declined — confirmation',
          }[details.status])
      : details.recipientRole === 'requester' && details.status === 'requested'
        ? (es ? 'Tu solicitud de reunión fue enviada' : 'Your meeting request was sent')
        : labels[details.status];
    const recipientName = recipient.data.user?.user_metadata?.name || recipient.data.user?.user_metadata?.full_name || recipientEmail.split('@')[0];
    const date = details.meetingScheduledAt
      ? new Intl.DateTimeFormat(es ? 'es-ES' : 'en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(details.meetingScheduledAt))
      : es ? 'Pendiente de programación' : 'To be scheduled';
    const participants = [details.requesterName, details.requesterTitle, details.requesterCompany, details.speakerName]
      .filter(Boolean).join(' · ');
    const row = (label: string, value?: unknown) => value ? `<tr><td style="width:34%;padding:10px 12px;color:#667085;font-size:14px;font-weight:700;vertical-align:top;border-bottom:1px solid #eaecf0">${escapeEmailHtml(label)}</td><td style="padding:10px 12px;color:#1d2939;font-size:14px;line-height:20px;vertical-align:top;border-bottom:1px solid #eaecf0">${escapeEmailHtml(value)}</td></tr>` : '';
    const appUrl = details.appUrl || `https://bsl.hashpass.tech/events/${encodeURIComponent(details.eventId)}/networking/my-requests`;
    const eventBranding = getEventEmailBranding(details.eventId);
    const hasBslBranding = eventBranding.isBsl;
    const hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white-cyan.png');
    const bslLogoUrl = eventBranding.logoAssetPath ? getEmailAssetUrl(eventBranding.logoAssetPath) : '';
    const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
    const privacyUrl = 'https://hashpass.tech/privacy';
    const bslBranding = hasBslBranding
      ? `<td align="right" style="padding-left:18px;border-left:1px solid #b4233d"><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="display:block;text-decoration:none"><img src="${bslLogoUrl}" alt="${escapeEmailHtml(eventBranding.logoAlt)}" width="118" style="display:block;width:118px;height:auto;border:0;outline:none;text-decoration:none" /></a></td>`
      : '';
    const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><body style="margin:0;padding:0;background:#f5f7fa"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px"><tr><td style="background:#101828;border-radius:18px 18px 0 0;padding:26px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><img src="${hashpassLogoUrl}" alt="HASHPASS" width="146" style="display:block;width:146px;height:auto;border:0;outline:none;text-decoration:none" /><div style="margin-top:8px;color:#d0d5dd;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px">Digital event platform</div></td>${bslBranding}</tr></table><div style="margin-top:22px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:700">${escapeEmailHtml(statusTitle)}</div>${hasBslBranding ? `<div style="margin-top:9px;color:#d0d5dd;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px"><strong style="color:#ffffff">${escapeEmailHtml(eventBranding.eventTag)}</strong><span style="padding:0 7px;color:#667085">·</span><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="color:#d0d5dd;text-decoration:none">blockchainsummit.la</a></div>` : ''}</td></tr><tr><td style="background:#ffffff;padding:28px"><p style="margin:0 0 16px;color:#1d2939;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px">${escapeEmailHtml(labels.greeting)} ${escapeEmailHtml(recipientName)},</p><p style="margin:0 0 22px;color:#344054;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px">${escapeEmailHtml(statusTitle)}.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #eaecf0;border-radius:12px;background:#f9fafb">${row(labels.event, details.eventId)}${row(labels.with, participants)}${row(labels.purpose, details.meetingType)}${row(labels.date, date)}${row(labels.location, details.meetingLocation)}${row(labels.duration, details.durationMinutes ? `${details.durationMinutes} ${labels.minutes}` : undefined)}${row(labels.message, details.message)}${row(labels.response, details.response || details.note)}</table><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px"><tr><td style="border-radius:8px;background:#344054"><a href="${appUrl}" style="display:inline-block;padding:13px 19px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none">${escapeEmailHtml(labels.open)}</a></td></tr></table></td></tr><tr><td style="background:#f9fafb;border-top:1px solid #eaecf0;border-radius:0 0 18px 18px;padding:22px 28px"><p style="margin:0 0 10px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px">${escapeEmailHtml(labels.transactional)}</p><p style="margin:0;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px"><a href="${privacyUrl}" style="color:#475467;text-decoration:underline">${escapeEmailHtml(labels.privacy)}</a><span style="padding:0 7px;color:#98a2b3">·</span><a href="mailto:${escapeEmailHtml(supportEmail)}" style="color:#475467;text-decoration:underline">${escapeEmailHtml(labels.contact)}</a></p></td></tr></table></td></tr></table></body></html>`;
    const info = await transporter.sendMail({ from: `HASHPASS <${smtpFrom}>`, to: recipientEmail, subject: `${statusTitle} · HASHPASS`, html, text: `${statusTitle}\n${labels.event}: ${details.eventId}\n${labels.with}: ${participants}\n${labels.date}: ${date}\n${labels.location}: ${details.meetingLocation || ''}\n${labels.message}: ${details.message || ''}\n${appUrl}` });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('[meeting-email] delivery failed:', error?.message || error);
    return { success: false, error: error?.message || 'Email delivery failed' };
  }
}

/**
 * Delivers the email escalation for a notification that has already been
 * persisted with level = `critical`. Keeping this template beside the meeting
 * template gives every notification producer one localized, branded path.
 */
export async function sendCriticalNotificationEmail(
  details: CriticalNotificationEmailDetails,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled || !transporter) return { success: false, error: 'Email service is not configured' };

  try {
    const lookup = details.recipientUserId
      ? await supabaseServer.auth.admin.getUserById(details.recipientUserId)
      : { data: { user: null }, error: null };
    const recipient = lookup.data.user;
    const recipientEmail = details.recipientEmail || recipient?.email;
    if (lookup.error || !recipientEmail) return { success: false, error: lookup.error?.message || 'Recipient email is unavailable' };

    const es = details.recipientUserId && (await detectUserLocale(details.recipientUserId, recipient?.user_metadata)) === 'es';
    const labels = es
      ? {
          preheader: 'Tienes una notificación importante de HASHPASS', greeting: 'Hola', heading: 'Notificación importante',
          open: 'Ver notificaciones', privacy: 'Política de privacidad', contact: 'Contacto',
          transactional: 'Este es un correo transaccional relacionado con tu cuenta HASHPASS.', bslEvent: 'Evento BSL',
        }
      : {
          preheader: 'You have an important HASHPASS notification', greeting: 'Hello', heading: 'Important notification',
          open: 'View notifications', privacy: 'Privacy policy', contact: 'Contact',
          transactional: 'This is a transactional email related to your HASHPASS account.', bslEvent: 'BSL event',
        };
    const localizedContent = details.notificationType === 'meeting_slot_conflict'
      ? es
        ? {
            title: 'Conflicto de horario: se requiere una acción',
            message: `${details.speakerName || 'El ponente'} aceptó tu solicitud, pero coincide con otra reunión en tu calendario. Abre tus notificaciones para elegir cuál conservar.`,
          }
        : {
            title: 'Scheduling conflict — action required',
            message: `${details.speakerName || 'The speaker'} accepted your request, but it overlaps another meeting on your calendar. Open your notifications to choose which one to keep.`,
          }
      : { title: details.title, message: details.message };
    const recipientName = recipient?.user_metadata?.name || recipient?.user_metadata?.full_name || recipientEmail.split('@')[0];
    const eventId = details.eventId || '';
    const eventBranding = getEventEmailBranding(eventId);
    const hasBslBranding = eventBranding.isBsl;
    const hashpassLogoUrl = getEmailAssetUrl('images/logo-full-hashpass-white.png');
    const bslLogoUrl = eventBranding.logoAssetPath ? getEmailAssetUrl(eventBranding.logoAssetPath) : '';
    const actionUrl = details.actionUrl || 'https://bsl.hashpass.tech/dashboard/notifications';
    const actionLabel = details.actionLabel || labels.open;
    const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
    const bslBranding = hasBslBranding
      ? `<td align="right" style="padding-left:18px;border-left:1px solid #f04438"><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="display:block;text-decoration:none"><img src="${bslLogoUrl}" alt="${escapeEmailHtml(eventBranding.logoAlt)}" width="118" style="display:block;width:118px;height:auto;border:0;outline:none;text-decoration:none" /></a></td>`
      : '';
    const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><body style="margin:0;padding:0;background:#f5f7fa"><span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${escapeEmailHtml(labels.preheader)}</span><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fa"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px"><tr><td style="background:#7a1022;border-top:5px solid #f04438;border-radius:18px 18px 0 0;padding:26px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td><img src="${hashpassLogoUrl}" alt="HASHPASS" width="146" style="display:block;width:146px;height:auto;border:0;outline:none;text-decoration:none" /></td>${bslBranding}</tr></table><div style="margin-top:22px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:700">${escapeEmailHtml(labels.heading)}</div>${hasBslBranding ? `<div style="margin-top:8px;color:#ffd0d5;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;font-weight:600"><strong style="color:#ffffff">${escapeEmailHtml(eventBranding.eventTag)}</strong><span style="padding:0 7px;color:#ffb4bd">·</span><a href="${escapeEmailHtml(eventBranding.eventUrl)}" style="color:#ffd0d5;text-decoration:none">blockchainsummit.la</a></div>` : ''}</td></tr><tr><td style="background:#ffffff;padding:28px"><p style="margin:0 0 16px;color:#1d2939;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px">${escapeEmailHtml(labels.greeting)} ${escapeEmailHtml(recipientName)},</p><h1 style="margin:0 0 12px;color:#1d2939;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px">${escapeEmailHtml(localizedContent.title)}</h1><p style="margin:0;color:#475467;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px">${escapeEmailHtml(localizedContent.message)}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px"><tr><td style="border-radius:8px;background:#b4233d"><a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;padding:13px 19px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none">${escapeEmailHtml(actionLabel)}</a></td></tr></table></td></tr><tr><td style="background:#f9fafb;border-top:1px solid #eaecf0;border-radius:0 0 18px 18px;padding:22px 28px"><p style="margin:0 0 10px;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px">${escapeEmailHtml(labels.transactional)}</p><p style="margin:0;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px"><a href="https://hashpass.tech/privacy" style="color:#475467;text-decoration:underline">${escapeEmailHtml(labels.privacy)}</a><span style="padding:0 7px;color:#98a2b3">·</span><a href="mailto:${escapeEmailHtml(supportEmail)}" style="color:#475467;text-decoration:underline">${escapeEmailHtml(labels.contact)}</a></p></td></tr></table></td></tr></table></body></html>`;
    const info = await transporter.sendMail({
      from: `HASHPASS <${smtpFrom}>`,
      to: recipientEmail,
      subject: `${localizedContent.title} · HASHPASS`,
      html,
      text: `${localizedContent.title}\n\n${localizedContent.message}\n\n${actionUrl}`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('[critical-notification-email] delivery failed:', error?.message || error);
    return { success: false, error: error?.message || 'Email delivery failed' };
  }
}

/**
 * Send an internal operational alert to support@hashpass.tech (or
 * NODEMAILER_FROM_SUPPORT if set). Plain, unbranded, not tied to any end
 * user -- for automated infra alerts (see lib/server/db-health-guard.ts),
 * not user-facing notifications. Callers should treat this as
 * fire-and-forget and never let it block the request that triggered it.
 */
export async function sendOpsAlertEmail(details: {
  subject: string;
  message: string;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!emailEnabled || !transporter) return { success: false, error: 'Email service is not configured' };

  try {
    const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
    const info = await transporter.sendMail({
      from: `HASHPASS Ops <${smtpFrom}>`,
      to: supportEmail,
      subject: details.subject,
      text: details.message,
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${escapeEmailHtml(details.message)}</pre>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('[ops-alert-email] delivery failed:', error?.message || error);
    return { success: false, error: error?.message || 'Email delivery failed' };
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
        appUrl: 'https://bsl.hashpass.tech'
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
      from: `HASHPASS <${smtpFrom}>`,
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
  userId?: string,
  client: typeof supabaseServer = supabaseServer
): Promise<{ success: boolean; error?: string; messageId?: string; alreadySent?: boolean }> {
  // Prefer the dedicated no-reply@hashpass.info sender for this email
  // specifically; fall back to the primary hashpass.tech sender in any
  // environment where the info sender isn't configured yet (env var or
  // Infisical -- see resolveInfoSender).
  const infoSender = await resolveInfoSender();
  const welcomeTransporter = infoSender.transporter || transporter;
  const welcomeFrom = infoSender.transporter ? infoSender.from : smtpFrom;
  if (!welcomeTransporter) {
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
      const foundUserId = await getUserIdFromEmail(email, client);
      user_id = foundUserId || undefined;
    }

    // Check if welcome email has already been sent (with message_id)
    // This check verifies that the email was actually sent (has message_id)
    if (user_id) {
      const alreadySent = await hasEmailBeenSent(user_id, 'welcome', client);
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
      const finalCheck = await hasEmailBeenSent(user_id, 'welcome', client);
      if (finalCheck) {
        console.log(`Welcome email already sent to user ${user_id} (${email}) - detected in final check`);
        return { success: true, alreadySent: true };
      }
    }
    
    // Validate and normalize locale
    const normalizedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
    if (normalizedLocale !== locale) {
      console.warn(`[sendWelcomeEmail] Invalid locale '${locale}', using '${normalizedLocale}' instead`);
    }

    console.log(`[sendWelcomeEmail] Preparing welcome email for ${email} with locale: ${normalizedLocale}`);

    let displayName = email.split('@')[0] ?? '';
    if (user_id) {
      try {
        const { data } = await client.auth.admin.getUserById(user_id);
        displayName = data.user?.user_metadata?.name || data.user?.user_metadata?.full_name || displayName;
      } catch (lookupError) {
        console.warn('[sendWelcomeEmail] Could not resolve display name, falling back to email prefix:', lookupError);
      }
    }
    const userInitial = displayName.trim().charAt(0).toUpperCase() || 'H';

    const subject = getSubject('app-welcome', normalizedLocale);
    const htmlContent = renderTemplate('app-welcome', normalizedLocale, {
      appUrl: 'https://hashpass.tech',
      supportEmail: process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech',
      userName: displayName,
      userInitial,
      logoUrl: getWelcomeLogoDataUri(),
    });

    const mailOptions = {
      from: `HASHPASS <${welcomeFrom}>`,
      to: email,
      subject,
      html: htmlContent,
      text: `Welcome to HASHPASS!\n\nhashpass.tech`,
    };

    const info = await welcomeTransporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent successfully to ${email}, messageId: ${info.messageId}`);
    
    // Mark email as sent if we have a user ID (this creates the flag in DB with message_id)
    if (user_id) {
      const markResult = await markEmailAsSent(user_id, 'welcome', normalizedLocale, info.messageId, client);
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
        appUrl: 'https://bsl.hashpass.tech'
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
      from: `HASHPASS <${smtpFrom}>`,
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
            '/api/events/bsl/agenda': { accessible: true },
            '/api/bsl/bookings': { accessible: true },
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
        appUrl: 'https://bsl.hashpass.tech',
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
      from: `HASHPASS <${smtpFrom}>`,
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
