/// <reference types="jest" />

import fs from 'fs';
import path from 'path';
import de from '../../i18n/locales/de.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import fr from '../../i18n/locales/fr.json';
import ko from '../../i18n/locales/ko.json';
import pt from '../../i18n/locales/pt.json';

const docsScreenSource = fs.readFileSync(
  path.resolve(__dirname, '../../app/(shared)/docs.tsx'),
  'utf8',
);
const customRuntimeSource = fs.readFileSync(
  path.resolve(__dirname, '../../i18n/i18n.ts'),
  'utf8',
);

const catalogs = { en, es, de, fr, ko, pt } as const;

const visibleDocsKeys = [
  'title',
  'subtitle',
  'back',
  'gettingStarted.title',
  'gettingStarted.description',
  'gettingStarted.signIn.title',
  'gettingStarted.signIn.content',
  'gettingStarted.explore.title',
  'gettingStarted.explore.content',
  'gettingStarted.requestMeeting.title',
  'gettingStarted.requestMeeting.content',
  'gettingStarted.trackRequests.title',
  'gettingStarted.trackRequests.content',
  'gettingStarted.seeDemo',
  'troubleshooting.title',
  'troubleshooting.description',
  'troubleshooting.loadingIssues.title',
  'troubleshooting.loadingIssues.content',
  'troubleshooting.loadingIssues.step1',
  'troubleshooting.loadingIssues.step2',
  'troubleshooting.loginIssues.title',
  'troubleshooting.loginIssues.content',
  'troubleshooting.meetingIssues.title',
  'troubleshooting.meetingIssues.content',
  'tips.title',
  'tips.description',
  'tips.specificRequests.title',
  'tips.specificRequests.content',
  'tips.checkAvailability.title',
  'tips.checkAvailability.content',
  'tips.respondPromptly.title',
  'tips.respondPromptly.content',
  'tips.useSearch.title',
  'tips.useSearch.content',
  'installPwaGuide',
  'interactiveDocs.title',
  'interactiveDocs.description',
  'viewStorybook',
  'needHelp',
  'contactSupport',
] as const;

const getNestedValue = (source: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);

describe('DocsScreen localization', () => {
  it('defines every visible docs message in all six custom-runtime locales', () => {
    const missingOrEmpty = Object.entries(catalogs).flatMap(([locale, catalog]) =>
      visibleDocsKeys.flatMap((key) => {
        const fullKey = `index.docs.${key}`;
        const value = getNestedValue(catalog, fullKey);
        return typeof value === 'string' && value.trim() && value !== fullKey
          ? []
          : [`${locale}:${fullKey}`];
      }),
    );

    expect(missingOrEmpty).toEqual([]);
  });

  it('uses the custom index.docs runtime for every DocsScreen message', () => {
    expect(docsScreenSource).toMatch(
      /const\s+\{\s*t:\s*tDocs\s*\}\s*=\s*useTranslation\(['"]index\.docs['"]\)/,
    );
    expect(docsScreenSource).not.toMatch(/@lingui\/(?:macro|react)/);
    expect(docsScreenSource).not.toContain('useLingui');
    expect(docsScreenSource).not.toMatch(/\bt\(\s*\{\s*id:\s*['"]index\.docs\./);

    for (const key of visibleDocsKeys) {
      expect(docsScreenSource).toMatch(
        new RegExp(`tDocs\\(\\s*['"]${key.replaceAll('.', '\\.')}['"]\\s*,`),
      );
    }
  });

  it('gives every DocsScreen action a translated accessible name and role', () => {
    for (const key of [
      'back',
      'gettingStarted.seeDemo',
      'installPwaGuide',
      'viewStorybook',
      'contactSupport',
    ]) {
      expect(docsScreenSource).toMatch(
        new RegExp(
          `accessibilityLabel=\\{tDocs\\(\\s*['"]${key.replaceAll('.', '\\.')}['"]\\s*,`,
        ),
      );
    }

    expect(docsScreenSource.match(/accessibilityRole=["']button["']/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(docsScreenSource.match(/accessibilityRole=["']link["']/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(3);
  });

  it('always supplies readable fallbacks so raw index.docs keys cannot render', () => {
    expect(customRuntimeSource).toContain(
      'return translated === fullKey ? fallbackOrParams : translated;',
    );
    expect(docsScreenSource).not.toMatch(
      /tDocs\(\s*['"][^'"]+['"]\s*\)/,
    );

    const sourceWithoutNamespaceDeclaration = docsScreenSource.replace(
      /useTranslation\(['"]index\.docs['"]\)/,
      '',
    );
    expect(sourceWithoutNamespaceDeclaration).not.toContain('index.docs.');
  });
});
