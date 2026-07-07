import type { EmailLocale, EmailTemplate } from './types';

const SUBJECTS: Record<EmailTemplate, Record<EmailLocale, string>> = {
  'newsletter-welcome': {
    en: '🎉 Welcome to the HashPass Newsletter!',
    es: '🎉 ¡Bienvenido al boletín de HashPass!',
    ko: '🎉 HashPass 뉴스레터에 오신 것을 환영합니다!',
    fr: '🎉 Bienvenue dans la newsletter HashPass !',
    pt: '🎉 Bem-vindo à newsletter da HashPass!',
    de: '🎉 Willkommen beim HashPass Newsletter!',
  },
  'app-welcome': {
    en: '🔐 Welcome to HashPass!',
    es: '🔐 ¡Bienvenido a HashPass!',
    ko: '🔐 HashPass에 오신 것을 환영합니다!',
    fr: '🔐 Bienvenue sur HashPass !',
    pt: '🔐 Bem-vindo ao HashPass!',
    de: '🔐 Willkommen bei HashPass!',
  },
};

export function getSubject(template: EmailTemplate, locale: string): string {
  const map = SUBJECTS[template];
  return map[(locale as EmailLocale)] ?? map['en'];
}
