export type EmailLocale = 'en' | 'es' | 'ko' | 'fr' | 'pt' | 'de';
export type EmailTemplate =
  | 'newsletter-welcome'
  | 'app-welcome'
  | 'auth-magic-link'
  | 'email-signature';

export interface TemplateVars {
  year?: string;
  appUrl?: string;
  supportEmail?: string;
  userName?: string;
  userInitial?: string;
  logoUrl?: string;
  unsubscribeUrl?: string;
}
