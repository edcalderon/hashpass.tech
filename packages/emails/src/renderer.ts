import fs from 'fs';
import path from 'path';
import type { EmailLocale, EmailTemplate, TemplateVars } from './types';

const SUPPORTED_LOCALES: EmailLocale[] = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
const DEFAULT_LOCALE: EmailLocale = 'en';

// Metro server bundles replace __dirname with the API route entry dir, not this file's dir.
// Walk a set of candidates and use the first that contains a known template file.
function resolveTemplatesDir(): string {
  const probe = ['newsletter-welcome', 'en.html'];
  const candidates = [
    path.resolve(__dirname, '..', 'templates'),                                  // native Node.js (correct)
    path.resolve(__dirname, '..', '..', 'packages', 'emails', 'templates'),      // __dirname = apps/mobile-app/
    path.resolve(__dirname, '..', '..', '..', 'packages', 'emails', 'templates'), // __dirname = apps/mobile-app/app/
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'emails', 'templates'), // __dirname = apps/mobile-app/app/api/
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, ...probe))) return dir;
    } catch { /* noop */ }
  }
  return candidates[0];
}

const TEMPLATES_DIR = resolveTemplatesDir();

export function renderTemplate(
  template: EmailTemplate,
  locale: string,
  vars: TemplateVars = {}
): string {
  const safeLocale: EmailLocale = SUPPORTED_LOCALES.includes(locale as EmailLocale)
    ? (locale as EmailLocale)
    : DEFAULT_LOCALE;

  const templatePath = path.join(TEMPLATES_DIR, template, `${safeLocale}.html`);
  let html = fs.readFileSync(templatePath, 'utf-8');

  const resolved: Required<TemplateVars> = {
    year: String(new Date().getFullYear()),
    appUrl: 'https://hashpass.tech',
    supportEmail: 'support@hashpass.tech',
    userName: '',
    ...vars,
  };

  for (const [key, value] of Object.entries(resolved)) {
    html = html.split(`{{${key.toUpperCase()}}}`).join(value ?? '');
  }

  return html;
}
