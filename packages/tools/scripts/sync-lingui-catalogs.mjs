import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mobileRoot = path.join(root, 'apps/mobile-app');
const locales = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
const fallbackMessages = {
  'nav.account': 'Account',
  'nav.closeMenu': 'Close navigation menu',
  'nav.language': 'Language',
};

function flatten(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, id, result);
    else if (typeof child === 'string') result[id] = child;
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const english = flatten(readJson(path.join(mobileRoot, 'i18n/locales/en.json')));
const checkOnly = process.argv.includes('--check');
let stale = false;

for (const locale of locales) {
  const runtime = flatten(readJson(path.join(mobileRoot, `i18n/locales/${locale}.json`)));
  const catalogPath = path.join(mobileRoot, `i18n/catalogs/${locale}.json`);
  const catalog = readJson(catalogPath);
  const synced = Object.fromEntries(
    Object.keys(catalog).map((id) => [id, runtime[id] ?? english[id] ?? fallbackMessages[id] ?? catalog[id] ?? id])
  );
  const next = `${JSON.stringify(synced, null, 2)}\n`;
  const current = fs.readFileSync(catalogPath, 'utf8');
  if (current !== next) {
    stale = true;
    if (!checkOnly) fs.writeFileSync(catalogPath, next);
  }
}

if (stale && checkOnly) {
  console.error('Lingui catalogs are out of sync. Run: pnpm run i18n:extract');
  process.exit(1);
}

console.log(checkOnly ? 'Lingui catalogs are synchronized.' : 'Synchronized Lingui catalogs with runtime locales.');
