export type EmailLocale = 'en' | 'es' | 'ko' | 'fr' | 'pt' | 'de';
export type EmailTemplate = 'newsletter-welcome' | 'app-welcome';

export interface TemplateVars {
  year?: string;
  appUrl?: string;
  supportEmail?: string;
  userName?: string;
  unsubscribeUrl?: string;
}
