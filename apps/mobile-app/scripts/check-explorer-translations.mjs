#!/usr/bin/env node

// Dashboard copy is shared by native and web. Keep en/es/ko structurally
// aligned so a new dashboard message cannot silently fall back to English.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(scriptDir, '..', 'i18n', 'locales');
const requiredLocales = ['en', 'es', 'ko'];
const requiredKeys = [
  'explore.global.title',
  'explore.global.subtitle',
  'explore.global.date',
  'explore.banner.exploreAllEventsDescription',
  'explore.banner.bslOnTour',
  'explore.tutorial.yourPasses',
  'explore.tutorial.quickAccess',
  'explore.banner.pastEvent',
  'explore.selectEvent',
  'explore.yourPasses',
  'explore.quickAccess',
  'explore.quick.speakers.title',
  'explore.quick.speakers.subtitle',
  'explore.quick.agenda.title',
  'explore.quick.agenda.subtitle',
  'explore.quick.networking.title',
  'explore.quick.networking.subtitle',
  'explore.quick.information.title',
  'explore.quick.information.subtitle',
];
const dashboardNamespaces = [
  'common',
  'digitalWallet',
  'explore',
  'agenda',
  'networking',
  'notifications',
  'nav',
  'passes',
  'profile',
  'settings',
  'status',
  'tabs',
  'wallet',
  'walletDesc',
];
const intentionallySharedKeys = new Set([
  'explore.banner.title',
  'explore.banner.hours',
  'explore.banner.minutes',
  'explore.quick.agenda.title',
]);

const readLocale = (locale) => JSON.parse(
  fs.readFileSync(path.join(localeDir, `${locale}.json`), 'utf8')
);

const getValue = (messages, key) => {
  const parts = key.split('.');
  const walk = (value, index) => {
    if (!value || typeof value !== 'object') return undefined;
    if (index === parts.length) return value;
    const remaining = parts.slice(index).join('.');
    if (Object.prototype.hasOwnProperty.call(value, remaining)) return value[remaining];
    return walk(value[parts[index]], index + 1);
  };
  return walk(messages, 0);
};

const collectLeaves = (value, prefix = '') => {
  if (!value || typeof value !== 'object') return value === undefined ? [] : [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, prefix ? `${prefix}.${key}` : key)
  );
};

const catalogs = Object.fromEntries(requiredLocales.map((locale) => [locale, readLocale(locale)]));
const errors = [];

for (const key of requiredKeys) {
  const english = getValue(catalogs.en, key);
  if (typeof english !== 'string' || !english.trim()) {
    errors.push(`en is missing ${key}`);
    continue;
  }

  for (const locale of requiredLocales.slice(1)) {
    const value = getValue(catalogs[locale], key);
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${locale} is missing ${key}`);
    } else if (value === english && !intentionallySharedKeys.has(key)) {
      errors.push(`${locale} still uses the English value for ${key}`);
    }
  }
}

// Keep every dashboard namespace covered, not only the currently visible
// Explorer cards. Adding a source string without adding es/ko now fails CI.
for (const namespace of dashboardNamespaces) {
  for (const [key, english] of collectLeaves(catalogs.en[namespace])) {
    if (typeof english !== 'string' || !english.trim()) continue;
    const fullKey = key ? `${namespace}.${key}` : namespace;
    for (const locale of requiredLocales.slice(1)) {
      const value = getValue(catalogs[locale], fullKey);
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(`${locale} is missing ${fullKey}`);
      }
    }
  }
}

if (errors.length) {
  console.error('Dashboard translation guard failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Verified dashboard translations for ${requiredLocales.join(', ')}.`);
