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
  'auth-magic-link': {
    en: 'Your secure HASHPASS sign-in link',
    es: 'Tu enlace seguro de acceso a HASHPASS',
    ko: '안전한 HASHPASS 로그인 링크',
    fr: 'Votre lien de connexion sécurisé HASHPASS',
    pt: 'Seu link seguro de acesso à HASHPASS',
    de: 'Dein sicherer HASHPASS-Anmeldelink',
  },
  'email-signature': {
    en: 'Hashpass email signature test',
    es: 'Prueba de firma de correo de Hashpass',
    ko: 'Hashpass 이메일 서명 테스트',
    fr: 'Test de signature e-mail Hashpass',
    pt: 'Teste de assinatura de e-mail Hashpass',
    de: 'Hashpass-E-Mail-Signaturtest',
  },
};

export function getSubject(template: EmailTemplate, locale: string): string {
  const map = SUBJECTS[template];
  return map[(locale as EmailLocale)] ?? map['en'];
}
