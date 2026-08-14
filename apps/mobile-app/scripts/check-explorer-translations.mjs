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
  // Explorer owns the global dashboard view. Keep this explicit list
  // because these IDs are resolved at runtime through the app translation
  // hook and therefore are not guaranteed to be present in Lingui extraction.
  'explore.rework.heroSlides',
  'explore.rework.show',
  'explore.rework.heroFeatured',
  'explore.rework.heroNextUp',
  'explore.rework.heroNextTitle',
  'explore.rework.heroNextSubtitle',
  'explore.rework.heroGetPass',
  'explore.rework.heroTour',
  'explore.rework.heroTourTitle',
  'explore.rework.heroTourSubtitle',
  'explore.rework.heroExploreTour',
  'explore.rework.heroEvents',
  'explore.rework.heroEventsTitle',
  'explore.rework.heroEventsSubtitle',
  'explore.rework.heroPartners',
  'explore.rework.heroPartnersTitle',
  'explore.rework.heroPartnersSubtitle',
  'explore.rework.search',
  'explore.rework.allEvents',
  'explore.rework.showing',
  'explore.rework.eventsAcross',
  'explore.rework.sortedBy',
  'explore.rework.all',
  'explore.rework.upcoming',
  'explore.rework.past',
  'explore.rework.cities',
  'explore.rework.series',
  'explore.rework.list',
  'explore.rework.grid',
  'explore.rework.rail',
  'explore.rework.loadingMore',
  'explore.rework.allCaughtUp',
  'explore.rework.yourPasses',
  'explore.rework.closeSearch',
  'explore.rework.recent',
  'explore.rework.suggestions',
  'explore.rework.filters',
  'explore.rework.reset',
  'explore.rework.when',
  'explore.rework.fromDate',
  'explore.rework.toDate',
  'explore.rework.seriesLabel',
  'explore.rework.city',
  'explore.rework.access',
  'explore.rework.onlyPasses',
  'explore.rework.sortBy',
  'explore.rework.date',
  'explore.rework.name',
  'explore.rework.dateToBeAnnounced',
  'explore.rework.archive',
  'explore.rework.pastEvent',
  'explore.rework.onTour',
  'explore.rework.bookmark',
  'explore.rework.removeBookmark',
  'explore.rework.loadingEvents',
  'explore.rework.noEvents',
  'explore.rework.noEventsMatch',
  'explore.rework.noEventsHint',
  'explore.rework.clearAllFilters',
  'explore.rework.scrollToTop',
  'explore.rework.eventLayout',
  'explore.rework.openFilters',
  'explore.rework.openFiltersAndSorting',
  'explore.rework.searchEvents',
  'explore.rework.clearSearch',
  'explore.rework.closeFilters',
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
  'explore.rework.heroNextTitle',
  'explore.rework.series',
  'explore.rework.seriesLabel',
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

// Catch a new runtime Explorer ID even when it has not yet been added to the
// explicit contract above. Explorer uses the app translation hook, so
// Lingui extraction cannot reliably discover these calls for us.
const explorerSource = fs.readFileSync(
  path.join(scriptDir, '..', 'components', 'explorer', 'Explorer.tsx'),
  'utf8',
);
const sourceKeys = new Set(
  [...explorerSource.matchAll(/\btranslate\(\s*["'](explore\.rework\.[^"']+)["']/g)]
    .map((match) => match[1]),
);

for (const key of sourceKeys) {
  for (const locale of requiredLocales) {
    const value = getValue(catalogs[locale], key);
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${locale} is missing runtime Explorer key ${key}`);
    }
  }
}

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
