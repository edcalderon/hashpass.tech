import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const scriptPath = resolve(import.meta.dirname, 'deploy-api-lambda.sh');

function readEnvironmentSyncNodeStep() {
  const script = readFileSync(scriptPath, 'utf8');
  const marker = 'node - "${current_config_file}" "${environment_file}" "${sync_status_file}" <<\'NODE\'\n';
  const start = script.indexOf(marker);
  assert.notEqual(start, -1, 'the Lambda environment sync step must remain embedded in the deploy script');

  const bodyStart = start + marker.length;
  const bodyEnd = script.indexOf('\nNODE', bodyStart);
  assert.notEqual(bodyEnd, -1, 'the embedded Lambda environment sync step must have a closing heredoc');
  return script.slice(bodyStart, bodyEnd);
}

function runEnvironmentSync({ currentVariables, environmentVariables }) {
  const directory = mkdtempSync(join(tmpdir(), 'hashpass-lambda-env-test-'));
  const nodeStepPath = join(directory, 'sync-env-step.cjs');
  const configPath = join(directory, 'config.json');
  const environmentPath = join(directory, 'environment.json');
  const statusPath = join(directory, 'status.json');

  writeFileSync(nodeStepPath, readEnvironmentSyncNodeStep());
  writeFileSync(configPath, JSON.stringify({ Environment: { Variables: currentVariables } }));

  execFileSync(process.execPath, [nodeStepPath, configPath, environmentPath, statusPath], {
    env: {
      ...process.env,
      API_LAMBDA_ENV_UPDATE_MAX_BYTES: '3900',
      ...environmentVariables,
    },
    stdio: 'pipe',
  });

  return {
    status: JSON.parse(readFileSync(statusPath, 'utf8')),
    environment: existsSync(environmentPath)
      ? JSON.parse(readFileSync(environmentPath, 'utf8'))
      : null,
  };
}

test('writes a valid payload when the budget warning threshold is exceeded', () => {
  const targetBytes = 3651;
  const emptyPayload = JSON.stringify({ Variables: { EXPO_PUBLIC_SITE_URL: '' } });
  const siteUrl = 'x'.repeat(targetBytes - Buffer.byteLength(emptyPayload, 'utf8'));
  const expectedPayload = { Variables: { EXPO_PUBLIC_SITE_URL: siteUrl } };

  assert.equal(Buffer.byteLength(JSON.stringify(expectedPayload), 'utf8'), targetBytes);

  const result = runEnvironmentSync({
    currentVariables: { EXPO_PUBLIC_SITE_URL: 'old-value' },
    environmentVariables: { EXPO_PUBLIC_SITE_URL: siteUrl },
  });

  assert.equal(result.status.action, 'update');
  assert.deepEqual(result.environment, expectedPayload);
});

test('preserves noop status for unchanged payloads over the warning threshold', () => {
  const targetBytes = 3651;
  const emptyPayload = JSON.stringify({ Variables: { EXPO_PUBLIC_SITE_URL: '' } });
  const siteUrl = 'x'.repeat(targetBytes - Buffer.byteLength(emptyPayload, 'utf8'));

  const result = runEnvironmentSync({
    currentVariables: { EXPO_PUBLIC_SITE_URL: siteUrl },
    environmentVariables: { EXPO_PUBLIC_SITE_URL: siteUrl },
  });

  assert.equal(result.status.action, 'noop');
  assert.equal(result.environment, null);
});
