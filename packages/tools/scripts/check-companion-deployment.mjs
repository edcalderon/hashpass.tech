#!/usr/bin/env node

/**
 * Verify the ordering of the live Companion deployments.
 *
 * Production may never be newer than development or the Companion version on
 * the source ref being released. Development may be behind the source ref
 * during a staged publication, but production must never pass it.
 *
 * The preferred source is the generated /companion-version.json manifest.
 * Older manually published Companion sites do not have that file, so the
 * checker also reads the current version embedded in the Vite bundle. That
 * fallback is intentionally kept for the migration from manual publishing
 * to the guarded workflow.
 */

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DEFAULT_PRODUCTION_URL = 'https://companion.hashpass.tech';
const DEFAULT_DEVELOPMENT_URL = 'https://companion-dev.hashpass.tech';

export function normalizeVersion(value) {
  const normalized = String(value ?? '').trim().replace(/^v/, '');
  if (!VERSION_PATTERN.test(normalized)) {
    throw new Error(`Invalid Companion semantic version: ${value || '<missing>'}`);
  }
  return normalized;
}

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map(Number);
  const rightParts = normalizeVersion(right).split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function maxVersion(versions) {
  return versions.reduce((highest, candidate) => {
    if (!highest || compareVersions(candidate, highest) > 0) return candidate;
    return highest;
  }, '');
}

export function extractManifestVersion(text) {
  try {
    const body = JSON.parse(text);
    const candidate = body?.version || body?.releaseVersion || body?.currentVersion?.version;
    if (candidate) return normalizeVersion(candidate);
  } catch {
    // Not JSON; callers may be inspecting an HTML or JavaScript response.
  }

  return '';
}

export function extractScriptUrls(html, baseUrl) {
  const urls = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      urls.push(new URL(match[1], baseUrl).toString());
    } catch {
      // Ignore malformed script URLs and continue with the other assets.
    }
  }
  return [...new Set(urls)];
}

export function extractEmbeddedVersion(text) {
  const explicitCandidates = [
    ...text.matchAll(/(?:currentVersion|releaseVersion)\s*[:=]\s*["'`](\d+\.\d+\.\d+)["'`]/g),
    ...text.matchAll(/(?:currentVersion|releaseVersion)[\s\S]{0,180}?version\s*[:=]\s*["'`](\d+\.\d+\.\d+)["'`]/g),
  ].map((match) => match[1]);

  if (explicitCandidates.length > 0) return maxVersion(explicitCandidates.map(normalizeVersion));

  // The historical bundle inlines versions.json, including its release
  // history. Choosing the highest semver is safe for that generated shape
  // and lets us verify the already-published manual artifacts during
  // migration. Future builds always expose the explicit manifest first.
  const candidates = [...text.matchAll(/\b(\d+\.\d+\.\d+)\b/g)].map((match) => match[1]);
  return candidates.length > 0 ? maxVersion(candidates.map(normalizeVersion)) : '';
}

async function fetchText(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'text/html, application/json, application/javascript',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    return { response, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function readLiveCompanionVersion(
  siteUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {},
) {
  const baseUrl = new URL(siteUrl);
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/`;
  baseUrl.search = '';

  const manifestUrl = new URL('companion-version.json', baseUrl).toString();
  try {
    const { response, text } = await fetchText(manifestUrl, fetchImpl, timeoutMs);
    if (response.ok) {
      const version = extractManifestVersion(text);
      if (version) return { version, source: manifestUrl };
    }
  } catch {
    // Fall back to the legacy bundle below. A missing manifest is expected
    // until the first guarded publication reaches each existing site.
  }

  const page = await fetchText(baseUrl.toString(), fetchImpl, timeoutMs);
  if (!page.response.ok) {
    throw new Error(`${baseUrl} returned HTTP ${page.response.status}`);
  }

  const scriptUrls = extractScriptUrls(page.text, baseUrl);
  const bundleVersions = [];
  for (const scriptUrl of scriptUrls) {
    try {
      const { response, text } = await fetchText(scriptUrl, fetchImpl, timeoutMs);
      if (response.ok) {
        const version = extractEmbeddedVersion(text);
        if (version) bundleVersions.push({ version, source: scriptUrl });
      }
    } catch {
      // One failed lazy or unrelated script must not hide the main bundle.
    }
  }

  if (bundleVersions.length === 0) {
    throw new Error(`Unable to find a Companion version manifest or embedded version at ${baseUrl}`);
  }

  return bundleVersions.sort((left, right) => compareVersions(right.version, left.version))[0];
}

export async function checkCompanionDeploymentOrder({
  sourceVersion,
  productionUrl = DEFAULT_PRODUCTION_URL,
  developmentUrl = DEFAULT_DEVELOPMENT_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  requireDevelopmentMatch = false,
} = {}) {
  const expected = normalizeVersion(sourceVersion);
  const production = await readLiveCompanionVersion(productionUrl, { fetchImpl, timeoutMs });
  const development = await readLiveCompanionVersion(developmentUrl, { fetchImpl, timeoutMs });

  if (compareVersions(production.version, expected) > 0) {
    throw new Error(
      `Companion production ${production.version} is ahead of source ${expected}. ` +
        `Refusing to release an older source; reconcile production with develop first ` +
        `(read from ${production.source}).`,
    );
  }

  if (compareVersions(development.version, expected) > 0) {
    throw new Error(
      `Companion development ${development.version} is ahead of source ${expected}. ` +
        `Refusing to validate this source (read from ${development.source}).`,
    );
  }

  if (compareVersions(production.version, development.version) > 0) {
    throw new Error(
      `Companion production ${production.version} is ahead of development ${development.version}. ` +
        'Refusing to validate a release with production ahead of staging; publish and verify development first ' +
        `(read production from ${production.source}, development from ${development.source}).`,
    );
  }

  if (requireDevelopmentMatch && compareVersions(development.version, expected) !== 0) {
    throw new Error(
      `Companion development is ${development.version}, but source is ${expected}. ` +
        `Publish the exact develop artifact before marking the development deployment green.`,
    );
  }

  if (compareVersions(development.version, expected) < 0) {
    console.warn(
      `Companion development is stale: live ${development.version}, source ${expected}. ` +
        'Republish the exact develop artifact before the next Companion release.',
    );
  }

  return { expected, production, development };
}

function readOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log([
      'Usage: node packages/tools/scripts/check-companion-deployment.mjs --source-version <version> [options]',
      '',
      `  --production-url <url>  default: ${DEFAULT_PRODUCTION_URL}`,
      `  --development-url <url> default: ${DEFAULT_DEVELOPMENT_URL}`,
      '  --require-development-match  require staging to equal the source version',
    ].join('\n'));
    return;
  }

  const result = await checkCompanionDeploymentOrder({
    sourceVersion: readOption(argv, '--source-version', process.env.COMPANION_SOURCE_VERSION),
    productionUrl: readOption(argv, '--production-url', process.env.COMPANION_PRODUCTION_URL || DEFAULT_PRODUCTION_URL),
    developmentUrl: readOption(argv, '--development-url', process.env.COMPANION_DEVELOPMENT_URL || DEFAULT_DEVELOPMENT_URL),
    requireDevelopmentMatch: argv.includes('--require-development-match'),
  });

  console.log(`Companion deployment order verified: source ${result.expected}`);
  console.log(`  production: ${result.production.version} (${result.production.source})`);
  console.log(`  development: ${result.development.version} (${result.development.source})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Companion deployment check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
