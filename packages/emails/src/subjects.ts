import type { EmailLocale, EmailTemplate } from './types';

const SUBJECTS: Record<EmailTemplate, Record<EmailLocale, string>> = {
  'newsletter-welcome': {
    en: '🎉 Welcome to the HASHPASS Newsletter!',
    es: '🎉 ¡Bienvenido al boletín de HASHPASS!',
    ko: '🎉 HASHPASS 뉴스레터에 오신 것을 환영합니다!',
    fr: '🎉 Bienvenue dans la newsletter HASHPASS !',
    pt: '🎉 Bem-vindo à newsletter da HASHPASS!',
    de: '🎉 Willkommen beim HASHPASS Newsletter!',
  },
  'app-welcome': {
    en: '🔐 Welcome to HASHPASS!',
    es: '🔐 ¡Bienvenido a HASHPASS!',
    ko: '🔐 HASHPASS에 오신 것을 환영합니다!',
    fr: '🔐 Bienvenue sur HASHPASS !',
    pt: '🔐 Bem-vindo ao HASHPASS!',
    de: '🔐 Willkommen bei HASHPASS!',
  },
};

export function getSubject(template: EmailTemplate, locale: string): string {
  const map = SUBJECTS[template];
  return map[(locale as EmailLocale)] ?? map['en'];
}
