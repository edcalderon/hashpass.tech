import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const buildScript = path.join(
  repoRoot,
  'packages/infra/terraform/stacks/hashpass-lukas-site/build.py',
);

test('LUKAS static export compiles locale messages without Lingui warnings', (t) => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'lukas-i18n-test-'));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));

  const result = spawnSync('python3', [buildScript, path.join(workDir, 'site')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  assert.equal(result.status, 0, result.error?.message ?? output.slice(-4000));
  const warningCount = output.match(/Uncompiled message detected/g)?.length ?? 0;
  assert.equal(warningCount, 0, `Static export emitted ${warningCount} uncompiled-message warnings.`);
});
