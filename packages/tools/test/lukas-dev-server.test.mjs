import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../../..');

test('dev:all keeps the Lukas landing live with rebuilds and browser refreshes', async () => {
  const devAll = await readFile(resolve(repo, 'packages/tools/scripts/dev-all.sh'), 'utf8');
  const server = await readFile(resolve(repo, 'packages/tools/scripts/dev-lukas-landing.mjs'), 'utf8');

  assert.match(devAll, /dev-lukas-landing\.mjs/);
  assert.doesNotMatch(devAll, /run_prefixed lukas python3 .*hashpass-lukas-site\/build\.py/);
  assert.match(server, /watchRoots/);
  assert.match(server, /runBuild\('initial start'\)/);
  assert.match(server, /__lukas_live_reload/);
  assert.match(server, /EventSource/);
  assert.match(server, /notifyReload/);
  assert.match(server, /openBrowser/);
  assert.match(server, /LUKAS_AUTO_OPEN_BROWSER/);
  assert.match(devAll, /--no-open-browser/);
});
