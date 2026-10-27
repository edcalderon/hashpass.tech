import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCompanionDeploymentOrder,
  compareVersions,
  extractEmbeddedVersion,
  extractManifestVersion,
  extractScriptUrls,
  readLiveCompanionVersion,
} from './check-companion-deployment.mjs';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function fakeFetch(routes) {
  return async (url) => routes[url] || response('', 404);
}

test('compares Companion semantic versions numerically', () => {
  assert.equal(compareVersions('0.0.6', '0.0.5'), 1);
  assert.equal(compareVersions('0.0.5', '0.0.5'), 0);
  assert.equal(compareVersions('0.0.5', '0.0.6'), -1);
});

test('reads the generated deployment manifest', () => {
  assert.equal(extractManifestVersion('{"version":"0.0.6"}'), '0.0.6');
  assert.equal(extractManifestVersion('{"currentVersion":{"version":"0.0.5"}}'), '0.0.5');
  assert.equal(extractManifestVersion('not json'), '');
});

test('finds embedded versions in legacy bundles', () => {
  assert.equal(
    extractEmbeddedVersion('const x={currentVersion:{version:"0.0.2"},versions:["0.0.1"]}'),
    '0.0.2',
  );
  assert.equal(
    extractEmbeddedVersion('const x={currentVersion:{version:`0.0.5`},react:`19.0.0`}'),
    '0.0.5',
  );
  assert.equal(extractEmbeddedVersion('const x={version:"0.0.1"}'), '0.0.1');
});

test('extracts script URLs from a page', () => {
  assert.deepEqual(
    extractScriptUrls('<script src="/assets/index.js"></script><script src="/lazy.js"></script>', 'https://example.test/'),
    ['https://example.test/assets/index.js', 'https://example.test/lazy.js'],
  );
});

test('prefers the deployment manifest over the legacy bundle', async () => {
  const site = 'https://companion.example.test/';
  const result = await readLiveCompanionVersion(site, {
    fetchImpl: fakeFetch({
      'https://companion.example.test/companion-version.json': response('{"version":"0.0.6"}'),
    }),
  });

  assert.deepEqual(result, {
    version: '0.0.6',
    source: 'https://companion.example.test/companion-version.json',
  });
});

test('reads the current version from a legacy Vite bundle', async () => {
  const site = 'https://companion.example.test/';
  const result = await readLiveCompanionVersion(site, {
    fetchImpl: fakeFetch({
      'https://companion.example.test/': response('<script type="module" src="/assets/index.js"></script>'),
      'https://companion.example.test/assets/index.js': response('const x={currentVersion:{version:"0.0.2"}}'),
    }),
  });

  assert.equal(result.version, '0.0.2');
  assert.equal(result.source, 'https://companion.example.test/assets/index.js');
});

test('rejects production ahead of source', async () => {
  const routes = {
    'https://prod.example.test/companion-version.json': response('{"version":"0.0.6"}'),
    'https://dev.example.test/companion-version.json': response('{"version":"0.0.2"}'),
  };

  await assert.rejects(
    checkCompanionDeploymentOrder({
      sourceVersion: '0.0.5',
      productionUrl: 'https://prod.example.test',
      developmentUrl: 'https://dev.example.test',
      fetchImpl: fakeFetch(routes),
    }),
    /production 0\.0\.6 is ahead of source 0\.0\.5/,
  );
});

test('rejects production ahead of development even when both are at or below source', async () => {
  const routes = {
    'https://prod.example.test/companion-version.json': response('{"version":"0.0.5"}'),
    'https://dev.example.test/companion-version.json': response('{"version":"0.0.2"}'),
  };

  await assert.rejects(
    checkCompanionDeploymentOrder({
      sourceVersion: '0.0.6',
      productionUrl: 'https://prod.example.test',
      developmentUrl: 'https://dev.example.test',
      fetchImpl: fakeFetch(routes),
    }),
    /production 0\.0\.5 is ahead of development 0\.0\.2/,
  );
});

test('can require development parity after a guarded publication', async () => {
  const routes = {
    'https://prod.example.test/companion-version.json': response('{"version":"0.0.2"}'),
    'https://dev.example.test/companion-version.json': response('{"version":"0.0.2"}'),
  };

  await assert.rejects(
    checkCompanionDeploymentOrder({
      sourceVersion: '0.0.5',
      productionUrl: 'https://prod.example.test',
      developmentUrl: 'https://dev.example.test',
      fetchImpl: fakeFetch(routes),
      requireDevelopmentMatch: true,
    }),
    /development is 0\.0\.2, but source is 0\.0\.5/,
  );
});
