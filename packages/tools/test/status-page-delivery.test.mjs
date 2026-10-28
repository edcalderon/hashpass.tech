import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const caddy = await readFile(new URL('../../../ops/self-hosted/caddy/Caddyfile', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../../.github/workflows/status-page-publish.yml', import.meta.url), 'utf8');

test('Caddy authenticates the status document and its module while proxying protected metrics', () => {
  const metrics = caddy.indexOf('@statusMetrics path /status/metrics');
  const asset = caddy.indexOf('@statusAsset path /status/status-page.js /status/status-version.json');
  const page = caddy.indexOf('@status path /status /status/');
  const fallback = caddy.lastIndexOf('handle {');
  assert.ok(metrics >= 0 && asset > metrics && page > asset && fallback > page);
  assert.match(caddy.slice(asset, page), /forward_auth plane-mcp-gateway:8220/);
  assert.match(caddy.slice(asset, page), /uri strip_prefix \/status/);
  assert.match(caddy.slice(metrics, asset), /reverse_proxy plane-mcp-gateway:8220/);
  assert.match(caddy, /script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'/);
  assert.doesNotMatch(caddy, /script-src[^;]*'unsafe-inline'/);
});

test('status tags publish the complete versioned artifact with protected metric credentials', () => {
  assert.match(workflow, /tags: \['status-v\*\.\*\.\*'\]/);
  assert.match(workflow, /startsWith\(github\.ref, 'refs\/tags\/status-v'\)/);
  assert.match(workflow, /MISSION_CONTROL_METRICS_TOKEN: \$\{\{ secrets\.MISSION_CONTROL_METRICS_TOKEN \}\}/);
  assert.match(workflow, /index\.html status-page\.js status-version\.json/);
  assert.match(workflow, /tar -xzf \/tmp\/hashpass-status\.tgz/);
});
