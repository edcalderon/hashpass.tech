import { Platform, Linking } from 'react-native';

/**
 * Detects the email provider from an email address and returns the URL to open it
 */

export interface EmailProvider {
  name: string;
  url: string;
  deepLink?: string; // Mobile deep link
  icon?: string;
}

export function getEmailProviderUrl(email: string): EmailProvider | null {
  if (!email || !email.includes('@')) {
    return null;
  }

  const domain = email.split('@')[1]?.toLowerCase() || '';
  
  // Gmail
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return {
      name: 'Gmail',
      url: 'https://mail.google.com',
      deepLink: 'googlegmail://', // Gmail app deep link
      icon: 'gmail',
    };
  }

  // Outlook / Hotmail / Live / MSN
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain === 'outlook.fr' ||
    domain === 'outlook.de' ||
    domain === 'outlook.es' ||
    domain === 'outlook.it' ||
    domain === 'outlook.co.uk'
  ) {
    return {
      name: 'Outlook',
      url: 'https://outlook.live.com',
      deepLink: 'ms-outlook://', // Outlook app deep link
      icon: 'outlook',
    };
  }

  // Yahoo
  if (
    domain === 'yahoo.com' ||
    domain === 'yahoo.co.uk' ||
    domain === 'yahoo.fr' ||
    domain === 'yahoo.de' ||
    domain === 'yahoo.es' ||
    domain === 'yahoo.it' ||
    domain === 'ymail.com' ||
    domain === 'rocketmail.com'
  ) {
    return {
      name: 'Yahoo Mail',
      url: 'https://mail.yahoo.com',
      deepLink: 'ymail://', // Yahoo Mail app deep link
      icon: 'yahoo',
    };
  }

  // Apple iCloud
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return {
      name: 'iCloud Mail',
      url: 'https://www.icloud.com/mail',
      deepLink: 'message://', // iOS Mail app (fallback to mailto)
      icon: 'apple',
    };
  }

  // ProtonMail
  if (domain === 'protonmail.com' || domain === 'proton.me' || domain === 'pm.me') {
    return {
      name: 'ProtonMail',
      url: 'https://mail.proton.me',
      icon: 'protonmail',
    };
  }

  // AOL
  if (domain === 'aol.com' || domain === 'aol.co.uk') {
    return {
      name: 'AOL Mail',
      url: 'https://mail.aol.com',
      icon: 'aol',
    };
  }

  // Zoho
  if (domain.includes('zoho.com') || domain.includes('zohomail.com')) {
    return {
      name: 'Zoho Mail',
      url: 'https://mail.zoho.com',
      icon: 'zoho',
    };
  }

  // FastMail
  if (domain === 'fastmail.com' || domain.includes('fastmail.fm')) {
    return {
      name: 'FastMail',
      url: 'https://www.fastmail.com',
      icon: 'fastmail',
    };
  }

  // Mail.com
  if (domain.includes('mail.com')) {
    return {
      name: 'Mail.com',
      url: 'https://www.mail.com',
      icon: 'mail',
    };
  }

  // Generic - try to open mailto or return null
  return null;
}

/**
 * Opens the email provider inbox (not composer) in a new window/tab (web) or app (mobile)
 * On web: opens Gmail/Outlook in browser
 * On mobile: opens the email app inbox using deep links
 */
export async function openEmailProvider(email: string): Promise<void> {
  const provider = getEmailProviderUrl(email);
  
  if (Platform.OS === 'web') {
    // Web: always open provider URL in browser (Gmail, Outlook, etc.)
    if (provider && typeof window !== 'undefined') {
      try {
        window.open(provider.url, '_blank', 'noopener,noreferrer');
        return;
      } catch (error) {
        console.error('Error opening provider URL:', error);
      }
    }
    
    // Fallback: try common email providers (Gmail or Outlook)
    if (typeof window !== 'undefined') {
      try {
        // Try Gmail first as it's most common
        window.open('https://mail.google.com', '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Error opening Gmail fallback:', error);
      }
    }
    return;
  }

  // Mobile: use deep links to open email app inbox (not composer)
  if (provider?.deepLink) {
    try {
      const canOpen = await Linking.canOpenURL(provider.deepLink);
      if (canOpen) {
        // Deep links open the app inbox, not the composer
        await Linking.openURL(provider.deepLink);
        return;
      }
    } catch (error) {
      console.warn('Error opening deep link:', error);
    }
  }
  
  // For unknown providers on mobile, try common email apps
  // Try Gmail app first (most common)
  try {
    const canOpenGmail = await Linking.canOpenURL('googlegmail://');
    if (canOpenGmail) {
      await Linking.openURL('googlegmail://');
      return;
    }
  } catch (error) {
    // Continue to next option
  }
  
  // Try Outlook app
  try {
    const canOpenOutlook = await Linking.canOpenURL('ms-outlook://');
    if (canOpenOutlook) {
      await Linking.openURL('ms-outlook://');
      return;
    }
  } catch (error) {
    // Continue to next option
  }
  
  // Last resort: try iOS Mail app (opens inbox, not composer)
  if (Platform.OS === 'ios') {
    try {
      // message:// opens Mail app, but we want inbox
      // Unfortunately, iOS doesn't have a direct inbox deep link
      // So we'll try to open the Mail app
      const canOpenMail = await Linking.canOpenURL('message://');
      if (canOpenMail) {
        await Linking.openURL('message://');
        return;
      }
    } catch (error) {
      console.error('Error opening iOS Mail app:', error);
    }
  }
  
  // If nothing works, log a warning (don't open mailto: as it opens composer)
  console.warn('Could not open email app. Please open your email app manually.');
}

