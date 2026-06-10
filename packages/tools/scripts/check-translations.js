#!/usr/bin/env node

/**
 * Translation Checker Script
 * Checks all locale files for missing notification translations
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../i18n/locales');
const localeFiles = ['en.json', 'es.json', 'ko.json', 'fr.json', 'pt.json', 'de.json'];

// Get all keys from a nested object
function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Check translations
const results = {};

localeFiles.forEach(localeFile => {
  const filePath = path.join(localesDir, localeFile);
  const locale = localeFile.replace('.json', '');
  
  if (!fs.existsSync(filePath)) {
    results[locale] = { error: 'File not found' };
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Check if notifications section exists
    if (!data.notifications) {
      results[locale] = { 
        status: 'MISSING',
        missing: ['notifications (entire section)'],
        keys: []
      };
      return;
    }
    
    // Get all notification keys
    const notificationKeys = getAllKeys(data.notifications, 'notifications');
    results[locale] = {
      status: 'OK',
      keys: notificationKeys,
      count: notificationKeys.length
    };
  } catch (error) {
    results[locale] = { error: error.message };
  }
});

// Compare with English (reference)
const enKeys = results.en?.keys || [];
const missingByLocale = {};

localeFiles.forEach(localeFile => {
  const locale = localeFile.replace('.json', '');
  if (locale === 'en' || results[locale]?.error) return;
  
  const localeKeys = results[locale]?.keys || [];
  const missing = enKeys.filter(key => !localeKeys.includes(key));
  
  if (missing.length > 0) {
    missingByLocale[locale] = missing;
  }
});

// Print report
console.log('\n📊 Translation Check Report\n');
console.log('='.repeat(60));

localeFiles.forEach(localeFile => {
  const locale = localeFile.replace('.json', '');
  const result = results[locale];
  
  console.log(`\n${locale.toUpperCase()}:`);
  if (result.error) {
    console.log(`  ❌ Error: ${result.error}`);
  } else if (result.status === 'MISSING') {
    console.log(`  ⚠️  MISSING: ${result.missing.join(', ')}`);
  } else {
    console.log(`  ✅ OK - ${result.count} translation keys`);
  }
});

if (Object.keys(missingByLocale).length > 0) {
  console.log('\n\n⚠️  MISSING TRANSLATIONS:\n');
  console.log('='.repeat(60));
  Object.entries(missingByLocale).forEach(([locale, missing]) => {
    console.log(`\n${locale.toUpperCase()} - Missing ${missing.length} keys:`);
    missing.forEach(key => {
      console.log(`  - ${key}`);
    });
  });
} else {
  console.log('\n\n✅ All translations are complete!');
}

console.log('\n' + '='.repeat(60) + '\n');

